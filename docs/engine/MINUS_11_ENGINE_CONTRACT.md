# −11°C Engine Contract

**Contract revision:** `1A.5` · **Engine version:** `0.4.0` · **Config version:** `0.5.0`

This is the versioned, company-owned knowledge pack for the active **−11°C Engine**. It exists so a future AI/API layer has a single, stable set of guardrails to reason against. It is a companion to the locked math specification and the product masterplan:

- Math source of truth: [`PINGUINO_RECIPE_ENGINE_SPEC_V1.md`](../PINGUINO_RECIPE_ENGINE_SPEC_V1.md)
- Product context: [`PINGUINO_MASTERPLAN_V1.md`](../PINGUINO_MASTERPLAN_V1.md)
- AI/API rules companion: [`../ai/PINGUINO_AI_ENGINE_GUARDRAILS.md`](../ai/PINGUINO_AI_ENGINE_GUARDRAILS.md)

> **Ownership of numbers.** Every numeric value in this document is *owned by the deterministic engine* — `src/engine/config/*` — and re-exposed read-only by `src/engine/contracts/minus11EngineContract.ts`. This document **paraphrases**; the code is canonical. The drift tests in `src/engine/contracts/` fail if this contract and the engine ever disagree.

---

## 1. Active engine identity

There is exactly **one** active engine today: the **−11°C Engine**. It is the only engine that runs calculations; every recipe is computed on it.

## 2. Scope — −11°C only

This contract is **validated at −11°C only**. All confirmed numbers recovered from the planning history were measured on the −11°C serving setting, so every claim here is **−11°C only**.

**No validated −10°C, −12°C, or −13°C tests exist yet.** There are likewise no validated Fresh or storage/−18°C results. Future temperature profiles (for example −12°C, −13°C, Fresh, −18°C) are **labels only** — not implemented, not calibrated, and **not separate working engines yet**. Selecting one still computes on the −11°C Engine. A future temperature engine becomes real only when it has its own target temperature, ice anchors, and external-reference calibration fixtures, and is explicitly activated; until then it must not be presented as a working engine.

## 3. Versioning

The contract composes the engine identity rather than inventing an independent number:

- `engine_version` (`0.4.0`) — moves on any engine formula/pipeline change.
- `config_version` (`0.5.0`) — moves on any coefficient/target/normalization-basis change.
- `contract_revision` (`1A.5`) — moves on a change to what this contract promises or exposes (prose or shape), independent of engine math.

## 4. Working model — milk gelato, −11°C (seeded bands)

These are the **seeded** target ranges for milk gelato at −11°C (the only seeded band today). They are shown for reference; the authoritative values live in `src/engine/config/targets.ts`.

| Metric | Target range |
|---|---|
| POD (sweetness) | 12 – 17 |
| NPAC | 33 – 42 |
| Ice fraction % | 45 – 54.5 |
| Lactose % | 4 – 6 |
| Lactose sandiness risk | 5 – 9 |
| Fat % | 5 – 12 |
| Aerating protein % | 3 – 6 |
| Protein in solids % | 9 – 13 |
| Total solids % | 31 – 45 |
| Water % | 57 – 70 |
| Alcohol % | 0 – 2.5 (warn above 2.5) |

NPAC is normalized **per water mass** (canonical basis, config 0.5.0). The "ideal" zone is the centered fraction of each band (ideal-zone fraction `0.6`); values inside the band but outside that inner zone are "good".

## 5. Confirmed reference recipes (−11°C diagnostics)

Two external-reference recipes were recovered verbatim from the planning history and committed as diagnostic fixtures. The deterministic engine reproduces both recipes' POD, NPAC (per-water) and core composition exactly. These are **external-reference diagnostic probes at −11°C only — not seeded target bands**:

- **Chocolate #123** — `External Reference Chocolate #123 -11C` (chocolate gelato, −11°C).
- **Raspberry-428** — `External Reference Ultra-Fruit Raspberry-428 -11C` (ultra-fruit gelato, −11°C).

Reported findings that are **not** forced into the engine: the external reference's "aerating/in-solids protein" excludes cocoa protein, and ice fraction is anchor-pending. These remain documented diagnostics, never engine changes.

## 6. Ingredient influence (−11°C, directional)

Recovered directional behavior — qualitative guidance, not a calculator:

- **Sucrose** mainly raises **POD** (sweetness).
- **Dextrose** strongly raises **NPAC / freezing power** and moderately raises POD.
- **Skimmed milk powder** raises **solids, protein, lactose, and sandiness risk**.
- **Cream** raises **fat** but does **not** solve freezing.
- **Milk** mainly **dilutes** the mix.
- **Stabilizer** (e.g. tara gum) affects **texture**, with little visible effect on POD/NPAC.
- **Alcohol** strongly affects **freezing**; **do not blindly add dextrose** to "fix" a recipe whose alcohol already raises antifreeze.

## 7. Auto Fix behavior (the rules the solver guarantees)

- **Deterministic** — the same recipe always yields the same proposals.
- **Idempotent** — an **already balanced** recipe returns a **no-op** (zero proposals). **Repeated "Magic" clicks must not keep changing a fixed recipe**; repeated propose→apply **converges** to a fixed point.
- **Never reduce a locked, main, or hero ingredient.** In **Premium** and **Signature** modes the hero/main ingredient is **protected** from reduction by default.
- **Impossible balance is honest** — when a recipe cannot be balanced under its locked constraints, Auto Fix returns a **tradeoff / impossible** result (best possible under the current locked ingredients) and **never fakes perfection**.
- **No negative grams** — corrections never produce impossible amounts.

## 8. Product priority order

Auto Fix optimizes in this order (mirrors the engine's Golden Middle priority):

1. **Hero / taste** (feasibility & the main flavor)
2. **Structure**
3. **Freezing** (NPAC / ice)
4. **Sweetness** (POD)
5. **Lactose / sandiness**
6. **Cost** (later)

## 9. API forbidden behavior

A consuming AI/API layer **must not**:

- invent ingredient data;
- invent POD, PAC, or NPAC values;
- invent exact grams or correction values;
- manually calculate engine formulas in prompt text;
- answer exact corrections without solver output;
- claim support for temperatures that have not been tested (anything other than −11°C);
- call future temperature profiles separate, implemented engines.

The AI/API rules are detailed in [`../ai/PINGUINO_AI_ENGINE_GUARDRAILS.md`](../ai/PINGUINO_AI_ENGINE_GUARDRAILS.md).
