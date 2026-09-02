import { supabase } from '@/lib/supabase/client';
import type { TextImportAdapterOutput } from '@/features/product-textimport/textImportAdapter';
import type { TextImportEanResolverResult } from '@/features/product-textimport/eanResolverContract';
import {
  existingEanHandoff,
  resolvedEanHandoff,
  textImportEanQuery,
  type TextImportScannerHandoff,
} from '@/features/product-textimport/textImportEanResolver';

export type TextImportEanPreparation =
  | { kind: 'SCANNER_INPUT_READY'; handoff: TextImportScannerHandoff }
  | {
      kind: 'STOP_BEFORE_SCANNER';
      sourceRowId: string | null;
      resolverResult: Exclude<TextImportEanResolverResult, { status: 'EAN_RESOLVED' }>;
    };

export async function prepareTextImportScannerInput(options: {
  runId: string;
  adapter: TextImportAdapterOutput;
  invoke?: (query: unknown) => Promise<TextImportEanResolverResult>;
}): Promise<TextImportEanPreparation> {
  const skipped = existingEanHandoff(options.adapter);
  if (skipped) return { kind: 'SCANNER_INPUT_READY', handoff: skipped };
  const query = textImportEanQuery(options.adapter);
  if (!query) {
    return {
      kind: 'STOP_BEFORE_SCANNER',
      sourceRowId: options.adapter.sourceRowId,
      resolverResult: {
        status: 'EAN_NOT_FOUND',
        query: {
          resolverVersion: 'gellatti_textimport_ean_resolver_v1',
          sourceRowId: options.adapter.sourceRowId,
          identity: {
            exactProductName: '',
            brand: options.adapter.scannerInput.identity.brand,
            manufacturer: options.adapter.scannerInput.manufacturer,
            variant: options.adapter.scannerInput.identity.variant,
            packageText: options.adapter.scannerInput.package.netQuantityText,
          },
          source: null,
        },
        reason: 'An exact product name is required before EAN research can start.',
        searchedSteps: [],
        research: {
          budget: {
            rowWebCallCap: 0,
            runWebCallCap: 0,
            worstCaseWebCallsPerRequest: 0,
            rowWebCallsReserved: 0,
            runWebCallsReserved: 0,
          },
          providerRequestsUsed: 0,
          webCallsUsed: 0,
          completedSteps: [],
          sourcesChecked: [],
          exactEvidence: [],
          checksumChecks: [],
        },
      },
    };
  }
  const invoke =
    options.invoke ??
    (async (requestQuery: unknown) => {
      if (!supabase) throw new Error('textimport_ean_resolver_unavailable');
      const { data, error } = await supabase.functions.invoke('product-textimport-ean-resolve', {
        body: { runId: options.runId, query: requestQuery },
      });
      if (error) throw error;
      return data as TextImportEanResolverResult;
    });
  const resolverResult = await invoke(query);
  const handoff = resolvedEanHandoff(options.adapter, resolverResult);
  if (handoff) return { kind: 'SCANNER_INPUT_READY', handoff };
  if (resolverResult.status === 'EAN_RESOLVED')
    throw new Error('textimport_ean_resolution_rejected');
  return {
    kind: 'STOP_BEFORE_SCANNER',
    sourceRowId: options.adapter.sourceRowId,
    resolverResult,
  };
}
