import axios from 'axios';
import crypto from 'crypto';
import { config } from '../../config';
import type { Deal } from '../types';

const ENDPOINT = 'webservices.amazon.com.br';
const URI = '/paapi5/searchitems';
const REGION = 'us-east-1';
const SERVICE = 'ProductAdvertisingAPI';

export async function fetchAmazonDeals(keywords = 'oferta', limit = 5): Promise<Deal[]> {
  if (!config.AMAZON_ACCESS_KEY || !config.AMAZON_SECRET_KEY || !config.AMAZON_PARTNER_TAG) {
    return [];
  }

  try {
    const payload = JSON.stringify({
      Keywords: keywords,
      PartnerTag: config.AMAZON_PARTNER_TAG,
      PartnerType: 'Associates',
      Resources: [
        'ItemInfo.Title',
        'Offers.Listings.Price',
        'Offers.Listings.SavingBasis',
        'Images.Primary.Large',
      ],
      SearchIndex: 'All',
      ItemCount: limit,
    });

    const headers = signRequest(
      'POST', ENDPOINT, URI, REGION, SERVICE, payload,
      config.AMAZON_ACCESS_KEY, config.AMAZON_SECRET_KEY
    );

    const { data } = await axios.post(`https://${ENDPOINT}${URI}`, payload, {
      headers,
      timeout: 10000,
    });

    const items: unknown[] = data?.SearchResult?.Items ?? [];
    return items.map((item: any) => ({
      id: `amazon_${item.ASIN}`,
      title: item.ItemInfo?.Title?.DisplayValue ?? 'Amazon deal',
      price: item.Offers?.Listings?.[0]?.Price?.Amount ?? 0,
      originalPrice: item.Offers?.Listings?.[0]?.SavingBasis?.Amount ?? undefined,
      url: item.DetailPageURL,
      affiliateUrl: item.DetailPageURL,
      imageUrl: item.Images?.Primary?.Large?.URL ?? undefined,
      store: 'Amazon',
      source: 'amazon' as const,
      createdAt: new Date(),
    }));
  } catch (err) {
    console.error('Erro ao buscar Amazon:', (err as Error).message);
    return [];
  }
}

function signRequest(
  method: string, host: string, uri: string,
  region: string, service: string, payload: string,
  accessKey: string, secretKey: string
): Record<string, string> {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateOnly = dateStr.slice(0, 8);

  const canonicalHeaders =
    `content-encoding:amz-1.0\ncontent-type:application/json; charset=UTF-8\nhost:${host}\n` +
    `x-amz-date:${dateStr}\nx-amz-target:com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems\n`;
  const signedHeaders = 'content-encoding;content-type;host;x-amz-date;x-amz-target';
  const payloadHash = crypto.createHash('sha256').update(payload).digest('hex');
  const canonicalRequest = [method, uri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const credentialScope = `${dateOnly}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256', dateStr, credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const signingKey = getSigningKey(secretKey, dateOnly, region, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  return {
    'content-encoding': 'amz-1.0',
    'content-type': 'application/json; charset=UTF-8',
    host,
    'x-amz-date': dateStr,
    'x-amz-target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems',
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

function getSigningKey(key: string, date: string, region: string, service: string): Buffer {
  const kDate = crypto.createHmac('sha256', `AWS4${key}`).update(date).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
  const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
  return crypto.createHmac('sha256', kService).update('aws4_request').digest();
}
