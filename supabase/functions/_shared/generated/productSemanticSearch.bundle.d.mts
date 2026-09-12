import type { MapperSearchResolution } from '../../../../src/features/mapper-search-runtime/types.ts';

export const PRODUCT_SEMANTIC_SEARCH_RELEASE_ID: 'GELLATTI-SA10-2026-09-10-FINAL';
export const PRODUCT_SEMANTIC_SEARCH_RELEASE_SHA256: '20e92e6c84d8909e97bde2359d81a0aa429b3f0c6311474c3e50b10705936127';
export function resolveFinalProductSemanticSearch(
  query: string,
  marketCountries?: readonly string[],
): Promise<MapperSearchResolution>;
