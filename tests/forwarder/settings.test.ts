// ══════════════════════════════════════════════════════════════════════════
// TESTES DE REGRESSÃO — Engine Forwarder: classificação cupom × produto
// Esses casos reproduzem mensagens reais que já causaram bugs em produção
// (ex.: produto da THAUTEC com link amzn.to classificado como cupom).
// ══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { isCouponAnnouncement, detectSourceFromText, isStoreEnabled } from '../../src/settings';

describe('isCouponAnnouncement', () => {
  it('cupom explícito de loja é cupom', () => {
    expect(isCouponAnnouncement('Cupom Shopee: use o código FRETE10')).toBe(true);
    expect(isCouponAnnouncement('Cupons do Mercado Livre 🏷️ código: ML50')).toBe(true);
  });

  it('desconto generalizado (toda a loja) é cupom mesmo com URL', () => {
    const text = 'Use o cupom TUDO10 — 10% off em toda a loja!\nhttps://shopee.com.br/-i.123.456';
    expect(isCouponAnnouncement(text)).toBe(true);
  });

  it('produto com short link amzn.to e emoji 🏷 NÃO é cupom (caso THAUTEC)', () => {
    const text = '🏷 Echo Dot 5ª geração\nDe R$ 399 por R$ 279\nhttps://amzn.to/3abc123';
    expect(isCouponAnnouncement(text)).toBe(false);
  });

  it('produto com meli.la NÃO é cupom', () => {
    const text = '🏷 Furadeira 12V com maleta\nR$ 189,90\nhttps://meli.la/1tiwXvz';
    expect(isCouponAnnouncement(text)).toBe(false);
  });

  it('produto com URL /dp/ da Amazon NÃO é cupom', () => {
    const text = 'Use o cupom RELAMPAGO no produto\nhttps://www.amazon.com.br/dp/B0ABCDEF12';
    expect(isCouponAnnouncement(text)).toBe(false);
  });

  it('texto sem palavra-chave de cupom NÃO é cupom', () => {
    expect(isCouponAnnouncement('Smart TV 50" por R$ 1.999 https://example.com')).toBe(false);
  });

  it('preço com contexto de produto NÃO é cupom', () => {
    const text = 'Com o cupom PRIMEIRA — Tênis por apenas R$ 89,90';
    expect(isCouponAnnouncement(text)).toBe(false);
  });
});

describe('detectSourceFromText', () => {
  it('detecta Amazon por amzn.to', () => {
    expect(detectSourceFromText('veja https://amzn.to/abc')).toBe('amazon');
  });

  it('detecta Shopee por shope.ee', () => {
    expect(detectSourceFromText('oferta https://shope.ee/xyz')).toBe('shopee');
  });

  it('detecta Mercado Livre por meli.la', () => {
    expect(detectSourceFromText('promo https://meli.la/123')).toBe('mercadolivre');
  });

  it('retorna "outro" quando não reconhece', () => {
    expect(detectSourceFromText('loja desconhecida https://foo.bar')).toBe('outro');
  });
});

describe('isStoreEnabled (whitelist de lojas afiliadas)', () => {
  it('loja desconhecida NUNCA passa (caso Kabum)', () => {
    expect(isStoreEnabled('outro')).toBe(false);
    expect(isStoreEnabled('kabum')).toBe(false);
    expect(isStoreEnabled('magalu')).toBe(false);
  });

  it('deals da fila (source whatsapp) passam — já filtrados no sourceMonitor', () => {
    expect(isStoreEnabled('whatsapp')).toBe(true);
  });
});
