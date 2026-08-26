import type { SVGProps } from 'react';
import { cn } from '@/lib/cn';
import { PINGUINO_ICON_COLOR, type PinguinoIconColor } from './pinguinoIconTokens';

/**
 * THE canonical PINGÜINO icon set, drawn from the owner's approved reference
 * sheet (2026-08-24). One source, reused by desktop and mobile — only size and
 * layout change responsively.
 *
 * House rules, uniform across the whole set so it reads as one designer's hand:
 * a 24×24 grid, 1.75 stroke, round caps and round joins, no fills except the
 * few marks the reference draws solid (the sweetness nodes, the water droplet).
 * Colour comes from the shared tokens, never from an ad-hoc hex.
 *
 * NEVER emoji or Unicode glyphs — the Monitor previously used ❄ ◉ ◇ ⌘ ♧, which
 * render as whatever font the device happens to have.
 */

export interface PinguinoIconProps extends Omit<SVGProps<SVGSVGElement>, 'color'> {
  /** Overrides the icon's approved family colour. Use only for a deliberate
   * monochrome context; the default is the reference colour. */
  tone?: PinguinoIconColor | 'current';
}

function Icon({
  tone,
  defaultTone,
  className,
  children,
  ...props
}: PinguinoIconProps & { defaultTone: PinguinoIconColor; children: React.ReactNode }) {
  const resolved = tone ?? defaultTone;
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke={resolved === 'current' ? 'currentColor' : PINGUINO_ICON_COLOR[resolved]}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('size-5 shrink-0', className)}
      {...props}
    >
      {children}
    </svg>
  );
}

/* ─────────────────────────────────────────────────── monitor icons ── */

/** Sweetness — molecule: solid centre with four solid nodes on short arms. */
export function SweetnessIcon(props: PinguinoIconProps) {
  const fill = props.tone === 'current' ? 'currentColor' : PINGUINO_ICON_COLOR.redPink;
  return (
    <Icon {...props} defaultTone="redPink">
      <path d="M12 8.6V6.4M12 15.4v2.2M8.6 12H6.4M15.4 12h2.2" />
      <circle cx="12" cy="12" r="2.1" fill={fill} stroke="none" />
      <circle cx="12" cy="5" r="1.7" fill={fill} stroke="none" />
      <circle cx="12" cy="19" r="1.7" fill={fill} stroke="none" />
      <circle cx="5" cy="12" r="1.7" fill={fill} stroke="none" />
      <circle cx="19" cy="12" r="1.7" fill={fill} stroke="none" />
    </Icon>
  );
}

/** Hardness — plain geometric diamond outline. */
export function HardnessIcon(props: PinguinoIconProps) {
  return (
    <Icon {...props} defaultTone="blue">
      <path d="M12 3.6 20.4 12 12 20.4 3.6 12 12 3.6Z" />
    </Icon>
  );
}

/** Freezing — six-branch snowflake with paired side branches. */
export function FreezingIcon(props: PinguinoIconProps) {
  return (
    <Icon {...props} defaultTone="blueLight">
      <path d="M12 2.6v18.8M4.05 7.3l15.9 9.4M19.95 7.3 4.05 16.7" />
      <path d="M9.4 4.7 12 6.6l2.6-1.9M9.4 19.3 12 17.4l2.6 1.9" />
      <path d="m4.2 11.2.5-3.1 3-.9M19.8 12.8l-.5 3.1-3 .9" />
      <path d="m19.8 11.2-.5-3.1-3-.9M4.2 12.8l.5 3.1 3 .9" />
    </Icon>
  );
}

/** Water & solids — outlined circle holding a solid droplet. */
export function WaterSolidsIcon(props: PinguinoIconProps) {
  const fill = props.tone === 'current' ? 'currentColor' : PINGUINO_ICON_COLOR.blue;
  return (
    <Icon {...props} defaultTone="blue">
      <circle cx="12" cy="12" r="9.1" />
      <path
        d="M12 6.4c2.2 2.6 3.5 4.4 3.5 6.1a3.5 3.5 0 0 1-7 0c0-1.7 1.3-3.5 3.5-6.1Z"
        fill={fill}
        stroke="none"
      />
    </Icon>
  );
}

/** Fat & creaminess — outlined droplet with the internal cream swirl. */
export function FatCreaminessIcon(props: PinguinoIconProps) {
  return (
    <Icon {...props} defaultTone="orange">
      <path d="M12 2.9c4.1 4.8 6.4 8 6.4 11.1a6.4 6.4 0 0 1-12.8 0C5.6 10.9 7.9 7.7 12 2.9Z" />
      <path d="M7.9 14.3c1.1-1.6 2.4-1.6 3.4-.5 1 1.1 2.3 1.1 3.4-.6" />
    </Icon>
  );
}

/** Protein & structure — three nodes in a triangle, joined by struts. */
export function ProteinStructureIcon(props: PinguinoIconProps) {
  return (
    <Icon {...props} defaultTone="magenta">
      <path d="M12 6.9 6.6 15.6M12 6.9l5.4 8.7M8.4 16.9h7.2" />
      <circle cx="12" cy="5.1" r="2.1" />
      <circle cx="5.6" cy="17.2" r="2.1" />
      <circle cx="18.4" cy="17.2" r="2.1" />
    </Icon>
  );
}

/** Stability & risks — shield outline with an internal check. */
export function StabilityRisksIcon(props: PinguinoIconProps) {
  return (
    <Icon {...props} defaultTone="green">
      <path d="M12 2.8 4.6 5.7v5.6c0 4.4 3 8.2 7.4 9.9 4.4-1.7 7.4-5.5 7.4-9.9V5.7L12 2.8Z" />
      <path d="m8.6 11.9 2.4 2.4 4.4-4.6" />
    </Icon>
  );
}

/* ─────────────────────────────────────── ingredient category icons ── */

/** Favorites — heart outline. */
export function FavoritesIcon(props: PinguinoIconProps) {
  return (
    <Icon {...props} defaultTone="redPink">
      <path d="M12 20.1 4.9 13c-1.9-1.9-1.9-4.9 0-6.8a4.8 4.8 0 0 1 6.8 0l.3.3.3-.3a4.8 4.8 0 0 1 6.8 0c1.9 1.9 1.9 4.9 0 6.8L12 20.1Z" />
    </Icon>
  );
}

/** Fresh — two-leaf sprout. */
export function FreshIcon(props: PinguinoIconProps) {
  return (
    <Icon {...props} defaultTone="green">
      <path d="M4.2 20.1c2.6-5.3 6.4-9 11.4-11.1" />
      <path d="M12.3 12.2C10.6 8.9 11.9 5.2 15 3.3c1.9 3.1 1.6 6.7-1.1 8.7-.5.4-1.1.2-1.6.2Z" />
      <path d="M11.1 13.6c-3.4.9-6.5-.9-7.4-4.4 3.3-1.1 6.4.2 7.5 3.2.2.5-.1 1.1-.1 1.2Z" />
    </Icon>
  );
}

/** Dairy — milk bottle outline. */
export function DairyIcon(props: PinguinoIconProps) {
  return (
    <Icon {...props} defaultTone="blue">
      <path d="M9.4 2.9h5.2" />
      <path d="M10 2.9v3.2L7.9 9.8v9.4c0 1 .8 1.9 1.9 1.9h4.4c1.1 0 1.9-.9 1.9-1.9V9.8L14 6.1V2.9" />
      <path d="M7.9 11.6h8.2" />
    </Icon>
  );
}

/** Dry — the reference's circular dot grid. */
export function DryIcon(props: PinguinoIconProps) {
  const cols = [7, 12, 17];
  const rows = [7, 12, 17];
  return (
    <Icon {...props} defaultTone="brown">
      {rows.map((cy) => cols.map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.5" />))}
    </Icon>
  );
}

/** Chocolate — segmented bar with the broken/wavy bottom edge. */
export function ChocolateIcon(props: PinguinoIconProps) {
  return (
    <Icon {...props} defaultTone="brown">
      {/* Straight top and sides, broken/wavy bottom edge — a bar in the act of
          being snapped, exactly as the reference draws it. */}
      <path d="M4.8 3.6h14.4v11.1c-1.2 0-1.8 1.5-3 1.5s-1.6-1.3-2.8-1.3-1.7 2-2.9 2-1.6-1.9-2.8-1.9-1.6 1.4-2.9 1.4V3.6Z" />
      <path d="M9.6 3.6v11.6M14.4 3.6v11.3" />
      <path d="M4.8 7.4h14.4M4.8 11.2h14.4" />
    </Icon>
  );
}

/** Fruits — one compact category mark combining apple, grapes and citrus. */
export function FruitsIcon(props: PinguinoIconProps) {
  return (
    <Icon {...props} defaultTone="redPink" data-fruit-category-symbol="apple-grapes-citrus">
      {/* Apple: the larger anchor shape keeps the mark readable in a 16 px row slot. */}
      <path d="M8.7 7.4C6.8 6.2 4 7.3 3.8 10.2c-.2 3.7 2.6 8.2 5.1 8.2 1.1 0 1.7-.7 2.7-.7.5 0 .9.1 1.3.3" />
      <path d="M8.7 7.3c-.1-1.8.8-3.2 2.4-4.1M8.7 5.7C7 5.5 6 4.7 5.8 3.3c1.7-.1 3 .5 3.5 1.8" />

      {/* Small grape cluster: five precise outline nodes, never a single-fruit avatar. */}
      <path d="M15.8 3.8c.8-.9 1.9-1.2 3.1-.7" />
      <circle cx="15.7" cy="5.3" r="1.15" />
      <circle cx="18.5" cy="5.7" r="1.15" />
      <circle cx="15" cy="8" r="1.15" />
      <circle cx="17.8" cy="8.5" r="1.15" />
      <circle cx="16.4" cy="10.7" r="1.15" />

      {/* Citrus slice: clean segmented outline, tucked into the lower-right corner. */}
      <circle cx="17.4" cy="16.6" r="4.1" />
      <path d="M17.4 12.5v4.1l3.5-2M17.4 16.6l2.8 3M17.4 16.6l-3.7 1.8" />
    </Icon>
  );
}

/** Nuts — almond outline with internal grain lines. */
export function NutsIcon(props: PinguinoIconProps) {
  return (
    <Icon {...props} defaultTone="orange">
      {/* Pointed almond, tips on the 45° diagonal, with the grain lines
          following the long axis — the reference silhouette, not a blob. */}
      <path d="M19 5c2.6 2.6.6 8.4-3.3 12.3S6 22.6 3.4 20 5.4 11.6 9.3 7.7 16.4 2.4 19 5Z" />
      <path d="M16.4 7.6c-2.6 1.2-6.1 4.7-7.3 7.3M18 10.7c-2.1 1-5 3.9-6 6M13.5 5.6c-1.9.9-4.5 3.5-5.4 5.4" />
    </Icon>
  );
}

/** Pastes — jar with lid and the curved paste mark. */
export function PastesIcon(props: PinguinoIconProps) {
  return (
    <Icon {...props} defaultTone="magenta">
      <path d="M5.4 7.4c0-1.4 2.9-2.5 6.6-2.5s6.6 1.1 6.6 2.5-2.9 2.5-6.6 2.5-6.6-1.1-6.6-2.5Z" />
      <path d="M5.4 7.4v9.9c0 1.4 2.9 2.5 6.6 2.5s6.6-1.1 6.6-2.5V7.4" />
      <path d="M8.3 14.5c1.2-1.3 2.5-1.3 3.7 0s2.5 1.3 3.7 0" />
    </Icon>
  );
}
