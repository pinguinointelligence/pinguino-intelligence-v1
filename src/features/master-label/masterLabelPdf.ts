import type { MasterLabelData } from './masterLabel';
import { buildLabelPreflight } from './masterLabel';
import { buildMasterLabelPrintHtml, type MasterLabelPrintOptions } from './masterLabelPrint';

const POINTS_PER_MM = 72 / 25.4;
const CSS_DPI = 96;
const MAX_RASTER_DPI = 600;

export interface MasterLabelPdfArtifact {
  bytes: Uint8Array;
  filename: string;
  pageCount: number;
  widthMm: number;
  heightMm: number;
  rasterDpi: number;
}

export interface MasterLabelPdfOptions extends MasterLabelPrintOptions {
  download?: boolean;
}

const mmToPoints = (millimetres: number): number => millimetres * POINTS_PER_MM;

const safePdfDate = (value: string): Date => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date('2000-01-01T00:00:00.000Z');
};

const filenamePart = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

export function masterLabelPdfFilename(data: MasterLabelData, draft = false): string {
  const prefix = draft ? 'gellatti-draft' : 'gellatti-label';
  const identity = filenamePart(data.lotCode || data.masterLabelId) || 'snapshot';
  return `${prefix}-${identity}-${data.market.toLowerCase()}-${data.size.widthMm}x${data.size.heightMm}mm.pdf`;
}

export function masterLabelPdfGeometry(data: MasterLabelData): {
  widthPoints: number;
  heightPoints: number;
  rasterDpi: number;
  copies: number;
} {
  return {
    widthPoints: mmToPoints(data.size.widthMm),
    heightPoints: mmToPoints(data.size.heightMm),
    rasterDpi: Math.min(MAX_RASTER_DPI, Math.max(203, data.printer.dpi)),
    copies: Math.max(1, Math.floor(data.printer.copies ?? data.copies)),
  };
}

export async function composeMasterLabelPdf(
  data: MasterLabelData,
  pngBytes: Uint8Array,
  options: MasterLabelPrintOptions = {},
): Promise<MasterLabelPdfArtifact> {
  const { PDFDocument } = await import('pdf-lib');
  const geometry = masterLabelPdfGeometry(data);
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(pngBytes);
  const frozenDate = safePdfDate(data.sourceCompletedAt);
  const title = `${options.draft ? 'DRAFT - ' : ''}${data.lotCode} - ${data.market}`;

  pdf.setTitle(title);
  pdf.setAuthor(data.businessName || data.operator.operatorName || 'Gellatti');
  pdf.setSubject(
    `${data.size.widthMm} x ${data.size.heightMm} mm; ${data.printer.profileId}; ${data.printer.dpi} dpi`,
  );
  pdf.setCreator('Gellatti Master Label');
  pdf.setProducer('Gellatti Master Label PDF');
  pdf.setCreationDate(frozenDate);
  pdf.setModificationDate(frozenDate);

  for (let copy = 0; copy < geometry.copies; copy += 1) {
    const page = pdf.addPage([geometry.widthPoints, geometry.heightPoints]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: geometry.widthPoints,
      height: geometry.heightPoints,
    });
  }

  const bytes = await pdf.save({ addDefaultPage: false, useObjectStreams: false });
  return {
    bytes,
    filename: masterLabelPdfFilename(data, Boolean(options.draft)),
    pageCount: geometry.copies,
    widthMm: data.size.widthMm,
    heightMm: data.size.heightMm,
    rasterDpi: geometry.rasterDpi,
  };
}

const waitForFrame = (frame: HTMLIFrameElement): Promise<void> =>
  new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error('Przekroczono czas przygotowania etykiety PDF.')),
      15_000,
    );
    frame.addEventListener(
      'load',
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });

async function rasterizeMasterLabel(
  data: MasterLabelData,
  logoUrl: string | null | undefined,
  options: MasterLabelPrintOptions,
): Promise<Uint8Array> {
  const html2canvas = (await import('html2canvas')).default;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = [
    'position:fixed',
    'left:-20000px',
    'top:0',
    `width:${data.size.widthMm}mm`,
    `height:${data.size.heightMm}mm`,
    'border:0',
    'background:#fff',
    'pointer-events:none',
  ].join(';');
  frame.srcdoc = buildMasterLabelPrintHtml(data, logoUrl, options);
  const frameLoaded = waitForFrame(frame);
  document.body.appendChild(frame);

  try {
    await frameLoaded;
    const frameDocument = frame.contentDocument;
    const label = frameDocument?.querySelector<HTMLElement>('.label');
    if (!frameDocument || !label) throw new Error('Nie znaleziono etykiety do eksportu PDF.');
    await frameDocument.fonts?.ready;
    await Promise.all(
      [...frameDocument.images].map(async (image) => {
        if (image.complete && image.naturalWidth > 0) return;
        try {
          await image.decode();
          if (image.naturalWidth <= 0) throw new Error('empty image');
        } catch {
          throw new Error('Nie udało się osadzić obrazu etykiety w PDF.');
        }
      }),
    );

    const geometry = masterLabelPdfGeometry(data);
    const canvas = await html2canvas(label, {
      backgroundColor: '#ffffff',
      logging: false,
      removeContainer: true,
      scale: geometry.rasterDpi / CSS_DPI,
      useCORS: true,
      width: label.offsetWidth,
      height: label.offsetHeight,
      windowWidth: label.scrollWidth,
      windowHeight: label.scrollHeight,
    });
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('Nie utworzono obrazu PDF.'))),
        'image/png',
      );
    });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    frame.remove();
  }
}

function triggerPdfDownload(artifact: MasterLabelPdfArtifact): void {
  const pdfBuffer = Uint8Array.from(artifact.bytes).buffer;
  const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = artifact.filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function downloadMasterLabelPdf(
  data: MasterLabelData,
  logoUrl?: string | null,
  options: MasterLabelPdfOptions = {},
): Promise<MasterLabelPdfArtifact> {
  const preflight = buildLabelPreflight(data);
  if (!options.draft && !options.calibration && !preflight.readyForSystemPrint) {
    throw new Error('Master Label preflight is incomplete.');
  }
  const png = await rasterizeMasterLabel(data, logoUrl, options);
  const artifact = await composeMasterLabelPdf(data, png, options);
  if (options.download !== false) triggerPdfDownload(artifact);
  return artifact;
}
