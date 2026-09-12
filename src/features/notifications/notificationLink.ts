/**
 * C-APP-09 finding — a notification opens where its subject lives now.
 *
 * Rejecting a Partner application, or asking the applicant for more
 * information, writes a notification whose link is `/work-with-us`. The
 * collaboration IA change turned that route into a redirect to Franchise, so
 * "Uzupełnij dane" took an applicant to the franchise page instead of their
 * application — which lives on `/partner`. Rows already stored keep the old
 * link, so the correction is made where links are read, for every row. The
 * writer is corrected separately (migration 20260910220000, READY / NOT APPLIED).
 */
const RETIRED_APPLICATION_ROUTE = '/work-with-us';
const APPLICATION_HOME = '/partner';

const pointsAtRetiredRoute = (link: string): boolean =>
  link === RETIRED_APPLICATION_ROUTE ||
  link.startsWith(`${RETIRED_APPLICATION_ROUTE}#`) ||
  link.startsWith(`${RETIRED_APPLICATION_ROUTE}?`);

/** The link to follow for a notification — only application links are moved. */
export function notificationLink(type: string, deepLink: string | null): string | null {
  if (!deepLink) return deepLink;
  if (type.startsWith('PARTNER_APPLICATION_') && pointsAtRetiredRoute(deepLink)) {
    return APPLICATION_HOME;
  }
  return deepLink;
}
