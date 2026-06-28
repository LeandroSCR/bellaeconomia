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
  const b = await puppeteerExtra.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  }) as unknown as Browser;

  const page = await b.newPage() as unknown as Page;
  await page.setViewport({ width: 1280, height: 900 });

  // Carrega sessão
  if (fs.existsSync(SESSION_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
    await (page as any).setCookie(...cookies);
    console.log('Sessão carregada');
  }

  const url = 'https://www.mercadolivre.com.br/social/thautec?matt_word=lucasthautec&matt_tool=30765415&forceInApp=';
  console.log('Abrindo:', url);
  await (page as any).goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  console.log('URL:', (page as any).url());
  console.log('Título:', await (page as any).title());

  // Scroll agressivo
  for (let i = 0; i < 5; i++) {
    await (page as any).evaluate(`window.scrollTo(0, ${(i + 1) * 800})`);
    await new Promise(r => setTimeout(r, 1000));
  }

  // Todos os hrefs
  const allHrefs = await (page as any).evaluate(`
    Array.from(document.querySelectorAll('a[href]'))
      .map(a => a.href)
      .filter(h => h.includes('mercadolivre'))
      .filter((v, i, arr) => arr.indexOf(v) === i)
  `) as string[];
  console.log('\n--- TODOS OS HREFS DO ML ---');
  allHrefs.forEach((h, i) => console.log(`[${i}] ${h.slice(0, 120)}`));

  // Procura por texto de preço
  const priceEls = await (page as any).evaluate(`
    Array.from(document.querySelectorAll('*'))
      .filter(e => /R\\$\\s*[\\d.,]+/.test(e.textContent || '') && e.children.length === 0)
      .slice(0, 10)
      .map(e => ({ tag: e.tagName, text: (e.textContent || '').trim().slice(0, 80) }))
  `) as Array<{ tag: string; text: string }>;
  console.log('\n--- ELEMENTOS COM PREÇO ---');
  priceEls.forEach((e, i) => console.log(`[${i}] <${e.tag}> "${e.text}"`));

  // Dump do HTML principal
  const html = await (page as any).evaluate('document.body.innerHTML') as string;
  const htmlFile = path.join(process.cwd(), 'data', 'social-page-dump.html');
  fs.writeFileSync(htmlFile, html);
  console.log(`\nHTML salvo em: ${htmlFile} (${html.length} chars)`);

  await b.close();
  process.exit(0);
}

main().catch(err => { console.error(err.message); process.exit(1); });
