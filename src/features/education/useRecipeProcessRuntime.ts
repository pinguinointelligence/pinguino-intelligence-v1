import { useEffect, useMemo, useState } from 'react';
import type { RecipeInput } from '@/engine';
import { listProcessEvidenceByIngredientIds } from '@/services/processMetadata';
import {
  classifyHeatProcess,
  processIdentityForItem,
  type RecipeProcessEvidence,
} from './processClassification';

export function useRecipeProcessRuntime(
  input: RecipeInput,
  processEvidence?: readonly RecipeProcessEvidence[],
) {
  const ingredientIds = useMemo(() => input.items.map(processIdentityForItem), [input]);
  const ingredientKey = ingredientIds.join('\u0000');
  const [runtime, setRuntime] = useState<{
    key: string;
    evidence: readonly RecipeProcessEvidence[];
    settled: boolean;
  }>(() => ({ key: ingredientKey, evidence: [], settled: false }));
  const ingredientNamesById = useMemo(
    () =>
      new Map(
        input.items.map((item) => [processIdentityForItem(item), item.ingredient.name] as const),
      ),
    [input],
  );

  useEffect(() => {
    if (processEvidence !== undefined) return;

    let activeRequest = true;
    void listProcessEvidenceByIngredientIds(ingredientIds)
      .then((evidence) => {
        if (!activeRequest) return;
        setRuntime({ key: ingredientKey, evidence, settled: true });
      })
      .catch(() => {
        if (!activeRequest) return;
        setRuntime({ key: ingredientKey, evidence: [], settled: true });
      });
    return () => {
      activeRequest = false;
    };
  }, [ingredientIds, ingredientKey, processEvidence]);

  const currentRuntime = runtime.key === ingredientKey ? runtime : null;
  const evidence = processEvidence ?? currentRuntime?.evidence ?? [];
  const classification = classifyHeatProcess({ ingredientIds, evidence });

  return {
    classification,
    evidence,
    ingredientNamesById,
    loading: processEvidence === undefined && currentRuntime?.settled !== true,
  };
}
