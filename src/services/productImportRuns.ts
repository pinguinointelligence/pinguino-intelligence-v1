import { supabase } from '@/lib/supabase/client';
import { functionErrorDetail } from '@/services/productIngest';

const UNAVAILABLE = 'Kontrola importu nie jest dostępna w tej kompilacji.';
const STORAGE_KEY = 'pinguino:intimport:active-run-v1';

export type ProductImportRunStatus =
  | 'IMPORTING'
  | 'CANCELLING'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'FAILED'
  | 'ROLLING_BACK'
  | 'ROLLED_BACK';

export interface ProductImportPreflight {
  pi: number;
  pr: number;
  prVersions: number;
  prBehaviorBindings: number;
  prMatchedBasementRelations: number;
  ready: boolean;
}

export interface ProductImportRunState {
  id: string;
  status: ProductImportRunStatus;
  source: 'INTIMPORT';
  mode: 'STANDARD' | 'CLEAN_OWNER_REIMPORT';
  label: string;
  source_file_name: string | null;
  source_fingerprint: string;
  total_rows: number;
  processed: number;
  created: number;
  reused: number;
  updated: number;
  review: number;
  skipped: number;
  failed: number;
  remaining: number;
  started_at: string | null;
  finished_at: string | null;
  rolled_back_at: string | null;
}

async function invoke<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const { data, error } = await supabase.functions.invoke('product-import-run', {
    body: { action, ...payload },
  });
  if (error) throw new Error(await functionErrorDetail(error));
  return data as T;
}

export async function productImportSourceFingerprint(sourceText: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sourceText));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const getCleanProductImportPreflight = (): Promise<ProductImportPreflight> =>
  invoke('preflight');

export async function startIntimportRun(input: {
  mode: 'STANDARD' | 'CLEAN_OWNER_REIMPORT';
  label: string;
  fileName: string | null;
  sourceFingerprint: string;
  totalRows: number;
}): Promise<ProductImportRunState> {
  const run = await invoke<ProductImportRunState>('start', input);
  rememberProductImportRun(run.id);
  return run;
}

export const startCleanIntimportRun = (
  input: Omit<Parameters<typeof startIntimportRun>[0], 'mode'>,
): Promise<ProductImportRunState> => startIntimportRun({ ...input, mode: 'CLEAN_OWNER_REIMPORT' });

export const getProductImportRun = (runId: string): Promise<ProductImportRunState> =>
  invoke('state', { runId });

export const requestProductImportCancellation = (runId: string): Promise<ProductImportRunState> =>
  invoke('cancel', { runId });

export const finishProductImportRun = (
  runId: string,
  status: 'CANCELLED' | 'COMPLETED' | 'FAILED',
): Promise<ProductImportRunState> => invoke('finish', { runId, status });

export const recordProductImportRowOutcome = (input: {
  runId: string;
  rowIndex: number;
  sourceRowId: string | null;
  displayName: string | null;
  outcome: 'REUSED' | 'REVIEW' | 'SKIPPED' | 'FAILED';
  error?: string | null;
  result?: Record<string, unknown>;
}): Promise<ProductImportRunState> => invoke('recordOutcome', input);

export async function rollbackProductImportRun(
  runId: string,
  onProgress?: (state: ProductImportRunState & { remainingRollbackRows: number }) => void,
): Promise<ProductImportRunState> {
  for (let batch = 0; batch < 500; batch += 1) {
    const state = await invoke<ProductImportRunState & { remainingRollbackRows: number }>(
      'rollbackBatch',
      { runId, batchSize: 8 },
    );
    onProgress?.(state);
    if (state.status === 'ROLLED_BACK') return state;
  }
  throw new Error('Rollback nie zakończył się w bezpiecznym limicie partii.');
}

export function rememberProductImportRun(runId: string): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, runId);
}

export function rememberedProductImportRun(): string | null {
  return typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY);
}

export function forgetProductImportRun(): void {
  if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
}
