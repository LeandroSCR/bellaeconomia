import { getClient, isClientReady } from './client';
import { MessageMedia } from 'whatsapp-web.js';
import { config } from '../config';
import fs from 'fs';
import { markSent, countSentToday, wasRecentlySent } from '../database';
import { formatDeal } from './formatter';
import { replaceAffiliateLinks } from './forwarder';
import { isSpecialDay } from '../calendar/specialDates';
import { isStoreEnabled, isTypeEnabled, getSettings } from '../settings';
import { standardizeForward } from '../shared/standardizer';
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
  const hardCap = isSpecialDay() ? config.SPECIAL_DAY_MSG_CAP : config.DAILY_MSG_CAP;
  const cap = Math.min(hardCap, getSettings().maxDailyAds);

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

  const client = getClient();

  // rawText: mensagens encaminhadas do WhatsApp ficam no campo rawText (texto original)
  // Para demais fontes de API, formata a deal estruturada
  const baseMessage = deal.rawText ?? formatDeal(deal);
  // Shopee já tem link afiliado — não reprocessar
  let message = deal.source === 'shopee'
    ? baseMessage
    : (await replaceAffiliateLinks(baseMessage) ?? baseMessage);

  // Produtos vindos de grupos fonte: padroniza com o template padrão do canal
  if (deal.rawText && deal.source === 'whatsapp' && getSettings().standardizeForwards) {
    message = await standardizeForward(deal.rawText, message, deal.store);
  }

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
