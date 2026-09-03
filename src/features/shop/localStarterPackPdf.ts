import notoBoldDataUrl from '@/assets/fonts/NotoSans-Bold.ttf?inline';
import notoRegularDataUrl from '@/assets/fonts/NotoSans-Regular.ttf?inline';

/**
 * The Local Starter Pack shopping list, as a branded PDF.
 *
 * GENERATED FROM THE ORDER'S SNAPSHOT, never from live Admin rows. That is the
 * whole point of `local_pack_snapshot`: a supplier link edited next month
 * changes every FUTURE document and leaves an issued one exactly as the
 * customer received it. Regenerating an old order reproduces the old links.
 *
 * NotoSans is embedded rather than a standard PDF font because the component
 * titles are Polish — Helvetica cannot render "Śmietanka" or "żółtko", and a
 * shopping list with mangled ingredient names is not a document anyone can use.
 */

export interface LocalPackSnapshotComponent {
  sku: string;
  componentTitle: string;
  localProductName: string;
  supplierName: string;
  purchaseUrl: string;
  packSize: string | null;
  displayPrice: string | null;
  notes: string | null;
}

export interface LocalPackSnapshot {
  version: number;
  generatedAt: string;
  country: { iso2: string; name: string };
  components: LocalPackSnapshotComponent[];
}

const GELLATTI_URL = 'www.gellatti.com';
const INK = { r: 0.063, g: 0.067, b: 0.075 };
const MUTED = { r: 0.396, g: 0.388, b: 0.373 };
const ORANGE = { r: 0.961, g: 0.541, b: 0.027 };

const dataUrlToBytes = (dataUrl: string): Uint8Array => {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

/** A readable date that does not depend on the reader's locale settings. */
const isoDay = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : date.toISOString().slice(0, 10);
};

export const localStarterPackPdfFilename = (snapshot: LocalPackSnapshot, orderNumber: string) =>
  `gellatti-local-starter-pack-${snapshot.country.iso2}-${orderNumber}.pdf`;

/**
 * Compose the document. Returns raw bytes so the caller decides whether to
 * download it, open it, or hand it to something else.
 */
export async function composeLocalStarterPackPdf(
  snapshot: LocalPackSnapshot,
  orderNumber: string,
): Promise<Uint8Array> {
  const { PDFDocument, PDFName, PDFString, rgb } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(dataUrlToBytes(notoRegularDataUrl), { subset: true });
  const bold = await doc.embedFont(dataUrlToBytes(notoBoldDataUrl), { subset: true });

  const width = 595.28;
  const height = 841.89;
  const margin = 48;
  let page = doc.addPage([width, height]);
  let y = height - margin;

  const line = (
    value: string,
    options: { size?: number; font?: typeof regular; color?: typeof INK; gap?: number } = {},
  ) => {
    const size = options.size ?? 10;
    const font = options.font ?? regular;
    const color = options.color ?? INK;
    if (y < margin + 60) {
      page = doc.addPage([width, height]);
      y = height - margin;
    }
    const drawnY = y - size;
    page.drawText(value, {
      x: margin,
      y: drawnY,
      size,
      font,
      color: rgb(color.r, color.g, color.b),
    });
    y -= size + (options.gap ?? 6);
    /* Where the text landed, so a caller can hang a link annotation on it. */
    return { page, x: margin, y: drawnY, width: font.widthOfTextAtSize(value, size), height: size };
  };

  /* A CLICKABLE link over an already-drawn run of text.
   *
   * The URL stays visible in the document: this list is meant to survive being
   * printed and carried around a shop, where an annotation is worth nothing. But
   * a reader on a phone must be able to tap it, so the visible text and the
   * clickable region are the same box rather than a choice between them.
   *
   * pdf-lib has no link helper, so the annotation is built as a raw PDF object:
   * a /Link with a /URI action and no visible border (the underline below is
   * ours, drawn deliberately). */
  const linkify = (
    box: { page: typeof page; x: number; y: number; width: number; height: number },
    url: string,
  ) => {
    const annotation = doc.context.register(
      doc.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [box.x - 1, box.y - 2, box.x + box.width + 1, box.y + box.height],
        Border: [0, 0, 0],
        A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
      }),
    );
    const existing = box.page.node.Annots();
    if (existing) existing.push(annotation);
    else box.page.node.set(PDFName.of('Annots'), doc.context.obj([annotation]));
    /* A hairline under the link, so it reads as one on paper too. */
    box.page.drawLine({
      start: { x: box.x, y: box.y - 1.5 },
      end: { x: box.x + box.width, y: box.y - 1.5 },
      thickness: 0.4,
      color: rgb(MUTED.r, MUTED.g, MUTED.b),
    });
  };

  // ── Masthead ──────────────────────────────────────────────────────────────
  line('GELLATTI', { size: 9, font: bold, color: MUTED, gap: 10 });
  line('Local Starter Pack', { size: 22, font: bold, gap: 4 });
  line(snapshot.country.name, { size: 13, color: MUTED, gap: 2 });
  line(`${isoDay(snapshot.generatedAt)} · ${orderNumber}`, { size: 9, color: MUTED, gap: 18 });

  page.drawRectangle({
    x: margin,
    y,
    width: width - margin * 2,
    height: 2,
    color: rgb(ORANGE.r, ORANGE.g, ORANGE.b),
  });
  y -= 20;

  // ── Items ─────────────────────────────────────────────────────────────────
  for (const item of snapshot.components) {
    line(item.componentTitle, { size: 11, font: bold, gap: 3 });
    const facts = [item.localProductName, item.packSize, item.displayPrice]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join(' · ');
    if (facts) line(facts, { size: 10, gap: 3 });
    line(item.supplierName, { size: 9.5, color: MUTED, gap: 3 });
    // The link is the point of the document. Printed in full for paper, and
    // wrapped in a real annotation so a digital reader can click it.
    const urlBox = line(item.purchaseUrl, {
      size: 8.5,
      color: MUTED,
      gap: item.notes ? 3 : 14,
    });
    linkify(urlBox, item.purchaseUrl);
    if (item.notes) line(item.notes, { size: 9, color: MUTED, gap: 14 });
  }

  // ── Foot ──────────────────────────────────────────────────────────────────
  y -= 6;
  linkify(line(GELLATTI_URL, { size: 10, font: bold, color: MUTED }), 'https://www.gellatti.com');

  return doc.save();
}

/** Compose and hand the file to the browser. */
export async function downloadLocalStarterPackPdf(
  snapshot: LocalPackSnapshot,
  orderNumber: string,
): Promise<void> {
  const bytes = await composeLocalStarterPackPdf(snapshot, orderNumber);
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = localStarterPackPdfFilename(snapshot, orderNumber);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
