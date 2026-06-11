# src/components/shared — product components

Design Lock–compliant product primitives (Masterplan §3, §5, §10, §16):

- `SectionLabel` — uppercase wide-tracked label echoing the wordmark
- `MetricValue` — mono tabular laboratory numbers (grams, %, POD/PAC)
- `StatusChip` + `status.ts` — muted PI status vocabulary (shared label/color maps)
- `IndicatorBar` — linear lab range bar with target zone and tick marker
- `PlanGate` — the single gating primitive; locked children are **never mounted**
  (redact-at-source, Masterplan §10)
- `UpgradePrompt` — premium upgrade card (no payment logic; Stripe arrives Phase 4)
- `ConfidenceBadge` — ingredient confidence levels per Masterplan §16
- `EmptyState` — minimal premium empty state
- `IvoryLogoMark` — interim SVG mark (replace path with official mark, risk #10)

`components.test.tsx` covers the PlanGate redaction contract and the mapping logic.
