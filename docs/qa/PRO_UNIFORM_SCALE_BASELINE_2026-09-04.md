# PRO uniform-scale correction — current staging baseline

Measured before implementation on `https://staging.pinguinoai.com/pro/recipe`, 2026-09-04.
Measurements are CSS pixels from the same live recipe and use 1920×1080 as the ratio reference.

| viewport | mode                    |  logo |   row |  font | + button | grams width | column gap | right width | slider width | settings width | nav width |
| -------: | ----------------------- | ----: | ----: | ----: | -------: | ----------: | ---------: | ----------: | -----------: | -------------: | --------: |
|     1920 | desktop                 | 1.000 | 1.000 | 1.000 |    1.000 |       1.000 |      1.000 |       1.000 |        1.000 |          1.000 |     1.000 |
|     1728 | desktop                 | 1.000 | 1.000 | 1.000 |    1.000 |       1.000 |      1.000 |       1.000 |        1.000 |          1.000 |     1.000 |
|     1600 | desktop                 | 1.000 | 1.000 | 1.000 |    1.000 |       1.000 |      1.000 |       1.000 |        1.000 |          1.000 |     1.000 |
|     1440 | desktop                 | 1.000 | 1.000 | 1.000 |    1.000 |       0.962 |      0.960 |       1.000 |        0.946 |          0.966 |     1.000 |
|     1366 | desktop                 | 1.000 | 1.000 | 1.000 |    1.000 |       0.962 |      0.910 |       0.985 |        0.921 |          0.951 |     0.985 |
|     1280 | desktop                 | 1.000 | 1.000 | 1.000 |    1.000 |       0.962 |      0.853 |       0.922 |        0.822 |          0.889 |     0.922 |
|     1200 | desktop                 | 1.000 | 0.959 | 1.000 |    1.000 |       0.932 |      0.799 |       0.865 |        0.637 |          0.773 |     0.865 |
|     1100 | premature mobile chrome | 1.000 | 1.122 | 1.000 |    1.000 |       1.128 |          — |           — |            — |              — |         — |
|     1024 | premature mobile chrome | 1.000 | 1.122 | 1.000 |    1.000 |       1.128 |          — |           — |            — |              — |         — |

At 1100 and 1024 the right panel and desktop module navigation disappear and the fixed bottom
navigation appears. This is the discontinuity visible in the Owner QA screenshots.

The attached Retina captures were supplied at 2148×1196, 2972×2042, 2780×2060, 2764×2056,
3670×2048, 3290×2006 and 3204×2044 source pixels. Their local Desktop copies were unavailable
after the reported computer freeze, so the matrix above records the reproducible CSS viewports and
the source-pixel sizes separately rather than claiming an unverified device-pixel ratio.

## Mechanism decision

- Wrapper `transform: scale(...)`: rejected because fixed/sticky descendants acquire a transformed
  containing block and existing body portals would sit in a different scale space.
- Root rem/token scaling: rejected because accepted components contain many explicit px dimensions,
  SVG sizes and borders, so it cannot scale the whole interface uniformly.
- Root CSS `zoom`: selected. It participates in layout, is Baseline 2024 across current browsers,
  includes body portals, keeps pointer hit-testing native, and allows a single continuous factor.
  Viewport-measured portal coordinates are divided by that same factor before being written back as
  CSS coordinates.

## Post-correction acceptance

The accepted 1440 px composition remains the reference: 1280 px frame, 444 px right column,
11.52 px column gap, 136×48 px logo, 48 px recipe row, 12 px ingredient label, 28×32 px plus
button, 150×32 px complete grams control (including its 30 px lock cell), 278×26 px direction
rail, and a 444 px navigation/settings track. Wider viewports retain scale 1 and gain only
surrounding canvas. Below 1440, the one body
scale is `viewportWidth / 1440` until the true-mobile transition.

Automated evidence was captured with `scripts/captureProResponsiveFrame.mjs` against the rebased
local staging application. Ratios below are painted dimension/reference dimension. The acceptance
tolerance is 0.02; the worst measured delta was 0.0023.

| viewport |  scale |   logo |    row |   font | button |  grams |    gap |  right | slider | settings |    nav | pass |
| -------: | -----: | -----: | -----: | -----: | -----: | -----: | -----: | -----: | -----: | -------: | -----: | :--: |
|     1920 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 |   1.0000 | 1.0000 | yes  |
|     1728 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 |   1.0000 | 1.0000 | yes  |
|     1600 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 |   1.0000 | 1.0000 | yes  |
|     1440 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 |   1.0000 | 1.0000 | yes  |
|     1366 | 0.9486 | 0.9485 | 0.9485 | 0.9486 | 0.9482 | 0.9485 | 0.9479 | 0.9486 | 0.9483 |   0.9486 | 0.9486 | yes  |
|     1280 | 0.8889 | 0.8888 | 0.8887 | 0.8889 | 0.8886 | 0.8889 | 0.8889 | 0.8889 | 0.8882 |   0.8889 | 0.8889 | yes  |
|     1200 | 0.8333 | 0.8333 | 0.8333 | 0.8333 | 0.8332 | 0.8333 | 0.8333 | 0.8333 | 0.8323 |   0.8333 | 0.8333 | yes  |
|     1100 | 0.7639 | 0.7638 | 0.7637 | 0.7639 | 0.7636 | 0.7639 | 0.7639 | 0.7639 | 0.7623 |   0.7639 | 0.7639 | yes  |
|     1024 | 0.7111 | 0.7110 | 0.7110 | 0.7111 | 0.7111 | 0.7111 | 0.7109 | 0.7111 | 0.7090 |   0.7111 | 0.7111 | yes  |
|      960 | 0.6667 | 0.6666 | 0.6667 | 0.6667 | 0.6664 | 0.6667 | 0.6667 | 0.6667 | 0.6644 |   0.6667 | 0.6667 | yes  |

At every desktop viewport the two columns and desktop route navigation remained visible, the bottom
navigation remained absent, horizontal overflow and ingredient clipping were false, the picker
portal stayed within the viewport, and the shared dialog backdrop covered the viewport exactly.
At 959 px the intentional mobile composition activates: the right column hides and bottom navigation
appears. This 60 rem boundary keeps 1024 px tablet landscape and ordinary resized desktop windows in
the two-column pointer-oriented composition while preserving the existing portrait/mobile authority.

The seven supplied source captures were 2148×1196, 2972×2042, 2780×2060, 2764×2056, 3670×2048,
3290×2006 and 3204×2044 pixels. Because the originals and their browser metadata disappeared after
the computer freeze, acceptance also exercised their exact DPR=2 CSS equivalents — 1074×598,
1486×1021, 1390×1030, 1382×1028, 1835×1024, 1645×1003 and 1602×1022 — with zero ratio failures.
The DPR=2 mapping remains explicitly an inference, not recovered metadata.

Global-header route-transition QA also passed with zero failures: 8 viewports (1920, 1600, 1440,
1366, 1280, 1200, 1024 and 390) × 18 real routes. The header, hamburger, official logo, HOME | PRO
switch and account slot stayed within the 0.5 px invariant tolerance while the selected product and
route-specific module navigation changed normally.
