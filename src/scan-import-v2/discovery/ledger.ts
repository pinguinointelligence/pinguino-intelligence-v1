/**
 * Pure reconciliation of evidence into a provenance ledger. This is NOT a technical authority: it
 * records who said what (source, authority, time), keeps conflicts visible, and derives the lifecycle
 * stage from facts that exist — it never fills a gap with a value.
 */
import type { CodeIdentity } from '../contracts';
import type {
  DiscoveryStage,
  Fact,
  FactConflict,
  FactLedger,
  FactSource,
  ScanResultLike,
} from './contracts';

const SOURCE_MAP: Record<string, FactSource> = {
  label: 'label',
  manufacturer: 'manufacturer',
  barcode_registry: 'barcode_registry',
  retailer: 'retailer',
  web_search: 'web_search',
  user_confirmed: 'user_confirmed',
};

function asSource(s: string | null | undefined): FactSource | null {
  return s ? (SOURCE_MAP[s] ?? null) : null;
}

function scalar(v: unknown): string | number | null {
  return typeof v === 'string' || typeof v === 'number' ? v : null;
}

function authorityOf(src: FactSource): string {
  if (src === 'barcode') return 'scan-core';
  if (src === 'label' || src === 'user_confirmed') return 'product-scan-analyze';
  if (src === 'catalog') return 'resolve_exact_products_by_gtin_v1';
  return 'intimport-enrich';
}

export function buildLedger(
  identity: CodeIdentity,
  result: ScanResultLike | null,
  missingCritical: readonly string[],
  context: { sessionId?: string | null; recordedAt?: number | null } = {},
): FactLedger {
  const recordedAt = context.recordedAt ?? null;
  const facts: Fact[] = [
    {
      field: 'barcode',
      value: identity.value,
      source: 'barcode',
      confidence: 'high',
      sourceUrl: null,
      authority: 'scan-core',
      recordedAt,
      contributingSources: ['barcode'],
    },
    {
      field: 'symbology',
      value: identity.symbology,
      source: 'barcode',
      confidence: 'high',
      sourceUrl: null,
      authority: 'scan-core',
      recordedAt,
      contributingSources: ['barcode'],
    },
  ];
  const conflicts: FactConflict[] = [];
  const sources = new Set<FactSource>(['barcode']);
  if (result) {
    const bySource = new Map<string, FactSource>();
    for (const e of result.evidence ?? []) {
      const src = asSource(e.source);
      if (src) bySource.set(e.field, src);
    }
    const external = new Map<string, { url: string | null; source: FactSource }>();
    const contributors = new Map<string, Set<FactSource>>();
    for (const s of result.externalSources ?? []) {
      const src = asSource(s.sourceType) ?? 'web_search';
      sources.add(src); // consulted, even where the label later outranks it (visible in conflicts)
      for (const f of s.fieldsUsed ?? []) {
        if (!external.has(f)) external.set(f, { url: s.url, source: src });
        contributors.set(f, (contributors.get(f) ?? new Set<FactSource>()).add(src));
      }
    }
    for (const e of result.evidence ?? []) {
      const src = asSource(e.source);
      if (src)
        contributors.set(e.field, (contributors.get(e.field) ?? new Set<FactSource>()).add(src));
    }
    const push = (field: string, value: unknown) => {
      const v = scalar(value);
      if (v === null || v === '') return;
      const ext = external.get(field);
      const src = bySource.get(field) ?? ext?.source ?? null;
      if (!src) return; // a value without provenance is not a fact (we do not guess where it came from)
      const contributing = [...(contributors.get(field) ?? new Set<FactSource>([src]))];
      facts.push({
        field,
        value: v,
        source: src,
        confidence:
          src === 'label' || src === 'user_confirmed'
            ? 'high'
            : src === 'manufacturer'
              ? 'medium'
              : 'low',
        sourceUrl: ext?.url ?? null,
        authority: authorityOf(src),
        recordedAt,
        contributingSources: contributing.length > 0 ? contributing : [src],
      });
      sources.add(src);
    };
    push('identity.displayName', result.identity?.displayName);
    push('identity.brand', result.identity?.brand);
    push('identity.countryOfOrigin', result.identity?.countryOfOrigin);
    push('ingredientsText', result.ingredientsText);
    push('allergensText', result.allergensText);
    for (const [k, v] of Object.entries(result.nutrition ?? {})) push(`nutrition.${k}`, v);
    for (const [k, v] of Object.entries(result.package ?? {})) push(`package.${k}`, v);
    for (const c of result.conflicts ?? []) {
      conflicts.push({
        field: c.field,
        values: [
          { value: c.labelValue, source: 'label' },
          { value: c.externalValue, source: external.get(c.field)?.source ?? 'web_search' },
        ],
        retained: asSource(c.retainedSource),
      });
    }
  }
  return {
    gtin: identity.canonicalGtin13,
    symbology: identity.symbology,
    sessionId: context.sessionId ?? null,
    recordedAt,
    facts,
    conflicts,
    identity: {
      name: scalar(result?.identity?.displayName ?? result?.identity?.originalName) as
        | string
        | null,
      brand: scalar(result?.identity?.brand) as string | null,
    },
    missingCritical: [...missingCritical],
    sourcesUsed: [...sources],
  };
}

/** Stage from facts that exist. Technical stages are only reachable through the authorities (see discovery.ts). */
export function stageFromLedger(ledger: FactLedger): DiscoveryStage {
  const hasIdentity = Boolean(ledger.identity.name);
  const hasEvidence = ledger.facts.some((f) => f.source !== 'barcode');
  if (!hasIdentity && !hasEvidence) return 'code_known';
  if (hasIdentity && !ledger.facts.some((f) => f.source === 'label'))
    return 'commercial_identity_hypothesis';
  return 'evidence_collected';
}
