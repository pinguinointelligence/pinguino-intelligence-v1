import { Link } from 'react-router';
import { ApplicationState } from '@/components/shared/ApplicationState';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import { applicationSecondaryClasses } from '@/components/ui/applicationControlStyles';
import { copy } from '@/copy/en';

const { notFound, notFoundV2 } = copy;

/**
 * 404 — Masterpiece Phase 6 (route consistency): wears the ONE canonical AppShell
 * (canonical hamburger first, then the wordmark) so a lost visitor keeps the full
 * navigation — never a dead-end screen — and the headline is PL-unified.
 */
export function NotFoundPage() {
  return (
    <div className="pro-studio-radius-system theme-pro-light">
      <DestinationSurface eyebrow={notFound.code} title={notFoundV2.headline}>
        <ApplicationState
          kind="empty"
          title="Ta strona nie istnieje"
          body="Adres mógł się zmienić albo link jest niepełny. Nawigacja Gellatti pozostaje dostępna powyżej."
          action={
            <Link to="/" className={applicationSecondaryClasses()}>
              {notFound.back}
            </Link>
          }
        />
      </DestinationSurface>
    </div>
  );
}
