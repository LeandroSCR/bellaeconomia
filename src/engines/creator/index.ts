// ══════════════════════════════════════════════════════════════════════════
// ENGINE CREATOR — API pública
// Tudo que outros módulos podem usar desta engine sai por aqui.
// ══════════════════════════════════════════════════════════════════════════

export { templateStore, createTemplateStore } from './templateStore';
export { renderTemplate, validateAdInput, SUPPORTED_PLACEHOLDERS } from './renderer';
export { publishAd, previewAd, getCreatorHealth, clearCreatorError } from './publisher';
export type { AdTemplate, AdInput, CreatorHealth } from './types';
