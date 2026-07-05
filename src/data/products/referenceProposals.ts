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
    key: 'skim_milk',
    proposed_name: 'Skimmed Milk (liquid, ≈0.1–0.3% fat)',
    category: 'dairy',
    subcategory: 'milk_skimmed',
    unlocks: ['PR-ING-000004'],
    // The basement has NO liquid skimmed milk (nothing between the 1.6-fat Milk 1.5% and the
    // powders) — the fat-band audit found zero in-band refs for "desnatada". Label composition
    // from the real product (Hacendado leche desnatada).
    known_composition: { fat: 0.3, carbohydrate: 4.8, total_sugars: 4.8, protein: 3.2, salt: 0.13, water: 91, total_solids: 9 },
    missing_fields: ['pac_value', 'pod_value', 'representative water/total_solids for skim milk'],
    needs_pacpod_calibration: true,
    source_confidence: 'medium',
    sources: ['Hacendado "Leche desnatada" label (per 100 g)', 'fat-band audit: no milk ref inside skim band 0–0.5'],
    readiness: 'needs_pacpod',
    do_not_insert_reason: PACPOD_BLOCK,
  },
  {
    key: 'lactose_free_milk',
    proposed_name: 'Lactose-free Milk (semi / whole, hydrolysed lactose)',
    category: 'dairy',
    subcategory: 'milk_lactose_free',
    unlocks: ['PR-ING-000007', 'PR-ING-000008'],
    // Lactose-free milk hydrolyses lactose into glucose+galactose: the same total sugars but
    // monosaccharides — HIGHER freezing-point depression and sweetness than regular milk. A
    // regular-milk reference must not represent it (the fat-band helper deliberately excludes
    // "sin lactosa" names), so a dedicated reference with team-calibrated pac/pod is needed.
    known_composition: { fat: 1.55, carbohydrate: 4.7, total_sugars: 4.7, protein: 3.2, salt: 0.13 },
    missing_fields: ['pac_value', 'pod_value (hydrolysed glucose+galactose — NOT regular-milk values)', 'whole vs semi variant split', 'water/total_solids'],
    needs_pacpod_calibration: true,
    source_confidence: 'medium',
    sources: ['Hacendado "sin lactosa" labels (per 100 g)', 'lactase hydrolysis: lactose → glucose + galactose (standard dairy science)'],
    readiness: 'needs_pacpod',
    do_not_insert_reason: `${PACPOD_BLOCK} Hydrolysed sugars need their own calibration — never copy regular-milk pac/pod.`,
  },
  {
    key: 'plain_yogurt_whole',
    proposed_name: 'Plain Yogurt (whole-milk, ≈3% fat, unstrained)',
    category: 'dairy',
    subcategory: 'yogurt_plain',
    unlocks: ['PR-ING-000014'],
    // The class-correct "Natural Yogurt — Standard" (2/5.4/3.6/4.7 f/c/s/p) mismatches the Spanish
    // standard yogur natural (3/4.5/4.5/3.5) by fat −1pp / protein +1.2pp / sugars −0.9pp; the
    // Greek-type ref is a strained profile (sugars 2.7). Label composition from the real product.
    known_composition: { fat: 3, carbohydrate: 4.5, total_sugars: 4.5, protein: 3.5, salt: 0.1 },
    missing_fields: ['pac_value', 'pod_value', 'water/total_solids', 'lactose split'],
    needs_pacpod_calibration: true,
    source_confidence: 'medium',
    sources: ['Hacendado "Yogur natural" label (per 100 g)', 'review audit: no unstrained ~3%-fat plain-yogurt ref fits'],
    readiness: 'needs_pacpod',
    do_not_insert_reason: PACPOD_BLOCK,
  },
  {
    key: 'kefir',
    proposed_name: 'Kefir (natural, ≈4% fat)',
    category: 'dairy',
    subcategory: 'kefir',
    unlocks: ['PR-ING-000022', 'PR-ING-000023'],
    // No kefir reference exists; the closest composition is a YOGURT (different fermented class,
    // different cultures) — not a safe class-proxy. Label composition from the real product; note
    // the LOW residual sugars (2.3) from fermentation.
    known_composition: { fat: 4.2, carbohydrate: 5.1, total_sugars: 2.3, protein: 3.9, salt: 0.08 },
    missing_fields: ['pac_value', 'pod_value', 'water/total_solids', 'fermentation sugar split (low residual lactose)'],
    needs_pacpod_calibration: true,
    source_confidence: 'medium',
    sources: ['Hacendado "Kéfir natural" label (per 100 g)', 'review audit: no kefir ref; closest is a yogurt (wrong class)'],
    readiness: 'needs_pacpod',
    do_not_insert_reason: PACPOD_BLOCK,
  },
  {
    key: 'cocoa_powder',
    proposed_name: 'Cocoa Powder (pure, 10–14% fat)',
    category: 'chocolate',
    subcategory: 'cocoa_powder',
    unlocks: ['PR-ING-000033'],
    // The basement has NO pure cocoa-powder reference (only couvertures / cocoa-containing
    // compounds / cocoa butter) — the composition audit found zero candidates within tolerance.
    known_composition: { fat: 14, carbohydrate: 16, total_sugars: 2, protein: 21, salt: 0.1 },
    missing_fields: ['pac_value', 'pod_value', 'water/total_solids', 'fiber', 'available vs by-difference carbohydrate'],
    needs_pacpod_calibration: true,
    source_confidence: 'medium',
    sources: ['La Chocolatera "Cacao puro 0% azúcares añadidos" label (per 100 g)', 'basement audit: no pure cocoa-powder ref'],
    readiness: 'needs_pacpod',
    do_not_insert_reason: `${PACPOD_BLOCK} Product is also name-flagged (0% azúcares) — never auto-verifies after mapping.`,
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

export const CALIBRATION_PACK_WARNING =
  'PREVIEW ONLY — this pack never writes to the locked reference base. The TEAM supplies the calibrated PAC/POD values; a human then applies a reviewed seed migration out-of-band.';

const PACPOD_REQUIRED = 'REQUIRED — team calibration';

export interface CalibrationPackEntry {
  key: string;
  proposed_name: string;
  category: string;
  subcategory: string;
  known_composition: ReferenceProposal['known_composition'];
  missing_fields: string[];
  /** the team's typed value, or the REQUIRED marker — this module never invents a number. */
  pac_value: number | string;
  pod_value: number | string;
  unlocks: string[];
  sources: string[];
  team_notes: string | null;
  readiness: 'ready_local_draft' | 'blocked';
}

/**
 * The TEAM CALIBRATION PACK: every proposal with its known/missing fields and the pac/pod slots
 * the team must fill. Drafts (typed locally in the staging UI) flow in verbatim; without them the
 * engine slots carry the REQUIRED marker. Pure preview — persists nothing, writes nowhere.
 */
export function buildCalibrationPack(
  drafts: Record<string, ProposalDraft> = {},
): { warning: string; entries: CalibrationPackEntry[] } {
  const entries = REFERENCE_PROPOSALS.map<CalibrationPackEntry>((p) => {
    const draft = drafts[p.key] ?? {};
    const pacOk = typeof draft.pac_value === 'number' && Number.isFinite(draft.pac_value);
    const podOk = typeof draft.pod_value === 'number' && Number.isFinite(draft.pod_value);
    return {
      key: p.key,
      proposed_name: p.proposed_name,
      category: p.category,
      subcategory: p.subcategory,
      known_composition: p.known_composition,
      missing_fields: p.missing_fields,
      pac_value: pacOk ? (draft.pac_value as number) : PACPOD_REQUIRED,
      pod_value: podOk ? (draft.pod_value as number) : PACPOD_REQUIRED,
      unlocks: p.unlocks,
      sources: p.sources,
      team_notes: draft.team_notes?.trim() || null,
      readiness: draftReadiness(p, draft).ready ? 'ready_local_draft' : 'blocked',
    };
  });
  return { warning: CALIBRATION_PACK_WARNING, entries };
}

/** The pack as pretty JSON (for copy/hand-off). */
export function calibrationPackJson(drafts: Record<string, ProposalDraft> = {}): string {
  return JSON.stringify(buildCalibrationPack(drafts), null, 2);
}

const csvCell = (v: unknown): string => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** The pack as CSV (one row per proposal; list fields joined with |, composition as k=v pairs). */
export function calibrationPackCsv(drafts: Record<string, ProposalDraft> = {}): string {
  const { entries } = buildCalibrationPack(drafts);
  const header = ['key', 'proposed_name', 'category', 'subcategory', 'known_composition', 'missing_fields', 'pac_value', 'pod_value', 'unlocks', 'sources', 'team_notes', 'readiness'];
  const rows = entries.map((e) =>
    [
      e.key,
      e.proposed_name,
      e.category,
      e.subcategory,
      Object.entries(e.known_composition).map(([k, v]) => `${k}=${v}`).join(' '),
      e.missing_fields.join(' | '),
      e.pac_value,
      e.pod_value,
      e.unlocks.join(' | '),
      e.sources.join(' | '),
      e.team_notes ?? '',
      e.readiness,
    ].map(csvCell).join(','),
  );
  return [header.map(csvCell).join(','), ...rows].join('\n');
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
