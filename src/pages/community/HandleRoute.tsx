import { useParams } from 'react-router';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { isHandlePath } from '@/features/community/domain/creatorHandle';
import { CreatorProfilePage } from './CreatorProfilePage';
import { PublicRecipePage } from './PublicRecipePage';

/**
 * The `/@handle` namespace gate.
 *
 * React Router params occupy a WHOLE path segment, so `/@:handle` does not
 * match anything — the `@` cannot be a literal prefix inside a dynamic
 * segment. The route is therefore declared as `/:handle`, and this component
 * is what makes that safe:
 *
 *   * a path must start with `@` to be a handle at all, so `/marysia` is a
 *     404 exactly as it was before this feature existed;
 *   * the remainder must pass `validateHandle`, which rejects reserved words —
 *     so `/@admin` and `/@share` 404 here as well as being unclaimable in the
 *     database;
 *   * anything else falls through to the normal not-found page.
 *
 * Static routes still win: React Router ranks a literal segment above a
 * dynamic one regardless of declaration order, so `/recipes`, `/pro` and
 * `/community` are matched by their own routes and never reach this gate.
 * `communityRoutes.test.tsx` pins that with real route matching rather than
 * trusting the description.
 */
export function CreatorHandleRoute() {
  const { handle = '' } = useParams();
  return isHandlePath(handle) ? <CreatorProfilePage /> : <NotFoundPage />;
}

export function PublicRecipeRoute() {
  const { handle = '' } = useParams();
  return isHandlePath(handle) ? <PublicRecipePage /> : <NotFoundPage />;
}
