/**
 * PINGÜINO Product Picker — LIVE Mapper catalogue search (pure view-models).
 *
 * The „Składniki PI" side of the two-source picker: the 2,083-row Mapper
 * Basement library searched SERVER-SIDE through the demo-safe read model (the
 * backend adapter in `@/services/productPicker/mapperSearch` owns the IO). This
 * module is PURE: the async lifecycle (debounce, stale-request cancellation,
 * incremental pages) is modelled as testable reducers + a tiny injectable
 * debouncer, so the React hook stays a thin binding.
 *
 * Honesty rules:
 *  - the demo-safe search payload carries NO pac/pod/composition — a search hit
 *    can therefore never claim engine readiness; the exact check happens AFTER
 *    selection through the rich read model + the reused readiness gate;
 *  - backend-not-configured / view-not-applied is an explicit 'unavailable'
 *    phase (never presented as zero results);
 *  - selection carries the stable PI-ING-* id; `ingredientPickInput` routes it
 *    through the EXISTING `pickProduct`/`evaluateProductReadiness` gate — no
 *    new gate, no invented values.
 */
import type { PickProductInput } from '@/features/ingredient-resolution';
import type { ReferenceEngineValues } from '@/data/products/productEngineResolver';
import type {
  CatalogueUnavailableReason,
  MapperSearchOutcome,
  SafeMapperSearchRow,
} from '@/services/productPicker/mapperSearch';
import type { ProductPickResult } from './productPickerContracts';

/* ------------------------------------------------------------------------ *
 * Two-source tabs (owner spec: Składniki PI default, Produkty second)       *
 * ------------------------------------------------------------------------ */

export type PickerSourceId = 'pi_ingredients' | 'products';

/** Stable tab order — the Mapper library is the PRIMARY catalogue. */
export const PICKER_SOURCE_ORDER: readonly PickerSourceId[] = ['pi_ingredients', 'products'];

/** The tab the picker opens on (owner decision). */
export const DEFAULT_PICKER_SOURCE: PickerSourceId = 'pi_ingredients';

/* ------------------------------------------------------------------------ *
 * Search hits (safe fields only)                                            *
 * ------------------------------------------------------------------------ */

/** One live search hit — exactly the demo-safe fields, feature-shaped. */
export interface SafeIngredientHit {
  /** Stable PI-ING-* id carried onto the recipe line on selection. */
  ingredientId: string;
  displayName: string;
  internalName: string | null;
  category: string | null;
  subcategory: string | null;
  /** Library approval flag — NOT a pac/pod guarantee (checked after selection). */
  engineApproved: boolean;
}

/** Map one demo-safe row to a hit. Pure; drops nothing it needs, adds nothing. */
export function safeRowToHit(row: SafeMapperSearchRow): SafeIngredientHit {
  return {
    ingredientId: row.ingredient_id,
    displayName: row.ingredient_name_display,
    internalName: row.ingredient_name_internal ?? null,
    category: row.ingredient_category ?? null,
    subcategory: row.ingredient_subcategory ?? null,
    engineApproved: row.approved_for_engines === true,
  };
}

/* ------------------------------------------------------------------------ *
 * Live search lifecycle (pure reducers, stale-request safe)                 *
 * ------------------------------------------------------------------------ */

export type LiveSearchPhase =
  | 'idle' // nothing asked yet
  | 'loading' // first page in flight
  | 'loading_more' // an incremental page in flight (existing hits stay)
  | 'ready' // hits shown
  | 'empty' // the query honestly matched nothing
  | 'error' // the search failed (retryable)
  | 'unavailable'; // no backend / read model not applied — say so, never fake empty

export interface LiveSearchState {
  phase: LiveSearchPhase;
  /** The text the CURRENT hits answer (used for the honest empty message). */
  query: string;
  hits: SafeIngredientHit[];
  hasMore: boolean;
  /** Monotonic id of the LATEST issued request — older settlements are ignored. */
  requestId: number;
  unavailableReason: CatalogueUnavailableReason | null;
}

export const INITIAL_LIVE_SEARCH: LiveSearchState = {
  phase: 'idle',
  query: '',
  hits: [],
  hasMore: false,
  requestId: 0,
  unavailableReason: null,
};

/** A fresh (page-0) search was issued. Prior hits clear — no stale rows linger. */
export function liveSearchStarted(state: LiveSearchState, query: string, requestId: number): LiveSearchState {
  return { ...state, phase: 'loading', query, hits: [], hasMore: false, requestId, unavailableReason: null };
}

/** An incremental page was issued. Existing hits stay visible while it loads. */
export function liveSearchMoreStarted(state: LiveSearchState, requestId: number): LiveSearchState {
  return { ...state, phase: 'loading_more', requestId };
}

/**
 * Settle a request. A settlement whose `requestId` is not the latest is STALE —
 * a newer search superseded it — and is dropped (this plus AbortController is
 * the cancellation story). Appended pages dedupe on the stable id.
 */
export function liveSearchSettled(
  state: LiveSearchState,
  requestId: number,
  outcome: MapperSearchOutcome,
  mode: 'replace' | 'append',
): LiveSearchState {
  if (requestId !== state.requestId) return state; // stale — a newer request owns the UI
  switch (outcome.kind) {
    case 'aborted':
      return state; // the superseding request will settle the state
    case 'unavailable':
      return { ...state, phase: 'unavailable', hits: [], hasMore: false, unavailableReason: outcome.reason };
    case 'error':
      // keep already-loaded hits on a failed "load more" so the customer loses nothing
      return { ...state, phase: 'error' };
    case 'results': {
      const incoming = outcome.rows.map(safeRowToHit);
      const hits =
        mode === 'append'
          ? [...state.hits, ...incoming.filter((h) => !state.hits.some((p) => p.ingredientId === h.ingredientId))]
          : incoming;
      return {
        ...state,
        phase: hits.length === 0 ? 'empty' : 'ready',
        hits,
        hasMore: outcome.hasMore,
        unavailableReason: null,
      };
    }
  }
}

/* ------------------------------------------------------------------------ *
 * Debounce (injectable timers → deterministic tests)                        *
 * ------------------------------------------------------------------------ */

export interface DebounceTimers {
  set: (run: () => void, delayMs: number) => unknown;
  clear: (handle: unknown) => void;
}

export interface Debouncer {
  /** Schedule `run` after the delay, replacing any pending run. */
  schedule(run: () => void): void;
  /** Drop any pending run. */
  cancel(): void;
}

/** ~250ms between the last keystroke and the live query. */
export const LIVE_SEARCH_DEBOUNCE_MS = 250;

/** A single-slot debouncer. Timers are injectable so tests run without a clock. */
export function createDebouncer(
  delayMs: number,
  timers: DebounceTimers = { set: (run, ms) => setTimeout(run, ms), clear: (h) => clearTimeout(h as never) },
): Debouncer {
  let pending: unknown = null;
  return {
    schedule(run) {
      if (pending !== null) timers.clear(pending);
      pending = timers.set(() => {
        pending = null;
        run();
      }, delayMs);
    },
    cancel() {
      if (pending !== null) timers.clear(pending);
      pending = null;
    },
  };
}

/* ------------------------------------------------------------------------ *
 * Selection → the EXISTING readiness gate (stable PI-ING-* id)              *
 * ------------------------------------------------------------------------ */

/**
 * Turn a selected Mapper hit + the (post-selection) rich-view reference into the
 * input of the EXISTING `pickProduct` gate. The synthetic product row is honest:
 * it carries NO own measurement (pac/pod null) and links through the stable
 * PI-ING-* id exactly like a matched product — so `evaluateProductReadiness`
 * resolves reference-linked values, or an honest needs-data when the reference
 * (or the session's right to read it) is missing. No new gate, nothing invented.
 */
export function ingredientPickInput(
  hit: Pick<SafeIngredientHit, 'ingredientId' | 'displayName'>,
  reference: ReferenceEngineValues | null,
): PickProductInput {
  return {
    productId: hit.ingredientId,
    product: {
      pac_value: null,
      pod_value: null,
      mapper_status: 'matched',
      matched_basement_id: hit.ingredientId,
    },
    reference,
  };
}

/** The post-selection engine-values fetch, as the sheet reports it. */
export type IngredientPickPhase =
  | 'idle'
  | 'fetching' // rich read model in flight
  | 'login_required' // anon session — exact engine values need signing in
  | 'unavailable' // backend not configured / rich view not applied
  | 'error'; // fetch failed (retry by picking again)

/* ------------------------------------------------------------------------ *
 * Compact rows (owner spec: dense rows, no metadata walls)                  *
 * ------------------------------------------------------------------------ */

export interface CompactRowLabels {
  engineApproved: string;
  needsVerification: string;
}

export interface CompactIngredientRowVm {
  key: string;
  /** Polish display name — the row title. */
  title: string;
  /** Canonical/internal name, small — or null when identical/absent. */
  subtitle: string | null;
  /** category · subcategory, small. */
  metaLine: string | null;
  /** Compact stable id (PI-ING-*). */
  idLabel: string;
  readinessLabel: string;
  readinessTone: 'ready' | 'needs_data';
}

/** Dense Mapper row: name / internal / category / PI-ING id / readiness. Pure. */
export function compactIngredientRow(hit: SafeIngredientHit, labels: CompactRowLabels): CompactIngredientRowVm {
  return {
    key: hit.ingredientId,
    title: hit.displayName,
    subtitle: hit.internalName && hit.internalName !== hit.displayName ? hit.internalName : null,
    metaLine: [hit.category, hit.subcategory].filter(Boolean).join(' · ') || null,
    idLabel: hit.ingredientId,
    readinessLabel: hit.engineApproved ? labels.engineApproved : labels.needsVerification,
    readinessTone: hit.engineApproved ? 'ready' : 'needs_data',
  };
}

export interface CompactProductRowVm {
  key: string;
  title: string;
  /** brand · package, small. */
  subtitle: string | null;
  /** Compact id/EAN line. */
  idLabel: string | null;
  statusLabel: string | null;
  readinessLabel: string;
  readinessTone: 'ready' | 'needs_data';
}

/** Dense product row: name / brand+package / id-EAN / status / readiness. Pure. */
export function compactProductRow(result: ProductPickResult, eanPrefix: string): CompactProductRowVm {
  const e = result.entry;
  const idBits = [e.productCode ?? e.productId, e.ean ? `${eanPrefix} ${e.ean}` : null].filter(Boolean);
  return {
    key: e.productId,
    title: e.displayName,
    subtitle: [e.brand, e.packageSize].filter(Boolean).join(' · ') || null,
    idLabel: idBits.join(' · ') || null,
    statusLabel: result.statusLabel,
    readinessLabel: result.readiness.badge,
    readinessTone: result.readiness.exactReady ? 'ready' : 'needs_data',
  };
}
