import { saveDeal, getUnsentDeals } from '../database';
import { sendDealToGroups } from '../whatsapp/sender';
import { getSettings, isStoreEnabled } from '../settings';
import { isBotEnabled } from '../botState';
import type { Deal } from '../deals/types';

let lastSentAt: number | null = null;

export function canSendNow(): boolean {
  if (lastSentAt === null) return true;
  const minIntervalMs = getSettings().delayMinutes * 60_000;
  return Date.now() - lastSentAt >= minIntervalMs;
}

export function markSentNow(): void {
  lastSentAt = Date.now();
}

const queue: Deal[] = [];

export function enqueue(deals: Deal[]): void {
  let added = 0;
  for (const deal of deals) {
    const isNew = saveDeal(deal);
    if (isNew && !queue.find(d => d.id === deal.id)) {
      queue.push(deal);
      added++;
    }
  }
  if (added > 0) {
    console.log(`[QUEUE] +${added} novos deals — fila: ${queue.length}`);
  }
}

export async function flushQueue(): Promise<void> {
  if (!isBotEnabled()) return;
  if (!canSendNow()) return;

  if (queue.length === 0) {
    // Só carrega deals de lojas habilitadas no portal
    const dbDeals = getUnsentDeals(10).filter(d => isStoreEnabled(d.source));
    queue.push(...dbDeals);
  }

  // Remove da frente da fila deals de lojas que foram desabilitadas após o enqueue
  while (queue.length > 0 && !isStoreEnabled(queue[0].source)) {
    console.log(`[QUEUE] Pulando "${queue[0].source}" (desabilitada no portal)`);
    queue.shift();
  }

  const deal = queue.shift();
  if (!deal) return;

  const sent = await sendDealToGroups(deal);
  if (sent) markSentNow();
}

export function getQueueSize(): number {
  return queue.length;
}

export function removeFromQueue(id: string): void {
  const idx = queue.findIndex(d => d.id === id);
  if (idx !== -1) queue.splice(idx, 1);
}
