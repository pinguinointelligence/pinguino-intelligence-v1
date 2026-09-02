/**
 * PINGÜINO — Protein Engine v2 SCIENCE AUTHORITY (single provenance table).
 *
 * Every numeric constant that Protein v2 introduces lives here with its exact
 * source. Nothing in this file is invented: each value is either (a) transcribed
 * from a named peer-reviewed controlled study, (b) a regulatory threshold, or
 * (c) an already-approved in-repo band that is REUSED without change.
 *
 * AUTHORITY CLASSES USED BY THIS FILE
 *   HARD        — may invalidate a recipe. Only the regulatory qualification.
 *   QUALITY     — ranking / scoring / warnings only. Never invalidates.
 *   ADVISORY    — surfaced to the user, never scored, never gating.
 *
 * Deliberately NOT introduced as hard authority (Product_Profile §11 rationale):
 * overrun, hardness, meltdown, air-cell size and sensory are strongly
 * machine-, homogenisation- and ageing-dependent. They are used here only as
 * QUALITY proxies for candidate ranking.
 */

export type ProteinAuthorityClass = 'HARD' | 'QUALITY' | 'ADVISORY';

export interface ProteinEvidenceSource {
  readonly key: string;
  readonly citation: string;
  readonly doi: string;
  readonly design: string;
}

/**
 * The controlled datasets Protein v2 is calibrated and validated against.
 * `design` records the exact formulation the numbers belong to, because every
 * measured value below is only valid inside that formulation window.
 */
export const PROTEIN_EVIDENCE_SOURCES = {
  AFR_2022_WPI_CONCENTRATION: {
    key: 'AFR_2022_WPI_CONCENTRATION',
    citation:
      'Quality attributes of high protein ice cream prepared by incorporation of whey protein isolate. Applied Food Research 2(1) 100029, 2022.',
    doi: '10.1016/j.afres.2021.100029',
    design:
      'Buffalo-milk ice cream, WPI added to reach 6 / 8 / 10 % protein against an approx. 4 % protein control.',
  },
  JFS_2026_PROTEIN_SOURCE: {
    key: 'JFS_2026_PROTEIN_SOURCE',
    citation:
      'VanWees, Rankin & Hartel. Microstructural and Physical Properties of High-Protein, High-Overrun Frozen Desserts. Journal of Food Science, 2026.',
    doi: '10.1111/1750-3841.70944',
    design:
      'Fixed 6 % protein / 12 % fat / 6.3 % lactose / 14.51 % sucrose / 0.2 % stabilizer, protein supplied separately by MPC (7.32 % powder), NaCN (6.54 %) or WPI (6.48 %), with 0 or 0.15 % mono-/diglycerides, at 100 % and 150 % overrun.',
  },
  IJFP_2025_WHEY_CASEIN_RATIO: {
    key: 'IJFP_2025_WHEY_CASEIN_RATIO',
    citation:
      'Effect of altering the whey protein/casein ratio on quality properties of ice cream. International Journal of Food Properties, 2025.',
    doi: '10.1080/10942912.2025.2459390',
    design:
      'Fixed 4.5 % total protein / 13 % fat / 42 % total solids, whey:casein 13/87, 20/80, 33/67, 45/55, 54/46.',
  },
  JDS_2005_MPC_DSC: {
    key: 'JDS_2005_MPC_DSC',
    citation:
      'Physical Properties of Ice Cream Containing Milk Protein Concentrates. Journal of Dairy Science 88(3):862-871, 2005.',
    doi: '10.3168/jds.S0022-0302(05)72752-1',
    design:
      'MPC56 / MPC85 substituted for nonfat milk solids at constant protein, total solids held with polydextrose; DSC freezing/melting.',
  },
  LWT_2021_PROTEIN_EMULSIFIER: {
    key: 'LWT_2021_PROTEIN_EMULSIFIER',
    citation:
      'Effect of emulsifier blend on quality attributes and storage of high protein buffalo milk ice cream. LWT 150:111903, 2021.',
    doi: '10.1016/j.lwt.2021.111903',
    design:
      'Buffalo-milk WPI ice cream at 6 / 8 / 10 % protein, GMS:polysorbate-80 blend swept 0-100 % PS80.',
  },
  EU_1924_2006_PROTEIN_CLAIM: {
    key: 'EU_1924_2006_PROTEIN_CLAIM',
    citation:
      'Regulation (EC) No 1924/2006 of the European Parliament and of the Council on nutrition and health claims made on foods, Annex — "SOURCE OF PROTEIN" and "HIGH PROTEIN".',
    doi: 'CELEX:32006R1924',
    design:
      'SOURCE OF PROTEIN: at least 12 % of the energy value of the food is provided by protein. HIGH PROTEIN: at least 20 %.',
  },
} as const satisfies Record<string, ProteinEvidenceSource>;

export type ProteinEvidenceSourceKey = keyof typeof PROTEIN_EVIDENCE_SOURCES;

/* ── HARD: what makes a recipe a Protein product at all ──────────────────── */

/**
 * The ONLY hard Protein-specific qualification in v2.
 *
 * Protein Gelato is a protein PRODUCT, so it must legally be able to carry the
 * claim its profile name makes. Regulation (EC) 1924/2006 defines that on an
 * ENERGY-SHARE basis, not a mass basis: HIGH PROTEIN requires at least 20 % of
 * the food's energy to come from protein.
 *
 * This replaces the pre-v2 `protein_target` gate (20 % protein BY MASS, no
 * provenance). Inside the Protein profile's own fat band (5-12 %) the energy
 * rule is strictly weaker than the mass rule it replaces, so no recipe that was
 * legal before becomes illegal now — the change is a relaxation plus a quality
 * layer, never a new restriction.
 */
export const PROTEIN_QUALIFICATION = {
  authority: 'HARD' as ProteinAuthorityClass,
  /** kcal per gram of protein used for the claim arithmetic (Atwater, EU Annex XIV 1169/2011). */
  kcalPerProteinGram: 4,
  /** HIGH PROTEIN — the claim the "Protein" profile name makes. */
  highProteinEnergySharePercent: 20,
  /** SOURCE OF PROTEIN — reported for context only, never a gate. */
  sourceOfProteinEnergySharePercent: 12,
  source: 'EU_1924_2006_PROTEIN_CLAIM' as ProteinEvidenceSourceKey,
} as const;

/* ── QUALITY: protein concentration is non-linear ────────────────────────── */

/**
 * AFR 2022 Table 1 + Figs. 2/3/5 — the only controlled protein-concentration
 * series that reports aeration, firmness, melting AND sensory across the range.
 *
 * Formulation held constant: 10 % milk fat, 15 % sugar, 0.15 % stabiliser-
 * emulsifier blend, buffalo milk base. The 4 % control took its protein from
 * SMP; the 6/8/10 % samples replaced the SMP entirely with WPI (87 % protein,
 * 0.8 % fat, 2.0 % ash). Pasteurised 80 degC/1 min, homogenised 140 kg/cm2,
 * aged overnight, batch-frozen to -5 degC, hardened at -20 degC.
 *
 * The series is MONOTONE AND ADVERSE in every structural dimension: overrun
 * falls 94.9 -> 33.9 %, hardness rises 13.60 -> 47.66 N, melting rate rises
 * 0.26 -> 0.74 g/min, and both the body-and-texture and meltdown sensory
 * scores fall. There is NO protein level in this dataset at which more protein
 * improved the product.
 *
 * CRITICAL BREAKPOINT (the authors' own statistics, p < 0.05): 6 % protein was
 * NOT significantly different from the 4 % control for hardness, body-and-
 * texture or meltdown. 8 % and 10 % were significantly worse on all of them,
 * and 8/10 % also lost flavour score to the characteristic whey note. This is
 * the single most important quantitative fact for Protein v2: quality is
 * preserved to about 6 % protein and measurably degrades at and beyond 8 %.
 *
 * The authors also record that reaching 8 % protein with SMP instead of WPI
 * produced "an unacceptable product with very low overrun and too hard body" —
 * direct evidence that the protein SOURCE, not the protein number, decides
 * whether a given protein level is achievable at all.
 *
 * HONEST LIMITATION: one buffalo-milk WPI system on one batch freezer with one
 * fixed dasher speed. Absolute values are NOT transferable to a Gellatti batch.
 * Only the SHAPE is used, and only to rank candidates — never to accept or
 * reject one.
 */
export const PROTEIN_CONCENTRATION_EVIDENCE = {
  authority: 'QUALITY' as ProteinAuthorityClass,
  fixtureFatPercent: 10,
  fixtureSugarPercent: 15,
  fixtureStabilizerEmulsifierPercent: 0.15,
  /** Measured series, ascending by protein. `qualityLoss` records the authors' significance finding. */
  series: [
    {
      proteinPercent: 4,
      overrunPercent: 94.9,
      flowBehaviourIndex: 0.86,
      consistencyCoefficientPaSn: 0.18,
      meltingRateGPerMin: 0.26,
      qualityLoss: 'control',
    },
    {
      proteinPercent: 6,
      overrunPercent: 60.5,
      flowBehaviourIndex: 0.752,
      consistencyCoefficientPaSn: 0.37,
      meltingRateGPerMin: 0.24,
      qualityLoss: 'not_significant_vs_control',
    },
    {
      proteinPercent: 8,
      overrunPercent: 44.3,
      flowBehaviourIndex: 0.68,
      consistencyCoefficientPaSn: 1.61,
      meltingRateGPerMin: 0.54,
      qualityLoss: 'significant',
    },
    {
      proteinPercent: 10,
      overrunPercent: 33.9,
      flowBehaviourIndex: 0.57,
      consistencyCoefficientPaSn: 4.22,
      meltingRateGPerMin: 0.74,
      qualityLoss: 'significant',
    },
  ],
  hardnessAtLowProteinNewton: 13.6,
  hardnessAtHighProteinNewton: 47.66,
  lossModulus100HzLowPa: 10.9,
  lossModulus100HzHighPa: 34.3,
  storageModulus100HzLowPa: 7.25,
  storageModulus100HzHighPa: 32.7,
  /**
   * Highest protein level with NO statistically significant quality loss versus
   * a conventional ice cream. Not a gate — the reference point the quality
   * model measures degradation from.
   */
  qualityPreservedMaxPercent: 6,
  /** Lowest level at which the study measured significant structural and sensory loss. */
  significantQualityLossFromPercent: 8,
  source: 'AFR_2022_WPI_CONCENTRATION' as ProteinEvidenceSourceKey,
} as const;

/**
 * The protein window actually covered by controlled frozen-dessert evidence.
 * 4.5 % (IJFP 2025) … 10 % (AFR 2022 / LWT 2021), with JFS 2026 at 6 %.
 * Above `evidenceCeilingPercent` NO controlled dataset exists, so v2 keeps
 * formulating but flags the candidate as beyond-evidence and ranks it lower.
 */
export const PROTEIN_EVIDENCE_WINDOW = {
  authority: 'QUALITY' as ProteinAuthorityClass,
  evidenceFloorPercent: 4.5,
  evidenceCeilingPercent: 10,
  sources: [
    'IJFP_2025_WHEY_CASEIN_RATIO',
    'JFS_2026_PROTEIN_SOURCE',
    'AFR_2022_WPI_CONCENTRATION',
    'LWT_2021_PROTEIN_EMULSIFIER',
  ] as readonly ProteinEvidenceSourceKey[],
} as const;

/**
 * Fat window shared by every controlled fixture: 6 % (AFR buffalo milk) …
 * 13 % (IJFP 2025), with JFS 2026 and JDS 2005 at 12 %. A Protein candidate
 * outside this fat window, or outside the resulting protein:fat envelope, is
 * ADVISORY-flagged as beyond evidence. There is no controlled protein:fat
 * series, so no optimum is asserted and no score is deducted for it.
 */
export const PROTEIN_FAT_EVIDENCE_ENVELOPE = {
  authority: 'ADVISORY' as ProteinAuthorityClass,
  fatFloorPercent: 6,
  fatCeilingPercent: 13,
  /** 4.5/13 rounded down … 10/6 rounded up, from the fixture set above. */
  proteinToFatFloor: 0.34,
  proteinToFatCeiling: 1.67,
  sources: [
    'IJFP_2025_WHEY_CASEIN_RATIO',
    'JFS_2026_PROTEIN_SOURCE',
    'AFR_2022_WPI_CONCENTRATION',
  ] as readonly ProteinEvidenceSourceKey[],
} as const;

/* ── QUALITY: protein SOURCE at identical protein % ──────────────────────── */

/**
 * JFS 2026, Tables 3/4/7 — all at the SAME 6 % protein / 12 % fat / 6.3 %
 * lactose formulation. This is the single strongest proof that equal protein
 * grams are not equal structure: mix viscosity spans 123 → 466 mPa·s and mean
 * ice-crystal size 32.5 → 41.9 µm purely from the protein source.
 *
 * Values are 0 % mono-/diglyceride, 100 % overrun unless noted.
 */
export const PROTEIN_SOURCE_STRUCTURE_EVIDENCE = {
  authority: 'QUALITY' as ProteinAuthorityClass,
  wpi: {
    apparentViscosityMPaS: 123,
    meanIceCrystalMicron: 32.5,
    meanAirCellMicron: 34.0,
    fatDestabilizationPercent: 7.22,
    fatDestabilizationWithMdgPercent: 34.8,
    dripThroughRatePercentPerMin: 0.769,
    meltingInductionMinutes: 24.6,
  },
  mpc: {
    apparentViscosityMPaS: 299,
    meanIceCrystalMicron: 35.7,
    meanAirCellMicron: 35.0,
    fatDestabilizationPercent: 4.73,
    fatDestabilizationWithMdgPercent: 19.4,
    dripThroughRatePercentPerMin: 1.39,
    meltingInductionMinutes: 27.9,
  },
  sodiumCaseinate: {
    apparentViscosityMPaS: 466,
    meanIceCrystalMicron: 41.9,
    meanAirCellMicron: 35.4,
    fatDestabilizationPercent: 3.53,
    fatDestabilizationWithMdgPercent: 3.87,
    dripThroughRatePercentPerMin: 1.61,
    meltingInductionMinutes: 22.9,
  },
  source: 'JFS_2026_PROTEIN_SOURCE' as ProteinEvidenceSourceKey,
} as const;

/**
 * IJFP 2025 at a fixed 4.5 % protein / 13 % fat / 42 % solids.
 * casein-dominant (13/87 whey:casein) → overrun 56.21 %, hardness 52.13 N
 * whey-dominant   (54/46)             → overrun 20.83 %, hardness 75.18 N
 * Meltdown onset was delayed 1.8-fold in 20/80 versus 54/46.
 *
 * DIRECTIONAL TENSION, recorded rather than resolved: IJFP finds casein-dominant
 * mixes aerate better and melt later, while JFS 2026 finds sodium caseinate
 * gives the COARSEST ice and the FASTEST drip-through. The two are measuring
 * different things (meltdown onset vs. drip rate) on different casein forms
 * (native micellar casein in milk protein vs. isolated NaCN). v2 therefore uses
 * whey:casein only as a low-weight ranking signal and as an advisory note.
 */
export const WHEY_CASEIN_EVIDENCE = {
  authority: 'QUALITY' as ProteinAuthorityClass,
  caseinDominantWheyShare: 13,
  caseinDominantOverrunPercent: 56.21,
  caseinDominantHardnessNewton: 52.13,
  wheyDominantWheyShare: 54,
  wheyDominantOverrunPercent: 20.83,
  wheyDominantHardnessNewton: 75.18,
  meltdownOnsetDelayFactor: 1.8,
  source: 'IJFP_2025_WHEY_CASEIN_RATIO' as ProteinEvidenceSourceKey,
} as const;

/**
 * Typical native casein:whey split by protein-source class, used to derive a
 * FUNCTIONAL class only — never a fake per-product ratio. Bovine milk protein
 * is approximately 80 % casein / 20 % whey; MPC and milk powders retain that
 * split by definition, whey fractions are whey-only, caseinates and micellar
 * casein are casein-only.
 */
export const NATIVE_MILK_CASEIN_SHARE_PERCENT = 80;

/* ── QUALITY: lactose load (reuse of already-approved in-repo authority) ─── */

/**
 * The Protein profile disables the standard-gelato `lactose` and
 * `lactose_sanding` HARD gates by owner decision. v2 does NOT re-enable them.
 * It reuses the SAME already-approved sanding band as a QUALITY signal only, so
 * a protein source that drags a large lactose load into the mix (WPC 60 at
 * 28 % lactose) is ranked below one that does not (WPI-grade at ~1 %), without
 * any recipe becoming invalid.
 *
 * Band provenance: src/engine/config/targets.ts lactose_sandiness_risk 5-9 %,
 * unchanged. Mechanism: lactose crystallises out of the freeze-concentrated
 * serum phase during storage; stabiliser gums suppress nucleation.
 */
export const PROTEIN_LACTOSE_QUALITY = {
  authority: 'QUALITY' as ProteinAuthorityClass,
  approvedSandingRiskMaxPercent: 9,
  reusedFrom: 'src/engine/config/targets.ts::lactose_sandiness_risk',
} as const;

/* ── ADVISORY: emulsifier interaction ────────────────────────────────────── */

/**
 * JFS 2026: 0.15 % mono-/diglycerides raised WPI fat destabilisation from 7.22 %
 * to 34.8 % and MPC from 4.73 % to 19.4 %, but left sodium caseinate flat
 * (3.53 → 3.87 %). LWT 2021: raising polysorbate-80 share in a GMS blend
 * lowered the consistency coefficient and enlarged fat-globule clumps in a
 * 6-10 % protein WPI system.
 *
 * CONSEQUENCE FOR GELLATTI: the structural outcome of a high-protein mix is not
 * a function of protein % — it is a function of protein × emulsifier. Gellatti
 * has no emulsifier-blend authority, so v2 states this as an advisory note and
 * refuses to score it.
 */
export const PROTEIN_EMULSIFIER_ADVISORY = {
  authority: 'ADVISORY' as ProteinAuthorityClass,
  monoDiglyceridePercent: 0.15,
  sources: [
    'JFS_2026_PROTEIN_SOURCE',
    'LWT_2021_PROTEIN_EMULSIFIER',
  ] as readonly ProteinEvidenceSourceKey[],
} as const;

/* ── Freezing provenance (documented, NOT changed by v2) ─────────────────── */

/**
 * Protein freezing authority is UNCHANGED by v2 and is documented here so the
 * limitation is never mistaken for validation.
 *
 * - Protein contributes no measurable colligative freezing-point depression:
 *   it is a very large molecule relative to sugars, lactose and salts. The Base
 *   Engine already models this correctly — `pac.ts` derives NPAC from the sugar
 *   spectrum, lactose, alcohol and salt, and protein enters no PAC term.
 * - Therefore swapping a high-lactose protein source (WPC 60, MPC, SMP) for a
 *   low-lactose one (isolate-grade) at equal protein ALREADY moves NPAC, ice
 *   fraction and hardness through the existing physics. No new freezing model
 *   is required for that effect and none is added.
 * - What remains UNVALIDATED: the `protein_gelato` ice anchors in
 *   src/engine/config/iceAnchors.ts are verbatim copies of the milk_gelato
 *   anchors (source tag `owner_approved_standard_physics`). They were never
 *   measured on a high-protein serum phase. v2 does not touch them, does not
 *   claim them as validated, and adds no protein-specific freezing constant.
 */
export const PROTEIN_FREEZING_PROVENANCE = {
  authority: 'ADVISORY' as ProteinAuthorityClass,
  iceAnchorSource: 'owner_approved_standard_physics (copy of milk_gelato anchors)',
  proteinContributesToPac: false,
  validatedAtHighProtein: false,
} as const;
