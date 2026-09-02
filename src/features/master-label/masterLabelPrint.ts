import notoRegularUrl from '@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff?url';
import notoBoldUrl from '@fontsource/noto-sans/files/noto-sans-latin-ext-700-normal.woff?url';
import { printLabelHtml } from '@/data/label/downloadCsv';
import type { MasterLabelData } from './masterLabel';
import { buildLabelPreflight } from './masterLabel';
import { marketProfile } from './marketProfiles';
import { PRINTER_PROFILES } from './printerProfiles';
import { renderMarketLabelHtml } from './renderers';
import { escapeHtml, primaryText } from './renderers/shared';
import { resolveMasterLabelLogoUrl } from './labelBrand';

export interface MasterLabelPrintOptions {
  draft?: boolean;
  calibration?: boolean;
  /** Render the final document in the workspace without unlocking print. */
  preview?: boolean;
}

function calibrationLabel(data: MasterLabelData): string {
  const printer = PRINTER_PROFILES[data.printer.profileId];
  return `<article class="label calibration" data-calibration="true"><div class="calibration-cross top-left"></div><div class="calibration-cross top-right"></div><div class="calibration-cross bottom-left"></div><div class="calibration-cross bottom-right"></div><div class="margin-guide"></div><strong>DRUK TESTOWY / CALIBRATION</strong><p>${escapeHtml(printer.manufacturer)} ${escapeHtml(printer.model)}</p><p>${data.size.widthMm} × ${data.size.heightMm} mm · ${data.printer.dpi} dpi</p><p>Margines / margin: ${data.printer.marginMm} mm</p><p>Orientacja / orientation: ${data.printer.orientation}</p></article>`;
}

function printCss(data: MasterLabelData, baseFontPt: number, pageSize: string): string {
  return `<style>@font-face{font-family:"Noto Sans Label";src:url("${notoRegularUrl}") format("woff");font-weight:400;font-style:normal}@font-face{font-family:"Noto Sans Label";src:url("${notoBoldUrl}") format("woff");font-weight:700;font-style:normal}@page{size:${pageSize};margin:${data.printer.marginMm}mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#000;font-family:"Noto Sans Label",sans-serif}.sheet{display:flex;flex-wrap:wrap;align-items:flex-start;gap:4mm}.label{position:relative;width:${data.size.widthMm}mm;height:${data.size.heightMm}mm;overflow:hidden;background:#fff;border:.25mm solid #000;padding:3mm;font-size:${baseFontPt.toFixed(2)}pt;line-height:1.28;break-inside:avoid;${data.format === 'round' ? 'border-radius:50%;padding:9mm;' : ''}}.label-logo{position:absolute;right:3mm;top:3mm;max-width:22mm;max-height:13mm;object-fit:contain;filter:grayscale(1)}[data-market-layout="world_neutral"] .label-logo{top:17mm}.world-information-warning{border:.5mm solid #000!important;padding:1.2mm!important;text-align:center;font-size:7.5pt;line-height:1.25;letter-spacing:.01em}.world-information-warning+header.identity{min-height:14mm}h1,h2,p{margin:0}h1{font-size:15pt;line-height:1.05}header.identity{border-bottom:.45mm solid #000;padding:0 24mm 1.8mm 0;margin-bottom:1.6mm}.identity p,.short-description{margin-top:.7mm}.ingredients,.contains,.may-contain,.storage,.origin,.article-id{margin:1.4mm 0}.allergen-term,.contains strong{font-weight:700}.contains{border-block:.25mm solid #000;padding:1mm 0}.nutrition-table{width:100%;border-collapse:collapse;margin:1.5mm 0}.nutrition-table caption{text-align:left;font-weight:700;border-bottom:.6mm solid #000;padding:.8mm 0}.nutrition-table th,.nutrition-table td{border-bottom:.15mm solid #777;padding:.45mm;text-align:left}.nutrition-table td{text-align:right;font-variant-numeric:tabular-nums}.nutrition-table .indent th,.nutrition-table tr.indent th{padding-left:3mm}.label-fact,.traceability>div{display:flex;justify-content:space-between;gap:3mm}.traceability{margin:1.5mm 0;border-top:.25mm solid #000;padding-top:1mm}.traceability span,.label-fact span{font-size:.9em}.business{border-top:.25mm solid #000;padding-top:1mm;margin-top:1.5mm}.same-field-of-vision{display:flex;justify-content:space-between;border:.4mm solid #000;padding:1mm}.principal-display-panel{min-height:25mm;display:flex;flex-direction:column;justify-content:space-between;border-bottom:1mm solid #000;padding-bottom:2mm;margin-bottom:2mm}.principal-display-panel h1{font-size:16pt}.us-net-contents{align-self:flex-end}.nutrition-facts{border:1mm solid #000;padding:1.2mm;margin:1.5mm 0;font-family:"Noto Sans Label",sans-serif}.nutrition-facts h2{font-size:20pt;line-height:.9;border-bottom:2.5mm solid #000;padding-bottom:1mm}.nutrition-facts.canada h2 span{font-size:13pt}.nutrition-facts .servings,.nutrition-facts .serving,.nutrition-facts .serving-size{padding:.6mm 0}.nutrition-facts .serving-size{display:flex;justify-content:space-between;border-bottom:2mm solid #000;font-size:8pt}.nutrition-facts .amount-heading{font-size:6pt;font-weight:700}.nutrition-facts .calories{display:flex;justify-content:space-between;align-items:end;border-bottom:1.2mm solid #000;font-size:16pt;font-weight:700}.nutrition-facts .calories.dual,.dual-column-heading{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1mm;text-align:right}.nutrition-facts .calories strong{font-size:22pt;line-height:1}.nutrition-facts .daily-value{text-align:right;font-size:6pt;font-weight:700}.nutrition-facts table{width:100%;border-collapse:collapse}.nutrition-facts th,.nutrition-facts td{border-top:.2mm solid #000;padding:.35mm 0;text-align:left;font-size:8pt}.nutrition-facts td{text-align:right;font-weight:700}.nutrition-facts .indent-1 th,.nutrition-facts tr.indent th{padding-left:3mm;font-weight:400}.nutrition-facts .indent-2 th{padding-left:6mm;font-weight:400}.nutrition-facts small{display:block;border-top:1mm solid #000;padding-top:.8mm;font-size:6pt;line-height:1.15}.nutrition-facts.compact{border-width:.55mm;padding:.8mm}.nutrition-facts.compact h2{font-size:12pt;border-bottom:.8mm solid #000}.nutrition-facts.linear .linear-facts{font-size:6pt;line-height:1.25;padding:.8mm 0}.nutrition-facts.tabular .tabular-heading{display:grid;grid-template-columns:auto 1fr auto;align-items:end;gap:2mm;border-bottom:.8mm solid #000}.nutrition-facts.tabular .tabular-heading h2{border:0}.nutrition-facts.tabular .tabular-heading>div{font-size:6pt}.nutrition-facts.tabular .tabular-heading>div:last-child{display:flex;gap:1mm;align-items:end;font-size:10pt}.nutrition-facts.tabular .tabular-columns{display:grid;grid-template-columns:1fr 1fr;gap:2mm}.nutrition-facts.tabular th,.nutrition-facts.tabular td{font-size:6pt;padding:.2mm 0}.nutrition-facts.canada{font-family:"Noto Sans Label",sans-serif}.fsanz-nip{border:.35mm solid #000}.fsanz-nip th,.fsanz-nip td{border:.2mm solid #000;padding:.6mm}.peal{font-weight:700}.bilingual{display:grid;grid-template-columns:1fr 1fr;gap:3mm}${data.market === 'CA' ? '.canada-fop{max-width:30mm;grid-column:1/-1}' : ''}.machine-codes{display:flex;gap:2mm;align-items:end;border-top:.2mm solid #000;margin-top:1.5mm;padding-top:1.5mm}.machine-code{max-width:34%;min-width:0}.machine-code svg{display:block;width:100%;max-height:18mm}.machine-code.qr{width:16mm}.machine-code small{display:block;text-align:center;font-size:5.5pt}.draft-watermark{position:absolute;z-index:10;inset:38% -15%;transform:rotate(-21deg);border-block:1.5mm solid rgba(120,0,0,.25);color:rgba(120,0,0,.28);font-size:20pt;font-weight:700;text-align:center;pointer-events:none}.calibration{display:grid;place-content:center;text-align:center;border:1mm solid #000}.calibration p{margin:.8mm}.margin-guide{position:absolute;inset:${data.printer.marginMm}mm;border:.25mm dashed #000}.calibration-cross{position:absolute;width:7mm;height:7mm}.calibration-cross:before,.calibration-cross:after{content:"";position:absolute;background:#000}.calibration-cross:before{left:50%;width:.25mm;height:100%}.calibration-cross:after{top:50%;width:100%;height:.25mm}.top-left{top:1mm;left:1mm}.top-right{top:1mm;right:1mm}.bottom-left{bottom:1mm;left:1mm}.bottom-right{bottom:1mm;right:1mm}</style>`;
}

function marketPrintCss(data: MasterLabelData): string {
  if (data.market !== 'CA') return '';
  return '<style>.nutrition-facts.canada{max-width:54mm;font-size:6pt}.nutrition-facts.canada h2,.nutrition-facts.canada h2 span{font-size:10pt;line-height:11pt}.nutrition-facts.canada .serving{font-size:7pt;line-height:8pt}.nutrition-facts.canada .calories{font-size:8pt;line-height:12.5pt}.nutrition-facts.canada th,.nutrition-facts.canada td{font-size:6pt;line-height:7pt}</style>';
}

export function buildMasterLabelPrintHtml(
  data: MasterLabelData,
  logoUrl?: string | null,
  options: MasterLabelPrintOptions = {},
): string {
  const preflight = buildLabelPreflight(data);
  if (
    !options.draft &&
    !options.calibration &&
    !options.preview &&
    !preflight.readyForSystemPrint
  ) {
    throw new Error('Master Label preflight is incomplete.');
  }
  const profile = marketProfile(data.market);
  const productName = primaryText(data.productName, data.labelLanguages);
  const pageSize =
    data.printer.profileId === 'system_a4_letter'
      ? 'A4'
      : `${data.size.widthMm}mm ${data.size.heightMm}mm`;
  const watermark = options.draft
    ? '<div class="draft-watermark" aria-label="Draft - not for sale">DRAFT<br>NIE DO SPRZEDAŻY</div>'
    : '';
  const outputLogoUrl = resolveMasterLabelLogoUrl(data, logoUrl);
  const logo =
    outputLogoUrl && data.enabledOptionalFields.includes('logo')
      ? `<img class="label-logo" src="${escapeHtml(outputLogoUrl)}" alt="">`
      : '';
  const body = options.calibration
    ? calibrationLabel(data)
    : `<article class="label" data-market-layout="${profile.consumerLayout}" data-renderer-version="${profile.rendererVersion}" data-readiness="${preflight.printReadiness}" data-packaging-context="${data.packagingContext}">${watermark}${logo}${renderMarketLabelHtml(data)}</article>`;
  const copies = Array.from(
    { length: options.calibration || options.preview ? 1 : Math.max(1, data.printer.copies) },
    () => body,
  ).join('');
  return `<!doctype html><html data-label-document="${options.preview ? 'preview' : options.calibration ? 'calibration' : options.draft ? 'draft' : 'print'}"><head><meta charset="utf-8"><title>${escapeHtml(options.calibration ? 'Druk testowy' : productName)}</title>${printCss(data, preflight.geometry.baseFontPt, pageSize)}${marketPrintCss(data)}</head><body><main class="sheet">${copies}</main></body></html>`;
}

export function printMasterLabel(
  data: MasterLabelData,
  logoUrl?: string | null,
  options?: MasterLabelPrintOptions,
): void {
  printLabelHtml(buildMasterLabelPrintHtml(data, logoUrl, options));
}
