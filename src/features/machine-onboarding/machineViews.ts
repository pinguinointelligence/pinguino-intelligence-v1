/**
 * PINGÜINO Machine Onboarding — PURE view-model builders.
 *
 * Everything the components render is computed here so honesty rules are
 * node-testable without a DOM:
 *  - §8.2 tile view models (selectable = active AND activatable records;
 *    disabled families stay visible with the honest note);
 *  - search filtering (label / brand / family / model code, diacritic-lax);
 *  - machine display names (no engine names, no technology codes);
 *  - §7.3 context-bar view (name + catalog vessel figure ONLY);
 *  - batch presentation (owner grams as „Zalecany wsad PINGÜINO” / honest ml /
 *    honest none) + the container-split notice;
 *  - §8.5 auto-config lines (honest amount line variant).
 */
import type {
  ContainerSplitPlan,
  HomeMachineProfile,
  MachineDerivation,
} from '@/features/machine-catalog';
import {
  MACHINE_CATALOG,
  MACHINE_ONBOARDING_TILES,
  isMachineActivatable,
  planContainerSplit,
  type MachineOnboardingTile,
} from '@/features/machine-catalog';
import { machineOnboardingCopy as copy } from './machineOnboardingCopy';
import { recommendedBatchGramsOf, type MachinePreferenceRecord } from './preferenceContracts';

/* ------------------------------------------------------------------ */
/* Display name                                                        */
/* ------------------------------------------------------------------ */

/** Customer-facing machine name: brand + family (never technology / engine). */
export function machineDisplayName(profile: HomeMachineProfile): string {
  if (profile.family === 'custom') {
    const parts = [profile.brand, profile.modelCodes[0] ?? ''].map((p) => p.trim()).filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : copy.profile.customName;
  }
  return `${profile.brand} ${profile.family}`.trim();
}

/* ------------------------------------------------------------------ */
/* §8.2 tiles                                                          */
/* ------------------------------------------------------------------ */

export interface MachineTileView {
  readonly id: string;
  readonly label: string;
  readonly kind: MachineOnboardingTile['kind'];
  /** True when the tile can be chosen (≥ 1 offered record, or "not listed"). */
  readonly selectable: boolean;
  /** Honest short note when disabled (e.g. „w trakcie weryfikacji pojemności”). */
  readonly note: string | null;
  /** The OFFERED records behind the tile (active AND activatable). */
  readonly selectableProfiles: readonly HomeMachineProfile[];
  /** True when choosing the tile needs a model disambiguation step. */
  readonly needsDisambiguation: boolean;
}

function profilesById(catalog: readonly HomeMachineProfile[]): ReadonlyMap<string, HomeMachineProfile> {
  return new Map(catalog.map((p) => [p.id, p] as const));
}

/**
 * Build the §8.2 tile views. A family tile is selectable when at least one of
 * its catalog records is offered (flagged active AND allowed to activate —
 * §9.3). Families with no offered record stay VISIBLE but disabled with the
 * honest verification note. The "not listed" tile is always selectable.
 */
export function buildMachineTileViews(
  tiles: readonly MachineOnboardingTile[] = MACHINE_ONBOARDING_TILES,
  catalog: readonly HomeMachineProfile[] = MACHINE_CATALOG,
): readonly MachineTileView[] {
  const byId = profilesById(catalog);
  return tiles.map((tile) => {
    if (tile.kind === 'not_listed') {
      return {
        id: tile.id,
        label: tile.label,
        kind: tile.kind,
        selectable: true,
        note: null,
        selectableProfiles: [],
        needsDisambiguation: false,
      };
    }
    const records = tile.catalogIds
      .map((id) => byId.get(id))
      .filter((p): p is HomeMachineProfile => p !== undefined);
    const offered = records.filter((p) => p.active && isMachineActivatable(p));
    return {
      id: tile.id,
      label: tile.label,
      kind: tile.kind,
      selectable: offered.length > 0,
      note: offered.length > 0 ? null : copy.tiles.unavailableNote,
      selectableProfiles: offered,
      needsDisambiguation: offered.length > 1,
    };
  });
}

/** Diacritic-lax, case-insensitive haystack normalization for search. */
function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/**
 * Filter tile views by a search query (label, brand, family or model code of
 * ANY record behind the tile — offered or not, so a disabled family is still
 * findable with its honest note). Empty query returns everything.
 */
export function searchMachineTiles(
  views: readonly MachineTileView[],
  query: string,
  catalog: readonly HomeMachineProfile[] = MACHINE_CATALOG,
  tiles: readonly MachineOnboardingTile[] = MACHINE_ONBOARDING_TILES,
): readonly MachineTileView[] {
  const wanted = normalizeForSearch(query.trim());
  if (wanted.length === 0) return views;
  const byId = profilesById(catalog);
  const tileById = new Map(tiles.map((t) => [t.id, t] as const));
  return views.filter((view) => {
    if (view.kind === 'not_listed') return true; // the escape hatch stays visible
    const haystack: string[] = [view.label];
    const tile = tileById.get(view.id);
    for (const recordId of tile?.catalogIds ?? []) {
      const profile = byId.get(recordId);
      if (!profile) continue;
      haystack.push(profile.brand, profile.family, ...profile.modelCodes);
    }
    return haystack.some((h) => normalizeForSearch(h).includes(wanted));
  });
}

/* ------------------------------------------------------------------ */
/* Batch presentation (derived grams with provenance, honest none)     */
/* ------------------------------------------------------------------ */

export type BatchPresentation =
  | {
      readonly kind: 'pinguino_grams';
      readonly label: string;
      readonly text: string;
      /** Honest ESTIMATED note for user-declared capacity; null for official. */
      readonly note: string | null;
    }
  | { readonly kind: 'user_choice'; readonly text: string };

/** Polish grams formatting: whole numbers plain, otherwise one decimal with a comma. */
export function formatGrams(grams: number): string {
  if (Number.isInteger(grams)) return String(grams);
  return grams.toFixed(1).replace('.', ',');
}

/**
 * Present a derived batch suggestion honestly:
 *  - derived grams → „Zalecany wsad PINGÜINO: 460 g” (NEVER framed as the
 *    manufacturer's official figure; ESTIMATED note for user-declared data);
 *  - none → the honest user-choice / verification note.
 */
export function presentBatchSuggestion(derivation: MachineDerivation): BatchPresentation {
  const suggestion = derivation.batchSuggestion;
  if (suggestion.kind === 'recommended_grams') {
    return {
      kind: 'pinguino_grams',
      label: copy.batch.recommendedLabel,
      text: `${formatGrams(suggestion.grams)} ${copy.batch.recommendedUnit}`,
      note: suggestion.estimated ? copy.batch.estimatedNote : null,
    };
  }
  return {
    kind: 'user_choice',
    text:
      suggestion.reason === 'capacity_conflict_unresolved'
        ? copy.batch.conflictNote
        : copy.batch.userChoiceNote,
  };
}

export interface ContainerSplitNotice {
  readonly plan: ContainerSplitPlan;
  /** Owner verbatim message („Ta ilość wymaga N pojemników. …”). */
  readonly message: string;
  /** Secondary detail („N pojemniki/pojemników po X g”, even split). */
  readonly detail: string;
}

/**
 * The split notice for a requested batch, or null when one container suffices
 * (or no per-container limit / invalid request). The user can always prepare
 * LESS; wanting more never overfills one container — the limit is the derived
 * `recommendedBatchGrams`.
 */
export function containerSplitNotice(
  requestedGrams: number,
  recommendedBatchGrams: number | null,
): ContainerSplitNotice | null {
  if (recommendedBatchGrams === null) return null;
  const plan = planContainerSplit(requestedGrams, recommendedBatchGrams);
  if (plan === null || plan.withinSingleContainer) return null;
  return {
    plan,
    message: copy.split.message(plan.containers),
    detail: copy.split.detail(plan.containers, formatGrams(plan.gramsPerContainer)),
  };
}

/* ------------------------------------------------------------------ */
/* §8.5 auto-config lines                                              */
/* ------------------------------------------------------------------ */

/**
 * The four §8.5 checkmark lines. The amount line stays HONEST: the spec's
 * „Ustawiono właściwą ilość” only when a trustworthy amount exists (owner
 * grams or pourable ml); otherwise „Przygotowano wybór ilości”.
 */
export function autoConfigLines(derivation: MachineDerivation): readonly string[] {
  const hasAmount = derivation.batchSuggestion.kind !== 'none';
  return [
    copy.autoConfig.recognized,
    hasAmount ? copy.autoConfig.amountSet : copy.autoConfig.amountUserChoice,
    copy.autoConfig.methodMatched,
    copy.autoConfig.studioReady,
  ];
}

/* ------------------------------------------------------------------ */
/* §7.3 context bar + profile views                                    */
/* ------------------------------------------------------------------ */

export interface MachineContextView {
  /** Customer-facing machine name (no engine name, no technology code). */
  readonly name: string;
  /** Vessel figure FROM THE CATALOG RECORD, or null (then show name only). */
  readonly vesselMl: number | null;
  /**
   * The derived „Zalecany wsad PINGÜINO” carried for the batch surfaces (also
   * the per-container split limit) — the §7.3 bar itself does NOT display it.
   */
  readonly recommendedBatchGrams: number | null;
}

/** Resolve the profile a saved preference points at (catalog id or custom). */
export function resolvePreferenceProfile(
  record: MachinePreferenceRecord,
  catalog: readonly HomeMachineProfile[] = MACHINE_CATALOG,
): HomeMachineProfile | null {
  if (record.selection.kind === 'custom') return record.selection.customProfile;
  const id = record.selection.machineProfileId;
  return catalog.find((p) => p.id === id) ?? null;
}

/**
 * Build the §7.3 context-bar view for a saved preference. Capacity comes from
 * the resolved catalog record — or from the user's OWN container once they
 * declared one (owner hotfix §8); a stale catalog id (record removed) yields
 * null → the orchestrator re-runs onboarding instead of showing invented data.
 */
export function buildMachineContextView(
  record: MachinePreferenceRecord,
  catalog: readonly HomeMachineProfile[] = MACHINE_CATALOG,
): MachineContextView | null {
  const profile = resolvePreferenceProfile(record, catalog);
  if (profile === null) return null;
  return {
    name: machineDisplayName(profile),
    vesselMl: record.customContainer?.capacityMl ?? profile.capacity.vesselCapacityMl,
    recommendedBatchGrams: recommendedBatchGramsOf(record),
  };
}

/*
 * The §8.6 profile SECTION view moved to `machineSettingsView.ts` with the
 * owner hotfix (2026-07-17): „Moja maszyna” is a settings surface (own default
 * batch + own container), not a read-only card, and one view model must not
 * compete with another.
 */
