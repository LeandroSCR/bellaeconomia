import 'dotenv/config';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';

puppeteerExtra.use(StealthPlugin());
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SESSION_FILE = path.join(process.cwd(), 'data', 'ml-session.json');

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

async function main() {
  const b = await puppeteerExtra.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  }) as unknown as Browser;

  const page = (await b.newPage()) as unknown as Page;
  await (page as any).setUserAgent(MOBILE_UA);
  await (page as any).setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  if (fs.existsSync(SESSION_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
    await (page as any).setCookie(...cookies);
    console.log('Sessão carregada');
  }

  const url = 'https://www.mercadolivre.com.br/social/thautec?matt_word=lucasthautec&matt_tool=30765415&forceInApp=';
  console.log('Abrindo (mobile UA):', url);
  await (page as any).goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  console.log('URL:', (page as any).url());
  console.log('Título:', await (page as any).title());

  // Scroll
  await (page as any).evaluate('window.scrollTo(0, 300)');
  await new Promise(r => setTimeout(r, 1500));

  // Todos os botões
  const buttons = await (page as any).evaluate(
    'Array.from(document.querySelectorAll("button")).map(e => ({ text: (e.textContent||"").trim().slice(0,80), cls: e.className.slice(0,80) }))'
  ) as Array<{ text: string; cls: string }>;
  console.log('\n--- BUTTONS (mobile) ---');
  buttons.forEach((b, i) => console.log('  [' + i + '] "' + b.text + '" class="' + b.cls + '"'));

  // Links curtos
  const links = await (page as any).evaluate(
    'Array.from(document.querySelectorAll("a")).filter(e => { const t=(e.textContent||"").trim(); return t.length>0 && t.length<80; }).slice(0,20).map(e => ({ text:(e.textContent||"").trim(), href:(e.href||"").slice(0,80) }))'
  ) as Array<{ text: string; href: string }>;
  console.log('\n--- LINKS CURTOS (mobile) ---');
  links.forEach((l, i) => console.log('  [' + i + '] "' + l.text + '" href="' + l.href + '"'));

  await (page as any).screenshot({ path: 'data/social-mobile.png', fullPage: false });
  console.log('\nScreenshot: data/social-mobile.png');

  await b.close();
  process.exit(0);
}

main().catch(err => { console.error(err.message); process.exit(1); });
