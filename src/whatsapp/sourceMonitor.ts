import { Message } from 'whatsapp-web.js';
import { config } from '../config';
import { getClient, isClientReady } from './client';
import { wasRecentlySent, markSent, countSentToday, saveCurationItem } from '../database';
import { isSpecialDay } from '../calendar/specialDates';
import { replaceAffiliateLinks } from './forwarder';
import { canSendNow, markSentNow, enqueue } from '../scheduler/queue';
import { isStoreEnabled, isTypeEnabled, isCouponAnnouncement, detectSourceFromText, getSettings } from '../settings';
import { standardizeForward } from '../shared/standardizer';
import { recordActivity } from '../metrics';
import { isBotEnabled } from '../botState';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

const MEDIA_DIR = path.join(process.cwd(), 'data', 'media');

async function saveMediaToDisk(dealId: string, media: { data: string; mimetype: string }): Promise<string> {
  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
    'image/webp': 'webp', 'video/mp4': 'mp4',
  };
  const ext = extMap[media.mimetype] ?? 'bin';
  await fs.promises.mkdir(MEDIA_DIR, { recursive: true });
  const filePath = path.join(MEDIA_DIR, `${dealId}.${ext}`);
  await fs.promises.writeFile(filePath, Buffer.from(media.data, 'base64'));
  return `local:${filePath}`;
}

function extractTitle(body: string): string {
  const line = body.split('\n').find(l => l.trim().replace(/[\p{Emoji}\s*_~`]/gu, '').length > 3) ?? body;
  return line.replace(/[*_~`]/g, '').trim().slice(0, 60);
}

// Timestamp de quando o bot foi iniciado — mensagens anteriores são ignoradas para evitar spam
const BOT_START_TS = Math.floor(Date.now() / 1000);

// Regex para detectar URLs em mensagens
const URL_REGEX = /https?:\/\/[^\s]+/g;

// Params de tracking que não identificam o produto — removidos antes do hash de URL
const TRACKING_PARAMS = [
  'sid', 'wid', 'matt_tool', 'matt_word', 'ua', 'origin', 'action',
  'pdp_filters', 'attributes', 'ref_', 'tag', 'linkCode', 'ascsubtag',
  'utm_source', 'utm_medium', 'utm_campaign', 'smtt', 'smid', 'sp_atk',
];

// Short link domains — cada share gera uma URL única, URL dedup não se aplica
const SHORT_LINK_HOSTS = ['amzn.to', 'link.amazon', 's.shopee.com.br', 'shope.ee', 'meli.la', 'mercadol.com.br', 'bit.ly', 'tinyurl.com'];

// Patterns que identificam uma URL de produto específico (com ID do produto no path)
const PRODUCT_URL_PATTERNS = [
  /\/dp\/[A-Z0-9]{10}/,           // Amazon: /dp/B0XXXXXXXX
  /\/gp\/product\/[A-Z0-9]{10}/,  // Amazon: /gp/product/B0...
  /-i\.\d+\.\d+/,                 // Shopee: produto-i.shopId.itemId
  /\/product\/\d+\/\d+/,          // Shopee: /product/shopId/itemId
  /MLB-?\d{6,}/,                  // Mercado Livre: MLB123456
  /_JM[A-Z0-9]+/,                 // Mercado Livre: _JM suffix
  /\/p\/[A-Z]{3}\d+/,             // Mercado Livre: /p/MLB123
];

function normalizeProductUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    TRACKING_PARAMS.forEach(p => parsed.searchParams.delete(p));
    return parsed.origin + parsed.pathname + parsed.search;
  } catch {
    return rawUrl;
  }
}

function shouldDeduplicateByUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace('www.', '');
    // Short links nunca geram falsos positivos — pula dedup
    if (SHORT_LINK_HOSTS.some(s => host.includes(s))) return false;
    // Só deduplica se a URL aponta para um produto específico (tem ID no path)
    return PRODUCT_URL_PATTERNS.some(p => p.test(url));
  } catch {
    return false;
  }
}

function urlDealId(url: string): string {
  return `url_${createHash('md5').update(normalizeProductUrl(url)).digest('hex').slice(0, 16)}`;
}

export async function handleSourceMessage(msg: Message): Promise<void> {
  // Ignora mensagens do próprio bot
  if (msg.fromMe) return;

  // Ignora mensagens recebidas antes do bot ligar (evita spam de backlog ao reconectar)
  if (msg.timestamp && msg.timestamp < BOT_START_TS) return;

  // Bot pausado pelo portal
  if (!isBotEnabled()) return;

  // Guarda de seguranca: nao processa se o cliente nao estiver pronto
  if (!isClientReady()) return;

  const chat = await msg.getChat();
  const groupId = chat.id._serialized;

  // Só processa se for de um grupo fonte configurado
  if (!config.SOURCE_GROUP_IDS.includes(groupId)) return;

  const body = msg.body?.trim();
  if (!body || body.startsWith('!')) return;

  // Precisa ter URL ou texto com preço para ser uma promoção
  const urls = body.match(URL_REGEX) ?? [];
  const hasPrice = /R\$\s*[\d.,]+/i.test(body);
  const hasDiscount = /%\s*off|desconto|oferta|promo[çc]/i.test(body);

  if (urls.length === 0 && !hasPrice && !hasDiscount) return;

  // Gera ID único baseado no conteúdo COMPLETO da mensagem (evita colisões de cabeçalho)
  const dealId = `wa_${createHash('md5').update(body).digest('hex').slice(0, 16)}`;

  const title = extractTitle(body);
  const source = detectSourceFromText(body);
  const group = chat.name;

  // Dedup por texto exato — janela de 6h (evita reenvio pós-restart sem bloquear promoções do dia seguinte)
  if (await wasRecentlySent(dealId, 6)) {
    console.log(`[SOURCE] mensagem ja enviada recentemente, pulando`);
    recordActivity({ type: 'discarded', message: `Duplicata: ${title}`, source, group });
    return;
  }

  // Dedup por URL de produto específico — só para URLs com ID de produto identificável
  // Short links e páginas genéricas são ignorados (não geram falsos positivos)
  const productUrls = urls.filter(shouldDeduplicateByUrl);
  const urlIds = productUrls.map(urlDealId);
  let urlDuplicada: string | undefined;
  for (const uid of urlIds) {
    if (await wasRecentlySent(uid, 12)) { urlDuplicada = uid; break; }
  }
  if (urlDuplicada) {
    console.log(`[SOURCE] produto ja enviado hoje por outro grupo fonte, pulando`);
    recordActivity({ type: 'discarded', message: `URL duplicada: ${title}`, source, group });
    return;
  }

  // Taxa de envio por grupo (0–100%)
  const { groupRates } = getSettings();
  const rate = groupRates[groupId] ?? 100;
  if (rate === 0 || (rate < 100 && Math.random() * 100 >= rate)) {
    recordActivity({ type: 'filtered', message: `Taxa ${rate}%: ${title}`, source, group });
    return;
  }

  // Verifica cap diário
  const sentToday = await countSentToday();
  const hardCap = isSpecialDay() ? config.SPECIAL_DAY_MSG_CAP : config.DAILY_MSG_CAP;
  const cap = Math.min(hardCap, getSettings().maxDailyAds);
  if (sentToday >= cap) {
    console.log(`[SOURCE] cap diario atingido (${sentToday}/${cap}), pulando`);
    recordActivity({ type: 'discarded', message: `Limite diário atingido (${sentToday}/${cap}): ${title}`, source, group });
    return;
  }

  // Verifica horário de silêncio
  if (isQuietHour()) {
    console.log('[SOURCE] horario de silencio, pulando');
    recordActivity({ type: 'discarded', message: `Horário de silêncio: ${title}`, source, group });
    return;
  }

  // Filtro de loja (portal)
  if (!isStoreEnabled(source)) {
    console.log(`[SOURCE] loja "${source}" desativada no portal — pulando`);
    recordActivity({ type: 'filtered', message: `Loja ${source} desativada`, source, group });
    return;
  }

  // Filtro de tipo (produto/cupom)
  if (!isTypeEnabled(body)) {
    const tipo = /cupom|🏷/i.test(body) ? 'cupom' : 'produto';
    console.log(`[SOURCE] tipo "${tipo}" desativado no portal — pulando`);
    recordActivity({ type: 'filtered', message: `Tipo "${tipo}" desativado`, source, group });
    return;
  }

  // CUPONS não têm item fixo → vão para a fila de curadoria (aprovação manual
  // no portal) com os links já trocados por afiliados. Nunca são enviados direto.
  if (isCouponAnnouncement(body)) {
    const processed = await replaceAffiliateLinks(body);
    if (processed === null) {
      console.log('[SOURCE] cupom descartado: sem link afiliado');
      recordActivity({ type: 'discarded', message: `Cupom sem link afiliado: ${title}`, source, group });
      return;
    }
    let imagePath: string | undefined;
    if (msg.hasMedia) {
      try {
        const mediaObj = await msg.downloadMedia();
        if (mediaObj) imagePath = (await saveMediaToDisk(dealId, mediaObj)).slice(6); // remove prefixo "local:"
      } catch { /* segue sem imagem */ }
    }
    const isNew = await saveCurationItem({
      id: dealId,
      originalText: body,
      processedText: processed,
      source,
      groupName: group,
      imagePath,
    });
    if (isNew) {
      console.log(`[SOURCE] cupom detectado em "${group}" → fila de curadoria`);
      recordActivity({ type: 'filtered', message: `Cupom na curadoria: ${title}`, source, group });
    }
    return;
  }

  if (!canSendNow()) {
    const firstUrl = body.match(/https?:\/\/[^\s]+/)?.[0] ?? '';
    let imageUrl: string | undefined;
    if (msg.hasMedia) {
      try {
        const mediaObj = await msg.downloadMedia();
        if (mediaObj) imageUrl = await saveMediaToDisk(dealId, mediaObj);
      } catch { /* segue sem imagem */ }
    }
    await enqueue([{
      id: dealId,
      title,
      price: 0,
      url: firstUrl,
      store: source,
      source: 'whatsapp',
      rawText: body,
      imageUrl,
      createdAt: new Date(),
    }]);
    recordActivity({ type: 'filtered', message: `Na fila (delay): ${title}`, source, group });
    return;
  }

  console.log(`[SOURCE] promoção detectada em "${chat.name}", repassando...`);

  // Substitui links por nossos links de afiliado antes de enviar.
  // null = mensagem deve ser descartada (ex: link ML com múltiplos produtos)
  const processedText = await replaceAffiliateLinks(body);
  if (processedText === null) {
    console.log('[SOURCE] promoção descartada: link ML não resolveu para produto único');
    recordActivity({ type: 'discarded', message: `ML: produto não identificado — ${title}`, source, group });
    return;
  }

  // Padroniza produtos com o template padrão do canal (fallback: texto processado)
  const textToSend = getSettings().standardizeForwards
    ? await standardizeForward(body, processedText, source)
    : processedText;

  const client = getClient();

  // Baixa a mídia original (se houver) para reenviar com os links já substituídos.
  // Nunca usamos forward — ele repassaria os links originais de quem postou.
  let media: Awaited<ReturnType<typeof msg.downloadMedia>> | null = null;
  if (msg.hasMedia) {
    try {
      media = await msg.downloadMedia();
    } catch {
      // segue sem imagem se o download falhar
    }
  }

  for (const destGroupId of config.WHATSAPP_GROUP_IDS) {
    try {
      const destChat = await client.getChatById(destGroupId);

      if (media) {
        await destChat.sendMessage(media, { caption: textToSend });
      } else {
        await destChat.sendMessage(textToSend);
      }

      await markSent(dealId, destGroupId, 'source_forward');
      markSentNow();
      recordActivity({ type: 'sent', message: title, source, group });
      console.log(`[SOURCE] repassado para ${destGroupId}`);

      // Pequena pausa entre grupos
      await sleep(1500);
    } catch (err) {
      console.error(`[SOURCE] erro ao repassar para ${destGroupId}:`, (err as Error).message);
    }
  }

  // Registra URLs do produto para bloquear duplicatas de outros grupos fonte no dia
  for (const uid of urlIds) {
    await markSent(uid, 'url-dedup', 'url_dedup');
  }
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
