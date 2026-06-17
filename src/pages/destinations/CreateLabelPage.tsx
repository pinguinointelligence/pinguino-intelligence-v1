import { ComingSoonRow, DestinationSurface } from '@/components/shared/DestinationSurface';
import { copy } from '@/copy/en';

const l = copy.nav.label;

/** Create Label destination (Phase 6C Slice 3) — informational only; no PDF/export. */
export function CreateLabelPage() {
  return (
    <DestinationSurface title={l.title} blurb={l.blurb}>
      <p className="max-w-2xl text-sm leading-relaxed text-ivory/55">{l.note}</p>
      <div className="mt-10 max-w-md divide-y divide-ivory/10">
        <ComingSoonRow label={l.nutrition} />
        <ComingSoonRow label={l.production} />
        <ComingSoonRow label={l.statement} />
        <ComingSoonRow label={l.allergen} />
        <ComingSoonRow label={l.export} />
      </div>
    </DestinationSurface>
  );
}
