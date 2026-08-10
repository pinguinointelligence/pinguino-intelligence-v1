import {
  mapperProcessRowsToEvidence,
  type MapperProcessMetadataRow,
} from '@/features/education/processMetadata';
import type { RecipeProcessEvidence } from '@/features/education/processClassification';
import { supabase } from '@/lib/supabase/client';
import { emptyUnconfiguredRead } from '@/services/backendGuard';

const TABLE = 'mapper_process_metadata';

/** Read-only, exact-canonical-ID boundary for the separate Process companion. */
export async function listProcessEvidenceByIngredientIds(
  ingredientIds: readonly string[],
): Promise<RecipeProcessEvidence[]> {
  const ids = [...new Set(ingredientIds.filter(Boolean))];
  if (ids.length === 0) return [];
  if (!supabase) return emptyUnconfiguredRead('processMetadata.listByIngredientIds', []);
  const { data, error } = await supabase.from(TABLE).select('*').in('ingredient_id', ids);
  if (error) throw new Error(error.message);
  return mapperProcessRowsToEvidence((data ?? []) as MapperProcessMetadataRow[]);
}
