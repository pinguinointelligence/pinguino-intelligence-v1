/**
 * „Maszyna profesjonalna" as an EXPLICIT saved default.
 *
 * Machine Settings could only ever save a Home machine, so a Pro customer had
 * no way to say „Professional is my default" — they could only leave the
 * setting empty and rely on the fallback. That is a different statement, and
 * the page said so honestly: „Nie masz jeszcze zapisanej maszyny."
 *
 * Professional is NOT a machine record. `MachinePreferenceRecord` describes a
 * physical Home machine — a container, a technology, a derived batch — and
 * Professional has none of that; it is the studio's own canonical default.
 * Forcing it into that shape would have meant changing the owner-locked
 * `preferenceContracts`, so instead the CHOICE is recorded on its own, beside
 * the machine record, in the same device-local, user-scoped place.
 *
 * Selecting Professional clears the saved Home machine, because they are one
 * choice and not two.
 */

/** Namespace key. Bump only for a genuinely incompatible store change. */
export const PROFESSIONAL_CHOICE_STORAGE_KEY = 'pinguino.machine_professional.v1';

/**
 * Scoped to the authenticated user exactly like `userScopedMachineKey`, so one
 * account's choice can never be read as another's on a shared browser.
 */
export function userScopedProfessionalKey(userId: string | null | undefined): string {
  return userId
    ? `${PROFESSIONAL_CHOICE_STORAGE_KEY}::${userId}`
    : PROFESSIONAL_CHOICE_STORAGE_KEY;
}

/** The minimal Storage surface used (injectable for node tests). */
export interface ProfessionalChoiceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): ProfessionalChoiceStorage | null {
  // `localStorage` can throw on access in privacy modes — treat as absent.
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * True only for an explicit, still-current Professional choice. Anything else —
 * absent, unreadable, or any other value — reads as "not chosen", so a storage
 * failure can never invent a default.
 */
export function readProfessionalChoice(
  userId: string | null | undefined,
  storage: ProfessionalChoiceStorage | null = defaultStorage(),
): boolean {
  if (storage === null) return false;
  try {
    return storage.getItem(userScopedProfessionalKey(userId)) === '1';
  } catch {
    return false;
  }
}

/** Record or clear the choice. Returns false when the device refuses to store it. */
export function writeProfessionalChoice(
  userId: string | null | undefined,
  chosen: boolean,
  storage: ProfessionalChoiceStorage | null = defaultStorage(),
): boolean {
  if (storage === null) return false;
  try {
    const key = userScopedProfessionalKey(userId);
    if (chosen) storage.setItem(key, '1');
    else storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
