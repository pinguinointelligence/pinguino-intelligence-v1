// Deterministic delta between two GELATO base country-product registries, so
// the next owner workbook is imported as a delta instead of a redesign.
//
// Matching keys: products by productKey, selections by selectionKey
// (V12:<ISO2>:<SLOT>), open gaps by workbook case id.

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

/**
 * @param {object} oldRegistry
 * @param {object} newRegistry
 */
export function diffRegistries(oldRegistry, newRegistry) {
  const oldProducts = byKey(oldRegistry.products, (product) => product.productKey);
  const newProducts = byKey(newRegistry.products, (product) => product.productKey);
  const oldSelections = byKey(oldRegistry.selections, (selection) => selection.selectionKey);
  const newSelections = byKey(newRegistry.selections, (selection) => selection.selectionKey);
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
    if (!previous) {
      if (next.selectionState === CLOSED) {
        newlyCompletedProducts.push({
          selectionKey,
          productKey: next.productKey,
          kind: 'NEW_SELECTION_CLOSED',
          from: null,
          to: next.selectionState,
        });
      }
      continue;
    }
    if (previous.productKey !== next.productKey) {
      const oldProduct = oldProducts.get(previous.productKey) ?? null;
      const newProduct = newProducts.get(next.productKey) ?? null;
      if (
        sameListing(oldProduct, newProduct) &&
        !oldProduct?.identity?.gtin &&
        newProduct?.identity?.gtin
      ) {
        newlyCompletedEvidence.push({
          selectionKey,
          productKey: next.productKey,
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
        productKey: next.productKey,
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
        productKey: next.productKey,
        kind: 'AVAILABILITY_EVIDENCE_CHANGED',
        from: previousEvidence,
        to: nextEvidence,
      });
    }
    if ((previous.offerChannel ?? null) !== (next.offerChannel ?? null)) {
      changedAvailability.push({
        selectionKey,
        productKey: next.productKey,
        kind: 'OFFER_CHANNEL_CHANGED',
        from: previous.offerChannel ?? null,
        to: next.offerChannel ?? null,
      });
    }
    if ((previous.route?.decision ?? null) !== (next.route?.decision ?? null)) {
      changedAvailability.push({
        selectionKey,
        productKey: next.productKey,
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
      openGapsClosed.push({ gapId, kind: 'GAP_CLOSED', selectionKey: previous.selectionKey, from: previous.state, to: null });
      continue;
    }
    for (const field of ['state', 'conditions', 'missing', 'product']) {
      if (!same(previous[field], next[field])) {
        changedVerification.push({ gapId, selectionKey: next.selectionKey, kind: 'GAP_FIELD_CHANGED', field, from: previous[field] ?? null, to: next[field] ?? null });
      }
    }
  }
  for (const [gapId, next] of newGaps) {
    if (!oldGaps.has(gapId)) {
      openGapsOpened.push({ gapId, kind: 'GAP_OPENED', selectionKey: next.selectionKey, from: null, to: next.state });
    }
  }

  const addedProducts = [...newProducts.keys()].filter((key) => !oldProducts.has(key)).sort(compare);
  const removedProducts = [...oldProducts.keys()].filter((key) => !newProducts.has(key)).sort(compare);

  const sections = {
    newlyCompletedProducts: sortEntries(newlyCompletedProducts),
    newlyCompletedEvidence: sortEntries(newlyCompletedEvidence),
    changedVerification: sortEntries(changedVerification),
    changedAvailability: sortEntries(changedAvailability),
    changedExactIdentity: sortEntries(changedExactIdentity),
  };
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
  };
}

const cell = (value) => {
  if (value === null || value === undefined) return '—';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
};

/** Markdown rendering of diffRegistries(); deterministic for identical input. */
export function renderDiffMarkdown(diff) {
  const lines = [
    '# GELATO base country-product registry — delta',
    '',
    `From: ${cell(diff.from.workbook)} (${cell(diff.from.sha256)})`,
    `To: ${cell(diff.to.workbook)} (${cell(diff.to.sha256)})`,
    '',
    '| Section | Entries |',
    '| --- | ---: |',
    ...Object.entries(diff.counts).map(([key, value]) => `| ${key} | ${value} |`),
  ];
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
