const missingSaturatedPattern =
  /saturated fat[^.]{0,80}(?:not present|missing|not available|not provided)/i;

export function assertSaturatedFatWasNotInvented(headers, rows) {
  const saturatedIndex = headers.indexOf('saturated_fat_percent');
  const notesIndex = headers.indexOf('engine_notes');
  if (saturatedIndex < 0 || notesIndex < 0) return;
  const idIndex = headers.indexOf('ingredient_id');
  for (const row of rows) {
    const saturated = String(row[saturatedIndex] ?? '').trim();
    const notes = String(row[notesIndex] ?? '').trim();
    if (saturated === '0' && missingSaturatedPattern.test(notes)) {
      throw new Error(
        `Saturated-fat source guard: ${row[idIndex] ?? 'unknown ingredient'} has 0 although its source says the field is missing. Preserve NULL/UNKNOWN and submit an Owner-reviewed correction manifest.`,
      );
    }
  }
}
