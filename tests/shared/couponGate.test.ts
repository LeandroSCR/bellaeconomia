// ══════════════════════════════════════════════════════════════════════════
// TESTES — porteiro de cupons (o que vai para curadoria vs envio automático)
// Casos reais que vazaram em produção em 06/07/2026.
// ══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { shouldCurateAsCoupon } from '../../src/shared/couponGate';

describe('shouldCurateAsCoupon', () => {
  it('anúncio puro de cupom → curadoria', () => {
    expect(shouldCurateAsCoupon('🔥 Cupom Amazon: use APPAMAZON e ganhe 20% off')).toBe(true);
  });

  it('produto com código de cupom explícito → curadoria (caso GTA VI)', () => {
    const text = '(Pré Venda) Jogo Grand Theft Auto Gta Vi 6, PS5\n💰 R$ 376,00\n🏷️ Cupom: 7DO7\nhttps://amzn.to/x';
    expect(shouldCurateAsCoupon(text)).toBe(true);
  });

  it('produto com "com o cupom CODE" → curadoria (caso Prime Day THAUTEC)', () => {
    const text = '𝙊𝙛𝙚𝙧𝙩𝙖 Prime Day\nR$328 à vista com o cupom APPAMAZON\nhttps://amzn.to/abc';
    expect(shouldCurateAsCoupon(text)).toBe(true);
  });

  it('produto com só o emoji 🏷 e SEM código → envio automático', () => {
    const text = '🏷 Echo Dot 5ª geração\nDe R$ 399 por R$ 279\nhttps://amzn.to/3abc123';
    expect(shouldCurateAsCoupon(text)).toBe(false);
  });

  it('produto comum sem cupom → envio automático', () => {
    const text = 'Caixa de Som Bluetooth PHILIPS\nR$ 199,90\nhttps://meli.la/xyz';
    expect(shouldCurateAsCoupon(text)).toBe(false);
  });

  it('cupom Amazon clippable ("resgate o cupom do anúncio") → automático', () => {
    const text = 'Fone JBL — Resgate o cupom do anúncio\nDe R$ 300 por apenas R$ 199\nhttps://amzn.to/jbl';
    expect(shouldCurateAsCoupon(text)).toBe(false);
  });
});
