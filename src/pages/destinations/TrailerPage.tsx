import { LanePage } from './LanePage';
import { TRAILER_PAGE } from '@/copy/workWithUsLanes';

/**
 * `/trailer` — the complete mobile Gellatti point.
 *
 * A07 is the lifestyle hero and A06 the product view; they are the SAME
 * trailer. W03 shows a different one — twin-axle, aluminium — and is
 * deliberately kept out of the primary product story until its offer and model
 * are resolved (owner decision, 2026-08-31). Showing both would imply one
 * product with two bodies.
 *
 * No fitment claim appears here. The 600 mm machine-bay rule and the open V4B
 * question live in Admin and the checklist, not on a public page.
 */
export function TrailerPage() {
  return (
    <LanePage
      copy={TRAILER_PAGE}
      hero="A07"
      detail="A06"
      detailCaption="Przyczepa bazowa. Wyposażenie i branding ustalamy przy wycenie."
    />
  );
}
