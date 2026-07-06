// ══════════════════════════════════════════════════════════════════════════
// CAMADA COMPARTILHADA — política de URLs permitidas em repasses
//
// Só temos afiliação em Shopee, Amazon e Mercado Livre. Mensagem com link de
// qualquer outra LOJA é descartada inteira — nunca repassamos venda alheia.
// Links "inofensivos" (grupos, redes sociais) são tolerados no texto.
// ══════════════════════════════════════════════════════════════════════════

/** Domínios das plataformas afiliadas (inclui encurtadores oficiais). */
const AFFILIATE_HOSTS = [
  'amazon.com.br', 'amazon.com', 'amzn.to', 'link.amazon',
  'shopee.com.br', 's.shopee.com.br', 'shope.ee',
  'mercadolivre.com.br', 'mercadol.com.br', 'meli.la',
];

/** Domínios tolerados no texto (não são loja — não geram venda perdida). */
const HARMLESS_HOSTS = [
  'chat.whatsapp.com', 'wa.me', 'whatsapp.com',
  't.me', 'telegram.me',
  'instagram.com', 'youtube.com', 'youtu.be', 'tiktok.com',
  'x.com', 'twitter.com', 'facebook.com',
];

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export type UrlClass = 'affiliate' | 'harmless' | 'foreign';

/** Classifica uma URL: afiliada, inofensiva ou de loja estranha (foreign). */
export function classifyUrl(url: string): UrlClass {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return 'foreign'; // URL malformada — não confiar
  }
  if (AFFILIATE_HOSTS.some(d => hostMatches(host, d))) return 'affiliate';
  if (HARMLESS_HOSTS.some(d => hostMatches(host, d))) return 'harmless';
  // Encurtadores genéricos (bit.ly etc.) podem apontar para qualquer loja —
  // tratados como estranhos por segurança.
  return 'foreign';
}

/** Retorna as URLs de loja estranha presentes no texto (vazio = texto limpo). */
export function findForeignStoreUrls(urls: string[]): string[] {
  return urls.filter(u => classifyUrl(u) === 'foreign');
}
