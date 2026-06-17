import { ComingSoonRow, DestinationSurface } from '@/components/shared/DestinationSurface';
import { ImagePlaceholder } from '@/features/shell/MegaMenuItem';
import { copy } from '@/copy/en';

const g = copy.nav.ingredient;

/**
 * Create Ingredient destination (Phase 6C Slice 3) — visual surface only.
 * No OCR, camera, external AI, or upload logic (capture/extraction is future PI Pro).
 */
export function CreateIngredientPage() {
  return (
    <DestinationSurface title={g.title} blurb={g.blurb}>
      <div className="grid gap-12 md:grid-cols-[16rem_1fr]">
        <ImagePlaceholder className="aspect-[3/4] w-full" />
        <div>
          <p className="max-w-xl text-sm leading-relaxed text-ivory/55">{g.note}</p>
          <div className="mt-8 max-w-md divide-y divide-ivory/10">
            <ComingSoonRow label={g.describe} />
            <ComingSoonRow label={g.photo} />
            <ComingSoonRow label={g.camera} />
            <ComingSoonRow label={g.review} />
            <ComingSoonRow label={g.add} />
          </div>
        </div>
      </div>
    </DestinationSurface>
  );
}
