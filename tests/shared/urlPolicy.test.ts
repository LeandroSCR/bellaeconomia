// ══════════════════════════════════════════════════════════════════════════
// TESTES — política de URLs: só repassa lojas afiliadas (Shopee/Amazon/ML)
// Caso real: promoção com link da Kabum nunca pode ser repassada.
// ══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { classifyUrl, findForeignStoreUrls, indicatesSingleProduct } from '../../src/shared/urlPolicy';

describe('classifyUrl', () => {
  it('plataformas afiliadas → affiliate', () => {
    expect(classifyUrl('https://www.amazon.com.br/dp/B0ABC12345')).toBe('affiliate');
    expect(classifyUrl('https://amzn.to/4vb6vBw')).toBe('affiliate');
    expect(classifyUrl('https://shopee.com.br/produto-i.123.456')).toBe('affiliate');
    expect(classifyUrl('https://s.shopee.com.br/xyz')).toBe('affiliate');
    expect(classifyUrl('https://shope.ee/abc')).toBe('affiliate');
    expect(classifyUrl('https://www.mercadolivre.com.br/produto/p/MLB123')).toBe('affiliate');
    expect(classifyUrl('https://meli.la/1tiwXvz')).toBe('affiliate');
  });

  it('lojas não afiliadas → foreign', () => {
    expect(classifyUrl('https://www.kabum.com.br/produto/12345')).toBe('foreign');
    expect(classifyUrl('https://www.magazineluiza.com.br/produto/x')).toBe('foreign');
    expect(classifyUrl('https://www.americanas.com.br/produto/1')).toBe('foreign');
    expect(classifyUrl('https://pt.aliexpress.com/item/1.html')).toBe('foreign');
  });

  it('encurtadores genéricos → foreign (podem apontar para qualquer loja)', () => {
    expect(classifyUrl('https://bit.ly/3abc')).toBe('foreign');
    expect(classifyUrl('https://tinyurl.com/xyz')).toBe('foreign');
  });

  it('links de comunidade/social → harmless', () => {
    expect(classifyUrl('https://chat.whatsapp.com/ABC123')).toBe('harmless');
    expect(classifyUrl('https://t.me/canal')).toBe('harmless');
    expect(classifyUrl('https://www.instagram.com/perfil')).toBe('harmless');
  });

  it('domínio parecido não engana o whitelist (matching por sufixo de host)', () => {
    expect(classifyUrl('https://amazon.com.br.golpe.net/dp/X')).toBe('foreign');
    expect(classifyUrl('https://fakeshopee.com.br/x')).toBe('foreign');
  });

  it('URL malformada → foreign', () => {
    expect(classifyUrl('nao-e-url')).toBe('foreign');
  });
});

describe('findForeignStoreUrls', () => {
  it('mensagem mista (Amazon + Kabum) detecta a URL estranha', () => {
    const urls = ['https://amzn.to/abc', 'https://www.kabum.com.br/produto/9'];
    expect(findForeignStoreUrls(urls)).toEqual(['https://www.kabum.com.br/produto/9']);
  });

  it('mensagem limpa (afiliadas + grupo) retorna vazio', () => {
    const urls = ['https://meli.la/x', 'https://chat.whatsapp.com/grupo'];
    expect(findForeignStoreUrls(urls)).toEqual([]);
  });
});

describe('indicatesSingleProduct (regra: sem produto único → curadoria)', () => {
  it('página de campanha da Amazon NÃO é produto único (caso Prime Day)', () => {
    expect(indicatesSingleProduct('Ofertas!\nhttps://www.amazon.com.br/primeday?tag=bellaeconomia-20')).toBe(false);
    expect(indicatesSingleProduct('https://www.amazon.com.br/deals?tag=x')).toBe(false);
    expect(indicatesSingleProduct('https://www.amazon.com.br/?tag=x')).toBe(false);
  });

  it('URLs de produto específico SÃO produto único', () => {
    expect(indicatesSingleProduct('https://www.amazon.com.br/dp/B08VH5ZTB3?tag=x')).toBe(true);
    expect(indicatesSingleProduct('https://meli.la/1tiwXvz')).toBe(true);
    expect(indicatesSingleProduct('https://s.shopee.com.br/abc123')).toBe(true);
    expect(indicatesSingleProduct('https://produto.mercadolivre.com.br/MLB-123456789-furadeira-_JM')).toBe(true);
    expect(indicatesSingleProduct('https://shopee.com.br/produto-i.123.456')).toBe(true);
  });

  it('texto sem URL não indica produto', () => {
    expect(indicatesSingleProduct('promoção imperdível sem link')).toBe(false);
  });
});
