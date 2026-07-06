// ══════════════════════════════════════════════════════════════════════════
// CAMADA COMPARTILHADA — porteiro de cupons
//
// REGRA DE NEGÓCIO (definida pelo usuário em 06/07/2026):
// Uma publicação é CUPOM (→ curadoria manual) APENAS quando:
//   1. NÃO indica uma página de produto único (aponta para vários produtos,
//      loja inteira, ou não tem URL de produto específico), OU
//   2. traz frase explícita de cupom de loja no corpo: "Cupom ML",
//      "Cupom mercado livre", "Cupom Shopee", "Cupom amazon" e variações
//      (plural "Cupons", com "do/da/de").
//
// Anúncio que indica produto específico é PRODUTO (envio automático),
// MESMO que carregue um código de cupom tipo "Cupom: 7DO7" — o cupom é
// só um extra da oferta.
//
// Toda essa lógica já vive em isCouponAnnouncement (src/settings.ts):
// frase explícita de loja → cupom; desconto generalizado → cupom; URL de
// produto específico (inclui short links amzn.to/meli.la/shope.ee) → produto.
// ══════════════════════════════════════════════════════════════════════════

import { isCouponAnnouncement } from '../settings';

export function shouldCurateAsCoupon(text: string): boolean {
  return isCouponAnnouncement(text);
}
