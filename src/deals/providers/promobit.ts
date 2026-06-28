import axios from 'axios';
import { load } from 'cheerio';
import { createHash } from 'crypto';
import type { Deal } from '../types';

const BASE = 'https://www.promobit.com.br';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

export async function fetchPromobitDeals(limit = 20): Promise<Deal[]> {
  // Tenta diferentes endpoints de API antes de cair no scraping HTML
  const fromApi = await tryApi(limit);
  if (fromApi.length > 0) return fromApi;
  return tryHtmlScrape(limit);
}

async function tryApi(limit: number): Promise<Deal[]> {
  const endpoints = [
    `${BASE}/api/promotions?limit=${limit}&page=1`,
    `${BASE}/api/v1/promotions?limit=${limit}`,
    `${BASE}/api/offers?limit=${limit}&page=1&sort=hot`,
    `${BASE}/api/v2/offers?limit=${limit}`,
  ];

  for (const url of endpoints) {
    try {
      const { data } = await axios.get(url, { headers: HEADERS, timeout: 8000 });
      const items: unknown[] = data?.data ?? data?.offers ?? data?.promotions ?? data?.results ?? [];
      if (items.length === 0) continue;
      return items.slice(0, limit).map((o: any) => ({
        id: `promobit_${o.id ?? o.slug ?? createHash('md5').update(o.url ?? o.title).digest('hex').slice(0, 8)}`,
        title: o.title ?? o.name ?? '',
        price: parseFloat(o.price ?? o.offer_price ?? o.current_price ?? 0),
        originalPrice: o.original_price ? parseFloat(o.original_price) : undefined,
        url: o.url ?? o.offer_url ?? o.link ?? '',
        imageUrl: o.image ?? o.image_url ?? o.thumbnail ?? undefined,
        store: o.store?.name ?? o.merchant ?? o.retailer ?? 'Promobit',
        source: 'promobit' as const,
        couponCode: o.coupon ?? o.coupon_code ?? undefined,
        createdAt: new Date(),
      }));
    } catch {
      // tenta próximo endpoint
    }
  }
  return [];
}

async function tryHtmlScrape(limit: number): Promise<Deal[]> {
  try {
    const { data } = await axios.get(`${BASE}/ofertas`, { headers: HEADERS, timeout: 10000 });
    const $ = load(data);
    const deals: Deal[] = [];

    // Promobit usa cards de oferta com estrutura específica
    $('[class*="OfferCard"], [class*="offer-card"], article[class*="offer"]')
      .slice(0, limit)
      .each((_, el) => {
        const title =
          $(el).find('[class*="title"], h2, h3').first().text().trim();

        const priceText =
          $(el).find('[class*="price"], [class*="Price"]').first().text().trim();
        const price = parsePrice(priceText);

        const href = $(el).find('a').first().attr('href') ?? '';
        const url = href.startsWith('http') ? href : `${BASE}${href}`;

        const store =
          $(el).find('[class*="store"], [class*="merchant"]').first().text().trim() ||
          'Promobit';

        if (title && price > 0) {
          deals.push({
            id: `promobit_${createHash('md5').update(url || title).digest('hex').slice(0, 12)}`,
            title,
            price,
            url,
            store,
            source: 'promobit',
            createdAt: new Date(),
          });
        }
      });

    return deals;
  } catch (err) {
    console.error('Promobit scraping falhou:', (err as Error).message);
    return [];
  }
}

function parsePrice(text: string): number {
  if (!text) return 0;
  const match = text.replace(/\./g, '').replace(',', '.').match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}
