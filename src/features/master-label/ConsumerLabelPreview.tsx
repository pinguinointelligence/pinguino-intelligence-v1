import type { MasterLabelData } from './masterLabel';
import { buildLabelPreflight } from './masterLabel';
import { marketProfile } from './marketProfiles';
import { buildMasterLabelPrintHtml } from './masterLabelPrint';
import { renderMarketLabelHtml } from './renderers';

export function ConsumerLabelPreview({
  label,
  logoUrl,
}: {
  label: MasterLabelData;
  logoUrl: string | null;
}) {
  const profile = marketProfile(label.market);
  const preflight = buildLabelPreflight(label);
  const previewHtml = buildMasterLabelPrintHtml(label, logoUrl, { preview: true });
  return (
    <div className="mx-auto w-fit max-w-full">
      <div className="mb-2 flex items-center justify-between gap-4 text-[11px] text-stone-500">
        <span data-testid="label-market-indicator">{profile.label}</span>
        <span>{preflight.printReadiness}</span>
      </div>
      {label.market === 'WORLD' ? (
        <p className="mb-3 max-w-xl text-xs text-stone-500">
          Uniwersalna etykieta informacyjna — bez profilu prawnego konkretnego kraju.
        </p>
      ) : null}
      <article
        className="relative shrink-0 overflow-hidden bg-white text-ink shadow-[0_18px_60px_rgba(36,33,28,0.08)]"
        style={{
          width: `${label.size.widthMm}mm`,
          height: `${label.size.heightMm}mm`,
        }}
        aria-label="Podgląd etykiety konsumenckiej"
        data-testid="label-consumer-preview"
        data-market={label.market}
        data-label-layout={profile.consumerLayout}
        data-renderer-version={profile.rendererVersion}
        data-physical-width-mm={label.size.widthMm}
        data-physical-height-mm={label.size.heightMm}
        data-printer-profile={label.printer.profileId}
        data-printer-dpi={label.printer.dpi}
        data-geometry-fits={preflight.geometry.fits}
      >
        <iframe
          title="Dokładny podgląd dokumentu etykiety"
          srcDoc={previewHtml}
          className="block size-full border-0 bg-white"
          scrolling="no"
          data-testid="label-print-document-preview"
        />
        {/* The transcript keeps the preview accessible and testable without duplicating it visually. */}
        <div
          className="sr-only"
          dangerouslySetInnerHTML={{ __html: renderMarketLabelHtml(label) }}
        />
      </article>
    </div>
  );
}
