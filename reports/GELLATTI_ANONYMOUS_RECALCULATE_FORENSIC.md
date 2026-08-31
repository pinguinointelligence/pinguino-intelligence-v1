# Anonymous / demo Recalculate — FORENSIC

**Forensic only. Nothing implemented.** No grant issued, no guard weakened, no copy changed.

Environment: staging `tunabqqrwabacxjcxxkz`. Evidence is from the live catalogue
(`pg_proc` ACLs and function bodies) plus the store-level boundary trace.

---

## 1. The exact reads that fail anonymously

Recalculate needs **two** privileged calls. Both are refused to `anon` **by GRANT alone**:

| RPC | SECURITY DEFINER | granted to | reads `mapper_basement` | returns product facts |
| --- | --- | --- | --- | --- |
| `resolve_product_behavior_v1` | yes | postgres, **authenticated**, service_role | no (delegates) | **yes** (via gate) |
| `validate_recipe_behavior_v1` | yes | postgres, **authenticated**, service_role | **no** | **no** |

`anon` appears in neither ACL. Separately, the ingredient picker's
`mapper_basement_search` read is refused anonymously (401) — a different surface, and
the reason identity resolution returns zero candidates for a signed-out visitor.

## 2. What each is for

- **`resolve_product_behavior_v1`** — obtain a CURRENT ProductBehavior snapshot for a
  product in a recipe context. This is where a line's authority comes from.
- **`validate_recipe_behavior_v1`** — confirm the snapshots a client already holds are
  still current for this recipe context. Returns a verdict per line.

## 3. Formulation authority, or validation/hydration?

**Both are validation/hydration. Neither is formulation authority.** Neither computes a
gram, a balance, PAC/POD targets or a Solver result — formulation stays in the Engine.
`resolve_product_behavior_v1` does not even reference `auth.uid()`: it is
identity-independent, and is denied to `anon` purely by grant.

## 4. What the fresh canonical starter already carries

**Nothing.** Boundary trace (`src/qa/productBehaviorBoundary.forensic.test.ts`, no server,
no session):

```
starter lines: 7, with snapshot: 0     snapshot map keys: 0
id=milk_3_5   canonical=PI-ING-000236   prov=template   snapshot=NO
```

`rebuildNewRecipeStarter` writes `productBehaviorSnapshots: {}` and nothing re-attaches
them. Lines carry a template slug as identity with `identity_provenance: 'template'`,
while the correct canonical id sits unused on the same line.

## 5. Does the shared starter builder have the snapshot at creation time?

**No, and it cannot get one anonymously.** The starter is built client-side from a
template. The only way to obtain a snapshot is `resolve_product_behavior_v1`, which is
authenticated-only. So for a signed-out visitor the authority is unobtainable at creation
time by the current architecture — which is why the failure is *created-never-lost*.

## 6. Can the server validate without exposing Mapper rows?

**Yes — the validation family already does.** None of
`validate_recipe_behavior_v1`, `validate_recipe_behavior_current_only_v1`,
`validate_recipe_behavior_with_process_envelope_v1` or
`validate_recipe_behavior_identity_gate_v1` reads `mapper_basement` or
`product_behavior_bindings`. They judge the SUPPLIED snapshot and return verdicts
(`state`, `reasons`, `staleLineIds`) — no `sharedFacts`, no PAC/POD, no cost.

`validate_recipe_behavior_v1` is even written for anonymous callers already:

```sql
if auth.uid() is null then return v_current; end if;
```

The owner-history fallback is authenticated-only by design and reads only
`recipe_versions` owned by `auth.uid()` — never Mapper.

## 7. Existing demo/public-safe authority

`validate_recipe_behavior_current_only_v1` is exactly that shape — SECURITY DEFINER, no
Mapper, no `auth.uid()`, verdict-only — but it is granted to `postgres`/`service_role`
only.

**The resolver is NOT demo-safe, and this is the load-bearing finding.**
`resolve_product_behavior_v1` delegates to `resolve_product_behavior_evidence_gate_v1`,
which is granted to `postgres` alone and:

- **reads `mapper_basement`**,
- returns **`sharedFacts`**,
- returns **`pac_value` / `pod_value` / `cost_per_kg`**.

So "just grant `anon` execute on the resolver" would put Mapper-derived product facts in
an anonymous client's hands. **That option is closed by the owner's own rule.**

## 8. Smallest shared fix — options, none implemented

The two halves must be separated, because only one of them is safe to open:

**Safe half.** Granting `anon` EXECUTE on `validate_recipe_behavior_v1` leaks nothing: it
returns verdicts only, and already short-circuits for `auth.uid() is null`. This is
necessary but **not sufficient** — a client with no snapshots has nothing to validate.

**Unsafe half.** Anonymous *resolution* cannot be opened without exposing Mapper facts.
So the snapshot must reach the starter some other way. Three candidates, for the owner to
choose:

| Option | Shape | Cost / risk |
| --- | --- | --- |
| **A. Starter ships pre-resolved snapshots** | The starter's product set is fixed and system-chosen; its snapshots become part of the canonical starter definition, attached at creation in the SHARED path | No new exposure; currency must be handled — a stale build-time snapshot is correctly reported stale by validation |
| **B. Demo-safe snapshot RPC for the starter set only** | New SECURITY DEFINER RPC returning snapshots for the fixed starter products | Returns `sharedFacts` for ~7 products — a narrow but real disclosure; needs an explicit owner ruling |
| **C. Server-side demo formulation** | Anonymous formulation happens server-side; the client never holds snapshots | Largest change; keeps facts entirely server-side |

**Recommendation to consider, not to act on:** option **A**, because it fixes the same
defect for PRO (`startNewProRecipe.ts` uses the identical starter) and for signed-in HOME,
requires no new grant, exposes nothing new, and leaves ProductBehavior validation strict —
a stale starter snapshot would still be refused rather than trusted.

## What this forensic does NOT claim

It does not establish which of the three the owner wants, and it does not show that
option A's snapshots can be produced without a privileged build step — that is the next
question to answer before any implementation.
