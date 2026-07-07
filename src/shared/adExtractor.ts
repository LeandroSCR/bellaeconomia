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

/** Converte caracteres estilizados (𝙊𝙛𝙚𝙧𝙩𝙖, 𝗢𝗳𝗲𝗿𝘁𝗮, 𝟵𝟬𝟲...) para ASCII simples.
 *  Grupos de promoção adoram Mathematical Alphanumeric Symbols — sem isso,
 *  nenhuma comparação de texto funciona.
 *  NFKC só nos blocos estilizados: global estragaria ª/º ("5ª geração" → "5a"). */
export function normalizeStylized(text: string): string {
  return text.replace(/[\u{1D400}-\u{1D7FF}\u{FF01}-\u{FF5E}]/gu, ch => ch.normalize('NFKC'));
}

// Palavras/frases de campanha que não identificam produto nenhum
const CAMPAIGN_WORDS =
  /(ofertas?|promo(?:ç|c)(?:ã|a)o|promo(?:ç|c)(?:õ|o)es|prime\s*day|black\s*friday|cyber\s*monday|esquenta|achadinhos?|achados?|imperd[ií]ve(?:l|is)|rel[âa]mpago|queima\s*de\s*estoque|mega|super|hiper|do\s*dia|da\s*semana|s[óo]\s*hoje|hoje\s*tem|corre[!\s]*|[úu]ltim[oa]s?\s*(?:dia|hora|chance|unidade)s?|acaba\s*hoje|termina\s*hoje|s[óo]\s*at[ée]|encerra\w*|frete\s*gr[áa]tis|desconto|off|antecipad[ao]s?|exclusiv[ao]s?|especial|apro?veite[m]?)/gi;

// Blocos de "letras enfeitadas" — divulgadores estilizam CABEÇALHOS
// (𝙐𝙡𝙩𝙞𝙢𝙤 𝙙𝙞𝙖), nunca o nome do produto (precisa ser pesquisável)
const STYLIZED_REGEX = /[\u{1D400}-\u{1D7FF}]/u;

/** Linha que é SÓ cabeçalho de campanha ("Oferta Prime Day", "🔥ESQUENTA BLACK
 *  FRIDAY🔥") — removendo as palavras de campanha não sobra conteúdo. */
export function isCampaignHeader(line: string): boolean {
  const meaningful = normalizeStylized(line)
    .replace(CAMPAIGN_WORDS, '')
    .replace(/[\p{Emoji}\p{P}\p{S}\s\d]/gu, '');
  return meaningful.length < 4;
}

/** Converte "R$ 1.299,90" / "R$ 23,44" / "R$ 360" em número. */
export function parsePrice(raw: string): number | undefined {
  const match = raw.match(/R\$\s*([\d.]+(?:,\d{1,2})?)/i);
  if (!match) return undefined;
  const normalized = match[1].replace(/\./g, '').replace(',', '.');
  const value = parseFloat(normalized);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

// Sinais de que uma linha é título de PRODUTO: specs técnicas e códigos de modelo
const SPEC_REGEX = /\d+\s*(?:gb|tb|mb|hz|ghz|mah|w|kw|v|ml|l|kg|g|cm|mm|m|pol(?:egadas?)?|"|k|rpm|p[çc]s?|un|x\d)/i;
const MODEL_CODE_REGEX = /\b[A-Za-z]{2,}[-]?\d{2,}\b|\b\d+\/\d+\s*gb\b/i;

/** Pontua uma candidata a título: sinais de produto somam, de campanha subtraem. */
function scoreTitleCandidate(normalizedLine: string, originalLine: string): number {
  let score = 0;
  if (SPEC_REGEX.test(normalizedLine)) score += 2;
  if (MODEL_CODE_REGEX.test(normalizedLine)) score += 1;
  if (normalizedLine.length >= 25 && normalizedLine.length <= 90) score += 1;
  if (STYLIZED_REGEX.test(originalLine)) score -= 3; // fonte enfeitada = cabeçalho
  if (CAMPAIGN_WORDS.test(normalizedLine)) score -= 2;
  CAMPAIGN_WORDS.lastIndex = 0; // regex /g guarda estado entre .test()
  return score;
}

/** Melhor linha de título — ignora URLs, preços, cupons e cabeçalhos de
 *  campanha; entre as candidatas, vence a com mais "cara de produto"
 *  (specs/modelo somam; fonte estilizada e palavras de campanha subtraem). */
export function extractTitle(text: string): string | undefined {
  const originalLines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const candidates = originalLines
    .map(original => ({ original, normalized: normalizeStylized(original) }))
    .filter(({ normalized }) =>
      !/https?:\/\//i.test(normalized) &&
      !/(?:cupom|código|code|voucher)\s*[:：]/i.test(normalized) &&
      !/^(?:por\s*:?\s*)?R\$/i.test(normalized) &&
      !/^(?:de\s+)?R\$\s*[\d.,]+/i.test(normalized) &&
      !isCampaignHeader(normalized) &&
      normalized.replace(/[\p{Emoji}\s*_~`]/gu, '').length > 3
    );

  if (candidates.length === 0) return undefined;

  // Pontuação estável: empate mantém a ordem original (primeira linha vence)
  let best = candidates[0];
  let bestScore = scoreTitleCandidate(best.normalized, best.original);
  for (let i = 1; i < candidates.length; i++) {
    const score = scoreTitleCandidate(candidates[i].normalized, candidates[i].original);
    if (score > bestScore) { best = candidates[i]; bestScore = score; }
  }

  const cleaned = best.normalized
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
  // Preços e cupons usam o texto normalizado (𝟵𝟬𝟲 → 906); o título recebe o
  // ORIGINAL — a fonte estilizada é sinal de cabeçalho e pesa na pontuação
  const normalized = normalizeStylized(originalText);
  const titulo = extractTitle(originalText);
  const link = processedText.match(URL_REGEX)?.[0];

  // Sem título ou sem link → não dá para padronizar com segurança
  if (!titulo || !link) return null;

  const { preco, precoOriginal } = extractPrices(normalized);

  return {
    titulo,
    link,
    preco,
    precoOriginal,
    cupom: extractCouponCode(normalized),
    loja: STORE_LABELS[source.toLowerCase()] ?? undefined,
  };
}
