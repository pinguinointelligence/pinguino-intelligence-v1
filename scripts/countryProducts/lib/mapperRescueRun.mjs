export const routeMarketsFor = (routes) => [
  ...new Set(
    (routes ?? [])
      .map((route) => String(route?.country ?? '').trim().toUpperCase())
      .filter(Boolean),
  ),
];

export const resumableDuplicateProductId = (request, exactProducts) => {
  if (request?.status !== 'DUPLICATE' || typeof request?.duplicate_product_id !== 'string') {
    return null;
  }
  return (exactProducts ?? []).some((row) => row?.id === request.duplicate_product_id)
    ? request.duplicate_product_id
    : null;
};

export const shouldSelectRescueRequest = (request, { applyReady, only }) => {
  if (!request || request.status === 'APPROVED') return false;
  if (request.status !== 'DUPLICATE') return true;
  return applyReady === true && String(only ?? '').trim() !== '';
};

export const rescueInputCounts = (ledger) => ({
  selected: (ledger ?? []).length,
  approvalNotReady: (ledger ?? []).filter(
    (entry) => entry?.requestStatusBefore === 'ADMIN_REVIEW' && entry?.priorIngestStatus === null,
  ).length,
  priorBlocked: (ledger ?? []).filter((entry) => entry?.priorIngestStatus === 'blocked').length,
  alreadyResolved: (ledger ?? []).filter((entry) => entry?.requestStatusBefore === 'DUPLICATE').length,
});

const FAIL_CLOSED_ASSESSMENTS = new Map([
  [
    'V23:SMP:GTIN-06426309006538',
    '2dd7b665a341b7a0693819a06d88ed69532168dae5c13c2139eee56c981fab98',
  ],
]);

export const manualEvidenceBlockFor = (productKey, assessmentHash) =>
  FAIL_CLOSED_ASSESSMENTS.get(productKey) === assessmentHash
    ? 'SOURCE_DOES_NOT_STATE_WATER_1_1'
    : null;
