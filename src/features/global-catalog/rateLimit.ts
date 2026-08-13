export type CatalogRateAction = 'ocr_scan' | 'manual_candidate' | 'review_escalation' | 'duplicate_dispute';

export interface CatalogRateEvent {
  accountId: string;
  action: CatalogRateAction;
  at: string;
  ipHash?: string | null;
  deviceHash?: string | null;
  payloadHash?: string | null;
}

export interface CatalogRateTrust {
  trusted: boolean;
  multiplier?: number;
}

export interface CatalogRateDecision {
  allowed: boolean;
  reason: 'ok' | 'burst' | 'hourly' | 'daily' | 'cooldown' | 'rolling_30d' | 'duplicate_payload';
  retryAt: string | null;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function within(events: readonly CatalogRateEvent[], now: number, duration: number): CatalogRateEvent[] {
  return events.filter((event) => now - new Date(event.at).getTime() < duration);
}

export function evaluateCatalogRateLimit(input: {
  accountId: string;
  action: CatalogRateAction;
  now: string;
  events: readonly CatalogRateEvent[];
  trust?: CatalogRateTrust;
  payloadHash?: string | null;
}): CatalogRateDecision {
  const now = new Date(input.now).getTime();
  const multiplier = input.trust?.trusted ? Math.max(1, input.trust.multiplier ?? 5) : 1;
  const mine = input.events.filter((event) => event.accountId === input.accountId && event.action === input.action);
  if (input.payloadHash && mine.some((event) => event.payloadHash === input.payloadHash)) {
    return { allowed: false, reason: 'duplicate_payload', retryAt: null };
  }
  const firstBlockedRetry = (events: readonly CatalogRateEvent[], duration: number): string | null => {
    const earliest = events.map((event) => new Date(event.at).getTime()).sort((a, b) => a - b)[0];
    return earliest === undefined ? null : new Date(earliest + duration).toISOString();
  };
  if (input.action === 'ocr_scan') {
    const minute = within(mine, now, 60_000);
    if (minute.length >= 3 * multiplier) return { allowed: false, reason: 'burst', retryAt: firstBlockedRetry(minute, 60_000) };
    const hour = within(mine, now, HOUR);
    if (hour.length >= 20 * multiplier) return { allowed: false, reason: 'hourly', retryAt: firstBlockedRetry(hour, HOUR) };
    const day = within(mine, now, DAY);
    if (day.length >= 100 * multiplier) return { allowed: false, reason: 'daily', retryAt: firstBlockedRetry(day, DAY) };
  } else if (input.action === 'manual_candidate') {
    const day = within(mine, now, DAY);
    if (day.length >= 10 * multiplier) return { allowed: false, reason: 'daily', retryAt: firstBlockedRetry(day, DAY) };
  } else if (input.action === 'duplicate_dispute') {
    const day = within(mine, now, DAY);
    if (day.length >= 2 * multiplier) return { allowed: false, reason: 'daily', retryAt: firstBlockedRetry(day, DAY) };
  } else {
    const day = within(mine, now, DAY);
    if (day.length >= 2 * multiplier) return { allowed: false, reason: 'daily', retryAt: firstBlockedRetry(day, DAY) };
    const last = mine.map((event) => new Date(event.at).getTime()).sort((a, b) => b - a)[0];
    if (last !== undefined && now - last < HOUR) return { allowed: false, reason: 'cooldown', retryAt: new Date(last + HOUR).toISOString() };
    const rolling = within(mine, now, 30 * DAY);
    if (rolling.length >= 10 * multiplier) return { allowed: false, reason: 'rolling_30d', retryAt: firstBlockedRetry(rolling, 30 * DAY) };
  }
  return { allowed: true, reason: 'ok', retryAt: null };
}
