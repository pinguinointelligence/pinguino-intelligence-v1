/**
 * ONE date authority for every saved-recipe surface (owner defect v1.4).
 *
 * The owner screenshot showed „Moje receptury" reporting ZAKTUALIZOWANO 23.08.2026 while the
 * „Wersje" tab of the SAME recipe showed „22.08.2026 · v1". No version was missing: the recipe was
 * saved once at 2026-08-22T23:29:59.494Z and the two surfaces formatted that one instant with two
 * different calendars — the library through `new Date(iso).toLocaleDateString('pl-PL')` (the
 * viewer's local day, 23.08 in Europe/Warsaw) and the versions tab by slicing the UTC ISO date
 * (22.08). Two formatters, one instant, two dates.
 *
 * Rule: every saved-recipe date the user reads goes through THIS function. „Kiedy zapisałem" is a
 * question about the user's own calendar, so the local day is the single answer; a saved date can
 * never disagree with itself across surfaces again.
 */

/** `DD.MM.YYYY` in the viewer's local calendar. Invalid/absent input renders as `—`. */
export function formatSavedRecipeDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso.slice(0, 10);
  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${parsed.getFullYear()}`;
}
