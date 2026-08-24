import type { ImportProgress } from '@/services/productCatalogImport';
import type { ProductImportRunState } from '@/services/productImportRuns';

export function restoredImportProgress(state: ProductImportRunState): ImportProgress | null {
  if (state.status === 'ROLLED_BACK') return null;
  return {
    processed: state.processed,
    total: state.total_rows,
    created: state.created,
    existing: state.reused,
    inBatchDuplicates: 0,
    skipped: state.skipped,
    failed: state.failed,
    currentName: null,
    currentRowIndex: state.processed,
  };
}
