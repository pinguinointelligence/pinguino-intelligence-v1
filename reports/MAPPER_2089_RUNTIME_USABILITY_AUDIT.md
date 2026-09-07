# Mapper runtime usability audit — 2089 of 2147 ingredients

Generated deterministically by `scripts/auditMapperRuntimeUsability.mjs`. The source Mapper CSV is read-only and its SHA is pinned.

| Metric | Before | After | Explanation |
|---|---:|---:|---|
| Active Mapper rows | 2089 | 2089 | Immutable SHA-256 5047D9CA645BB2C1E2E930201AB9E82B08A04DC1E48E3263E7BA61930A5DA1F5 |
| Searchable rows | 2089 | 2089 | Every active direct Mapper reference remains visible |
| Selectable Base rows | 1708 | 2083 | After = active + approved_for_base |
| Engine-calculable rows | 1708 | 2082 | After = Engine approval + 9 required numerical fields + grams > 0 |
| Blocked solely by provenance | 374 | 0 | Badge/tooltip only after repair |
| Blocked solely by confidence | 0 | 0 | No direct confidence predicate is authorized |
| Blocked solely by process UNKNOWN for technical PI | 0 | 0 | Process is informational only |
| Missing dosage | 1836 | 1836 | Informational; the user enters grams |
| Missing price | 1544 | 1544 | Cost incomplete only |
| Actual technical-data blockers | 7 | 7 | Unique Engine-ineligible set; technical missing overlaps it |
| approved_for_base=false | 6 | 6 | Real Base block |
| approved_for_engines=false | 7 | 7 | Real PI block |
| Missing bindings | 2089 | 2089 | Requires authenticated staging authority export for final zero proof |
| Verified status | 1709 | 1709 | Informational |
| Estimated status | 350 | 350 | Informational |
| Needs Label Review | 273 | 273 | Informational for technical use |

## Not covered by this audit: 58 ingredient(s)

The Mapper holds **2147** ingredients; this audit classifies **2089**. Process metadata and the ProductBehavior classification are per-ingredient judgements that cannot be derived from a Mapper row, so an ingredient with neither is reported here rather than counted anywhere above.

| ingredient_id | name | verification_status | approved_for_base | missing evidence |
|---|---|---|---|---|
| PI-ING-002115 | GLUCOSE SYRUP DRY · DE20–25 · Sweetener · Dry | PI Calculated / Global DE Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002116 | GLUCOSE SYRUP DRY · DE25–30 · Sweetener · Dry | PI Calculated / Global DE Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002117 | GLUCOSE SYRUP DRY · DE30–32 · Sweetener · Dry | PI Calculated / Global DE Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002118 | MALTODEXTRIN · DE10–13 · Sweetener · Dry | PI Calculated / Global DE Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002119 | MALTODEXTRIN · DE15–18 · Sweetener · Dry | PI Calculated / Global DE Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002120 | MALTODEXTRIN · DE17–20 · Sweetener · Dry | PI Calculated / Global DE Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002121 | MALTODEXTRIN · DE9–11 · Sweetener · Dry | PI Calculated / Global DE Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002122 | LIQUID GLUCOSE SYRUP · GENERIC · 79% SOLIDS | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002123 | ALLULOSE (D-PSICOSE) · Sweetener · Dry | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002124 | D-TAGATOSE · Sweetener · Dry | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002125 | ISOMALTULOSE · Sweetener · Dry | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002126 | MALTOSE · Sweetener · Dry | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002127 | MANNITOL · Sweetener · Polyol | Verified / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002128 | ISOMALT · Sweetener · Polyol | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002129 | LACTITOL · Sweetener · Polyol | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002130 | SORBITOL SYRUP · 70% SOLIDS · Sweetener | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002131 | MALTITOL SYRUP · 75% SOLIDS · Sweetener | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002132 | POLYGLYCITOL SYRUP (HSH) · 75% SOLIDS · Sweetener | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002133 | ACESULFAME K · Sweetener · High Intensity | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002134 | ASPARTAME · Sweetener · High Intensity | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002135 | SODIUM SACCHARIN · Sweetener · High Intensity | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002136 | SODIUM CYCLAMATE · Sweetener · High Intensity | Verified / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002137 | NEOTAME · Sweetener · High Intensity | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002138 | ADVANTAME · Sweetener · High Intensity | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002139 | MONK FRUIT EXTRACT (LUO HAN GUO / MOGROSIDES) · High Intensity | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002140 | THAUMATIN · Sweet Protein · High Intensity | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002141 | NEOHESPERIDIN DC (NHDC) · Sweetener · High Intensity | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002142 | ASPARTAME–ACESULFAME SALT · E962 · High Intensity | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002143 | ALITAME · Sweetener · High Intensity | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002144 | BROWN SUGAR · Sweetener · Dry | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002145 | COCONUT SUGAR · Sweetener · Dry | Verified / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002146 | AGAVE SYRUP (AGAVE NECTAR) · Sweetener · Liquid | Verified / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002147 | DATE SYRUP · Sweetener · Liquid | Verified / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002148 | CANE MOLASSES · Sweetener · Liquid | Verified / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002149 | BROWN RICE SYRUP · DE28 · Sweetener · Liquid | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002150 | BROWN RICE SYRUP · DE42 · Sweetener · Liquid | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002151 | BROWN RICE SYRUP · DE60 · Sweetener · Liquid | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002152 | BARLEY MALT SYRUP / MALT EXTRACT · Sweetener · Liquid | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002153 | NON-CENTRIFUGAL CANE SUGAR (PANELA / JAGGERY) · Dry | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002154 | PALM SUGAR · Sweetener · Dry | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002155 | RAW CANE SUGAR (DEMERARA / TURBINADO) · Sweetener · Dry | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002156 | ICING / POWDERED SUGAR · Sweetener · Dry | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002157 | HIGH-FRUCTOSE CORN SYRUP · HFCS55 · Liquid | Verified / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002158 | HIGH-FRUCTOSE CORN SYRUP · HFCS90 · Liquid | Verified / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002159 | CANE SYRUP · Sweetener · Liquid | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002160 | YACON CONCENTRATE · ~89% SOLIDS · Sweetener / FOS · Liquid | Verified / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002161 | MAPLE SUGAR · Sweetener · Dry | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002162 | YACON SYRUP · ~72% SOLIDS · Sweetener / FOS · Liquid | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002163 | DEXTROSE ANHYDROUS · Sweetener · Dry | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002164 | TREHALOSE ANHYDROUS · Sweetener · Dry | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002165 | LIQUID SUCROSE · 67.5° BRIX · Sweetener | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002166 | FRUCTOSE SOLUTION · 77% SOLIDS · Sweetener | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002167 | LIQUID GLUCOSE SYRUP · DE38 · 83% SOLIDS | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002168 | LIQUID GLUCOSE SYRUP · DE42 · 80% SOLIDS | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002169 | LIQUID GLUCOSE SYRUP · DE47 · 79% SOLIDS | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002170 | LIQUID GLUCOSE SYRUP · DE60 · 80% SOLIDS | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002171 | OLIGOFRUCTOSE (FOS) · P95 · 95% SOLIDS · Powder | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |
| PI-ING-002172 | OLIGOFRUCTOSE (FOS) · L95 · 75% SOLIDS · Syrup | PI Calculated / Global Reference | TRUE | no_process_metadata;no_product_behavior_classification |

## Additional exact census

- Approved for Base: **2083**.
- Approved for Engine: **2082**.
- Technical composition incomplete under the 9-field contract: **1** (PI-ING-002113: POD/PAC).
- ProductBehavior UNKNOWN_REQUIRES_EVIDENCE: **832**.
- Process UNKNOWN: **1389**.
- Dosage UNKNOWN: **1836**.
- Price missing: **1544**.
- Customer-added Mapper references: **0**.
- System-matched Mapper references: **0**.
- Product version IDs pending authenticated served capture: **2089**.
- Binding IDs pending authenticated served capture: **2089**.

## Real remaining gates

1. `approved_for_base=false` blocks Base only.
2. `approved_for_engines=false` or one of the nine missing numerical fields blocks technical PI.
3. Zero grams blocks the PI click until the user enters at least 1 g; unknown dosage itself does not block anything.
4. Process UNKNOWN is preserved as product information and blocks nothing — not selection, not the Engine, not Production.
5. Missing price leaves cost incomplete and prevents an honest cheapest-result claim; technical calculation remains available.

The exhaustive CSV preserves every simultaneous module-scoped reason instead of collapsing it into a single status.
