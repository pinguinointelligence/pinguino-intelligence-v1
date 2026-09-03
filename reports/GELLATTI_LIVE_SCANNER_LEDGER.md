# GELLATTI — LIVE SCANNER · EVIDENCE LEDGER

The continuous multi-product scanner: what was built, what is proven, and what is not.

## What it is

The existing Scanner resolves ONE product per mount and then PROFILES it — nutrition,
ingredients, allergens, the evidence gate. The live scanner asks a much smaller question,
many more times: **which product is in front of the lens?** The camera stays open, the
customer sweeps across their shopping, products lock green one after another, and "Koniec"
shows what was collected.

## The rule everything hangs on

> A syntactically valid barcode alone is NOT enough for a confirmed green product.

GREEN requires the whole chain: **valid decode → exact catalogue/SKU resolution → confirmed
product**. `lookupExactBarcode` (client) and `search_products_v1` (server) returning nothing
is the gate. A product that reads but does not resolve is still _collected_, as
`needs_resolution`, and handed to the existing deep flow — never named.

The same rule governs the paid rung: **the model identifies, the catalogue decides.**

## The layers

| Layer        | File                                       | Owns                                                   |
| ------------ | ------------------------------------------ | ------------------------------------------------------ |
| session      | `liveScanSession.ts`                       | what turns green, what is a duplicate (pure)           |
| recognition  | `liveRecognition.ts`                       | the cheapest-first ladder, capabilities injected       |
| wiring       | `liveScanController.ts`                    | frames → quality → best-frame window → session         |
| capabilities | `liveScanCapabilities.ts`                  | the production authorities behind the ladder           |
| surface      | `LiveMultiScanner.tsx`                     | camera, green lock, "Koniec", review, nested deep step |
| boundary     | `supabase/functions/product-identify-live` | "what is in this one frame?" — nothing else            |

Reused untouched: `createLiveFrameSource`, `scoreRgbaFrame`, `RollingBestFrameWindow`,
`getSharedBarcodeDecoder`, `lookupExactBarcode`, `searchProducts`, `LiveProductScanner`,
`hydrateIngredient` + `recipeStore.addIngredient`.

## The ladder

```
LOCAL BARCODE  → exact catalogue SKU                 → GREEN immediately   (0 paid calls)
LOCAL OCR      → catalogue match                     → GREEN on agreement  (0 paid calls)
BEST FRAME     → identification → catalogue          → GREEN on evidence   (1 paid call)
otherwise      → UNRESOLVED → keep scanning → deep/contribution flow
```

Fresh produce (BANANA, APPLE, STRAWBERRY) is a normal path, not an error.

## Cost controls

- every resolution memoised per identity **including misses** — an unknown product held in
  view costs one lookup, not one per frame
- paid rung throttled (1.2 s) and hard-capped (12 per sweep); one call per request
- local evidence short-circuits the model entirely, server-side as well as client-side
- one OCR worker per sweep, released on close — **counted** by test, not assumed
- telemetry per route: `LOCAL_BARCODE`, `LOCAL_OCR`, `CATALOG_MATCH`, `VISION_FALLBACK`,
  `VISION_RESOLVED`, `VISION_UNRESOLVED`, `UNKNOWN` — so vision calls per _successful_
  scan is derivable

## Defects found and fixed during the build

Every one of these was in code written earlier the same day, and every one was found by a
test rather than by reading.

1. **Fresh produce could never confirm.** Three agreeing observations at the throttled
   cadence spanned 2400 ms against a 2500 ms evidence window — a 100 ms margin. One
   skipped frame and the product never turned green. Window widened to 4000 ms and the
   relationship pinned against the throttle.
2. **The ladder alternated OCR and Vision**, pushing paid observations apart until the
   window lapsed. A rung that names something now keeps its turn while its evidence lives.
3. **Evidence was counted, not weighed.** A confident, catalogue-confirmed identification
   corroborated by text from the _same label_ is two independent readings; a second paid
   call buys nothing. One identification alone still needs a second look — never one frame.
4. **"Skanuj dalej" emptied the basket** — a new controller started from an empty session.
5. **A collected product became collectable again after 8 s**, producing a duplicate the
   recipe would silently reject. Suppression now lasts the sweep.
6. **The OCR worker was rebuilt per recognition.** An earlier commit claimed to have fixed
   this and had not: the worker is created _and terminated_ inside `startLabelOcr`.
   `createLabelOcrSession` now hands its lifetime to the caller.
7. **An unknown product cost the recipe.** Navigating to `/products/scan` abandoned the
   half-built draft. The deep Scanner is now a nested step that returns the product
   resolved, in place.

## The 15-point acceptance matrix

All fifteen are proven deterministically in `liveScanAcceptance.test.ts`, plus the combined
BANAN → OREO → MLEKO sweep. **Real-phone staging QA is a separate gate and is NOT claimed
by these tests** — camera permission, live preview, and a paid identification against the
deployed function can only be proven on a device.

## Deployment

`product-identify-live` v1 deployed to `tunabqqrwabacxjcxxkz`, `verify_jwt: true`. A pure
addition — no existing function was modified. Verified live: unauthenticated POST and GET
both return 401 before any model call; CORS preflight returns 200.
