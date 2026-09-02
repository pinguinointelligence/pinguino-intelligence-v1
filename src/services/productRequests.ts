import { supabase } from '@/lib/supabase/client';

const unavailable = (): never => {
  throw new Error('Product request backend is unavailable in this build.');
};

export type ProductRequestStatus =
  | 'SUBMITTED'
  | 'ADMIN_REVIEW'
  | 'NEEDS_INFO'
  | 'RESUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'DUPLICATE'
  | 'USER_CANCELED';

export interface ProductRequestMissingField {
  id: string;
  fieldType: string;
  status: 'REQUESTED' | 'SUPPLIED' | 'ACCEPTED' | 'WAIVED';
  instruction: string | null;
  requestedAt: string;
  suppliedAt: string | null;
  resolvedAt: string | null;
}

export interface MyProductRequest {
  id: string;
  requestNumber: number;
  status: ProductRequestStatus;
  source: 'SCANNER' | 'MANUAL_EVIDENCE' | 'ADMIN';
  marketCountryCode: string | null;
  countryOfOrigin: string | null;
  ean: string | null;
  name: string | null;
  brand: string | null;
  variant: string | null;
  netQuantity: string | null;
  manufacturer: string | null;
  adminNote: string | null;
  rejectionReason: string | null;
  duplicateProductId: string | null;
  approvedProductId: string | null;
  submittedAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  archivedAt: string | null;
  missingFields: ProductRequestMissingField[];
  events: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
}

export interface ContributedProduct {
  requestId: string;
  productId: string;
  productCode: string;
  name: string;
  brand: string | null;
  createdAt: string;
}

export async function listMyProductRequests(archived: boolean): Promise<MyProductRequest[]> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_my_product_requests_v1', {
    p_archived: archived,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MyProductRequest[];
}

export async function listMyContributedProducts(): Promise<ContributedProduct[]> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.rpc('gellatti_my_contributed_products_v1');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ContributedProduct[];
}

export async function productRequestUserAction(
  requestId: string,
  action: 'ARCHIVE' | 'REOPEN' | 'CANCEL' | 'RESUBMIT',
  payload: Record<string, unknown> = {},
): Promise<void> {
  if (!supabase) return unavailable();
  const { error } = await supabase.rpc('gellatti_product_request_user_action_v1', {
    p_request_id: requestId,
    p_action: action,
    p_payload: payload,
  });
  if (error) throw new Error(error.message);
}

const evidenceKindFor = (fieldType: string): string => {
  if (fieldType === 'FRONT_PHOTO') return 'FRONT_PHOTO';
  if (fieldType === 'BARCODE_OR_EAN') return 'BARCODE_PHOTO';
  if (fieldType === 'INGREDIENTS') return 'INGREDIENTS_PHOTO';
  if (fieldType === 'NUTRITION_TABLE') return 'NUTRITION_PHOTO';
  if (fieldType === 'ALLERGEN_INFORMATION') return 'ALLERGEN_PHOTO';
  if (fieldType === 'TECHNICAL_DOCUMENT') return 'TECHNICAL_DOCUMENT';
  return 'OTHER';
};

const safeExtension = (mime: string): string => {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'application/pdf') return 'pdf';
  throw new Error('Dozwolone są pliki JPG, PNG, WEBP i PDF.');
};

const sha256 = async (file: File): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, '0')).join('');
};

export async function uploadRequestedEvidence(input: {
  requestId: string;
  fieldType: string;
  file: File;
}): Promise<void> {
  if (!supabase) return unavailable();
  if (input.file.size < 1 || input.file.size > 10 * 1024 * 1024) {
    throw new Error('Plik musi mieć maksymalnie 10 MB.');
  }
  const extension = safeExtension(input.file.type);
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('Zaloguj się, aby uzupełnić zgłoszenie.');
  const objectId = crypto.randomUUID();
  const path = `${auth.user.id}/${input.requestId}/${objectId}.${extension}`;
  const checksum = await sha256(input.file);
  const { error: uploadError } = await supabase.storage
    .from('product-request-evidence')
    .upload(path, input.file, { contentType: input.file.type, upsert: false });
  if (uploadError) throw new Error(uploadError.message);
  const { error: registerError } = await supabase.rpc(
    'gellatti_register_product_request_evidence_v1',
    {
      p_request_id: input.requestId,
      p_kind: evidenceKindFor(input.fieldType),
      p_storage_path: path,
      p_mime_type: input.file.type,
      p_byte_size: input.file.size,
      p_checksum_sha256: checksum,
      p_payload: { requestedField: input.fieldType, originalFileName: input.file.name.slice(0, 160) },
    },
  );
  if (registerError) throw new Error(registerError.message);
}

export async function resubmitProductRequest(input: {
  requestId: string;
  suppliedFields: string[];
  corrections: Record<string, string>;
  files: ReadonlyArray<{ fieldType: string; file: File }>;
}): Promise<void> {
  for (const item of input.files) {
    await uploadRequestedEvidence({ requestId: input.requestId, ...item });
  }
  await productRequestUserAction(input.requestId, 'RESUBMIT', {
    suppliedFields: [...new Set(input.suppliedFields)],
    corrections: input.corrections,
  });
}

