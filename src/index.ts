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
  getCurationItems, getCurationItemById, updateCurationText,
  countCurationByStatus, cleanOldCurationItems,
} from './database';
import { approveCurationItem, rejectCurationItem } from './curation/publisher';
import { getMetrics } from './metrics';
import { getSettings, updateSettings } from './settings';
import { config } from './config';
import { isSpecialDay } from './calendar/specialDates';
import { isBotEnabled, setBotEnabled } from './botState';
import { fetchShopeeSuggestionsJob } from './scheduler/cron';
import { enqueue } from './scheduler/queue';
import { getEnginesHealth } from './engines/health';
import {
  templateStore, publishAd, previewAd, validateAdInput, SUPPORTED_PLACEHOLDERS,
} from './engines/creator';
import type { Deal } from './deals/types';

const app = express();
app.use(express.json());

// Serve portal estático (build React)
const PORTAL_DIST = path.join(process.cwd(), 'portal', 'dist');
app.use(express.static(PORTAL_DIST));

// ── API ────────────────────────────────────────────────────────────────────

app.get('/api/stats', async (_req, res) => {
  const [sentToday, sentTotal, sentByType] = await Promise.all([
    countSentToday(),
    countSentTotal(),
    countSentByType(),
  ]);
  const settings = getSettings();
  // O portal manda no limite diário; data especial só pode AUMENTAR o teto
  const cap = isSpecialDay()
    ? Math.max(settings.maxDailyAds, config.SPECIAL_DAY_MSG_CAP)
    : settings.maxDailyAds;
  const metrics = getMetrics();

  res.json({
    whatsappStatus: isClientReady() ? 'online' : 'offline',
    botEnabled: isBotEnabled(),
    uptimeMs: metrics.uptimeMs,
    sentToday,
    sentTotal,
    errorsToday: metrics.errorsToday,
    queueSize: getQueueSize(),
    dailyLimit: cap,
    dailyLimitReached: sentToday >= cap,
    sentByType,
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

app.get('/api/shopee/suggestions', async (_req, res) => {
  const [items, counts] = await Promise.all([
    getShopeeSuggestions(),
    countShopeeSuggestionsByStatus(),
  ]);
  res.json({ items, counts });
});

app.post('/api/shopee/suggestions/refresh', async (_req, res) => {
  try {
    await fetchShopeeSuggestionsJob();
    res.json({ counts: await countShopeeSuggestionsByStatus() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/shopee/suggestions/:id/approve', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const suggestion = await updateShopeeSuggestionStatus(id, 'approved');
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
  await enqueue([deal]);

  res.json({ ok: true });
});

app.post('/api/shopee/suggestions/:id/reject', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await updateShopeeSuggestionStatus(id, 'rejected');
  res.json({ ok: true });
});

// ── Fila de deals ──────────────────────────────────────────────────────────

app.get('/api/queue', async (_req, res) => {
  const items = await getUnsentDeals(200);
  res.json(items.map(d => ({ ...d, createdAt: d.createdAt.getTime() })));
});

app.delete('/api/queue/:id', async (req, res) => {
  const { id } = req.params;
  removeFromQueue(id);
  await markSent(id, 'system', 'cleared');
  res.json({ ok: true });
});

// ── Saúde das engines (dashboard) ──────────────────────────────────────────

app.get('/api/engines/health', async (_req, res) => {
  try {
    res.json({ engines: await getEnginesHealth() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Engine Creator: templates custom ───────────────────────────────────────

app.get('/api/creator/templates', async (_req, res) => {
  try {
    res.json({ templates: await templateStore.list(), placeholders: SUPPORTED_PLACEHOLDERS });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/creator/templates', async (req, res) => {
  const { name, content } = req.body as { name?: string; content?: string };
  if (!content?.trim()) { res.status(400).json({ error: 'content é obrigatório' }); return; }
  try {
    res.json(await templateStore.create(name ?? 'Sem nome', content));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.put('/api/creator/templates/:id', async (req, res) => {
  const { name, content } = req.body as { name?: string; content?: string };
  try {
    const updated = await templateStore.update(req.params.id, { name, content });
    if (!updated) { res.status(404).json({ error: 'Template não encontrado' }); return; }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete('/api/creator/templates/:id', async (req, res) => {
  try {
    const removed = await templateStore.remove(req.params.id);
    if (!removed) {
      res.status(400).json({ error: 'Template não encontrado ou é o único (não pode ser removido)' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Engine Creator: preview e publicação de anúncios ───────────────────────

app.post('/api/creator/preview', async (req, res) => {
  const { input, templateId } = req.body as { input: any; templateId?: string };
  const errors = validateAdInput(input ?? {});
  if (errors.length > 0) { res.status(400).json({ errors }); return; }
  try {
    res.json({ message: await previewAd(input, templateId) });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post('/api/creator/ads', async (req, res) => {
  const { input, templateId } = req.body as { input: any; templateId?: string };
  try {
    const result = await publishAd(input ?? {}, templateId);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Fila de Curadoria (cupons aguardando aprovação manual) ─────────────────

app.get('/api/curation', async (_req, res) => {
  try {
    const [items, counts] = await Promise.all([getCurationItems(), countCurationByStatus()]);
    res.json({
      items: items.map(i => ({ ...i, createdAt: i.createdAt.getTime(), hasImage: !!i.imagePath, imagePath: undefined })),
      counts,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/curation/:id/image', async (req, res) => {
  const item = await getCurationItemById(req.params.id);
  if (!item?.imagePath) { res.status(404).end(); return; }
  res.sendFile(item.imagePath, err => { if (err) res.status(404).end(); });
});

app.patch('/api/curation/:id', async (req, res) => {
  const { text } = req.body as { text?: string };
  if (!text?.trim()) { res.status(400).json({ error: 'text é obrigatório' }); return; }
  try {
    const updated = await updateCurationText(req.params.id, text.trim());
    if (!updated) { res.status(404).json({ error: 'Item não encontrado ou já decidido' }); return; }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/curation/:id/approve', async (req, res) => {
  try {
    const result = await approveCurationItem(req.params.id);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/curation/:id/reject', async (req, res) => {
  try {
    const ok = await rejectCurationItem(req.params.id);
    if (!ok) { res.status(404).json({ error: 'Item não encontrado ou já decidido' }); return; }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Grupos fonte ───────────────────────────────────────────────────────────

app.get('/api/source-groups', async (_req, res) => {
  const settings = getSettings();
  const ids = config.SOURCE_GROUP_IDS;

  const makeList = (nameMap: Map<string, string>) =>
    ids.map(id => ({
      id,
      name: nameMap.get(id) ?? id,
      rate: settings.groupRates[id] ?? 100,
    }));

  if (!isClientReady()) {
    res.json(makeList(new Map()));
    return;
  }
  try {
    const chats = await getClient().getChats();
    const nameMap = new Map<string, string>(
      chats.filter((c: any) => c.isGroup).map((c: any) => [c.id._serialized, c.name])
    );
    res.json(makeList(nameMap));
  } catch {
    res.json(makeList(new Map()));
  }
});

app.patch('/api/source-groups/:id/rate', (req, res) => {
  const id = decodeURIComponent(req.params.id);
  const { rate } = req.body as { rate: unknown };
  if (typeof rate !== 'number' || rate < 0 || rate > 100) {
    res.status(400).json({ error: 'Taxa inválida (0–100)' });
    return;
  }
  const current = getSettings();
  updateSettings({ groupRates: { ...current.groupRates, [id]: Math.round(rate) } });
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
  await cleanOldShopeeDeals();
  await cleanOldCurationItems();

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
