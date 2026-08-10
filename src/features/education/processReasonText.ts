export function processReasonText(
  ingredientId: string | null,
  explanation: string,
  ingredientNamesById: ReadonlyMap<string, string>,
): string {
  return ingredientId
    ? `${ingredientNamesById.get(ingredientId) ?? ingredientId} — ${explanation}`
    : explanation;
}
