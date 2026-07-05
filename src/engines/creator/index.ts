// ══════════════════════════════════════════════════════════════════════════
// ENGINE CREATOR — API pública
// Tudo que outros módulos podem usar desta engine sai por aqui.
// Templates/renderer vivem em src/shared/templates (usados também pelo
// forwarder para padronizar repasses) e são re-exportados por conveniência.
// ══════════════════════════════════════════════════════════════════════════

export { templateStore, createTemplateStore } from '../../shared/templates/store';
export { renderTemplate, validateAdInput, SUPPORTED_PLACEHOLDERS } from '../../shared/templates/renderer';
export { publishAd, previewAd, getCreatorHealth, clearCreatorError } from './publisher';
export type { AdTemplate, AdInput, CreatorHealth } from './types';
