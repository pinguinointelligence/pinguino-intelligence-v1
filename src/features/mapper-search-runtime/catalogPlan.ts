import { accentless, normalizeMapperSearchText } from './normalize';
import { loadMapperSearchRuntime, browserSearchGapsTelemetry } from './client';
import type { MapperSearchRuntime } from './runtime';
import type { MapperSearchResolution, ResolveMapperSearchOptions } from './types';

export interface MapperCatalogSearchPlan {
  query: string;
  tokenGroups: readonly (readonly string[])[];
  resolution: MapperSearchResolution;
  /** A fully unresolved or ambiguity-gated query must fail closed. */
  blocked: boolean;
}

const serverTerm = (value: string): string =>
  accentless(value)
    .toLocaleLowerCase('en')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const defaultLocale = (): string =>
  typeof navigator === 'undefined' || !navigator.language ? 'en' : navigator.language;

/** Build the database-query handoff from semantic output. Alias matching ends
 * here; the downstream catalogue still owns PI/product selection and science. */
export function createMapperCatalogSearchPlan(
  runtime: MapperSearchRuntime,
  input: string,
  options: ResolveMapperSearchOptions = {},
): MapperCatalogSearchPlan {
  const localeVariant = options.localeVariant ?? defaultLocale();
  const resolution = runtime.resolve(input, {
    ...options,
    localeVariant,
    telemetry: options.telemetry ?? browserSearchGapsTelemetry,
  });
  const semanticMentions = [
    ...resolution.searchMentions.map((mention) => ({
      targetId: mention.specializationId ?? mention.targetId,
      targetKey: mention.specializationKey ?? mention.targetKey,
      targetType: mention.targetType,
    })),
    ...resolution.technicalMentions.flatMap((mention) =>
      mention.targetKey
        ? [{
            targetId: mention.targetConceptId ?? '',
            targetKey: mention.targetKey,
            targetType: 'INGREDIENT_CONCEPT',
          }]
        : [],
    ),
  ].filter((mention) =>
    ['INGREDIENT_CONCEPT', 'EXACT_PRODUCT', 'NAMED_COMPOSITE'].includes(mention.targetType),
  );
  const uniqueMentions = [
    ...new Map(semanticMentions.map((mention) => [mention.targetKey, mention])).values(),
  ];
  const concepts = Array.isArray(runtime.release.concepts)
    ? runtime.release.concepts as Array<Record<string, unknown>>
    : [];
  const tokenGroups = uniqueMentions.map((mention) => {
    const concept = concepts.find(
      (row) => row.id === mention.targetId || row.key === mention.targetKey,
    );
    const aliases = runtime.release.searchAliases
      .filter(
        (row) =>
          (row.overrideTargetId || row.targetId) === mention.targetId ||
          (row.overrideTargetKey || row.targetKey) === mention.targetKey,
      )
      .sort((a, b) => {
        const localeA = a.locale === resolution.localeVariant ? 2 : a.locale === 'en' ? 1 : 0;
        const localeB = b.locale === resolution.localeVariant ? 2 : b.locale === 'en' ? 1 : 0;
        return localeB - localeA || b.priority - a.priority || b.releaseSequence - a.releaseSequence;
      });
    const terms = [
      mention.targetKey.replaceAll('_', ' '),
      String(concept?.canonicalNameEn ?? ''),
      ...aliases.map((row) => row.raw),
    ]
      .map(serverTerm)
      .filter((value) => value.length >= 2);
    return [...new Set(terms)].slice(0, 64);
  }).filter((group) => group.length > 0);
  return {
    query: normalizeMapperSearchText(input, localeVariant),
    tokenGroups,
    resolution,
    blocked:
      input.trim() !== '' &&
      uniqueMentions.length === 0 &&
      (resolution.searchGaps.length > 0 || resolution.technicalMentions.some(
        (mention) => mention.action === 'AMBIGUITY_GATE',
      )),
  };
}

export async function planMapperCatalogSearch(
  input: string,
  options: ResolveMapperSearchOptions = {},
): Promise<MapperCatalogSearchPlan> {
  return createMapperCatalogSearchPlan(await loadMapperSearchRuntime(), input, options);
}
