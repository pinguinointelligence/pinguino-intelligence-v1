/**
 * Pure STAGING data for proposed `mapper_basement` reference candidates — the missing references
 * that block several products. This is PROPOSAL-ONLY: it never writes to mapper_basement and it
 * carries NO engine pac/pod values (those are team-calibrated and must never be invented here).
 *
 *   - PURE: no DB, no service, no IO, no npac. Deterministic.
 *   - HONEST: every proposal is `needs_pacpod` (engine pac/pod are team-only) — none is `ready`.
 *     Composition is from cited public sources; missing fields are listed, not guessed.
 *
 * Source of the figures: the 6-family keyless research pass (USDA FoodData Central / EFSA /
 * manufacturer specs), summarised in docs/mapper/BASEMENT_REFERENCE_GAP_PROPOSALS.md.
 */

export type ProposalReadiness = 'ready' | 'needs_pacpod' | 'needs_source' | 'unsafe';
export type SourceConfidence = 'high' | 'medium' | 'low';

export interface ReferenceProposal {
  key: string;
  proposed_name: string;
  /** target basement ingredient_category (schema-valid vocab). */
  category: string;
  subcategory: string;
  /** PR product codes this reference would unlock the mapping for. */
  unlocks: string[];
  /** known composition per 100 g, from cited public sources (no engine pac/pod here). */
  known_composition: Partial<Record<
    'fat' | 'saturated_fat' | 'carbohydrate' | 'available_carbohydrate' | 'total_sugars' |
    'protein' | 'salt' | 'water' | 'total_solids' | 'fiber' | 'polyol' | 'kcal', number
  >>;
  /** fields still needing a verified/team source before insert. */
  missing_fields: string[];
  /** engine pac/pod are ALWAYS team-calibrated — true for every proposal. */
  needs_pacpod_calibration: boolean;
  source_confidence: SourceConfidence;
  sources: string[];
  readiness: ProposalReadiness;
  /** why this is NOT insert-ready (always set while pac/pod are missing). */
  do_not_insert_reason: string;
}

const PACPOD_BLOCK = 'Engine pac_value/pod_value are team-calibrated and not publicly sourceable — not insert-ready.';

export const REFERENCE_PROPOSALS: ReferenceProposal[] = [
  {
    key: 'greek_yogurt_full_fat',
    proposed_name: 'Greek Yogurt (full-fat, ≈10% MG)',
    category: 'dairy',
    subcategory: 'greek_yogurt',
    unlocks: ['PR-ING-000016', 'PR-ING-000017'],
    // The existing "Greek Yogurt — Standard" (PI-ING-000204) is 7.5% fat; PR-ING-000016/017 are
    // 10.8% fat, so the reference-linked handoff would understate fat by ~3.3pp. This proposes a
    // FATTIER greek variant. Composition is from the Hacendado label (a real product), not invented.
    known_composition: { fat: 10, carbohydrate: 4, total_sugars: 4, protein: 4, salt: 0.1, water: 81, total_solids: 19 },
    missing_fields: ['pac_value', 'pod_value', 'representative water/total_solids for ~10% greek', 'protein band (label 3.9 is low for "greek" — strained vs greek-style)'],
    needs_pacpod_calibration: true,
    source_confidence: 'medium',
    sources: ['Hacendado "Yogur griego natural" label (per 100 g)', 'existing PI-ING-000204 Greek Yogurt — Standard (lean variant)'],
    readiness: 'needs_pacpod',
    do_not_insert_reason: `${PACPOD_BLOCK} Also confirm whether this is a new PI-ING reference or a parameterised fat variant of PI-ING-000204.`,
  },
  {
    key: 'almond',
    proposed_name: 'Almond 100% (whole / ground / paste)',
    category: 'nut',
    subcategory: 'almond',
    unlocks: ['PR-ING-000040', 'PR-ING-000041', 'PR-ING-000042'],
    known_composition: { fat: 49.9, saturated_fat: 3.8, carbohydrate: 21.55, available_carbohydrate: 9, total_sugars: 4.35, protein: 21.15, salt: 0.003, water: 4.41, fiber: 12.5, polyol: 0, kcal: 579 },
    missing_fields: ['pac_value', 'pod_value', 'salt (reconcile USDA 0.003 vs Hacendado label 0.01)', 'per-SKU whole/ground/paste split'],
    needs_pacpod_calibration: true,
    source_confidence: 'high',
    sources: ['USDA FoodData Central SR Legacy 170567', 'Almond Board of California nutrient comparison'],
    readiness: 'needs_pacpod',
    do_not_insert_reason: PACPOD_BLOCK,
  },
  {
    key: 'erythritol',
    proposed_name: 'Erythritol (E-968)',
    category: 'sugar',
    subcategory: 'polyol',
    unlocks: ['PR-ING-000060', 'PR-ING-000062'],
    known_composition: { fat: 0, total_sugars: 0, protein: 0, water: 0, total_solids: 100, polyol: 100, kcal: 0 },
    missing_fields: ['pac_value', 'pod_value (specialized polyol handling)'],
    needs_pacpod_calibration: true,
    source_confidence: 'high',
    sources: ['EFSA 2023 re-evaluation of erythritol (E-968)', 'EU Reg. 1169/2011 Annex XIV (0 kcal)'],
    readiness: 'needs_pacpod',
    do_not_insert_reason: PACPOD_BLOCK,
  },
  {
    key: 'maltitol_polyols',
    proposed_name: 'Maltitol (E-965) / polyol family',
    category: 'sugar',
    subcategory: 'polyol',
    unlocks: ['PR-ING-000032'],
    known_composition: { fat: 0, total_sugars: 0, protein: 0, polyol: 100, total_solids: 100 },
    missing_fields: ['pac_value', 'pod_value (per polyol; maltitol moderate PAC, unlike erythritol)', 'relative-sweetness table re-citation'],
    needs_pacpod_calibration: true,
    source_confidence: 'medium',
    sources: ['EFSA polyol re-evaluations', 'sugar-alcohol relative-sweetness tables (re-confirm)'],
    readiness: 'needs_pacpod',
    do_not_insert_reason: PACPOD_BLOCK,
  },
  {
    key: 'steviol_stevia',
    proposed_name: 'Steviol glycosides (stevia, E-960)',
    category: 'sugar',
    subcategory: 'high_intensity',
    unlocks: ['PR-ING-000061', 'PR-ING-000062'],
    known_composition: { fat: 0, total_sugars: 0, protein: 0 },
    missing_fields: ['pac_value', 'pod_value (high-intensity, negligible mass)', 'pure-additive vs bulked-product profile'],
    needs_pacpod_calibration: true,
    source_confidence: 'medium',
    sources: ['EFSA E-960 opinion', 'JECFA'],
    readiness: 'needs_pacpod',
    do_not_insert_reason: `${PACPOD_BLOCK} High-intensity sweetener: needs special non-bulk engine handling.`,
  },
  {
    key: 'sucralose',
    proposed_name: 'Sucralose (E-955)',
    category: 'sugar',
    subcategory: 'high_intensity',
    unlocks: ['PR-ING-000060'],
    known_composition: { fat: 0, total_sugars: 0, protein: 0 },
    missing_fields: ['pac_value', 'pod_value (high-intensity, ~600x sucrose at trace dose)'],
    needs_pacpod_calibration: true,
    source_confidence: 'medium',
    sources: ['EFSA sucralose summary', 'Wikipedia (formula/potency)'],
    readiness: 'needs_pacpod',
    do_not_insert_reason: `${PACPOD_BLOCK} The pure E-955 differs from the bulked "Splenda"-type product.`,
  },
  {
    key: 'saccharin',
    proposed_name: 'Saccharin (E-954)',
    category: 'sugar',
    subcategory: 'high_intensity',
    unlocks: ['PR-ING-000063'],
    known_composition: { fat: 0, total_sugars: 0, protein: 0 },
    missing_fields: ['pac_value', 'pod_value', 'profile A (pure additive) vs B (bulked sachet, USDA FDC 169072)'],
    needs_pacpod_calibration: true,
    source_confidence: 'high',
    sources: ['EFSA E-954 re-evaluation', 'USDA FDC 169072 (bulked tabletop)'],
    readiness: 'needs_pacpod',
    do_not_insert_reason: `${PACPOD_BLOCK} Team must first resolve the pure-vs-bulked profile.`,
  },
];

/** Distinct PR product codes that at least one proposed reference would unlock. */
export function proposalUnlockedProducts(): string[] {
  return [...new Set(REFERENCE_PROPOSALS.flatMap((p) => p.unlocks))].sort();
}

/** The concrete next step for a proposal — pure, derived from its readiness/fields. */
export function proposalNextAction(p: ReferenceProposal): string {
  if (p.readiness === 'ready') return 'Stage a reviewed seed migration (human applies).';
  if (p.readiness === 'needs_source') return 'Find a verified composition source, then re-assess.';
  if (p.readiness === 'unsafe') return 'Do not pursue until the safety blocker is resolved.';
  return 'Team supplies calibrated PAC/POD (+ the listed missing fields); then a human inserts via a reviewed seed migration. No auto-insert.';
}

export interface ChecklistItem {
  field: string;
  /** present = a sourced value exists; missing = needs a verified source; team_only = only the
   * team's calibration can supply it (engine pac/pod — NEVER filled by this module). */
  status: 'present' | 'missing' | 'team_only';
}

/**
 * Per-proposal required-fields checklist for the staging surface. Pure + derived — it never
 * invents a value; pac/pod are ALWAYS team_only.
 */
export function proposalChecklist(p: ReferenceProposal): ChecklistItem[] {
  const has = (k: keyof ReferenceProposal['known_composition']) => p.known_composition[k] !== undefined;
  return [
    { field: 'category', status: p.category.trim() !== '' ? 'present' : 'missing' },
    { field: 'subcategory', status: p.subcategory.trim() !== '' ? 'present' : 'missing' },
    { field: 'label composition', status: has('fat') || has('carbohydrate') || has('total_sugars') || has('protein') ? 'present' : 'missing' },
    { field: 'water / total_solids', status: has('water') || has('total_solids') ? 'present' : 'missing' },
    { field: 'sugar / polyol split', status: has('total_sugars') || has('polyol') ? 'present' : 'missing' },
    { field: 'pac_value', status: 'team_only' },
    { field: 'pod_value', status: 'team_only' },
    { field: 'sources / provenance', status: p.sources.length > 0 ? 'present' : 'missing' },
  ];
}

export interface InsertReadiness {
  /** ALWAYS false from this module — pac/pod are team_only, so staging can never flip to ready. */
  ready: false;
  blocking: string[];
}

/** Insert readiness: ready ONLY when every checklist field is present — which cannot happen here
 * (pac/pod stay team_only), so this module can never authorise an insert. A human applies a
 * reviewed seed migration once the team supplies the calibrated values out-of-band. */
export function proposalInsertReadiness(p: ReferenceProposal): InsertReadiness {
  const blocking = proposalChecklist(p)
    .filter((i) => i.status !== 'present')
    .map((i) => (i.status === 'team_only' ? `${i.field} (team calibration)` : i.field));
  return { ready: false, blocking };
}

export interface ProposalDraft {
  /** typed by the TEAM in the staging UI — local component state only, never persisted here. */
  pac_value?: number | null;
  pod_value?: number | null;
  team_notes?: string;
}

/**
 * LOCAL-DRAFT readiness for the staging UI: ready ONLY when every non-engine checklist field is
 * present AND the team has typed finite pac/pod values. The values come from the TEAM's input —
 * this module never invents them, persists nothing, and the base `proposalInsertReadiness`
 * stays permanently blocked. A ready draft is handed to a human seed migration out-of-band.
 */
export function draftReadiness(
  p: ReferenceProposal,
  draft: ProposalDraft,
): { ready: boolean; blocking: string[] } {
  const blocking = proposalChecklist(p)
    .filter((i) => i.status === 'missing')
    .map((i) => i.field);
  const pacOk = typeof draft.pac_value === 'number' && Number.isFinite(draft.pac_value);
  const podOk = typeof draft.pod_value === 'number' && Number.isFinite(draft.pod_value);
  if (!pacOk) blocking.push('pac_value (team calibration — not entered)');
  if (!podOk) blocking.push('pod_value (team calibration — not entered)');
  return { ready: blocking.length === 0, blocking };
}

export interface ProposalFilter {
  readiness?: ProposalReadiness | 'all';
  category?: string; // 'all' | <category>
  unlocks?: string; // substring of a PR code, or ''
}

/** Pure client-side filter over the proposals (readiness / category / unlocked-product substring). */
export function filterProposals(proposals: readonly ReferenceProposal[], f: ProposalFilter): ReferenceProposal[] {
  const want = (f.unlocks ?? '').trim().toLowerCase();
  return proposals.filter((p) => {
    if (f.readiness && f.readiness !== 'all' && p.readiness !== f.readiness) return false;
    if (f.category && f.category !== 'all' && p.category !== f.category) return false;
    if (want !== '' && !p.unlocks.some((u) => u.toLowerCase().includes(want))) return false;
    return true;
  });
}
