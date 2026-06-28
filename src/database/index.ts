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

// Migração: adiciona coluna raw_text se ainda não existir (SQLite não suporta IF NOT EXISTS em ALTER TABLE)
const hasRawText = (db.prepare("SELECT COUNT(*) as n FROM pragma_table_info('deals') WHERE name='raw_text'").get() as { n: number }).n > 0;
if (!hasRawText) {
  db.exec('ALTER TABLE deals ADD COLUMN raw_text TEXT');
}

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

export function saveDeal(deal: Deal): boolean {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO deals
      (id, title, price, original_price, discount, url, affiliate_url, image_url, store, source, category, coupon_code, raw_text, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    deal.id, deal.title, deal.price,
    deal.originalPrice ?? null, deal.discount ?? null,
    deal.url, deal.affiliateUrl ?? null, deal.imageUrl ?? null,
    deal.store, deal.source, deal.category ?? null, deal.couponCode ?? null,
    deal.rawText ?? null,
    Math.floor(deal.createdAt.getTime() / 1000)
  );
  return result.changes > 0;
}

export function saveCoupon(coupon: Coupon): boolean {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO coupons (id, code, store, discount, description, expires_at, url, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    coupon.id, coupon.code, coupon.store, coupon.discount,
    coupon.description,
    coupon.expiresAt ? Math.floor(coupon.expiresAt.getTime() / 1000) : null,
    coupon.url, coupon.source
  );
  return result.changes > 0;
}

export function markSent(dealId: string | null, groupId: string, type = 'deal'): void {
  db.prepare('INSERT INTO sent_messages (deal_id, group_id, type) VALUES (?, ?, ?)').run(dealId, groupId, type);
}

export function countSentToday(): number {
  const startOfDay = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  const row = db.prepare("SELECT COUNT(*) as count FROM sent_messages WHERE sent_at >= ? AND type NOT IN ('url_dedup','cleared')").get(startOfDay) as { count: number };
  return row.count;
}

export function countSentTotal(): number {
  const row = db.prepare("SELECT COUNT(*) as count FROM sent_messages WHERE type NOT IN ('url_dedup','cleared')").get() as { count: number };
  return row.count;
}

export function countSentByType(): Record<string, number> {
  const startOfDay = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  const rows = db.prepare("SELECT type, COUNT(*) as count FROM sent_messages WHERE sent_at >= ? AND type NOT IN ('url_dedup','cleared') GROUP BY type").all(startOfDay) as Array<{ type: string; count: number }>;
  return Object.fromEntries(rows.map(r => [r.type, r.count]));
}

export function wasRecentlySent(dealId: string, hours = 24): boolean {
  const cutoff = Math.floor(Date.now() / 1000) - hours * 3600;
  const row = db.prepare('SELECT id FROM sent_messages WHERE deal_id = ? AND sent_at >= ?').get(dealId, cutoff);
  return !!row;
}

export function cleanOldShopeeDeals(): void {
  // Remove deals Shopee não enviadas que ficaram do sistema anterior ao fluxo de aprovação
  db.prepare(`
    DELETE FROM deals
    WHERE source = 'shopee'
    AND id NOT IN (SELECT deal_id FROM sent_messages WHERE deal_id IS NOT NULL)
  `).run();
}

export function getUnsentDeals(limit = 5): Deal[] {
  const rows = db.prepare(`
    SELECT d.* FROM deals d
    WHERE NOT EXISTS (SELECT 1 FROM sent_messages s WHERE s.deal_id = d.id)
    AND d.source != 'shopee'
    ORDER BY d.created_at DESC
    LIMIT ?
  `).all(limit) as Record<string, unknown>[];

  return rows.map(row => ({
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
  }));
}

export default db;

// ── Shopee Suggestions ────────────────────────────────────────────────────

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

export function saveShopeeSuggestions(items: ShopeeSuggestionData[]): void {
  // Remove pending do dia anterior antes de salvar novas sugestões
  db.prepare("DELETE FROM shopee_suggestions WHERE status = 'pending'").run();

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO shopee_suggestions
      (item_id, title, price, original_price, discount,
       commission_rate, seller_commission_rate, shopee_commission_rate,
       image_url, offer_link, shop_name, rating_star, sales)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of items) {
    stmt.run(
      item.itemId, item.title, item.price,
      item.originalPrice ?? null, item.discount ?? null,
      item.commissionRate, item.sellerCommissionRate, item.shopeeCommissionRate,
      item.imageUrl ?? null, item.offerLink,
      item.shopName, item.ratingStar ?? null, item.sales ?? null
    );
  }
}

export function getShopeeSuggestions(): ShopeeSuggestion[] {
  const rows = db.prepare(`
    SELECT * FROM shopee_suggestions
    ORDER BY
      CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
      sales DESC NULLS LAST
  `).all() as Record<string, unknown>[];
  return rows.map(rowToSuggestion);
}

export function updateShopeeSuggestionStatus(
  id: number,
  status: 'approved' | 'rejected'
): ShopeeSuggestion | null {
  db.prepare("UPDATE shopee_suggestions SET status = ? WHERE id = ?").run(status, id);
  const row = db.prepare("SELECT * FROM shopee_suggestions WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToSuggestion(row) : null;
}

export function countShopeeSuggestionsByStatus(): Record<string, number> {
  const rows = db.prepare(
    "SELECT status, COUNT(*) as count FROM shopee_suggestions GROUP BY status"
  ).all() as Array<{ status: string; count: number }>;
  return Object.fromEntries(rows.map(r => [r.status, r.count]));
}
