# P0 — PRO Workbench desktop tab anchor proof

Baseline commit: `7edd90ea14299f3af47364a6dc119cc2b0970179`

Implementation branch: `codex/gellatti-v2-1-staging-ui`

Scope: desktop horizontal anchor only. Runtime data, routes, panels and mobile behavior are unchanged.

## Rejected preview geometry

The V2.1 design preview used an independent viewport formula for the tab row:

```css
right: 12px;
width: calc((100% - 36px) / 2.65);
```

That formula is not the accepted Workbench grid and is excluded from the runtime port.

| Viewport | Tab left | Display-panel left | Drift | Tab width | Display width |
|---|---:|---:|---:|---:|---:|
| 1440×900 | 898.195 px | 908 px | −9.805 px | 529.805 px | 520 px |
| 1800×1000 | 1122.344 px | 1268 px | −145.656 px | 665.656 px | 520 px |

The growing left-edge error proves that the rejected row travelled independently of the display column.

## Corrected/locked runtime geometry

The accepted runtime binds both the header chrome and the body split to:

```text
minmax(0, 1.62fr) / minmax(400px, 1fr)
gap: var(--pro-workbench-gap)
```

The tab host is `col-start-2`, `row-start-1`, `w-full`. The four tab positions are equal subdivisions inside that column only.

| Viewport | Tab left | Display-panel left | Tab right | Display-panel right | Edge delta |
|---|---:|---:|---:|---:|---:|
| 1440×900 | 891.250 px | 891.250 px | 1411.195 px | 1411.195 px | 0 px / 0 px |
| 1800×1000 | 1114.563 px | 1114.563 px | 1768 px | 1768 px | 0 px / 0 px |

### Tab positions at 1440×900

| Tab | Left | Right | Width |
|---|---:|---:|---:|
| Receptura | 891.250 px | 1021.234 px | 129.984 px |
| Monitor | 1021.234 px | 1151.219 px | 129.984 px |
| Produkcja | 1151.219 px | 1281.203 px | 129.984 px |
| Etykieta | 1281.203 px | 1411.195 px | 129.992 px |

### Tab positions at 1800×1000

| Tab | Left | Right | Width |
|---|---:|---:|---:|
| Receptura | 1114.563 px | 1277.922 px | 163.359 px |
| Monitor | 1277.922 px | 1441.281 px | 163.359 px |
| Produkcja | 1441.281 px | 1604.641 px | 163.359 px |
| Etykieta | 1604.641 px | 1768 px | 163.359 px |

Switching `Receptura → Monitor → Produkcja → Etykieta` produced `0 px` movement of the tab container and all four tab positions at both viewports.

## Mobile non-regression

The exact 390×844 collapsed list and the opened ingredient sheet were captured from a detached, untouched `7edd90ea` worktree and from the implementation worktree.

- Collapsed list SHA-256 before/after: `cfc8e87fc09419d6594d180093637173fdcc4de5b08d589353a078dd54604d01`
- Ingredient sheet SHA-256 before/after: `b1af6f9fbfaea948c3bc4c8463e5e87232fea1292b176389d2c517783b9d3b46`
- Binary comparison: identical (`cmp` exit `0`) for both screenshots.

## Regression tests

Added `src/pages/pro/desktopTabAnchorContract.test.tsx` to lock:

- the same desktop grid/gap in header and Workbench body;
- the header tab host in column 2 at full column width;
- no viewport-wide `space-between`, `space-around`, `fixed` or `absolute` header distribution;
- the separate current mobile bottom-navigation contract.

Focused result: 4 test files, 20 tests passed.
