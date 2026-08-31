# Main capability → HOME add action — MATRIX

Required before merging #67. Derived from the authority itself, at **both** layers, not
from observed behaviour. HOME contains no mapping of its own beyond the three categories
the owner defined.

## The capability enum is closed at four values

**Server** — `public.main_capability_v1` assigns exactly these to its `capability` field:

```
MAIN_CAPABLE   MAIN_CAPABLE_UNCALIBRATED   MAIN_TECHNICAL_BLOCKED   MAIN_UNKNOWN
```

**Client** — `MainCapabilityState` in `src/features/product-intelligence/mainCapability.ts`
declares the same four. A test asserts the union contains exactly four `MAIN_` members, so
a fifth cannot appear without failing until this matrix is revisited.

Three further `MAIN_*` literals appear in the same server function — `MAIN_ALLOWED`,
`MAIN_BLOCKED_POLICY`, `MAIN_PROFILE_SPECIFIC` — but those belong to `mainClassification`,
a **different field**. They are inputs to the capability decision, never its output. This
distinction is the reason the matrix is stated from the `capability` assignment rather
than from a text scan.

## The matrix

| canonical state | current authority? | Crown permitted? | HOME action | category |
| --- | --- | --- | --- | --- |
| `MAIN_CAPABLE` | yes | yes — calibrated envelope | existing Crown flow, no prompt | **A** |
| `MAIN_CAPABLE_UNCALIBRATED` | yes | yes — user-held Main | existing Crown flow, no prompt | **A** |
| `MAIN_TECHNICAL_BLOCKED` | yes | **definitively no** | ask for explicit grams before the line | **B** |
| `MAIN_UNKNOWN` | **no** | undetermined | canonical refusal — no Crown, no prompt, no line | **C** |

## Proof that B has exactly one member

Category B is `ALL_STATES.filter(state => decision(state) === 'ask_amount')`, and the test
asserts that filter equals exactly `['MAIN_TECHNICAL_BLOCKED']`. Since the enum is closed
at four and A claims two while C claims one, B cannot contain another state without the
enum growing — which the union-size assertion catches.

## Every route into category C

`resolveMainCapability` reaches `MAIN_UNKNOWN` from four distinct conditions, and all four
refuse:

| condition | reason code |
| --- | --- |
| no snapshot at all (`snapshotRequired: true`) | `snapshot_missing` |
| `resolutionState !== 'RESOLVED'` — includes `REVALIDATION_REQUIRED` **and** `LEGACY_RECONSTRUCTED` | `revalidation_required` |
| server says unknown | `unknown_product` |
| legacy snapshot whose role matches nothing known | `unknown_product` |

`LEGACY_RECONSTRUCTED` is worth stating explicitly: a legacy snapshot is **not** treated as
current, so it refuses rather than being quietly trusted.

## Where the decision lives

`decideAddAmount` (`src/features/home-creator/homeAddAmountDecision.ts`) calls
`resolveMainCapability` with `snapshotRequired: true` and maps its result to the three
owner categories. It re-implements no classification: the capability answer comes from the
shared authority, which in turn carries the server's own semantic verdict.

In practice category C is rarely reached from the picker, because the picker resolves
ProductBehavior before `onAdd` and refuses a product it cannot confirm. `unresolved_authority`
is the guard behind that, for an authority that goes stale between resolution and add.
