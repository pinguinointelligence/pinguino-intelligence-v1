import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MasterLabelData } from './masterLabel';
import { buildLabelPreflight } from './masterLabel';
import { marketProfile } from './marketProfiles';
import { buildMasterLabelPrintHtml } from './masterLabelPrint';
import { renderMarketLabelHtml } from './renderers';
import { CSS_PIXELS_PER_MM, fitLabelPreviewScale } from './labelPreviewGeometry';

export function ConsumerLabelPreview({
  label,
  logoUrl,
}: {
  label: MasterLabelData;
  logoUrl: string | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [availableWidthPx, setAvailableWidthPx] = useState<number | null>(null);
  const profile = marketProfile(label.market);
  const preflight = buildLabelPreflight(label);
  const previewHtml = buildMasterLabelPrintHtml(label, logoUrl, { preview: true });
  const physicalWidthPx = label.size.widthMm * CSS_PIXELS_PER_MM;
  const physicalHeightPx = label.size.heightMm * CSS_PIXELS_PER_MM;
  const previewScale = fitLabelPreviewScale(availableWidthPx, label.size.widthMm);
  const scaledSize = useMemo(
    () => ({
      width: physicalWidthPx * previewScale,
      height: physicalHeightPx * previewScale,
    }),
    [physicalHeightPx, physicalWidthPx, previewScale],
  );

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const measure = (width = host.getBoundingClientRect().width) => {
      if (width > 0) setAvailableWidthPx((current) => (current === width ? current : width));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      const onWindowResize = () => measure();
      window.addEventListener('resize', onWindowResize);
      return () => window.removeEventListener('resize', onWindowResize);
    }
    const observer = new ResizeObserver((entries) => measure(entries[0]?.contentRect.width));
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={hostRef}
      className="mx-auto w-full max-w-full overflow-hidden"
      data-testid="label-consumer-preview-sizer"
      data-preview-scale={previewScale.toFixed(6)}
    >
      <div
        className="mx-auto overflow-hidden"
        style={{ width: scaledSize.width, height: scaledSize.height }}
      >
        <article
          className="relative overflow-hidden bg-white text-ink shadow-[0_18px_60px_rgba(36,33,28,0.08)]"
          style={{
            width: physicalWidthPx,
            height: physicalHeightPx,
            transform: `scale(${previewScale})`,
            transformOrigin: 'top left',
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
    </div>
  );
}
