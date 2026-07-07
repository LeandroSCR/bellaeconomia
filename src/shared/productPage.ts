// ══════════════════════════════════════════════════════════════════════════
// CAMADA COMPARTILHADA — dados REAIS do produto direto da página do site
//
// Fonte da verdade é o site (Amazon/ML/Shopee): título (og:title/<title>) e
// preço (JSON-LD, meta itemprop, padrões da Amazon). Qualquer falha
// (bloqueio, captcha, timeout, página JS) retorna null/undefined e o
// chamador usa a heurística do texto — o envio nunca trava por causa disso.
// ══════════════════════════════════════════════════════════════════════════

import axios from 'axios';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export interface ProductPageInfo {
  title: string | null;
  preco?: number;
  precoOriginal?: number;
}

// Cache em memória (inclui negativos) — o mesmo produto aparece em vários grupos
const cache = new Map<string, ProductPageInfo>();
const CACHE_MAX = 300;

function remember(url: string, info: ProductPageInfo): ProductPageInfo {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(url, info);
  return info;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

/** Limpa o título cru vindo do site (sufixos de marketplace, entidades, lixo).
 *  Retorna null quando o resultado não parece nome de produto. */
export function cleanSiteTitle(raw: string): string | null {
  let title = decodeEntities(raw)
    .replace(/\s+/g, ' ')
    .trim()
    // sufixos/prefixos de marketplace
    .replace(/\s*[|\-–:]\s*Amazon\.com\.br.*$/i, '')
    .replace(/^Amazon\.com\.br\s*[:|\-–]\s*/i, '')
    .replace(/\s*[|\-–]\s*Mercado\s*Livre.*$/i, '')
    .replace(/\s*[|\-–]\s*MercadoLivre.*$/i, '')
    .replace(/\s*[|\-–]\s*Shopee.*$/i, '')
    .replace(/\s*[|\-–]\s*Submarino.*$/i, '')
    .trim();

  if (title.length < 10) return null;

  // Páginas de bloqueio/erro não são título de produto
  if (/robot\s*check|captcha|are\s+you\s+a\s+human|algo\s+deu\s+errado|desculpe|access\s+denied|p[áa]gina\s+n[ãa]o\s+encontrada/i.test(title)) {
    return null;
  }
  // Título genérico do marketplace (página JS sem SSR, home, etc.)
  if (/^(amazon(\.com\.br)?|mercado\s*livre|mercadolivre|shopee(\s+brasil)?|ofertas?)$/i.test(title)) {
    return null;
  }

  return title.slice(0, 120);
}

/** Extrai og:title ou <title> do HTML. */
export function extractTitleFromHtml(html: string): string | null {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (og?.[1]) {
    const cleaned = cleanSiteTitle(og[1]);
    if (cleaned) return cleaned;
  }
  const t = html.match(/<title[^>]*>([\s\S]{0,500}?)<\/title>/i);
  if (t?.[1]) return cleanSiteTitle(t[1]);
  return null;
}

function sanePrice(v: unknown): number | undefined {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  // 0 é válido — o preço do anúncio deve ser refletido exatamente como está
  return Number.isFinite(n) && n >= 0 && n < 1_000_000 ? Math.round(n * 100) / 100 : undefined;
}

/** Extrai preço (e preço original, se disponível) do HTML da página. */
export function extractPriceFromHtml(html: string): { preco?: number; precoOriginal?: number } {
  // 1. JSON-LD (padrão em ML e muitas lojas): "@type":"Product" com offers.price
  const ldBlocks = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of ldBlocks) {
    const body = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
    try {
      const data = JSON.parse(body);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item?.offers) {
          const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
          const preco = sanePrice(offers?.price ?? offers?.lowPrice);
          if (preco != null) return { preco };
        }
      }
    } catch { /* bloco malformado — tenta o próximo */ }
  }

  // 2. meta itemprop="price"
  const meta = html.match(/<meta[^>]+itemprop=["']price["'][^>]+content=["']([\d.]+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([\d.]+)["'][^>]+itemprop=["']price["']/i);
  if (meta) {
    const preco = sanePrice(meta[1]);
    if (preco != null) return { preco };
  }

  // 3. Padrões da Amazon: "priceAmount":62.91 / a-price-whole + fraction
  const amazonJson = html.match(/"priceAmount"\s*:\s*([\d.]+)/);
  if (amazonJson) {
    const preco = sanePrice(amazonJson[1]);
    if (preco != null) {
      const basis = html.match(/"basisPrice"[\s\S]{0,200}?"amount"\s*:\s*([\d.]+)/);
      const precoOriginal = basis ? sanePrice(basis[1]) : undefined;
      return { preco, precoOriginal: precoOriginal && precoOriginal > preco ? precoOriginal : undefined };
    }
  }
  const whole = html.match(/a-price-whole[^>]*>\s*([\d.]+)\s*[,<]([\s\S]{0,120}?a-price-fraction[^>]*>\s*(\d{1,2}))?/i);
  if (whole) {
    const inteiro = whole[1].replace(/\./g, '');
    const centavos = whole[3] ?? '00';
    const preco = sanePrice(`${inteiro}.${centavos}`);
    if (preco != null) return { preco };
  }

  // 4. Mercado Livre: componentes andes-money-amount. O preço riscado tem
  //    aria-label "Antes: ..."; o primeiro sem "Antes" é o preço atual.
  const andesMatches = [...html.matchAll(/aria-label="([^"]{0,80}?)"[^>]*data-andes-money-amount="true"/g)].slice(0, 8);
  if (andesMatches.length > 0) {
    let preco: number | undefined;
    let precoOriginal: number | undefined;
    for (const m of andesMatches) {
      const chunk = html.slice(m.index!, m.index! + 700);
      const frac = chunk.match(/andes-money-amount__fraction[^>]*>([\d.]+)</);
      if (!frac) continue;
      const cents = chunk.match(/andes-money-amount__cents[^>]*>(\d{1,2})</);
      const valor = sanePrice(`${frac[1].replace(/\./g, '')}.${cents?.[1] ?? '00'}`);
      if (valor == null) continue;
      if (/^antes/i.test(m[1])) {
        if (precoOriginal == null) precoOriginal = valor;
      } else if (preco == null) {
        preco = valor;
      }
      if (preco != null && precoOriginal != null) break;
    }
    if (preco != null) {
      return {
        preco,
        precoOriginal: precoOriginal != null && precoOriginal > preco ? precoOriginal : undefined,
      };
    }
  }

  return {};
}

/** Busca título e preço do produto na página. Falha = campos vazios (fallback). */
export async function fetchProductInfo(url: string): Promise<ProductPageInfo> {
  // Testes não fazem rede
  if (process.env.VITEST) return { title: null };

  const cached = cache.get(url);
  if (cached) return cached;

  try {
    const r = await axios.get(url, {
      timeout: 8000,
      maxRedirects: 10,
      responseType: 'text',
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'pt-BR,pt;q=0.9',
        Accept: 'text/html,application/xhtml+xml',
      },
      // páginas de produto são grandes — só o começo interessa
      maxContentLength: 2_000_000,
    });
    const html = String(r.data);
    const title = extractTitleFromHtml(html);
    const { preco, precoOriginal } = extractPriceFromHtml(html);
    if (title) console.log(`[PAGE] site: "${title.slice(0, 60)}" preço=${preco ?? '—'}`);
    return remember(url, { title, preco, precoOriginal });
  } catch (err) {
    console.log(`[PAGE] falha ao buscar página (${(err as Error).message.slice(0, 50)}) — usando fallback`);
    return remember(url, { title: null });
  }
}

/** Compat: só o título. */
export async function fetchProductTitle(url: string): Promise<string | null> {
  return (await fetchProductInfo(url)).title;
}
