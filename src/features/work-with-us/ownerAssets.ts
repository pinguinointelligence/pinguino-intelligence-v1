/**
 * WORK WITH US — the owner's final visual assets.
 *
 * These 13 PNGs are the VISUAL AUTHORITY (owner, 2026-08-31). They are stored
 * unmodified in `public/images/work-with-us/` — byte-identical to the files the
 * owner delivered — and served from `public/images/work-with-us/web/` as WebP
 * derivatives, because the originals total 27 MB and would make these pages
 * unusable. The derivative is the SAME image re-encoded for delivery; nothing is
 * recomposed, recoloured, cropped or regenerated, and the Gellatti logo visible
 * inside the photographs is untouched.
 *
 * `alt` is Polish because these routes are Polish, and describes what is
 * actually in the frame rather than what we wish were there.
 *
 * WHERE THE MANIFEST AND THE DELIVERED FILE DISAGREE, the delivered file wins
 * and the disagreement is recorded on the entry. Three do:
 *   A04 — manifest said "Machines hero"; the image contains no machine.
 *   A06 — manifest said "writer persona, 4:3"; the image is a trailer at 16:9.
 *   W01 — manifest said "/machines hero"; the image is an equipment close-up.
 */

export type OwnerAssetId =
  | 'A01' | 'A02' | 'A03' | 'A04' | 'A05' | 'A06' | 'A07'
  | 'F01' | 'F03'
  | 'W01' | 'W02' | 'W03' | 'W04';

export interface OwnerAsset {
  readonly id: OwnerAssetId;
  /** Intrinsic size of the ORIGINAL, so layout can reserve the right box. */
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}

const A = (id: OwnerAssetId, width: number, height: number, alt: string): OwnerAsset =>
  Object.freeze({ id, width, height, alt });

export const OWNER_ASSETS: Readonly<Record<OwnerAssetId, OwnerAsset>> = Object.freeze({
  // ── Partner ───────────────────────────────────────────────────────────────
  A01: A('A01', 1672, 941,
    'Twórczyni nagrywa telefonem degustację lodów Gellatti w jasnej kuchni; obok laptop i wanienka z gelato.'),
  A02: A('A02', 1448, 1086,
    'Kobieta przy biurku planuje treści na tablicy „Content plan”, obok kubek Gellatti i lody w kubeczku.'),
  A03: A('A03', 1448, 1086,
    'Twórca nagrywa telefonem na statywie polewanie lodów, przed nim witryna z pojemnikami gelato.'),
  A04: A('A04', 1536, 1024,
    'Lodziarz nakłada gelato dla klientki, na blacie laptop z otwartą aplikacją Gellatti.'),

  // ── Mobile equipment ──────────────────────────────────────────────────────
  A05: A('A05', 1672, 941,
    'Biały wózek Gellatti z parasolem na nadmorskim tarasie; obsługa podaje kubeczek lodów gościowi.'),
  W02: A('W02', 1448, 1086,
    'Biały wózek Gellatti pod markizą na przyjęciu przy jeziorze; obsługa podaje rożek pannie młodej.'),

  // ── Trailer ───────────────────────────────────────────────────────────────
  A06: A('A06', 1672, 941,
    'Przyczepa Gellatti w bieli i grafitcie na szarym tle studyjnym, z otwartą klapą i witryną.'),
  A07: A('A07', 1672, 941,
    'Przyczepa Gellatti na nadmorskim tarasie o zachodzie słońca; dwie osoby obsługi wydają lody gościom.'),
  W03: A('W03', 1448, 1086,
    'Aluminiowa przyczepa Gellatti na dwóch osiach, holowana samochodem na festiwalu food trucków.'),

  // ── Franchise ─────────────────────────────────────────────────────────────
  F01: A('F01', 1672, 941,
    'Wnętrze lodziarni Gellatti: długa witryna z pozzetti, neon „gellattissimo”, stoliki dla gości.'),
  F03: A('F03', 1672, 941,
    'Witryna lodziarni Gellatti o zmierzchu przy brukowanej uliczce, z podświetlonym szyldem.'),
  W04: A('W04', 1448, 1086,
    'Wnętrze lodziarni Gellatti z widokiem na dziedziniec z ogródkiem; obsługa nakłada lody.'),

  // ── Equipment craft ───────────────────────────────────────────────────────
  W01: A('W01', 1448, 1086,
    'Zbliżenie: dłonie w rękawiczkach nakładają żółte gelato z pozzetti do wafla.'),
});

/** Unmodified original — the authority. */
export const ownerAssetOriginal = (id: OwnerAssetId): string =>
  `/images/work-with-us/${id}.png`;

/** WebP delivery derivative at ~1600px, and the ~800px variant for small screens. */
export const ownerAssetWeb = (id: OwnerAssetId): string =>
  `/images/work-with-us/web/${id}.webp`;
export const ownerAssetWebSmall = (id: OwnerAssetId): string =>
  `/images/work-with-us/web/${id}@800.webp`;
