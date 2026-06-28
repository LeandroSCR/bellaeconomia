import axios from 'axios';
import { load } from 'cheerio';
import { createHash } from 'crypto';
import type { Deal } from '../types';

const BASE = 'https://www.pelando.com.br';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

export async function fetchPelandoDeals(limit = 20): Promise<Deal[]> {
  // Tenta a API GraphQL primeiro; se falhar, cai pro scraping HTML
  const fromApi = await tryGraphQL(limit);
  if (fromApi.length > 0) return fromApi;
  return tryHtmlScrape(limit);
}

async function tryGraphQL(limit: number): Promise<Deal[]> {
  const endpoints = [
    `${BASE}/api/graphql`,
    `${BASE}/graphql`,
    `${BASE}/api/v2/graphql`,
  ];

  const query = `query { hotDeals(first:${limit}) { edges { node {
    id title price nextBestPrice url
    image { url } merchant { name } coupon { code }
  } } } }`;

  for (const endpoint of endpoints) {
    try {
      const { data } = await axios.post(endpoint, { query }, {
        headers: { ...HEADERS, 'Content-Type': 'application/json' },
        timeout: 8000,
      });
      const edges: unknown[] = data?.data?.hotDeals?.edges ?? [];
      if (edges.length === 0) continue;
      return edges.map((e: any) => mapNode(e.node));
    } catch {
      // tenta próximo endpoint
    }
  }
  return [];
}

async function tryHtmlScrape(limit: number): Promise<Deal[]> {
  try {
    const { data } = await axios.get(BASE, { headers: HEADERS, timeout: 10000 });
    const $ = load(data);
    const deals: Deal[] = [];

    // Pelando usa data-testid ou classes específicas nos cards de oferta
    $('[data-testid="thread-card"], article[class*="Thread"], [class*="threadCard"]')
      .slice(0, limit)
      .each((_, el) => {
        const title =
          $(el).find('[data-testid="thread-title"], [class*="title"]').first().text().trim() ||
          $(el).find('h2, h3').first().text().trim();

        const priceText =
          $(el).find('[data-testid="thread-price"], [class*="price"]').first().text().trim();
        const price = parsePrice(priceText);

        const href = $(el).find('a').first().attr('href') ?? '';
        const url = href.startsWith('http') ? href : `${BASE}${href}`;

        const store =
          $(el).find('[data-testid="merchant-name"], [class*="merchant"]').first().text().trim() ||
          'Pelando';

        if (title && price > 0) {
          deals.push({
            id: `pelando_${createHash('md5').update(url || title).digest('hex').slice(0, 12)}`,
            title,
            price,
            url,
            store,
            source: 'pelando',
            createdAt: new Date(),
          });
        }
      });

    return deals;
  } catch (err) {
    console.error('Pelando scraping falhou:', (err as Error).message);
    return [];
  }
}

function mapNode(n: any): Deal {
  return {
    id: `pelando_${n.id}`,
    title: n.title,
    price: n.price ?? 0,
    originalPrice: n.nextBestPrice ?? undefined,
    url: n.url,
    imageUrl: n.image?.url ?? undefined,
    store: n.merchant?.name ?? 'Pelando',
    source: 'pelando',
    couponCode: n.coupon?.code ?? undefined,
    createdAt: new Date(),
  };
}

function parsePrice(text: string): number {
  if (!text) return 0;
  const match = text.replace(/\./g, '').replace(',', '.').match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}
