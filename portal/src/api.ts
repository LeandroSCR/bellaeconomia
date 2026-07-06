export interface Stats {
  whatsappStatus: 'online' | 'offline';
  botEnabled: boolean;
  uptimeMs: number;
  sentToday: number;
  sentTotal: number;
  errorsToday: number;
  queueSize: number;
  dailyLimit: number;
  dailyLimitReached: boolean;
  sentByType: Record<string, number>;
  sentBySource: Record<string, number>;
}

export interface Settings {
  stores: Record<string, boolean>;
  types: { product: boolean; coupon: boolean };
  maxDailyAds: number;
  delayMinutes: number;
  quietHourStart: number;
  quietHourEnd: number;
  standardizeForwards: boolean;
}

export interface Activity {
  ts: number;
  type: 'sent' | 'discarded' | 'filtered' | 'error';
  message: string;
  source?: string;
  group?: string;
}

const BASE = '';

export async function fetchStats(): Promise<Stats> {
  const r = await fetch(`${BASE}/api/stats`);
  return r.json();
}

export async function fetchSettings(): Promise<Settings> {
  const r = await fetch(`${BASE}/api/settings`);
  return r.json();
}

export async function patchSettings(partial: Partial<Settings>): Promise<Settings> {
  const r = await fetch(`${BASE}/api/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(partial),
  });
  return r.json();
}

export async function setBotState(enabled: boolean): Promise<void> {
  await fetch(`/api/bot/${enabled ? 'start' : 'stop'}`, { method: 'POST' });
}

// ── WhatsApp QR / reconexão ───────────────────────────────────────────────

export interface WhatsAppQr {
  status: 'online' | 'connecting' | 'waiting_qr';
  qr: string | null; // data URL da imagem do QR
}

export async function fetchWhatsAppQr(): Promise<WhatsAppQr> {
  const r = await fetch(`${BASE}/api/whatsapp/qr`);
  return r.json();
}

export async function reconnectWhatsApp(): Promise<void> {
  await fetch(`${BASE}/api/whatsapp/reconnect`, { method: 'POST' });
}

export async function fetchActivity(): Promise<Activity[]> {
  const r = await fetch(`${BASE}/api/activity`);
  return r.json();
}

// ── Queue ─────────────────────────────────────────────────────────────────

export interface QueueItem {
  id: string;
  title: string;
  price: number;
  source: string;
  imageUrl?: string;
  rawText?: string;
  createdAt: number;
}

export async function fetchQueue(): Promise<QueueItem[]> {
  const r = await fetch(`${BASE}/api/queue`);
  return r.json();
}

export async function deleteQueueItem(id: string): Promise<void> {
  await fetch(`${BASE}/api/queue/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ── Shopee Suggestions ────────────────────────────────────────────────────

export interface ShopeeSuggestion {
  id: number;
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
  status: 'pending' | 'approved' | 'rejected';
}

export interface ShopeeSuggestionsResponse {
  items: ShopeeSuggestion[];
  counts: Record<string, number>;
}

export async function fetchShopeeSuggestions(): Promise<ShopeeSuggestionsResponse> {
  const r = await fetch('/api/shopee/suggestions');
  return r.json();
}

export async function refreshShopeeSuggestions(): Promise<{ counts: Record<string, number> }> {
  const r = await fetch('/api/shopee/suggestions/refresh', { method: 'POST' });
  return r.json();
}

export async function approveShopeeSuggestion(id: number): Promise<void> {
  await fetch(`/api/shopee/suggestions/${id}/approve`, { method: 'POST' });
}

export async function rejectShopeeSuggestion(id: number): Promise<void> {
  await fetch(`/api/shopee/suggestions/${id}/reject`, { method: 'POST' });
}

// ── Fila de Curadoria (cupons) ────────────────────────────────────────────

export interface CurationItem {
  id: string;
  originalText: string;
  processedText: string;
  source?: string;
  groupName?: string;
  hasImage: boolean;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

export interface CurationResponse {
  items: CurationItem[];
  counts: Record<string, number>;
}

export async function fetchCuration(): Promise<CurationResponse> {
  const r = await fetch(`${BASE}/api/curation`);
  return r.json();
}

export async function updateCurationItemText(id: string, text: string): Promise<void> {
  await fetch(`${BASE}/api/curation/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
}

export async function approveCuration(id: string): Promise<{ ok: boolean; errors?: string[] }> {
  const r = await fetch(`${BASE}/api/curation/${encodeURIComponent(id)}/approve`, { method: 'POST' });
  return r.json();
}

export async function rejectCuration(id: string): Promise<void> {
  await fetch(`${BASE}/api/curation/${encodeURIComponent(id)}/reject`, { method: 'POST' });
}

export function curationImageUrl(id: string): string {
  return `${BASE}/api/curation/${encodeURIComponent(id)}/image`;
}

// ── Saúde das Engines ─────────────────────────────────────────────────────

export type EngineStatus = 'ok' | 'degraded' | 'down';

export interface EngineHealth {
  id: 'forwarder' | 'creator';
  name: string;
  status: EngineStatus;
  details: Record<string, string | number | boolean | null>;
}

export async function fetchEnginesHealth(): Promise<EngineHealth[]> {
  const r = await fetch(`${BASE}/api/engines/health`);
  const data = await r.json();
  return data.engines ?? [];
}

export function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
