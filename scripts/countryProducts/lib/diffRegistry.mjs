// Deterministic delta between two GELATO base country-product registries, so
// the next owner workbook is imported as a delta instead of a redesign.
//
// Matching keys: products by productKey, selections by selectionKey
// (<NS>:<ISO2>:<SLOT>), open gaps by workbook case id. Registries of different
// workbook versions use different proposal namespaces (V12 → V23); then
// products and selections are matched on the namespace-free part of the key —
// "V12:AT:MILK" ↔ "V23:AT:MILK", "V12:MILK:GTIN-0…" ↔ "V23:MILK:GTIN-0…" —
// and entries name that part. Product switches (from/to) and the added /
// removed product lists keep the full keys of their own registry. With one
// namespace on both sides nothing is stripped.

export const DIFF_SCHEMA = 'gellatti.country-products.gelato-base.registry-diff/v1';

const CLOSED = 'SELECTION_CLOSED';

const compare = (left, right) => {
  const a = String(left ?? '');
  const b = String(right ?? '');
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
};

const same = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

const byKey = (list, keyOf) => new Map((list ?? []).map((item) => [keyOf(item), item]));

const TEXT_ID = /^TXT-[0-9A-F]{10}$/;

/** Replaces TXT- ids with the registry's text so deltas read as evidence, not hashes. */
function resolveTexts(value, registry) {
  if (typeof value === 'string') return TEXT_ID.test(value) ? (registry.texts?.[value] ?? value) : value;
  if (Array.isArray(value)) return value.map((item) => resolveTexts(item, registry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveTexts(item, registry)]));
  }
  return value;
}

function sortEntries(entries) {
  return entries.sort(
    (a, b) =>
      compare(a.productKey ?? a.selectionKey ?? a.gapId, b.productKey ?? b.selectionKey ?? b.gapId) ||
      compare(a.selectionKey, b.selectionKey) ||
      compare(a.kind, b.kind) ||
      compare(a.field, b.field) ||
      compare(a.country, b.country),
  );
}

function packageSignature(product) {
  const pkg = product?.package ?? {};
  return [pkg.normalizedQuantity ?? null, pkg.normalizedUnit ?? null, pkg.multipackCount ?? null];
}

function sameListing(oldProduct, newProduct) {
  if (!oldProduct || !newProduct) return false;
  const oldKeys = new Set(oldProduct.workbook?.proposalKeys ?? []);
  const sharesWorkbookKey = (newProduct.workbook?.proposalKeys ?? []).some((key) => oldKeys.has(key));
  return (
    sharesWorkbookKey &&
    same(packageSignature(oldProduct), packageSignature(newProduct)) &&
    String(oldProduct.brand ?? '').toLowerCase() === String(newProduct.brand ?? '').toLowerCase()
  );
}

/** Key normaliser: strips "<namespace>:" only when the two registries use different namespaces. */
function namespaceFree(namespace, crossNamespace) {
  return (key) =>
    crossNamespace && namespace && typeof key === 'string' && key.startsWith(`${namespace}:`)
      ? key.slice(namespace.length + 1)
      : key;
}

const KEY_MATCHING_RULE =
  'Products and selections are matched on the key without its proposal namespace (V12:AT:MILK ↔ V23:AT:MILK; V12:MILK:GTIN-… ↔ V23:MILK:GTIN-…); open gaps by workbook case id. Entries name the namespace-free key; product switches and added/removed products show the full keys of their own registry.';

/**
 * @param {object} oldRegistry
 * @param {object} newRegistry
 */
export function diffRegistries(oldRegistry, newRegistry) {
  const fromNamespace = oldRegistry.proposalNamespace ?? null;
  const toNamespace = newRegistry.proposalNamespace ?? null;
  const crossNamespace = fromNamespace !== toNamespace;
  const oldKey = namespaceFree(fromNamespace, crossNamespace);
  const newKey = namespaceFree(toNamespace, crossNamespace);
  const oldProducts = byKey(oldRegistry.products, (product) => oldKey(product.productKey));
  const newProducts = byKey(newRegistry.products, (product) => newKey(product.productKey));
  const oldSelections = byKey(oldRegistry.selections, (selection) => oldKey(selection.selectionKey));
  const newSelections = byKey(newRegistry.selections, (selection) => newKey(selection.selectionKey));
  const oldGaps = byKey(oldRegistry.openGaps, (gap) => gap.id);
  const newGaps = byKey(newRegistry.openGaps, (gap) => gap.id);

  const newlyCompletedProducts = [];
  const newlyCompletedEvidence = [];
  const changedVerification = [];
  const changedAvailability = [];
  const changedExactIdentity = [];

  // Selections: completion, verification, availability and identity switches.
  for (const [selectionKey, next] of newSelections) {
    const previous = oldSelections.get(selectionKey);
    const nextProductKey = newKey(next.productKey);
    if (!previous) {
      if (next.selectionState === CLOSED) {
        newlyCompletedProducts.push({
          selectionKey,
          productKey: nextProductKey,
          kind: 'NEW_SELECTION_CLOSED',
          from: null,
          to: next.selectionState,
        });
      }
      continue;
    }
    const previousProductKey = oldKey(previous.productKey);
    if (previousProductKey !== nextProductKey) {
      const oldProduct = oldProducts.get(previousProductKey) ?? null;
      const newProduct = newProducts.get(nextProductKey) ?? null;
      if (
        sameListing(oldProduct, newProduct) &&
        !oldProduct?.identity?.gtin &&
        newProduct?.identity?.gtin
      ) {
        newlyCompletedEvidence.push({
          selectionKey,
          productKey: nextProductKey,
          kind: 'IDENTIFIER_COMPLETED',
          field: 'identity.gtin',
          from: previous.productKey,
          to: next.productKey,
        });
      } else {
        changedExactIdentity.push({
          selectionKey,
          kind: 'SELECTED_PRODUCT_CHANGED',
          from: previous.productKey,
          to: next.productKey,
        });
      }
    }
    if (previous.selectionState !== next.selectionState) {
      const entry = {
        selectionKey,
        productKey: nextProductKey,
        kind: 'SELECTION_STATE_CHANGED',
        from: previous.selectionState,
        to: next.selectionState,
        closedGapId: previous.openGapId ?? null,
      };
      if (next.selectionState === CLOSED) newlyCompletedProducts.push({ ...entry, kind: 'SELECTION_CLOSED' });
      else changedVerification.push(entry);
    }
    const previousEvidence = resolveTexts(previous.availabilityEvidence ?? null, oldRegistry);
    const nextEvidence = resolveTexts(next.availabilityEvidence ?? null, newRegistry);
    if (!same(previousEvidence, nextEvidence)) {
      changedAvailability.push({
        selectionKey,
        productKey: nextProductKey,
        kind: 'AVAILABILITY_EVIDENCE_CHANGED',
        from: previousEvidence,
        to: nextEvidence,
      });
    }
    if ((previous.offerChannel ?? null) !== (next.offerChannel ?? null)) {
      changedAvailability.push({
        selectionKey,
        productKey: nextProductKey,
        kind: 'OFFER_CHANNEL_CHANGED',
        from: previous.offerChannel ?? null,
        to: next.offerChannel ?? null,
      });
    }
    if ((previous.route?.decision ?? null) !== (next.route?.decision ?? null)) {
      changedAvailability.push({
        selectionKey,
        productKey: nextProductKey,
        kind: 'ROUTE_DECISION_CHANGED',
        from: previous.route?.decision ?? null,
        to: next.route?.decision ?? null,
      });
    }
  }
  for (const [selectionKey, previous] of oldSelections) {
    if (!newSelections.has(selectionKey)) {
      changedExactIdentity.push({
        selectionKey,
        kind: 'SELECTION_REMOVED',
        from: previous.productKey,
        to: null,
      });
    }
  }

  // Products: identity attributes, evidence and markets.
  for (const [productKey, next] of newProducts) {
    const previous = oldProducts.get(productKey);
    if (!previous) continue;
    for (const [field, valueOf] of [
      ['exactName', (product) => product.exactName],
      ['brand', (product) => product.brand],
      ['package', packageSignature],
      ['identity.gtin', (product) => product.identity?.gtin ?? null],
      ['identity.articleCode', (product) => product.identity?.articleCode ?? null],
      ['identity.basis', (product) => product.identity?.basis ?? null],
    ]) {
      if (!same(valueOf(previous), valueOf(next))) {
        changedExactIdentity.push({
          productKey,
          kind: 'IDENTITY_FIELD_CHANGED',
          field,
          from: valueOf(previous),
          to: valueOf(next),
        });
      }
    }
    const oldEstimated = new Set(previous.nutrition?.estimatedFields ?? []);
    const newEstimated = new Set(next.nutrition?.estimatedFields ?? []);
    for (const field of [...oldEstimated].sort(compare)) {
      if (!newEstimated.has(field) && next.nutrition?.declared?.[field] !== null && next.nutrition?.declared?.[field] !== undefined) {
        newlyCompletedEvidence.push({
          productKey,
          kind: 'ESTIMATE_REPLACED_BY_DECLARED',
          field: `nutrition.${field}`,
          from: previous.nutrition?.workingProfile?.[field] ?? null,
          to: next.nutrition.declared[field],
        });
      }
    }
    for (const field of Object.keys(next.nutrition?.declared ?? {}).sort(compare)) {
      const before = previous.nutrition?.declared?.[field] ?? null;
      const after = next.nutrition.declared[field];
      if (before !== null && after !== null && before !== after) {
        changedVerification.push({
          productKey,
          kind: 'DECLARED_VALUE_CHANGED',
          field: `nutrition.${field}`,
          from: before,
          to: after,
        });
      }
      if (before === null && after !== null && !oldEstimated.has(field)) {
        newlyCompletedEvidence.push({
          productKey,
          kind: 'DECLARED_VALUE_ADDED',
          field: `nutrition.${field}`,
          from: null,
          to: after,
        });
      }
    }
    const urlOf = (registry, id) => registry.sources?.[id]?.url ?? id;
    const oldUrls = new Set((previous.sourceIds ?? []).map((id) => urlOf(oldRegistry, id)));
    const addedUrls = (next.sourceIds ?? [])
      .map((id) => urlOf(newRegistry, id))
      .filter((url) => !oldUrls.has(url))
      .sort(compare);
    if (addedUrls.length > 0) {
      newlyCompletedEvidence.push({ productKey, kind: 'SOURCES_ADDED', field: 'sourceIds', from: null, to: addedUrls });
    }
    const oldExpectation = previous.readiness?.engineProfileExpectation ?? null;
    const newExpectation = next.readiness?.engineProfileExpectation ?? null;
    if (oldExpectation !== newExpectation) {
      const entry = { productKey, kind: 'ENGINE_PROFILE_EXPECTATION_CHANGED', field: 'readiness', from: oldExpectation, to: newExpectation };
      if (newExpectation === 'DECLARED_PROFILE_COMPLETE') newlyCompletedEvidence.push(entry);
      else changedVerification.push(entry);
    }
    if ((previous.catalog?.decision ?? null) !== (next.catalog?.decision ?? null)) {
      changedVerification.push({
        productKey,
        kind: 'CATALOG_DECISION_CHANGED',
        field: 'catalog.decision',
        from: previous.catalog?.decision ?? null,
        to: next.catalog?.decision ?? null,
      });
    }
    const oldMarkets = new Set(previous.markets ?? []);
    const newMarkets = new Set(next.markets ?? []);
    for (const country of [...newMarkets].sort(compare)) {
      if (!oldMarkets.has(country)) changedAvailability.push({ productKey, kind: 'MARKET_ADDED', country, from: null, to: country });
    }
    for (const country of [...oldMarkets].sort(compare)) {
      if (!newMarkets.has(country)) changedAvailability.push({ productKey, kind: 'MARKET_REMOVED', country, from: country, to: null });
    }
  }

  // Open-gap ledger.
  const openGapsClosed = [];
  const openGapsOpened = [];
  for (const [gapId, previous] of oldGaps) {
    const next = newGaps.get(gapId);
    if (!next) {
      openGapsClosed.push({ gapId, kind: 'GAP_CLOSED', selectionKey: oldKey(previous.selectionKey), from: previous.state, to: null });
      continue;
    }
    for (const field of ['state', 'conditions', 'missing', 'product']) {
      if (!same(previous[field], next[field])) {
        changedVerification.push({ gapId, selectionKey: newKey(next.selectionKey), kind: 'GAP_FIELD_CHANGED', field, from: previous[field] ?? null, to: next[field] ?? null });
      }
    }
  }
  for (const [gapId, next] of newGaps) {
    if (!oldGaps.has(gapId)) {
      openGapsOpened.push({ gapId, kind: 'GAP_OPENED', selectionKey: newKey(next.selectionKey), from: null, to: next.state });
    }
  }

  const addedProducts = [...newProducts.entries()]
    .filter(([key]) => !oldProducts.has(key))
    .map(([, product]) => product.productKey)
    .sort(compare);
  const removedProducts = [...oldProducts.entries()]
    .filter(([key]) => !newProducts.has(key))
    .map(([, product]) => product.productKey)
    .sort(compare);

  const sections = {
    newlyCompletedProducts: sortEntries(newlyCompletedProducts),
    newlyCompletedEvidence: sortEntries(newlyCompletedEvidence),
    changedVerification: sortEntries(changedVerification),
    changedAvailability: sortEntries(changedAvailability),
    changedExactIdentity: sortEntries(changedExactIdentity),
  };
  const entriesByKind = {};
  for (const entry of [...Object.values(sections).flat(), ...openGapsClosed, ...openGapsOpened]) {
    entriesByKind[entry.kind] = (entriesByKind[entry.kind] ?? 0) + 1;
  }
  return {
    schema: DIFF_SCHEMA,
    from: {
      registryId: oldRegistry.registryId ?? null,
      workbook: oldRegistry.source?.workbook ?? null,
      sha256: oldRegistry.source?.sha256 ?? null,
    },
    to: {
      registryId: newRegistry.registryId ?? null,
      workbook: newRegistry.source?.workbook ?? null,
      sha256: newRegistry.source?.sha256 ?? null,
    },
    keyMatching: {
      fromNamespace,
      toNamespace,
      namespaceFree: crossNamespace,
      rule: crossNamespace ? KEY_MATCHING_RULE : 'Same proposal namespace on both sides: products and selections are matched on their full keys; open gaps by workbook case id.',
    },
    ...sections,
    addedProducts,
    removedProducts,
    openGapsClosed: sortEntries(openGapsClosed),
    openGapsOpened: sortEntries(openGapsOpened),
    counts: {
      newlyCompletedProducts: sections.newlyCompletedProducts.length,
      newlyCompletedEvidence: sections.newlyCompletedEvidence.length,
      changedVerification: sections.changedVerification.length,
      changedAvailability: sections.changedAvailability.length,
      changedExactIdentity: sections.changedExactIdentity.length,
      addedProducts: addedProducts.length,
      removedProducts: removedProducts.length,
      openGapsClosed: openGapsClosed.length,
      openGapsOpened: openGapsOpened.length,
    },
    entriesByKind: Object.fromEntries(Object.entries(entriesByKind).sort((a, b) => compare(a[0], b[0]))),
  };
}

const cell = (value) => {
  if (value === null || value === undefined) return '—';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
};

/**
 * Markdown rendering of diffRegistries(); deterministic for identical input.
 * `options.regenerate` names the command that regenerates a committed report.
 */
export function renderDiffMarkdown(diff, options = {}) {
  const lines = [
    '# GELATO base country-product registry — delta',
    '',
    `From: ${cell(diff.from.workbook)} (${cell(diff.from.sha256)})`,
    `To: ${cell(diff.to.workbook)} (${cell(diff.to.sha256)})`,
  ];
  if (options.regenerate) lines.push('', `Regenerate: \`${options.regenerate}\` (\`--check\` fails on drift).`);
  if (diff.keyMatching?.namespaceFree) {
    lines.push('', `Key matching (${cell(diff.keyMatching.fromNamespace)} → ${cell(diff.keyMatching.toNamespace)}): ${diff.keyMatching.rule}`);
  }
  lines.push(
    '',
    '| Section | Entries |',
    '| --- | ---: |',
    ...Object.entries(diff.counts).map(([key, value]) => `| ${key} | ${value} |`),
  );
  if (diff.entriesByKind && Object.keys(diff.entriesByKind).length > 0) {
    lines.push('', '| Entry kind | Entries |', '| --- | ---: |', ...Object.entries(diff.entriesByKind).map(([key, value]) => `| ${key} | ${value} |`));
  }
  const section = (title, entries) => {
    lines.push('', `## ${title}`, '');
    if (entries.length === 0) {
      lines.push('None.');
      return;
    }
    lines.push('| Key | Kind | Field / country | From | To |', '| --- | --- | --- | --- | --- |');
    for (const entry of entries) {
      lines.push(
        `| ${cell(entry.productKey ?? entry.selectionKey ?? entry.gapId)} | ${cell(entry.kind)} | ${cell(entry.field ?? entry.country ?? entry.selectionKey)} | ${cell(entry.from)} | ${cell(entry.to)} |`,
      );
    }
  };
  section('Newly completed products', diff.newlyCompletedProducts);
  section('Newly completed evidence', diff.newlyCompletedEvidence);
  section('Changed verification', diff.changedVerification);
  section('Changed availability', diff.changedAvailability);
  section('Changed exact identity', diff.changedExactIdentity);
  section('Open gaps closed', diff.openGapsClosed);
  section('Open gaps opened', diff.openGapsOpened);
  lines.push('', '## Products added', '', diff.addedProducts.length ? diff.addedProducts.map((key) => `- ${key}`).join('\n') : 'None.');
  lines.push('', '## Products removed', '', diff.removedProducts.length ? diff.removedProducts.map((key) => `- ${key}`).join('\n') : 'None.');
  return `${lines.join('\n')}\n`;
}
