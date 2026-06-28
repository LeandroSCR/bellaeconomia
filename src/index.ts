import express from 'express';
import path from 'path';
import { initWhatsApp, getClient, isClientReady } from './whatsapp/client';
import { startScheduler } from './scheduler/cron';
import { getQueueSize, removeFromQueue } from './scheduler/queue';
import {
  countSentToday, countSentTotal, countSentByType,
  getShopeeSuggestions, saveShopeeSuggestions,
  updateShopeeSuggestionStatus, countShopeeSuggestionsByStatus,
  cleanOldShopeeDeals, getUnsentDeals, markSent,
} from './database';
import { getMetrics } from './metrics';
import { getSettings, updateSettings } from './settings';
import { config } from './config';
import { isSpecialDay } from './calendar/specialDates';
import { isBotEnabled, setBotEnabled } from './botState';
import { fetchShopeeSuggestionsJob } from './scheduler/cron';
import { enqueue } from './scheduler/queue';
import type { Deal } from './deals/types';

const app = express();
app.use(express.json());

// Serve portal estático (build React)
const PORTAL_DIST = path.join(process.cwd(), 'portal', 'dist');
app.use(express.static(PORTAL_DIST));

// ── API ────────────────────────────────────────────────────────────────────

app.get('/api/stats', (_req, res) => {
  const sentToday = countSentToday();
  const settings = getSettings();
  const hardCap = isSpecialDay() ? config.SPECIAL_DAY_MSG_CAP : config.DAILY_MSG_CAP;
  const cap = Math.min(hardCap, settings.maxDailyAds);
  const metrics = getMetrics();

  res.json({
    whatsappStatus: isClientReady() ? 'online' : 'offline',
    botEnabled: isBotEnabled(),
    uptimeMs: metrics.uptimeMs,
    sentToday,
    sentTotal: countSentTotal(),
    errorsToday: metrics.errorsToday,
    queueSize: getQueueSize(),
    dailyLimit: cap,
    dailyLimitReached: sentToday >= cap,
    sentByType: countSentByType(),
    sentBySource: metrics.sentBySource,
  });
});

app.get('/api/settings', (_req, res) => {
  res.json(getSettings());
});

app.patch('/api/settings', (req, res) => {
  try {
    const updated = updateSettings(req.body);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get('/api/activity', (_req, res) => {
  res.json(getMetrics().recentActivity);
});

app.post('/api/bot/start', (_req, res) => {
  setBotEnabled(true);
  console.log('[BOT] Ativado via portal');
  res.json({ botEnabled: true });
});

app.post('/api/bot/stop', (_req, res) => {
  setBotEnabled(false);
  console.log('[BOT] Pausado via portal');
  res.json({ botEnabled: false });
});

// ── Shopee Suggestions ─────────────────────────────────────────────────────

app.get('/api/shopee/suggestions', (_req, res) => {
  res.json({
    items: getShopeeSuggestions(),
    counts: countShopeeSuggestionsByStatus(),
  });
});

app.post('/api/shopee/suggestions/refresh', async (_req, res) => {
  try {
    await fetchShopeeSuggestionsJob();
    res.json({ counts: countShopeeSuggestionsByStatus() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/shopee/suggestions/:id/approve', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const suggestion = updateShopeeSuggestionStatus(id, 'approved');
  if (!suggestion) { res.status(404).json({ error: 'Não encontrado' }); return; }

  const deal: Deal = {
    id: `shopee_${suggestion.itemId}`,
    title: suggestion.title,
    price: suggestion.price,
    originalPrice: suggestion.originalPrice,
    discount: suggestion.discount,
    url: suggestion.offerLink,
    affiliateUrl: suggestion.offerLink,
    imageUrl: suggestion.imageUrl,
    store: suggestion.shopName,
    source: 'shopee',
    createdAt: new Date(),
  };
  enqueue([deal]);

  res.json({ ok: true });
});

app.post('/api/shopee/suggestions/:id/reject', (req, res) => {
  const id = parseInt(req.params.id, 10);
  updateShopeeSuggestionStatus(id, 'rejected');
  res.json({ ok: true });
});

// ── Fila de deals ──────────────────────────────────────────────────────────

app.get('/api/queue', (_req, res) => {
  const items = getUnsentDeals(200);
  res.json(items.map(d => ({ ...d, createdAt: d.createdAt.getTime() })));
});

app.delete('/api/queue/:id', (req, res) => {
  const { id } = req.params;
  removeFromQueue(id);
  markSent(id, 'system', 'cleared');
  res.json({ ok: true });
});

// Endpoints legados
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

app.get('/api/groups', async (_req, res) => {
  if (!isClientReady()) { res.status(503).json({ error: 'WhatsApp nao conectado' }); return; }
  try {
    const chats = await getClient().getChats();
    res.json(chats
      .filter((c: any) => c.isGroup)
      .map((c: any) => ({
        id: c.id._serialized,
        name: c.name,
        isSource: config.SOURCE_GROUP_IDS.includes(c.id._serialized),
        isDestino: config.WHATSAPP_GROUP_IDS.includes(c.id._serialized),
      })));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// SPA fallback — rotas do React
app.get('*', (_req, res) => {
  res.sendFile(path.join(PORTAL_DIST, 'index.html'), err => {
    if (err) res.status(200).json({ status: 'Bot ativo', docs: '/api/stats' });
  });
});

// ── Handlers de erro global ───────────────────────────────────────────────

process.on('uncaughtException', (err) => {
  const msg = (err as Error).message ?? String(err);
  if (msg.includes('EBUSY') || msg.includes('ENOENT')) {
    console.warn('[AVISO] Erro de filesystem ignorado:', msg);
    return;
  }
  console.error('[ERRO NÃO CAPTURADO]:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[PROMISE NÃO TRATADA]:', reason);
});

// ── Inicialização ─────────────────────────────────────────────────────────

async function main() {
  console.log('BellaEconomia iniciando...');
  cleanOldShopeeDeals();

  app.listen(config.PORT, () => {
    console.log(`Bot + Portal rodando em http://localhost:${config.PORT}`);
  });

  await initWhatsApp();
  startScheduler();
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
