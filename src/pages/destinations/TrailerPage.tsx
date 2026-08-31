import { LanePage } from './LanePage';
import { TRAILER_PAGE } from '@/copy/workWithUsLanes';

/**
 * `/trailer` — the complete mobile Gellatti point.
 *
 * A07 is the lifestyle hero, A06 the product view and W03 the trailer on the
 * road. Owner correction, 2026-08-31: W03 IS the Gellatti Trailer, so all three
 * are one product story and NO disclaimer separates them. An earlier draft held
 * W03 back on the assumption it showed a different trailer; that assumption was
 * wrong and is withdrawn.
 *
 * `gellattissimo` in W03 is intentional Gellatti branding and stays.
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
      detailSecondary="W03"
      detailSecondaryCaption="W drodze na wydarzenie — punkt jedzie tam, gdzie są ludzie."
    />
  );
}
