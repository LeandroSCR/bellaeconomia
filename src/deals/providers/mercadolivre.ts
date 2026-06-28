import axios from 'axios';
import { config } from '../../config';
import type { Deal } from '../types';

let mlToken: string | null = null;
let mlTokenExpiry = 0;

async function getMlToken(): Promise<string | null> {
  if (!config.ML_CLIENT_ID || !config.ML_CLIENT_SECRET) return null;
  if (mlToken && Date.now() < mlTokenExpiry) return mlToken;

  try {
    const { data } = await axios.post(
      'https://api.mercadolibre.com/oauth/token',
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.ML_CLIENT_ID,
        client_secret: config.ML_CLIENT_SECRET,
      }),
      { headers: { 'content-type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
    );
    mlToken = data.access_token;
    mlTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return mlToken;
  } catch {
    return null;
  }
}

export async function fetchMercadoLivreDeals(limit = 10): Promise<Deal[]> {
  const token = await getMlToken();
  if (!token) return [];

  try {
    const { data } = await axios.get('https://api.mercadolibre.com/sites/MLB/search', {
      params: { q: 'oferta', sort: 'sold_quantity_desc', limit },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });

    const results: unknown[] = data?.results ?? [];
    return results.map((item: any) => {
      // ML não tem API pública de afiliados — colar matt_word/matt_tool
      // manualmente NÃO gera comissão (ver SETUP.md seção 7).
      // Repassamos o link original até integrar com Lomadee/Awin.
      const affiliateUrl = item.permalink;

      return {
        id: `ml_${item.id}`,
        title: item.title,
        price: item.price,
        originalPrice: item.original_price ?? undefined,
        url: item.permalink,
        affiliateUrl,
        imageUrl: item.thumbnail,
        store: 'MercadoLivre',
        source: 'mercadolivre' as const,
        category: item.category_id ?? undefined,
        createdAt: new Date(),
      };
    });
  } catch (err) {
    console.error('Erro ao buscar MercadoLivre:', (err as Error).message);
    return [];
  }
}
