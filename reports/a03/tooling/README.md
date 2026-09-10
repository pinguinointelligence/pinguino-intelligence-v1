# GELLATTI evidence tooling (reports/a03/tooling)

Research tooling for the SHOP / PDF 0€ workstream. It is **not application code**: it doesn't run in the app, doesn't
touch the database, and depends only on the Python standard library, `curl` and optionally `pdftotext`.

| file | job |
|---|---|
| `verify_ean_market.py` | Decides whether a web page proves "EAN X is sold in market Y". Prints one JSON verdict and caches the page. |
| `check_quotes.py` | Checks that an exact sentence (a shipping policy, a "we only ship within …" statement) is printed on a page. |
| `identifiers.py` | Types a product number: GTIN-8/12/13/14 with checksum, GS1 store-internal (RCN) ranges, ISBN/ISSN, coupons. |
| `reconcile_owner_excel.py` | Checks the Owner's complete country-base Excel against FINAL_FROZEN Mapper 2541, row by row (9 steps). |
| `xlsx_min.py` | Dependency-free `.xlsx` reader used by the reconciliation tool. |
| `countries75.json` | The 75 active markets: ISO2 → English name, Polish name, priority. |
| `host_market_declarations.json` | Owner-approved host → market attributions for generic `.com` shops (empty; each entry needs an evidence URL). |

## Evidence rules the verifier applies

A market counts as **CONFIRMED** only when all of these hold:

- the page belongs to a manufacturer or retailer (price-comparison sites, barcode databases and marketplaces never confirm);
- the page serves that market;
- the exact EAN appears as data, meaning a JSON-LD gtin/sku, an `itemprop`, or an "EAN:" label.

These EAN matches don't count:

- an EAN inside a URL or product slug;
- an EAN echoed back from a search query;
- an EAN glued into a retailer's own code (`OS3412290032215`).

How the page's market is decided, first rule that applies:

1. country domain;
2. explicit locale path (`/en-nz/`, `/NZ/en/`);
3. locale subdomain;
4. a single seller `addressCountry`;
5. a currency used by exactly one of the 75 markets. EUR and USD never count, a Shopify-converted price never counts, and the currency of the machine's own network (egress) never counts.

Anything else is LEAD.

Two other sources never count as evidence:

- **Web-search and page-summary tools.** They paraphrase and garble digits, so they are for discovery only.
- **Bot walls, CAPTCHAs and "Service unavailable" pages.** These are recorded as inconclusive and are never bypassed.

## Evidence labels

- **D-10 classes** (per v7 cell): CONFIRMED · LEAD · HYPOTHESIS · BRAK.
- **D-24 labels** (research that isn't an Owner selection):
  - VERIFIED_MARKET_EVIDENCE: the exact EAN is on a manufacturer/retailer page that serves the market.
  - VERIFIED_PRODUCT_EVIDENCE: the exact EAN is on a manufacturer/retailer page, but the market isn't proven.
  - RESEARCH_LEAD: anything else.
  - Research is never a selection. Its selection status stays `NOT_SELECTED_AWAITING_OWNER_EXCEL`.
- **STABILIZER slot classes (D-17)** apply only after the Owner-selected stabilizer fails verification (D-26).

## Usage

```bash
export GELLATTI_EGRESS_CC=ES
python3 reports/a03/tooling/verify_ean_market.py "https://gymbeam.cz/dextroza-1000-g-gym-beam.html" 8588006139983 CZ
```

`GELLATTI_EGRESS_CC` is the country of the network running the checks; find it with `curl -s https://www.cloudflare.com/cdn-cgi/trace`.

```bash
python3 reports/a03/tooling/verify_ean_market.py "<product URL>" - PT --slot SUCROSE_TERM
```

Pass `-` instead of an EAN to get page facts only: title, page market, stabilizer words on the page, ingredients, and links to technical data sheets.

```bash
python3 reports/a03/tooling/check_quotes.py "<shipping policy URL>" "We deliver to Germany, Austria …"
```

```bash
python3 reports/a03/tooling/reconcile_owner_excel.py OWNER.xlsx --baseline "BAZA_v7.xlsx" --out reconciliation.csv
```

Cached pages and verdicts go to `$GELLATTI_EVIDENCE_DIR` (default `~/.cache/gellatti-evidence`); raw pages never go into git.
The verifier fetches with DNS over HTTPS because the local line intercepts some hosts.
