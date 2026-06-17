import { Link } from 'react-router';
import { IvoryLogoMark } from '@/components/shared/IvoryLogoMark';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { CharcoalPanel } from '@/components/ui/CharcoalPanel';
import { copy } from '@/copy/en';

const o = copy.studio.overall;
const m = copy.studio.metrics;
const SUBS = [m.technical, m.flavor, m.cost];

/**
 * @security Decorative only — no engine imports, no result prop, no real values.
 * The focal locked panel: it carries the single prominent "Unlock PI Pro" CTA
 * (Slice 2B, Q1). The CTA links to /subscription (no payment here, Q2); the DEV
 * demo/pro toggle in the Studio header remains the internal upgrade path.
 */
export function LockedScorePreview() {
  return (
    <CharcoalPanel padding="lg">
      <div className="flex items-center justify-between gap-4">
        <SectionLabel tone="ivory">{o.eyebrow}</SectionLabel>
        <span className="rounded border border-ivory/25 px-2 py-0.5 text-[0.625rem] font-medium tracking-[0.08em] text-ivory/60 uppercase">
          {copy.studio.locked.chip}
        </span>
      </div>

      <div className="mt-3">
        <span className="font-mono text-2xl font-medium text-ivory/40">—</span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-ivory/15 pt-4">
        {SUBS.map((label) => (
          <div key={label}>
            <span className="block text-[0.625rem] tracking-label text-ivory-soft uppercase">
              {label}
            </span>
            <span className="mt-1 block font-mono text-sm text-ivory/40">—</span>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-md border border-ivory/15 bg-ivory/[0.06] p-4">
        <IvoryLogoMark size={22} tone="ivory" className="mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm leading-snug text-ivory/80">{copy.studio.locked.cta}</p>
          <Link
            to="/subscription"
            className="mt-3 inline-flex items-center justify-center rounded-md bg-ivory px-5 py-2.5 text-sm font-medium text-shell transition-colors hover:bg-ivory/90"
          >
            {copy.gate.unlockCta}
          </Link>
        </div>
      </div>
    </CharcoalPanel>
  );
}
