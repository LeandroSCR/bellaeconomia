import { describe, it, expect } from 'vitest';
import { renderTemplate, buildPlaceholderValues, validateAdInput } from '../../src/engines/creator/renderer';
import type { AdInput } from '../../src/engines/creator/types';

const fullInput: AdInput = {
  titulo: 'Fone Bluetooth XYZ',
  link: 'https://meli.la/abc123',
  preco: 99.9,
  precoOriginal: 199.9,
  cupom: 'DESCONTO10',
  loja: 'Mercado Livre',
};

describe('buildPlaceholderValues', () => {
  it('formata preços em BRL com vírgula', () => {
    const v = buildPlaceholderValues(fullInput);
    expect(v.preco).toBe('R$ 99,90');
    expect(v.preco_original).toBe('R$ 199,90');
  });

  it('calcula desconto percentual', () => {
    const v = buildPlaceholderValues(fullInput);
    expect(v.desconto).toBe('50%');
  });

  it('desconto vazio quando não há preço original maior', () => {
    const v = buildPlaceholderValues({ ...fullInput, precoOriginal: undefined });
    expect(v.desconto).toBe('');
    const v2 = buildPlaceholderValues({ ...fullInput, precoOriginal: 50 });
    expect(v2.desconto).toBe('');
  });

  it('campos opcionais ausentes viram string vazia', () => {
    const v = buildPlaceholderValues({ titulo: 'X', link: 'https://a.b' });
    expect(v.cupom).toBe('');
    expect(v.loja).toBe('');
    expect(v.preco).toBe('');
  });
});

describe('renderTemplate', () => {
  it('substitui todos os placeholders', () => {
    const out = renderTemplate('{titulo} por {preco} na {loja}: {link}', fullInput);
    expect(out).toBe('Fone Bluetooth XYZ por R$ 99,90 na Mercado Livre: https://meli.la/abc123');
  });

  it('remove linhas com placeholder sem valor', () => {
    const template = '📦 *{titulo}*\n🏷️ Cupom: {cupom}\n👉 {link}';
    const out = renderTemplate(template, { titulo: 'Produto', link: 'https://x.y' });
    expect(out).not.toContain('Cupom');
    expect(out).toContain('Produto');
    expect(out).toContain('https://x.y');
  });

  it('mantém linha de desconto apenas quando há desconto', () => {
    const template = '{titulo}\nDe {preco_original} por {preco} (-{desconto})\n{link}';
    const comDesconto = renderTemplate(template, fullInput);
    expect(comDesconto).toContain('De R$ 199,90 por R$ 99,90 (-50%)');

    const semDesconto = renderTemplate(template, { titulo: 'X', link: 'https://a.b', preco: 10 });
    expect(semDesconto).not.toContain('De ');
  });

  it('colapsa múltiplas linhas vazias', () => {
    const template = '{titulo}\n\n{cupom}\n\n{loja}\n\n{link}';
    const out = renderTemplate(template, { titulo: 'T', link: 'https://a.b' });
    expect(out).not.toMatch(/\n{3,}/);
  });

  it('placeholder desconhecido fica literal', () => {
    const out = renderTemplate('{titulo} {naoexiste}', fullInput);
    expect(out).toContain('{naoexiste}');
  });
});

describe('validateAdInput', () => {
  it('aceita input válido', () => {
    expect(validateAdInput(fullInput)).toEqual([]);
  });

  it('rejeita sem título ou link', () => {
    expect(validateAdInput({ link: 'https://a.b' })).toContain('titulo é obrigatório');
    expect(validateAdInput({ titulo: 'X' })).toContain('link é obrigatório');
  });

  it('rejeita link que não é URL', () => {
    const errors = validateAdInput({ titulo: 'X', link: 'nao-e-url' });
    expect(errors.some(e => e.includes('http'))).toBe(true);
  });

  it('rejeita preço negativo', () => {
    const errors = validateAdInput({ titulo: 'X', link: 'https://a.b', preco: -5 });
    expect(errors.length).toBeGreaterThan(0);
  });
});
