// ══════════════════════════════════════════════════════════════════════════
// CURADORIA — aprovação manual de cupons detectados pelo forwarder
//
// Cupons não têm item fixo, então NÃO são enviados automaticamente: o
// forwarder troca os links por afiliados e deposita aqui. O usuário edita,
// aprova (envia aos grupos destino) ou rejeita pelo portal.
//
// Usa apenas infraestrutura compartilhada — não importa nada das engines.
// ══════════════════════════════════════════════════════════════════════════

import fs from 'fs';
import { MessageMedia } from 'whatsapp-web.js';
import { getClient, isClientReady } from '../whatsapp/client';
import { config } from '../config';
import {
  getCurationItemById, updateCurationStatus, markSent, getPendingCurationOlderThan,
} from '../database';
import { recordActivity } from '../metrics';

export interface CurationPublishResult {
  ok: boolean;
  sentTo: string[];
  errors: string[];
}

/** Aprova um item pendente: envia aos grupos destino e marca como aprovado. */
export async function approveCurationItem(id: string): Promise<CurationPublishResult> {
  const item = await getCurationItemById(id);
  if (!item) return { ok: false, sentTo: [], errors: ['Item não encontrado'] };
  if (item.status !== 'pending') {
    return { ok: false, sentTo: [], errors: [`Item já foi ${item.status === 'approved' ? 'aprovado' : 'rejeitado'}`] };
  }

  if (!isClientReady()) return { ok: false, sentTo: [], errors: ['WhatsApp não conectado'] };
  if (config.WHATSAPP_GROUP_IDS.length === 0) {
    return { ok: false, sentTo: [], errors: ['Nenhum grupo destino configurado'] };
  }

  let media: InstanceType<typeof MessageMedia> | null = null;
  if (item.imagePath) {
    try {
      media = MessageMedia.fromFilePath(item.imagePath);
    } catch { /* segue sem imagem */ }
  }

  const client = getClient();
  const sentTo: string[] = [];
  const errors: string[] = [];

  for (const groupId of config.WHATSAPP_GROUP_IDS) {
    try {
      const chat = await client.getChatById(groupId);
      if (media) {
        await chat.sendMessage(media, { caption: item.processedText });
      } else {
        await chat.sendMessage(item.processedText);
      }
      await markSent(item.id, groupId, 'curation');
      sentTo.push(groupId);
      await sleep(1500);
    } catch (err) {
      errors.push(`${groupId}: ${(err as Error).message}`);
    }
  }

  if (sentTo.length > 0) {
    await updateCurationStatus(id, 'approved');
    recordActivity({
      type: 'sent',
      message: `[CURADORIA] cupom aprovado: ${item.processedText.split('\n')[0]?.slice(0, 50)}`,
      source: item.source,
      group: item.groupName,
    });
    // Apaga mídia local após envio
    if (item.imagePath) {
      try { await fs.promises.unlink(item.imagePath); } catch {}
    }
  }

  return { ok: sentTo.length > 0, sentTo, errors };
}

/** Rejeita um item pendente e apaga a mídia local. */
export async function rejectCurationItem(id: string): Promise<boolean> {
  const item = await getCurationItemById(id);
  if (!item || item.status !== 'pending') return false;
  await updateCurationStatus(id, 'rejected');
  if (item.imagePath) {
    try { await fs.promises.unlink(item.imagePath); } catch {}
  }
  recordActivity({
    type: 'discarded',
    message: `[CURADORIA] cupom rejeitado: ${item.processedText.split('\n')[0]?.slice(0, 50)}`,
    source: item.source,
    group: item.groupName,
  });
  return true;
}

/** Rejeita automaticamente itens pendentes há mais de N horas sem decisão.
 *  Rodado pelo scheduler a cada 30min. Retorna quantos foram expirados. */
export async function expireOldCurationItems(hours = 24): Promise<number> {
  const expired = await getPendingCurationOlderThan(hours);
  for (const item of expired) {
    await updateCurationStatus(item.id, 'rejected');
    if (item.imagePath) {
      try { await fs.promises.unlink(item.imagePath); } catch {}
    }
    recordActivity({
      type: 'discarded',
      message: `[CURADORIA] expirado (${hours}h sem decisão): ${item.processedText.split('\n')[0]?.slice(0, 50)}`,
      source: item.source,
      group: item.groupName,
    });
  }
  if (expired.length > 0) {
    console.log(`[CURADORIA] ${expired.length} item(ns) expirado(s) após ${hours}h sem decisão`);
  }
  return expired.length;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
