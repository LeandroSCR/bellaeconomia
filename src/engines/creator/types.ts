// ══════════════════════════════════════════════════════════════════════════
// ENGINE CREATOR — tipos
// Esta engine é ISOLADA da engine de repasse (forwarder).
// Nunca importe arquivos de src/whatsapp/sourceMonitor, sender, forwarder ou
// src/scheduler aqui. Ver CLAUDE.md → "Arquitetura de Engines".
// ══════════════════════════════════════════════════════════════════════════

export interface AdTemplate {
  id: string;
  name: string;
  /** Corpo do template com placeholders: {titulo} {preco} {preco_original}
   *  {desconto} {cupom} {loja} {link} */
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface AdInput {
  titulo: string;
  link: string;
  preco?: number;
  precoOriginal?: number;
  cupom?: string;
  loja?: string;
  /** URL de imagem para enviar como mídia (opcional) */
  imagem?: string;
}

export interface CreatorHealth {
  status: 'ok' | 'degraded' | 'down';
  templatesCount: number;
  adsSentToday: number;
  lastAdAt: number | null;
  lastError: string | null;
}
