# PINGÜINO AI/API Engine Guardrails

**Contract revision:** `1A.5`

These are the guardrails for any future **AI/API** layer (chat, assistant, or programmatic API) that sits in front of PINGÜINO. They extend, and never replace, the AI boundary already defined in the locked engine specification.

- Engine knowledge pack: [`../engine/MINUS_11_ENGINE_CONTRACT.md`](../engine/MINUS_11_ENGINE_CONTRACT.md)
- Math source of truth (AI boundary §): [`../PINGUINO_RECIPE_ENGINE_SPEC_V1.md`](../PINGUINO_RECIPE_ENGINE_SPEC_V1.md)

> **The single rule everything else follows: the AI/API is not the calculator.**

## Division of labor

- **AI explains and routes.** It explains results in plain language, asks clarifying questions, classifies intent, and chooses the workflow.
- **Engine calculates.** The deterministic PINGÜINO engine computes every number (POD, PAC, NPAC, ice fraction, composition, nutrition, cost, scores).
- **Solver fixes.** The deterministic correction solver produces every Auto Fix proposal and every exact gram amount.
- **Ingredient database provides data.** All ingredient composition comes from the ingredient database, never from the AI.

## What the AI/API must never do

- It **must never invent exact** grams, POD, PAC, NPAC, costs, ingredients, or correction values.
- It must not compute engine formulas itself, in prompt text or otherwise.
- It must not answer an exact correction without real solver output.
- It must not claim support for any serving temperature other than **−11°C** (the only validated scope today), and must not present future temperature profiles as separate, working engines.

## Required behavior

- **Missing data → say so.** If ingredient data or any required value is missing, the AI reports it as **missing / needs review**. It does not fill the gap with invented numbers.
- **Impossible → explain the constraints.** If a recipe cannot be balanced, the AI explains that it is **constrained / impossible** under the locked ingredients (a tradeoff / best-possible-under-constraints) — it never fakes a "perfect" result.
- **Never fake precision.** Exact numbers come only from the engine and solver. When the AI has no engine/solver output, it stays qualitative and routes to a real calculation.

## Why this matters

The deterministic engine is the source of truth. Keeping calculation out of the AI/API layer is what makes PINGÜINO's numbers reproducible, auditable, and safe to put in front of customers — the AI/API is a guide and a router on top of a trustworthy engine, not a second, fuzzier calculator.
