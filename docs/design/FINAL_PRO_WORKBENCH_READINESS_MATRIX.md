# Final Pro Workbench readiness matrix

| Area | Current state | Calculation impact | Remaining connection |
|---|---|---|---|
| Recipe grams editing | Working | Updates canonical recipe input | None in this design task |
| Gram lock | Working | Solver preserves protected grams | None |
| Percentage lock | W PRZYGOTOWANIU | Does not preserve selected share | Persist target share and enforce in Preview/Apply/solver |
| Ingredient role | Working | Uses existing main/supplementary role action | None |
| Availability removal | Working locally | Removes item from current draft | Persist decision and prevent reintroduction across recommendation flows |
| Replacement finder | W PRZYGOTOWANIU | No replacement calculation | Connect compatible search and apply contract |
| System price/kg | Working when data exists | Feeds current recipe cost | None |
| Private customer price | W PRZYGOTOWANIU | Not used | Private account storage and cost resolution |
| Direction controls | W PRZYGOTOWANIU | UI choice does not reformulate | Map four goals to approved solver targets |
| Structure indicator | Working, read-only | Reads current engine result | None |
| Stability indicator | Working, read-only | Reads current engine result | None |
| Quality levels | CZĘŚCIOWO PODŁĄCZONE | Existing weights/ranking work | Complete ECO/Premium/Signature formulation promises |
| Gelato | Working | Uses current supported profile | None |
| Sorbet | W PRZYGOTOWANIU | Dairy compatibility not guaranteed | Dairy validation |
| Vegan | W PRZYGOTOWANIU | Animal-ingredient compatibility not guaranteed | Ingredient compatibility gate |
| Protein | W PRZYGOTOWANIU | No dedicated calculation profile | Approve bands and formulation |
| Professional serving modes | Working | Routes Świeże/−11/−12/−13 to canonical engine profile | None |
| Home machine serving UI | Working presentation | Assigned machine profile is automatic | Verify account/machine synchronization |
| Machine capacity | CZĘŚCIOWO PODŁĄCZONE | Limit may not surface consistently | Verify machine → capacity → Monitor → Recalculate |
| Technical score | Working | Reads current engine result | None |
| Educational score view | Working presentation | Uses real score/axes/corrections | Impact-delta simulation remains pending |
| Full Monitor | Working | Reads current engine result | None |
| Protected Monitor scale | Working presentation | No engine math change | None |
| Production UI | W PRZYGOTOWANIU | Actual grams affect only draft state | Repositories, statuses, events and rescue solver |
| History | W PRZYGOTOWANIU | None | Persist and present production runs |
| Versions | DO PRZEGLĄDU | Technical version save remains intact | Owner presentation decision |
| Costs route | DO PRZEGLĄDU | Existing cost source unchanged | Owner route/presentation decision |
| Exports | W PRZYGOTOWANIU | None | Current recipe export pipeline |
| Labels/allergens/claims | TESTOWE / NIEPRODUKCYJNE | No formulation impact | Verified ingredient declarations and current-recipe binding |
| Ready Recipe categories | CZĘŚCIOWO PODŁĄCZONE | None | Connect catalogue categories |
| Create Ingredient | W PRZYGOTOWANIU | None | Capture, validation and persistence |
| API | W PRZYGOTOWANIU | None | Public contract, auth and status |
| Advanced Studio tools | DO PRZEGLĄDU | Existing functionality preserved | Owner decision; reachable at `/pro/tools` |
