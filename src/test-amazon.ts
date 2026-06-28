import 'dotenv/config';
import axios from 'axios';
import { replaceAffiliateLinks } from './whatsapp/forwarder';

const URL_TESTE = 'https://link.amazon/B0apxbaNZ';

const msg = `Armani Code Parfum, Giorgio Armani 125ml

🔥 R$ 586,73 em até 11x s/juros
🏷️Cupom: BRASILHOJE - resgate no anúncio

🛒Compre aqui: ${URL_TESTE}`;

async function main() {
  console.log('=== Teste Amazon Debug ===\n');

  // Passo 1: ver para onde o link redireciona
  console.log('[1] Resolvendo redirect de:', URL_TESTE);
  try {
    const r = await axios.get(URL_TESTE, {
      maxRedirects: 10,
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    const finalUrl: string = (r.request as any)?.res?.responseUrl ?? URL_TESTE;
    console.log('[1] URL final após redirect:', finalUrl);
    console.log('[1] Contém amazon.com:', finalUrl.includes('amazon.com'));

    // Passo 2: tentar montar URL com tag
    try {
      const parsed = new URL(finalUrl);
      console.log('[2] URL parsed — hostname:', parsed.hostname);
      console.log('[2] pathname:', parsed.pathname);
    } catch (e) {
      console.log('[2] ERRO ao fazer new URL():', (e as Error).message);
    }
  } catch (err) {
    console.log('[1] ERRO no redirect:', (err as Error).message);
  }

  console.log('');
  console.log('[3] Passando pelo replaceAffiliateLinks...');
  const resultado = await replaceAffiliateLinks(msg);

  console.log('');
  console.log('=== RESULTADO ===');
  if (resultado === null) {
    console.log('DESCARTADO (null) — promoção não encaminhada');
  } else if (resultado === msg) {
    console.log('SEM ALTERAÇÃO — link original mantido');
  } else {
    console.log('SUCESSO — mensagem com link substituído:');
    console.log(resultado);
  }

  process.exit(0);
}

main().catch(err => { console.error('Erro fatal:', err.message); process.exit(1); });
