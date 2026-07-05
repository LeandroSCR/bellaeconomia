// ══════════════════════════════════════════════════════════════════════════
// ENGINE CREATOR — renderizador de templates (funções puras, sem I/O)
// ══════════════════════════════════════════════════════════════════════════

import type { AdInput } from './types';

const PLACEHOLDER_REGEX = /\{([a-z_]+)\}/g;

function formatPrice(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

/** Monta o mapa de valores dos placeholders a partir do input do anúncio. */
export function buildPlaceholderValues(input: AdInput): Record<string, string> {
  const values: Record<string, string> = {
    titulo: input.titulo?.trim() ?? '',
    link: input.link?.trim() ?? '',
    loja: input.loja?.trim() ?? '',
    cupom: input.cupom?.trim() ?? '',
    preco: input.preco != null && input.preco > 0 ? formatPrice(input.preco) : '',
    preco_original:
      input.precoOriginal != null && input.precoOriginal > 0
        ? formatPrice(input.precoOriginal)
        : '',
    desconto: '',
  };

  if (
    input.preco != null && input.precoOriginal != null &&
    input.preco > 0 && input.precoOriginal > input.preco
  ) {
    const pct = Math.round(((input.precoOriginal - input.preco) / input.precoOriginal) * 100);
    values.desconto = `${pct}%`;
  }

  return values;
}

/**
 * Renderiza um template substituindo placeholders {chave} pelos valores.
 * Linhas que ficarem com placeholder sem valor são REMOVIDAS por inteiro —
 * assim um template com "🏷️ Cupom: {cupom}" some quando não há cupom.
 * Sequências de 3+ linhas vazias são colapsadas em uma.
 */
export function renderTemplate(templateContent: string, input: AdInput): string {
  const values = buildPlaceholderValues(input);

  const lines = templateContent.split('\n').map(line => {
    let hasEmptyPlaceholder = false;
    const rendered = line.replace(PLACEHOLDER_REGEX, (_match, key: string) => {
      const value = values[key];
      if (value === undefined) return _match; // placeholder desconhecido: mantém literal
      if (value === '') { hasEmptyPlaceholder = true; return ''; }
      return value;
    });
    return hasEmptyPlaceholder ? null : rendered;
  });

  return lines
    .filter((l): l is string => l !== null)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Lista os placeholders suportados (para exibir no portal). */
export const SUPPORTED_PLACEHOLDERS = [
  'titulo', 'preco', 'preco_original', 'desconto', 'cupom', 'loja', 'link',
] as const;

/** Valida um input mínimo de anúncio. Retorna lista de erros (vazia = ok). */
export function validateAdInput(input: Partial<AdInput>): string[] {
  const errors: string[] = [];
  if (!input.titulo?.trim()) errors.push('titulo é obrigatório');
  if (!input.link?.trim()) errors.push('link é obrigatório');
  else if (!/^https?:\/\//i.test(input.link.trim())) errors.push('link deve ser uma URL http(s)');
  if (input.preco != null && (typeof input.preco !== 'number' || input.preco < 0)) {
    errors.push('preco deve ser um número >= 0');
  }
  if (input.precoOriginal != null && (typeof input.precoOriginal !== 'number' || input.precoOriginal < 0)) {
    errors.push('precoOriginal deve ser um número >= 0');
  }
  return errors;
}
