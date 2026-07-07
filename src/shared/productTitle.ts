// ══════════════════════════════════════════════════════════════════════════
// CAMADA COMPARTILHADA — título REAL do produto direto da página do site
//
// Fonte da verdade do título é o site (Amazon/ML/Shopee). Busca o og:title
// ou <title> da página do link afiliado; qualquer falha (bloqueio, captcha,
// timeout, página JS sem título server-side) retorna null e o chamador usa
// o extrator heurístico como fallback — o envio nunca trava por causa disso.
// ══════════════════════════════════════════════════════════════════════════

import axios from 'axios';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Cache em memória (inclui negativos) — o mesmo produto aparece em vários grupos
const cache = new Map<string, string | null>();
const CACHE_MAX = 300;

function remember(url: string, title: string | null): string | null {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(url, title);
  return title;
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

/** Busca o título do produto na página. null = usar fallback heurístico. */
export async function fetchProductTitle(url: string): Promise<string | null> {
  // Testes não fazem rede
  if (process.env.VITEST) return null;

  if (cache.has(url)) return cache.get(url) ?? null;

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
    const title = extractTitleFromHtml(String(r.data));
    if (title) console.log(`[TITLE] título do site: ${title.slice(0, 80)}`);
    return remember(url, title);
  } catch (err) {
    console.log(`[TITLE] falha ao buscar título (${(err as Error).message.slice(0, 50)}) — usando fallback`);
    return remember(url, null);
  }
}
