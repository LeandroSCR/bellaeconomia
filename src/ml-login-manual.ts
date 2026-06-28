import 'dotenv/config';
import { doManualLogin } from './deals/providers/mercadolivre-headless';

async function main() {
  console.log('======================================');
  console.log('  Login Manual - MercadoLivre Afiliados');
  console.log('======================================');
  console.log('O Chrome vai abrir. Faça o login normalmente,');
  console.log('incluindo o reCAPTCHA. O bot detecta quando terminar.\n');

  const ok = await doManualLogin();

  if (ok) {
    console.log('\n✅ Sessao salva! O bot vai usar esses cookies automaticamente.');
    console.log('Você não precisa fazer login de novo por semanas/meses.');
  } else {
    console.log('\n❌ Login não detectado. Tente novamente.');
  }

  process.exit(ok ? 0 : 1);
}

main().catch(err => { console.error('Erro:', err.message); process.exit(1); });
