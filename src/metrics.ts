export type ActivityType = 'sent' | 'discarded' | 'filtered' | 'error';

export interface ActivityEntry {
  ts: number;
  type: ActivityType;
  message: string;
  source?: string;
  group?: string;
}

const BOT_START = Date.now();
let errorsToday = 0;
let lastErrorAt: number | null = null;
const activity: ActivityEntry[] = [];
const sentBySource: Record<string, number> = {};

export function recordActivity(entry: Omit<ActivityEntry, 'ts'>): void {
  activity.unshift({ ts: Date.now(), ...entry });
  if (activity.length > 100) activity.pop();
  if (entry.type === 'error') { errorsToday++; lastErrorAt = Date.now(); }
  if (entry.type === 'sent' && entry.source) {
    sentBySource[entry.source] = (sentBySource[entry.source] ?? 0) + 1;
  }
}

export function getMetrics() {
  return {
    uptimeMs: Date.now() - BOT_START,
    errorsToday,
    lastErrorAt,
    recentActivity: activity.slice(0, 30),
    sentBySource: { ...sentBySource },
  };
}
