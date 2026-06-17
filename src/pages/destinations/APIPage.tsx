import { ComingSoonRow, DestinationSurface } from '@/components/shared/DestinationSurface';
import { copy } from '@/copy/en';

const a = copy.nav.api;

/** API destination (Phase 6C Slice 3) — informational only; no endpoints, no keys. */
export function APIPage() {
  return (
    <DestinationSurface title={a.title} blurb={a.blurb}>
      <p className="max-w-2xl text-sm leading-relaxed text-ivory/55">{a.note}</p>
      <div className="mt-10 grid gap-x-16 gap-y-2 sm:grid-cols-2">
        <div className="divide-y divide-ivory/10">
          <ComingSoonRow label={a.overview} />
          <ComingSoonRow label={a.shops} />
          <ComingSoonRow label={a.machines} />
        </div>
        <div className="divide-y divide-ivory/10">
          <ComingSoonRow label={a.partner} />
          <ComingSoonRow label={a.docs} />
          <ComingSoonRow label={a.status} />
        </div>
      </div>
    </DestinationSurface>
  );
}
