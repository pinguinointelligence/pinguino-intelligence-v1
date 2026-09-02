/**
 * VEGAN ENGINE v2 — the deterministic derived-behaviour classifier.
 *
 * `deriveVeganBehavior(facts) → VeganBehavior`
 *
 * Pure, versioned, reproducible: the same canonical facts always produce the
 * same value. No network, no LLM, no per-calculation database research — an
 * LLM guess may never become runtime safety authority (owner rule §5).
 *
 * EVERY unresolved case returns `unknown` and therefore falls back to today's
 * Vegan Engine behaviour. Nothing in this module can reject a recipe, shrink
 * VEGAN_VERIFIED compatibility, mutate the Mapper base or touch ProductBehavior.
 *
 * The named false-positive exclusions come from the science audit §5.4 and are
 * pinned by tests: sunflower/soy LECITHIN is an emulsifier and not a fat or a
 * protein; RICE SYRUP is a sugar and not a protein; COCOA POWDER / COCOA MASS
 * are not a cocoa-butter fat phase; COCONUT SUGAR / COCONUT WATER are not a
 * lauric fat phase.
 */
import { MATERIAL_COMPONENT_PERCENT, type VeganBehaviorFacts } from './veganBehaviorFacts';
import {
  VEGAN_BEHAVIOR_MODEL_VERSION,
  type VeganBehavior,
  type VeganEmulsifierClass,
  type VeganEmulsifierEvidence,
  type VeganEvidenceLevel,
  type VeganFatFunctionalClass,
  type VeganFatSource,
  type VeganHydrocolloidClass,
  type VeganHydrocolloidEvidence,
  type VeganProteinForm,
  type VeganProteinFunctionalClass,
  type VeganProteinSource,
  type VeganStructuralCarbClass,
  type VeganStructuralCarbEvidence,
} from './veganBehaviorTaxonomy';

/* ── normalisation ────────────────────────────────────────────────────────── */

/** Lowercase, de-accented, punctuation-collapsed identity text. Deterministic. */
export function normalizeIdentityText(value: string): string {
  return ` ${value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
}

/** Remove exclusion phrases BEFORE matching, so a masked token cannot fire. */
const mask = (text: string, exclusions: readonly RegExp[]): string => {
  let masked = text;
  for (const exclusion of exclusions) masked = masked.replace(exclusion, ' ');
  return masked;
};

const material = (value: number | null): boolean =>
  value !== null && value > MATERIAL_COMPONENT_PERCENT;

/** Conservative combination: a mixed classification is only as strong as its
 * weakest member. */
const weakest = (levels: readonly VeganEvidenceLevel[]): VeganEvidenceLevel =>
  levels.includes('UNKNOWN')
    ? 'UNKNOWN'
    : levels.includes('DETERMINISTICALLY_INFERRED')
      ? 'DETERMINISTICALLY_INFERRED'
      : 'EXPLICIT';

/* ── fat ──────────────────────────────────────────────────────────────────── */

/** Audit §5.4 named exclusions for the fat axis. */
const FAT_EXCLUSIONS: readonly RegExp[] = [
  /\b(sunflower|soy|soya|rapeseed|canola) lecithin\b/g,
  /\blecithin\b/g,
  /\blecytyn\w*\b/g,
  /\bcoconut (sugar|water|blossom|flour|nectar|aroma|flavou?r)\b/g,
  /\bcocoa (powder|mass|liquor|nibs|solids|bean)\w*\b/g,
  /\bcacao (powder|mass|nibs)\w*\b/g,
  /\bkakao w proszku\b/g,
];

interface FatRule {
  source: VeganFatSource;
  functionalClass: VeganFatFunctionalClass;
  /** Identity names the fat phase itself. */
  explicit: RegExp;
  /** Source token only — needs a material fat amount to corroborate. */
  inferred: RegExp;
}

const FAT_RULES: readonly FatRule[] = [
  {
    source: 'coconut',
    functionalClass: 'lauric_solid_fat',
    explicit:
      /\b(coconut|copra|kokosow\w*|kokos) (oil|fat|butter|olej|tluszcz)\b|\bolej kokosowy\b/,
    inferred: /\bcoconut\b|\bcopra\b|\bkokos\w*\b/,
  },
  {
    source: 'palm_kernel',
    functionalClass: 'lauric_solid_fat',
    explicit: /\bpalm kernel (oil|fat|stearin|olein)\b|\bpalmist\w*\b/,
    inferred: /\bpalm kernel\b/,
  },
  {
    source: 'cocoa_butter',
    functionalClass: 'cocoa_butter_fat',
    explicit: /\b(cocoa|cacao) butter\b|\bmaslo kakaowe\b/,
    inferred: /\b(cocoa|cacao) butter\b/,
  },
  {
    source: 'sunflower',
    functionalClass: 'liquid_vegetable_oil',
    explicit: /\bsunflower (oil|fat)\b|\bolej slonecznikowy\b/,
    inferred: /\bsunflower\b|\bslonecznik\w*\b/,
  },
  {
    source: 'soybean',
    functionalClass: 'liquid_vegetable_oil',
    explicit: /\b(soybean|soya|soy) oil\b|\bolej sojowy\b/,
    inferred: /\b(soybean|soya|soy) oil\b/,
  },
  {
    source: 'rapeseed',
    functionalClass: 'liquid_vegetable_oil',
    explicit: /\b(rapeseed|canola) (oil|fat)\b|\bolej rzepakowy\b/,
    inferred: /\brapeseed\b|\bcanola\b|\brzepak\w*\b/,
  },
  {
    source: 'olive',
    functionalClass: 'liquid_vegetable_oil',
    explicit: /\bolive oil\b|\boliwa\w*\b/,
    inferred: /\bolive\b|\boliw\w*\b/,
  },
  {
    source: 'nut_or_seed',
    functionalClass: 'nut_fat_matrix',
    explicit:
      /\b(hazelnut|almond|pistachio|cashew|walnut|peanut|sesame|sunflower seed|pumpkin seed|orzech\w*|migdal\w*|pistacj\w*|sezam\w*) (paste|butter|puree|pasta|maslo|praline)\b|\btahini\b|\bgianduja\b/,
    inferred:
      /\bhazelnut\w*\b|\balmond\w*\b|\bpistachio\w*\b|\bcashew\w*\b|\bwalnut\w*\b|\bpeanut\w*\b|\bsesame\b|\borzech\w*\b|\bmigdal\w*\b|\bpistacj\w*\b|\bnerkowiec\w*\b|\bsezam\w*\b/,
  },
];

/* ── protein ──────────────────────────────────────────────────────────────── */

/** Audit §5.4 named exclusions for the protein axis. */
const PROTEIN_EXCLUSIONS: readonly RegExp[] = [
  /\b(sunflower|soy|soya|rapeseed|canola) lecithin\b/g,
  /\blecithin\b/g,
  /\blecytyn\w*\b/g,
  /\brice (syrup|starch|malt|vinegar)\b/g,
  /\bsyrop ryzowy\b/g,
  /\b(soybean|soya|soy) oil\b/g,
  /\bolej sojowy\b/g,
  /\bsoy sauce\b/g,
  /\boat (syrup|malt)\b/g,
];

interface ProteinRule {
  source: VeganProteinSource;
  /** Identity names a purified `<source> protein` material. */
  explicit: RegExp;
  /** Source token only — needs a material protein amount to corroborate. */
  inferred: RegExp;
}

const PROTEIN_RULES: readonly ProteinRule[] = [
  {
    source: 'soy',
    explicit:
      /\b(soy|soya|soja|sojow\w*) (protein|bialko)\b|\b(protein|bialko) (soy|soya|sojow\w*)\b/,
    inferred: /\bsoy\b|\bsoya\b|\bsoja\b|\bsojow\w*\b|\btofu\b|\bedamame\b/,
  },
  {
    source: 'pea',
    explicit: /\b(pea|groch\w*) (protein|bialko)\b/,
    inferred: /\bpea\b|\bpeas\b|\bgroch\w*\b/,
  },
  {
    source: 'rice',
    explicit: /\b(rice|ryzow\w*|ryz) (protein|bialko)\b/,
    inferred: /\brice\b|\bryz\b|\bryzow\w*\b/,
  },
  {
    source: 'chickpea',
    explicit: /\b(chickpea|garbanzo|ciecierzyc\w*) (protein|bialko)\b/,
    inferred: /\bchickpea\w*\b|\bgarbanzo\b|\bciecierzyc\w*\b|\baquafaba\b/,
  },
  {
    source: 'oat',
    explicit: /\b(oat|owsian\w*) (protein|bialko)\b/,
    inferred: /\boat\b|\boats\b|\bowsian\w*\b|\bowies\b/,
  },
  {
    source: 'nut_or_seed',
    explicit:
      /\b(almond|hazelnut|pistachio|cashew|peanut|walnut|sesame|hemp|migdal\w*|orzech\w*) (protein|bialko)\b/,
    inferred:
      /\bhazelnut\w*\b|\balmond\w*\b|\bpistachio\w*\b|\bcashew\w*\b|\bwalnut\w*\b|\bpeanut\w*\b|\bsesame\b|\bhemp\b|\borzech\w*\b|\bmigdal\w*\b|\bpistacj\w*\b|\bnerkowiec\w*\b|\bsezam\w*\b/,
  },
];

const PROTEIN_FORM_RULES: readonly (readonly [VeganProteinForm, RegExp])[] = [
  ['isolate', /\bisolate\b|\bizolat\w*\b/],
  ['concentrate', /\bconcentrate\b|\bkoncentrat\w*\b/],
  [
    'whole_food_matrix',
    /\bdrink\b|\bbeverage\b|\bnapoj\w*\b|\bmilk\b|\bmleko\b|\byogh?urt\b|\bjogurt\w*\b|\bskyr\b|\bpaste\b|\bpasta\b|\bpuree\b|\bflour\b|\bmaka\b|\bflakes\b|\bplatki\b|\btofu\b/,
  ],
];

/* ── structural carbohydrates / hydrocolloids / emulsifiers ───────────────── */

const INULIN = /\binulin\w*\b|\bchicory (root )?(fibre|fiber)\b|\bcykori\w*\b/;
/** Maltodextrin is deliberately NOT starch here: it is a hydrolysed carbohydrate
 * whose freezing power the Engine already models through DE, not a structural
 * starch matrix. */
const STARCH = /\bstarch\b|\bskrobia\b|\bskrobiow\w*\b|\btapioca\b|\btapiok\w*\b/;
const OAT_MATRIX = /\boat\b|\boats\b|\bowsian\w*\b|\bowies\b/;
const SOLUBLE_FIBRE = /\bsoluble (fibre|fiber)\b|\bblonnik rozpuszczalny\b/;

const HYDROCOLLOID_RULES: readonly (readonly [VeganHydrocolloidClass, RegExp])[] = [
  ['tara', /\btara\b|\btary\b/],
  ['guar', /\bguar\w*\b/],
  ['locust_bean', /\blocust bean\b|\bcarob\b|\blbg\b|\bmaczka chleba swietojanskiego\b/],
  ['xanthan', /\bxanthan\w*\b|\bksantan\w*\b|\be415\b/],
  ['carrageenan', /\bcarrageenan\w*\b|\bkaragen\w*\b|\be407\b/],
  ['pectin', /\bpectin\w*\b|\bpektyn\w*\b|\be440\b/],
  ['agar', /\bagar\b/],
  ['cellulose_gum', /\bcellulose gum\b|\bcarboxymethyl\w*\b|\bcmc\b|\be466\b/],
];

const EMULSIFIER_RULES: readonly (readonly [VeganEmulsifierClass, RegExp])[] = [
  ['lecithin', /\blecithin\w*\b|\blecytyn\w*\b|\be322\b/],
  ['mono_diglycerides', /\bmono\w* (and )?diglycerid\w*\b|\bmonoglicerydy\b|\be47[12]\b/],
  ['polysorbate', /\bpolysorbate\w*\b|\bpolisorbat\w*\b|\be43[35]\b|\bps 80\b/],
];

const STABILIZER_IDENTITY =
  /\bstabili[sz]\w*\b|\bstabilizator\w*\b|\bgum\b|\bguma\b|\bhydrocolloid\w*\b/;
const EMULSIFIER_IDENTITY = /\bemulsifier\w*\b|\bemulgator\w*\b/;

/* ── the classifier ───────────────────────────────────────────────────────── */

/**
 * Derive the structural behaviour of one product from its canonical facts.
 * Deterministic and side-effect free.
 */
export function deriveVeganBehavior(facts: VeganBehaviorFacts): VeganBehavior {
  const text = normalizeIdentityText(facts.identityText);
  const reasons: string[] = [];

  /* fat -------------------------------------------------------------------- */
  const fatText = mask(text, FAT_EXCLUSIONS);
  const fatBearing = material(facts.fatPercent);
  const fatMatches = FAT_RULES.flatMap((rule) => {
    if (rule.explicit.test(fatText)) {
      return [{ rule, evidence: 'EXPLICIT' as VeganEvidenceLevel }];
    }
    if (fatBearing && rule.inferred.test(fatText)) {
      return [{ rule, evidence: 'DETERMINISTICALLY_INFERRED' as VeganEvidenceLevel }];
    }
    return [];
  });
  const fatClasses = [...new Set(fatMatches.map((match) => match.rule.functionalClass))];
  let fatSource: VeganFatSource = 'unknown';
  let fatFunctionalClass: VeganFatFunctionalClass = 'unknown';
  let fatEvidence: VeganEvidenceLevel = 'UNKNOWN';
  if (fatMatches.length > 0) {
    fatEvidence = weakest(fatMatches.map((match) => match.evidence));
    if (fatClasses.length === 1) {
      fatFunctionalClass = fatClasses[0]!;
      const sources = [...new Set(fatMatches.map((match) => match.rule.source))];
      fatSource = sources.length === 1 ? sources[0]! : 'mixed';
    } else {
      fatFunctionalClass = 'mixed_plant_fat';
      fatSource = 'mixed';
    }
    reasons.push(`fat_class:${fatFunctionalClass}:${fatEvidence.toLowerCase()}`);
  } else {
    reasons.push(fatBearing ? 'fat_present_class_unknown' : 'no_material_fat_phase');
  }

  /* protein ---------------------------------------------------------------- */
  const proteinText = mask(text, PROTEIN_EXCLUSIONS);
  const proteinBearing = material(facts.proteinPercent);
  const proteinMatches = PROTEIN_RULES.flatMap((rule) => {
    if (rule.explicit.test(proteinText)) {
      return [{ rule, evidence: 'EXPLICIT' as VeganEvidenceLevel, purified: true }];
    }
    if (proteinBearing && rule.inferred.test(proteinText)) {
      return [
        { rule, evidence: 'DETERMINISTICALLY_INFERRED' as VeganEvidenceLevel, purified: false },
      ];
    }
    return [];
  });
  let proteinSource: VeganProteinSource = 'unknown';
  let proteinForm: VeganProteinForm = 'unknown';
  let proteinFunctionalClass: VeganProteinFunctionalClass = 'unknown';
  let proteinEvidence: VeganEvidenceLevel = 'UNKNOWN';
  if (proteinMatches.length > 0) {
    proteinEvidence = weakest(proteinMatches.map((match) => match.evidence));
    const sources = [...new Set(proteinMatches.map((match) => match.rule.source))];
    proteinSource = sources.length === 1 ? sources[0]! : 'mixed';
    const purified = proteinMatches.some((match) => match.purified);
    proteinForm =
      PROTEIN_FORM_RULES.find(([, pattern]) => pattern.test(proteinText))?.[0] ??
      (purified ? 'unknown' : 'unknown');
    if (sources.length > 1) {
      proteinFunctionalClass = 'mixed_plant_protein';
    } else if (purified) {
      // A purified `<source> protein` material — the functional plant protein
      // the controlled trials isolate (audit §3.2). Form detail stays separate.
      proteinFunctionalClass = 'functional_plant_protein_isolate';
    } else {
      proteinFunctionalClass = 'whole_food_plant_protein_matrix';
      if (proteinForm === 'unknown') proteinForm = 'whole_food_matrix';
    }
    reasons.push(`protein_class:${proteinFunctionalClass}:${proteinEvidence.toLowerCase()}`);
  } else {
    reasons.push(proteinBearing ? 'protein_present_class_unknown' : 'no_material_protein_phase');
  }

  /* structural carbohydrates ----------------------------------------------- */
  const structural: VeganStructuralCarbEvidence[] = [];
  const addStructural = (
    structuralClass: VeganStructuralCarbClass,
    evidence: VeganEvidenceLevel,
    amountPercent: number | null = null,
  ) => {
    structural.push({ structuralClass, evidence, amountPercent });
    reasons.push(`structural:${structuralClass}:${evidence.toLowerCase()}`);
  };
  if (INULIN.test(text)) addStructural('inulin', 'EXPLICIT');
  if (STARCH.test(text)) addStructural('starch', 'EXPLICIT');
  if (SOLUBLE_FIBRE.test(text)) addStructural('soluble_fibre', 'EXPLICIT');
  if (OAT_MATRIX.test(text)) {
    // Qualitative only. An oat identity NEVER implies a β-glucan quantity.
    addStructural('oat_matrix', 'DETERMINISTICALLY_INFERRED');
  }
  if (facts.betaGlucanPercent !== null) {
    addStructural('beta_glucan_explicit', 'EXPLICIT', facts.betaGlucanPercent);
  }
  if (structural.length === 0 && material(facts.fiberPercent)) {
    addStructural('unknown_structural_solids', 'UNKNOWN');
  }

  /* hydrocolloids ---------------------------------------------------------- */
  const hydrocolloids: VeganHydrocolloidEvidence[] = HYDROCOLLOID_RULES.filter(([, pattern]) =>
    pattern.test(text),
  ).map(([hydrocolloidClass]) => ({
    hydrocolloidClass,
    evidence: 'EXPLICIT' as VeganEvidenceLevel,
  }));
  // A "stabilizer" engine category is only an UNKNOWN hydrocolloid when nothing
  // else already explains it. Inulin (audit §3.4) carries that category in the
  // approved toolbox and must never be recorded as a hydrocolloid, not even an
  // unknown one.
  const structuralIdentified = structural.some((entry) => entry.evidence !== 'UNKNOWN');
  if (
    hydrocolloids.length === 0 &&
    !structuralIdentified &&
    (facts.engineCategory === 'stabilizer' ||
      facts.stabilizerActivity !== null ||
      STABILIZER_IDENTITY.test(text))
  ) {
    hydrocolloids.push({ hydrocolloidClass: 'other_unknown', evidence: 'UNKNOWN' });
  }
  for (const entry of hydrocolloids) {
    reasons.push(`hydrocolloid:${entry.hydrocolloidClass}:${entry.evidence.toLowerCase()}`);
  }

  /* emulsifiers ------------------------------------------------------------ */
  const emulsifiers: VeganEmulsifierEvidence[] = EMULSIFIER_RULES.filter(([, pattern]) =>
    pattern.test(text),
  ).map(([emulsifierClass]) => ({
    emulsifierClass,
    evidence: 'EXPLICIT' as VeganEvidenceLevel,
  }));
  if (emulsifiers.length === 0 && EMULSIFIER_IDENTITY.test(text)) {
    emulsifiers.push({ emulsifierClass: 'other_unknown', evidence: 'UNKNOWN' });
  }
  for (const entry of emulsifiers) {
    reasons.push(`emulsifier:${entry.emulsifierClass}:${entry.evidence.toLowerCase()}`);
  }

  return {
    modelVersion: VEGAN_BEHAVIOR_MODEL_VERSION,
    identityKey: facts.identityKey,
    fat: {
      amountPercent: facts.fatPercent,
      amountEvidence: facts.fatPercent === null ? 'UNKNOWN' : 'EXPLICIT',
      source: fatSource,
      functionalClass: fatFunctionalClass,
      evidence: fatEvidence,
    },
    protein: {
      amountPercent: facts.proteinPercent,
      amountEvidence: facts.proteinPercent === null ? 'UNKNOWN' : 'EXPLICIT',
      source: proteinSource,
      form: proteinForm,
      functionalClass: proteinFunctionalClass,
      evidence: proteinEvidence,
    },
    structuralCarbohydrates: structural,
    hydrocolloids,
    emulsifiers,
    reasons,
  };
}
