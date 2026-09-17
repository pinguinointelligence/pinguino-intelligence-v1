/**
 * "I clicked Zamów za 0 € while signed out" — remembered across the sign-in step.
 *
 * Signing in with a password happens in a dialog on the same page. A provider sign-in
 * leaves the site and comes back to its home page, so the intent waits there and continues
 * when the shop is opened again. Either way it is kept per tab (sessionStorage) with a
 * short lifetime, and it is consumed exactly once: the order never repeats on a later visit.
 */

const KEY = 'gellatti.shop.infopakIntent';
export const INFOPAK_INTENT_TTL_MS = 30 * 60 * 1000;

type IntentStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const sessionStore = (): IntentStorage | null => {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

export function rememberInfopakIntent(now = Date.now(), storage = sessionStore()): void {
  try {
    storage?.setItem(KEY, String(now));
  } catch {
    /* storage can be unavailable (private mode); the customer simply clicks again */
  }
}

/** True when a fresh intent was waiting. It is removed either way. */
export function takeInfopakIntent(now = Date.now(), storage = sessionStore()): boolean {
  try {
    const raw = storage?.getItem(KEY) ?? null;
    storage?.removeItem(KEY);
    if (raw == null) return false;
    const at = Number(raw);
    return Number.isFinite(at) && now - at >= 0 && now - at < INFOPAK_INTENT_TTL_MS;
  } catch {
    return false;
  }
}

export function hasInfopakIntent(now = Date.now(), storage = sessionStore()): boolean {
  try {
    const raw = storage?.getItem(KEY) ?? null;
    if (raw == null) return false;
    const at = Number(raw);
    return Number.isFinite(at) && now - at >= 0 && now - at < INFOPAK_INTENT_TTL_MS;
  } catch {
    return false;
  }
}
