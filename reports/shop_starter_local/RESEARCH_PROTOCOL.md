# Starter Pack local equivalents — research protocol (SHOP, 2026-09-17)

**Owner mandate (2026-09-17, this chat).** The 0 € offer becomes one per-country PDF, in the country's language, listing all
seven Starter Pack items with local equivalents, for all 75 v23 markets. Items with no owner selection are researched by SHOP
("Research SHOP", "sama uzupełnij wszystkie 75 krajów"). Research results are **proposals for owner acceptance** before any PDF.
The D-38 pause is lifted for these four items only.

| Code | Starter Pack item | PI (FINAL 2541) | Reference facts (per 100 g) | Source of the country row |
|---|---|---|---|---|
| DEX | Dekstroza 250 g | PI-ING-000494 dextrose monohydrate | dextrose 90.9, water 9.1 | owner v23 (not researched) |
| SMP | Odtłuszczone mleko w proszku 250 g | PI-ING-000270 | fat 0.8, protein 35.7, lactose 51 | owner v23 (not researched) |
| STB | Gellatti Stabilizer 125 g | PI-ING-002114 blend tara 60 / LBG 25 / guar 15 | — | owner v23 stabilizer slot, shown as a local alternative (owner) |
| **CRP** | Śmietanka w proszku 42% 125 g | PI-ING-000260 | fat 42, protein 20, lactose 30, water 3 | **research** |
| **FRU** | Fruktoza 125 g | PI-ING-000496 | fructose 99.8 | **research** |
| **INU** | Inulina 125 g | PI-ING-000456 | fibre 89, sugars 8, water 3 | **research** |
| **YOL** | Suszone żółtko jaja 125 g | PI-ING-001645 | fat 56.5, protein 34.5, carbs 2.5, water 6 | **research** |

## What counts as the same product type (equivalence)

Record the composition printed on the page/label. Never guess numbers.

- **CRP — cream powder.** Spray-dried dairy cream. `A_EQUIVALENT`: fat 38–48 %, ingredients cream (optionally milk proteins, lecithin, an anti-caking agent).
  `B_SAME_TYPE_DIFFERENT_COMPOSITION`: dairy cream powder outside 38–48 % fat (state the fat %).
  **Reject:** whole milk powder (~26–28 % fat), non-dairy creamers/coffee whiteners (vegetable fat, glucose syrup), whipped-topping or dessert mixes, sour-cream or cheese powders, butter powder, cream flavourings.
- **FRU — fructose.** Crystalline or powdered fructose. `A`: ≥ 98 % fructose. **Reject:** fructose/glucose syrups, "fruit sugar" blends with sucrose or dextrose, sweetener blends (stevia, sucralose), FOS.
- **INU — inulin.** Inulin powder (chicory, agave, Jerusalem artichoke). `A`: inulin/fibre ≥ 85 %. `B`: oligofructose/FOS powder (short-chain) — say so.
  **Reject:** fibre blends (psyllium, acacia mix), capsules/tablets, flavoured or sweetened drinks, syrups.
- **YOL — dried egg yolk.** Pasteurised chicken egg yolk powder. `A`: 100 % egg yolk. `B`: yolk powder with a declared additive (salt, sugar, anti-caking — state it).
  **Reject:** whole egg powder, egg white/albumen, egg replacers, custard/flan powders.

`C_INSUFFICIENT_DATA` = right type but the page doesn't show enough to decide A/B (keep it, class it LEAD).

## Evidence rules (owner decisions D-10, D-29…D-37 — unchanged)

Tooling: `reports/a03/tooling/` (read `README.md` first). Set `export GELLATTI_EGRESS_CC=ES` (checked 2026-09-17).

1. **Discovery ≠ evidence.** Web search, search snippets and page-summary tools are for finding pages only. Evidence is a page
   fetched and checked with `verify_ean_market.py "<url>" <EAN|-> <ISO2> --agent <your-agent-name>`. Keep the verdict file path.
2. **Identity** (A): the exact GTIN as data on a manufacturer/retailer page (JSON-LD gtin/sku, itemprop, "EAN:" label) —
   not in a URL/slug, not echoed from a search, not glued into a retailer code. Or D-37: a genuine retailer/manufacturer
   own-brand first-party listing with exact name, variant and pack (then `gtin: null`, `identifier_confirmed: false`).
   Name similarity alone never confirms. Never invent or complete a GTIN.
3. **Market binding** (B): country domain, country path, locale subdomain, a single seller `addressCountry`, or an explicit
   country selector/shipping statement checked with `check_quotes.py`. **Currency never binds.** A generic `.com` needs an
   explicit country signal. `CONFIRMED_LOCAL` = A ∧ B.
4. **Marketplaces** (Amazon, eBay, Allegro, Mercado Libre, Lazada, Shopee, Noon, Jumia, Trendyol, Rakuten, Coupang …) and
   aggregators/price-comparison/barcode databases never confirm. A marketplace offer may be kept as a `LEAD` purchase path
   only when no direct retailer/manufacturer page exists.
5. **Cross-border.** A foreign manufacturer/retailer page with the exact product that explicitly ships to the country
   (policy sentence verified with `check_quotes.py`, or a country selector that lists it) = `VERIFIED_CROSS_BORDER`.
   Prefer local; use cross-border only when local search found nothing usable.
6. **Bot walls, CAPTCHAs, "service unavailable":** record as inconclusive, never bypass; try another source.
7. **BRAK is a valid answer.** Write it explicitly with the searches you did (at least 3 queries in the local language(s) and
   English, and at least 3 kinds of source: supermarket/online grocer, health/organic or pharmacy, baking/professional supplier).
8. No prices are required. Don't record personal data. Don't create accounts, don't log in, don't add to carts, don't fill forms.
9. Retail packs are preferred (100 g – 1 kg); up to 5 kg only when nothing smaller exists. Pack size never has to match 125/250 g.

## Added by the owner's correction of 2026-09-17 (binding for every further round)

10. **Stock state is its own fact, with a date.** Every candidate carries
    `"availability": {"state": "IN_STOCK"|"OUT_OF_STOCK"|"UNKNOWN", "checked_at_utc": "<ISO8601>", "basis": "<the exact page
    token or phrase>", "source": "<url>"}`. Never write IN_STOCK without evidence on the page; `UNKNOWN` is honest.
    A temporary stock-out never deletes a correct product: it stays, and the PDF prints the state with its date. Put a
    stock remark in the candidate's own `equivalence_note`, never only in the item's shared `notes` — a shared sentence
    would otherwise be read as if it applied to the alternative too.
11. **Channel is its own dimension.** A shop that sells only to registered businesses (net prices, "nur an gewerbliche
    Wiederverkäufer", trade login) is not an ordinary retail offer, even when the pack is 100 g: record
    `"channel": "TRADE_ONLY_B2B_REGISTERED_RESELLERS"` (or `B2B_INDUSTRIAL_PACK_ONLY` for sacks) and quote the sentence.
    Such a candidate never earns a TAK recommendation — it becomes an owner decision. B2B stays B2B.
12. **Cream powder with a different fat content is a candidate, not an acceptance.** A real dairy cream powder outside
    38–48 % fat is recorded as `B_SAME_TYPE_DIFFERENT_COMPOSITION` with the printed fat % and the full ingredient list.
    The owner decides. It is never mapped onto the 42 % reference ingredient, and no substitution ratio is ever stated.
13. **No sentinels in data fields.** A field the page does not print is JSON `null` — never "not printed", "not stated",
    "unknown", "n/a" or an invented brand. Keep the real listing name exactly; put researcher bookkeeping (article
    numbers, "size selector", "also listed", own-brand reasoning) in `equivalence_note` / `notes`, never in `brand`,
    `product_name` or `pack`.
14. **A delivery claim needs the country named.** "We ship worldwide/internationally" is not confirmation: keep it as a
    LEAD and quote the wording. Save every `check_quotes.py` result file and reference its path in `ships_to_evidence`
    (a dict, never prose).
15. **Anything the owner should look at before deciding** goes in `"owner_check": "<one sentence>"` on that candidate.
16. **A delivery claim is judged by the MEANING of the seller's own sentence** (owner, 2026-09-17, second round —
    this replaces the earlier "does the list also appear on a product page" test, which was only a hint).
    Read the sentence, the heading above it, the exceptions and the product scope, then decide:
    - **It counts** when the wording is about delivery and covers the country — either by naming it in any language
      ("Wir liefern in folgende Länder: … Polen", "Please select your shipping country … we can only ship your order to
      addresses located in the chosen country"), or through an unambiguous GROUP the country belongs to (a priced zone
      "European Union (EU)", "North America, Canada, Australia, South America", "EU-Zone 3: …"). A group does not need
      every member spelled out.
    - **It does not count** when the country appears only in a market/currency picker with no delivery wording, or when
      the only statement is a generic "worldwide" / "we ship to Europe", or when an exception or a product-specific
      restriction takes the country back out.
    - Repetition is not a verdict: the same list on several pages is a reason to read it, not to reject it. A list that
      appears only on the shipping page may equally be an EXCLUSION list — read it before using it.
    Record the sentence, its heading, the reason it covers the country, and which exceptions were checked.
    `delivery_check.py` holds one entry per seller with the sentence that decided it, and re-evaluates records instead
    of restoring them wholesale — an unconfirmed delivery stays unconfirmed.
17. **Pack weight never decides the channel** (owner, 2026-09-17, second round). Weight, minimum order quantity and
    sales channel are three separate fields: record `pack_grams`, `moq` and `channel`. "Business only" requires a
    confirmed seller restriction (registered-reseller login, "sale only to businesses", wholesale account) with the
    sentence quoted; a 25 kg sack in an ordinary shop is a large pack, not a B2B channel. A genuine business offer is
    kept as information for a professional — never counted as an ordinary retail purchase path, and never presented
    without its restriction.
18. **A lead may be shown, but never as a solution.** A genuinely identified product whose delivery is not confirmed,
    and a genuine business-only offer, may appear in the PDF as clearly separated additional information carrying
    "Delivery to <country> is not confirmed — check with the seller". It is never described as confirmed availability,
    checked shipping or a ready substitute in the app, and it never closes one of the seven retail lines. Keep the two
    kinds of doubt apart: an unconfirmed delivery is not the same as an unproven identity or composition.

## Output — one file per country, written as soon as that country is done

`reports/shop_starter_local/research/<ISO2>.json` (UTF-8, pretty-printed). Don't edit any other file.

```json
{
  "iso2": "DE", "country": "Germany", "agent": "research-eu-west", "egress_cc": "ES",
  "researched_at_utc": "2026-09-17T18:00:00Z",
  "items": {
    "CRP": {
      "result": "CONFIRMED_LOCAL | VERIFIED_CROSS_BORDER | LEAD_ONLY | BRAK",
      "local_terms": ["Sahnepulver", "Rahmpulver"],
      "queries": ["Sahnepulver 42% Fett kaufen", "cream powder 42% fat Germany"],
      "sources_tried": ["rewe.de (no result)", "…"],
      "candidates": [
        {
          "rank": 1,
          "brand": "…", "product_name": "exact text on the page", "pack": "250 g",
          "gtin": "4001234567890", "identifier_confirmed": true,
          "url": "https://…", "source_type": "MANUFACTURER | OFFICIAL_SHOP | RETAILER | MARKETPLACE",
          "seller": "…", "page_market": "DE", "market_by": "CCTLD",
          "identity_basis": "GTIN_ON_LOCAL_PAGE | GTIN_ON_SOURCE_PLUS_ATTRIBUTE_MATCH | FIRST_PARTY_OWN_BRAND_LISTING | NOT_PROVEN",
          "market_binding_signal": "country domain .de",
          "cross_border": false, "ships_to_evidence": null,
          "composition": {"fat_g": 42.0, "protein_g": null, "fibre_g": null, "fructose_pct": null, "ingredients": "…", "from": "page label"},
          "equivalence": "A_EQUIVALENT | B_SAME_TYPE_DIFFERENT_COMPOSITION | C_INSUFFICIENT_DATA",
          "equivalence_note": "fat 42 % = reference",
          "evidence_class": "CONFIRMED_LOCAL | VERIFIED_CROSS_BORDER | LEAD",
          "verifier_verdict_file": "~/.cache/gellatti-evidence/verify/….json",
          "checked_at_utc": "2026-09-17T18:05:00Z"
        }
      ],
      "notes": ""
    },
    "FRU": {}, "INU": {}, "YOL": {}
  }
}
```

Up to two candidates per item (rank 1 = best). `result` is the best candidate's class, or `BRAK`.
Selection status of every row: `PROPOSAL_AWAITING_OWNER_ACCEPTANCE`. Nothing reaches a customer before the owner accepts it.
