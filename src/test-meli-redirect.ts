import 'dotenv/config';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';

puppeteerExtra.use(StealthPlugin());
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SESSION_FILE = path.join(process.cwd(), 'data', 'ml-session.json');

async function main() {
  const melila = 'https://meli.la/29pTCo6';

  const b = await puppeteerExtra.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  }) as unknown as Browser;

  const page = (await b.newPage()) as unknown as Page;
  await (page as any).setViewport({ width: 1280, height: 900 });

  await (page as any).setViewport({ width: 1280, height: 900 });

  // Carrega sessão ML
  if (fs.existsSync(SESSION_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
    await (page as any).setCookie(...cookies);
    console.log('Sessão ML carregada');
  } else {
    console.log('Sem sessão ML');
  }

  console.log('\n[TESTE] Abrindo meli.la com UA mobile (com sessão):', melila);
  await (page as any).goto(melila, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  const finalUrl: string = (page as any).url();
  const title: string = await (page as any).title();
  console.log('URL final:', finalUrl);
  console.log('Título:', title);

  // Se ainda for /social/, rolar a página inteira e listar TODOS os produtos
  if (finalUrl.includes('/social/')) {
    console.log('\n[TESTE] Ainda em /social/ — rolando a página para carregar todos os produtos...');

    // Rola em passos para garantir lazy-load completo
    for (let y = 400; y <= 5000; y += 800) {
      await (page as any).evaluate(`window.scrollTo(0, ${y})`);
      await new Promise(r => setTimeout(r, 1000));
    }
    await new Promise(r => setTimeout(r, 2000));

    const allLinks: string[] = await (page as any).evaluate(`
      (function() {
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        return anchors
          .map(a => a.href)
          .filter(h =>
            /produto\\.mercadolivre\\.com\\.br\\/MLB-/.test(h) ||
            /mercadolivre\\.com\\.br\\/[^/]+-MLB/.test(h) ||
            /mercadolivre\\.com\\.br\\/[^?#]+\\/p\\/MLB/.test(h)
          )
          .map(h => h.split('?')[0].split('#')[0])
          .filter((v, i, arr) => arr.indexOf(v) === i);
      })()
    `);

    console.log('Total de produtos unicos na pagina: ' + allLinks.length);
    allLinks.forEach((l, i) => console.log('  [' + i + '] ' + l.slice(0, 110)));

    // Verifica se "varal" aparece em algum link
    const varalLinks = allLinks.filter(l => l.toLowerCase().includes('varal'));
    console.log('Links com varal: ' + (varalLinks.length ? varalLinks.join('\n') : 'Nenhum'));
  }

  await b.close();
  process.exit(0);
}

main().catch(err => { console.error('Erro:', err.message); process.exit(1); });
