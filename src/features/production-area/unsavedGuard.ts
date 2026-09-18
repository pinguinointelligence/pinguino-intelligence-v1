/**
 * Produkcja — the ONE register of unsaved area forms (package PRODUKCJA V3, Etap 1 §1.5).
 *
 * The app runs on `BrowserRouter`: there is no `useBlocker`, and until now nothing asked before
 * a half-edited machine setting or product-market choice was dropped by a tap on another section,
 * on ☰ or on HOME | PRO. This register is deliberately small:
 *
 *   registerUnsaved({ id, isDirty, save, discard }) → unregister   (React: `useRegisterUnsaved`)
 *   requestLeave(then)
 *
 *   - nothing unsaved → `then()` at once;
 *   - „Zapisz i przejdź” → `await entry.save()`; `{ ok: true }` → `then()`; `{ ok: false }` → the
 *     question closes, nobody leaves, the form keeps its data and shows its OWN message
 *     (validation or save failure);
 *   - „Odrzuć zmiany” → `entry.discard()` (the form draft only) → `then()`;
 *   - „Zostań” → nothing.
 *
 * SCOPE — only the area's settings forms: machine settings, the machine choice before „Zapisz”,
 * the label profile and a batch's label settings, product markets. NEVER the recipe (Przelicz /
 * Zastosuj and the version save stay the only way a recipe changes) and NEVER weighing (weighed
 * grams live in the batch, `productionSessionStore`). „Odrzuć zmiany” therefore cannot touch a
 * saved batch, confirmed grams or history — it only calls the form's own `discard`.
 *
 * No autosave and no new draft type: `save` is the form's EXISTING submit.
 *
 * The question itself is rendered by `UnsavedChangesDialog`, mounted once by the area surface.
 * `beforeunload` is armed only while a registered form reports unsaved changes.
 */
import { create } from 'zustand';

export type UnsavedSaveResult = { ok: true } | { ok: false };

export interface UnsavedEntry {
  /** Stable id of the form, unique inside the area. */
  id: string;
  /** Customer name of the form's place, named in the question („Maszyna”). */
  label?: string;
  isDirty: () => boolean;
  save: () => Promise<UnsavedSaveResult>;
  discard: () => void;
}

interface PendingLeave {
  then: () => void;
  ids: readonly string[];
}

interface UnsavedGuardState {
  /** The open question, or null. */
  pending: PendingLeave | null;
  /** „Zapisz i przejdź” is running. */
  saving: boolean;
  /** Reactive mirror of which registered forms report unsaved changes (the section dot). */
  dirtyIds: readonly string[];
}

export const useUnsavedGuardStore = create<UnsavedGuardState>(() => ({
  pending: null,
  saving: false,
  dirtyIds: [],
}));

const entries = new Map<string, UnsavedEntry>();
let mountedHosts = 0;
let beforeUnloadArmed = false;

const reportsDirty = (entry: UnsavedEntry): boolean => {
  try {
    return entry.isDirty();
  } catch {
    return false;
  }
};

export function dirtyUnsavedEntries(): UnsavedEntry[] {
  return [...entries.values()].filter(reportsDirty);
}

export function hasUnsavedChanges(): boolean {
  return dirtyUnsavedEntries().length > 0;
}

const onBeforeUnload = (event: BeforeUnloadEvent) => {
  if (!hasUnsavedChanges()) return;
  event.preventDefault();
  // Legacy browsers only show the prompt when `returnValue` is set.
  event.returnValue = '';
};

function syncBeforeUnload(): void {
  if (typeof window === 'undefined') return;
  const shouldArm = useUnsavedGuardStore.getState().dirtyIds.length > 0;
  if (shouldArm && !beforeUnloadArmed) {
    window.addEventListener('beforeunload', onBeforeUnload);
    beforeUnloadArmed = true;
  } else if (!shouldArm && beforeUnloadArmed) {
    window.removeEventListener('beforeunload', onBeforeUnload);
    beforeUnloadArmed = false;
  }
}

/** A form tells the register whether it holds unsaved changes right now. */
export function setUnsavedDirty(id: string, dirty: boolean): void {
  const current = useUnsavedGuardStore.getState().dirtyIds;
  const has = current.includes(id);
  if (dirty && !has) useUnsavedGuardStore.setState({ dirtyIds: [...current, id] });
  else if (!dirty && has) {
    useUnsavedGuardStore.setState({ dirtyIds: current.filter((value) => value !== id) });
  }
  syncBeforeUnload();
}

/** Register a form. Returns the unregister function. */
export function registerUnsaved(entry: UnsavedEntry): () => void {
  entries.set(entry.id, entry);
  if (reportsDirty(entry)) setUnsavedDirty(entry.id, true);
  return () => {
    if (entries.get(entry.id) !== entry) return;
    entries.delete(entry.id);
    setUnsavedDirty(entry.id, false);
  };
}

/**
 * Leave the current place — at once when nothing is unsaved, otherwise after the customer
 * answers the question. Without a mounted question host (outside the area) nothing is asked.
 */
export function requestLeave(then: () => void): void {
  const dirty = dirtyUnsavedEntries();
  if (dirty.length === 0 || mountedHosts === 0) {
    then();
    return;
  }
  useUnsavedGuardStore.setState({
    pending: { then, ids: dirty.map((entry) => entry.id) },
    saving: false,
  });
}

/** Labels of the forms the open question is about, in registration order. */
export function pendingUnsavedLabels(): string[] {
  const pending = useUnsavedGuardStore.getState().pending;
  if (!pending) return [];
  return pending.ids
    .map((id) => entries.get(id)?.label)
    .filter((label): label is string => Boolean(label));
}

/** „Zostań” — close the question; the forms keep their drafts. */
export function stayAfterLeaveRequest(): void {
  useUnsavedGuardStore.setState({ pending: null, saving: false });
}

/** „Odrzuć zmiany” — every asked form drops ONLY its own draft, then the navigation runs. */
export function discardAndLeave(): void {
  const pending = useUnsavedGuardStore.getState().pending;
  if (!pending) return;
  for (const id of pending.ids) entries.get(id)?.discard();
  useUnsavedGuardStore.setState({ pending: null, saving: false });
  pending.then();
}

/**
 * „Zapisz i przejdź” — every asked form runs its EXISTING save. The navigation runs only when
 * every save reports `{ ok: true }`; the first `{ ok: false }` closes the question and keeps the
 * customer (and the draft, and the form's own message) where they are.
 */
export async function saveAndLeave(): Promise<boolean> {
  const pending = useUnsavedGuardStore.getState().pending;
  if (!pending) return false;
  useUnsavedGuardStore.setState({ saving: true });
  for (const id of pending.ids) {
    const entry = entries.get(id);
    if (!entry || !reportsDirty(entry)) continue;
    let result: UnsavedSaveResult;
    try {
      result = await entry.save();
    } catch {
      result = { ok: false };
    }
    if (!result.ok) {
      useUnsavedGuardStore.setState({ pending: null, saving: false });
      return false;
    }
  }
  useUnsavedGuardStore.setState({ pending: null, saving: false });
  pending.then();
  return true;
}

/** The question host announces itself; `requestLeave` asks only while one is mounted. */
export function mountUnsavedHost(): () => void {
  mountedHosts += 1;
  return () => {
    mountedHosts = Math.max(0, mountedHosts - 1);
    if (mountedHosts === 0) stayAfterLeaveRequest();
  };
}

export function resetUnsavedGuardForTests(): void {
  entries.clear();
  mountedHosts = 0;
  useUnsavedGuardStore.setState({ pending: null, saving: false, dirtyIds: [] });
  syncBeforeUnload();
}
