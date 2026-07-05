// ══════════════════════════════════════════════════════════════════════════
// ENGINE CREATOR — publicador de anúncios criados do zero
//
// Usa APENAS infraestrutura compartilhada (client, config, database, metrics).
// NÃO importa nada de sourceMonitor/sender/forwarder/scheduler — a engine de
// repasse continua funcionando mesmo se esta engine quebrar, e vice-versa.
// ══════════════════════════════════════════════════════════════════════════

import { MessageMedia } from 'whatsapp-web.js';
import { getClient, isClientReady } from '../../whatsapp/client';
import { config } from '../../config';
import { markSent } from '../../database';
import { recordActivity } from '../../metrics';
import { renderTemplate, validateAdInput } from './renderer';
import { templateStore } from './templateStore';
import { createHash } from 'crypto';
import type { AdInput, CreatorHealth } from './types';

// ── Estado de saúde da engine (em memória) ──────────────────────────────────

let adsSentToday = 0;
let adsSentDay = new Date().toDateString();
let lastAdAt: number | null = null;
let lastError: string | null = null;

function bumpAdCounter(): void {
  const today = new Date().toDateString();
  if (today !== adsSentDay) { adsSentDay = today; adsSentToday = 0; }
  adsSentToday++;
  lastAdAt = Date.now();
}

export async function getCreatorHealth(): Promise<CreatorHealth> {
  let templatesCount = 0;
  let status: CreatorHealth['status'] = 'ok';
  try {
    templatesCount = (await templateStore.list()).length;
  } catch (err) {
    status = 'down';
    lastError = (err as Error).message;
  }
  if (status === 'ok' && lastError) status = 'degraded';
  const today = new Date().toDateString();
  return {
    status,
    templatesCount,
    adsSentToday: today === adsSentDay ? adsSentToday : 0,
    lastAdAt,
    lastError,
  };
}

export function clearCreatorError(): void {
  lastError = null;
}

// ── Preview (não envia nada) ────────────────────────────────────────────────

export async function previewAd(input: AdInput, templateId?: string): Promise<string> {
  const template = templateId
    ? await templateStore.get(templateId)
    : await templateStore.getDefault();
  if (!template) throw new Error('Template não encontrado');
  return renderTemplate(template.content, input);
}

// ── Publicação ──────────────────────────────────────────────────────────────

export interface PublishResult {
  ok: boolean;
  message: string;
  sentTo: string[];
  errors: string[];
}

export async function publishAd(input: AdInput, templateId?: string): Promise<PublishResult> {
  const validationErrors = validateAdInput(input);
  if (validationErrors.length > 0) {
    return { ok: false, message: '', sentTo: [], errors: validationErrors };
  }

  if (!isClientReady()) {
    return { ok: false, message: '', sentTo: [], errors: ['WhatsApp não conectado'] };
  }
  if (config.WHATSAPP_GROUP_IDS.length === 0) {
    return { ok: false, message: '', sentTo: [], errors: ['Nenhum grupo destino configurado'] };
  }

  const message = await previewAd(input, templateId);
  const adId = `creator_${createHash('md5').update(message).digest('hex').slice(0, 16)}`;

  let media: InstanceType<typeof MessageMedia> | null = null;
  if (input.imagem) {
    try {
      media = await MessageMedia.fromUrl(input.imagem, { unsafeMime: true });
    } catch { /* segue sem imagem */ }
  }

  const client = getClient();
  const sentTo: string[] = [];
  const errors: string[] = [];

  for (const groupId of config.WHATSAPP_GROUP_IDS) {
    try {
      const chat = await client.getChatById(groupId);
      if (media) {
        await chat.sendMessage(media, { caption: message });
      } else {
        await chat.sendMessage(message);
      }
      await markSent(adId, groupId, 'creator_ad');
      sentTo.push(groupId);
      await sleep(1500);
    } catch (err) {
      const msg = (err as Error).message;
      errors.push(`${groupId}: ${msg}`);
      lastError = msg;
      recordActivity({ type: 'error', message: `[CREATOR] falha ao enviar: ${msg}`, source: 'creator' });
    }
  }

  if (sentTo.length > 0) {
    bumpAdCounter();
    recordActivity({ type: 'sent', message: `[CREATOR] ${input.titulo.slice(0, 60)}`, source: 'creator' });
  }

  return { ok: sentTo.length > 0, message, sentTo, errors };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
