export const PRODUCT_SCAN_FINALIZE_CONTRACT_V2 = 'PRODUCT_SCAN_FINALIZE_V2' as const;

type JsonObject = Record<string, unknown>;

const objectValue = (value: unknown): JsonObject =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};

function mergeProductFields(base: JsonObject, overlay: JsonObject): JsonObject {
  const merged: JsonObject = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const current = merged[key];
    merged[key] =
      current &&
      value &&
      typeof current === 'object' &&
      typeof value === 'object' &&
      !Array.isArray(current) &&
      !Array.isArray(value)
        ? mergeProductFields(objectValue(current), objectValue(value))
        : value;
  }
  return merged;
}

/**
 * V2 is deliberately explicit. `automaticEvidence` is the provenance-aware channel used by V2,
 * while `confirmations.productFields` is a temporary wire-compatibility projection for the
 * already-deployed V1 finalizer. A V2 backend ignores that projection and reads only
 * `customerActionFields` when the customer-action marker is present.
 */
export function withProductScanFinalizeV2Contract(
  input: JsonObject,
): JsonObject & { contractVersion: typeof PRODUCT_SCAN_FINALIZE_CONTRACT_V2 } {
  const automatic = objectValue(input.automaticEvidence);
  const confirmations = objectValue(input.confirmations);
  const automaticFields = objectValue(automatic.productFields);
  const customerFields = objectValue(confirmations.productFields);
  const compatibilityFields = mergeProductFields(automaticFields, customerFields);
  const customerAction = confirmations.evidenceOrigin === 'customer_action';

  return {
    ...input,
    contractVersion: PRODUCT_SCAN_FINALIZE_CONTRACT_V2,
    confirmations: {
      ...confirmations,
      ...(Object.keys(compatibilityFields).length > 0
        ? { productFields: compatibilityFields }
        : {}),
      ...(customerAction ? { customerActionFields: customerFields } : {}),
    },
  };
}

export type ProductScanFinalizeContractResolution =
  | {
      mode: 'legacy';
      automaticEvidence: null;
      customerAction: true;
      customerProductFields: JsonObject;
    }
  | {
      mode: 'v2';
      automaticEvidence: unknown;
      customerAction: boolean;
      customerProductFields: JsonObject;
    }
  | { mode: 'unsupported'; suppliedVersion: unknown };

/**
 * Resolve only the explicit version field. The presence of V2-only evidence fields never upgrades
 * a legacy request, and a missing version always retains the deployed V1 semantics.
 */
export function resolveProductScanFinalizeContract(
  input: unknown,
): ProductScanFinalizeContractResolution {
  const body = objectValue(input);
  const confirmations = objectValue(body.confirmations);
  if (body.contractVersion === undefined) {
    return {
      mode: 'legacy',
      automaticEvidence: null,
      customerAction: true,
      customerProductFields: objectValue(confirmations.productFields),
    };
  }
  if (body.contractVersion !== PRODUCT_SCAN_FINALIZE_CONTRACT_V2) {
    return { mode: 'unsupported', suppliedVersion: body.contractVersion };
  }
  const customerAction = confirmations.evidenceOrigin === 'customer_action';
  return {
    mode: 'v2',
    automaticEvidence: body.automaticEvidence,
    customerAction,
    customerProductFields: customerAction ? objectValue(confirmations.customerActionFields) : {},
  };
}
