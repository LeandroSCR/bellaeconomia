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

  const page = (await b.newPage()) as unknown as Page;
  await (page as any).setViewport({ width: 1280, height: 900 });

  if (fs.existsSync(SESSION_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
    await (page as any).setCookie(...cookies);
  }

  const url = 'https://www.mercadolivre.com.br/social/thautec?matt_word=lucasthautec&matt_tool=30765415&forceInApp=';
  await (page as any).goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  await (page as any).evaluate('window.scrollTo(0, 400)');
  await new Promise(r => setTimeout(r, 2500));

  const buttons = await (page as any).evaluate(
    'Array.from(document.querySelectorAll("button")).map(e => ({ text: (e.textContent || "").trim().slice(0,80), cls: e.className.slice(0,80) }))'
  ) as Array<{ text: string; cls: string }>;
  console.log('\n--- TODOS OS BUTTONS ---');
  buttons.forEach((btn, i) => console.log('  [' + i + '] "' + btn.text + '" class="' + btn.cls + '"'));

  const links = await (page as any).evaluate(
    'Array.from(document.querySelectorAll("a")).filter(e => { const t = (e.textContent||"").trim(); return t.length > 0 && t.length < 80; }).map(e => ({ text: (e.textContent||"").trim(), href: (e.href||"").slice(0,80) }))'
  ) as Array<{ text: string; href: string }>;
  console.log('\n--- LINKS COM TEXTO CURTO ---');
  links.forEach((l, i) => console.log('  [' + i + '] "' + l.text + '" href="' + l.href + '"'));

  await (page as any).screenshot({ path: 'data/social-page-scroll.png', fullPage: false });
  console.log('\nScreenshot salvo: data/social-page-scroll.png');

  const html = await (page as any).evaluate('document.body.innerHTML') as string;
  const idx = html.indexOf('para produto');
  if (idx >= 0) {
    console.log('\n--- CONTEXTO "para produto" ---');
    console.log(html.substring(Math.max(0, idx - 300), idx + 300));
  } else {
    console.log('\n"para produto" NAO encontrado no HTML scrolled');
    fs.writeFileSync('data/social-page-scrolled.html', html);
    console.log('HTML salvo para inspeção: data/social-page-scrolled.html (' + html.length + ' chars)');
  }

  await b.close();
  process.exit(0);
}

main().catch(err => { console.error(err.message); process.exit(1); });
