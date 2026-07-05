// ══════════════════════════════════════════════════════════════════════════
// ENGINE CREATOR — tipos
// AdTemplate/AdInput vivem na camada compartilhada (src/shared/templates)
// porque o forwarder também os usa para padronizar repasses.
// ══════════════════════════════════════════════════════════════════════════

export type { AdTemplate, AdInput } from '../../shared/templates/types';

export interface CreatorHealth {
  status: 'ok' | 'degraded' | 'down';
  templatesCount: number;
  adsSentToday: number;
  lastAdAt: number | null;
  lastError: string | null;
}
