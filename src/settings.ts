import fs from 'fs';
import path from 'path';

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'portal-settings.json');

export interface PortalSettings {
  stores: Record<string, boolean>;
  types: { product: boolean; coupon: boolean };
  maxDailyAds: number;
  delayMinutes: number;
  quietHourStart: number;
  quietHourEnd: number;
  groupRates: Record<string, number>; // group ID → 0–100 (% de mensagens encaminhadas)
  standardizeForwards: boolean; // padroniza repasses de produto com o template padrão
}

const DEFAULTS: PortalSettings = {
  stores: {
    amazon: true,
    shopee: true,
    mercadolivre: true,
    pelando: true,
    promobit: true,
  },
  types: { product: true, coupon: true },
  maxDailyAds: 20,
  delayMinutes: 1,
  quietHourStart: 22,
  quietHourEnd: 8,
  groupRates: {},
  standardizeForwards: true,
};

let cache: PortalSettings | null = null;

export function getSettings(): PortalSettings {
  if (cache) return cache;
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      cache = {
        stores: { ...DEFAULTS.stores, ...raw.stores },
        types: { ...DEFAULTS.types, ...raw.types },
        maxDailyAds: typeof raw.maxDailyAds === 'number' ? raw.maxDailyAds : DEFAULTS.maxDailyAds,
        delayMinutes: typeof raw.delayMinutes === 'number' ? raw.delayMinutes : DEFAULTS.delayMinutes,
        quietHourStart: typeof raw.quietHourStart === 'number' ? raw.quietHourStart : DEFAULTS.quietHourStart,
        quietHourEnd: typeof raw.quietHourEnd === 'number' ? raw.quietHourEnd : DEFAULTS.quietHourEnd,
        groupRates: typeof raw.groupRates === 'object' ? raw.groupRates : {},
        standardizeForwards: typeof raw.standardizeForwards === 'boolean' ? raw.standardizeForwards : DEFAULTS.standardizeForwards,
      };
    } else {
      cache = structuredClone(DEFAULTS);
      persistSettings(cache);
    }
  } catch {
    cache = structuredClone(DEFAULTS);
  }
  return cache;
}

export function updateSettings(partial: Partial<PortalSettings>): PortalSettings {
  const current = getSettings();
  const clampHour = (h: number) => Math.round(Math.max(0, Math.min(23.5, h)) * 2) / 2;
  cache = {
    stores: { ...current.stores, ...(partial.stores ?? {}) },
    types: { ...current.types, ...(partial.types ?? {}) },
    maxDailyAds: typeof partial.maxDailyAds === 'number' ? Math.max(1, Math.min(1000, partial.maxDailyAds)) : current.maxDailyAds,
    delayMinutes: typeof partial.delayMinutes === 'number' ? Math.max(0, Math.min(120, partial.delayMinutes)) : current.delayMinutes,
    quietHourStart: typeof partial.quietHourStart === 'number' ? clampHour(partial.quietHourStart) : current.quietHourStart,
    quietHourEnd: typeof partial.quietHourEnd === 'number' ? clampHour(partial.quietHourEnd) : current.quietHourEnd,
    groupRates: { ...current.groupRates, ...(partial.groupRates ?? {}) },
    standardizeForwards: typeof partial.standardizeForwards === 'boolean' ? partial.standardizeForwards : current.standardizeForwards,
  };
  persistSettings(cache);
  return cache;
}

function persistSettings(s: PortalSettings): void {
  fs.promises.mkdir(path.dirname(SETTINGS_FILE), { recursive: true })
    .then(() => fs.promises.writeFile(SETTINGS_FILE, JSON.stringify(s, null, 2)))
    .catch(err => console.error('[SETTINGS] Erro ao salvar:', (err as Error).message));
}

// Retorna se a loja está habilitada pelo usuário.
// WHITELIST: loja desconhecida (sem programa de afiliado) NUNCA passa —
// só repassamos Shopee, Amazon e Mercado Livre (+ agregadores com toggle).
export function isStoreEnabled(source: string): boolean {
  const s = source.toLowerCase();
  const { stores } = getSettings();
  if (s.includes('mercado') || s.includes('meli')) return stores.mercadolivre ?? true;
  if (s.includes('amazon') || s.includes('amzn')) return stores.amazon ?? true;
  if (s.includes('shopee')) return stores.shopee ?? true;
  if (s.includes('pelando')) return stores.pelando ?? true;
  if (s.includes('promobit')) return stores.promobit ?? true;
  if (s === 'whatsapp') return true; // deals da fila já filtrados no sourceMonitor
  return false;
}

// Detecta se um anúncio é de cupom de desconto (não de produto específico).
//
// Cupom: a proposta de valor principal é um CÓDIGO de desconto aplicável em vários itens.
// Produto: a proposta de valor é um item específico (com preço, URL de produto, modelo).
//
// Regra principal: tem palavra-chave de cupom E não aponta para URL de produto específico.
// Exceção: mesmo com URL de produto, se a linguagem for de desconto generalizado (toda a loja,
// qualquer produto etc.), ainda é cupom.
export function isCouponAnnouncement(text: string): boolean {
  // ── 1. Palavras-chave que indicam presença de cupom ───────────────────────
  // Exige padrão específico — evita falsos positivos como "Resgate cupom do anúncio"
  // (Amazon Clippable Coupon) que menciona cupom mas é anúncio de produto.
  const hasCouponKeyword =
    /\bcupons?\s*[:：]/i.test(text) ||                  // "cupom:" / "cupons:"
    /\bcupom\s+[A-Z0-9]{3,}/i.test(text) ||            // "cupom CODE123"
    /\bvoucher\b/i.test(text) ||
    /\bpromo\s*code\b/i.test(text) ||
    /código\s*(promo\w*|desconto|de\s+desconto)?\s*[:：]/i.test(text) ||
    /\bcode\s*[:：]/i.test(text) ||
    /use\s+(o\s+)?(cupom|código|code)\b/i.test(text) ||
    /com\s+(o\s+)?(cupom|código|code)\b/i.test(text) ||
    /insira\s+(o\s+)?(cupom|código)\b/i.test(text) ||
    /aplique\s+(o\s+)?(cupom|código)\b/i.test(text) ||
    /🏷/.test(text);

  if (!hasCouponKeyword) return false;

  // ── 1b. Título explícito de cupom de loja → cupom imediato ────────────────
  const isExplicitStoreCoupon =
    /cupons?\s+(do\s+|da\s+|de\s+)?(mercado\s*livre|shopee|amazon|ml)\b/i.test(text);

  if (isExplicitStoreCoupon) return true;

  // ── 2. Linguagem de desconto generalizado → cupom mesmo com URL de produto ─
  const isStoreWide =
    /toda\s+(a\s+)?(loja|categoria|linha|coleção|plataforma|seleção)/i.test(text) ||
    /em\s+toda\s+a\b/i.test(text) ||
    /qualquer\s+(produto|item|compra|pedido)/i.test(text) ||
    /primeira\s+compra/i.test(text) ||
    /\d+\s*%\s*off\s+(na|no|em|na\s+loja|no\s+site|para\s+toda)/i.test(text) ||
    /desconto\s+(em\s+toda|para\s+toda|na\s+loja|no\s+site)/i.test(text);

  if (isStoreWide) return true;

  // ── 3. URL de produto específico → anúncio de produto (cupom é extra) ──────
  // Detecta IDs de produto conhecidos nas URLs ou short links de produto
  const hasSpecificProductUrl =
    /\/dp\/[A-Z0-9]{10}/i.test(text) ||         // Amazon: /dp/B0XXXXXX
    /\/gp\/product\/[A-Z0-9]{10}/i.test(text) || // Amazon: /gp/product/
    /-i\.\d+\.\d+/.test(text) ||                 // Shopee: produto-i.shopId.itemId
    /\/product\/\d+\/\d+/.test(text) ||           // Shopee: /product/shopId/itemId
    /MLB-?\d{6,}/.test(text) ||                   // Mercado Livre: MLB123456
    /\/p\/[A-Z]{3}\d+/.test(text) ||              // ML catálogo: /p/MLB123
    // Short links de afiliado sempre apontam para produto específico
    /\bamzn\.to\//i.test(text) ||
    /\blink\.amazon\//i.test(text) ||
    /\bs\.shopee\.com\.br\//i.test(text) ||
    /\bshope\.ee\//i.test(text) ||
    /\bmeli\.la\//i.test(text) ||
    /\bmercadol\.com\.br\//i.test(text);

  if (hasSpecificProductUrl) return false;

  // ── 4. Tem preço específico de produto? ────────────────────────────────────
  // "De R$ X por R$ Y" ou "R$ X,XX" junto com nome de produto = anúncio de produto
  const hasPriceWithContext =
    /de\s+R\$\s*[\d.,]+\s+por\s+R\$/i.test(text) ||
    /por\s+apenas\s+R\$/i.test(text) ||
    /apenas\s+R\$\s*[\d.,]+/i.test(text);

  if (hasPriceWithContext) return false;

  // ── 5. Cupom com código explícito + sem produto específico → é cupom ───────
  return true;
}

// Retorna se o tipo de conteúdo (produto/cupom) está habilitado no portal.
export function isTypeEnabled(text: string): boolean {
  const { types } = getSettings();
  return isCouponAnnouncement(text) ? (types.coupon ?? true) : (types.product ?? true);
}

// Detecta a loja a partir de URLs numa mensagem
export function detectSourceFromText(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('amazon') || lower.includes('amzn.to')) return 'amazon';
  if (lower.includes('shopee') || lower.includes('shope.ee')) return 'shopee';
  if (lower.includes('mercadolivre') || lower.includes('meli.la') || lower.includes('mercadol.com')) return 'mercadolivre';
  if (lower.includes('pelando')) return 'pelando';
  if (lower.includes('promobit')) return 'promobit';
  return 'outro';
}
