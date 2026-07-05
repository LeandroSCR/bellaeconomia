// ══════════════════════════════════════════════════════════════════════════
// CAMADA COMPARTILHADA — extrator de dados estruturados de mensagens de promoção
//
// Converte texto livre de grupo de promoção em AdInput para renderizar no
// template padrão. Funções puras, sem I/O.
//
// REGRA DE OURO: melhor retornar null (fallback para repasse original) do que
// extrair errado e enviar mensagem quebrada no canal.
// ══════════════════════════════════════════════════════════════════════════

import type { AdInput } from './templates/types';

const URL_REGEX = /https?:\/\/[^\s]+/;

/** Converte "R$ 1.299,90" / "R$ 23,44" / "R$ 360" em número. */
export function parsePrice(raw: string): number | undefined {
  const match = raw.match(/R\$\s*([\d.]+(?:,\d{1,2})?)/i);
  if (!match) return undefined;
  const normalized = match[1].replace(/\./g, '').replace(',', '.');
  const value = parseFloat(normalized);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Primeira linha "de conteúdo" — ignora URLs, preços puros e linhas de cupom. */
export function extractTitle(text: string): string | undefined {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const titleLine = lines.find(l =>
    !/^https?:\/\//i.test(l) &&
    !/(?:cupom|código|code|voucher)\s*[:：]/i.test(l) &&
    !/^(?:por\s*:?\s*)?R\$/i.test(l) &&
    !/^(?:de\s+)?R\$\s*[\d.,]+/i.test(l) &&
    l.replace(/[\p{Emoji}\s*_~`]/gu, '').length > 3
  );
  if (!titleLine) return undefined;
  const cleaned = titleLine
    .replace(/[*_~`]/g, '')
    .replace(/^[\p{Emoji}\p{So}\s]+/u, '')
    .trim();
  return cleaned.length > 3 ? cleaned.slice(0, 120) : undefined;
}

/** Extrai preço atual e original.
 *  Padrões: "De R$ X por R$ Y" · "POR: R$ Y" · "R$ Y" (menor valor se houver risco). */
export function extractPrices(text: string): { preco?: number; precoOriginal?: number } {
  // "De R$ X por R$ Y" (com ou sem ~riscado~)
  const dePor = text.match(/de\s*:?\s*~?R\$\s*[\d.,]+~?(?:\s*(?:por|→|>|:))+\s*\*?R\$\s*[\d.,]+/i);
  const prices = dePor?.[0].match(/R\$\s*[\d.,]+/gi) ?? [];
  const [priceA, priceB] = prices;
  if (priceA && priceB) {
    const original = parsePrice(priceA);
    const atual = parsePrice(priceB);
    if (original && atual && original > atual) {
      return { preco: atual, precoOriginal: original };
    }
    if (atual) return { preco: atual };
  }

  // "POR: R$ Y" explícito
  const porMatch = text.match(/\bpor\s*:?\s*\*?R\$\s*[\d.,]+/i);
  if (porMatch) {
    const preco = parsePrice(porMatch[0]);
    if (preco) return { preco };
  }

  // Primeiro preço avulso do texto
  const first = text.match(/R\$\s*[\d.,]+/i);
  if (first) {
    const preco = parsePrice(first[0]);
    if (preco) return { preco };
  }

  return {};
}

/** Extrai código de cupom: "cupom: CODE" / "cupom CODE" / "use o código CODE". */
export function extractCouponCode(text: string): string | undefined {
  const patterns = [
    /cupom\s*[:：]\s*[`'"]?([A-Za-z0-9_-]{3,25})[`'"]?/i,
    /c[óo]digo\s*[:：]\s*[`'"]?([A-Za-z0-9_-]{3,25})[`'"]?/i,
    /cupom\s+[`'"]?([A-Z0-9][A-Z0-9_-]{2,24})[`'"]?/,
    /use\s+(?:o\s+)?(?:cupom|c[óo]digo)\s+[`'"]?([A-Za-z0-9_-]{3,25})[`'"]?/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const code = m[1].trim();
      // Evita capturar palavras comuns como código
      if (!/^(de|do|da|no|na|em|para|com|off|desconto|abaixo|acima)$/i.test(code)) {
        return code;
      }
    }
  }
  return undefined;
}

const STORE_LABELS: Record<string, string> = {
  amazon: 'Amazon',
  shopee: 'Shopee',
  mercadolivre: 'Mercado Livre',
  pelando: 'Pelando',
  promobit: 'Promobit',
};

/**
 * Extrai um AdInput completo de uma mensagem de promoção.
 *
 * @param originalText  texto original da mensagem do grupo fonte
 * @param processedText texto com links já trocados por afiliados (o link vem daqui)
 * @param source        loja detectada (detectSourceFromText)
 * @returns AdInput, ou null se faltou título ou link (chamador faz fallback)
 */
export function extractAdInput(
  originalText: string,
  processedText: string,
  source: string
): AdInput | null {
  const titulo = extractTitle(originalText);
  const link = processedText.match(URL_REGEX)?.[0];

  // Sem título ou sem link → não dá para padronizar com segurança
  if (!titulo || !link) return null;

  const { preco, precoOriginal } = extractPrices(originalText);

  return {
    titulo,
    link,
    preco,
    precoOriginal,
    cupom: extractCouponCode(originalText),
    loja: STORE_LABELS[source.toLowerCase()] ?? undefined,
  };
}
