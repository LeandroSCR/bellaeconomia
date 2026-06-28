import axios from 'axios';
import crypto from 'crypto';
import { config } from '../../config';
import type { Deal } from '../types';
import type { ShopeeSuggestionData } from '../../database';

// SHA256(AppId + Timestamp + Payload + Secret) — conforme doc oficial Shopee Affiliate Open API
function shopeeSign(timestamp: number, body: string): string {
  const factor = `${config.SHOPEE_APP_ID}${timestamp}${body}${config.SHOPEE_SECRET}`;
  return crypto.createHash('sha256').update(factor).digest('hex');
}

function shopeeAuthHeader(timestamp: number, body: string): string {
  const sig = shopeeSign(timestamp, body);
  return `SHA256 Credential=${config.SHOPEE_APP_ID}, Timestamp=${timestamp}, Signature=${sig}`;
}

export async function fetchShopeeDeals(limit = 10): Promise<Deal[]> {
  if (!config.SHOPEE_APP_ID || !config.SHOPEE_SECRET || !config.SHOPEE_AFFILIATE_ID) {
    return [];
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const query = `{ productOfferV2(limit: ${limit}) { nodes { itemId productName priceMin priceMax offerLink imageUrl shopName } } }`;
    const bodyStr = JSON.stringify({ query });

    const { data } = await axios.post(
      'https://open-api.affiliate.shopee.com.br/graphql',
      bodyStr,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': shopeeAuthHeader(timestamp, bodyStr),
        },
        timeout: 10000,
      }
    );

    if (data?.errors) {
      console.error('[Shopee] fetchDeals erro:', JSON.stringify(data.errors[0]?.message ?? data.errors));
      return [];
    }

    const items: unknown[] = data?.data?.productOfferV2?.nodes ?? [];
    return items.map((item: any) => ({
      id: `shopee_${item.itemId}`,
      title: item.productName,
      price: parseFloat(item.priceMin),
      originalPrice: item.priceMax ? parseFloat(item.priceMax) : undefined,
      url: item.offerLink,
      affiliateUrl: item.offerLink,
      imageUrl: item.imageUrl,
      store: item.shopName ?? 'Shopee',
      source: 'shopee' as const,
      createdAt: new Date(),
    }));
  } catch (err) {
    console.error('Erro ao buscar Shopee:', (err as Error).message);
    return [];
  }
}

// Busca até `limit` produtos para a fila de aprovação manual do portal.
// Filtros: comissão >= 10%, ordenado por número de vendas (melhor performance).
export async function fetchShopeeSuggestions(limit = 50): Promise<ShopeeSuggestionData[]> {
  if (!config.SHOPEE_APP_ID || !config.SHOPEE_SECRET) return [];

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    // Shopee limita a 50 por request; busca o máximo e filtra em código
    const query = `{
      productOfferV2(limit: 50) {
        nodes {
          itemId
          productName
          priceMin
          priceMax
          commissionRate
          sellerCommissionRate
          shopeeCommissionRate
          offerLink
          imageUrl
          shopName
          ratingStar
          sales
        }
      }
    }`;
    const bodyStr = JSON.stringify({ query });

    const { data } = await axios.post(
      'https://open-api.affiliate.shopee.com.br/graphql',
      bodyStr,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': shopeeAuthHeader(timestamp, bodyStr),
        },
        timeout: 15000,
      }
    );

    if (data?.errors) {
      console.error('[Shopee] fetchSuggestions erro:', JSON.stringify(data.errors[0]?.message ?? data.errors));
      return [];
    }

    const items: any[] = data?.data?.productOfferV2?.nodes ?? [];

    return items
      .filter(item => parseFloat(item.commissionRate) >= 0.10)
      .sort((a, b) => (b.sales ?? 0) - (a.sales ?? 0))
      .slice(0, limit)
      .map(item => {
        const price = parseFloat(item.priceMin);
        const originalPrice = item.priceMax ? parseFloat(item.priceMax) : undefined;
        const discount = originalPrice && originalPrice > price
          ? Math.round(((originalPrice - price) / originalPrice) * 100)
          : undefined;
        return {
          itemId: String(item.itemId),
          title: item.productName,
          price,
          originalPrice,
          discount,
          commissionRate: parseFloat(item.commissionRate),
          sellerCommissionRate: parseFloat(item.sellerCommissionRate ?? '0'),
          shopeeCommissionRate: parseFloat(item.shopeeCommissionRate ?? '0'),
          imageUrl: item.imageUrl ?? undefined,
          offerLink: item.offerLink,
          shopName: item.shopName ?? 'Shopee',
          ratingStar: item.ratingStar ? parseFloat(item.ratingStar) : undefined,
          sales: item.sales ?? undefined,
        } satisfies ShopeeSuggestionData;
      });
  } catch (err) {
    console.error('[Shopee] fetchSuggestions erro:', (err as Error).message);
    return [];
  }
}

// Gera link afiliado para qualquer URL de produto da Shopee.
// Shopee NÃO aceita append de parâmetro — o link precisa ser gerado pela API oficial.
export async function generateShopeeShortLink(originUrl: string): Promise<string | null> {
  if (!config.SHOPEE_APP_ID || !config.SHOPEE_SECRET) return null;

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const query = `mutation {
      generateShortLink(input: {
        originUrl: ${JSON.stringify(originUrl)}
        subIds: ["bot"]
      }) {
        shortLink
      }
    }`;

    const bodyStr = JSON.stringify({ query });
    const { data } = await axios.post(
      'https://open-api.affiliate.shopee.com.br/graphql',
      bodyStr,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': shopeeAuthHeader(timestamp, bodyStr),
        },
        timeout: 10000,
      }
    );

    if (data?.errors) {
      console.error('[Shopee] API erro:', JSON.stringify(data.errors[0]?.message ?? data.errors));
      return null;
    }

    return data?.data?.generateShortLink?.shortLink ?? null;
  } catch (err) {
    console.error('[Shopee] generateShortLink erro:', (err as Error).message);
    return null;
  }
}
