# Global header geometry repair

## Root cause

The application shell owned only menu/logo/PRO, while calculation status, AI and module tabs were mounted inside the right workbench panel. Desktop and mobile panel subtrees could both exist, producing misplaced hierarchy and duplicate semantic IDs. The official logo also used a fixed width without a height-aware lockup constraint.

## Result

The global workbench chrome now follows the Owner reference order: menu → exact official Gellatti logo → PRO → calculation status → one AI action → Receptura/Monitor/Produkcja/Etykieta. Desktop uses one tablist with an orange active underline. Compact widths use one accessible cockpit switch instead of squeezing the desktop strip. Desktop/mobile tab ID prefixes are distinct.

The logo asset was not modified. SHA-256: `b1c85e5a47fb25ab296668e17a04f33df56d6701aba4525d2fd9ee6fd72b7721`.

| Viewport | Status count | AI count | Tab-strip/module access count | Overflow | Collision/duplicate IDs | Status |
|---|---:|---:|---:|---|---|---|
| 1920×1080 | 1 | 1 | 1 | None | None | PASS |
| 1600×900 | 1 | 1 | 1 | None | None | PASS |
| 1440×900 | 1 | 1 | 1 | None | None | PASS |
| 1366×768 | 1 | 1 | 1 | None | None | PASS |
| 1280×720 | 1 | 1 | 1 | None | None | PASS |
| 1024×768 | 1 | 1 | 1 compact | None | None | PASS |
| 390×844 | 1 | 1 | 1 compact | None | None | PASS |

At 390 px the menu target is exactly 44×44 px, header gaps are non-negative, and the sheet close target remains accessible. ArrowLeft/ArrowRight/Home/End, roving tab index, labelled tabpanels, focus trap and Escape were independently checked.
