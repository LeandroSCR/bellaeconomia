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

// Padrões de URL que apontam para UM produto específico. Avaliado sobre o
// texto PROCESSADO (links já trocados): Amazon vem expandida (/dp/...);
// meli.la e s.shopee/shope.ee são gerados por nós — sempre produto único.
const SINGLE_PRODUCT_URL_PATTERNS = [
  /amazon\.com(?:\.br)?\/(?:[^\s]*\/)?dp\/[A-Z0-9]{6,}/i, // Amazon /dp/
  /amazon\.com(?:\.br)?\/gp\/product\/[A-Z0-9]{6,}/i,     // Amazon /gp/product/
  /-i\.\d+\.\d+/,                                          // Shopee produto-i.shop.item
  /shopee\.com\.br\/product\/\d+\/\d+/i,                   // Shopee /product/
  /\bs\.shopee\.com\.br\//i,                               // short Shopee (gerado por nós)
  /\bshope\.ee\//i,
  /\bmeli\.la\//i,                                         // short ML (gerado por nós)
  /\bmercadol\.com\.br\//i,
  /MLB-?\d{6,}/,                                           // Mercado Livre MLB123456
  /mercadolivre\.com\.br\/[^\s]*\/p\/MLB\d+/i,             // ML catálogo
  /_JM/,                                                   // ML sufixo de produto
];

/** O texto (já com links de afiliado) indica UM produto específico?
 *  Página de campanha (amazon.com.br/primeday, /deals, home da loja) → false —
 *  pela regra do usuário, anúncio sem produto único vai para curadoria. */
export function indicatesSingleProduct(processedText: string): boolean {
  return SINGLE_PRODUCT_URL_PATTERNS.some(p => p.test(processedText));
}
