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
 * Nothing is re-ranked: the order is the owner-frozen default + alternatives, filtered
 * only by the frozen recipe-scope policy. Legality (active, approved) is checked by
 * the catalogue boundary against live rows, never assumed here.
 */
import { accentless } from './normalize';
import type {
  MapperConceptDefaultDecision,
  MapperConceptDefaultsData,
  MapperConceptScope,
} from './conceptDefaultTypes';
import type { MapperSearchResolution } from './types';

export type { MapperConceptDefaultDecision, MapperConceptScope } from './conceptDefaultTypes';

export type ConceptDefaultIndex = ReadonlyMap<string, MapperConceptDefaultDecision>;

export function indexConceptDefaults(data: MapperConceptDefaultsData): ConceptDefaultIndex {
  return new Map(data.defaults.map((decision) => [decision.conceptKey, decision]));
}

let defaultsPromise: Promise<ConceptDefaultIndex> | null = null;

/** Lazy: the 245-row export is only needed once a generic idea is being resolved. */
export function loadMapperConceptDefaults(): Promise<ConceptDefaultIndex> {
  defaultsPromise ??= import('./generated/conceptDefaults').then((module) =>
    indexConceptDefaults(module.MAPPER_CONCEPT_DEFAULTS),
  );
  return defaultsPromise;
}

/**
 * The frozen candidate order for one recipe scope. `null` = ANY (no profile known).
 * GELATO inherits ANY by the SA-04 freeze; SORBET/VEGAN either inherit, lead with
 * the frozen alternative, or have no current compliant candidate (empty — nothing is
 * fabricated).
 */
export function approvedConceptOrder(
  decision: MapperConceptDefaultDecision,
  scope: MapperConceptScope | null,
): readonly string[] {
  const any = [decision.defaultPiId, ...decision.alternativePiIds];
  if (scope === null) return any;
  const rule = decision.scopes[scope];
  if (rule.policy === 'NO_CURRENT_CANDIDATE_FINAL' || rule.suggestedPiId === null) return [];
  const eligible = new Set(rule.eligiblePiIds);
  return [rule.suggestedPiId, ...any.filter((id) => id !== rule.suggestedPiId && eligible.has(id))];
}

export interface ConceptDefaultFocus {
  /** The words that name the product being selected (one HOME chip). */
  readonly text: string;
  /** Concept key an upstream parser already recognised for `text`, if any. */
  readonly hintedConceptKey: string | null;
  /**
   * Other content words of the same input that the caller keeps as separate,
   * unrecognised terms (a brand, "mrożona", …). The central resolver reports them as
   * gaps; the default must not silently discard what they might require.
   */
  readonly unknownContentTokens: readonly string[];
}

export type ConceptDefaultIntent =
  | {
      readonly kind: 'default';
      readonly decision: MapperConceptDefaultDecision;
      /** `central`: the release recognised the words; `parser`: only the hint did. */
      readonly recognisedBy: 'central' | 'parser';
    }
  | {
      /** A decision exists, but the input states a requirement the default could contradict. */
      readonly kind: 'clarify';
      readonly decision: MapperConceptDefaultDecision;
      readonly reason: 'explicit_qualifier' | 'prepared_form_role';
    }
  | {
      readonly kind: 'not_applicable';
      readonly reason:
        | 'no_concept'
        | 'no_decision'
        | 'auto_add_blocked'
        | 'concept_conflict'
        | 'unknown_content_words'
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

const fold = (value: string): string =>
  accentless(value)
    .toLocaleLowerCase('en')
    .replace(/ł/g, 'l')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * Decide whether the frozen default may be consumed for `focus` within `resolution`
 * (the central resolution of the WHOLE input the focus came from). Pure.
 */
export function conceptDefaultIntent(
  resolution: MapperSearchResolution,
  focus: ConceptDefaultFocus,
  defaults: ConceptDefaultIndex,
): ConceptDefaultIntent {
  if (
    resolution.downstream.exactProductKeys.length > 0 ||
    resolution.technicalMentions.length > 0 ||
    resolution.searchMentions.some((mention) => mention.targetType !== 'INGREDIENT_CONCEPT')
  ) {
    return { kind: 'not_applicable', reason: 'exact_or_technical_reference' };
  }

  const focusText = fold(focus.text);
  const conceptMentions = resolution.searchMentions.filter(
    (mention) => mention.targetType === 'INGREDIENT_CONCEPT',
  );
  const focusMention =
    conceptMentions.find((mention) => fold(mention.sourceText) === focusText) ??
    (conceptMentions.length === 1 &&
    focusText !== '' &&
    (fold(conceptMentions[0]!.sourceText).includes(focusText) ||
      focusText.includes(fold(conceptMentions[0]!.sourceText)))
      ? conceptMentions[0]
      : undefined);
  const centralKey = focusMention
    ? (focusMention.specializationKey ?? focusMention.targetKey)
    : null;

  if (
    centralKey !== null &&
    focus.hintedConceptKey !== null &&
    centralKey !== focus.hintedConceptKey
  ) {
    // e.g. an all-locale alias collision: the release and the upstream parser disagree
    // about what the word means, so no default can be applied on the customer's behalf.
    return { kind: 'not_applicable', reason: 'concept_conflict' };
  }
  if (focusMention && !focusMention.autoAddAllowed) {
    return { kind: 'not_applicable', reason: 'auto_add_blocked' };
  }

  const conceptKey = centralKey ?? focus.hintedConceptKey;
  if (conceptKey === null) return { kind: 'not_applicable', reason: 'no_concept' };
  const decision = defaults.get(conceptKey);
  if (!decision) return { kind: 'not_applicable', reason: 'no_decision' };

  const unknown = new Set(focus.unknownContentTokens.map(fold).filter(Boolean));
  const blockingGap = resolution.searchGaps.some((gap) => {
    const text = fold(gap.sourceText);
    if (text === '') return false;
    if (centralKey === null && text === focusText) return false;
    return (
      unknown.has(text) ||
      gap.reason !== 'UNMATCHED' ||
      text.split(' ').some((word) => unknown.has(word))
    );
  });
  if (blockingGap) return { kind: 'not_applicable', reason: 'unknown_content_words' };

  if (resolution.attributes.length > 0) {
    return { kind: 'clarify', decision, reason: 'explicit_qualifier' };
  }
  if (resolution.roleMentions.some((role) => PREPARED_FORM_ROLES.has(role.roleKey))) {
    return { kind: 'clarify', decision, reason: 'prepared_form_role' };
  }
  return { kind: 'default', decision, recognisedBy: centralKey !== null ? 'central' : 'parser' };
}
