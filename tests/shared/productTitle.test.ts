// ══════════════════════════════════════════════════════════════════════════
// TESTES — título real do produto vindo da página (limpeza e parsing de HTML)
// A busca em si não roda em teste (guard VITEST) — testamos as funções puras.
// ══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { cleanSiteTitle, extractTitleFromHtml } from '../../src/shared/productTitle';

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
