import axios from 'axios';
import { config } from '../config';
import { generateShopeeShortLink } from '../deals/providers/shopee';
import { generateMLAffiliateLink, resolveMLSocialUrl } from '../deals/providers/mercadolivre-headless';
import { findForeignStoreUrls } from '../shared/urlPolicy';
import { normalizeStylized, isCampaignHeader } from '../shared/adExtractor';
import { recordActivity } from '../metrics';

const STOP_WORDS = new Set(['de', 'da', 'do', 'em', 'no', 'na', 'com', 'para', 'por', 'um', 'uma', 'os', 'as', 'e', 'ou', 'ao', 'dos', 'das', 'nos', 'nas', 'que']);

function extractProductKeywords(text: string): string[] {
  // Pega a primeira linha não-vazia que parece ser o título do produto
  // (normaliza unicode estilizado e pula cabeçalhos de campanha tipo "Oferta Prime Day")
  const titleLine = normalizeStylized(text).split('\n').map(l => l.trim())
    .find(l => l.length > 5 && !/^[🔥🏷💰🛒💸🎁✅🔗📦👉]/.test(l) && !/^R\$/.test(l) && !isCampaignHeader(l));
  if (!titleLine) return [];
  const normalized = titleLine
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.split(' ').filter(w => w.length >= 4 && !STOP_WORDS.has(w));
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const URL_REGEX = /https?:\/\/[^\s\])"'>]+/g;

// Domínios por plataforma — só processa se a credencial correspondente estiver configurada
const AFFILIATE_DOMAINS: { domains: string[]; enabled: () => boolean }[] = [
  {
    domains: ['amazon.com.br', 'amzn.to', 'link.amazon'],
    enabled: () => !!config.AMAZON_PARTNER_TAG,
  },
  {
    domains: ['shopee.com.br', 's.shopee.com.br', 'shope.ee'],
    enabled: () => !!(config.SHOPEE_APP_ID && config.SHOPEE_SECRET),
  },
  {
    domains: ['mercadolivre.com.br', 'mercadol.com.br', 'meli.la'],
    enabled: () => !!(config.ML_AFFILIATE_EMAIL && config.ML_AFFILIATE_PASSWORD),
  },
];

function isAffiliateUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return AFFILIATE_DOMAINS.some(p => p.enabled() && p.domains.some(d => lower.includes(d)));
}

// Resolve um short link (amzn.to, shope.ee, etc.) até a URL final
async function resolveRedirect(url: string): Promise<string> {
  const r = await axios.get(url, {
    maxRedirects: 10,
    timeout: 15000,
    headers: { 'User-Agent': USER_AGENT },
  });
  return (r.request as any)?.res?.responseUrl ?? url;
}

// Segue apenas os headers de redirect (sem baixar o body) para verificar a URL final
async function resolveRedirectFast(url: string): Promise<string> {
  const r = await axios.head(url, {
    maxRedirects: 10,
    timeout: 10000,
    headers: { 'User-Agent': USER_AGENT },
  });
  return (r.request as any)?.res?.responseUrl ?? url;
}

async function verifyShopeeAffiliate(shortLink: string): Promise<boolean> {
  const finalUrl = await resolveRedirectFast(shortLink);
  const appId = config.SHOPEE_APP_ID;
  return finalUrl.includes(`mmp_pid=an_${appId}`) || finalUrl.includes('utm_medium=affiliates');
}

// Substitui todos os links de afiliado no texto pelos nossos próprios links.
// Retorna null quando a mensagem deve ser descartada (ex: link /social/ com múltiplos produtos).
export async function replaceAffiliateLinks(text: string): Promise<string | null> {
  const urls = text.match(URL_REGEX);
  if (!urls) return null;

  const hasAffiliate = urls.some(isAffiliateUrl);
  if (!hasAffiliate) {
    console.log('[FORWARDER] Nenhum link de afiliado encontrado — promoção descartada');
    return null;
  }

  // Mensagem com link de loja NÃO afiliada (Kabum, Magalu, etc.) é descartada
  // inteira — trocar só os nossos links deixaria a venda alheia passar junto.
  const foreignUrls = findForeignStoreUrls(urls);
  if (foreignUrls.length > 0) {
    console.log(`[FORWARDER] Link de loja não afiliada (${foreignUrls[0].slice(0, 50)}) — promoção descartada`);
    recordActivity({ type: 'filtered', message: `Loja não afiliada: ${foreignUrls[0].slice(0, 60)}` });
    return null;
  }

  let result = text;
  let drop = false;

  for (const url of urls) {
    const lower = url.toLowerCase();

    try {
      // ── Amazon ─────────────────────────────────────────────────────────────
      const isAmazonShort = lower.includes('amzn.to') || lower.includes('link.amazon');
      if (lower.includes('amazon.com.br') || isAmazonShort) {
        if (!config.AMAZON_PARTNER_TAG) {
          console.log('[FORWARDER] Amazon: AMAZON_PARTNER_TAG não configurado — promoção descartada');
          recordActivity({ type: 'error', message: 'AMAZON_PARTNER_TAG não configurado', source: 'amazon' });
          drop = true;
          continue;
        }

        try {
          let target = url;
          if (isAmazonShort) {
            console.log(`[FORWARDER] Amazon: resolvendo short link ${url.slice(0, 50)}...`);
            target = await resolveRedirect(url);
            console.log(`[FORWARDER] Amazon: resolveu para ${target.slice(0, 80)}`);
          }

          if (!target.includes('amazon.com')) {
            console.log(`[FORWARDER] Amazon: redirect foi para URL não-Amazon (${target.slice(0, 60)}) — descartado`);
            recordActivity({ type: 'error', message: 'Link Amazon redirecionou para URL inválida', source: 'amazon' });
            drop = true;
            continue;
          }

          const parsed = new URL(target);
          // Monta URL limpa: apenas origin + path + tag (remove todos os params de tracking)
          const cleanUrl = `${parsed.origin}${parsed.pathname}?tag=${config.AMAZON_PARTNER_TAG}`;
          result = result.replace(url, cleanUrl);
          console.log(`[FORWARDER] Amazon link limpo: ${cleanUrl}`);
        } catch (err) {
          const msg = (err as Error).message;
          console.log(`[FORWARDER] Amazon: erro ao processar link — ${msg}`);
          recordActivity({ type: 'error', message: `Amazon: ${msg.slice(0, 60)}`, source: 'amazon' });
          drop = true;
        }
        continue;
      }

      // ── Shopee ─────────────────────────────────────────────────────────────
      if (
        lower.includes('shopee.com.br') ||
        lower.includes('s.shopee.com.br') ||
        lower.includes('shope.ee')
      ) {
        if (!config.SHOPEE_APP_ID || !config.SHOPEE_SECRET) continue;

        // Resolve short links de terceiro para pegar a URL limpa do produto
        let productUrl = url;
        if (lower.includes('s.shopee.com.br') || lower.includes('shope.ee')) {
          productUrl = await resolveRedirect(url);
        }

        // Remove parâmetros de tracking de quem postou
        const parsed = new URL(productUrl);
        const cleanUrl = `${parsed.origin}${parsed.pathname}`;

        const shortLink = await generateShopeeShortLink(cleanUrl);
        if (!shortLink) {
          console.log(`[FORWARDER] Shopee: falhou em gerar link — promoção descartada`);
          recordActivity({ type: 'error', message: 'Shopee: falha ao gerar link afiliado', source: 'shopee' });
          drop = true;
          continue;
        }

        const isAffiliated = await verifyShopeeAffiliate(shortLink);
        if (!isAffiliated) {
          console.log(`[FORWARDER] Shopee: link gerado SEM tag de afiliado — promoção descartada`);
          recordActivity({ type: 'error', message: `Shopee: link sem tag de afiliado (${shortLink})`, source: 'shopee' });
          drop = true;
          continue;
        }

        result = result.replace(url, shortLink);
        console.log(`[FORWARDER] Shopee link re-afiliado e verificado`);
        continue;
      }

      // ── MercadoLivre ───────────────────────────────────────────────────────
      // Usa headless Chrome (linkbuilder) para gerar link meli.la afiliado.
      if (
        lower.includes('mercadolivre.com.br') ||
        lower.includes('mercadol.com.br') ||
        lower.includes('meli.la')
      ) {
        if (!config.ML_AFFILIATE_EMAIL || !config.ML_AFFILIATE_PASSWORD) {
          console.log('[FORWARDER] ML: credenciais nao configuradas, link repassado sem alteração');
          continue;
        }

        // Extrai palavras-chave do texto da promoção para identificar o produto correto
        const productKeywords = extractProductKeywords(text);
        if (productKeywords.length > 0) {
          console.log(`[FORWARDER] ML: hint de produto extraído: [${productKeywords.join(', ')}]`);
        }

        // Resolve short links e URLs sociais do ML para a URL real do produto.
        let productUrl = url;
        if (lower.includes('mercadolivre.com.br/social/')) {
          // /social/ usa redirect JS — precisa do Puppeteer para seguir
          console.log('[FORWARDER] ML: URL /social/ detectada, resolvendo via browser...');
          const resolved = await resolveMLSocialUrl(url, productKeywords);
          if (!resolved) {
            console.log('[FORWARDER] ML: produto nao identificavel no /social/ — promoção descartada');
            drop = true;
            continue;
          }
          productUrl = resolved;
        } else if (lower.includes('mercadol.com.br') || lower.includes('meli.la')) {
          productUrl = await resolveRedirect(url);
          console.log(`[FORWARDER] ML: URL resolvida para ${productUrl.slice(0, 80)}`);

          // meli.la pode resolver para /social/ — nesse caso precisa do Puppeteer
          if (productUrl.includes('mercadolivre.com.br/social/')) {
            console.log('[FORWARDER] ML: meli.la resolveu para /social/ — processando via browser...');
            const resolved = await resolveMLSocialUrl(productUrl, productKeywords);
            if (!resolved) {
              console.log('[FORWARDER] ML: produto nao identificavel no /social/ — promoção descartada');
              drop = true;
              continue;
            }
            productUrl = resolved;
          }
        }

        // resolveMLSocialUrl pode retornar link meli.la pronto (via Compartilhar) — usa direto
        if (productUrl.includes('meli.la/') || productUrl.includes('mercadol.com.br/')) {
          result = result.replace(url, productUrl);
          console.log(`[FORWARDER] ML: link afiliado via Compartilhar: ${productUrl.slice(0, 80)}`);
          continue;
        }

        // Só processa se for URL do ML após resolução
        if (!productUrl.includes('mercadolivre.com.br')) continue;

        const affiliateLink = await generateMLAffiliateLink(productUrl);
        if (affiliateLink) {
          result = result.replace(url, affiliateLink);
          console.log(`[FORWARDER] ML: link afiliado gerado (${affiliateLink})`);
        } else {
          console.log(`[FORWARDER] ML: produto nao permitido ou erro — promoção descartada`);
          drop = true;
        }
      }
    } catch (err) {
      console.log(`[FORWARDER] erro ao processar ${url.slice(0, 50)}: ${(err as Error).message}`);
    }
  }

  if (drop) return null;
  return result;
}
