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
 * Print through an isolated iframe in the current document. The native dialog
 * opens only after the document, fonts and images are ready.
 */
export async function printLabelHtml(html: string): Promise<void> {
  const frame = document.createElement('iframe');
  frame.title = 'Dokument etykiety do wydruku';
  frame.setAttribute('aria-hidden', 'true');
  frame.dataset.testid = 'label-native-print-frame';
  Object.assign(frame.style, {
    position: 'fixed',
    width: '1px',
    height: '1px',
    right: '0',
    bottom: '0',
    opacity: '0',
    pointerEvents: 'none',
  });
  document.body.appendChild(frame);
  const documentReady = new Promise<void>((resolve, reject) => {
    frame.addEventListener('load', () => resolve(), { once: true });
    frame.addEventListener(
      'error',
      () => reject(new Error('Nie udało się przygotować dokumentu do druku.')),
      { once: true },
    );
  });
  frame.srcdoc = html;
  await documentReady;
  const target = frame.contentWindow;
  const targetDocument = frame.contentDocument;
  if (!target || !targetDocument) {
    frame.remove();
    throw new Error('Nie udało się przygotować dokumentu do druku.');
  }
  await targetDocument.fonts?.ready;
  await Promise.all(
    [...targetDocument.images].map((image) =>
      image.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            image.addEventListener('load', () => resolve(), { once: true });
            image.addEventListener('error', () => resolve(), { once: true });
          }),
    ),
  );
  target.addEventListener('afterprint', () => frame.remove(), { once: true });
  target.print();
}
