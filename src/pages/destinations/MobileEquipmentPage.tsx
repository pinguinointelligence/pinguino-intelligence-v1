import { LanePage } from './LanePage';
import { MOBILE_PAGE } from '@/copy/workWithUsLanes';

/**
 * `/mobile` — mobile equipment. Carts, not the trailer: the trailer is its own
 * format on its own route and is deliberately absent here.
 *
 * A05 is the hero and W02 the events case. NEITHER is labelled with a model.
 * The canonical set is Battery Cart · V2C · V4C, but nothing in the photographs
 * identifies which cart is which, so the copy stays model-neutral until the
 * owner proves the mapping.
 */
export function MobileEquipmentPage() {
  return (
    <LanePage
      copy={MOBILE_PAGE}
      hero="A05"
      detail="W02"
      detailCaption="Obsługa wesela. Konfigurację wózka dobieramy do wydarzenia."
    />
  );
}
