// ══════════════════════════════════════════════════════════════════════════
// SAÚDE DAS ENGINES — agregador read-only
//
// Lê o estado das duas engines SEM modificar nenhuma delas:
//   • forwarder (repasse) — via client/metrics/queue já exportados
//   • creator (criação)   — via getCreatorHealth() da própria engine
//
// Consumido pelo endpoint GET /api/engines/health e exibido no Dashboard.
// ══════════════════════════════════════════════════════════════════════════

import { isClientReady } from '../whatsapp/client';
import { getMetrics } from '../metrics';
import { getQueueSize } from '../scheduler/queue';
import { isBotEnabled } from '../botState';
import { getSettings } from '../settings';
import { countSentToday } from '../database';
import { config } from '../config';
import { isSpecialDay } from '../calendar/specialDates';
import { getCreatorHealth } from './creator';

// Erro só degrada a engine se aconteceu nos últimos 30 minutos —
// um erro isolado de manhã não pode deixar o card "Degradada" o dia todo.
const RECENT_ERROR_WINDOW_MS = 30 * 60_000;

export type EngineStatus = 'ok' | 'degraded' | 'down';

export interface EngineHealth {
  id: 'forwarder' | 'creator';
  name: string;
  status: EngineStatus;
  details: Record<string, string | number | boolean | null>;
}

export async function getEnginesHealth(): Promise<EngineHealth[]> {
  // ── Forwarder (repasse de mensagens — engine validada) ────────────────────
  const metrics = getMetrics();
  const whatsappOnline = isClientReady();
  const botEnabled = isBotEnabled();

  // Limite diário: o portal manda; data especial só aumenta (mesma regra do sender)
  const settings = getSettings();
  const cap = isSpecialDay()
    ? Math.max(settings.maxDailyAds, config.SPECIAL_DAY_MSG_CAP)
    : settings.maxDailyAds;
  const sentToday = await countSentToday();
  const limitReached = sentToday >= cap;

  const hasRecentError =
    metrics.lastErrorAt !== null && Date.now() - metrics.lastErrorAt < RECENT_ERROR_WINDOW_MS;

  let forwarderStatus: EngineStatus = 'ok';
  if (!whatsappOnline) forwarderStatus = 'down';
  else if (!botEnabled || hasRecentError || limitReached) forwarderStatus = 'degraded';

  const lastSent = metrics.recentActivity.find(a => a.type === 'sent');

  const forwarder: EngineHealth = {
    id: 'forwarder',
    name: 'Repasse de Mensagens',
    status: forwarderStatus,
    details: {
      whatsappOnline,
      botEnabled,
      enviadosHoje: `${sentToday}/${cap}`,
      limiteAtingido: limitReached,
      errosRecentes: hasRecentError,
      filaPendente: getQueueSize(),
      ultimoEnvio: lastSent?.ts ?? null,
    },
  };

  // ── Creator (criação de anúncios do zero) ─────────────────────────────────
  const creatorHealth = await getCreatorHealth();
  const creator: EngineHealth = {
    id: 'creator',
    name: 'Criador de Anúncios',
    status: creatorHealth.status,
    details: {
      templates: creatorHealth.templatesCount,
      anunciosHoje: creatorHealth.adsSentToday,
      ultimoAnuncio: creatorHealth.lastAdAt,
      ultimoErro: creatorHealth.lastError,
    },
  };

  return [forwarder, creator];
}
