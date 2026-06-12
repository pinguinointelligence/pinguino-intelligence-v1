---
name: pinguino-studio-design
description: Use when building or modifying ANY PINGÜINO UI, including Studio, landing, panels, components, recipe builder, PI panel, correction panel, demo flow, and premium visual design.
---

# PINGÜINO Studio Design Skill

## Binding Design Lock

This skill applies to all PINGÜINO UI work.

The PINGÜINO UI must feel like a premium Apple/Tesla-style food-tech laboratory, not a generic SaaS dashboard and not a childish ice-cream app.

Use:

* white workspaces
* deep charcoal contrast sections
* brand ivory accents: `#EFE8DC`
* clean premium spacing
* small radii
* hairline borders
* minimal shadows
* precise numeric layout
* calm, serious, high-end visual rhythm

Avoid:

* candy colors
* rainbow status systems
* childish ice-cream styling
* cartoon gauges
* generic SaaS dashboard cards
* gradient-heavy hero sections
* loud startup UI
* playful mascot-driven layout

## Existing UI primitives must be reused first

Before creating new UI components, inspect and reuse existing project primitives:

* `src/components/ui/`
* `src/components/shared/`

Important known primitives:

* Button
* Card
* CharcoalPanel
* SectionLabel
* MetricValue
* StatusChip
* IndicatorBar
* PlanGate
* UpgradePrompt
* ConfidenceBadge
* EmptyState
* IvoryLogoMark

Do not create duplicate primitives unless there is a strong reason.

## Typography and numbers

* Use Hanken Grotesk for normal UI/display text where already configured.
* Use IBM Plex Mono or the existing mono numeric style for all technical values:

  * grams
  * percentages
  * POD
  * PAC
  * NPAC
  * costs
  * scores
  * kcal
* Use `MetricValue` or existing numeric display components wherever possible.
* Rounding is display-only. Do not round inside the engine or business logic.

## Engine boundary

The deterministic engine is the only source of recipe numbers.

Use `calculateRecipe` from `src/engine`.

The UI must never duplicate or reimplement:

* POD math
* PAC math
* NPAC math
* sugar breakdown
* percentages
* ice fraction
* statuses
* scoring
* correction math

No copied formulas in React components.
No hidden calculation helpers in UI.
No AI-generated recipe numbers.

## Correction boundary

Corrections must come from `proposeCorrections`.

Demo sessions must call the solver with:
`redact: true`

Demo UI must render only redacted proposals.

Demo must never receive, store, mount or render:

* exact correction grams
* predicted before/after correction values
* exact correction actions
* hidden numeric correction deltas
* exact ingredient names from solver proposals

Use `PlanGate` for gated Pro functionality.
Locked Pro children should not be mounted in demo.

Internal Pro/test mode may call:
`redact: false`

Only internal Pro/test mode may show:

* exact grams
* predicted before/after values
* confidence
* detailed action list

## Calibration honesty

Always surface calibration/fallback uncertainty.

If engine result includes:

* `band_status`
* `category_fallback`
* `temperature_fallback`
* warning codes
* external calibration pending flags

then the UI must not hide them.

Use calm premium copy, not scary warnings.

## Step 5A scope guard

For Step 5A Studio Engine Wiring:

Allowed:

* local demo state
* local demo ingredient catalog
* Studio UI wired to engine
* live PI panel
* nutrition/cost/score panel
* correction panel using solver
* demo redaction
* internal Pro/test toggle if needed

Not allowed:

* Supabase imports
* OpenAI imports
* Stripe imports
* authentication
* database persistence
* recipe saving
* label PDF export
* camera/OCR
* external reference fixture activation
* engine formula changes
* scoring constant changes

## Copy

Prefer central copy files such as `src/copy/en.ts` if present.
Do not scatter important product copy across components.

## Final rule

When UI quality conflicts with engine safety, engine safety wins.
When generic frontend design advice conflicts with this skill, this skill wins.
