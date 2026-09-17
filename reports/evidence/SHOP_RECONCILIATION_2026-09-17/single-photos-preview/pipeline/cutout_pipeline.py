"""Cut the owner's white-ground pouch photos into transparent 512 px web assets
that match the approved placeholder (public/shop/single-placeholder.png).

The photos are renders of the same pouch mock-up as the placeholder, on a
near-white ground WITH a soft cast shadow that the approved placeholder does not
have. A plain near-white flood fill would keep that shadow as a grey smudge.

Per photo, at full 1254 px resolution:
  1. ground     near-white pixels flood-filled from the image border only
  2. alignment  scale + offset laying the placeholder silhouette on the photo's
                shadow-free outline (top edge, both sides above the shadows)
  3. snap       walk the aligned outline; along each normal (±R px) score
                - above the shadows: the crossing of the border-flood boundary
                  (the crisp outline; strong features just inside, like the
                  tear-strip dots, cannot pull the contour in)
                - near the ground: the intensity step, favouring pouch -> darker
                  shadow (the rim), not the outer edge of the contact line
                dynamic programming picks one offset per outline point, changing
                by at most 1 px per px of outline (LAMBDA per px of change)
  4. fill       the snapped contour is filled solid (4x supersampled, so the
                edge is anti-aliased); holes are impossible by construction and
                checked anyway
  5. edge colour outside the pouch every pixel takes its nearest pouch colour,
                so the soft edge never blends in white ground or dark shadow
  6. output     premultiplied LANCZOS resample of the inverse alignment: the
                pouch lands where the placeholder's pouch sits in its 512 canvas

usage: python3 cutout3.py <placeholder.png>
"""

import hashlib
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
SRC = ROOT / 'src'
OUT = ROOT / 'out'
DBG = ROOT / 'debug'
OUT.mkdir(exist_ok=True)
DBG.mkdir(exist_ok=True)

JOBS = [
    ('PI-ING-000494.png', 'dextrose.png', 'GEL-DEX-500'),
    ('PI-ING-000496.png', 'fructose.png', 'GEL-FRU-500'),
    ('PI-ING-000456.png', 'inulin.png', 'GEL-INU-500'),
    ('PI-ING-002114.png', 'gellatti-stabilizer.png', 'GEL-STB-500'),
    ('PI-ING-001645.png', 'dried-egg-yolk.png', 'GEL-YOL-500'),
    ('PI-ING-000270.png', 'skimmed-milk-powder.png', 'GEL-SMP-500'),
    ('PI-ING-000260.png', 'cream-powder-42.png', 'GEL-CRP-500'),
]

NEAR_WHITE = 248  # min channel; the ground measures 252-255
UPPER_ROWS = (80, 650)  # side edges used for alignment: above every shadow/bulge
TOP_COLS = (250, 1000)  # top edge used for alignment: away from the round corners
R = 25  # snap search range along the normal, photo px
LAMBDA = 4.0  # cost per px of offset change between neighbouring outline points
MU = 0.08  # weak pull towards the aligned silhouette where the image is flat
SS = 4  # supersampling for the filled contour
SPLIT_Y = (900, 1000)  # photo rows: above -> border-flood boundary, below -> intensity step
BOUNDARY_PEAK = 20.0
DARKER_OUTWARD_WEIGHT = 0.5  # extra weight near the ground for pouch -> darker shadow steps
CANVAS = 512
PAD = 400


def disk(d):
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (d, d))


def core_box(alpha):
    ys, xs = np.where(alpha >= 128)
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def border_connected(mask):
    _, labels = cv2.connectedComponents(mask.astype(np.uint8), connectivity=4)
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    edge = edge[edge != 0]
    return np.isin(labels, edge) & mask.astype(bool)


def largest_component(mask):
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    if n <= 1:
        return mask.astype(bool)
    return labels == 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))


def warp(alpha, s, tx, ty, size):
    """photo_continuous = s * placeholder_continuous + t"""
    M = np.array([[s, 0, tx + 0.5 * s - 0.5], [0, s, ty + 0.5 * s - 0.5]], np.float32)
    return cv2.warpAffine(alpha, M, (size, size), flags=cv2.INTER_LINEAR, borderValue=0)


def edges(mask):
    r0, r1 = UPPER_ROWS
    c0, c1 = TOP_COLS
    rows = mask[r0:r1]
    left = np.argmax(rows, axis=1).astype(float)
    right = (mask.shape[1] - 1 - np.argmax(rows[:, ::-1], axis=1)).astype(float)
    top = np.argmax(mask[:, c0:c1], axis=0).astype(float)
    return left, right, top


def align(ph_alpha, rough):
    size = rough.shape[0]
    L, Rr, T = edges(rough)

    def err(s, tx, ty):
        l, r, t = edges(warp(ph_alpha, s, tx, ty, size) >= 0.5)
        return np.abs(np.concatenate([L - l, Rr - r, T - t]))

    best = None
    for s in np.arange(2.40, 2.53, 0.002):
        l, r, t = edges(warp(ph_alpha, s, 0, 0, size) >= 0.5)
        tx = float(np.median(np.concatenate([L - l, Rr - r])))
        ty = float(np.median(T - t))
        e = err(s, tx, ty).mean()
        if best is None or e < best[0]:
            best = (e, s, tx, ty)
    _, s, tx, ty = best
    for dx in np.arange(-1.5, 1.51, 0.25):
        for dy in np.arange(-1.5, 1.51, 0.25):
            e = err(s, tx + dx, ty + dy).mean()
            if e < best[0]:
                best = (e, s, tx + dx, ty + dy)
    _, s, tx, ty = best
    e = err(s, tx, ty)
    return s, tx, ty, float(e.mean()), float(np.percentile(e, 95)), float(e.max())


def outline_points(prior):
    contours, _ = cv2.findContours(prior.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(contours, key=cv2.contourArea)[:, 0, :].astype(np.float64)
    # uniform 1 px arc-length resampling of the closed contour
    closed = np.vstack([c, c[:1]])
    seg = np.hypot(*np.diff(closed, axis=0).T)
    arc = np.concatenate([[0], np.cumsum(seg)])
    n = int(arc[-1])
    t = np.linspace(0, arc[-1], n, endpoint=False)
    pts = np.stack([np.interp(t, arc, closed[:, 0]), np.interp(t, arc, closed[:, 1])], axis=1)
    # circular Gaussian smoothing for stable normals
    k = np.exp(-0.5 * (np.arange(-15, 16) / 4.0) ** 2)
    k /= k.sum()
    sm = np.stack([np.convolve(np.concatenate([pts[-15:, i], pts[:, i], pts[:15, i]]), k, 'valid') for i in (0, 1)], axis=1)
    tang = np.roll(sm, -1, axis=0) - np.roll(sm, 1, axis=0)
    tang /= np.linalg.norm(tang, axis=1, keepdims=True)
    normal = np.stack([tang[:, 1], -tang[:, 0]], axis=1)
    # outward: a few px along the normal must leave the silhouette
    probe = np.rint(sm + 4 * normal).astype(int)
    probe = np.clip(probe, 0, prior.shape[0] - 1)
    if prior[probe[:, 1], probe[:, 0]].mean() > 0.5:
        normal = -normal
    return sm, normal


def snap(image, sdf, base, normal):
    n = len(base)
    offsets = np.arange(-R, R + 1, dtype=np.float64)
    # step score |I(o + 0.5) - I(o - 0.5)| along each normal
    def sample(shift):
        xs = (base[:, 0:1] + (offsets[None, :] + shift) * normal[:, 0:1]).astype(np.float32)
        ys = (base[:, 1:2] + (offsets[None, :] + shift) * normal[:, 1:2]).astype(np.float32)
        return cv2.remap(image, xs, ys, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    step = sample(0.5) - sample(-0.5)  # > 0: brighter outward
    # Near the ground the true rim is pouch -> darker cast shadow; the outer
    # edge of a thin contact line (shadow -> bright ground) must not win.
    step_score = np.abs(step) + DARKER_OUTWARD_WEIGHT * np.maximum(-step, 0.0)

    # Above the shadows the border-flood boundary IS the crisp outline: score
    # its crossing, so strong features just inside the edge (the tear-strip
    # dots, the zipper) can never pull the contour inward. Near the ground,
    # where the cast shadows are, the intensity step decides (the rim).
    def sample_sdf(shift):
        xs = (base[:, 0:1] + (offsets[None, :] + shift) * normal[:, 0:1]).astype(np.float32)
        ys = (base[:, 1:2] + (offsets[None, :] + shift) * normal[:, 1:2]).astype(np.float32)
        return cv2.remap(sdf, xs, ys, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    boundary_score = BOUNDARY_PEAK * np.clip(1.0 - np.abs(sample_sdf(0.0)) / 2.0, 0.0, 1.0)
    upper = np.clip((SPLIT_Y[1] - base[:, 1]) / (SPLIT_Y[1] - SPLIT_Y[0]), 0.0, 1.0)[:, None]
    score = (
        upper * (boundary_score + 0.2 * np.abs(step))
        + (1.0 - upper) * step_score
        - MU * np.abs(offsets)[None, :]
    )

    # DP around 1.5 loops, keep the middle full loop (start-independent)
    m = len(offsets)
    steps = n + n // 2
    acc = score[0].copy()
    back = np.zeros((steps, m), np.int8)
    for k in range(1, steps):
        i = k % n
        cand = np.stack([
            np.concatenate([[-np.inf], acc[:-1]]) - LAMBDA,  # came from o-1
            acc,  # same offset
            np.concatenate([acc[1:], [-np.inf]]) - LAMBDA,  # came from o+1
        ])
        choice = np.argmax(cand, axis=0)
        acc = cand[choice, np.arange(m)] + score[i]
        back[k] = choice - 1
    path = np.zeros(steps, np.int64)
    path[-1] = int(np.argmax(acc))
    # `back` stores -1/0/+1: the previous point's offset index is o - 1 / o / o + 1
    for k in range(steps - 1, 0, -1):
        path[k - 1] = path[k] + back[k][path[k]]
    start = n // 4
    idx = np.array([(start + j) % n for j in range(n)])
    chosen = np.empty(n, np.int64)
    for j in range(n):
        chosen[idx[j]] = path[start + j]
    # sub-pixel refinement by parabola through the chosen score and neighbours
    i = np.arange(n)
    o = chosen
    s0 = score[i, o]
    sm1 = score[i, np.clip(o - 1, 0, m - 1)]
    sp1 = score[i, np.clip(o + 1, 0, m - 1)]
    denom = sm1 - 2 * s0 + sp1
    frac = np.where(np.abs(denom) > 1e-6, 0.5 * (sm1 - sp1) / denom, 0.0)
    frac = np.clip(frac, -0.5, 0.5)
    off = offsets[o] + frac
    pts = base + off[:, None] * normal
    return pts, off, score[i, o]


def bleed_colours(rgb, mask):
    inv = (~mask).astype(np.uint8)
    _, labels = cv2.distanceTransformWithLabels(inv, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.nonzero(mask)
    lut = np.zeros((int(labels.max()) + 1, 3), np.uint8)
    lut[labels[ys, xs]] = rgb[ys, xs]
    out = lut[labels]
    out[mask] = rgb[mask]
    return out


def main():
    placeholder = Path(sys.argv[1])
    ph_rgba = np.array(Image.open(placeholder).convert('RGBA'))
    ph_alpha = ph_rgba[..., 3].astype(np.float32) / 255.0
    report = {'placeholder_core_box': list(core_box(ph_rgba[..., 3])), 'R': R, 'lambda': LAMBDA, 'items': []}

    for src_name, out_name, sku in JOBS:
        rgb = np.array(Image.open(SRC / src_name).convert('RGB'))
        size = rgb.shape[0]
        ground = border_connected(rgb.min(axis=2) >= NEAR_WHITE)
        rough = largest_component(~ground)
        s, tx, ty, e_mean, e_p95, e_max = align(ph_alpha, rough)
        prior = warp(ph_alpha, s, tx, ty, size) >= 0.5

        image = cv2.GaussianBlur(rgb.min(axis=2).astype(np.float32), (0, 0), 0.8)
        base, normal = outline_points(prior)
        # signed distance to the border-flood boundary (positive inside)
        sdf = (cv2.distanceTransform(rough.astype(np.uint8), cv2.DIST_L2, 5)
               - cv2.distanceTransform((~rough).astype(np.uint8), cv2.DIST_L2, 5)).astype(np.float32)
        pts, off, strength = snap(image, sdf, base, normal)

        np.savez(DBG / f'{sku}_contour.npz', pts=pts, base=base, normal=normal, off=off)
        # solid fill, 4x supersampled -> anti-aliased coverage at full res
        big = np.zeros((size * SS, size * SS), np.uint8)
        poly = np.rint((pts + 0.5) * SS * 16 - 0.5 * 16).astype(np.int32)  # shift=4 sub-pixel bits
        cv2.fillPoly(big, [poly.reshape(-1, 1, 2)], 255, lineType=cv2.LINE_8, shift=4)
        coverage = cv2.resize(big, (size, size), interpolation=cv2.INTER_AREA)
        pouch = coverage >= 128
        filled = ~border_connected(~pouch)
        holes = int((filled & ~pouch).sum())
        pouch = largest_component(filled)

        # diagnostics
        dbg = rgb.copy()
        removed = rough & ~pouch
        dbg[removed] = (dbg[removed] * 0.35 + np.array([255, 0, 190]) * 0.65).astype(np.uint8)
        pe = cv2.morphologyEx(prior.astype(np.uint8), cv2.MORPH_GRADIENT, disk(3)).astype(bool)
        dbg[pe] = (0, 200, 0)
        oe = cv2.morphologyEx(pouch.astype(np.uint8), cv2.MORPH_GRADIENT, disk(3)).astype(bool)
        dbg[oe] = (0, 120, 255)
        Image.fromarray(dbg).save(DBG / f'{sku}_v3_outline.png')

        colour = bleed_colours(rgb, pouch)
        alpha = coverage.copy()
        rgba = Image.fromarray(np.dstack([colour, alpha])).convert('RGBa')
        padded = Image.new('RGBa', (size + 2 * PAD, size + 2 * PAD), (0, 0, 0, 0))
        padded.paste(rgba, (PAD, PAD))
        box = (tx + PAD, ty + PAD, tx + s * CANVAS + PAD, ty + s * CANVAS + PAD)
        small = padded.resize((CANVAS, CANVAS), Image.LANCZOS, box=box).convert('RGBA')
        arr = np.array(small)
        arr[arr[..., 3] == 0, :3] = 0
        dest = OUT / out_name
        Image.fromarray(arr).save(dest, optimize=True)
        data = dest.read_bytes()

        a_new = arr[..., 3] >= 128
        a_ph = ph_rgba[..., 3] >= 128
        item = {
            'sku': sku,
            'source': src_name,
            'out': out_name,
            'align': {'scale': round(s, 4), 'tx': tx, 'ty': ty, 'edge_err_mean': round(e_mean, 2),
                      'edge_err_p95': e_p95, 'edge_err_max': e_max},
            'snap_offset_px': {'min': round(float(off.min()), 1), 'max': round(float(off.max()), 1),
                               'at_limit': int((np.abs(off) >= R - 0.5).sum()), 'points': int(len(off))},
            'weak_edge_points(<4)': int((strength < 4).sum()),
            'holes_filled_px': holes,
            'shadow_removed_px': int(removed.sum()),
            'core_box_512': list(core_box(arr[..., 3])),
            'iou_vs_placeholder_512': round(float((a_new & a_ph).sum() / (a_new | a_ph).sum()), 4),
            'bytes': len(data),
            'sha256': hashlib.sha256(data).hexdigest(),
        }
        report['items'].append(item)
        print(json.dumps(item))

    (ROOT / 'report3.json').write_text(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
