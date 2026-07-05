import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { config } from '../../config';

puppeteerExtra.use(StealthPlugin());

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SESSION_FILE = path.join(process.cwd(), 'data', 'ml-session.json');
const DATA_DIR = path.join(process.cwd(), 'data');
const AFFILIATE_URL = 'https://www.mercadolivre.com.br/afiliados';
const LINKBUILDER_URL = 'https://www.mercadolivre.com.br/afiliados/linkbuilder';

let browser: Browser | null = null;

async function getBrowser(headless = true): Promise<Browser> {
  if (headless && browser?.connected) return browser;
  const b = await puppeteerExtra.launch({
    executablePath: CHROME_PATH,
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  }) as unknown as Browser;
  if (headless) browser = b;
  return b;
}

async function loadSession(page: Page): Promise<boolean> {
  try {
    const raw = await fs.promises.readFile(SESSION_FILE, 'utf-8');
    const cookies = JSON.parse(raw);
    await page.setCookie(...cookies);
    return true;
  } catch { return false; }
}

async function saveSession(page: Page): Promise<void> {
  try {
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    await fs.promises.writeFile(SESSION_FILE, JSON.stringify(await page.cookies(), null, 2));
  } catch {}
}

async function isLoggedIn(page: Page): Promise<boolean> {
  await page.goto(AFFILIATE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  const url = page.url();
  return url.includes('afiliados') && !url.includes('login') && !url.includes('lgz');
}

async function doLoginHeadless(page: Page): Promise<boolean> {
  if (!config.ML_AFFILIATE_EMAIL || !config.ML_AFFILIATE_PASSWORD) return false;

  console.log('[ML-HEADLESS] Tentando login automatico...');
  await page.goto(AFFILIATE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  try {
    await page.waitForSelector('#user_id', { timeout: 10000 });
    await page.type('#user_id', config.ML_AFFILIATE_EMAIL, { delay: 80 });
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 3000));

    const urlAfterEmail = page.url();
    if (urlAfterEmail.includes('recaptcha') || urlAfterEmail.includes('captcha')) {
      console.log('[ML-HEADLESS] reCAPTCHA detectado');
      return false;
    }

    await page.waitForSelector('#password, input[type="password"]', { timeout: 10000 });
    const passField = await page.$('#password') ?? await page.$('input[type="password"]');
    if (!passField) return false;
    await passField.type(config.ML_AFFILIATE_PASSWORD, { delay: 80 });
    await page.keyboard.press('Enter');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));

    const ok = await isLoggedIn(page);
    if (ok) await saveSession(page);
    return ok;
  } catch (err) {
    console.error('[ML-HEADLESS] Login falhou:', (err as Error).message);
    return false;
  }
}

export async function doManualLogin(): Promise<boolean> {
  console.log('\n[ML-HEADLESS] Abrindo Chrome para login manual...');
  console.log('[ML-HEADLESS] Complete o login no Chrome. O bot detecta automaticamente quando terminar.\n');

  const b = await getBrowser(false);
  const page = await b.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(AFFILIATE_URL, { waitUntil: 'networkidle2', timeout: 30000 });

  let loggedIn = false;
  const start = Date.now();
  while (Date.now() - start < 180_000) {
    await new Promise(r => setTimeout(r, 3000));
    const url = page.url();
    if (url.includes('afiliados') && !url.includes('login') && !url.includes('lgz')) {
      loggedIn = true;
      break;
    }
  }

  if (loggedIn) {
    await saveSession(page);
    console.log('[ML-HEADLESS] Login concluido! Sessao salva.');
  } else {
    console.log('[ML-HEADLESS] Timeout ou login nao detectado.');
  }

  await b.close();
  return loggedIn;
}

// Injeta URL num textarea React sem perder o estado do componente
async function setReactTextarea(page: Page, selector: string, value: string): Promise<void> {
  await page.evaluate(`
    (function() {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return;
      const nativeSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
      nativeSetter?.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `);
}

// Normaliza texto para comparação com slugs de URL do ML (sem acentos, minúsculo, só alfanumérico)
function normalizeToSlug(text: string): string {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extrai palavras-chave relevantes do nome do produto (ignora palavras curtas/genéricas)
function extractKeywords(productName: string): string[] {
  const stopWords = new Set(['de', 'da', 'do', 'em', 'no', 'na', 'com', 'para', 'por', 'um', 'uma', 'os', 'as', 'e', 'ou']);
  return normalizeToSlug(productName)
    .split(' ')
    .filter(w => w.length >= 4 && !stopWords.has(w));
}

// Gera link afiliado a partir de uma URL /social/ do ML.
// productHint: palavras-chave do produto esperado (para evitar pegar produto errado da página social).
export async function resolveMLSocialUrl(socialUrl: string, productHint?: string[]): Promise<string | null> {
  let page: Page | null = null;
  try {
    const b = await getBrowser();
    page = await b.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // Carrega sessão ML (obrigatório para o link afiliado via Compartilhar)
    const hadSession = await loadSession(page);
    if (!hadSession) {
      const ok = await doLoginHeadless(page);
      if (!ok) { console.log('[ML-HEADLESS] Sem sessão ML válida'); return null; }
    } else {
      const ok = await isLoggedIn(page);
      if (!ok) {
        const loginOk = await doLoginHeadless(page);
        if (!loginOk) { console.log('[ML-HEADLESS] Sessão expirada e relogin falhou'); return null; }
      }
    }

    // ── PASSO 1: Abrir o link /social/ ──────────────────────────────────────
    console.log(`[ML-HEADLESS][1] Abrindo: ${socialUrl.slice(0, 100)}`);
    await page.goto(socialUrl, { waitUntil: 'networkidle2', timeout: 25000 });
    await new Promise(r => setTimeout(r, 2000));

    const urlApos1 = page.url();
    console.log(`[ML-HEADLESS][1] URL após load: ${urlApos1.slice(0, 100)}`);
    console.log(`[ML-HEADLESS][1] Título: ${await page.title()}`);

    // Se já redirecionou direto para o produto, pula o clique
    if (!urlApos1.includes('/social/') && urlApos1.includes('mercadolivre.com.br')) {
      console.log(`[ML-HEADLESS][1] Redirect direto para produto detectado, pulando passo 2`);
    } else {
      // ── PASSO 2: Clicar em "Ir para o Produto" ────────────────────────────
      console.log(`[ML-HEADLESS][2] Buscando botão "Ir para o Produto"...`);

      // Rola para baixo para carregar o produto em destaque (lazy-loaded)
      await page.evaluate('window.scrollTo(0, 400)');
      await new Promise(r => setTimeout(r, 2000));

      // Rola a página inteira para carregar todos os produtos (lazy-load)
      console.log('[ML-HEADLESS][2] Rolando página para carregar todos os produtos...');
      for (let y = 400; y <= 4000; y += 800) {
        await page.evaluate(`window.scrollTo(0, ${y})`);
        await new Promise(r => setTimeout(r, 700));
      }
      await new Promise(r => setTimeout(r, 1500));

      console.log('[ML-HEADLESS][2] Coletando links de produto...');
      const productLinks = await page.evaluate(`
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
      `) as string[];

      console.log(`[ML-HEADLESS][2] ${productLinks.length} produtos únicos encontrados`);

      if (productLinks.length === 0) {
        console.log('[ML-HEADLESS][2] ERRO: Nenhum produto encontrado na página /social/');
        return null;
      }

      let featuredUrl: string;

      // Se temos hint de produto, procura o link que melhor corresponde ao texto da promoção
      if (productHint && productHint.length > 0) {
        console.log(`[ML-HEADLESS][2] Hint de produto: [${productHint.join(', ')}]`);
        const match = productLinks.find(link => {
          const slug = normalizeToSlug(link);
          return productHint.some(kw => slug.includes(kw));
        });
        if (match) {
          console.log(`[ML-HEADLESS][2] Produto correspondente ao hint: ${match.slice(0, 100)}`);
          featuredUrl = match;
        } else {
          console.log(`[ML-HEADLESS][2] ERRO: Nenhum produto na página corresponde ao hint [${productHint.join(', ')}]`);
          productLinks.slice(0, 5).forEach((l, i) => console.log(`  [${i}] ${l.slice(0, 100)}`));
          return null;
        }
      } else {
        // Sem hint: usa o primeiro produto (comportamento original)
        featuredUrl = productLinks[0];
        console.log(`[ML-HEADLESS][2] Sem hint — usando primeiro produto: ${featuredUrl.slice(0, 100)}`);
      }

      console.log(`[ML-HEADLESS][2] Navegando para: ${featuredUrl.slice(0, 100)}`);
      await page.goto(featuredUrl, { waitUntil: 'networkidle2', timeout: 25000 });
      await new Promise(r => setTimeout(r, 2000));
      console.log(`[ML-HEADLESS][2] URL após navegação: ${page.url().slice(0, 100)}`);
    }

    // ── PASSO 3: Página do produto ───────────────────────────────────────────
    const productUrl = page.url();
    console.log(`[ML-HEADLESS][3] URL do produto: ${productUrl.slice(0, 100)}`);
    console.log(`[ML-HEADLESS][3] Título: ${await page.title()}`);

    if (!productUrl.includes('mercadolivre.com.br') || productUrl.includes('/social/')) {
      console.log('[ML-HEADLESS][3] ERRO: Não chegou a uma página de produto válida');
      return null;
    }

    // ── PASSO 4a: Tentar Compartilhar → Link do produto ─────────────────────
    console.log(`[ML-HEADLESS][4] Buscando botão Compartilhar...`);

    const shareClicked = await page.evaluate(`
      (function() {
        const els = Array.from(document.querySelectorAll('button, a, [role="button"]'));
        const btn = els.find(e => {
          const t = (e.textContent || '').toLowerCase().trim();
          const label = (e.getAttribute('aria-label') || '').toLowerCase();
          return t === 'compartilhar' || label === 'compartilhar' || t.includes('compartilhar');
        });
        if (btn) { btn.click(); return btn.textContent.trim(); }
        return null;
      })()
    `) as string | null;

    console.log(`[ML-HEADLESS][4] Compartilhar: ${shareClicked ?? 'NÃO ENCONTRADO'}`);

    if (shareClicked) {
      await new Promise(r => setTimeout(r, 2000));

      const menuItems = await page.evaluate(`
        (function() {
          const els = Array.from(document.querySelectorAll('button, a, li, [role="menuitem"], [role="option"], span'));
          return els.filter(e => {
            const t = (e.textContent || '').toLowerCase();
            return t.includes('link') || t.includes('copiar') || t.includes('whatsapp');
          }).map(e => (e.textContent || '').trim().slice(0, 50));
        })()
      `) as string[];
      console.log(`[ML-HEADLESS][4] Opções visíveis: ${JSON.stringify(menuItems)}`);

      const linkOptClicked = await page.evaluate(`
        (function() {
          const keywords = ['link do produto', 'copiar link', 'link'];
          const els = Array.from(document.querySelectorAll('button, a, li, [role="menuitem"], [role="option"], span'));
          const el = els.find(e => {
            const t = (e.textContent || '').toLowerCase().trim();
            return keywords.some(k => t === k || t.includes(k));
          });
          if (el) { el.click(); return el.textContent.trim(); }
          return null;
        })()
      `) as string | null;

      console.log(`[ML-HEADLESS][4] "Link do produto": ${linkOptClicked ?? 'NÃO ENCONTRADO'}`);

      if (linkOptClicked) {
        await new Promise(r => setTimeout(r, 2000));

        const sharedLink = await page.evaluate(`
          (function() {
            const fields = Array.from(document.querySelectorAll('input[type="text"], input[readonly], textarea'));
            for (const f of fields) {
              const v = f.value || '';
              if (v.includes('meli.la') || v.includes('mercadolivre.com.br')) return v;
            }
            const dialogs = document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="share"], [class*="copy"]');
            for (const d of dialogs) {
              for (const a of d.querySelectorAll('a[href], input')) {
                const val = a.getAttribute('href') || a.value || '';
                if (val.includes('meli.la') || val.includes('mercadolivre.com.br')) return val;
              }
            }
            return null;
          })()
        `) as string | null;

        console.log(`[ML-HEADLESS][4] Link lido do modal: ${sharedLink ?? 'NENHUM'}`);

        if (sharedLink) {
          console.log(`[ML-HEADLESS][4] SUCESSO via Compartilhar: ${sharedLink.slice(0, 80)}`);
          await saveSession(page);
          return sharedLink;
        }
      }
      await page.keyboard.press('Escape');
    }

    // ── PASSO 4b: Fallback — usa o linkbuilder com a URL do produto ──────────
    console.log('[ML-HEADLESS][4] Compartilhar não retornou link — fallback para linkbuilder');
    return productUrl;
  } catch (err) {
    console.error('[ML-HEADLESS] Erro em resolveMLSocialUrl:', (err as Error).message);
    return null;
  } finally {
    await page?.close();
  }
}

export async function generateMLAffiliateLink(productUrl: string): Promise<string | null> {
  if (!config.ML_AFFILIATE_EMAIL || !config.ML_AFFILIATE_PASSWORD) return null;

  let page: Page | null = null;

  try {
    const b = await getBrowser();
    page = await b.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // Carrega sessão salva
    const hadSession = await loadSession(page);
    if (hadSession) {
      const ok = await isLoggedIn(page);
      if (!ok) {
        console.log('[ML-HEADLESS] Sessao expirada, refazendo login...');
        const loginOk = await doLoginHeadless(page);
        if (!loginOk) {
          console.log('[ML-HEADLESS] Execute: npx tsx src/ml-login-manual.ts');
          return null;
        }
      }
    } else {
      const ok = await doLoginHeadless(page);
      if (!ok) {
        console.log('[ML-HEADLESS] Execute: npx tsx src/ml-login-manual.ts');
        return null;
      }
    }

    // Navega para o gerador de links
    await page.goto(LINKBUILDER_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));

    // Aguarda a textarea de input
    await page.waitForSelector('textarea#url-0', { timeout: 15000 });

    // Descarta cookie banner se aparecer
    try {
      const cookieBtn = await page.$('.cookie-consent-banner-opt-out__action:first-child');
      if (cookieBtn) await cookieBtn.click();
    } catch {}

    // Injeta a URL do produto
    await setReactTextarea(page, 'textarea#url-0', productUrl);
    await new Promise(r => setTimeout(r, 400));

    // Clica no botão "Gerar"
    const clicked = await page.evaluate(
      `(function(){const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.trim()==='Gerar');if(b){b.click();return true;}return false;})()`
    ) as boolean;

    if (!clicked) {
      console.error('[ML-HEADLESS] Botao Gerar nao encontrado');
      return null;
    }

    // Aguarda o resultado aparecer (textarea de output com link ou erro)
    await page.waitForFunction(
      `Array.from(document.querySelectorAll('textarea')).some(t => t.id !== 'url-0' && t.value.length > 0)`,
      { timeout: 15000 }
    );

    // Lê o resultado
    const outputs = await page.evaluate(
      `Array.from(document.querySelectorAll('textarea')).map(e=>({id:e.id,value:e.value}))`
    ) as Array<{ id: string; value: string }>;

    let generatedLink: string | null = null;
    for (const o of outputs) {
      if (o.id !== 'url-0' && o.value && !o.value.startsWith('⚠️')) {
        generatedLink = o.value;
        break;
      }
    }

    if (generatedLink) {
      console.log(`[ML-HEADLESS] Link gerado: ${generatedLink}`);
      await saveSession(page);
    } else {
      const errOutput = outputs.find(o => o.id !== 'url-0' && o.value.startsWith('⚠️'));
      if (errOutput) {
        console.log(`[ML-HEADLESS] URL nao permitida pelo programa ML: ${productUrl.slice(0, 60)}`);
      } else {
        console.log('[ML-HEADLESS] Nenhum resultado gerado');
      }
    }

    return generatedLink;
  } catch (err) {
    console.error('[ML-HEADLESS] Erro:', (err as Error).message);
    return null;
  } finally {
    await page?.close();
  }
}

process.on('exit', () => { try { browser?.close(); } catch {} });
