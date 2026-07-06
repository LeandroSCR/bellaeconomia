// ══════════════════════════════════════════════════════════════════════════
// CAMADA COMPARTILHADA — porteiro de cupons
//
// Decide se uma mensagem deve passar por CURADORIA MANUAL em vez de envio
// automático. Vai para curadoria quando:
//   • é um anúncio de cupom (sem item fixo), OU
//   • carrega um código de cupom explícito (ex: "Cupom: 7DO7") — mesmo sendo
//     anúncio de produto, o usuário quer revisar antes de publicar.
// Produto com apenas o emoji 🏷 e sem código continua automático.
// ══════════════════════════════════════════════════════════════════════════

import { isCouponAnnouncement } from '../settings';
import { extractCouponCode } from './adExtractor';

export function shouldCurateAsCoupon(text: string): boolean {
  return isCouponAnnouncement(text) || extractCouponCode(text) !== undefined;
}
