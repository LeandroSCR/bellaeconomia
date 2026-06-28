import axios from 'axios';
import { load } from 'cheerio';
import { createHash } from 'crypto';
import type { Coupon } from '../types';

export async function scrapeCuponomia(limit = 10): Promise<Coupon[]> {
  try {
    const { data } = await axios.get('https://www.cuponomia.com.br/cupons', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000,
    });

    const $ = load(data);
    const coupons: Coupon[] = [];

    $('[data-coupon-code], .coupon-item').slice(0, limit).each((_, el) => {
      const code =
        $(el).attr('data-coupon-code') ??
        $(el).find('.code, .coupon-code').first().text().trim();
      const store = $(el).find('.store-name, .merchant-name').first().text().trim();
      const discount = $(el).find('.discount, .value').first().text().trim();
      const description = $(el).find('.description, .title').first().text().trim();
      const href = $(el).find('a').first().attr('href') ?? '';
      const url = href.startsWith('http') ? href : `https://www.cuponomia.com.br${href}`;

      if (code && store) {
        coupons.push({
          id: createHash('md5').update(`cuponomia_${code}_${store}`).digest('hex'),
          code,
          store,
          discount: discount || 'desconto especial',
          description: description || `Cupom ${store}`,
          url: url || 'https://www.cuponomia.com.br',
          source: 'cuponomia',
        });
      }
    });

    return coupons;
  } catch (err) {
    console.error('Erro ao scrapelar Cuponomia:', (err as Error).message);
    return [];
  }
}
