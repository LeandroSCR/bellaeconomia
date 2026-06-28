import 'dotenv/config';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';

puppeteerExtra.use(StealthPlugin());
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function main() {
  const b = await puppeteerExtra.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  }) as unknown as Browser;

  const page = (await b.newPage()) as unknown as Page;
  await (page as any).setViewport({ width: 1280, height: 900 });
  // Sem cookies de sessão — usuário anônimo

  const url = 'https://www.mercadolivre.com.br/social/thautec?matt_word=lucasthautec&matt_tool=30765415&forceInApp=';
  console.log('Abrindo SEM sessão:', url);
  await (page as any).goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  console.log('URL:', (page as any).url());
  console.log('Título:', await (page as any).title());

  await (page as any).evaluate('window.scrollTo(0, 400)');
  await new Promise(r => setTimeout(r, 2000));

  const buttons = await (page as any).evaluate(
    'Array.from(document.querySelectorAll("button")).map(e => ({ text: (e.textContent||"").trim().slice(0,80), cls: e.className.slice(0,80) }))'
  ) as Array<{ text: string; cls: string }>;
  console.log('\n--- BUTTONS (anônimo) ---');
  buttons.forEach((b, i) => console.log('  [' + i + '] "' + b.text + '" cls="' + b.cls.slice(0, 60) + '"'));

  const links = await (page as any).evaluate(
    'Array.from(document.querySelectorAll("a")).filter(e=>{const t=(e.textContent||"").trim();return t.length>0&&t.length<80;}).slice(0,15).map(e=>({text:(e.textContent||"").trim(),href:(e.href||"").slice(0,90)}))'
  ) as Array<{ text: string; href: string }>;
  console.log('\n--- LINKS CURTOS (anônimo) ---');
  links.forEach((l, i) => console.log('  [' + i + '] "' + l.text + '" href="' + l.href + '"'));

  await (page as any).screenshot({ path: 'data/social-anon.png' });
  console.log('\nScreenshot: data/social-anon.png');

  const html = await (page as any).evaluate('document.body.innerHTML') as string;
  const idx = html.indexOf('para produto');
  console.log('"para produto" no HTML:', idx >= 0 ? 'SIM (idx=' + idx + ')' : 'NAO');

  await b.close();
  process.exit(0);
}

main().catch(err => { console.error(err.message); process.exit(1); });
