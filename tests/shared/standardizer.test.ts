// ══════════════════════════════════════════════════════════════════════════
// TESTES — padronizador de repasses (garantia de fallback)
// O canal NUNCA pode deixar de receber a promoção por falha de padronização.
// ══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { standardizeForward } from '../../src/shared/standardizer';

describe('standardizeForward', () => {
  it('padroniza produto com dados completos usando o template padrão', async () => {
    const original = '*Echo Dot 5ª geração*\n\nDe R$ 399,00 por R$ 279,00\n\nhttps://amzn.to/x';
    const processed = '*Echo Dot 5ª geração*\n\nDe R$ 399,00 por R$ 279,00\n\nhttps://amzn.to/meulink';
    const out = await standardizeForward(original, processed, 'amazon');

    expect(out).toContain('Echo Dot 5ª geração');
    expect(out).toContain('https://amzn.to/meulink');
    // não pode conter o link original não-afiliado
    expect(out).not.toContain('https://amzn.to/x');
  });

  it('fallback: sem título extraível retorna o texto processado intacto', async () => {
    const processed = 'R$ 10,00\nhttps://a.b/link-afiliado';
    const out = await standardizeForward('R$ 10,00\nhttps://a.b/orig', processed, 'amazon');
    expect(out).toBe(processed);
  });

  it('fallback: sem link no processado retorna o texto processado intacto', async () => {
    const processed = 'Produto Bom por R$ 10';
    const out = await standardizeForward('Produto Bom por R$ 10', processed, 'amazon');
    expect(out).toBe(processed);
  });
});
