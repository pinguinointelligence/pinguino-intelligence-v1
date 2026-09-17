/**
 * FINAL concept defaults — the later SELECTION stage of the central Mapper/Search
 * authority (SA-03 ANY-scope default map + SA-04 recipe-scope map).
 *
 * The parser still only recognises CONCEPTS (`SearchMention.piId === null`); nothing
 * here turns an alias into a PI. A decision is consumed only when the caller's usage
 * is HOME_ADD ("the customer named a generic ingredient") and the input carries no
 * explicit requirement the default could contradict. PRO_SEARCH, HOME_REPLACE and
 * PRO_REPLACE never read this module.
 *
 * Nothing is re-ranked: the order is the owner-frozen default + alternatives, narrowed
 * only by the frozen recipe-scope policy. Legality (active, approved) is checked by the
 * catalogue boundary against live rows, never assumed here.
 */
import { accentless } from './normalize';
import type {
  MapperConceptDefaultDecision,
  MapperConceptDefaultsData,
  MapperConceptScope,
} from './conceptDefaultTypes';
import type { MapperReleaseData, MapperSearchResolution, SourceSpan } from './types';

export type { MapperConceptDefaultDecision, MapperConceptScope } from './conceptDefaultTypes';

export type ConceptDefaultIndex = ReadonlyMap<string, MapperConceptDefaultDecision>;

export function indexConceptDefaults(data: MapperConceptDefaultsData): ConceptDefaultIndex {
  return new Map(data.defaults.map((decision) => [decision.conceptKey, decision]));
}

let defaultsPromise: Promise<ConceptDefaultIndex> | null = null;

/** Lazy: the 245-row export is only needed once a generic idea is being resolved. */
export function loadMapperConceptDefaults(): Promise<ConceptDefaultIndex> {
  defaultsPromise ??= import('./generated/conceptDefaults').then(
    (module) => indexConceptDefaults(module.MAPPER_CONCEPT_DEFAULTS),
    (error: unknown) => {
      // A failed chunk load must not poison the whole session.
      defaultsPromise = null;
      throw error;
    },
  );
  return defaultsPromise;
}

/**
 * Read-only knowledge the selection needs from the SA-10 release: concept lineage, the
 * nearest central aliases of a word, Mapper name/brand tokens and grammar linkers. It is
 * derived from the frozen release only — HOME contributes no word list of its own.
 */
export interface ConceptLineage {
  readonly isKnown: (key: string) => boolean;
  /** True when the keys are equal or one is an ancestor of the other. */
  readonly related: (left: string, right: string) => boolean;
  /** ATTRIBUTE concepts (vegan, sugar_free, …) — recipe constraints, not product forms. */
  readonly isRecipeAttribute: (key: string) => boolean;
  /** Central alias targets nearest to `word` within its typo tolerance, by channel. */
  readonly nearest: (word: string) => {
    readonly concepts: ReadonlySet<string>;
    readonly qualifiers: ReadonlySet<string>;
    readonly attributes: ReadonlySet<string>;
  };
  /** A word that appears in Mapper product names or brands (a real word, not a typo). */
  readonly isMapperWord: (word: string) => boolean;
  /** Grammar linkers between a head noun and its modifier („de”, „z”, „of”, …). */
  readonly isLinker: (words: string) => boolean;
  readonly mapperSubcategory: (piId: string) => string | null;
}

const lineageByRelease = new WeakMap<object, ConceptLineage>();

/** Typo tolerance by word length (short words get none). */
const toleranceFor = (length: number): number => (length >= 8 ? 2 : length >= 5 ? 1 : 0);

function boundedDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const value = Math.min(
        current[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length]!;
}

export function conceptLineage(release: MapperReleaseData): ConceptLineage {
  const cached = lineageByRelease.get(release);
  if (cached) return cached;
  const rows = (Array.isArray(release.concepts) ? release.concepts : []) as ReadonlyArray<{
    id: string;
    key: string;
    type: string;
    parentConceptId: string | null;
  }>;
  const keyById = new Map(rows.map((row) => [row.id, row.key]));
  const parentByKey = new Map(
    rows.map((row) => [
      row.key,
      row.parentConceptId ? (keyById.get(row.parentConceptId) ?? null) : null,
    ]),
  );
  const attributeKeys = new Set(
    rows.filter((row) => row.type === 'ATTRIBUTE').map((row) => row.key),
  );
  const ancestors = (key: string): Set<string> => {
    const seen = new Set<string>();
    for (let current = parentByKey.get(key) ?? null; current && !seen.has(current); ) {
      seen.add(current);
      current = parentByKey.get(current) ?? null;
    }
    return seen;
  };

  type AliasEntry = { readonly text: string; readonly key: string; readonly channel: string };
  const aliasesByLength = new Map<number, AliasEntry[]>();
  for (const alias of release.searchAliases) {
    const channel =
      alias.targetType === 'INGREDIENT_CONCEPT'
        ? 'concept'
        : alias.targetType === 'QUALIFIER'
          ? 'qualifier'
          : alias.targetType === 'ATTRIBUTE'
            ? 'attribute'
            : null;
    if (channel === null) continue;
    const key = alias.overrideTargetKey || alias.targetKey;
    for (const surface of new Set([alias.raw, alias.normalized])) {
      const text = fold(surface ?? '');
      if (!text) continue;
      const bucket = aliasesByLength.get(text.length) ?? [];
      bucket.push({ text, key, channel });
      aliasesByLength.set(text.length, bucket);
    }
  }
  const nearestCache = new Map<string, ReturnType<ConceptLineage['nearest']>>();

  const mapperWords = new Set<string>();
  const subcategoryByPi = new Map<string, string>();
  for (const row of release.mapperRows as ReadonlyArray<Record<string, unknown>>) {
    subcategoryByPi.set(String(row.id), String(row.subcategory ?? ''));
    const brand = String(row.brand ?? '');
    for (const source of [
      String(row.displayName ?? ''),
      String(row.internalName ?? '').replace(/_/g, ' '),
      brand === 'Standard' || brand === 'General' ? '' : brand,
    ]) {
      for (const word of fold(source).split(' ')) if (word.length >= 3) mapperWords.add(word);
    }
  }
  const linkers = new Set<string>();
  const profiles = (release.roleGrammar as Record<string, unknown> | undefined)?.[
    '02_LOCALE_ATTACHMENT_PROFILES'
  ];
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    for (const linker of String(
      (profile as Record<string, unknown>).ingredient_linkers ?? '',
    ).split(';')) {
      const text = fold(linker);
      if (text) linkers.add(text);
    }
  }

  const lineage: ConceptLineage = {
    isKnown: (key) => parentByKey.has(key),
    related: (left, right) =>
      left === right || ancestors(left).has(right) || ancestors(right).has(left),
    isRecipeAttribute: (key) => attributeKeys.has(key),
    nearest: (word) => {
      const text = fold(word);
      const cachedNearest = nearestCache.get(text);
      if (cachedNearest) return cachedNearest;
      const tolerance = toleranceFor(text.length);
      let best = tolerance + 1;
      let hits: AliasEntry[] = [];
      for (let length = text.length - tolerance; length <= text.length + tolerance; length += 1) {
        for (const entry of aliasesByLength.get(length) ?? []) {
          const distance = boundedDistance(text, entry.text, Math.min(best, tolerance));
          if (distance < best) {
            best = distance;
            hits = [entry];
          } else if (distance === best && distance <= tolerance) {
            hits.push(entry);
          }
        }
      }
      const pick = (channel: string) =>
        new Set(hits.filter((entry) => entry.channel === channel).map((entry) => entry.key));
      const result = {
        concepts: pick('concept'),
        qualifiers: pick('qualifier'),
        attributes: pick('attribute'),
      };
      nearestCache.set(text, result);
      return result;
    },
    isMapperWord: (word) => mapperWords.has(fold(word)),
    isLinker: (words) => linkers.has(fold(words)),
    mapperSubcategory: (piId) => subcategoryByPi.get(piId) ?? null,
  };
  lineageByRelease.set(release, lineage);
  return lineage;
}

/**
 * The frozen candidate order for one recipe scope. `null` = ANY (no profile known).
 * GELATO inherits ANY by the SA-04 freeze; SORBET/VEGAN inherit, lead with the frozen
 * alternative, or have no current compliant candidate (empty — nothing is fabricated).
 */
export function approvedConceptOrder(
  decision: MapperConceptDefaultDecision,
  scope: MapperConceptScope | null,
): readonly string[] {
  if (scope === null) return [decision.defaultPiId, ...decision.alternativePiIds];
  const rule = decision.scopes[scope];
  if (rule.policy === 'NO_CURRENT_CANDIDATE_FINAL' || rule.suggestedPiId === null) return [];
  return [rule.suggestedPiId, ...rule.eligiblePiIds.filter((id) => id !== rule.suggestedPiId)];
}

export interface ConceptDefaultFocus {
  /** The words that name the product being selected (one HOME chip). */
  readonly text: string;
  /** Concept key an upstream parser already recognised for `text`, if any. */
  readonly hintedConceptKey: string | null;
  /** The caller's own terms of the same input, in order (the focus is one of them). */
  readonly siblingTexts: readonly string[];
}

export type ConceptDefaultIntent =
  | {
      readonly kind: 'default';
      readonly decision: MapperConceptDefaultDecision;
      /** `central`: the release recognised the words; `parser`: confirmed by a near alias. */
      readonly recognisedBy: 'central' | 'parser';
      /** A recipe attribute in the input that implies a frozen scope (vegan → VEGAN). */
      readonly impliedScope: MapperConceptScope | null;
      /** A multi-word central mention this focus owns („syrop klonowy”). */
      readonly phraseText: string | null;
    }
  | {
      /** A decision exists, but the input states a form the default could contradict. */
      readonly kind: 'clarify';
      readonly decision: MapperConceptDefaultDecision;
      readonly reason: 'explicit_qualifier' | 'prepared_form_role';
      readonly impliedScope: MapperConceptScope | null;
      readonly phraseText: string | null;
    }
  | {
      /** The focus is part of a multi-word mention another term of the input owns. */
      readonly kind: 'covered';
      readonly phraseText: string;
    }
  | {
      readonly kind: 'not_applicable';
      readonly reason:
        | 'no_concept'
        | 'no_decision'
        | 'auto_add_blocked'
        | 'concept_conflict'
        | 'explicit_grade'
        | 'explicit_brand'
        | 'real_word'
        | 'unconfirmed_word'
        | 'adjacent_context'
        | 'exact_or_technical_reference';
    };

/** Roles that name a prepared product (sauce, coating, …), not the raw ingredient. */
const PREPARED_FORM_ROLES: ReadonlySet<string> = new Set([
  'SAUCE',
  'COATING',
  'SWIRL_RIPPLE',
  'FILLING',
  'LAYER',
]);

/** Frozen SA-04 scopes a recipe ATTRIBUTE names. */
const SCOPE_BY_ATTRIBUTE: Readonly<Record<string, MapperConceptScope>> = { vegan: 'VEGAN' };

/** Product-form qualifiers a natural fresh default already satisfies. */
const FRESH_QUALIFIERS: ReadonlySet<string> = new Set(['fresh', 'raw']);

function fold(value: string): string {
  return accentless(value)
    .toLocaleLowerCase('en')
    .replace(/ł/g, 'l')
    .replace(/ß/g, 'ss')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const words = (value: string): string[] => fold(value).split(' ').filter(Boolean);

const containsRun = (haystack: readonly string[], needle: readonly string[]): boolean => {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    if (needle.every((word, offset) => haystack[start + offset] === word)) return true;
  }
  return false;
};

/** Neighbours: only whitespace, a hyphen or a grammar linker („de”, „z”) between them. */
const adjacent = (
  input: string,
  left: SourceSpan,
  right: SourceSpan,
  lineage: ConceptLineage,
): boolean => {
  const [first, second] = left.start <= right.start ? [left, right] : [right, left];
  if (second.start < first.end) return true;
  const between = input.slice(first.end, second.start);
  return /^[\s\-–—]*$/u.test(between) || lineage.isLinker(between);
};

/**
 * Decide whether the frozen default may be consumed for `focus` within `resolution`
 * (the central resolution of the WHOLE input element the focus came from). Pure.
 */
export function conceptDefaultIntent(
  resolution: MapperSearchResolution,
  focus: ConceptDefaultFocus,
  defaults: ConceptDefaultIndex,
  lineage: ConceptLineage,
): ConceptDefaultIntent {
  if (
    resolution.downstream.exactProductKeys.length > 0 ||
    resolution.technicalMentions.length > 0 ||
    resolution.searchMentions.some((mention) => mention.targetType !== 'INGREDIENT_CONCEPT')
  ) {
    return { kind: 'not_applicable', reason: 'exact_or_technical_reference' };
  }
  // A stated number (70 %, 3,2 %, 35 g) is a grade the generic default cannot promise.
  if (/\p{N}/u.test(resolution.input)) {
    return { kind: 'not_applicable', reason: 'explicit_grade' };
  }

  const focusWords = words(focus.text);
  const covering = resolution.searchMentions.find((mention) =>
    containsRun(words(mention.sourceText), focusWords),
  );
  let centralKey: string;
  let focusSpan: SourceSpan | null = null;
  let focusGap: MapperSearchResolution['searchGaps'][number] | undefined;
  let phraseText: string | null = null;
  let recognisedBy: 'central' | 'parser' = 'central';

  if (covering) {
    const mentionWords = words(covering.sourceText);
    if (mentionWords.length > focusWords.length) {
      // „syrop klonowy” is ONE product: the first of the caller's terms inside the phrase
      // owns it, every other term inside it is covered and never selects on its own.
      const owner = focus.siblingTexts.find((text) => containsRun(mentionWords, words(text)));
      if (owner !== undefined && fold(owner) !== fold(focus.text)) {
        return { kind: 'covered', phraseText: covering.sourceText };
      }
      phraseText = covering.sourceText;
    } else if (
      focus.hintedConceptKey !== null &&
      lineage.isKnown(focus.hintedConceptKey) &&
      !lineage.related(covering.specializationKey ?? covering.targetKey, focus.hintedConceptKey)
    ) {
      // An all-locale alias collision („jagoda”): two unrelated concepts in one word.
      return { kind: 'not_applicable', reason: 'concept_conflict' };
    }
    if (!covering.autoAddAllowed) return { kind: 'not_applicable', reason: 'auto_add_blocked' };
    centralKey = covering.specializationKey ?? covering.targetKey;
    focusSpan = covering.span;
  } else {
    focusGap = resolution.searchGaps.find((gap) => containsRun(words(gap.sourceText), focusWords));
    if (!focusGap || focus.hintedConceptKey === null) {
      return { kind: 'not_applicable', reason: 'no_concept' };
    }
    // The release does not know the word („truskawki”, a typo). It may still select only
    // when the release confirms it: the nearest central aliases name the same (or a
    // related) concept, and the word is not itself a real product word („toffee”).
    if (lineage.isMapperWord(focus.text)) return { kind: 'not_applicable', reason: 'real_word' };
    const near = lineage.nearest(focus.text);
    if (near.qualifiers.size > 0 || near.attributes.size > 0 || near.concepts.size === 0) {
      return { kind: 'not_applicable', reason: 'unconfirmed_word' };
    }
    const hint = focus.hintedConceptKey;
    const confirmed = [...near.concepts];
    if (!confirmed.every((key) => lineage.related(key, hint))) {
      return { kind: 'not_applicable', reason: 'concept_conflict' };
    }
    centralKey = confirmed.length === 1 && defaults.has(confirmed[0]!) ? confirmed[0]! : hint;
    focusSpan = focusGap.span;
    recognisedBy = 'parser';
  }

  const decision = defaults.get(centralKey);
  if (!decision) return { kind: 'not_applicable', reason: 'no_decision' };

  let impliedScope: MapperConceptScope | null =
    resolution.attributes.map((key) => SCOPE_BY_ATTRIBUTE[key]).find(Boolean) ?? null;
  let qualifierWord = false;
  for (const gap of resolution.searchGaps) {
    if (gap === focusGap) continue;
    for (const word of words(gap.sourceText)) {
      if (word.length < 3 || lineage.isLinker(word)) continue;
      const near = lineage.nearest(word);
      if (near.qualifiers.size > 0) {
        // „mrożona” ≈ central qualifier „mrożony”: a stated form.
        qualifierWord = true;
      } else if (near.attributes.size > 0) {
        impliedScope ??=
          [...near.attributes].map((key) => SCOPE_BY_ATTRIBUTE[key]).find(Boolean) ?? null;
      } else if (lineage.isMapperWord(word)) {
        // „pregel truskawka”: a brand or product word from the Mapper itself.
        return { kind: 'not_applicable', reason: 'explicit_brand' };
      }
      // Anything else („poproszę”, „dodaj”, „chciałabym”) states no product requirement.
    }
  }

  if (
    focusSpan !== null &&
    resolution.searchMentions.some(
      (mention) =>
        mention !== covering &&
        !mention.autoAddAllowed &&
        adjacent(resolution.input, mention.span, focusSpan!, lineage),
    )
  ) {
    // „mleko migdałowe”, „leche de almendras”: the head noun is not the focus ingredient.
    return { kind: 'not_applicable', reason: 'adjacent_context' };
  }

  const defaultIsFresh = /fresh/.test(lineage.mapperSubcategory(decision.defaultPiId) ?? '');
  const explicitQualifier =
    qualifierWord ||
    resolution.attributes.some(
      (key) => !lineage.isRecipeAttribute(key) && !(FRESH_QUALIFIERS.has(key) && defaultIsFresh),
    );
  if (explicitQualifier) {
    return { kind: 'clarify', decision, reason: 'explicit_qualifier', impliedScope, phraseText };
  }
  if (resolution.roleMentions.some((role) => PREPARED_FORM_ROLES.has(role.roleKey))) {
    return { kind: 'clarify', decision, reason: 'prepared_form_role', impliedScope, phraseText };
  }
  return { kind: 'default', decision, recognisedBy, impliedScope, phraseText };
}
