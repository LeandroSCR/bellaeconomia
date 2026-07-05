import cron from 'node-cron';
import { config } from '../config';
import { fetchPelandoDeals } from '../deals/providers/pelando';
import { fetchPromobitDeals } from '../deals/providers/promobit';
import { fetchAmazonDeals } from '../deals/providers/amazon';
import { fetchMercadoLivreDeals } from '../deals/providers/mercadolivre';
import { fetchShopeeSuggestions } from '../deals/providers/shopee';
import { saveShopeeSuggestions } from '../database';
import { enqueue, flushQueue } from './queue';

async function fetchAll(): Promise<void> {
  console.log('Buscando novas promocoes...');
  const [pelando, promobit, amazon, ml] = await Promise.all([
    fetchPelandoDeals(20),
    fetchPromobitDeals(20),
    fetchAmazonDeals('oferta', 5),
    fetchMercadoLivreDeals(10),
  ]);
  await enqueue([...pelando, ...promobit, ...amazon, ...ml]);
}

async function fetchShopeeSuggestionsJob(): Promise<void> {
  console.log('[SHOPEE] Buscando sugestões diárias para aprovação...');
  const items = await fetchShopeeSuggestions(50);
  if (items.length === 0) {
    console.log('[SHOPEE] Nenhuma sugestão encontrada com comissão >= 10%');
    return;
  }
  await saveShopeeSuggestions(items);
  console.log(`[SHOPEE] ${items.length} sugestões salvas para aprovação no portal`);
}

export { fetchShopeeSuggestionsJob };

export function startScheduler(): void {
  const fetchCron = intervalToCron(config.FETCH_INTERVAL_MIN);

  cron.schedule(fetchCron, fetchAll);
  // flushQueue roda a cada minuto; quem controla o intervalo real entre envios é
  // o canSendNow() que verifica delayMinutes configurado no portal.
  cron.schedule('* * * * *', flushQueue);
  // Sugestões Shopee: busca diária às 8h
  cron.schedule('0 8 * * *', fetchShopeeSuggestionsJob);

  console.log(`Scheduler ativo: fetch a cada ${config.FETCH_INTERVAL_MIN}min, envio verificado a cada 1min`);

  // Fetch inicial após 10s para o WhatsApp ter tempo de conectar
  setTimeout(fetchAll, 10_000);
}

function intervalToCron(minutes: number): string {
  if (minutes < 60) return `*/${minutes} * * * *`;
  const hours = Math.floor(minutes / 60);
  return `0 */${hours} * * *`;
}
