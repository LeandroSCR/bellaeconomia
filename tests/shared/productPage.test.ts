// ══════════════════════════════════════════════════════════════════════════
// TESTES — título real do produto vindo da página (limpeza e parsing de HTML)
// A busca em si não roda em teste (guard VITEST) — testamos as funções puras.
// ══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { cleanSiteTitle, extractTitleFromHtml, extractPriceFromHtml, extractImageFromHtml } from '../../src/shared/productPage';

describe('cleanSiteTitle', () => {
  it('remove sufixos da Amazon', () => {
    expect(cleanSiteTitle('Tablet Lenovo Idea Tab Plus 8/128GB | Amazon.com.br'))
      .toBe('Tablet Lenovo Idea Tab Plus 8/128GB');
    expect(cleanSiteTitle('Echo Dot 5ª geração : Amazon.com.br: Eletrônicos'))
      .toBe('Echo Dot 5ª geração');
    expect(cleanSiteTitle('Amazon.com.br: Suggar Coifa De Parede Coral 90Cm'))
      .toBe('Suggar Coifa De Parede Coral 90Cm');
  });

  it('remove sufixos do Mercado Livre e Shopee', () => {
    expect(cleanSiteTitle('Furadeira Parafusadeira 12v Com Maleta | MercadoLivre 📦'))
      .toBe('Furadeira Parafusadeira 12v Com Maleta');
    expect(cleanSiteTitle('Teclado Mecânico Gamer RGB | Shopee Brasil'))
      .toBe('Teclado Mecânico Gamer RGB');
  });

  it('decodifica entidades HTML', () => {
    expect(cleanSiteTitle('Kit 2 Cabos USB-C 2m &amp; Carregador 20W | Amazon.com.br'))
      .toBe('Kit 2 Cabos USB-C 2m & Carregador 20W');
  });

  it('rejeita páginas de bloqueio/captcha', () => {
    expect(cleanSiteTitle('Robot Check')).toBeNull();
    expect(cleanSiteTitle('Desculpe! Algo deu errado nesta página')).toBeNull();
    expect(cleanSiteTitle('Sorry! Are you a human? Captcha required')).toBeNull();
  });

  it('rejeita títulos genéricos do marketplace', () => {
    expect(cleanSiteTitle('Shopee Brasil')).toBeNull();
    expect(cleanSiteTitle('Mercado Livre')).toBeNull();
    expect(cleanSiteTitle('Amazon.com.br')).toBeNull();
  });

  it('rejeita títulos curtos demais', () => {
    expect(cleanSiteTitle('Oi')).toBeNull();
  });
});

describe('extractTitleFromHtml', () => {
  it('prefere og:title', () => {
    const html = '<head><meta property="og:title" content="Tablet Lenovo Idea Tab Plus 8/128GB"/><title>Outra coisa | Amazon.com.br</title></head>';
    expect(extractTitleFromHtml(html)).toBe('Tablet Lenovo Idea Tab Plus 8/128GB');
  });

  it('cai no <title> quando não há og:title', () => {
    const html = '<html><head><title>Caixa de Som JBL Go 3 | Amazon.com.br</title></head>';
    expect(extractTitleFromHtml(html)).toBe('Caixa de Som JBL Go 3');
  });

  it('og:title com atributos invertidos', () => {
    const html = '<meta content="Fone Bluetooth QCY T13" property="og:title">';
    expect(extractTitleFromHtml(html)).toBe('Fone Bluetooth QCY T13');
  });

  it('null quando não há título aproveitável', () => {
    expect(extractTitleFromHtml('<html><body>sem titulo</body></html>')).toBeNull();
    expect(extractTitleFromHtml('<title>Robot Check</title>')).toBeNull();
  });
});

describe('extractPriceFromHtml', () => {
  it('JSON-LD com offers.price (padrão ML)', () => {
    const html = '<script type="application/ld+json">{"@type":"Product","name":"X","offers":{"@type":"Offer","price":889,"priceCurrency":"BRL"}}</script>';
    expect(extractPriceFromHtml(html)).toEqual({ preco: 889 });
  });

  it('JSON-LD em array e price string', () => {
    const html = '<script type="application/ld+json">[{"@type":"Product","offers":[{"price":"62.91"}]}]</script>';
    expect(extractPriceFromHtml(html)).toEqual({ preco: 62.91 });
  });

  it('meta itemprop=price', () => {
    const html = '<meta itemprop="price" content="129.90">';
    expect(extractPriceFromHtml(html)).toEqual({ preco: 129.9 });
  });

  it('padrão priceAmount da Amazon com preço original (basisPrice)', () => {
    const html = '{"priceAmount":62.91,"basisPrice":{"amount":89.90},"currencyCode":"BRL"}';
    const r = extractPriceFromHtml(html);
    expect(r.preco).toBe(62.91);
    expect(r.precoOriginal).toBe(89.9);
  });

  it('padrão a-price-whole/fraction da Amazon', () => {
    const html = '<span class="a-price-whole">1.606<span class="a-price-decimal">,</span></span><span class="a-price-fraction">00</span>';
    expect(extractPriceFromHtml(html).preco).toBe(1606);
  });

  it('vazio quando não há preço ou é inválido', () => {
    expect(extractPriceFromHtml('<html>nada aqui</html>')).toEqual({});
  });

  it('JSON-LD malformado não quebra (cai nos próximos padrões)', () => {
    const html = '<script type="application/ld+json">{quebrado</script><meta itemprop="price" content="55.50">';
    expect(extractPriceFromHtml(html)).toEqual({ preco: 55.5 });
  });
});

describe('extractPriceFromHtml — Mercado Livre (andes)', () => {
  const mlHtml = `
    <span aria-label="Antes: 209 reais com 90 centavos" data-andes-money-amount="true">
      <span class="andes-money-amount__fraction">209</span><span>,</span><span class="andes-money-amount__cents">90</span>
    </span>
    <span aria-label="189 reais" data-andes-money-amount="true">
      <span class="andes-money-amount__fraction">189</span>
    </span>`;

  it('separa preço atual do riscado ("Antes:")', () => {
    expect(extractPriceFromHtml(mlHtml)).toEqual({ preco: 189, precoOriginal: 209.9 });
  });

  it('só riscado sem atual → vazio', () => {
    const soAntes = '<span aria-label="Antes: 100 reais" data-andes-money-amount="true"><span class="andes-money-amount__fraction">100</span></span>';
    expect(extractPriceFromHtml(soAntes)).toEqual({});
  });
});

describe('extractPriceFromHtml — preço zero é preservado', () => {
  it('meta price 0 retorna 0 (não vazio)', () => {
    expect(extractPriceFromHtml('<meta itemprop="price" content="0">')).toEqual({ preco: 0 });
  });
});

describe('extractImageFromHtml (foto oficial do anúncio)', () => {
  it('og:image (Mercado Livre e afins)', () => {
    const html = '<meta property="og:image" content="https://http2.mlstatic.com/D_NQ_NP_123-O.webp">';
    expect(extractImageFromHtml(html)).toBe('https://http2.mlstatic.com/D_NQ_NP_123-O.webp');
  });

  it('hiRes da Amazon quando não há og:image', () => {
    const html = '{"hiRes":"https://m.media-amazon.com/images/I/71abc123._AC_SL1500_.jpg","thumb":"..."}';
    expect(extractImageFromHtml(html)).toBe('https://m.media-amazon.com/images/I/71abc123._AC_SL1500_.jpg');
  });

  it('landingImage como último recurso', () => {
    const html = '<img id="landingImage" data-old-hires="https://m.media-amazon.com/images/I/81xyz.jpg" src="data:...">';
    expect(extractImageFromHtml(html)).toBe('https://m.media-amazon.com/images/I/81xyz.jpg');
  });

  it('undefined sem imagem aproveitável', () => {
    expect(extractImageFromHtml('<html>nada</html>')).toBeUndefined();
  });
});
