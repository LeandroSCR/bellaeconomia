import fs from 'fs';
import path from 'path';

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'portal-settings.json');

export interface PortalSettings {
  stores: Record<string, boolean>;
  types: { product: boolean; coupon: boolean };
  maxDailyAds: number;
  delayMinutes: number;
  quietHourStart: number; // hora em que começa o silêncio (0–23)
  quietHourEnd: number;   // hora em que o bot retoma (0–23)
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
    maxDailyAds: typeof partial.maxDailyAds === 'number' ? Math.max(1, Math.min(200, partial.maxDailyAds)) : current.maxDailyAds,
    delayMinutes: typeof partial.delayMinutes === 'number' ? Math.max(0, Math.min(120, partial.delayMinutes)) : current.delayMinutes,
    quietHourStart: typeof partial.quietHourStart === 'number' ? clampHour(partial.quietHourStart) : current.quietHourStart,
    quietHourEnd: typeof partial.quietHourEnd === 'number' ? clampHour(partial.quietHourEnd) : current.quietHourEnd,
  };
  persistSettings(cache);
  return cache;
}

function persistSettings(s: PortalSettings): void {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
  } catch (err) {
    console.error('[SETTINGS] Erro ao salvar:', (err as Error).message);
  }
}

// Retorna se a loja está habilitada pelo usuário
export function isStoreEnabled(source: string): boolean {
  const s = source.toLowerCase();
  const { stores } = getSettings();
  if (s.includes('mercado') || s.includes('meli')) return stores.mercadolivre ?? true;
  if (s.includes('amazon') || s.includes('amzn')) return stores.amazon ?? true;
  if (s.includes('shopee')) return stores.shopee ?? true;
  if (s.includes('pelando')) return stores.pelando ?? true;
  if (s.includes('promobit')) return stores.promobit ?? true;
  return true;
}

// Retorna se o tipo de conteúdo (produto/cupom) está habilitado.
// Cupom PURO = tem marcador de cupom mas NÃO tem produto específico (sem URL e sem preço).
// Mensagem com cupom + produto (ex: "R$ 198 | Cupom: PLACAR50 | https://...") = produto.
export function isTypeEnabled(text: string): boolean {
  const { types } = getSettings();
  const hasCouponMarker =
    /cupom\s*[:：]/i.test(text) ||
    /código\s*[:：]/i.test(text) ||
    /coupon\s*[:：]/i.test(text) ||
    /🏷.{0,5}[A-Z0-9]{4,}/i.test(text);
  const hasProductUrl = /https?:\/\/[^\s]+/i.test(text);
  const hasProductPrice = /R\$\s*[\d.,]+/i.test(text);
  const isPureCoupon = hasCouponMarker && !hasProductUrl && !hasProductPrice;
  return isPureCoupon ? (types.coupon ?? true) : (types.product ?? true);
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
