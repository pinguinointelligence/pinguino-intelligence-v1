import { useCallback, useSyncExternalStore } from 'react';
import type { AccountLabelProfile, LabelRepository } from '@/services/labels/labelRepository';

/**
 * ONE account label profile for every Etykieta copy mounted at the same time.
 *
 * PRO MOBILE UX v2 · A4. Below 960 px the PRO workbench mounts the Etykieta tab
 * twice: the desktop column stays mounted (only CSS hides it) and the mobile
 * cockpit sheet mounts a second copy. Each copy used to load the profile on its
 * own, and each writes its derived label into the ONE shared
 * `recipeStore.labelDraft`. For as long as one copy held the saved profile and
 * the other still held the default, each undid the other's write, synchronously,
 * until React stopped the loop (#185 „Maximum update depth exceeded") and the
 * whole app fell back to its error screen.
 *
 * A value every copy reads at the same moment gives every copy the same derived
 * label, so the write-back settles after one write however many copies are
 * mounted, and however their separate requests would have raced or failed.
 *
 * The entry lives exactly as long as at least one copy is mounted. When the last
 * copy unmounts it is dropped, so the next visit loads afresh: label settings
 * edited on /labels still show up when the customer comes back.
 */
export interface AccountLabelProfileSnapshot {
  /** The request has answered, successfully or not. Until then, render nothing. */
  readonly settled: boolean;
  /** The saved profile, or null when the account has none or the read failed. */
  readonly profile: AccountLabelProfile | null;
}

const LOADING: AccountLabelProfileSnapshot = Object.freeze({ settled: false, profile: null });

interface Entry {
  snapshot: AccountLabelProfileSnapshot;
  readonly listeners: Set<() => void>;
}

const entries = new Map<object, Entry>();

/** Every copy that did not bring its own repository shares this key. */
const DEFAULT_REPOSITORY_KEY: object = Object.freeze({ repository: 'default' });

/**
 * Which copies share a profile. Production copies resolve the default
 * repository, and `resolveLabelRepository()` returns a NEW object per call, so
 * the repository instance itself can never be the key.
 */
export function accountLabelProfileSharingKey(suppliedRepository?: LabelRepository): object {
  return suppliedRepository ?? DEFAULT_REPOSITORY_KEY;
}

function settle(key: object, entry: Entry, profile: AccountLabelProfile | null) {
  // Every copy left before the answer arrived: the next visit asks again.
  if (entries.get(key) !== entry) return;
  entry.snapshot = { settled: true, profile };
  for (const listener of [...entry.listeners]) listener();
}

function subscribe(key: object, repository: LabelRepository, listener: () => void) {
  let entry = entries.get(key);
  if (!entry) {
    const created: Entry = { snapshot: LOADING, listeners: new Set() };
    entries.set(key, created);
    entry = created;
    void repository
      .getAccountProfile()
      .then((profile) => settle(key, created, profile))
      .catch(() => settle(key, created, null));
  }
  const owned = entry;
  owned.listeners.add(listener);
  return () => {
    owned.listeners.delete(listener);
    if (owned.listeners.size === 0 && entries.get(key) === owned) entries.delete(key);
  };
}

export function useSharedAccountLabelProfile(
  repository: LabelRepository,
  sharingKey: object,
): AccountLabelProfileSnapshot {
  const subscribeToProfile = useCallback(
    (listener: () => void) => subscribe(sharingKey, repository, listener),
    [repository, sharingKey],
  );
  const snapshot = useCallback(() => entries.get(sharingKey)?.snapshot ?? LOADING, [sharingKey]);
  return useSyncExternalStore(subscribeToProfile, snapshot, snapshot);
}
