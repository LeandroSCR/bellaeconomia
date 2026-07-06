// ══════════════════════════════════════════════════════════════════════════
// TESTES — porteiro de cupons (o que vai para curadoria vs envio automático)
//
// REGRA (usuário, 06/07/2026): cupom APENAS quando (1) não indica produto
// único OU (2) tem frase explícita "Cupom ML/mercado livre/Shopee/amazon"
// (e variações plural/do/da). Produto específico com código de cupom no
// corpo é PRODUTO — envio automático.
// ══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { shouldCurateAsCoupon } from '../../src/shared/couponGate';

describe('shouldCurateAsCoupon — vai para CURADORIA', () => {
  it('frase explícita de cupom de loja (regra 2), mesmo com link de produto', () => {
    expect(shouldCurateAsCoupon('🔥 Cupom Amazon: use APPAMAZON https://amzn.to/x')).toBe(true);
    expect(shouldCurateAsCoupon('Cupons do Mercado Livre válidos hoje! código: ML50')).toBe(true);
    expect(shouldCurateAsCoupon('Cupom da Shopee: FRETE10')).toBe(true);
    expect(shouldCurateAsCoupon('Cupom ML de 20% off — código MELI20')).toBe(true);
  });

  it('cupom sem página de produto único (regra 1)', () => {
    expect(shouldCurateAsCoupon('Use o cupom TUDO10 — 10% off em toda a loja!')).toBe(true);
    expect(shouldCurateAsCoupon('Cupom: PRIMEIRA15 para primeira compra no app')).toBe(true);
  });
});

describe('shouldCurateAsCoupon — segue AUTOMÁTICO como produto', () => {
  it('produto específico com código de cupom no corpo (caso GTA VI)', () => {
    const text = '(Pré Venda) Jogo Grand Theft Auto Gta Vi 6, PS5\n💰 R$ 376,00\n🏷️ Cupom: 7DO7\nhttps://amzn.to/x';
    expect(shouldCurateAsCoupon(text)).toBe(false);
  });

  it('produto com "com o cupom CODE" e link de produto (caso Prime Day)', () => {
    const text = '𝙊𝙛𝙚𝙧𝙩𝙖 Prime Day\nR$328 à vista com o cupom APPAMAZON\nhttps://amzn.to/abc';
    expect(shouldCurateAsCoupon(text)).toBe(false);
  });

  it('produto com dois cupons e links de produto (caso Coifa Suggar)', () => {
    const text = '𝙊𝙛𝙚𝙧𝙩𝙖 𝙋𝙧𝙞𝙢𝙚 𝘿𝙖𝙮\n\nSuggar Coifa De Parede Coral 90Cm Inox Tp0692Ix\n\n🔥 R$906 em até 12x s/juros\n🏷️ Cupom: VIRAPRIME ou PRIMEIRO7DO7 - resgate no anúncio\n\n🛒Compre aqui\n220V: https://link.amazon/B08EFlJE5\n110v: https://link.amazon/B0bcTPuL6';
    expect(shouldCurateAsCoupon(text)).toBe(false);
  });

  it('produto com só o emoji 🏷 e sem código', () => {
    const text = '🏷 Echo Dot 5ª geração\nDe R$ 399 por R$ 279\nhttps://amzn.to/3abc123';
    expect(shouldCurateAsCoupon(text)).toBe(false);
  });

  it('produto comum sem cupom', () => {
    expect(shouldCurateAsCoupon('Caixa de Som PHILIPS\nR$ 199,90\nhttps://meli.la/xyz')).toBe(false);
  });
});
