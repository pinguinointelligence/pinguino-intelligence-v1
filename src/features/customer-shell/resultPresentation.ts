/**
 * Pure presentation helpers for the recipe RESULT / PODGLĄD screen.
 *
 * Owner UX correction (2026-07-17, „PROFIL MASZYNY I UPROSZCZENIE PODGLĄDU
 * HOME”): the big „RODZAJ / TRYB / ILOŚĆ” card is replaced by a compact context
 * line („Gelato mleczne · 1330 g”), the internal serving mode („Świeże”) is not
 * shown to a Home customer, and the two conflicting status banners collapse into
 * ONE unambiguous status. This module holds that decision logic so it is unit
 * tested away from the (statically-unreachable) result render.
 */
import type { CustomerPersona, CustomerProductType } from '@/features/customer-flow';
import { customerShellCopy as copy } from './customerShellCopy';

/**
 * Owner UX correction §3/§10: the „Dane techniczne” disclosure (and the internal
 * serving mode it exposes) is a PROFESSIONAL / Expert-Mode surface. The Home /
 * Demo customer never sees it — the simplified Home Monitor is enough.
 */
export function showTechnicalDetails(persona: CustomerPersona): boolean {
  return persona === 'pro';
}

/** Polish plural of „składnik” (1 / 2–4 / 5+). */
export function pluralSkladnik(n: number): string {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (abs === 1) return copy.result.needsRefinementNoun.one;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return copy.result.needsRefinementNoun.few;
  return copy.result.needsRefinementNoun.many;
}

/** Polish plural of „produkt” (1 / 2–4 / 5+). */
export function pluralProdukt(n: number): string {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (abs === 1) return copy.result.status.productNoun.one;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return copy.result.status.productNoun.few;
  return copy.result.status.productNoun.many;
}

/** Grams → „1330 g” / „5 kg” / „—”. Single source for every batch display. */
export function formatBatchGrams(grams: number | null): string {
  if (grams === null) return '—';
  if (grams % 1000 === 0) return `${grams / 1000} kg`;
  return `${grams} ${copy.device.unitGrams}`;
}

/**
 * The COMPACT recipe context line (owner §4/§5): „Gelato mleczne · 1330 g”.
 * The machine is shown separately in the context bar, so it is NOT repeated
 * here, and the internal serving mode („Świeże”) never appears.
 */
export function compactRecipeContext(type: CustomerProductType, grams: number | null): string {
  const typeLabel = copy.productType.compact[type] ?? copy.productType.short[type];
  return `${typeLabel} · ${formatBatchGrams(grams)}`;
}

export type ResultStatusKind = 'needs_products' | 'ready_recalc' | 'ready_preview';

export interface ResultStatusView {
  kind: ResultStatusKind;
  /** The single status label — exactly one is shown (owner §11). */
  label: string;
  /** Optional one-line guidance beneath the status; null when nothing to add. */
  guidance: string | null;
}

/**
 * The SINGLE result status (owner §11). Priority:
 *   1. open flavour lines → „Wymaga wyboru N produktów” + required-products guidance;
 *   2. engine-CALCULATED + grams unlocked → „Gotowa do przeliczenia”;
 *   3. otherwise (preview, or a not-yet-calculated structure) → „Receptura gotowa
 *      do podglądu”.
 * „Gotowa do przeliczenia” is claimed ONLY for a genuinely engine-calculated card —
 * a structure-only preview (e.g. a catalogue draft) is never called ready-to-recalc.
 * Never emits both „prawie gotowa” and „wyliczona przez silnik” at once.
 */
export function resultStatus(input: {
  unresolvedCount: number;
  gramsVisible: boolean;
  outOfBand: boolean;
  /** True only when the engine produced a real recipe (not a structure-only preview). */
  calculated: boolean;
  /**
   * False when interactive Monitor tuning is unavailable for this serving
   * temperature (Track G) — the out-of-band guidance must then not point the
   * customer at tuning controls that honestly cannot run. Default true.
   */
  tuningAvailable?: boolean;
}): ResultStatusView {
  if (input.unresolvedCount > 0) {
    const n = input.unresolvedCount;
    return {
      kind: 'needs_products',
      label: `${copy.result.status.needsProductsPrefix} ${n} ${pluralProdukt(n)}`,
      guidance: `${copy.result.status.needsProductsGuidancePrefix} ${n} ${pluralSkladnik(n)}${copy.result.status.needsProductsGuidanceSuffix}`,
    };
  }
  // Not engine-calculated (structure-only preview / catalogue draft): stay a
  // preview and say so honestly — never claim it is ready to recalculate.
  if (!input.calculated) {
    return { kind: 'ready_preview', label: copy.result.status.readyPreview, guidance: copy.result.stateStructureOnly };
  }
  const guidance = input.outOfBand
    ? input.tuningAvailable === false
      ? copy.result.stateOutOfBandNoTuning
      : copy.result.stateOutOfBand
    : null;
  if (input.gramsVisible) {
    return { kind: 'ready_recalc', label: copy.result.status.readyRecalc, guidance };
  }
  return { kind: 'ready_preview', label: copy.result.status.readyPreview, guidance };
}
