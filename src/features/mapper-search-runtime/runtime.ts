import {
  accentless,
  isTokenEndBoundary,
  isTokenStartBoundary,
  normalizeMapperSearchText,
  normalizeWithSpans,
  type NormalizedWithSpans,
} from './normalize';
import type {
  LocaleContract,
  MapperReleaseData,
  MapperSearchResolution,
  MapperSearchTraceEntry,
  ResolveMapperSearchOptions,
  RoleAliasRecord,
  RoleMention,
  SearchAliasRecord,
  SearchGap,
  SearchMention,
  SourceSpan,
  TechnicalMention,
} from './types';

interface Match<T> {
  row: T;
  normalized: string;
  start: number;
  end: number;
  span: SourceSpan;
  fallback: boolean;
}

interface RuntimeProtectedPhrase {
  locale: string;
  normalized: string;
  targetKey: string;
}

interface RuntimeBlockedPhrase {
  locale: string;
  market: string;
  raw: string;
}

interface RuntimeAutoAddBlock extends RuntimeBlockedPhrase {
  targetId: string;
  targetKey: string;
}

const scopeParts = (value: string): string[] =>
  value
    .split(/[;/]/)
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);

const localeKey = (value: string): string => {
  const normalized = value.replace('_', '-');
  const lower = normalized.toLowerCase();
  if (lower === 'zh-cn' || lower === 'zh-sg' || lower === 'zh-hans') return 'zh-Hans';
  if (lower === 'zh-tw' || lower === 'zh-hk' || lower === 'zh-hant') return 'zh-Hant';
  return normalized.split('-')[0]?.toLowerCase() || 'en';
};

const rangesOverlap = (a: SourceSpan, b: SourceSpan): boolean => a.start < b.end && b.start < a.end;

function marketMatches(
  scope: string,
  market: string,
  locale: string,
  regionByMarket: ReadonlyMap<string, string>,
): boolean {
  const normalized = scope.trim().toUpperCase();
  if (
    normalized === '' ||
    normalized === 'GLOBAL' ||
    normalized === '*' ||
    normalized.startsWith('GLOBAL_')
  )
    return true;
  if (normalized === `GLOBAL_${locale.toUpperCase()}`) return true;
  if (market === 'GLOBAL') return false;
  const parts = scopeParts(scope);
  return parts.includes(market) || parts.includes(regionByMarket.get(market) ?? '');
}

function allOccurrences<T>(
  normalizedInput: NormalizedWithSpans,
  locale: string,
  row: T,
  surface: string,
  fallback: boolean,
): Match<T>[] {
  const text = normalizedInput.text;
  const needle = normalizeMapperSearchText(surface, locale);
  if (!needle) return [];
  const unsegmentedScript = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u.test(
    needle,
  );
  const explicitCompoundMember = safeRecord(row).matchPolicy === 'COMPOUND_MEMBER';
  const matches: Match<T>[] = [];
  let cursor = 0;
  while (cursor <= text.length - needle.length) {
    const start = text.indexOf(needle, cursor);
    if (start < 0) break;
    const end = start + needle.length;
    if (
      unsegmentedScript ||
      explicitCompoundMember ||
      isTokenStartBoundary(text, start) && isTokenEndBoundary(text, end)
    ) {
      matches.push({
        row,
        normalized: needle,
        start,
        end,
        span: normalizedInput.originalSpan(start, end),
        fallback,
      });
    }
    cursor = start + Math.max(1, needle.length);
  }
  return matches;
}

function isHyphenMember(text: string, start: number, end: number): boolean {
  return text[start - 1] === '-' || text[end] === '-';
}

function gradeHint(surface: string): string | null {
  const match = surface.match(/(?:^|[\s-])(\d{2,3})(?:%|$)/u);
  return match?.[1] ?? null;
}

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export class MapperSearchRuntime {
  readonly release: MapperReleaseData;
  private readonly locales: ReadonlyMap<string, LocaleContract>;
  private readonly regionByMarket: ReadonlyMap<string, string>;

  constructor(release: MapperReleaseData) {
    this.release = release;
    this.assertRelease();
    this.locales = new Map(release.localeContracts.map((row) => [row.locale_variant, row]));
    this.regionByMarket = new Map(
      release.marketRoutes.map((row) => [String(row.ISO2), String(row['Kod regionu'] ?? '')]),
    );
  }

  private assertRelease(): void {
    const { counts } = this.release;
    const exact = (label: string, actual: number, expected: number): void => {
      if (actual !== expected) throw new Error(`${label} release count mismatch: ${actual}/${expected}`);
    };
    exact('SEARCH', this.release.searchAliases.length, counts.searchAliases);
    exact('ROLE', this.release.roleAliases.length, counts.roleAliases);
    exact('TECHNICAL', this.release.technicalAliases.length, counts.technicalAliases);
    exact('locale', this.release.localeContracts.length, counts.localeContracts);
    exact('data contract', this.release.dataContracts.length, counts.dataContracts);
    exact('Mapper', this.release.mapperRows.length, counts.mapper);
    exact('market', this.release.marketRoutes.length, counts.markets);
    if (
      this.release.searchAliases.some(
        (row) => /^PI-ING-/i.test(row.targetId) || /^PI-ING-/i.test(row.overrideTargetId),
      )
    ) {
      throw new Error('Forbidden direct Search alias → PI route in release');
    }
    if (
      this.release.technicalAliases.some(
        (row) => row.automaticPiResolutionAllowed || row.autoAddAllowed,
      )
    ) {
      throw new Error('Forbidden Technical → automatic PI/auto-add route in release');
    }
    if (this.release.localeContracts.some((row) => row.productive_stemming_allowed !== 'FALSE')) {
      throw new Error('Productive stemming is forbidden by the frozen locale contracts');
    }
  }

  resolve(input: string, options: ResolveMapperSearchOptions = {}): MapperSearchResolution {
    const wildcardLocale = options.localeVariant === '*';
    const requestedLocale = localeKey(options.localeVariant ?? 'en');
    const locale = this.locales.has(requestedLocale) ? requestedLocale : 'en';
    const market = (options.marketScope ?? 'GLOBAL').toUpperCase();
    const normalized = normalizeWithSpans(input, locale);
    const trace: MapperSearchTraceEntry[] = this.release.precedence
      .slice()
      .sort((a, b) => Number(b.priority) - Number(a.priority))
      .map((rule, index) => ({
        step: index + 1,
        ruleId: rule.rule_id,
        channel: 'PIPELINE',
        action: `EVALUATED:${rule.rule_key}`,
        aliasId: null,
        span: null,
      }));
    let traceStep = trace.length;
    const addTrace = (
      ruleId: string,
      channel: 'SEARCH' | 'ROLE' | 'TECHNICAL',
      action: string,
      aliasId: string | null,
      span: SourceSpan | null,
    ): void => {
      trace.push({ step: ++traceStep, ruleId, channel, action, aliasId, span });
    };

    const runtimeLexicon = safeRecord(this.release.runtimeLexicon);
    const runtimeSearch = Array.isArray(runtimeLexicon.search)
      ? runtimeLexicon.search as SearchAliasRecord[]
      : [];
    const runtimeRoles = Array.isArray(runtimeLexicon.role)
      ? runtimeLexicon.role as RoleAliasRecord[]
      : [];
    const protectedPhrases = Array.isArray(runtimeLexicon.protectedPhrases)
      ? runtimeLexicon.protectedPhrases as RuntimeProtectedPhrase[]
      : [];
    const blockedPhrases = Array.isArray(runtimeLexicon.blockedPhrases)
      ? runtimeLexicon.blockedPhrases as RuntimeBlockedPhrase[]
      : [];
    const autoAddBlocks = Array.isArray(runtimeLexicon.autoAddBlocks)
      ? runtimeLexicon.autoAddBlocks as RuntimeAutoAddBlock[]
      : [];
    const activeSearch = [...this.release.searchAliases, ...runtimeSearch].filter(
      (row) =>
        (wildcardLocale || localeKey(row.locale) === locale || row.locale === '*') &&
        marketMatches(row.market, market, locale, this.regionByMarket),
    );
    const activeRoles = [...this.release.roleAliases, ...runtimeRoles].filter(
      (row) =>
        (wildcardLocale || localeKey(row.locale) === locale || row.locale === '*') &&
        marketMatches(row.market, market, locale, this.regionByMarket),
    );
    const activeTechnical = this.release.technicalAliases.filter((row) =>
      marketMatches(row.market, market, locale, this.regionByMarket),
    );

    const consumed: SourceSpan[] = [];
    const searchMentions: SearchMention[] = [];
    const technicalMentions: TechnicalMention[] = [];
    const roleMentions: RoleMention[] = [];
    const searchGaps: SearchGap[] = [];
    const attributes: string[] = [];
    let recipeType: string | null = null;

    const isFree = (span: SourceSpan): boolean => !consumed.some((value) => rangesOverlap(value, span));
    const activeAutoAddBlocks = autoAddBlocks.filter(
      (block) =>
        (wildcardLocale || localeKey(block.locale) === locale) &&
        marketMatches(block.market, market, locale, this.regionByMarket) &&
        normalizeMapperSearchText(block.raw, locale) === normalized.text,
    );
    const addSearch = (match: Match<SearchAliasRecord>, rule: string): void => {
      if (!isFree(match.span)) return;
      const row = match.row;
      const sourceText = input.slice(match.span.start, match.span.end);
      const mention: SearchMention = {
        channel: 'SEARCH',
        aliasId: row.id,
        targetType: row.targetType,
        targetId: row.targetId,
        targetKey: row.targetKey,
        specializationId: row.overrideTargetId || null,
        specializationKey: row.overrideTargetKey || null,
        autoAddAllowed:
          row.autoAddAllowed &&
          !activeAutoAddBlocks.some(
            (block) => block.targetId === row.targetId && block.targetKey === row.targetKey,
          ),
        sourceText,
        normalizedText: match.normalized,
        span: match.span,
        rule,
        piId: null,
      };
      if (row.targetType === 'RECIPE_TYPE') recipeType = row.targetKey.toUpperCase();
      else if (row.targetType === 'ATTRIBUTE' || row.targetType === 'QUALIFIER') {
        if (!attributes.includes(row.targetKey)) attributes.push(row.targetKey);
      } else searchMentions.push(mention);
      consumed.push(match.span);
      addTrace(rule, 'SEARCH', `MATCH:${row.targetType}`, row.id, match.span);
    };

    const searchStage = (
      rule: string,
      predicate: (row: SearchAliasRecord) => boolean,
      exactInput = false,
      blockHyphenMembers = false,
    ): void => {
      if (consumed.some((span) => span.start <= 0 && span.end >= input.length)) return;
      const candidates = activeSearch
        .filter(predicate)
        .flatMap((row) =>
          [...new Set([row.raw, row.normalized])].flatMap((surface) =>
            allOccurrences(normalized, locale, row, surface, false),
          ),
        )
        .filter((match) => (!exactInput || match.start === 0 && match.end === normalized.text.length))
        .filter((match) => !blockHyphenMembers || !isHyphenMember(normalized.text, match.start, match.end))
        .sort(
          (a, b) =>
            b.normalized.length - a.normalized.length ||
            b.row.priority - a.row.priority ||
            b.row.releaseSequence - a.row.releaseSequence ||
            a.start - b.start,
        );
      for (const candidate of candidates) addSearch(candidate, rule);
    };

    // Frozen no-guess phrases block unsafe substring resolution while keeping
    // the complete unresolved text in SEARCH_GAPS for downstream telemetry.
    for (const block of blockedPhrases) {
      if (!wildcardLocale && localeKey(block.locale) !== locale) continue;
      if (!marketMatches(block.market, market, locale, this.regionByMarket)) continue;
      for (const match of allOccurrences(normalized, locale, block, block.raw, false)) {
        if (match.start !== 0 || match.end !== normalized.text.length || !isFree(match.span)) continue;
        searchGaps.push({
          sourceText: input.slice(match.span.start, match.span.end),
          normalizedText: match.normalized,
          span: match.span,
          reason: 'UNMATCHED',
        });
        consumed.push(match.span);
        addTrace('SR-PRE-006', 'SEARCH', 'BLOCK_FROZEN_NO_GUESS_PHRASE', null, match.span);
      }
    }

    // A tiny set of vector-authoritative protected phrases must consume their
    // complete span before ingredient/role tokenization. They intentionally do
    // not create a catalogue concept or any downstream PI identity.
    for (const [index, phrase] of protectedPhrases.entries()) {
      if (!wildcardLocale && localeKey(phrase.locale ?? 'en') !== locale) continue;
      const row: SearchAliasRecord = {
        id: `SA11-CONTRACT-PROTECTED-${String(index + 1).padStart(3, '0')}`,
        locale: phrase.locale ?? locale,
        market: 'GLOBAL',
        raw: phrase.normalized,
        normalized: phrase.normalized,
        fallback: '',
        aliasType: 'FROZEN_RUNTIME_CONTRACT',
        targetType: 'PROTECTED_PHRASE',
        targetId: '',
        targetKey: phrase.targetKey,
        matchPolicy: 'PROTECTED_PHRASE',
        priority: 1500,
        morphologyMode: 'EXPLICIT_ONLY',
        hyphenPolicy: 'KEEP',
        autoAddAllowed: false,
        ambiguityGroup: '',
        collisionPolicy: 'FROZEN_VECTOR_CONTRACT',
        fallbackPolicy: 'NONE',
        overrideTargetId: '',
        overrideTargetKey: '',
        releaseSequence: 0,
      };
      for (const match of allOccurrences(normalized, locale, row, phrase.normalized, false)) {
        addSearch(match, 'SR-PRE-006');
      }
    }

    searchStage('SR-PRE-004', (row) => row.targetType === 'EXACT_PRODUCT', true);
    searchStage('SR-PRE-005', (row) => row.targetType === 'NAMED_COMPOSITE');
    searchStage(
      'SR-PRE-006',
      (row) =>
        row.targetType !== 'EXACT_PRODUCT' &&
        row.targetType !== 'NAMED_COMPOSITE' &&
        (/PROTECTED|LONGEST/.test(row.matchPolicy) || /PROTECTED/.test(row.aliasType)),
    );

    const technicalCandidates = activeTechnical
      .flatMap((row) => {
        const surfaces = new Set([row.normalized, row.raw, row.canonical, ...row.acceptedSurfaces]);
        return [...surfaces].flatMap((surface) =>
          allOccurrences(normalized, locale, row, surface, false),
        );
      })
      .sort(
        (a, b) =>
          b.normalized.length - a.normalized.length || b.row.priority - a.row.priority || a.start - b.start,
      );
    for (const match of technicalCandidates) {
      if (!isFree(match.span)) continue;
      const row = match.row;
      const resolved = row.automaticConceptResolutionAllowed;
      const sourceText = input.slice(match.span.start, match.span.end);
      technicalMentions.push({
        channel: 'TECHNICAL',
        aliasId: row.id,
        targetConceptId: resolved ? row.targetConceptId || null : null,
        targetKey: resolved ? row.targetKey || null : null,
        canonicalCode: row.canonical,
        gradeHint: gradeHint(sourceText),
        action: resolved ? 'RESOLVED_CONCEPT' : 'AMBIGUITY_GATE',
        autoAddAllowed: false,
        sourceText,
        normalizedText: match.normalized,
        span: match.span,
        rule: 'SR-PRE-007',
        piId: null,
      });
      consumed.push(match.span);
      addTrace(
        'SR-PRE-007',
        'TECHNICAL',
        resolved ? 'RESOLVE_CONCEPT_ONLY' : 'PRESERVE_AMBIGUITY_GATE',
        row.id,
        match.span,
      );
      if (!resolved) {
        searchGaps.push({
          sourceText,
          normalizedText: match.normalized,
          span: match.span,
          reason: 'AMBIGUOUS_TECHNICAL_CODE',
        });
      }
    }
    if (technicalMentions.length === 0 && normalized.text.trim() === 'mcc') {
      const span = normalized.originalSpan(0, normalized.text.length);
      technicalMentions.push({
        channel: 'TECHNICAL',
        aliasId: 'TC-GUARD-001',
        targetConceptId: null,
        targetKey: null,
        canonicalCode: 'MCC',
        gradeHint: null,
        action: 'AMBIGUITY_GATE',
        autoAddAllowed: false,
        sourceText: input.slice(span.start, span.end),
        normalizedText: normalized.text,
        span,
        rule: 'SR-PRE-007',
        piId: null,
      });
      searchGaps.push({
        sourceText: input.slice(span.start, span.end),
        normalizedText: normalized.text,
        span,
        reason: 'AMBIGUOUS_TECHNICAL_CODE',
      });
      consumed.push(span);
      addTrace('SR-PRE-007', 'TECHNICAL', 'PRESERVE_AMBIGUITY_GATE', 'TC-GUARD-001', span);
    }

    // An exact ingredient alias must protect its full span before a shorter
    // embedded ATTRIBUTE/QUALIFIER can consume part of the same phrase.
    searchStage('SR-PRE-009', (row) => row.targetType === 'INGREDIENT_CONCEPT', true);
    searchStage(
      'SR-PRE-008',
      (row) => row.targetType === 'RECIPE_TYPE' || row.targetType === 'ATTRIBUTE' || row.targetType === 'QUALIFIER',
    );
    searchStage(
      'SR-PRE-009',
      (row) =>
        row.targetType === 'INGREDIENT_CONCEPT' &&
        !/PROTECTED|LONGEST/.test(row.matchPolicy) &&
        !/PROTECTED/.test(row.aliasType),
      false,
      true,
    );

    // A hyphenated lexical compound is split only after full-phrase failure and
    // only when every member has an explicit frozen alias in the active locale.
    for (const match of normalized.text.matchAll(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)+/gu)) {
      const start = match.index;
      const end = start + match[0].length;
      const compoundSpan = normalized.originalSpan(start, end);
      if (!isFree(compoundSpan)) continue;
      const members = match[0].split('-');
      let conditionallySplit = false;
      for (let splitAt = members.length - 1; splitAt > 0; splitAt -= 1) {
        const ingredientSurface = members.slice(0, splitAt).join(' ');
        const roleSurface = members.slice(splitAt).join(' ');
        const ingredientRows = activeSearch.filter(
          (row) =>
            row.targetType === 'INGREDIENT_CONCEPT' &&
            normalizeMapperSearchText(row.normalized || row.raw, locale) === ingredientSurface,
        );
        const roleRows = activeRoles.filter(
          (row) => normalizeMapperSearchText(row.normalized || row.raw, locale) === roleSurface,
        );
        const ingredientTargets = new Set(
          ingredientRows.map((row) => `${row.targetId}:${row.targetKey}`),
        );
        const roleTargets = new Set(
          roleRows.map((row) => `${row.roleId || row.defaultParentRoleId}:${row.roleSubtypeId}`),
        );
        if (ingredientTargets.size !== 1 || roleTargets.size !== 1) continue;
        const row = ingredientRows.sort(
          (a, b) => b.priority - a.priority || b.releaseSequence - a.releaseSequence,
        )[0]!;
        const ingredientEnd = start + members.slice(0, splitAt).join('-').length;
        addSearch(
          {
            row,
            normalized: ingredientSurface,
            start,
            end: ingredientEnd,
            span: normalized.originalSpan(start, ingredientEnd),
            fallback: false,
          },
          'SR-PRE-012',
        );
        conditionallySplit = true;
        break;
      }
      if (conditionallySplit) continue;
      const memberRows = members.map((member) => {
        const matches = activeSearch.filter(
          (row) =>
            row.targetType === 'INGREDIENT_CONCEPT' &&
            normalizeMapperSearchText(row.normalized || row.raw, locale) === member,
        );
        const targets = new Set(matches.map((row) => `${row.targetId}:${row.targetKey}`));
        return targets.size === 1
          ? matches.sort((a, b) => b.priority - a.priority || b.releaseSequence - a.releaseSequence)[0]
          : undefined;
      });
      if (memberRows.some((row) => !row)) continue;
      let memberStart = start;
      for (let index = 0; index < members.length; index += 1) {
        const member = members[index]!;
        const row = memberRows[index]!;
        const memberEnd = memberStart + member.length;
        addSearch(
          {
            row,
            normalized: member,
            start: memberStart,
            end: memberEnd,
            span: normalized.originalSpan(memberStart, memberEnd),
            fallback: false,
          },
          'SR-PRE-012',
        );
        memberStart = memberEnd + 1;
      }
    }

    // Frozen fallback overlay: a diacritic-folded form is legal only when all
    // matching records across all three active channels share one semantic key.
    const fallbackSurfaces = new Map<
      string,
      Array<{ channel: 'SEARCH' | 'ROLE' | 'TECHNICAL'; semantic: string; row: unknown }>
    >();
    const putFallback = (
      surface: string,
      channel: 'SEARCH' | 'ROLE' | 'TECHNICAL',
      semantic: string,
      row: unknown,
    ): void => {
      const key = normalizeMapperSearchText(surface, locale);
      if (!key) return;
      const values = fallbackSurfaces.get(key) ?? [];
      values.push({ channel, semantic, row });
      fallbackSurfaces.set(key, values);
    };
    for (const row of activeSearch) {
      if (row.fallback && row.fallbackPolicy !== 'NONE')
        putFallback(row.fallback, 'SEARCH', `${row.targetType}:${row.targetId}`, row);
    }
    for (const row of activeRoles) {
      if (row.fallback && row.fallbackPolicy !== 'NONE')
        putFallback(
          row.fallback,
          'ROLE',
          `${row.roleId || row.defaultParentRoleId}:${row.roleSubtypeId}`,
          row,
        );
    }
    for (const row of activeTechnical) {
      if (row.fallbackPolicy !== 'NONE')
        putFallback(accentless(row.normalized), 'TECHNICAL', row.targetConceptId, row);
    }
    for (const [surface, values] of fallbackSurfaces) {
      for (const occurrence of allOccurrences(normalized, locale, values, surface, true)) {
        if (!isFree(occurrence.span)) continue;
        const semantics = new Set(values.map((value) => `${value.channel}:${value.semantic}`));
        if (semantics.size !== 1) {
          searchGaps.push({
            sourceText: input.slice(occurrence.span.start, occurrence.span.end),
            normalizedText: surface,
            span: occurrence.span,
            reason: 'AMBIGUOUS_FALLBACK',
          });
          consumed.push(occurrence.span);
          addTrace('SR-PRE-014', 'SEARCH', 'BLOCK_AMBIGUOUS_FALLBACK', null, occurrence.span);
          continue;
        }
        const value = values[0]!;
        if (value.channel === 'SEARCH')
          addSearch(
            { ...occurrence, row: value.row as SearchAliasRecord },
            'SR-PRE-014',
          );
      }
    }

    // An explicit full chemical/salt name is stronger evidence than its bare
    // ambiguous code. Keep the single semantic SEARCH mention and consume the
    // code without emitting a duplicate technical concept or unresolved gap.
    for (let index = technicalMentions.length - 1; index >= 0; index -= 1) {
      const mention = technicalMentions[index]!;
      if (mention.action !== 'AMBIGUITY_GATE') continue;
      const row = activeTechnical.find((candidate) => candidate.id === mention.aliasId);
      if (!row?.targetKey) continue;
      const explicit = searchMentions.find(
        (candidate) =>
          (candidate.specializationKey ?? candidate.targetKey) === row.targetKey,
      );
      if (!explicit) continue;
      technicalMentions.splice(index, 1);
      for (let gapIndex = searchGaps.length - 1; gapIndex >= 0; gapIndex -= 1) {
        const gap = searchGaps[gapIndex]!;
        if (gap.reason === 'AMBIGUOUS_TECHNICAL_CODE' && rangesOverlap(gap.span, mention.span)) {
          searchGaps.splice(gapIndex, 1);
        }
      }
      addTrace('SR-PRE-008', 'TECHNICAL', 'MERGE_CODE_INTO_EXPLICIT_PHRASE', row.id, mention.span);
    }

    searchMentions.sort((a, b) => a.span.start - b.span.start || a.span.end - b.span.end);
    const protectedSpans = searchMentions
      .filter(
        (mention) =>
          mention.targetType === 'EXACT_PRODUCT' ||
          mention.targetType === 'NAMED_COMPOSITE' ||
          mention.rule === 'SR-PRE-006',
      )
      .map((mention) => mention.span);
    const roleCandidates = activeRoles
      .flatMap((row) => allOccurrences(normalized, locale, row, row.normalized || row.raw, false))
      .filter((match) => !protectedSpans.some((span) => rangesOverlap(span, match.span)))
      .sort(
        (a, b) =>
          b.normalized.length - a.normalized.length || b.row.priority - a.row.priority || a.start - b.start,
      );

    const roleProfileRows = safeRecord(this.release.roleGrammar)['02_LOCALE_ATTACHMENT_PROFILES'];
    const roleProfile = Array.isArray(roleProfileRows)
      ? (roleProfileRows as Array<Record<string, string>>).find(
          (row) => row.locale_variant === locale,
        )
      : undefined;
    const negationTokens = String(roleProfile?.negation_tokens ?? 'no; without; bez')
      .split(';')
      .map((token) => normalizeMapperSearchText(token.trim(), locale))
      .filter(Boolean);

    const segmentBreaks = [...normalized.text.matchAll(/\bwith\b|[,;]/gu)].map((match) =>
      normalized.originalSpan(match.index, match.index + match[0].length),
    );
    const segmentFor = (position: number): number =>
      segmentBreaks.filter((span) => span.end <= position).length;
    const roleDedupe = new Set<string>();
    for (const match of roleCandidates) {
      const row = match.row;
      const roleId = row.roleId || row.defaultParentRoleId;
      const roleKey = row.roleKey || row.defaultParentRoleKey;
      if (!roleId || !roleKey) continue;
      if (
        row.roleSubtypeId &&
        roleCandidates.some(
          (candidate) =>
            candidate !== match &&
            candidate.span.start === match.span.start &&
            candidate.span.end === match.span.end &&
            (candidate.row.roleId || candidate.row.defaultParentRoleId) === roleId &&
            candidate.row.roleSubtypeId &&
            candidate.row.priority > row.priority,
        )
      )
        continue;
      const prefix = normalized.text.slice(Math.max(0, match.start - 32), match.start).trimEnd();
      const negated = negationTokens.some(
        (token) => prefix === token || prefix.endsWith(` ${token}`) || prefix.endsWith(token),
      );
      const allCandidates = searchMentions
        .map((mention, index) => ({ mention, index }))
        .filter(({ mention }) => mention.targetType === 'INGREDIENT_CONCEPT')
        .sort((a, b) => {
          const distanceA = Math.min(
            Math.abs(a.mention.span.end - match.span.start),
            Math.abs(match.span.end - a.mention.span.start),
          );
          const distanceB = Math.min(
            Math.abs(b.mention.span.end - match.span.start),
            Math.abs(match.span.end - b.mention.span.start),
          );
          return distanceA - distanceB;
        });
      const sameSegmentCandidates = allCandidates.filter(
        ({ mention }) =>
          segmentFor((mention.span.start + mention.span.end) / 2) ===
          segmentFor((match.span.start + match.span.end) / 2),
      );
      const candidates = sameSegmentCandidates.length > 0 ? sameSegmentCandidates : allCandidates;
      const sharedRole = /\bas\s*$/u.test(normalized.text.slice(0, match.start));
      const attachments = sharedRole && !negated
        ? candidates.slice().sort((a, b) => a.index - b.index).map(({ index }) => index)
        : [candidates[0]?.index ?? null];
      for (const attachedSearchMention of attachments) {
        const attachment = negated
          ? 'NEGATIVE_ROLE_CONSTRAINT'
          : attachedSearchMention === null
            ? 'SAFE_DEFAULT_PARENT_WITH_UNRESOLVED_INGREDIENT'
            : sharedRole
              ? 'EXPLICIT_SHARED_ROLE_HEAD'
              : 'NEAREST_VALID_INGREDIENT_SAME_SEGMENT';
        const duplicateKey =
          `${match.span.start}:${match.span.end}:${roleId}:${row.roleSubtypeId}:${attachedSearchMention}`;
        if (roleDedupe.has(duplicateKey)) continue;
        roleDedupe.add(duplicateKey);
        const mention: RoleMention = {
          channel: 'ROLE',
          aliasId: row.id,
          roleId,
          roleKey,
          roleSubtypeId: row.roleSubtypeId || null,
          roleSubtypeKey: row.roleSubtypeKey || null,
          negated,
          attachedSearchMention,
          attachment,
          sourceText: input.slice(match.span.start, match.span.end),
          normalizedText: match.normalized,
          span: match.span,
          rule: negated ? 'SR-PRE-016' : 'SR-PRE-015',
          piId: null,
        };
        roleMentions.push(mention);
        addTrace(mention.rule, 'ROLE', attachment, row.id, match.span);
      }
      consumed.push(match.span);
    }

    // When a subtype cue is immediately adjacent to an explicit role head,
    // the explicit head overrides the subtype's safe default parent. Distant
    // compatible axes (for example SAUCE + DRIZZLE/TOPPING) remain separate.
    for (const subtypeMention of roleMentions.filter((mention) => mention.roleSubtypeId)) {
      const sourceRow = activeRoles.find((row) => row.id === subtypeMention.aliasId);
      if (!sourceRow) continue;
      const parentMention = roleMentions.find((candidate) => {
        if (candidate === subtypeMention || candidate.roleSubtypeId) return false;
        if (candidate.attachedSearchMention !== subtypeMention.attachedSearchMention) return false;
        if (!sourceRow.allowedParentRoleIds.includes(candidate.roleId)) return false;
        const betweenStart = Math.min(candidate.span.end, subtypeMention.span.end);
        const betweenEnd = Math.max(candidate.span.start, subtypeMention.span.start);
        return betweenStart <= betweenEnd && input.slice(betweenStart, betweenEnd).trim() === '';
      });
      if (!parentMention) continue;
      subtypeMention.roleId = parentMention.roleId;
      subtypeMention.roleKey = parentMention.roleKey;
      subtypeMention.attachment = parentMention.attachment;
      roleMentions.splice(roleMentions.indexOf(parentMention), 1);
    }

    const ignored = new Set([
      'and',
      'or',
      'with',
      'of',
      'from',
      'made',
      'i',
      'oraz',
      'z',
      'ze',
      'bez',
      'no',
      'without',
      'und',
      'mit',
      'de',
      'del',
      'con',
      'et',
      'avec',
      'e',
      'com',
      'y',
    ]);
    for (const match of normalized.text.matchAll(/[\p{L}\p{N}]+(?:[.'’()-][\p{L}\p{N}]+)*/gu)) {
      const span = normalized.originalSpan(match.index, match.index + match[0].length);
      if (!isFree(span) || ignored.has(match[0])) continue;
      if (searchGaps.some((gap) => rangesOverlap(gap.span, span))) continue;
      searchGaps.push({
        sourceText: input.slice(span.start, span.end),
        normalizedText: match[0],
        span,
        reason: 'UNMATCHED',
      });
      consumed.push(span);
      addTrace('SR-PRE-019', 'SEARCH', 'PRESERVE_SEARCH_GAP', null, span);
    }

    technicalMentions.sort((a, b) => a.span.start - b.span.start);
    roleMentions.sort((a, b) => a.span.start - b.span.start);
    searchGaps.sort((a, b) => a.span.start - b.span.start);
    const result: MapperSearchResolution = {
      releaseId: this.release.releaseId,
      input,
      localeVariant: locale,
      marketScope: market,
      recipeType,
      attributes,
      searchMentions,
      technicalMentions,
      roleMentions,
      searchGaps,
      trace,
      downstream: {
        conceptKeys: searchMentions
          .filter((mention) => mention.targetType === 'INGREDIENT_CONCEPT')
          .map((mention) => mention.specializationKey ?? mention.targetKey),
        exactProductKeys: searchMentions
          .filter((mention) => mention.targetType === 'EXACT_PRODUCT')
          .map((mention) => mention.targetKey),
        piIds: [],
      },
    };
    if (searchGaps.length > 0) {
      options.telemetry?.record({
        releaseId: result.releaseId,
        localeVariant: locale,
        marketScope: market,
        gaps: searchGaps,
      });
    }
    return result;
  }
}

export function createMapperSearchRuntime(release: MapperReleaseData): MapperSearchRuntime {
  return new MapperSearchRuntime(release);
}
