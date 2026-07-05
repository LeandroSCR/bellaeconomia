// ══════════════════════════════════════════════════════════════════════════
// TESTES DE REGRESSÃO — Engine Forwarder (repasse de mensagens, VALIDADA)
// Se algum destes testes quebrar, uma mudança afetou o fluxo de repasse.
// Ver CLAUDE.md → "Zona congelada".
// ══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { formatDeal, formatCoupon } from '../../src/whatsapp/formatter';
import type { Deal, Coupon } from '../../src/deals/types';

const baseDeal: Deal = {
  id: 'test_1',
  title: 'Produto Teste',
  price: 50,
  url: 'https://example.com/p/1',
  store: 'Loja X',
  source: 'promobit',
  createdAt: new Date(),
};

describe('formatDeal (default)', () => {
  it('inclui título, preço e link', () => {
    const out = formatDeal(baseDeal);
    expect(out).toContain('*Produto Teste*');
    expect(out).toContain('R$ 50.00');
    expect(out).toContain('https://example.com/p/1');
  });

  it('mostra desconto quando há preço original', () => {
    const out = formatDeal({ ...baseDeal, originalPrice: 100 });
    expect(out).toContain('De R$ 100.00 por *R$ 50.00* (-50%)');
  });

  it('prefere affiliateUrl ao url original', () => {
    const out = formatDeal({ ...baseDeal, affiliateUrl: 'https://afiliado.com/x' });
    expect(out).toContain('https://afiliado.com/x');
    expect(out).not.toContain('https://example.com/p/1');
  });

  it('inclui cupom quando presente', () => {
    const out = formatDeal({ ...baseDeal, couponCode: 'PROMO10' });
    expect(out).toContain('PROMO10');
  });
});

describe('formatDeal (shopee)', () => {
  it('usa template Shopee com emoji de fogo', () => {
    const out = formatDeal({ ...baseDeal, source: 'shopee', originalPrice: 100 });
    expect(out).toContain('🔥 *Produto Teste*');
    expect(out).toContain('50% de desconto');
  });
});

describe('formatCoupon', () => {
  it('formata cupom com código e desconto', () => {
    const coupon: Coupon = {
      id: 'c1',
      code: 'SAVE20',
      store: 'shopee',
      discount: '20% off',
      description: 'Válido em toda a loja',
      url: 'https://shopee.com.br',
      source: 'scraper',
    };
    const out = formatCoupon(coupon);
    expect(out).toContain('*CUPOM SHOPEE*');
    expect(out).toContain('SAVE20');
    expect(out).toContain('20% off');
  });
});
