# DESIGN REQUEST — NAPRAWA 5 RESCUE SURFACE

**Status: `WAITING_EXTERNAL`.**
The design authority for this surface is the existing chat/session
**`Gellatti Pro mobile scroll stabilization / DESIGN`**. That session is **not reachable from the
environment this CORE work runs in** — `ListAgents` reports no peer session, and the account's
session list contains no session with that title. This file is therefore the complete, copy-ready
handoff: paste it into that session verbatim.

**Nothing in this document is a design proposal.** CORE deliberately does not invent this UI. What
follows is the functional contract, the data each state has available, and the copy intent — the
visual and interaction design is the design session's to produce.

---

## 1. What this surface is

GELLATTI may only tell a customer that a target or ideal result is genuinely unreachable **after** a
single shared CORE has checked, in order:

1. the ingredients already in the recipe, inside normal ranges;
2. the same ingredients under approved controlled relaxation (NAPRAWA 1, already on `staging`);
3. compatible canonical ingredients from the profile / base-route toolbox;
4. compatible Starter Pack ingredients;
5. explainable changes to the customer's **own** constraints (simulation only);
6. a tightly bounded compatible two-ingredient Rescue.

The surface presents the outcome of that chain. It is a **proposal**, never an automatic mutation:
nothing changes in the customer's recipe or constraints until they explicitly accept.

One shared CORE serves HOME and PRO. There is **no** separate HOME/PRO Rescue engine and no
duplicated ranking logic — only the presentation may differ, and only as this design decides.

---

## 2. States to design (all sixteen)

Each state lists the data CORE can supply. Field names are indicative of availability, not of
required labels.

### 2.1 Current result is already ideal — no Rescue shown
Target reached, score 10/10, normal envelope, no candidate produces a material improvement.
CORE supplies: `score`, `targetReached: true`, `envelope: 'normal'`.
**The surface shows nothing.** No empty state, no "we checked" reassurance unless the design
decides one is warranted.

### 2.2 Ingredient Rescue — add something not in the recipe
CORE supplies: candidate ingredient (canonical identity + Polish name), exact whole-gram dose,
`scoreBefore`, `scoreAfter`, `targetReachedBefore/After`, which Direction axis is affected,
whether the dose sits in the **normal** or the **controlled extended** range, and the candidate's
source (`profile toolbox` / `Starter Pack`).
Copy intent: `Aktualny wynik: 9/10. Dodaj 4 g fruktozy, aby osiągnąć 10/10.`

### 2.3 Existing ingredient / lock Rescue — change a constraint the customer owns
The ingredient is already in the recipe and carries a customer lock, percent or range.
CORE supplies: the current customer rule and value, the proposed rule and value, `scoreBefore`,
`scoreAfter`, why it helps, the affected Direction target, and normal/extended status.
Copy intent:
`Przy blokadzie dekstrozy na 20 g najlepszy wynik to 8/10. Pozwól zwiększyć ją do 24 g, aby osiągnąć 10/10.`

### 2.4 Candidate comparison
Several valid candidates. CORE supplies the full ranked list with each candidate's dose, score
after, distance after, envelope, number of new ingredients and total recipe movement.

### 2.5 Recommended candidate plus alternatives
One recommendation, the rest available. The ranking is CORE's; the disclosure pattern is the
design's.

### 2.6 Profile-incompatible candidates are never shown
Sorbet and Vegan never see dairy or egg suggestions; a plant Protein route never sees dairy. These
candidates are filtered in CORE **before** ranking and must never reach the surface — not greyed
out, not "unavailable", absent.

### 2.7 Controlled-range disclosure
The proposed dose reaches the target only by using the approved controlled extended range.
CORE supplies `envelope: 'extended'` and the one-point public score cost (NAPRAWA 1: controlled
relaxation costs exactly one public point, never more).

### 2.8 A better normal-range route than the current relaxed one
Target currently reached only through controlled relaxation. A candidate reaches the same target
inside normal ranges.
Copy intent:
`Cel został osiągnięty przy użyciu rozszerzonego zakresu. Dodanie 6 g fruktozy pozwala osiągnąć ten sam cel w standardowym zakresie.`

### 2.9 True infeasible
The complete chain above was exhausted. CORE supplies the classification and the exhaustion record.
The surface must be able to distinguish, truthfully: genuinely infeasible · no materially better
result found · customer-constraint blocked · profile-identity blocked · structural-limit blocked ·
missing approved authority.

### 2.10 Missing authority
A compatibility or dosage authority does not exist for some candidate. This is **not** proof of
physical impossibility and must never be presented as one.

### 2.11 Loading / simulation
The chain is bounded but not instant. CORE supplies progress only as stage boundaries, not a
percentage.

### 2.12 Error / retry
A simulation failed. No partial proposal may be shown.

### 2.13 Acceptance
What the customer confirms, and what they are told will happen.

### 2.14 Rejection
The original recipe and constraints are preserved byte-for-byte. Nothing is changed.

### 2.15 Result after acceptance
CORE runs a **fresh normal Preview** and verifies the promised result. Simulation state is never
copied into live state. The surface must handle the case where the verified result differs from the
promise.

### 2.16 HOME and PRO presentation
Same CORE, same candidates, same ranking. Any difference is presentational and is this design's
decision. Note the standing product rules: Demo hides all ingredient grams; **Home and Pro display
exact ingredient grams**; Demo cannot save, Home saves at most one recipe, Pro unlimited.

---

## 3. Required deliverables from the design session

* desktop preview (~1440 px)
* iPad portrait preview (~820 px)
* phone preview (~390 px)
* interaction flow
* state map covering all sixteen states above
* copy hierarchy
* exact CTA labels (PL, with EN parity)
* expanded / collapsed behaviour
* accessibility and touch guidance
* a stable visual mock or preview artifact that survives for later review
* implementation notes
* **no unrelated redesign** — this is an addition to the current accepted GELLATTI visual system,
  not a revision of it

Export the evidence back into this directory (`docs/design/naprawa-5-rescue/`): design brief, state
map, the three previews, implementation notes, screenshots or other stable visual artifacts, and
the source/session reference. CORE will then implement the approved design 1:1.

---

## 4. Copy rules CORE will enforce

* **Never claim the customer owns the Starter Pack** unless a real entitlement or order authority
  proves it. With ownership unknown, truthful phrasing such as
  `Dodaj 4 g fruktozy z zestawu Starter Pack.`
* PL/EN locale parity is mandatory.
* Approved customer-visible machine and serving choices are exactly:
  −11 °C · −12 °C · −13 °C · Świeże · Ninja Gelato · Ninja Swirl.
  "Ninja 2" is not an approved name and must never appear.
* Never present a simulated result as achieved. A what-if is a what-if until the customer consents
  and the fresh Preview verifies it.

---

## 5. What CORE guarantees before anything reaches this surface

Every candidate shown has already passed, in CORE: profile compatibility · base-route compatibility ·
hard legality · executability · ProductBehavior validity · machine and process limits · batch
validity · Main/Crown authority · qualification (Protein) validity. Ranking is then, in order:
target reached · higher canonical score · normal envelope over controlled relaxation · lower
canonical target distance · fewer new ingredients · less total recipe movement · smaller added dose ·
fewer requested customer-constraint changes.

There is one canonical score and one canonical distance authority. This surface never computes its
own.
