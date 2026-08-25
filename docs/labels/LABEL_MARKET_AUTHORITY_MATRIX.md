# Label market authority matrix

Checked: **2026-08-25**. Canonical detailed audit: [GELLATTI_GLOBAL_LABEL_COMPLIANCE_AUDIT_2026-08-25.md](./GELLATTI_GLOBAL_LABEL_COMPLIANCE_AUDIT_2026-08-25.md).

| Profile | Official authority baseline                                               | Implemented renderer     | Required sub-context                               | Data/preflight authority                                                                                                                                            | Activation                   |
| ------- | ------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| EU      | Regulation (EU) 1169/2011 consolidated 2025-04-01; 2011/91/EU; 2018/775   | `eu-label-v2`            | Destination Member State code + selected languages | actual ingredients/order, reviewed QUID/compound, Annex II allergen authority, market-factor kJ, legal name, fill, date/storage, EU FBO/importer, physical x-height | Regulatory renderer active   |
| UK      | GOV.UK food information; FSA PPDS; current GB/NI address guidance         | `uk-label-v2`            | GB or Northern Ireland; prepacked/PPDS             | FIC-style data, English, PPDS full ingredients/emphasis, GB UK address or NI/EU address, market-factor kJ, physical x-height                                        | Regulatory renderer active   |
| USA     | 21 CFR 101.3/.4/.5/.9/.12/.105                                            | `fda-nutrition-facts-v2` | packaged interstate retail or food service         | statement of identity, actual ingredients, Big 9/source, density + 160 mL RACC, single/dual decision, FDA nutrients/DV/rounding, PDP net contents                   | Regulatory renderer active   |
| Canada  | FDR/SFCR; CFIA Industry Labelling Tool; Health Canada NFT/FOP directories | `canada-nft-v2`          | federal EN/FR; product form; ADS                   | bilingual common name/ingredients, 188/125/75 mL RA, density, volume fill, Canadian nutrients/rounding, local dealer/importer, 15% ADS, FOP assessment              | **External asset blocked**   |
| AU/NZ   | Australia New Zealand Food Standards Code; FSANZ PEAL/NIP guidance        | `fsanz-nip-v2`           | Australia or New Zealand                           | actual ingredients/compound/characterising %, PEAL, serving + 100 g NIP, kJ authority, sodium, local supplier; AU origin                                            | Regulatory renderer active   |
| WORLD   | No jurisdictional authority; product specification only                   | `world-neutral-v1`       | English default; optional user languages           | actual ingredients, confirmed allergens, truthful neutral 100 g nutrition, fill, LOT, production date, storage; optional values only if present                     | `PRINT_READY_UNIVERSAL` only |

## Source links embedded in profiles

- EU: `src/features/master-label/marketProfiles.ts` → EUR-Lex consolidated FIC, LOT and origin regulation.
- UK: GOV.UK food information/packaging and FSA PPDS.
- USA: current eCFR Title 21 sections 101.3, 101.4, 101.5, 101.9 and 101.12.
- Canada: CFIA bilingual/ingredients/NFT and Health Canada FOP specifications.
- AU/NZ: FSANZ NIP, PEAL, ingredients and date marking.

## Canada official external action

1. Send email to `smiu-ugdi@hc-sc.gc.ca`.
2. Use subject exactly: `HPFB BNS Compendium of Nutrition Symbol Formats`.
3. Request the ready-to-use high-resolution FOP symbol package.
4. After receipt, retain the original package/checksum, convert only through a documented lossless print/browser asset workflow, and install approved outputs plus manifest in `src/assets/regulatory/canada-fop/`.
5. Set `canadaFopAssetPackageVersion` and the exact approved asset ID; rerun Canada golden/PDF/browser QA.

No unofficial approximation, traced artwork, competitor asset or locally redrawn symbol is accepted.
