# INTIMPORT — Real Targeted Web Enrichment Provider — Staging Closeout

**Date:** 2026-08-23

**Result:** The real provider is **connected, deployed and live on staging**, and every
non-billable part of the flow is verified end-to-end. The one thing not done is the
**owner-authenticated paid run** — the Edge Function requires a signed-in owner, and I did not
enter credentials. This is neither §47 A (paid QA has not run) nor §47 B (nothing is missing:
the credential exists, the function is ACTIVE, the flags are on). It needs one owner click.

---

## 1–5. Identity, provider and policy

| Item | Value |
| --- | --- |
| Staging SHA at start | `ec6784368dcc165c3943b7e994c98e15a6481a1b` |
| Final staging SHA | `ddac4c1ba1cde54eccc3159db5647cb266b9b052` |
| Deployment | `dpl_JBvDdk3ttRRqeTSwVHr5oqBnBy1X` → superseded by the targeting-fix build |
| Provider | **OpenAI Responses API** with the `web_search` tool (`gpt-5.6-luna`) |
| Runs where | **Edge Function `intimport-enrich`** (staging Supabase, ACTIVE) — server-side only |
| Migration | `intimport_enrichment_usage` — applied to **staging only** |
| Production `main` | `4dfb097d…23a2` — **unchanged, not deployed** |
| Mapper | `b13f5db4…ed38`, 2088 rows — **unchanged** |

Flags, verified from the live secret store:

| Flag | Value |
| --- | --- |
| `INTIMPORT_WEB_ENRICHMENT_ENABLED` | **true** |
| `INTIMPORT_MAX_CALLS_PER_PRODUCT` | **2** |
| `INTIMPORT_MAX_EXTERNAL_CALLS_PER_IMPORT` | **40** |
| `PRODUCT_SCANNER_WEB_SEARCH_ENABLED` | **false** — unchanged |
| `PRODUCT_SCANNER_MAX_WEB_CALLS` | **0** — unchanged |

### The audit finding that shaped the design (§3, §4)

A real provider already existed — the Scanner Edge Function has called OpenAI with a
`web_search` tool all along. But the audit also found that the Scanner **client** sends
`allowWeb: true` on *every* analyze call ([ProductScannerV1Page.tsx:382](src/pages/products/ProductScannerV1Page.tsx:382)).
Web is held off purely by `PRODUCT_SCANNER_WEB_SEARCH_ENABLED=false`.

Enabling INTIMPORT research through those flags would therefore have switched web search on
for **every ordinary scan**. INTIMPORT got its own function reading its own flags; a test
parses the actual `Deno.env.get` calls and fails if a `PRODUCT_SCANNER_*` web flag is ever read
there.

## 6–10. Full 820 local dry run (no web)

| Metric | Value |
| --- | --- |
| Rows / unique | 820 / 820 |
| Existing exact | 0 (no canonical index in the dry run) |
| **≥90 — skip web** | **3** |
| 85–89.99 | **0** |
| **<85** | **817** |
| Review required | 0 |
| **Mapper family matches** | **218** (flavor_paste 110 · base_mix 89 · dairy_liquid 10 · chocolate 6 · coconut_fat 2 · cocoa_butter 1) |
| Technical products | 367 — all fail-closed |
| Confidence min / median / max | **15.6 / 57 / 97.5** |
| Estimated max research jobs | 2 420 |

### Source authority, measured (§9)

| Class | Rows |
| --- | --- |
| AUTHORITATIVE_RETAILER | **432** |
| OFFICIAL_MANUFACTURER | **369** |
| OWNER_PROVIDED_SOURCE | 16 |
| STRUCTURED_PRODUCT_DATABASE | 1 |
| OFFICIAL_TECHNICAL_PDF | 1 |
| OFFICIAL_BRAND | 1 |

**This correction moved the numbers, and I did not tune anything back.** The previous cut
credited every row at manufacturer strength because it carried a Primary Source URL and a
Checked At date. Classifying from the real domain drops "ready ≥90, no web" from **35 to 3**
and the median from 72.2 to 57. Those 432 rows always rested on retailer evidence — the old 35
was the bug, not the new 3. Per §2, no weight was adjusted to recover it.

The upside is concrete: 369 rows already cite `comprital.pl`, so research for them starts at
manufacturer-grade evidence rather than hunting.

## 11–13. Controlled QA subset (§23) — local ledger

11 real rows covering the §23 cases. Selected examples:

| Product | Kind | Authority | Family | Conf | Research targets |
| --- | --- | --- | --- | --- | --- |
| Baitz Ciastka (EAN, full nutrition) | normal | RETAILER | — | 62.4 | manufacturer |
| Auchan pączek (EAN, full nutrition) | normal | RETAILER | — | 64.8 | — (nothing worth buying) |
| Skyr Fruvita (EAN, no ingredients) | normal | RETAILER | dairy_liquid | 38.4 | ingredients, energyKcal, fat |
| Morele BakaD'Or (EAN, no nutrition) | normal | RETAILER | fruit | 32.4 | ingredients, energyKcal, fat |
| Baton Baitz (no EAN) | normal | RETAILER | — | 50.4 | barcode, manufacturer |
| Airwaves guma (no EAN, nothing) | normal | RETAILER | — | 19.2 | ingredients, energyKcal, fat |
| Comprital AMARETTO GIUBILEO | **technical** | **OFFICIAL_MANUFACTURER** | flavor_paste | 72.2 | ingredients, barcode, energyKcal |
| Comprital BASE GIUBILEO CIOCCOLATO | **technical** | **OFFICIAL_MANUFACTURER** | chocolate | 72.2 | ingredients, barcode, energyKcal |

**A real bug surfaced here.** The first ledger showed a packet of biscuits queued to research
`dosage` and `technicalParameters` — money spent on a nonsense question. Research targets are
now scoped by product kind. Note also that the Comprital rows are *not* asked for dosage: they
already declare `100g/l` and a technical PDF, so research never re-buys them (§7).

## 14–16. Cost telemetry

No billable call has been made, so there is no provider usage or cost to report. The function
records `web_calls`, `input_tokens`, `output_tokens`, `latency_ms` and the structured result
per request in `intimport_enrichment_usage`; §24's numbers will come from that table on the
first authenticated run. **I have not invented a cost figure.**

## 17–24. Verified served on staging

Driven through the real UI (`/products/import`, INTIMPORT source, 4 representative rows
including one with an official manufacturer domain):

```
LOCAL INTELLIGENCE RESULT
PRODUCTS 4 · EXISTING EXACT 0 · READY ≥90% — NO WEB 1 · 85–89.99% 0
<85% — WEB REQUIRED 3 · REVIEW REQUIRED 0 · MAPPER FAMILY MATCHES 1 · MAX EXTERNAL CALLS 7
[ Wzbogać i przygotuj import ]
```

Then, on the explicit action:

```
Enrichment 4 / 4 · 0 external call(s)
INTERNET RESEARCH RESULT
RESEARCHED 3 · SKIPPED ≥90% 1 · CACHE HITS 0 · EXTERNAL CALLS 0
IMPORT ELIGIBLE 1 · NEEDS REVIEW 3
```

- **Parse CSV fired zero network requests.** Verified from the network log.
- **The ≥90 product was never researched** — the console shows exactly **three** 401s for the
  three sub-90 products and none for the fourth. That is the no-web rule firing live.
- The 401s are the unauthenticated session; the client **degraded gracefully** — no crash, the
  batch completed, and the products fell to review rather than being silently marked ready.
- Progress rendered and did not spin forever.
- **No provider secret in the served bundle**: zero matches for `sk-proj`, `OPENAI_API_KEY`,
  `api.openai.com` or `service_role`. The browser's only route is
  `functions.invoke('intimport-enrich')`.

Note: `staging.pinguinoai.com` began returning Vercel's bot-mitigation challenge
(`x-vercel-mitigated: challenge`) to my automated requests during this session. I did **not**
attempt to bypass it — QA was completed on the `pinguino-staging.vercel.app` alias, which
serves the identical deployment. The custom domain works normally in a real browser.

## 25–28. Tests

- `sourceAuthority.test.ts` — **17 tests**: manufacturer / technical PDF / brand / retailer /
  database / owner-provided / blog / unparseable, the exact "URL + Checked At ≠ manufacturer"
  regression, domain matching, and a guard that the rules exist in exactly one file.
- `intimportWebProvider.test.ts` — **29 tests**: 84.99 / 85 / 89.99 / 90 boundaries, ≥90 → zero
  provider calls, <90 → targeted call, technical fail-closed at any confidence, targeted-only
  field lists, per-product and import-wide caps, Scanner flag isolation by actual env reads,
  Scanner function untouched, no confidence field in the provider schema, malformed result
  ignored, deterministic re-score.
- Existing INTIMPORT/enrichment suites carried forward.

| Gate | Result |
| --- | --- |
| `npm test` | **7262 passed / 577 files**, 0 failed |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors, 2 warnings (pre-existing) |
| `npm run build` | ✓ built |
| `products:audit` / `mapper:runtime-audit` | `b13f5db4…ed38`, active 2088 |
| `process:validate` | 2088 rows, 0 alignment differences |
| `catalog:mapper-only:validate` | 0 violations |
| `production-rescue:bundle-check` | verified `0fd4f0c7…8480` |
| `git diff --check` | clean |

## 29–32. What the owner needs to do for the paid run

Sign in on staging → `/products/import` → **INTIMPORT** → paste or upload rows → **Parse CSV**
→ **Wzbogać i przygotuj import**. The import-wide cap is 40 external calls and 2 per product,
enforced server-side, so a QA run cannot overspend. Costs and latency will then appear in
`intimport_enrichment_usage`.

Do not press final bulk import for all 820.

---

LOCAL GELLATTI KNOWLEDGE FIRST
>=90% → ZERO WEB
85–89.99% → TARGETED WEB, FINAL IMPORT MAY STILL PROCEED
<85% → WEB REQUIRED BEFORE AUTO-IMPORT
FINAL NORMAL-PRODUCT AUTO-IMPORT FLOOR = 85%
TECHNICAL PRODUCTBEHAVIOR REMAINS FAIL-CLOSED
NO PRODUCTION DEPLOY
MAPPER BASE UNCHANGED
