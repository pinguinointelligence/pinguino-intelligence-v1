import { Link } from 'react-router';
import { copy } from '@/copy/en';
import { AppShell } from '@/features/shell/AppShell';

const { notFound, notFoundV2 } = copy;

/**
 * 404 — Masterpiece Phase 6 (route consistency): wears the ONE canonical AppShell
 * (logo left, hamburger right) so a lost visitor keeps the full navigation — never a
 * dead-end screen — and the headline is PL-unified (one language per customer view).
 */
export function NotFoundPage() {
  return (
    <AppShell>
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
        <p className="font-mono text-xs text-stone-400">{notFound.code}</p>
        <h1 className="mt-4 text-3xl font-light tracking-tight">{notFoundV2.headline}</h1>
        <Link
          to="/"
          className="mt-10 text-sm text-stone-600 underline decoration-stone-300 underline-offset-4 transition-colors hover:text-ink"
        >
          {notFound.back}
        </Link>
      </div>
    </AppShell>
  );
}
