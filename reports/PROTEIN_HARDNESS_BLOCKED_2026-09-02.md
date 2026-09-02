# PROTEIN TWARDOŚĆ — investigation result
**2026-09-02 · owner-reported on staging · NOT a regression, and NOT caused by PR #121**

## Verdict first

Protein hardness is **deliberately blocked**, by a documented, science-backed,
owner-accepted decision from **2026-08-23** — three weeks before PR #121 and in a
different module. It was closed out with 1200 assertions that pin the inertness.
**Unblocking it requires an owner calibration decision, not a code change** —
the code says exactly that, in the comment that implements the block.

I changed nothing. The slider was not enabled.

## ROOT CAUSE

`src/features/recipe-direction/recipeDirectionTargets.ts` builds each Direction
axis and gates it on an *operational* qualification:

> "Operational means the COMPLETE −2/−1/0/+1/+2 matrix has produced a
> native-safe, applicable Preview (or an already-reached state) for this exact
> profile × temperature. A POD band alone is not proof that the current
> formulation route can honor it."

Two lists implement it:

| gate | contains `protein_gelato`? |
|---|---|
| `sweetnessOperational` | **YES** — added by `fe473590` "…qualify Protein **Sweetness**" |
| `softnessOperational` | **NO** — only `vegan_gelato`, `standard_gelato`, `sorbet` (−11/−12/−13) |

With `regulator.npac.cleanCenter` present but `softnessOperational` false, the
axis is published as **`blocked_science`**, and `ProfileDirectionAxes.tsx`
renders `disabled={status?.status !== 'working'}` → `data-regulator-state="unavailable"`.

Critically, the blocked branch never runs `bands.npac = targetBand`, so **no
hardness target is published to the Engine at all**. The control is not merely
greyed — there is nothing behind it to honour.

### Why it is blocked (verbatim from the implementation)

> PROTEIN HARDNESS stays BLOCKED, and deliberately so. Hardness is targeted
> through NPAC, i.e. freezing-point depression. Borrowing the Gelato
> NPAC→hardness calibration for Protein is not defensible: at an otherwise
> constant formulation, instrumental hardness rises **13.60 N → 47.66 N as
> protein goes 4 % → 10 %** (Applied Food Research 2(1) 100029, 2022,
> DOI 10.1016/j.afres.2021.100029, Table 1 / Fig. 2). The same NPAC therefore
> does NOT mean the same hardness in a high-protein mix, and no published
> controlled series reports NPAC/PAC alongside hardness for high-protein frozen
> desserts, so the protein-specific curve cannot be derived from the literature
> that exists. **Unblocking it would require an owner calibration decision, not
> a code change.**

## PREVIOUS WORKING AUTHORITY — the owner's memory is correct

| date | commit | what changed |
|---|---|---|
| before 2026-08-10 | — | **no operational gate existed.** Protein has approved NPAC data (`npac: {band:[33,42], cleanCenter:[39,41]}`, status `owner_approved_standard_physics_protein_v1`, noted "Standard Gelato serving physics reused by owner decision"), so hardness **did** work — on the reused Gelato curve. |
| 2026-08-10 | `d09d96b9` | `softnessOperational` introduced; protein excluded. The control still MOVED, but no NPAC band reached the Engine — it stopped having any effect, silently. |
| 2026-08-18 | `6557fb63` | the UI `disabled` gate added. The control became visibly inert — **this is when it became noticeable.** |
| 2026-08-23 | `04f9629f` | the scientific rationale documented in code. |
| 2026-08-23 | closeout | `reports/PROTEIN_FINAL_CLOSEOUT_2026-08-23.md` §6: "Hardness — `blocked_science`, and deliberately not unlocked"; acceptance row 4: "Sweetness **enabled, five levels**; Hardness **all five disabled** — the scientifically blocked axis is honestly unavailable in the UI"; **1200 checks that the Sweetness band is identical across all five hardness levels.** |

So it worked before **2026-08-10** on a borrowed calibration, appeared to work
until **2026-08-18**, and has been an accepted deliverable since **2026-08-23**.

## FIX

**None applied, deliberately.** Three independent reasons:

1. The block is an accepted owner deliverable with 1200 assertions pinning it.
   Enabling the axis would break that closeout contract.
2. The implementation states unblocking is an owner *calibration* decision.
3. Enabling it would target hardness through a calibration the cited literature
   shows does not transfer to high-protein mixes — the slider would move and the
   result would be wrong, which is worse than an honest refusal.

**It is unrelated to PR #121** (different module, predates it by three weeks,
and #121 leaves `protein_gelato` untouched by design).

## PROFILE MATRIX — measured

| profile | temp | SWEETNESS | HARDNESS |
|---|---|---|---|
| GELATO (`milk_gelato`) | −11 / −12 / −13 | working | **working** |
| SORBET | −11 / −12 / −13 | working | **working** |
| VEGAN (`vegan_gelato`) | −11 / −12 / −13 | working | **working** |
| **PROTEIN** (`protein_gelato`) | −11 / −12 / −13 | working | **blocked_science** |

Only Protein hardness is blocked; sweetness is independently adjustable on all
four, and no other profile is affected.

## SERVED PROOF — staging, live bundle `index-C8ubGEcy.js`

Extracted from the deployed minified source:

```js
// sweetness gate — protein PRESENT
s = r===`vegan_gelato`||r===`standard_gelato`||r===`protein_gelato`||r===`sorbet`&&(…)

// hardness gate — protein ABSENT
c = r===`vegan_gelato`||r===`standard_gelato`||r===`sorbet`&&
    (e.target_temperature_c===-11||e.target_temperature_c===-12||e.target_temperature_c===-13)
```

The served reason string is present verbatim: *"Brakuje zweryfikowanych danych
miękkości dla tej kategorii. Gellatti nie użyje danych z innego typu receptury."*

Served UI state on `/pro/recipe` (Gelato draft): both axes
`data-regulator-state="interactive"`. Switching the served product type to
Proteinowe could **not** be completed — see the blocker below.

## BLOCKING ROW — product type cannot be changed in served PRO

`visibleProductType` is pinned in both `pinguino-profile-preferences-v1` and
`pinguino-recipe`; the select reverts to `gelato` after a genuine React change
event, and still reverts after both keys are cleared and the page reloaded.
This blocked direct served observation of the Protein axis state (the bundle
extraction above is the substitute proof). Recorded separately in
`reports/PRO_PERSISTED_PRODUCT_TYPE_PINNED_2026-09-02.md`.

The owner's live draft was backed up before the attempt and **restored
byte-for-byte** (verified), then left untouched.

## What the owner must decide

Unblocking Protein hardness needs a **calibration decision**, one of:

1. **Approve reusing the Standard Gelato NPAC→hardness curve for Protein**
   explicitly — consistent with the existing `owner_approved_standard_physics_protein_v1`
   reuse of Gelato *serving physics*, but contradicting the cited hardness data.
2. **Supply a protein-specific NPAC→hardness calibration** (measured or owner-declared),
   which the axis would then subdivide the way Sweetness subdivides the Protein POD band.
3. **Leave it blocked** — the current, documented position.

Only option 2 makes the control both available and truthful.
