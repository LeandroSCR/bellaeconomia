// ══════════════════════════════════════════════════════════════════════════
// CAMADA COMPARTILHADA — tipos de templates de anúncio
// Usada pelas DUAS engines (forwarder padroniza repasses; creator cria do zero).
// Módulo puro: sem I/O de WhatsApp, sem importar código de engine.
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
