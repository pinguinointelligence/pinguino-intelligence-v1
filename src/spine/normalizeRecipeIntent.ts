/**
 * PINGUINO Spine — pure recipe-intent normalizer (Recipe_Intent.md §22,
 * locked v1.0; Phase C Slice 2).
 *
 * Converts raw user/saved-default input into one deterministic
 * `NormalizedRecipeIntent`. Precedence is locked:
 *
 *   explicit current input → saved defaults → system defaults
 *
 * Pure and deterministic: no IO, no env, no DOM, no DB client, no clock, no
 * randomness. It normalizes INTENT only — no grams, no engine math, no
 * optimizer calls, no ingredient strategy. Unsupported product intents
 * (granita/protein/fresh/storage/frozen drinks) are never silently mapped:
 * the value falls back safely and a structured warning is always attached.
 */
import { normalizeProductProfile } from './normalizeProductProfile';
import {
  SPINE_CONTRACT_VERSION,
  type CostPriority,
  type DesignerWarning,
  type FlavorGroup,
  type NormalizedRecipeIntent,
  type ProductProfile,
  type QualityTier,
  type RawRecipeIntentInput,
  type SavedRecipePreferences,
  type ServingTemperatureC,
  type SweetnessPreference,
  type TexturePreference,
} from './types';

/** Locked system defaults (Recipe_Intent.md §8). Never mutate — results clone. */
export const DEFAULT_RECIPE_INTENT: NormalizedRecipeIntent = {
  productProfile: 'standard_gelato',
  qualityTier: 'classic',
  servingTemperatureC: -12,
  texturePreference: 'medium',
  sweetnessPreference: 'balanced',
  costPriority: 'balanced',
  flavorGroup: 'unknown',
  flavorTags: [],
  naturalOnly: false,
  allowBoosters: true,
  dietary: {
    vegan: false,
    lactoseFree: false,
    glutenFree: false,
    allergenAware: false,
    noAddedSugar: false,
    lowSugar: false,
    alcohol: false,
  },
  constraints: {
    excludedIngredientIds: [],
    lockedIngredientIds: [],
    heroIngredientIds: [],
    batchSizeG: null,
    machineCapacityG: null,
  },
  source: 'fallback',
  warnings: [],
  contractVersion: SPINE_CONTRACT_VERSION,
};

/* ------------------------------------------------------------------------ *
 * Preference alias maps (Recipe_Intent.md §11–§15 + locked Polish UX words) *
 * ------------------------------------------------------------------------ */

const QUALITY_TIER_ALIASES: Readonly<Record<string, QualityTier>> = {
  eco: 'eco',
  classic: 'classic',
  premium: 'premium',
  signature: 'signature',
  // NOTE: no `pro` alias — "pro" is an access plan in this repo, not a
  // quality tier; mapping it here would conflate access with product quality.
};

const TEXTURE_ALIASES: Readonly<Record<string, TexturePreference>> = {
  twarde: 'firm',
  hard: 'firm',
  firm: 'firm',
  'średnie': 'medium',
  srednie: 'medium',
  normal: 'medium',
  medium: 'medium',
  balanced: 'medium',
  'miękkie': 'soft',
  miekkie: 'soft',
  soft: 'soft',
  creamy: 'soft',
};

const SWEETNESS_ALIASES: Readonly<Record<string, SweetnessPreference>> = {
  'mało słodkie': 'low',
  'malo slodkie': 'low',
  less_sweet: 'low',
  low: 'low',
  'słodkie': 'balanced',
  slodkie: 'balanced',
  normal: 'balanced',
  medium: 'balanced',
  balanced: 'balanced',
  'bardzo słodkie': 'high',
  'bardzo slodkie': 'high',
  sweet: 'high',
  high: 'high',
};

const COST_PRIORITY_ALIASES: Readonly<Record<string, CostPriority>> = {
  cheap: 'low',
  tanie: 'low',
  low: 'low',
  balanced: 'balanced',
  normal: 'balanced',
  premium: 'premium',
  quality: 'premium',
};

/* ------------------------------------------------------------------------ *
 * Flavor parser (Recipe_Intent.md §16 + User_Flow.md word lists)            *
 * ------------------------------------------------------------------------ */

interface FlavorRule {
  group: FlavorGroup;
  tag: string;
  keywords: readonly string[];
}

/**
 * Detection tables in locked priority order — when several groups match, the
 * first table wins the group (chocolate > fruit > nut > coffee > vanilla >
 * neutral > alcohol); tags collect from every match. Alcohol words ALWAYS set
 * dietary.alcohol even when another group wins the label.
 */
const FLAVOR_RULES: readonly FlavorRule[] = [
  { group: 'chocolate', tag: 'chocolate', keywords: ['czekoladowe', 'czekolada', 'chocolate', 'dark chocolate', 'milk chocolate', 'white chocolate', 'chocolate paste'] },
  { group: 'chocolate', tag: 'cocoa', keywords: ['cocoa', 'cacao', 'kakao', 'cocoa powder', 'cocoa mass', 'cocoa butter'] },
  { group: 'chocolate', tag: 'gianduja', keywords: ['gianduja'] },
  { group: 'fruit', tag: 'strawberry', keywords: ['strawberry', 'truskawka', 'truskawkowe', 'truskawkowy'] },
  { group: 'fruit', tag: 'raspberry', keywords: ['raspberry', 'malina', 'malinowe', 'malinowy'] },
  { group: 'fruit', tag: 'mango', keywords: ['mango'] },
  { group: 'fruit', tag: 'lemon', keywords: ['lemon', 'cytryna', 'cytrynowe', 'cytrynowy'] },
  { group: 'fruit', tag: 'orange', keywords: ['orange', 'pomarańcza', 'pomarancza', 'pomarańczowe', 'pomaranczowe'] },
  { group: 'fruit', tag: 'banana', keywords: ['banana', 'banan', 'bananowe', 'bananowy'] },
  { group: 'fruit', tag: 'blueberry', keywords: ['blueberry', 'borówka', 'borowka'] },
  { group: 'fruit', tag: 'passion_fruit', keywords: ['passion fruit', 'marakuja'] },
  { group: 'fruit', tag: 'fruit', keywords: ['fruit', 'owocowe', 'owocowy'] },
  { group: 'nut', tag: 'pistachio', keywords: ['pistachio', 'pistacja', 'pistacjowe', 'pistacjowy'] },
  { group: 'nut', tag: 'hazelnut', keywords: ['hazelnut', 'orzech laskowy', 'orzechowe', 'orzechowy'] },
  { group: 'nut', tag: 'almond', keywords: ['almond', 'migdał', 'migdal', 'migdałowe', 'migdalowe'] },
  { group: 'nut', tag: 'nut', keywords: ['nut'] },
  { group: 'coffee', tag: 'coffee', keywords: ['coffee', 'kawa', 'kawowe', 'kawowy'] },
  { group: 'coffee', tag: 'espresso', keywords: ['espresso'] },
  { group: 'coffee', tag: 'cappuccino', keywords: ['cappuccino'] },
  { group: 'vanilla', tag: 'vanilla', keywords: ['vanilla', 'wanilia', 'waniliowe', 'waniliowy'] },
  { group: 'neutral', tag: 'fior_di_latte', keywords: ['fior di latte'] },
  { group: 'neutral', tag: 'milk_base', keywords: ['milk base', 'cream base', 'neutral'] },
  { group: 'alcohol', tag: 'rum', keywords: ['rum'] },
  { group: 'alcohol', tag: 'whisky', keywords: ['whisky', 'whiskey'] },
  { group: 'alcohol', tag: 'brandy', keywords: ['brandy'] },
  { group: 'alcohol', tag: 'liqueur', keywords: ['liqueur', 'likier'] },
  { group: 'alcohol', tag: 'alcohol', keywords: ['alcohol', 'alkohol'] },
] as const;

/** Product words recognized INSIDE flavor text (User_Flow.md §4). */
const SORBET_WORDS = ['sorbet', 'sorbetowe', 'sorbetowy', 'water based', 'na wodzie'] as const;
const VEGAN_WORDS = [
  'vegan',
  'wegańskie',
  'weganskie',
  'wegański',
  'weganski',
  'plant based',
  'bez mleka',
  'bez nabiału',
  'bez nabialu',
  'bez śmietanki',
  'bez smietanki',
  'without milk',
  'without dairy',
  'no milk',
  'no dairy',
  'dairy free',
] as const;
const PROTEIN_WORDS = ['protein', 'proteinowe', 'proteinowy', 'proteiny', 'białkowe', 'bialkowe'] as const;
const GRANITA_WORDS = ['granita'] as const;
const LACTOSE_FREE_WORDS = ['lactose free', 'bez laktozy'] as const;

/** Lowercase, strip punctuation, pad — enables word-boundary phrase matching. */
const canonicalizeText = (raw: string): string =>
  ` ${raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `;

const hasWord = (canonicalText: string, phrase: string): boolean =>
  canonicalText.includes(` ${phrase} `);

const canonicalizeChoice = (raw: string): string =>
  raw.toLowerCase().trim().replace(/\s+/g, ' ');

interface ParsedFlavor {
  group: FlavorGroup;
  tags: string[];
  sorbetHint: boolean;
  veganHint: boolean;
  proteinHint: boolean;
  granitaHint: boolean;
  lactoseFreeHint: boolean;
  alcoholHint: boolean;
}

function parseFlavorText(rawText: string | undefined): ParsedFlavor {
  const parsed: ParsedFlavor = {
    group: 'unknown',
    tags: [],
    sorbetHint: false,
    veganHint: false,
    proteinHint: false,
    granitaHint: false,
    lactoseFreeHint: false,
    alcoholHint: false,
  };
  if (rawText === undefined || rawText.trim() === '') return parsed;

  const text = canonicalizeText(rawText);
  for (const rule of FLAVOR_RULES) {
    if (rule.keywords.some((keyword) => hasWord(text, keyword))) {
      if (parsed.group === 'unknown') parsed.group = rule.group;
      if (!parsed.tags.includes(rule.tag)) parsed.tags.push(rule.tag);
      if (rule.group === 'alcohol') parsed.alcoholHint = true;
    }
  }
  parsed.sorbetHint = SORBET_WORDS.some((w) => hasWord(text, w));
  parsed.veganHint = VEGAN_WORDS.some((w) => hasWord(text, w));
  parsed.proteinHint = PROTEIN_WORDS.some((w) => hasWord(text, w));
  parsed.granitaHint = GRANITA_WORDS.some((w) => hasWord(text, w));
  parsed.lactoseFreeHint = LACTOSE_FREE_WORDS.some((w) => hasWord(text, w));
  return parsed;
}

/* ------------------------------------------------------------------------ *
 * Normalizer                                                                *
 * ------------------------------------------------------------------------ */

const warning = (
  code: DesignerWarning['code'],
  severity: DesignerWarning['severity'],
  messageKey: string,
  context?: DesignerWarning['context'],
): DesignerWarning => (context === undefined ? { code, severity, messageKey } : { code, severity, messageKey, context });

const firstNonEmpty = (...values: (string | undefined)[]): string | undefined =>
  values.find((v) => v !== undefined && v.trim() !== '');

/** Positive finite grams pass through; anything else is an honest null. */
const normalizeGrams = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

const RELEVANT_INPUT_KEYS: readonly (keyof RawRecipeIntentInput)[] = [
  'productProfile',
  'productType',
  'category',
  'qualityTier',
  'mode',
  'servingTemperatureC',
  'targetTemperatureC',
  'texturePreference',
  'sweetnessPreference',
  'costPriority',
  'flavorText',
  'flavor',
  'naturalOnly',
  'allowBoosters',
  'dietary',
  'excludedIngredientIds',
  'lockedIngredientIds',
  'heroIngredientIds',
  'batchSizeG',
  'machineCapacityG',
];

/**
 * Pure, deterministic normalization (Recipe_Intent.md §22):
 * explicit input wins → saved defaults second → system defaults third;
 * legacy names normalized; flavor detected; profile routed only when safe;
 * unsupported inputs warn and fall back — never improvised, never silent.
 */
export function normalizeRecipeIntent(args: {
  input?: RawRecipeIntentInput;
  savedDefaults?: SavedRecipePreferences | null;
}): NormalizedRecipeIntent {
  const input = args.input ?? {};
  const saved = args.savedDefaults ?? null;

  const profileWarnings: DesignerWarning[] = [];
  const routingWarnings: DesignerWarning[] = [];
  const fieldWarnings: DesignerWarning[] = [];
  const sourceWarnings: DesignerWarning[] = [];
  let savedUsed = false;

  const hasExplicitInput = RELEVANT_INPUT_KEYS.some((key) => input[key] !== undefined);

  /* -- flavor ------------------------------------------------------------ */
  const rawFlavorText = firstNonEmpty(input.flavorText, input.flavor);
  const flavor = parseFlavorText(rawFlavorText);

  /* -- product profile ---------------------------------------------------- */
  const explicitProfileRaw = firstNonEmpty(input.productProfile, input.productType, input.category);
  let profile: ProductProfile | null = null;
  let unsupportedProfileIntent = false;

  if (explicitProfileRaw !== undefined) {
    const normalized = normalizeProductProfile(explicitProfileRaw);
    profileWarnings.push(...normalized.warnings);
    if (normalized.status === 'ok') {
      profile = normalized.profile;
    } else {
      unsupportedProfileIntent = true; // value falls back below; warning already attached
    }
  } else {
    // Product words inside the flavor text (sorbet wins over vegan wording —
    // "bez mleka, na wodzie" is the locked sorbet phrasing).
    if (flavor.sorbetHint) {
      profile = 'sorbet';
    } else if (flavor.veganHint) {
      profile = 'vegan_gelato';
    }
    if (flavor.granitaHint) {
      unsupportedProfileIntent = true;
      profileWarnings.push(
        warning('granita_unsupported_v1', 'warning', 'spine.product_profile.granita_unsupported_v1'),
      );
    } else if (flavor.proteinHint) {
      // Protein is recognized as INTENT only (User_Flow.md §4.4) — never
      // silently calculated as a supported profile.
      unsupportedProfileIntent = true;
      profileWarnings.push(
        warning('unsupported_product_profile', 'warning', 'spine.product_profile.protein_intent_v1', {
          input: 'protein',
        }),
      );
    }
  }

  /* -- dietary ------------------------------------------------------------ */
  const dietary = {
    ...DEFAULT_RECIPE_INTENT.dietary,
    ...(saved?.dietary ?? {}),
    ...(input.dietary ?? {}),
  };
  if (flavor.veganHint) dietary.vegan = true;
  if (flavor.lactoseFreeHint) dietary.lactoseFree = true; // lactose-free is NOT vegan
  if (flavor.alcoholHint) dietary.alcohol = true;

  // Explicit vegan intent forces/validates vegan_gelato — unless the user
  // explicitly chose sorbet, which is also non-dairy but a different product.
  if (dietary.vegan && profile !== 'sorbet') {
    profile = 'vegan_gelato';
  }

  // Saved/system fallback for the profile value (warnings above still stand).
  if (profile === null) {
    if (saved !== null) {
      profile = saved.defaultProductProfile;
      savedUsed = true;
    } else {
      profile = DEFAULT_RECIPE_INTENT.productProfile;
    }
  }

  /* -- flavor-driven routing (locked safe rules only) ---------------------- */
  if (flavor.group === 'chocolate') {
    if (profile === 'sorbet') {
      // Chocolate sorbet is special and not default v1.0 — keep sorbet, warn.
      routingWarnings.push(
        warning('flavor_product_profile_conflict', 'warning', 'spine.recipe_intent.chocolate_sorbet_conflict'),
      );
    } else if (profile === 'standard_gelato' && !unsupportedProfileIntent && !dietary.vegan) {
      profile = 'chocolate_gelato';
      routingWarnings.push(
        warning('profile_forced_by_flavor', 'info', 'spine.recipe_intent.profile_forced_by_flavor', {
          to: 'chocolate_gelato',
        }),
      );
    }
    // vegan_gelato + chocolate stays vegan; chocolate_gelato stays as-is.
  }

  // Profile→dietary coherence: an explicitly vegan profile IS vegan intent
  // (validation, not guessing) — the intent object must never contradict itself.
  if (profile === 'vegan_gelato') dietary.vegan = true;

  /* -- quality tier -------------------------------------------------------- */
  let qualityTier: QualityTier;
  const rawTier = firstNonEmpty(input.qualityTier, input.mode);
  if (rawTier !== undefined) {
    const aliased = QUALITY_TIER_ALIASES[canonicalizeChoice(rawTier)];
    if (aliased !== undefined) {
      qualityTier = aliased;
    } else {
      if (saved !== null) {
        qualityTier = saved.defaultQualityTier;
        savedUsed = true;
      } else {
        qualityTier = DEFAULT_RECIPE_INTENT.qualityTier;
      }
      fieldWarnings.push(
        warning('invalid_quality_tier', 'warning', 'spine.recipe_intent.invalid_quality_tier', { input: rawTier }),
      );
    }
  } else if (saved !== null) {
    qualityTier = saved.defaultQualityTier;
    savedUsed = true;
  } else {
    qualityTier = DEFAULT_RECIPE_INTENT.qualityTier;
  }

  /* -- serving temperature -------------------------------------------------- */
  let servingTemperatureC: ServingTemperatureC;
  const rawTemperature = input.servingTemperatureC ?? input.targetTemperatureC;
  if (rawTemperature !== undefined) {
    if (rawTemperature === -11 || rawTemperature === -12 || rawTemperature === -13) {
      servingTemperatureC = rawTemperature;
    } else {
      if (saved !== null) {
        servingTemperatureC = saved.defaultServingTemperatureC;
        savedUsed = true;
      } else {
        servingTemperatureC = DEFAULT_RECIPE_INTENT.servingTemperatureC;
      }
      fieldWarnings.push(
        warning('invalid_serving_temperature', 'warning', 'spine.recipe_intent.invalid_serving_temperature', {
          input: rawTemperature,
        }),
      );
    }
  } else if (saved !== null) {
    servingTemperatureC = saved.defaultServingTemperatureC;
    savedUsed = true;
  } else {
    servingTemperatureC = DEFAULT_RECIPE_INTENT.servingTemperatureC;
  }

  /* -- texture / sweetness / cost ------------------------------------------ */
  const resolveChoice = <T,>(
    raw: string | undefined,
    aliases: Readonly<Record<string, T>>,
    savedValue: T | undefined,
    fallback: T,
    invalidCode: DesignerWarning['code'],
    messageKey: string,
  ): T => {
    if (raw !== undefined) {
      const aliased = aliases[canonicalizeChoice(raw)];
      if (aliased !== undefined) return aliased;
      fieldWarnings.push(warning(invalidCode, 'warning', messageKey, { input: raw }));
    }
    if (savedValue !== undefined) {
      savedUsed = true;
      return savedValue;
    }
    return fallback;
  };

  const texturePreference = resolveChoice<TexturePreference>(
    input.texturePreference,
    TEXTURE_ALIASES,
    saved?.defaultTexturePreference,
    DEFAULT_RECIPE_INTENT.texturePreference,
    'invalid_texture_preference',
    'spine.recipe_intent.invalid_texture_preference',
  );
  const sweetnessPreference = resolveChoice<SweetnessPreference>(
    input.sweetnessPreference,
    SWEETNESS_ALIASES,
    saved?.defaultSweetnessPreference,
    DEFAULT_RECIPE_INTENT.sweetnessPreference,
    'invalid_sweetness_preference',
    'spine.recipe_intent.invalid_sweetness_preference',
  );
  const costPriority = resolveChoice<CostPriority>(
    input.costPriority,
    COST_PRIORITY_ALIASES,
    saved?.defaultCostPriority,
    DEFAULT_RECIPE_INTENT.costPriority,
    'invalid_cost_priority',
    'spine.recipe_intent.invalid_cost_priority',
  );

  /* -- naturalOnly / boosters ------------------------------------------------ */
  const naturalOnly = input.naturalOnly ?? saved?.naturalOnly ?? DEFAULT_RECIPE_INTENT.naturalOnly;
  const allowBoosters =
    input.allowBoosters !== undefined
      ? input.allowBoosters
      : naturalOnly
        ? false
        : (saved?.allowBoosters ?? DEFAULT_RECIPE_INTENT.allowBoosters);

  /* -- constraints ------------------------------------------------------------ */
  const constraints = {
    excludedIngredientIds: [...(input.excludedIngredientIds ?? saved?.excludedIngredientIds ?? [])],
    lockedIngredientIds: [...(input.lockedIngredientIds ?? [])],
    heroIngredientIds: [...(input.heroIngredientIds ?? [])],
    batchSizeG: normalizeGrams(input.batchSizeG),
    machineCapacityG: normalizeGrams(input.machineCapacityG),
  };

  /* -- source + source warnings ------------------------------------------------ */
  const source = hasExplicitInput ? 'user_input' : saved !== null ? 'saved_defaults' : 'fallback';
  if (savedUsed || source === 'saved_defaults') {
    sourceWarnings.push(warning('saved_default_used', 'info', 'spine.recipe_intent.saved_default_used'));
  }
  if (source === 'fallback') {
    sourceWarnings.push(warning('fallback_default_used', 'info', 'spine.recipe_intent.fallback_default_used'));
  }

  return {
    productProfile: profile,
    qualityTier,
    servingTemperatureC,
    texturePreference,
    sweetnessPreference,
    costPriority,
    ...(rawFlavorText !== undefined ? { flavorText: rawFlavorText } : {}),
    flavorGroup: flavor.group,
    flavorTags: [...flavor.tags],
    naturalOnly,
    allowBoosters,
    dietary,
    constraints,
    source,
    warnings: [...profileWarnings, ...routingWarnings, ...fieldWarnings, ...sourceWarnings],
    contractVersion: SPINE_CONTRACT_VERSION,
  };
}
