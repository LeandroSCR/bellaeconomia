// ══════════════════════════════════════════════════════════════════════════
// TESTES — extrator de dados de mensagens de promoção (padronização)
// Casos baseados em mensagens reais dos grupos fonte.
// ══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  extractAdInput, extractTitle, extractPrices, extractCouponCode, parsePrice,
  normalizeStylized, isCampaignHeader,
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

  it('pula cabeçalho de campanha estilizado (caso real Coifa Suggar)', () => {
    const text = '𝙊𝙛𝙚𝙧𝙩𝙖 𝙋𝙧𝙞𝙢𝙚 𝘿𝙖𝙮\n\nSuggar Coifa De Parede Coral 90Cm Inox Tp0692Ix \n\n🔥 R$906 em até 12x s/juros\n🏷️ Cupom: VIRAPRIME ou PRIMEIRO7DO7 - resgate no anúncio\n\n🛒Compre aqui\n220V: https://link.amazon/B08EFlJE5';
    expect(extractTitle(text)).toBe('Suggar Coifa De Parede Coral 90Cm Inox Tp0692Ix');
  });

  it('cabeçalho estilizado fora da lista de palavras perde para linha com specs (caso Tablet Lenovo)', () => {
    const text = '𝙐𝙡𝙩𝙞𝙢𝙤 𝙙𝙞𝙖 - 𝙋𝙧𝙞𝙢𝙚 𝘿𝙖𝙮\n\nTablet Lenovo Idea Tab Plus 8/128GB, 12.1" 2.5k 90hz com Caneta E Capa\n\n🔥 R$ 1.606 no PIX\n🏷️ Resgate os cupons do anúncio\n\n🛒Compre aqui: https://link.amazon/B0ixZTRyb';
    expect(extractTitle(text)).toBe('Tablet Lenovo Idea Tab Plus 8/128GB, 12.1" 2.5k 90hz com Caneta E Capa');
  });

  it('linha "Compre aqui" com URL no meio não vira título', () => {
    const text = 'Cabo USB-C 2m Baseus\n🛒Compre aqui: https://meli.la/x';
    expect(extractTitle(text)).toBe('Cabo USB-C 2m Baseus');
  });

  it('mensagem toda estilizada ainda extrai título (fallback)', () => {
    const text = '𝙏𝙚𝙘𝙡𝙖𝙙𝙤 𝙈𝙚𝙘𝙖𝙣𝙞𝙘𝙤 𝙍𝙚𝙙𝙧𝙖𝙜𝙤𝙣\nR$ 199\nhttps://amzn.to/x';
    expect(extractTitle(text)).toBe('Teclado Mecanico Redragon');
  });

  it('pula cabeçalhos de campanha variados', () => {
    expect(extractTitle('🔥ESQUENTA BLACK FRIDAY🔥\nNotebook Lenovo IdeaPad 15\nR$ 2.199')).toBe('Notebook Lenovo IdeaPad 15');
    expect(extractTitle('OFERTA RELÂMPAGO!!!\nAir Fryer Mondial 4L\nhttps://a.b/x')).toBe('Air Fryer Mondial 4L');
    expect(extractTitle('Achadinhos do dia 🛍️\nCadeira Gamer ThunderX3\nR$ 899')).toBe('Cadeira Gamer ThunderX3');
  });
});

describe('normalizeStylized / isCampaignHeader', () => {
  it('converte Mathematical Alphanumeric Symbols para ASCII', () => {
    expect(normalizeStylized('𝙊𝙛𝙚𝙧𝙩𝙖 𝙋𝙧𝙞𝙢𝙚 𝘿𝙖𝙮')).toBe('Oferta Prime Day');
  });

  it('identifica cabeçalhos de campanha', () => {
    expect(isCampaignHeader('𝙊𝙛𝙚𝙧𝙩𝙖 𝙋𝙧𝙞𝙢𝙚 𝘿𝙖𝙮')).toBe(true);
    expect(isCampaignHeader('🔥 SUPER OFERTA IMPERDÍVEL 🔥')).toBe(true);
    expect(isCampaignHeader('Black Friday Antecipada')).toBe(true);
  });

  it('NÃO marca título de produto como cabeçalho', () => {
    expect(isCampaignHeader('Suggar Coifa De Parede Coral 90Cm Inox Tp0692Ix')).toBe(false);
    expect(isCampaignHeader('Echo Dot 5ª geração Alexa')).toBe(false);
    expect(isCampaignHeader('Super Nintendo Mini Clássico')).toBe(false);
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

describe('preço R$ 0 é copiado exatamente (caso Dog Chow)', () => {
  it('parsePrice aceita zero', () => {
    expect(parsePrice('R$ 0')).toBe(0);
    expect(parsePrice('R$ 0,00')).toBe(0);
  });

  it('extractPrices propaga o zero', () => {
    expect(extractPrices('💵 R$ 0')).toEqual({ preco: 0 });
  });

  it('extractAdInput carrega preco 0 até o template', () => {
    const input = extractAdInput(
      'Pack Dog Chow Ração Úmida\n💵 R$ 0\nhttps://amzn.to/orig',
      'Pack Dog Chow Ração Úmida\n💵 R$ 0\nhttps://amzn.to/meulink',
      'amazon'
    );
    expect(input!.preco).toBe(0);
  });
});
