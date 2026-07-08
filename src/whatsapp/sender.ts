import { getClient, isClientReady } from './client';
import { MessageMedia } from 'whatsapp-web.js';
import { config } from '../config';
import fs from 'fs';
import { markSent, countSentToday, wasRecentlySent, saveCurationItem } from '../database';
import { formatDeal } from './formatter';
import { replaceAffiliateLinks } from './forwarder';
import { isSpecialDay } from '../calendar/specialDates';
import { isStoreEnabled, isTypeEnabled, getSettings } from '../settings';
import { standardizeForward } from '../shared/standardizer';
import { shouldCurateAsCoupon } from '../shared/couponGate';
import { indicatesSingleProduct } from '../shared/urlPolicy';
import { fetchProductInfo } from '../shared/productPage';
import { recordActivity } from '../metrics';
import type { Deal } from '../deals/types';

export async function sendDealToGroups(deal: Deal): Promise<boolean> {
  if (!isClientReady()) {
    console.log('[SENDER] WhatsApp ainda nao conectado, pulando envio');
    return false;
  }

  if (config.WHATSAPP_GROUP_IDS.length === 0) {
    console.log('Nenhum grupo configurado em WHATSAPP_GROUP_IDS, pulando envio');
    return false;
  }

  const today = await countSentToday();
  // O portal manda no limite diário; data especial só pode AUMENTAR o teto
  const cap = isSpecialDay()
    ? Math.max(getSettings().maxDailyAds, config.SPECIAL_DAY_MSG_CAP)
    : getSettings().maxDailyAds;

  if (today >= cap) {
    console.log(`Cap diario atingido (${today}/${cap}), pulando`);
    return false;
  }

  if (await wasRecentlySent(deal.id)) {
    recordActivity({ type: 'discarded', message: `Duplicata: ${deal.title.slice(0, 60)}`, source: deal.source });
    return false;
  }

  // Filtros do portal (exceto para deals da fila de WhatsApp — já foram filtrados no sourceMonitor)
  if (deal.source !== 'whatsapp') {
    if (!isStoreEnabled(deal.source)) {
      console.log(`[SENDER] loja "${deal.source}" desativada no portal — pulando`);
      recordActivity({ type: 'filtered', message: `Loja ${deal.source} desativada`, source: deal.source });
      return false;
    }
    const dealText = formatDeal(deal);
    if (!isTypeEnabled(dealText)) {
      console.log(`[SENDER] tipo "produto" desativado no portal — pulando`);
      recordActivity({ type: 'filtered', message: `Tipo "produto" desativado`, source: deal.source });
      return false;
    }
  }

  if (isQuietHour()) {
    console.log('Horario de silencio, pulando envio');
    return false;
  }

  // ── Deals de grupo fonte (rawText) ─────────────────────────────────────────
  // Rede de segurança: cupom OU link sem produto único (página de campanha)
  // NUNCA sai automático — desvia para curadoria. Produto único é padronizado.
  if (deal.rawText && deal.source === 'whatsapp') {
    const isCoupon = shouldCurateAsCoupon(deal.rawText);
    const processed = await replaceAffiliateLinks(deal.rawText);

    if (processed === null) {
      console.log('[SENDER] sem link afiliado válido — deal descartada');
      recordActivity({ type: 'discarded', message: `Sem link afiliado: ${deal.title.slice(0, 60)}`, source: deal.source });
      await markSent(deal.id, 'discarded', 'no_affiliate');
      return false;
    }

    if (isCoupon || !indicatesSingleProduct(processed)) {
      await saveCurationItem({
        id: deal.id,
        originalText: deal.rawText,
        processedText: processed,
        source: deal.store,
        imagePath: deal.imageUrl?.startsWith('local:') ? deal.imageUrl.slice(6) : undefined,
      });
      recordActivity({ type: 'filtered', message: `Curadoria (fila): ${deal.title.slice(0, 50)}`, source: deal.store });
      console.log(`[SENDER] deal desviada para curadoria (${isCoupon ? 'cupom' : 'sem produto único'})`);
      await markSent(deal.id, 'curation', 'to_curation');
      return false;
    }

    const message = getSettings().standardizeForwards
      ? await standardizeForward(deal.rawText, processed, deal.store)
      : processed;

    // FOTO: a oficial do anúncio no site tem prioridade sobre a thumbnail de
    // preview salva com a deal (fetchProductInfo é cacheado)
    const productLink = processed.match(/https?:\/\/[^\s]+/)?.[0];
    if (productLink) {
      const info = await fetchProductInfo(productLink);
      if (info.imageUrl) {
        // Apaga a mídia local antiga antes de trocar pela URL do site
        if (deal.imageUrl?.startsWith('local:')) {
          try { fs.unlinkSync(deal.imageUrl.slice(6)); } catch {}
        }
        deal.imageUrl = info.imageUrl;
      }
    }
    return deliverMessage(deal, message);
  }

  // ── Deals estruturados de API (Shopee, Amazon, ML, agregadores) ────────────
  const baseMessage = formatDeal(deal);
  let message: string;
  if (deal.source === 'shopee') {
    // Shopee já tem link afiliado — não reprocessar
    message = baseMessage;
  } else {
    // NUNCA envia com link cru: sem link afiliado válido, a deal é descartada
    const processed = await replaceAffiliateLinks(baseMessage);
    if (processed === null) {
      console.log('[SENDER] sem link afiliado válido — deal descartada');
      recordActivity({ type: 'discarded', message: `Sem link afiliado: ${deal.title.slice(0, 60)}`, source: deal.source });
      await markSent(deal.id, 'discarded', 'no_affiliate');
      return false;
    }
    message = processed;
  }

  return deliverMessage(deal, message);
}

// Entrega a mensagem (com mídia, se houver) a todos os grupos destino.
async function deliverMessage(deal: Deal, message: string): Promise<boolean> {
  const client = getClient();

  // Carrega mídia: local (salva do grupo fonte durante delay) ou URL remota (APIs)
  let media: InstanceType<typeof MessageMedia> | null = null;
  if (deal.imageUrl?.startsWith('local:')) {
    const filePath = deal.imageUrl.slice(6);
    try {
      media = MessageMedia.fromFilePath(filePath);
    } catch { /* segue sem imagem */ }
  } else if (deal.imageUrl) {
    try {
      media = await MessageMedia.fromUrl(deal.imageUrl, { unsafeMime: true });
    } catch { /* segue sem imagem */ }
  }

  let sent = false;

  for (const groupId of config.WHATSAPP_GROUP_IDS) {
    try {
      const chat = await client.getChatById(groupId);
      if (media) {
        await chat.sendMessage(media, { caption: message });
      } else {
        await chat.sendMessage(message);
      }
      await markSent(deal.id, groupId);
      sent = true;
      recordActivity({ type: 'sent', message: deal.title.slice(0, 60), source: deal.source });
      console.log(`Enviado para ${groupId}: ${deal.title.slice(0, 60)}`);
      await sleep(2000);
    } catch (err) {
      console.error(`Erro ao enviar para ${groupId}:`, (err as Error).message);
    }
  }

  // Apaga arquivo de mídia temporário após envio
  if (deal.imageUrl?.startsWith('local:')) {
    try { fs.unlinkSync(deal.imageUrl.slice(6)); } catch {}
  }

  return sent;
}

function isQuietHour(): boolean {
  const now = new Date();
  const current = now.getHours() + now.getMinutes() / 60;
  const { quietHourStart: start, quietHourEnd: end } = getSettings();
  if (start === end) return false;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
