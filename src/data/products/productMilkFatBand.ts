/**
 * Pure deterministic MILK fat-band helper. Spanish/English milk-type words declare a fat band
 * (entera→whole ≈3.0–3.8 · semidesnatada→semi ≈1.0–1.8 · desnatada→skim ≈0–0.5); a candidate
 * pool is then narrowed to milk-NAMED references whose STORED fat_percent falls inside the band.
 * Composition-driven (the ref's actual fat, never a name-parsed number) and deliberately narrow:
 *
 *   - Applies ONLY when the product name carries BOTH the milk concept (leche/milk) and a
 *     fat-level word — yogurt/cream/"desnatado" desserts are never banded.
 *   - LACTOSE-FREE milks are EXCLUDED (returns null): "sin lactosa" hydrolyses lactose to
 *     glucose+galactose, which changes the PAC/POD-relevant sugar composition — a regular-milk
 *     reference must not be silently suggested for them.
 *   - PROTEIN-FORTIFIED milks are EXCLUDED (+Proteínas is red-flagged anyway).
 *   - Only references whose NAME carries the milk concept are band-eligible (buttermilk,
 *     yogurt, cream and powders are out by name or by fat).
 *
 * PURE: no DB, no service, no IO, no npac. Deterministic.
 */
import { normalizeTokens } from './productNameTiebreak';

export type MilkFatLevel = 'whole' | 'semi' | 'skim';

/** Fat bands (per 100 g) for liquid milk. Non-overlapping; edges chosen so a 2.0%-fat ref is
 * NOT "semi" (EU semi-skimmed is 1.5–1.8) and a 1.6 ref is not "skim". */
export const MILK_FAT_BANDS: Record<MilkFatLevel, { min: number; max: number }> = {
  whole: { min: 3.0, max: 3.8 },
  semi: { min: 1.0, max: 1.8 },
  skim: { min: 0, max: 0.5 },
};

const MILK_TOKENS = new Set(['milk', 'leche']);
const LACTOSE_TOKENS = new Set(['lactosa', 'lactose']);
const PROTEIN_TOKENS = new Set(['proteinas', 'proteina', 'protein', 'proteins']);
const WHOLE_TOKENS = new Set(['entera', 'entero', 'whole']);
const SEMI_TOKENS = new Set(['semidesnatada', 'semidesnatado', 'semiskimmed']);
const SKIM_TOKENS = new Set(['desnatada', 'desnatado', 'skimmed', 'skim']);

const hasAny = (tokens: string[], set: Set<string>) => tokens.some((t) => set.has(t));

/**
 * The declared milk fat level of a PRODUCT name, or null when banding must not apply
 * (not a milk, lactose-free, protein-fortified, or no fat-level word).
 */
export function milkFatLevelFromName(name: string): MilkFatLevel | null {
  const tokens = normalizeTokens(name);
  if (!hasAny(tokens, MILK_TOKENS)) return null; // not a milk (yogurt desnatado etc. never band)
  if (hasAny(tokens, LACTOSE_TOKENS)) return null; // lactose-free: sugar composition differs
  if (hasAny(tokens, PROTEIN_TOKENS)) return null; // fortified: red-flag territory
  if (hasAny(tokens, SEMI_TOKENS) || (tokens.includes('semi') && hasAny(tokens, SKIM_TOKENS))) return 'semi';
  if (hasAny(tokens, SKIM_TOKENS)) return 'skim';
  if (hasAny(tokens, WHOLE_TOKENS)) return 'whole';
  return null;
}

export interface MilkBandCandidate {
  id: string;
  name: string;
  /** the reference's STORED fat_percent (already coerced to a finite number, or null). */
  fat: number | null;
}

/**
 * The candidate ids that are milk-NAMED and inside the product's declared fat band, or null when
 * banding does not apply to this product. An empty array means "band applies but no reference
 * fits" (a reference gap — the caller must NOT narrow onto an out-of-band ref).
 */
export function milkBandCandidateIds(
  productName: string,
  candidates: ReadonlyArray<MilkBandCandidate>,
): string[] | null {
  const level = milkFatLevelFromName(productName);
  if (level === null) return null;
  const band = MILK_FAT_BANDS[level];
  return candidates
    .filter((c) => c.fat !== null && c.fat >= band.min && c.fat <= band.max && hasAny(normalizeTokens(c.name), MILK_TOKENS))
    .map((c) => c.id);
}
