import { LanePage } from './LanePage';
import { MACHINES_PAGE } from '@/copy/workWithUsLanes';

/**
 * `/machines` — professional equipment.
 *
 * NO HERO PHOTOGRAPH, on purpose. The owner has not supplied a dedicated
 * Machines hero, and the two the manifest nominated (A04, W01) contain no
 * machine. Rather than borrow an image that shows something else, this route
 * uses a typography-first hero (owner decision, 2026-08-31) and puts W01 lower
 * down as an equipment DETAIL — a pozzetti counter in use, which is real
 * equipment without claiming to be any particular model.
 *
 * The supplier's name never appears here, and nothing claims Gellatti
 * manufactures the equipment.
 */
export function MachinesPage() {
  return (
    <LanePage
      copy={MACHINES_PAGE}
      detail="W01"
      detailCaption="Ekspozycja pozzetti w pracy. Konkretny model dobieramy do lokalu i podajemy w wycenie."
    />
  );
}
