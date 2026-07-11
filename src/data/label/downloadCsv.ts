/**
 * Browser side-effects for Labels & Exports, isolated here so the builders in
 * ./recipeExport stay pure (and testable in the node test env with no DOM).
 */

/** Trigger a client-side download of `csv` as `filename` (Blob + object URL). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Open a self-contained printable label document in a new window and print it.
 * Falls back to printing the current page when the window can't be opened.
 */
export function printLabelHtml(html: string): void {
  const win = window.open('', '_blank');
  if (!win) {
    window.print();
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}
