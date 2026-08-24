/**
 * NonProductionMarker — the ALWAYS-VISIBLE pink `TESTOWE / NIEPRODUKCYJNE` marker
 * (Agent 4 fixture/hardcode sweep, 2026-07-24). Modelled on `ReviewMarkedModule`
 * (the red owner-review marker), but for a different truth: this surface currently
 * serves NON-PRODUCTION data (fixtures / samples / demo presets / reference-derived
 * templates / decorative placeholders).
 *
 * Every marker is driven by the typed `nonProductionRegistry` entry: the badge
 * carries a native tooltip (and aria-label) naming the SOURCE FILE, the exported
 * IDENTIFIER, WHY the data is non-production and WHAT replaces it. Nothing is
 * removed or hidden: the marked content renders inside, fully functional.
 *
 * Two shapes:
 *  - `NonProductionMarker` — block wrapper: pink left border + badge header +
 *    optional note above the marked content;
 *  - `NonProductionBadge` — the compact standalone badge for tight spots
 *    (provenance lines, example tags).
 *
 * Presentation only — no store writes, no gating logic, no engine imports.
 */
import type { ReactNode } from 'react';
import {
  nonProductionItem,
  nonProductionTooltip,
  type NonProductionItemId,
} from './nonProductionRegistry';

export const NON_PRODUCTION_BADGE_LABEL = 'TESTOWE / NIEPRODUKCYJNE';

/**
 * Marker tone. The pink token flips automatically inside `.theme-pro-dark`
 * (like `--color-review`), but black-shell destinations such as /recipes
 * are dark WITHOUT that scope — they pass `tone="dark"` to use the
 * dark-calibrated `nonprod-soft` value explicitly.
 */
export type NonProductionTone = 'light' | 'dark';

const BADGE_TONE: Record<NonProductionTone, string> = {
  light: 'border-nonprod/40 bg-nonprod/10 text-nonprod',
  dark: 'border-nonprod-soft/40 bg-nonprod-soft/10 text-nonprod-soft',
};

const BORDER_TONE: Record<NonProductionTone, string> = {
  light: 'border-ink/10 border-l-nonprod bg-nonprod/[0.03]',
  dark: 'border-ivory/10 border-l-nonprod-soft bg-nonprod-soft/[0.04]',
};

const NOTE_TONE: Record<NonProductionTone, string> = {
  light: 'text-stone-600',
  dark: 'text-ivory/60',
};

/** Flask glyph — meaning carried by icon + text, never color alone. */
function FlaskGlyph() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      aria-hidden
    >
      <path
        d="M9 3h6M10 3v6l-5.2 9.1A1.6 1.6 0 0 0 6.2 21h11.6a1.6 1.6 0 0 0 1.4-2.9L14 9V3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The compact standalone pink badge. The tooltip (native `title` + `aria-label`)
 * carries source file + identifier + why + replacement from the registry.
 */
export function NonProductionBadge({
  itemId,
  tone = 'light',
}: {
  itemId: NonProductionItemId;
  tone?: NonProductionTone;
}) {
  const item = nonProductionItem(itemId);
  const tooltip = nonProductionTooltip(item);
  return (
    <span
      data-testid={`nonprod-badge-${itemId}`}
      data-nonprod-source={item.file}
      title={tooltip}
      aria-label={`${NON_PRODUCTION_BADGE_LABEL} — ${tooltip}`}
      className={`inline-flex shrink-0 cursor-help items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium tracking-[0.06em] uppercase ${BADGE_TONE[tone]}`}
    >
      <FlaskGlyph />
      {NON_PRODUCTION_BADGE_LABEL}
    </span>
  );
}

/**
 * The block marker: pink left border + badge header + optional short note above
 * the marked content. The content always renders — nothing is collapsed or
 * CSS-hidden (the marker states a truth; it never degrades the flow).
 */
export function NonProductionMarker({
  itemId,
  title,
  note,
  tone = 'light',
  children,
}: {
  itemId: NonProductionItemId;
  /** Optional surface title shown beside the badge. */
  title?: string;
  /** Optional one-line honest note under the header (defaults to the registry reason). */
  note?: string;
  tone?: NonProductionTone;
  children: ReactNode;
}) {
  const item = nonProductionItem(itemId);
  const noteText = note ?? item.reason;
  return (
    <div
      data-testid={`nonprod-marked-${itemId}`}
      className={`rounded-md border border-l-2 ${BORDER_TONE[tone]}`}
    >
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        {title ? (
          <span
            className={`text-[13px] font-medium ${tone === 'dark' ? 'text-ivory' : 'text-ink'}`}
          >
            {title}
          </span>
        ) : null}
        <NonProductionBadge itemId={itemId} tone={tone} />
      </div>
      {noteText ? (
        <p className={`px-4 pt-1 text-xs leading-relaxed ${NOTE_TONE[tone]}`}>{noteText}</p>
      ) : null}
      <div className="px-4 pt-2 pb-4">{children}</div>
    </div>
  );
}
