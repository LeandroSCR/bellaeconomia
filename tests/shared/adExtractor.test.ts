// ══════════════════════════════════════════════════════════════════════════
// TESTES — extrator de dados de mensagens de promoção (padronização)
// Casos baseados em mensagens reais dos grupos fonte.
// ══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  extractAdInput, extractTitle, extractPrices, extractCouponCode, parsePrice,
} from '../../src/shared/adExtractor';

describe('parsePrice', () => {
  it('converte formatos brasileiros', () => {
    expect(parsePrice('R$ 1.299,90')).toBe(1299.9);
    expect(parsePrice('R$ 23,44')).toBe(23.44);
    expect(parsePrice('R$ 360')).toBe(360);
    expect(parsePrice('R$360,99')).toBe(360.99);
  });

  it('retorna undefined sem preço', () => {
    expect(parsePrice('sem preço aqui')).toBeUndefined();
  });
});

describe('extractTitle', () => {
  it('pega a primeira linha de conteúdo, limpando markdown e emoji', () => {
    const text = '*Tênis Adidas Originals Superstar II*\n\nPOR: R$ 360,99 🔥\nhttps://x.y';
    expect(extractTitle(text)).toBe('Tênis Adidas Originals Superstar II');
  });

  it('pula linhas de URL, preço e cupom', () => {
    const text = 'https://amzn.to/abc\nR$ 99,90\nCupom: XYZ\nEcho Dot 5ª geração';
    expect(extractTitle(text)).toBe('Echo Dot 5ª geração');
  });

  it('retorna undefined quando não há linha de título', () => {
    expect(extractTitle('R$ 10,00\nhttps://a.b')).toBeUndefined();
  });
});

describe('extractPrices', () => {
  it('extrai "De X por Y"', () => {
    expect(extractPrices('De R$ 399,00 por R$ 279,00')).toEqual({ preco: 279, precoOriginal: 399 });
  });

  it('extrai "De ~X~ Por → Y" (formato com riscado)', () => {
    const r = extractPrices('De ~R$ 199,90~ Por → *R$ 99,90*');
    expect(r.preco).toBe(99.9);
    expect(r.precoOriginal).toBe(199.9);
  });

  it('extrai "POR: R$ Y"', () => {
    expect(extractPrices('Tênis legal\n\nPOR: R$ 360,99 🔥')).toEqual({ preco: 360.99 });
  });

  it('extrai preço avulso', () => {
    expect(extractPrices('*🔥 R$ 23,44*')).toEqual({ preco: 23.44 });
  });

  it('retorna vazio sem preços', () => {
    expect(extractPrices('promoção imperdível')).toEqual({});
  });
});

describe('extractCouponCode', () => {
  it('extrai "Cupom: CODE"', () => {
    expect(extractCouponCode('🏷️ Cupom: PRIMEIRA10')).toBe('PRIMEIRA10');
  });

  it('extrai "use o cupom CODE"', () => {
    expect(extractCouponCode('use o cupom BELLA20 no checkout')).toBe('BELLA20');
  });

  it('não captura palavras comuns', () => {
    expect(extractCouponCode('cupom de desconto na loja')).toBeUndefined();
  });

  it('retorna undefined sem cupom', () => {
    expect(extractCouponCode('Echo Dot por R$ 279')).toBeUndefined();
  });
});

describe('extractAdInput', () => {
  const original = '*Echo Dot 5ª geração Alexa*\n\nDe R$ 399,00 por R$ 279,00\n\nhttps://amzn.to/original';
  const processed = '*Echo Dot 5ª geração Alexa*\n\nDe R$ 399,00 por R$ 279,00\n\nhttps://amzn.to/meulink';

  it('extrai input completo com link do texto PROCESSADO (afiliado)', () => {
    const input = extractAdInput(original, processed, 'amazon');
    expect(input).not.toBeNull();
    expect(input!.titulo).toBe('Echo Dot 5ª geração Alexa');
    expect(input!.link).toBe('https://amzn.to/meulink');
    expect(input!.preco).toBe(279);
    expect(input!.precoOriginal).toBe(399);
    expect(input!.loja).toBe('Amazon');
  });

  it('retorna null sem título (fallback do chamador)', () => {
    expect(extractAdInput('R$ 10,00', 'R$ 10,00 https://a.b/x', 'amazon')).toBeNull();
  });

  it('retorna null sem link no texto processado', () => {
    expect(extractAdInput('Produto Bom\nR$ 10', 'Produto Bom\nR$ 10', 'amazon')).toBeNull();
  });

  it('loja desconhecida fica undefined (linha some no template)', () => {
    const input = extractAdInput('Produto X\nR$ 5', 'Produto X\nR$ 5\nhttps://a.b/x', 'outro');
    expect(input!.loja).toBeUndefined();
  });
});
