import 'dotenv/config';
import { config } from './config';
import { generateShopeeShortLink } from './deals/providers/shopee';
import { replaceAffiliateLinks } from './whatsapp/forwarder';

const msg = `🔥 Gabinete Gamer Mancer CV700L, Mid Tower, Lateral De Vidro, 3 Fans ARGB

💵 R$ 198
🎟️ Cupom: PLACAR50
https://s.shopee.com.br/9AMWIfLb4S`;

async function main() {
  console.log('=== Teste Shopee ===\n');

  console.log('[1] Credenciais:');
  console.log('  APP_ID:', config.SHOPEE_APP_ID ? 'OK' : 'AUSENTE');
  console.log('  SECRET:', config.SHOPEE_SECRET ? 'OK' : 'AUSENTE');
  console.log('  AFFILIATE_ID:', config.SHOPEE_AFFILIATE_ID ? 'OK' : 'AUSENTE');
  console.log('');

  console.log('[2] generateShopeeShortLink (link encurtado s.shopee.com.br)...');
  try {
    const link = await generateShopeeShortLink('https://s.shopee.com.br/9AMWIfLb4S');
    console.log('  Resultado:', link ?? 'null');
  } catch (err) {
    console.log('  ERRO:', (err as Error).message);
  }
  console.log('');

  console.log('[3] replaceAffiliateLinks com mensagem completa...');
  const resultado = await replaceAffiliateLinks(msg);
  console.log('');
  if (resultado === null) console.log('RESULTADO: DESCARTADO');
  else if (resultado === msg) console.log('RESULTADO: SEM ALTERACAO — link nao substituido');
  else { console.log('RESULTADO: SUCESSO:\n'); console.log(resultado); }

  process.exit(0);
}

main().catch(err => { console.error('Erro:', err.message); process.exit(1); });
