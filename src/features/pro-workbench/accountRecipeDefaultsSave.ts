export async function commitRecipeDefaultsAfterRemoteSave(
  remoteSave: () => Promise<void>,
  commitLocal: () => void,
): Promise<void> {
  await remoteSave();
  commitLocal();
}
