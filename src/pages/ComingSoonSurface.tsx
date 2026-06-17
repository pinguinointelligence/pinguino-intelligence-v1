import { Link } from 'react-router';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { copy } from '@/copy/en';
import { ShellLayout } from '@/features/shell/ShellLayout';

/**
 * Placeholder destination (Phase 6C, Slice 1). The navigation framework is live;
 * the actual destination content lands in Slice 3. Kept on the black brand shell
 * so nav links never 404 and the premium chrome is consistent.
 */
export function ComingSoonSurface({ title }: { title: string }) {
  const cs = copy.comingSoon;
  return (
    <ShellLayout>
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <SectionLabel tone="ivory">{cs.eyebrow}</SectionLabel>
        <h1 className="mt-5 text-4xl font-light tracking-tight text-ivory">{title}</h1>
        <p className="mt-3 text-lg font-light text-ivory/70">{cs.headline}</p>
        <p className="mt-5 max-w-md text-sm leading-relaxed text-ivory/55">{cs.body}</p>
        <Link
          to="/"
          className="mt-9 rounded-full border border-ivory/20 px-5 py-2.5 text-sm text-ivory/80 transition-colors hover:bg-ivory/10 hover:text-ivory"
        >
          {cs.back}
        </Link>
      </div>
    </ShellLayout>
  );
}
