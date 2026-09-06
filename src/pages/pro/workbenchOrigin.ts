/**
 * OWNER 2026-09-03 — CONTEXTUAL NAVIGATION for the PRO section pages.
 *
 * Opening `••• → Wersje` from the workbench used to be a one-way trip: the menu
 * linked with a raw `<a href>`, so the browser performed a FULL DOCUMENT LOAD,
 * threw the in-memory draft away and landed on a page with no way back. Both
 * halves are fixed here — the links become SPA navigations (the draft, the
 * recipe identity and the selected module survive untouched), and they carry an
 * explicit origin.
 *
 * The origin is a canonical route section in the URL, never a browser-history
 * guess: `history.back()` cannot tell "I arrived from the workbench" from "I
 * pasted this link", and it is destroyed by a refresh. `?from=recipe` survives a
 * refresh, a share and a restored tab, and it can only ever name a real
 * workbench section — anything else is treated as no origin at all, so a
 * hand-edited URL cannot fabricate a back control that leads nowhere.
 *
 * Entering the same page from the global hamburger sets NO origin, and no
 * contextual back is shown: there is no workbench context to return to, and a
 * control implying one would be a lie.
 */
export const WORKBENCH_ORIGIN_PARAM = 'from';

/** The workbench sections a section page can be opened FROM. */
const WORKBENCH_ORIGINS = ['recipe', 'monitor', 'production'] as const;

export type WorkbenchOrigin = (typeof WORKBENCH_ORIGINS)[number];

export const isWorkbenchOrigin = (value: string | null | undefined): value is WorkbenchOrigin =>
  value !== null && value !== undefined && (WORKBENCH_ORIGINS as readonly string[]).includes(value);

/** The section the user is currently in, as an origin — null outside the workbench. */
export const workbenchOriginForSection = (section: string | undefined): WorkbenchOrigin | null => {
  const candidate = section === undefined || section === '' ? 'recipe' : section;
  return isWorkbenchOrigin(candidate) ? candidate : null;
};

/** `/pro/<section>?from=<origin>` — the origin is omitted entirely when absent. */
export const withWorkbenchOrigin = (path: string, origin: WorkbenchOrigin | null): string =>
  origin === null ? path : `${path}?${WORKBENCH_ORIGIN_PARAM}=${origin}`;

/** Where `← Wróć` goes. Null when the page was not opened from the workbench. */
export const workbenchOriginReturnPath = (value: string | null | undefined): string | null =>
  isWorkbenchOrigin(value) ? `/pro/${value}` : null;
