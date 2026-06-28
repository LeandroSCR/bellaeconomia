import 'dotenv/config';
import axios from 'axios';
import crypto from 'crypto';
import { config } from './config';

function shopeeSign(timestamp: number, body: string): string {
  const factor = `${config.SHOPEE_APP_ID}${timestamp}${body}${config.SHOPEE_SECRET}`;
  return crypto.createHash('sha256').update(factor).digest('hex');
}

function shopeeAuthHeader(timestamp: number, body: string): string {
  const sig = shopeeSign(timestamp, body);
  return `SHA256 Credential=${config.SHOPEE_APP_ID}, Timestamp=${timestamp}, Signature=${sig}`;
}

async function main() {
  console.log('=== Teste comissão Shopee ===\n');

  const timestamp = Math.floor(Date.now() / 1000);

  // Pede todos os campos prováveis de comissão — a API ignora campos inexistentes
  const query = `{
    productOfferV2(limit: 5) {
      nodes {
        itemId
        productName
        priceMin
        priceMax
        commissionRate
        sellerCommissionRate
        shopeeCommissionRate
        offerLink
        shopName
        ratingStar
        sales
      }
    }
  }`;

  const bodyStr = JSON.stringify({ query });

  try {
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
      console.error('Erro da API:', JSON.stringify(data.errors, null, 2));
      process.exit(1);
    }

    const nodes = data?.data?.productOfferV2?.nodes ?? [];
    console.log(`${nodes.length} produto(s) retornado(s):\n`);

    for (const item of nodes) {
      console.log('─────────────────────────────');
      console.log('Produto   :', item.productName?.slice(0, 60));
      console.log('Preço     : R$', item.priceMin, '→ R$', item.priceMax);
      console.log('Loja      :', item.shopName);
      console.log('Rating    :', item.ratingStar);
      console.log('Vendas    :', item.sales);
      console.log('Comissão  :', item.commissionRate);
      console.log('  seller  :', item.sellerCommissionRate);
      console.log('  shopee  :', item.shopeeCommissionRate);
    }

    console.log('\n=== Resposta bruta (primeiro item) ===');
    console.log(JSON.stringify(nodes[0], null, 2));

  } catch (err) {
    console.error('Erro HTTP:', (err as Error).message);
  }

  process.exit(0);
}

main();
