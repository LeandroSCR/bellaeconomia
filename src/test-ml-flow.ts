import 'dotenv/config';
import { resolveMLSocialUrl, generateMLAffiliateLink } from './deals/providers/mercadolivre-headless';

// URL social do tipo que os grupos fonte enviam
const SOCIAL_URL = 'https://www.mercadolivre.com.br/social/thautec?matt_word=luc';

async function main() {
  console.log('=== Simulação completa do fluxo ML (/social/ → produto → afiliado) ===\n');

  console.log('── PASSO 1: resolveMLSocialUrl (Puppeteer + ML session) ──');
  console.log('Entrada:', SOCIAL_URL);
  const productUrl = await resolveMLSocialUrl(SOCIAL_URL);

  if (!productUrl) {
    console.log('❌ Não foi possível extrair URL de produto do link /social/');
    console.log('   Possível causa: link é de loja genérica sem produto identificável');
    process.exit(0);
  }

  console.log('✅ URL do produto:', productUrl);
  console.log();

  console.log('── PASSO 2: generateMLAffiliateLink (linkbuilder) ──');
  const affiliateLink = await generateMLAffiliateLink(productUrl);
  if (affiliateLink) {
    console.log('✅ Link afiliado gerado:', affiliateLink);
    console.log('\nResultado final na mensagem:');
    console.log(`  ${SOCIAL_URL}  →  ${affiliateLink}`);
  } else {
    console.log('❌ Linkbuilder recusou a URL do produto');
  }
}

main().catch(e => { console.error('Erro:', e.message); process.exit(1); });
