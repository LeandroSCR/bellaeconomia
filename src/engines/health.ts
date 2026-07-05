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
import { getCreatorHealth } from './creator';

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

  let forwarderStatus: EngineStatus = 'ok';
  if (!whatsappOnline) forwarderStatus = 'down';
  else if (metrics.errorsToday > 0 || !botEnabled) forwarderStatus = 'degraded';

  const lastSent = metrics.recentActivity.find(a => a.type === 'sent');

  const forwarder: EngineHealth = {
    id: 'forwarder',
    name: 'Repasse de Mensagens',
    status: forwarderStatus,
    details: {
      whatsappOnline,
      botEnabled,
      errosHoje: metrics.errorsToday,
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
