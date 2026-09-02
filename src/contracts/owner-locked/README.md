# OWNER-LOCKED CONTRACTS

**SERVED + TESTED + OWNER-APPROVED = OWNER-LOCKED.**
Owner-locked behaviour is immutable by default.

Everything in this directory encodes behaviour the owner has already served,
tested and accepted. It is not ordinary test code and it does not follow
ordinary test-maintenance rules.

## The one rule

> **If an owner-locked contract fails, the implementation is wrong BY DEFAULT.**
> Do not rewrite the contract to fit the implementation.

This exists because it already happened twice, in five days:

| Commit | What it did | What it also did |
|---|---|---|
| `f5d57bdf` (2026-08-26) | deleted the only control that could crown an ingredient | rewrote the guard test to assert the control's **absence** |
| `7edd90ea` (2026-08-28) | changed Direction acceptance semantics | rewrote a Protein Multi-Main test from a positive Apply to an expected **refusal** |

Both suites stayed green. The capability was gone. `scripts/guardOwnerLockedContracts.mjs`
now makes that combination fail the gate.

## If you believe a locked contract must change

Do **not** change it. Collect **every** required contract change into **one**
grouped approval request — never one at a time when several are already known —
containing, per contract:

- the locked contract (ID + name)
- the current accepted behaviour
- the requested new behaviour
- the reason
- the consequence
- the risk
- the alternatives considered
- the exact affected files and functions

Then wait for explicit owner approval. The owner records approval as a commit
trailer, which is the only thing that unlocks the guard:

```
Owner-Locked-Change-Approved: GEL-P0-004, GEL-P0-007
```

Adding a **new** contract is always allowed — it strengthens protection.

## How these contracts are written

Two kinds, both fast (the whole suite runs in ~2 s and must stay that way):

1. **Behavioural** — a pure exported function is called and its accepted answer
   asserted. Preferred whenever the authority is reachable as a pure export.

2. **Source-invariant** — the accepted wiring is asserted against the production
   source text. This is deliberate: the regressions that actually happened were
   *deletions of wiring* (a control removed from a row, a predicate no longer
   consulted at a gate, a default no longer applied), and a behavioural test
   cannot see a control missing from JSX without rendering the whole workbench —
   far too slow for a gate that runs on every push.

Source-invariant assertions always read the **production** file, never a copy,
so they cannot drift away from what ships.

## Contracts

The ledger — contract ID, accepted behaviour, acceptance commit, protected
functions, served status — is `docs/OWNER_LOCKED_CONTRACTS.md`.

## Running them

```bash
npm run test:contracts
```
