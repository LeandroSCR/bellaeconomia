import 'dotenv/config';
import { replaceAffiliateLinks } from './whatsapp/forwarder';

const testUrl = 'https://meli.la/1FYsk3m';
const msg = `Varal De Chão Abas Slim Dobrável Retrátil Aço Reforçado Mor

🔥 R$ 79 (ou 12x de R$7,80)
🏷️ Cupom: ESQUENTA7D07DECOR

🛒Compre aqui: ${testUrl}`;

async function main() {
  console.log('=== Teste ML Social ===');
  console.log('Entrada:', msg);
  console.log('');

  const resultado = await replaceAffiliateLinks(msg);

  console.log('');
  console.log('=== RESULTADO ===');
  if (resultado === null) {
    console.log('DESCARTADO (null) — link não substituível');
  } else if (resultado === msg) {
    console.log('SEM ALTERAÇÃO — link mantido original');
  } else {
    console.log('SUCESSO — link substituído:');
    console.log(resultado);
  }

  process.exit(0);
}

main().catch(err => { console.error('Erro:', err.message); process.exit(1); });
