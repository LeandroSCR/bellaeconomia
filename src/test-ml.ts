import 'dotenv/config';
import { generateMLAffiliateLink } from './deals/providers/mercadolivre-headless';

const TEST_URL = 'https://www.mercadolivre.com.br/p/MLB20641708?attributes=COLOR:MLB20641708&matt_tool=38524122&pdp_filters=item_id:MLB4784907061&ua=jx3knUszBOWSh76iz79OKrVFKFC2d1gQ9kXIfaxKbxMQX_GQ#origin=share&sid=share&wid=MLB4784907061&action=whatsapp';

async function main() {
  console.log('=== Teste ML - Geração de link afiliado ===');
  console.log('URL:', TEST_URL, '\n');

  const link = await generateMLAffiliateLink(TEST_URL);

  if (link) {
    console.log('\n✅ SUCESSO! Link afiliado gerado:');
    console.log(link);
  } else {
    console.log('\n❌ FALHOU — verifique os logs acima');
  }

  process.exit(link ? 0 : 1);
}

main().catch(err => { console.error('Erro:', err.message); process.exit(1); });
