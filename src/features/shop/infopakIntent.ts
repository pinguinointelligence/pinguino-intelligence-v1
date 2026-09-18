/**
 * "I clicked Zamów za 0 € while signed out" — remembered across the sign-in step.
 *
 * Signing in with a password happens in a dialog on the same page. A provider sign-in
 * leaves the site and comes back to its home page, so the intent waits there and continues
 * when the shop is opened again. Either way it is kept per tab (sessionStorage) with a
 * short lifetime, and it is consumed exactly once: the order never repeats on a later visit.
 *
 * The document is made per market and language, so the intent remembers WHICH one was
 * clicked. An intent without a market (written by an older build) is dropped, never guessed.
 */

const KEY = 'gellatti.shop.infopakIntent';
export const INFOPAK_INTENT_TTL_MS = 30 * 60 * 1000;

export interface InfopakIntentTarget {
  countryIso2: string;
  language: string;
}

type IntentStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const sessionStore = (): IntentStorage | null => {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

const LANGUAGE = /^[a-z]{2,3}(-[A-Z][a-z]{3})?$/;

const parse = (raw: string | null, now: number): InfopakIntentTarget | null => {
  if (raw == null) return null;
  try {
    const value = JSON.parse(raw) as { at?: unknown; countryIso2?: unknown; language?: unknown };
    const at = Number(value.at);
    if (!Number.isFinite(at) || now - at < 0 || now - at >= INFOPAK_INTENT_TTL_MS) return null;
    const countryIso2 = String(value.countryIso2 ?? '');
    const language = String(value.language ?? '');
    if (!/^[A-Z]{2}$/.test(countryIso2) || !LANGUAGE.test(language)) return null;
    return { countryIso2, language };
  } catch {
    return null;
  }
};

export function rememberInfopakIntent(
  target: InfopakIntentTarget,
  now = Date.now(),
  storage = sessionStore(),
): void {
  try {
    storage?.setItem(KEY, JSON.stringify({ at: now, ...target }));
  } catch {
    /* storage can be unavailable (private mode); the customer simply clicks again */
  }
}

/** The fresh intent that was waiting, if any. It is removed either way. */
export function takeInfopakIntent(
  now = Date.now(),
  storage = sessionStore(),
): InfopakIntentTarget | null {
  try {
    const raw = storage?.getItem(KEY) ?? null;
    storage?.removeItem(KEY);
    return parse(raw, now);
  } catch {
    return null;
  }
}

/** The fresh intent that is waiting, without consuming it. */
export function peekInfopakIntent(
  now = Date.now(),
  storage = sessionStore(),
): InfopakIntentTarget | null {
  try {
    return parse(storage?.getItem(KEY) ?? null, now);
  } catch {
    return null;
  }
}
