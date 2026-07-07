import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { Deal, Coupon } from '../deals/types';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(path.join(DATA_DIR, 'bellaeconomia.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS deals (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    price REAL NOT NULL,
    original_price REAL,
    discount REAL,
    url TEXT NOT NULL,
    affiliate_url TEXT,
    image_url TEXT,
    store TEXT NOT NULL,
    source TEXT NOT NULL,
    category TEXT,
    coupon_code TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS coupons (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    store TEXT NOT NULL,
    discount TEXT NOT NULL,
    description TEXT NOT NULL,
    expires_at INTEGER,
    url TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS sent_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id TEXT,
    group_id TEXT NOT NULL,
    sent_at INTEGER NOT NULL DEFAULT (unixepoch()),
    type TEXT NOT NULL DEFAULT 'deal'
  );

  CREATE INDEX IF NOT EXISTS idx_sent_messages_sent_at ON sent_messages(sent_at);
  CREATE INDEX IF NOT EXISTS idx_deals_created_at ON deals(created_at);
`);

const hasRawText = (db.prepare("SELECT COUNT(*) as n FROM pragma_table_info('deals') WHERE name='raw_text'").get() as { n: number }).n > 0;
if (!hasRawText) db.exec('ALTER TABLE deals ADD COLUMN raw_text TEXT');

db.exec(`
  CREATE TABLE IF NOT EXISTS curation_items (
    id TEXT PRIMARY KEY,
    original_text TEXT NOT NULL,
    processed_text TEXT NOT NULL,
    source TEXT,
    group_name TEXT,
    image_path TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_curation_status ON curation_items(status);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS shopee_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    price REAL NOT NULL,
    original_price REAL,
    discount INTEGER,
    commission_rate REAL NOT NULL,
    seller_commission_rate REAL,
    shopee_commission_rate REAL,
    image_url TEXT,
    offer_link TEXT NOT NULL,
    shop_name TEXT,
    rating_star REAL,
    sales INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    fetched_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// ── Prepared statements (compilados uma vez) ──────────────────────────────────

const stmts = {
  insertDeal: db.prepare(`
    INSERT OR IGNORE INTO deals
      (id, title, price, original_price, discount, url, affiliate_url, image_url,
       store, source, category, coupon_code, raw_text, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  insertCoupon: db.prepare(`
    INSERT OR IGNORE INTO coupons (id, code, store, discount, description, expires_at, url, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  insertSent: db.prepare('INSERT INTO sent_messages (deal_id, group_id, type) VALUES (?, ?, ?)'),
  countSentToday: db.prepare(
    "SELECT COUNT(*) as count FROM sent_messages WHERE sent_at >= ? AND type NOT IN ('url_dedup','cleared','no_affiliate','to_curation')"
  ),
  countSentTotal: db.prepare(
    "SELECT COUNT(*) as count FROM sent_messages WHERE type NOT IN ('url_dedup','cleared','no_affiliate','to_curation')"
  ),
  countSentByType: db.prepare(
    "SELECT type, COUNT(*) as count FROM sent_messages WHERE sent_at >= ? AND type NOT IN ('url_dedup','cleared','no_affiliate','to_curation') GROUP BY type"
  ),
  wasRecentlySent: db.prepare('SELECT id FROM sent_messages WHERE deal_id = ? AND sent_at >= ? LIMIT 1'),
  getUnsentDeals: db.prepare(`
    SELECT d.* FROM deals d
    WHERE NOT EXISTS (SELECT 1 FROM sent_messages s WHERE s.deal_id = d.id)
    AND d.source != 'shopee'
    ORDER BY d.created_at DESC
    LIMIT ?
  `),
  cleanOldShopeeDeals: db.prepare(`
    DELETE FROM deals
    WHERE source = 'shopee'
    AND id NOT IN (SELECT deal_id FROM sent_messages WHERE deal_id IS NOT NULL)
  `),
  deletePendingSuggestions: db.prepare("DELETE FROM shopee_suggestions WHERE status = 'pending'"),
  insertSuggestion: db.prepare(`
    INSERT OR IGNORE INTO shopee_suggestions
      (item_id, title, price, original_price, discount,
       commission_rate, seller_commission_rate, shopee_commission_rate,
       image_url, offer_link, shop_name, rating_star, sales)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getSuggestions: db.prepare(`
    SELECT * FROM shopee_suggestions
    ORDER BY
      CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
      sales DESC NULLS LAST
  `),
  updateSuggestionStatus: db.prepare("UPDATE shopee_suggestions SET status = ? WHERE id = ?"),
  getSuggestionById: db.prepare("SELECT * FROM shopee_suggestions WHERE id = ?"),
  countSuggestionsByStatus: db.prepare("SELECT status, COUNT(*) as count FROM shopee_suggestions GROUP BY status"),
  wasRecentlySentDefault: db.prepare('SELECT id FROM sent_messages WHERE deal_id = ? AND sent_at >= ? LIMIT 1'),
  insertCurationItem: db.prepare(`
    INSERT OR IGNORE INTO curation_items (id, original_text, processed_text, source, group_name, image_path)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  getCurationItems: db.prepare(`
    SELECT * FROM curation_items
    ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at DESC
    LIMIT 100
  `),
  getCurationItemById: db.prepare('SELECT * FROM curation_items WHERE id = ?'),
  updateCurationText: db.prepare("UPDATE curation_items SET processed_text = ? WHERE id = ? AND status = 'pending'"),
  updateCurationStatus: db.prepare('UPDATE curation_items SET status = ? WHERE id = ?'),
  countCurationByStatus: db.prepare('SELECT status, COUNT(*) as count FROM curation_items GROUP BY status'),
  cleanOldCuration: db.prepare("DELETE FROM curation_items WHERE status != 'pending' AND created_at < ?"),
  getPendingCurationOlderThan: db.prepare("SELECT * FROM curation_items WHERE status = 'pending' AND created_at < ?"),
};

// ── Helper: cede o event loop antes de executar operação síncrona de DB ───────
function run<T>(fn: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    setImmediate(() => {
      try { resolve(fn()); }
      catch (e) { reject(e); }
    });
  });
}

// ── Exports assíncronos ───────────────────────────────────────────────────────

export function saveDeal(deal: Deal): Promise<boolean> {
  return run(() => {
    const result = stmts.insertDeal.run(
      deal.id, deal.title, deal.price,
      deal.originalPrice ?? null, deal.discount ?? null,
      deal.url, deal.affiliateUrl ?? null, deal.imageUrl ?? null,
      deal.store, deal.source, deal.category ?? null, deal.couponCode ?? null,
      deal.rawText ?? null,
      Math.floor(deal.createdAt.getTime() / 1000)
    );
    return result.changes > 0;
  });
}

export function saveCoupon(coupon: Coupon): Promise<boolean> {
  return run(() => {
    const result = stmts.insertCoupon.run(
      coupon.id, coupon.code, coupon.store, coupon.discount,
      coupon.description,
      coupon.expiresAt ? Math.floor(coupon.expiresAt.getTime() / 1000) : null,
      coupon.url, coupon.source
    );
    return result.changes > 0;
  });
}

export function markSent(dealId: string | null, groupId: string, type = 'deal'): Promise<void> {
  return run(() => { stmts.insertSent.run(dealId, groupId, type); });
}

export function countSentToday(): Promise<number> {
  return run(() => {
    const startOfDay = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
    return (stmts.countSentToday.get(startOfDay) as { count: number }).count;
  });
}

export function countSentTotal(): Promise<number> {
  return run(() => (stmts.countSentTotal.get() as { count: number }).count);
}

export function countSentByType(): Promise<Record<string, number>> {
  return run(() => {
    const startOfDay = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
    const rows = stmts.countSentByType.all(startOfDay) as Array<{ type: string; count: number }>;
    return Object.fromEntries(rows.map(r => [r.type, r.count]));
  });
}

export function wasRecentlySent(dealId: string, hours = 24): Promise<boolean> {
  return run(() => {
    const cutoff = Math.floor(Date.now() / 1000) - hours * 3600;
    return !!stmts.wasRecentlySent.get(dealId, cutoff);
  });
}

export function cleanOldShopeeDeals(): Promise<void> {
  return run(() => { stmts.cleanOldShopeeDeals.run(); });
}

export function getUnsentDeals(limit = 5): Promise<Deal[]> {
  return run(() => {
    const rows = stmts.getUnsentDeals.all(limit) as Record<string, unknown>[];
    return rows.map(rowToDeal);
  });
}

function rowToDeal(row: Record<string, unknown>): Deal {
  return {
    id: row.id as string,
    title: row.title as string,
    price: row.price as number,
    originalPrice: row.original_price != null ? row.original_price as number : undefined,
    discount: row.discount != null ? row.discount as number : undefined,
    url: row.url as string,
    affiliateUrl: row.affiliate_url != null ? row.affiliate_url as string : undefined,
    imageUrl: row.image_url != null ? row.image_url as string : undefined,
    store: row.store as string,
    source: row.source as Deal['source'],
    category: row.category != null ? row.category as string : undefined,
    couponCode: row.coupon_code != null ? row.coupon_code as string : undefined,
    rawText: row.raw_text != null ? row.raw_text as string : undefined,
    createdAt: new Date((row.created_at as number) * 1000),
  };
}

export default db;

// ── Shopee Suggestions ────────────────────────────────────────────────────────

export interface ShopeeSuggestionData {
  itemId: string;
  title: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  commissionRate: number;
  sellerCommissionRate: number;
  shopeeCommissionRate: number;
  imageUrl?: string;
  offerLink: string;
  shopName: string;
  ratingStar?: number;
  sales?: number;
}

export interface ShopeeSuggestion extends ShopeeSuggestionData {
  id: number;
  status: 'pending' | 'approved' | 'rejected';
  fetchedAt: Date;
}

function rowToSuggestion(r: Record<string, unknown>): ShopeeSuggestion {
  return {
    id: r.id as number,
    itemId: r.item_id as string,
    title: r.title as string,
    price: r.price as number,
    originalPrice: r.original_price != null ? r.original_price as number : undefined,
    discount: r.discount != null ? r.discount as number : undefined,
    commissionRate: r.commission_rate as number,
    sellerCommissionRate: r.seller_commission_rate as number,
    shopeeCommissionRate: r.shopee_commission_rate as number,
    imageUrl: r.image_url != null ? r.image_url as string : undefined,
    offerLink: r.offer_link as string,
    shopName: (r.shop_name as string) ?? 'Shopee',
    ratingStar: r.rating_star != null ? r.rating_star as number : undefined,
    sales: r.sales != null ? r.sales as number : undefined,
    status: r.status as 'pending' | 'approved' | 'rejected',
    fetchedAt: new Date((r.fetched_at as number) * 1000),
  };
}

export function saveShopeeSuggestions(items: ShopeeSuggestionData[]): Promise<void> {
  return run(() => {
    const tx = db.transaction(() => {
      stmts.deletePendingSuggestions.run();
      for (const item of items) {
        stmts.insertSuggestion.run(
          item.itemId, item.title, item.price,
          item.originalPrice ?? null, item.discount ?? null,
          item.commissionRate, item.sellerCommissionRate, item.shopeeCommissionRate,
          item.imageUrl ?? null, item.offerLink,
          item.shopName, item.ratingStar ?? null, item.sales ?? null
        );
      }
    });
    tx();
  });
}

export function getShopeeSuggestions(): Promise<ShopeeSuggestion[]> {
  return run(() => (stmts.getSuggestions.all() as Record<string, unknown>[]).map(rowToSuggestion));
}

export function updateShopeeSuggestionStatus(
  id: number,
  status: 'approved' | 'rejected'
): Promise<ShopeeSuggestion | null> {
  return run(() => {
    stmts.updateSuggestionStatus.run(status, id);
    const row = stmts.getSuggestionById.get(id) as Record<string, unknown> | undefined;
    return row ? rowToSuggestion(row) : null;
  });
}

export function countShopeeSuggestionsByStatus(): Promise<Record<string, number>> {
  return run(() => {
    const rows = stmts.countSuggestionsByStatus.all() as Array<{ status: string; count: number }>;
    return Object.fromEntries(rows.map(r => [r.status, r.count]));
  });
}

// ── Fila de Curadoria (cupons aguardando aprovação manual) ────────────────────

export interface CurationItem {
  id: string;
  originalText: string;
  processedText: string;
  source?: string;
  groupName?: string;
  imagePath?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
}

function rowToCurationItem(r: Record<string, unknown>): CurationItem {
  return {
    id: r.id as string,
    originalText: r.original_text as string,
    processedText: r.processed_text as string,
    source: r.source != null ? r.source as string : undefined,
    groupName: r.group_name != null ? r.group_name as string : undefined,
    imagePath: r.image_path != null ? r.image_path as string : undefined,
    status: r.status as CurationItem['status'],
    createdAt: new Date((r.created_at as number) * 1000),
  };
}

/** Salva item na curadoria. Retorna false se já existia (dedup por id). */
export function saveCurationItem(item: {
  id: string; originalText: string; processedText: string;
  source?: string; groupName?: string; imagePath?: string;
}): Promise<boolean> {
  return run(() => {
    const result = stmts.insertCurationItem.run(
      item.id, item.originalText, item.processedText,
      item.source ?? null, item.groupName ?? null, item.imagePath ?? null
    );
    return result.changes > 0;
  });
}

export function getCurationItems(): Promise<CurationItem[]> {
  return run(() => (stmts.getCurationItems.all() as Record<string, unknown>[]).map(rowToCurationItem));
}

export function getCurationItemById(id: string): Promise<CurationItem | null> {
  return run(() => {
    const row = stmts.getCurationItemById.get(id) as Record<string, unknown> | undefined;
    return row ? rowToCurationItem(row) : null;
  });
}

/** Edita o texto de um item pendente. Retorna false se não existe ou já foi decidido. */
export function updateCurationText(id: string, text: string): Promise<boolean> {
  return run(() => stmts.updateCurationText.run(text, id).changes > 0);
}

export function updateCurationStatus(id: string, status: 'approved' | 'rejected'): Promise<void> {
  return run(() => { stmts.updateCurationStatus.run(status, id); });
}

export function countCurationByStatus(): Promise<Record<string, number>> {
  return run(() => {
    const rows = stmts.countCurationByStatus.all() as Array<{ status: string; count: number }>;
    return Object.fromEntries(rows.map(r => [r.status, r.count]));
  });
}

/** Remove itens decididos com mais de N dias (limpeza no boot). */
export function cleanOldCurationItems(days = 7): Promise<void> {
  return run(() => {
    const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
    stmts.cleanOldCuration.run(cutoff);
  });
}

/** Itens pendentes há mais de N horas (candidatos à expiração automática). */
export function getPendingCurationOlderThan(hours: number): Promise<CurationItem[]> {
  return run(() => {
    const cutoff = Math.floor(Date.now() / 1000) - hours * 3600;
    return (stmts.getPendingCurationOlderThan.all(cutoff) as Record<string, unknown>[]).map(rowToCurationItem);
  });
}
