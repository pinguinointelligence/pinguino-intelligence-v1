//#region src/engine/config/coefficients.ts
/** POD — relative sweetening power, sucrose = 1.00 (spec §7).
* Defaults sit inside the spec's configurable ranges:
* dextrose/glucose 0.70–0.75 · fructose 1.70–1.75 · lactose 0.15–0.20. */
const POD_COEFFICIENTS = {
	sucrose: 1,
	dextrose: .74,
	glucose: .74,
	fructose: 1.73,
	lactose: .16,
	invert: 1.25
};
/** PAC — anti-freezing power of the sugar spectrum, sucrose = 1.00 (spec §8).
* Dextrose/glucose and fructose must exceed sucrose (required). */
const PAC_COEFFICIENTS = {
	sucrose: 1,
	dextrose: 1.9,
	glucose: 1.9,
	fructose: 1.9,
	lactose: 1,
	invert: 1.9
};
/** NPAC — net total freezing depression incl. alcohol and salt (spec §8 working
* definition, calibration-pending). Alcohol must strongly increase freezing
* depression. Salt default is flagged calibration-sensitive: sources disagree. */
const NPAC_COEFFICIENTS = {
	sucrose: 1,
	dextrose: 1.9,
	glucose: 1.9,
	fructose: 1.9,
	lactose: 1,
	invert: 1.9,
	alcohol: 7.4,
	salt: 11.7
};
/** Spec §8 normalization basis — EXTERNALLY CONFIRMED (CONFIG_VERSION 0.5.0).
* `per_water_mass` is the canonical basis: two verified external reference
* fixtures (milk base −11C and raspberry premium −11C) each reproduce the
* reference NPAC exactly per water mass (40.74 and 41.15) while per_total_mass
* is far off on both. `per_total_mass` remains available as the explicit
* alternative (passed via NpacOptions.normalization). */
const NPAC_NORMALIZATION = "per_water_mass";
/**
* DE → (pod, pac) anchors for glucose syrups known only by DE value (spec §8).
* Data only — interpolation logic arrives with pac.ts (4C).
* CALIBRATION-PENDING estimates: the 39 DE anchor in particular will be
* validated/corrected by the `dry-glucose-syrup-39de` external reference fixture.
* Stored ingredient pod/pac/npac values always win over these anchors.
*/
const SYRUP_DE_ANCHORS = [
	{
		de: 20,
		pod: .1,
		pac: .45
	},
	{
		de: 39,
		pod: .23,
		pac: .62
	},
	{
		de: 60,
		pod: .5,
		pac: .85
	},
	{
		de: 100,
		pod: .74,
		pac: 1.9
	}
];

//#endregion
//#region src/engine/config/modes.ts
const MODES = {
	eco: {
		mode: "eco",
		objective: "Lowest cost while every technical band stays satisfied (stable).",
		score_weights: {
			cost: .45,
			technical: .4,
			flavor: .15
		},
		main_ingredient: {
			reduce_forbidden: false,
			floor: "category_min"
		},
		candidate_ranking: "cheapest_first",
		boosters: "none"
	},
	classic: {
		mode: "classic",
		objective: "Balanced taste / cost / structure — pure Golden Middle.",
		score_weights: {
			cost: .25,
			technical: .4,
			flavor: .35
		},
		main_ingredient: {
			reduce_forbidden: false,
			floor: "category_min"
		},
		candidate_ranking: "balanced",
		boosters: "none"
	},
	premium: {
		mode: "premium",
		objective: "Stronger main ingredient and better mouthfeel — preserve the main ingredient as much as possible.",
		score_weights: {
			cost: .15,
			technical: .4,
			flavor: .45
		},
		main_ingredient: {
			reduce_forbidden: true,
			floor: "raised"
		},
		candidate_ranking: "mouthfeel_first",
		boosters: "allowed"
	},
	signature: {
		mode: "signature",
		objective: "Maximum perceived flavor with boosters if needed — must remain technically stable.",
		score_weights: {
			cost: .1,
			technical: .35,
			flavor: .55
		},
		main_ingredient: {
			reduce_forbidden: true,
			floor: "maximum"
		},
		candidate_ranking: "flavor_first",
		boosters: "suggested"
	}
};

//#endregion
//#region src/engine/config/priorities.ts
const GOLDEN_MIDDLE_PRIORITY = [
	"feasibility_safety",
	"freezing_stability",
	"npac_pac",
	"pod",
	"water_solids",
	"fat",
	"protein",
	"lactose_sandiness",
	"stabilizer_ratio",
	"flavor_priority",
	"cost"
];

//#endregion
//#region src/engine/config/targets.ts
/**
* Status classification threshold (spec §9/§12.7): the centered fraction of a
* target band classified as 'ideal' — values inside the band but outside this
* inner zone classify as 'good'. CALIBRATION-PENDING estimate, tunable; affects
* only the ideal/good split, never in-band vs out-of-band truth.
*/
const IDEAL_ZONE_FRACTION = .6;
/** Spec §9 alcohol safety row — temperature/category-independent (see header). */
const ALCOHOL_RANGE = {
	min: 0,
	max: 2.5,
	warn_above: 2.5
};
const TARGET_BANDS = [
	{
		category: "milk_gelato",
		temperature_c: -11,
		status: "seeded",
		metrics: {
			pod: {
				min: 12,
				max: 17
			},
			npac: {
				min: 33,
				max: 42
			},
			ice_fraction: {
				min: 45,
				max: 54.5
			},
			lactose: {
				min: 4,
				max: 6
			},
			lactose_sandiness_risk: {
				min: 5,
				max: 9
			},
			fat: {
				min: 5,
				max: 12
			},
			aerating_protein: {
				min: 3,
				max: 6
			},
			protein_in_solids: {
				min: 9,
				max: 13
			},
			total_solids: {
				min: 31,
				max: 45
			},
			water: {
				min: 57,
				max: 70
			},
			alcohol: {
				min: 0,
				max: 2.5,
				warn_above: 2.5
			}
		}
	},
	{
		category: "milk_gelato",
		temperature_c: -12,
		status: "seeded",
		metrics: {
			pod: {
				min: 12,
				max: 17
			},
			npac: {
				min: 42,
				max: 50
			},
			ice_fraction: {
				min: 46,
				max: 54
			},
			lactose: {
				min: 4,
				max: 6
			},
			lactose_sandiness_risk: {
				min: 5,
				max: 9
			},
			fat: {
				min: 5,
				max: 12
			},
			aerating_protein: {
				min: 3,
				max: 6
			},
			protein_in_solids: {
				min: 9,
				max: 13
			},
			total_solids: {
				min: 31,
				max: 44
			},
			water: {
				min: 56,
				max: 70
			},
			alcohol: ALCOHOL_RANGE
		}
	},
	{
		category: "milk_gelato",
		temperature_c: -13,
		status: "seeded",
		metrics: {
			pod: {
				min: 12,
				max: 17
			},
			npac: {
				min: 48,
				max: 55
			},
			ice_fraction: {
				min: 46,
				max: 52
			},
			lactose: {
				min: 4,
				max: 6
			},
			lactose_sandiness_risk: {
				min: 5,
				max: 9
			},
			fat: {
				min: 5,
				max: 12
			},
			aerating_protein: {
				min: 3,
				max: 6
			},
			protein_in_solids: {
				min: 9,
				max: 13
			},
			total_solids: {
				min: 35,
				max: 45
			},
			water: {
				min: 55,
				max: 65
			},
			alcohol: ALCOHOL_RANGE
		}
	},
	{
		category: "chocolate_gelato",
		temperature_c: -11,
		status: "seeded",
		metrics: {
			pod: {
				min: 12,
				max: 20
			},
			npac: {
				min: 34,
				max: 45
			},
			ice_fraction: {
				min: 45,
				max: 54.5
			},
			lactose: {
				min: 4,
				max: 6
			},
			lactose_sandiness_risk: {
				min: 5,
				max: 9
			},
			fat: {
				min: 5,
				max: 12
			},
			aerating_protein: {
				min: 3,
				max: 6
			},
			protein_in_solids: {
				min: 7,
				max: 13
			},
			total_solids: {
				min: 31,
				max: 45
			},
			water: {
				min: 57,
				max: 70
			},
			alcohol: ALCOHOL_RANGE
		}
	},
	{
		category: "chocolate_gelato",
		temperature_c: -12,
		status: "seeded",
		metrics: {
			pod: {
				min: 12,
				max: 20
			},
			npac: {
				min: 43,
				max: 52
			},
			ice_fraction: {
				min: 46,
				max: 54
			},
			lactose: {
				min: 4,
				max: 6
			},
			lactose_sandiness_risk: {
				min: 5,
				max: 9
			},
			fat: {
				min: 5,
				max: 12
			},
			aerating_protein: {
				min: 3,
				max: 6
			},
			protein_in_solids: {
				min: 7,
				max: 13
			},
			total_solids: {
				min: 31,
				max: 45
			},
			water: {
				min: 56,
				max: 70
			},
			alcohol: ALCOHOL_RANGE
		}
	},
	{
		category: "chocolate_gelato",
		temperature_c: -13,
		status: "seeded",
		metrics: {
			pod: {
				min: 12,
				max: 20
			},
			npac: {
				min: 49,
				max: 57
			},
			ice_fraction: {
				min: 46,
				max: 52
			},
			lactose: {
				min: 4,
				max: 6
			},
			lactose_sandiness_risk: {
				min: 5,
				max: 9
			},
			fat: {
				min: 5,
				max: 12
			},
			aerating_protein: {
				min: 3,
				max: 6
			},
			protein_in_solids: {
				min: 7,
				max: 13
			},
			total_solids: {
				min: 35,
				max: 45
			},
			water: {
				min: 55,
				max: 65
			},
			alcohol: ALCOHOL_RANGE
		}
	},
	{
		category: "sorbet",
		temperature_c: -11,
		status: "seeded",
		metrics: {
			pod: {
				min: 15,
				max: 25
			},
			npac: {
				min: 35,
				max: 40
			},
			ice_fraction: {
				min: 51,
				max: 59
			},
			total_solids: {
				min: 25,
				max: 33
			},
			water: {
				min: 67,
				max: 75
			},
			alcohol: ALCOHOL_RANGE
		}
	},
	{
		category: "sorbet",
		temperature_c: -12,
		status: "seeded",
		metrics: {
			pod: {
				min: 15,
				max: 25
			},
			npac: {
				min: 42,
				max: 49
			},
			ice_fraction: {
				min: 51,
				max: 59
			},
			total_solids: {
				min: 25,
				max: 33
			},
			water: {
				min: 67,
				max: 73
			},
			alcohol: ALCOHOL_RANGE
		}
	},
	{
		category: "sorbet",
		temperature_c: -13,
		status: "seeded",
		metrics: {
			pod: {
				min: 15,
				max: 25
			},
			npac: {
				min: 48,
				max: 55
			},
			ice_fraction: {
				min: 50,
				max: 58
			},
			total_solids: {
				min: 25,
				max: 33
			},
			water: {
				min: 67,
				max: 73
			},
			alcohol: ALCOHOL_RANGE
		}
	},
	{
		category: "vegan_gelato",
		temperature_c: -11,
		status: "seeded",
		metrics: {
			pod: {
				min: 13,
				max: 25
			},
			npac: {
				min: 35,
				max: 52
			},
			ice_fraction: {
				min: 45,
				max: 61
			},
			fat: {
				min: 0,
				max: 12
			},
			total_solids: {
				min: 30,
				max: 43
			},
			water: {
				min: 54,
				max: 72
			},
			alcohol: ALCOHOL_RANGE
		}
	},
	{
		category: "vegan_gelato",
		temperature_c: -12,
		status: "seeded",
		metrics: {
			pod: {
				min: 13,
				max: 25
			},
			npac: {
				min: 44,
				max: 59
			},
			ice_fraction: {
				min: 46,
				max: 60
			},
			fat: {
				min: 0,
				max: 12
			},
			total_solids: {
				min: 30,
				max: 43
			},
			water: {
				min: 52,
				max: 70
			},
			alcohol: ALCOHOL_RANGE
		}
	},
	{
		category: "vegan_gelato",
		temperature_c: -13,
		status: "seeded",
		metrics: {
			pod: {
				min: 13,
				max: 25
			},
			npac: {
				min: 50,
				max: 64
			},
			ice_fraction: {
				min: 46,
				max: 58
			},
			fat: {
				min: 0,
				max: 12
			},
			total_solids: {
				min: 30,
				max: 43
			},
			water: {
				min: 50,
				max: 67
			},
			alcohol: ALCOHOL_RANGE
		}
	},
	{
		category: "protein_gelato",
		temperature_c: -11,
		status: "seeded",
		metrics: {
			pod: {
				min: 12,
				max: 17
			},
			npac: {
				min: 33,
				max: 42
			},
			ice_fraction: {
				min: 45,
				max: 54.5
			},
			fat: {
				min: 5,
				max: 12
			},
			total_solids: {
				min: 31,
				max: 45
			},
			water: {
				min: 57,
				max: 70
			},
			alcohol: ALCOHOL_RANGE
		}
	},
	{
		category: "protein_gelato",
		temperature_c: -12,
		status: "seeded",
		metrics: {
			pod: {
				min: 12,
				max: 17
			},
			npac: {
				min: 42,
				max: 50
			},
			ice_fraction: {
				min: 46,
				max: 54
			},
			fat: {
				min: 5,
				max: 12
			},
			total_solids: {
				min: 31,
				max: 44
			},
			water: {
				min: 56,
				max: 70
			},
			alcohol: ALCOHOL_RANGE
		}
	},
	{
		category: "protein_gelato",
		temperature_c: -13,
		status: "seeded",
		metrics: {
			pod: {
				min: 12,
				max: 17
			},
			npac: {
				min: 48,
				max: 55
			},
			ice_fraction: {
				min: 46,
				max: 52
			},
			fat: {
				min: 5,
				max: 12
			},
			total_solids: {
				min: 35,
				max: 45
			},
			water: {
				min: 55,
				max: 65
			},
			alcohol: ALCOHOL_RANGE
		}
	}
];

//#endregion
//#region src/engine/config/version.ts
/**
* Engine versioning (spec §17).
*
* - ENGINE_VERSION bumps on any formula/pipeline change.
* - CONFIG_VERSION bumps on any coefficient/target change.
*
* Every engine result is stamped with both so saved recipes stay reproducible.
*
* Engine history:
* - 0.1.0 — stage functions (composition, pod, pac, iceFraction, statuses).
* - 0.2.0 — calculateRecipe pipeline assembly (the spec §12/§18 entry point).
* - 0.3.0 — pipeline extended with nutrition, cost and scoring stages.
* - 0.4.0 — correction solver added (corrections/: exact gram suggestions,
*   Golden Middle verification, planning/actual-batch contexts, demo
*   redaction at source).
*
* Config history:
* - 0.1.0 — foundation tables (coefficients, targets, modes, priorities, density).
* - 0.2.0 — ice-fraction anchor domain added (config/iceAnchors.ts: seeded
*   milk_gelato @ −11 °C row + calibration-pending temperature slope).
* - 0.3.0 — status classification threshold added (config/targets.ts:
*   IDEAL_ZONE_FRACTION, calibration-pending).
* - 0.4.0 — scoring domain added (config/scoring.ts: indicator weights, status
*   scores, flavor slopes, cost anchors, stability headroom — all
*   calibration-pending).
* - 0.5.0 — FIRST calibration bump: NPAC_NORMALIZATION switched from
*   per_total_mass to per_water_mass, externally confirmed by two active
*   reference fixtures (milk base −11C, raspberry premium −11C). The NPAC
*   formula is unchanged; the canonical basis (config value) changed.
*   ENGINE_VERSION stays 0.4.0 — no pipeline logic changed, the canonical
*   call now supplies the already-computed water_g the per_water branch needs.
* - 0.6.0 — temperature-aware TARGET_BANDS (owner-approved engine slice):
*   11 new seeded cells transcribed VERBATIM from the locked Temperature
*   Regulator docs — milk_gelato −12/−13, chocolate_gelato −11/−12/−13,
*   sorbet −11/−12/−13, vegan_gelato −11/−12/−13. milk_gelato @ −11 is
*   untouched. Sorbet/vegan bands omit the regulator-DISABLED dairy gates
*   (TargetBand.metrics became Partial); chocolate protein_in_solids uses the
*   locked hard minimum 7. The default solver/classifier now targets the
*   recipe's real profile×temperature band for these cells (fallback flags
*   stop firing); fruit/nut/alcohol_gelato keep the documented milk fallback.
*   ENGINE_VERSION stays 0.4.0 — one null-safe accessor for the now-optional
*   alcohol range; no formula or pipeline change.
* - 0.7.0 — ice-anchor connection (owner-authorized 2026-07-18, implementation of
*   already-approved data): two new SEEDED milk_gelato ice-anchor rows for −12 °C
*   and −13 °C, transcribed VERBATIM as the exact (NPAC, ice) coordinates of the
*   locked clean-reference recipes G15/G17 (−12) and G11/G18 (−13) from
*   TEMPERATURE_REGULATOR_GOLDEN_FIXTURES. milk_gelato @ −11 is untouched; every
*   golden recipe is at −11 so no golden ice value changes. This removes the
*   −11-anchor temperature extrapolation that pushed −12/−13 recipes out of the
*   ice band and blocked Monitor recalculation. No value is invented; the
*   ice-fraction FORMULA is unchanged; ENGINE_VERSION stays 0.4.0.
*/
const ENGINE_VERSION = "0.4.0";
const CONFIG_VERSION = "0.7.0";

//#endregion
//#region src/engine/composition.ts
/**
* Spec §6/§15: `effective_grams = actual_grams if present, otherwise planned_grams`.
* `difference = actual − planned` when an actual exists, otherwise 0.
* Returns new item objects; the input array and its objects are not mutated
* (ingredient data is treated as immutable input and shared by reference).
*/
function resolveEffectiveItems(items) {
	return items.map((item) => {
		const is_actual = item.actual_grams !== null;
		const effective_grams = item.actual_grams ?? item.planned_grams;
		return {
			...item,
			effective_grams,
			difference: is_actual ? effective_grams - item.planned_grams : 0,
			is_actual
		};
	});
}
/** Spec §6: `total_batch_g = Σ effective ingredient grams`. */
function computeTotalBatchGrams(items) {
	let total = 0;
	for (const item of items) total += item.effective_grams;
	return total;
}
/** Spec §6: `component_g = ingredient_grams × component_percent / 100`. */
function computeComponentGrams(ingredientGrams, componentPercent) {
	return ingredientGrams * componentPercent / 100;
}
/**
* Spec §6: the 13 component gram totals.
* Spec §5: alcohol is summed exclusively from `alcohol_percent` — it is never
* added into water or solids. Water and solids come only from their own fields.
*/
function computeComponentTotals(items) {
	const totals = {
		water_g: 0,
		solids_g: 0,
		fat_g: 0,
		protein_g: 0,
		lactose_g: 0,
		sucrose_g: 0,
		glucose_g: 0,
		dextrose_g: 0,
		fructose_g: 0,
		polyol_g: 0,
		fiber_g: 0,
		salt_g: 0,
		alcohol_g: 0
	};
	for (const item of items) {
		const g = item.effective_grams;
		const c = item.ingredient.composition;
		totals.water_g += computeComponentGrams(g, c.water_percent);
		totals.solids_g += computeComponentGrams(g, c.solids_percent);
		totals.fat_g += computeComponentGrams(g, c.fat_percent);
		totals.protein_g += computeComponentGrams(g, c.protein_percent);
		totals.lactose_g += computeComponentGrams(g, c.lactose_percent);
		totals.sucrose_g += computeComponentGrams(g, c.sucrose_percent);
		totals.glucose_g += computeComponentGrams(g, c.glucose_percent);
		totals.dextrose_g += computeComponentGrams(g, c.dextrose_percent);
		totals.fructose_g += computeComponentGrams(g, c.fructose_percent);
		totals.polyol_g += computeComponentGrams(g, c.polyol_percent);
		totals.fiber_g += computeComponentGrams(g, c.fiber_percent);
		totals.salt_g += computeComponentGrams(g, c.salt_percent);
		totals.alcohol_g += computeComponentGrams(g, c.alcohol_percent);
	}
	return totals;
}
/**
* Spec §6: `component_percent = component_g / total_batch_g × 100`.
* Division-by-zero safe: an empty or zero-mass batch yields all-zero percentages.
*/
function computePercentages(totals, totalBatchG) {
	const pct = (componentG) => totalBatchG > 0 ? componentG / totalBatchG * 100 : 0;
	return {
		water_percent: pct(totals.water_g),
		solids_percent: pct(totals.solids_g),
		fat_percent: pct(totals.fat_g),
		protein_percent: pct(totals.protein_g),
		lactose_percent: pct(totals.lactose_g),
		sucrose_percent: pct(totals.sucrose_g),
		glucose_percent: pct(totals.glucose_g),
		dextrose_percent: pct(totals.dextrose_g),
		fructose_percent: pct(totals.fructose_g),
		polyol_percent: pct(totals.polyol_g),
		fiber_percent: pct(totals.fiber_g),
		salt_percent: pct(totals.salt_g),
		alcohol_percent: pct(totals.alcohol_g)
	};
}
/**
* Spec §4: sugar types stay separate — never one generic number.
* `other_sugar_g` is the per-ingredient remainder of `sugar_percent` not covered
* by the typed split (sucrose + glucose + dextrose + fructose + lactose), clamped
* at 0 per ingredient to absorb label/data noise. Polyols are tracked from
* `polyol_percent` and are not part of `sugar_percent` (EU label convention).
*/
function computeSugarBreakdown(items) {
	const sugar = {
		sucrose_g: 0,
		glucose_g: 0,
		dextrose_g: 0,
		fructose_g: 0,
		lactose_g: 0,
		polyol_g: 0,
		other_sugar_g: 0
	};
	for (const item of items) {
		const g = item.effective_grams;
		const c = item.ingredient.composition;
		const sucrose = computeComponentGrams(g, c.sucrose_percent);
		const glucose = computeComponentGrams(g, c.glucose_percent);
		const dextrose = computeComponentGrams(g, c.dextrose_percent);
		const fructose = computeComponentGrams(g, c.fructose_percent);
		const lactose = computeComponentGrams(g, c.lactose_percent);
		const totalSugar = computeComponentGrams(g, c.sugar_percent);
		const typed = sucrose + glucose + dextrose + fructose + lactose;
		sugar.sucrose_g += sucrose;
		sugar.glucose_g += glucose;
		sugar.dextrose_g += dextrose;
		sugar.fructose_g += fructose;
		sugar.lactose_g += lactose;
		sugar.polyol_g += computeComponentGrams(g, c.polyol_percent);
		sugar.other_sugar_g += Math.max(0, totalSugar - typed);
	}
	return sugar;
}
/**
* Composition stage entry point: effective items → batch mass → component
* totals → percentages → sugar breakdown. Pure and deterministic; safe for
* empty recipes (all-zero totals and percentages, no NaN).
*/
function computeComposition(items) {
	const effectiveItems = resolveEffectiveItems(items);
	const total_batch_g = computeTotalBatchGrams(effectiveItems);
	const totals = computeComponentTotals(effectiveItems);
	return {
		items: effectiveItems,
		total_batch_g,
		totals,
		percentages: computePercentages(totals, total_batch_g),
		sugar: computeSugarBreakdown(effectiveItems)
	};
}

//#endregion
//#region src/engine/pod.ts
/**
* POD — relative sweetening power (spec §7).
*
* POD is calculated from sugar-TYPE contributions, never from total sugar:
* `sugar_percent` is never read here. Coefficients come exclusively from
* src/engine/config/coefficients.ts (passed as a parameter, defaulting to
* POD_COEFFICIENTS) — no inline coefficients.
*
* Stored-value-first rule (spec §7): a non-null ingredient `pod_value` wins over
* the breakdown fallback. Convention: `pod_value` is on the per-100 g points
* scale with sucrose = 100 (pure sucrose stores 100), so an ingredient
* contribution is `effective_grams × pod_value / 100` — the same point-gram
* unit as the coefficient path. This convention is validated/corrected by the
* honey and glucose-syrup external reference fixtures at calibration (spec §16).
*
* Polyols and untyped "other" sugar are ingredient-specific per the spec §7
* table: the breakdown fallback contributes 0 for them — their correct path is
* a stored `pod_value`. Seed/ingredient data must store `pod_value` for polyol
* and special ingredients (honey, syrups, invert).
*
* All functions are pure, deterministic and never mutate their inputs.
* No PAC/NPAC here — freezing power is a separate later stage (spec §8).
*/
/**
* One ingredient's POD term in point-grams (the Σ numerator of the spec §7
* formula): stored `pod_value` if present, otherwise the typed sugar breakdown
* weighted by the config coefficients.
*/
function ingredientPodContribution(item, coefficients = POD_COEFFICIENTS) {
	const { ingredient, effective_grams } = item;
	if (ingredient.pod_value !== null) return effective_grams * ingredient.pod_value / 100;
	const c = ingredient.composition;
	return computeComponentGrams(effective_grams, c.sucrose_percent) * coefficients.sucrose + computeComponentGrams(effective_grams, c.dextrose_percent) * coefficients.dextrose + computeComponentGrams(effective_grams, c.glucose_percent) * coefficients.glucose + computeComponentGrams(effective_grams, c.fructose_percent) * coefficients.fructose + computeComponentGrams(effective_grams, c.lactose_percent) * coefficients.lactose;
}
/**
* Spec §7: `pod_points = Σ(component_g × pod_coefficient) / total_batch_g × 100`,
* with stored ingredient `pod_value` converted to the same point-gram unit.
* Division-by-zero safe: an empty or zero-mass batch yields 0 — never NaN or
* Infinity.
*/
function computeRecipePod(items, totalBatchG, coefficients = POD_COEFFICIENTS) {
	if (totalBatchG <= 0) return 0;
	let pointGrams = 0;
	for (const item of items) pointGrams += ingredientPodContribution(item, coefficients);
	return pointGrams / totalBatchG * 100;
}

//#endregion
//#region src/engine/pac.ts
/**
* PAC / NPAC — freezing-point depression power (spec §8).
*
* Working definitions (spec §8 calibration box — calibration-pending):
* PAC = anti-freezing power of the sugar spectrum; NPAC = net total freezing
* depression including alcohol and salt. Calculated separately from POD with
* their own coefficient tables from src/engine/config/coefficients.ts —
* no inline coefficients.
*
* Per-ingredient precedence (documented, no double counting):
*   1. Stored value first (spec §8): a non-null `pac_value` wins for BOTH PAC and
*      NPAC. Convention: per-100 g points, sucrose = 100 (mirrors `pod_value`).
*      `pac_value` is the NET freezing-power source of truth — it already covers
*      alcohol/salt for that ingredient, so nothing is added on top. Ingredient-
*      level `npac_value` is NOT used (v0.95 no-NPAC hotfix); recipe-level NPAC is
*      derived by the engine, never stored on an ingredient.
*   2. Syrup DE path: non-null `de_value` → the anchor-interpolated coefficient
*      applied to the ingredient's SOLIDS grams. This replaces the typed
*      sugar-breakdown part for that ingredient (validated by the
*      `dry-glucose-syrup-39de` external reference fixture at calibration).
*   3. Fallback: typed sugar breakdown (sucrose/dextrose/glucose/fructose/
*      lactose). Unnamed polyols/special ingredients contribute 0 here —
*      their path is a stored value (consistent with POD).
*
* Alcohol (spec §5/§8): computed from `alcohol_percent` only — never counted
* as water or solids — and must strongly increase freezing depression
* (coefficient 7.4 > every sugar). Salt uses the configured coefficient
* (11.7, flagged CALIBRATION-SENSITIVE in config).
*
* Normalization (spec §8): `per_water_mass` is the EXTERNALLY-CONFIRMED canonical
* basis (CONFIG_VERSION 0.5.0) — two verified external reference fixtures reproduce
* the reference NPAC per water mass. `per_total_mass` remains available as the
* explicit alternative. This module computes whichever basis is selected; it adds
* no policy — callers under per_water must supply `water_g`.
*
* All functions are pure, deterministic and never mutate their inputs.
* No ice fraction here — that is a separate later stage (spec §9).
*/
/**
* Deterministic piecewise-linear interpolation over the configured syrup DE
* anchors (spec §8 — no behavior beyond the documented anchor table):
* exact anchor hits return the anchor values; outside the anchor range the
* nearest end anchor is used (clamped).
*/
function interpolateSyrupDeAnchors(de, anchors = SYRUP_DE_ANCHORS) {
	if (anchors.length === 0) return {
		pod: 0,
		pac: 0
	};
	const first = anchors[0];
	if (de <= first.de) return {
		pod: first.pod,
		pac: first.pac
	};
	const last = anchors[anchors.length - 1];
	if (de >= last.de) return {
		pod: last.pod,
		pac: last.pac
	};
	for (let i = 1; i < anchors.length; i++) {
		const hi = anchors[i];
		if (de <= hi.de) {
			const lo = anchors[i - 1];
			const t = (de - lo.de) / (hi.de - lo.de);
			return {
				pod: lo.pod + t * (hi.pod - lo.pod),
				pac: lo.pac + t * (hi.pac - lo.pac)
			};
		}
	}
	return {
		pod: last.pod,
		pac: last.pac
	};
}
/** Typed sugar-spectrum point-grams (shared fallback for PAC and NPAC). */
function sugarSpectrumPointGrams(item, coefficients) {
	const c = item.ingredient.composition;
	const g = item.effective_grams;
	return computeComponentGrams(g, c.sucrose_percent) * coefficients.sucrose + computeComponentGrams(g, c.dextrose_percent) * coefficients.dextrose + computeComponentGrams(g, c.glucose_percent) * coefficients.glucose + computeComponentGrams(g, c.fructose_percent) * coefficients.fructose + computeComponentGrams(g, c.lactose_percent) * coefficients.lactose;
}
/** Syrup DE part: anchor coefficient applied to the ingredient's solids grams. */
function syrupDePointGrams(item, deValue, anchors) {
	return computeComponentGrams(item.effective_grams, item.ingredient.composition.solids_percent) * interpolateSyrupDeAnchors(deValue, anchors).pac;
}
/**
* One ingredient's PAC term in point-grams: stored `pac_value` → DE path →
* typed sugar breakdown (see module precedence rules).
*/
function ingredientPacContribution(item, coefficients = PAC_COEFFICIENTS, anchors = SYRUP_DE_ANCHORS) {
	const { ingredient, effective_grams } = item;
	if (ingredient.pac_value !== null) return effective_grams * ingredient.pac_value / 100;
	if (ingredient.de_value !== null) return syrupDePointGrams(item, ingredient.de_value, anchors);
	return sugarSpectrumPointGrams(item, coefficients);
}
/**
* One ingredient's NPAC term in point-grams.
*
* The stored freezing-power source of truth is `pac_value` (net, sucrose = 100):
* a non-null `pac_value` wins outright (no alcohol/salt added on top — a stored
* value already accounts for them). Ingredient-level `npac_value` is NOT read
* (v0.95 no-NPAC hotfix): it was a false placeholder that, when 0, collapsed
* recipe NPAC. Otherwise: the sugar-or-DE part plus the net-depression terms —
* `alcohol_g × alcohol` (from `alcohol_percent` only, spec §5) and
* `salt_g × salt` (calibration-sensitive).
*/
function ingredientNpacContribution(item, coefficients = NPAC_COEFFICIENTS, anchors = SYRUP_DE_ANCHORS) {
	const { ingredient, effective_grams } = item;
	if (ingredient.pac_value !== null) return effective_grams * ingredient.pac_value / 100;
	const c = ingredient.composition;
	return (ingredient.de_value !== null ? syrupDePointGrams(item, ingredient.de_value, anchors) : sugarSpectrumPointGrams(item, coefficients)) + computeComponentGrams(effective_grams, c.alcohol_percent) * coefficients.alcohol + computeComponentGrams(effective_grams, c.salt_percent) * coefficients.salt;
}
/**
* Recipe PAC: `Σ ingredientPacContribution / total_batch_g × 100`.
* Always normalized per total batch mass. Zero/empty batch → 0, never NaN.
*/
function computeRecipePac(items, totalBatchG, coefficients = PAC_COEFFICIENTS, anchors = SYRUP_DE_ANCHORS) {
	if (totalBatchG <= 0) return 0;
	let pointGrams = 0;
	for (const item of items) pointGrams += ingredientPacContribution(item, coefficients, anchors);
	return pointGrams / totalBatchG * 100;
}
/**
* Recipe NPAC: `Σ ingredientNpacContribution / denominator × 100`.
*
* Denominator follows the normalization basis: the canonical default
* `per_water_mass` (CONFIG 0.5.0) divides by `options.water_g`; the
* `per_total_mass` alternative divides by `totalBatchG` and never reads `water_g`.
* The basis was decided by two active external reference fixtures (spec §8).
* Zero/empty/missing denominator → 0, never NaN or Infinity (so a per_water call
* with no water_g safely yields 0 — callers must supply water_g).
*/
function computeRecipeNpac(items, totalBatchG, options = {}) {
	const { coefficients = NPAC_COEFFICIENTS, anchors = SYRUP_DE_ANCHORS, normalization = NPAC_NORMALIZATION, water_g } = options;
	const denominator = normalization === "per_water_mass" ? water_g ?? 0 : totalBatchG;
	if (denominator <= 0) return 0;
	let pointGrams = 0;
	for (const item of items) pointGrams += ingredientNpacContribution(item, coefficients, anchors);
	return pointGrams / denominator * 100;
}

//#endregion
//#region src/engine/sorbetFreezingPhysics.ts
const CHEN_TEMPERATURE_FACTOR_C = 1860 / 18.01528;
/** Runtime authority requested and validated for the three serving temperatures. */
const SORBET_FREEZING_SUPPORTED_TEMPERATURE_C = Object.freeze({
	min: -13,
	max: -11
});
/**
* True when the composition-sensitive Sorbet solver is the DIRECT ice authority
* at `temperatureCelsius` (−13 … −11 °C). Outside this range Sorbet has no ice
* authority at all: it never inherits milk-gelato anchor rows, so callers must
* fail closed rather than substitute another category's curve.
*/
function isSorbetFreezingTemperatureSupported(temperatureCelsius) {
	return Number.isFinite(temperatureCelsius) && temperatureCelsius >= SORBET_FREEZING_SUPPORTED_TEMPERATURE_C.min && temperatureCelsius <= SORBET_FREEZING_SUPPORTED_TEMPERATURE_C.max;
}
/**
* `calculateRecipe` reports an unavailable Sorbet solver as a
* `composition_invalid` warning whose `context.reason` is this prefix followed
* by the `SorbetFreezingUnavailableReason`. Consumers (Monitor status, QA)
* must read that contract through `sorbetFreezingUnavailableReasonFromWarnings`
* instead of ad-hoc string matching.
*/
const SORBET_FREEZING_WARNING_REASON_PREFIX = "sorbet_freezing_";
/**
* The source design has F+G+S=0.95 of dry solids. Its five real-fruit
* validation systems span 0.571..0.917. We permit exactly their combined
* published domain and do not extrapolate to low-sugar solids or >95% sugar.
*/
const MIN_MODELED_SUGAR_DRY_SOLIDS_FRACTION = .571;
/**
* Canonical composition rows can carry trace mineral/salt rounding (for
* example a mineral declaration on fruit/fibre). Below 0.05% of the mix the source data cannot
* resolve that trace separately, so it is treated as composition precision,
* not assigned an antifreeze coefficient. At or above this threshold the
* unsupported solute fails closed.
*/
const SORBET_UNSUPPORTED_FREEZE_ACTIVE_TRACE_FRACTION = 5e-4;
const FRACTION_TOLERANCE = 1e-12;
const finiteNonNegative = (value) => Number.isFinite(value) && value >= 0;
const unavailable = (reason, parameters = null) => ({
	status: "unavailable",
	authority: "grajales_lagunes_composition_chen",
	reason,
	parameters
});
/** Published Scheffe regressions, Eqs. 9 and 10. */
function sorbetChenCompositionParameters(input) {
	const xF = input.fructoseDrySolidsFraction;
	const xG = input.glucoseDrySolidsFraction;
	const xS = input.sucroseDrySolidsFraction;
	if (![
		xF,
		xG,
		xS
	].every(finiteNonNegative)) return null;
	const modeledSugarDrySolidsFraction = xF + xG + xS;
	const chenE = .081 * xF + .071 * xG + .064 * xS + .039 * xF * xG - .002 * xF * xS + .074 * xG * xS + .545 * xF * xG * xS;
	const chenB = .172 * xF + .223 * xG + .114 * xS + .144 * xF * xG + .243 * xF * xS - .106 * xG * xS - 5.175 * xF * xG * xS;
	if (!Number.isFinite(chenE) || !Number.isFinite(chenB)) return null;
	return {
		fructoseDrySolidsFraction: xF,
		glucoseDrySolidsFraction: xG,
		sucroseDrySolidsFraction: xS,
		modeledSugarDrySolidsFraction,
		chenE,
		chenB
	};
}
/** Source Eq. 7, returning the equilibrium melting/freezing point in Celsius. */
function sorbetChenFreezingPointCelsius(drySolidsMassFraction, parameters) {
	if (!Number.isFinite(drySolidsMassFraction) || drySolidsMassFraction <= 0 || drySolidsMassFraction >= 1 || !Number.isFinite(parameters.chenE) || parameters.chenE <= 0 || !Number.isFinite(parameters.chenB) || parameters.chenB < 0) return null;
	const unboundWaterTerm = 1 - drySolidsMassFraction - parameters.chenB * drySolidsMassFraction;
	const denominator = unboundWaterTerm + parameters.chenE * drySolidsMassFraction;
	if (unboundWaterTerm <= 0 || denominator <= 0) return null;
	const value = CHEN_TEMPERATURE_FACTOR_C * Math.log(unboundWaterTerm / denominator);
	return Number.isFinite(value) ? value : null;
}
function solveSorbetFreezingPhysics(input) {
	if (![
		input.totalMixtureGrams,
		input.initialWaterGrams,
		input.totalDrySolidsGrams,
		input.sucroseGrams,
		input.glucoseGrams,
		input.dextroseGrams,
		input.fructoseGrams,
		input.unsupportedFreezeActiveSolidsGrams
	].every(finiteNonNegative) || input.totalMixtureGrams <= 0 || input.initialWaterGrams <= 0 || input.totalDrySolidsGrams <= 0 || !Number.isFinite(input.temperatureCelsius)) return unavailable("invalid_input");
	const massToleranceGrams = Math.max(1e-9, input.totalMixtureGrams * 1e-9);
	if (Math.abs(input.initialWaterGrams + input.totalDrySolidsGrams - input.totalMixtureGrams) > massToleranceGrams) return unavailable("mass_balance_mismatch");
	if (!isSorbetFreezingTemperatureSupported(input.temperatureCelsius)) return unavailable("unsupported_temperature");
	const unsupportedTraceToleranceGrams = Math.max(massToleranceGrams, input.totalMixtureGrams * SORBET_UNSUPPORTED_FREEZE_ACTIVE_TRACE_FRACTION);
	if (input.unsupportedFreezeActiveSolidsGrams >= unsupportedTraceToleranceGrams) return unavailable("unsupported_freeze_active_solute");
	const glucoseEquivalentGrams = input.glucoseGrams + input.dextroseGrams;
	if (input.fructoseGrams + glucoseEquivalentGrams + input.sucroseGrams > input.totalDrySolidsGrams + massToleranceGrams) return unavailable("invalid_input");
	const parameters = sorbetChenCompositionParameters({
		fructoseDrySolidsFraction: input.fructoseGrams / input.totalDrySolidsGrams,
		glucoseDrySolidsFraction: glucoseEquivalentGrams / input.totalDrySolidsGrams,
		sucroseDrySolidsFraction: input.sucroseGrams / input.totalDrySolidsGrams
	});
	if (!parameters || parameters.chenE <= 0 || parameters.chenB < 0) return unavailable("invalid_composition_regression", parameters);
	if (parameters.modeledSugarDrySolidsFraction < MIN_MODELED_SUGAR_DRY_SOLIDS_FRACTION - FRACTION_TOLERANCE || parameters.modeledSugarDrySolidsFraction > .9500000000009999) return unavailable("sugar_share_outside_validated_domain", parameters);
	const initialDrySolidsFraction = input.totalDrySolidsGrams / input.totalMixtureGrams;
	const initialFreezingPointCelsius = sorbetChenFreezingPointCelsius(initialDrySolidsFraction, parameters);
	if (initialFreezingPointCelsius === null) return unavailable("invalid_composition_regression", parameters);
	let equilibriumDrySolidsFraction = initialDrySolidsFraction;
	if (input.temperatureCelsius < initialFreezingPointCelsius) {
		const q = Math.exp(input.temperatureCelsius / CHEN_TEMPERATURE_FACTOR_C);
		const a = 1 + parameters.chenB;
		const denominator = a - q * (a - parameters.chenE);
		const solved = (1 - q) / denominator;
		const physicalUpper = Math.min(1 - FRACTION_TOLERANCE, 1 / (1 + parameters.chenB) - FRACTION_TOLERANCE);
		if (!Number.isFinite(solved) || solved < initialDrySolidsFraction - FRACTION_TOLERANCE || solved > physicalUpper) return unavailable("equilibrium_not_reachable", parameters);
		equilibriumDrySolidsFraction = Math.max(initialDrySolidsFraction, solved);
	}
	const liquidWaterGrams = input.totalDrySolidsGrams * (1 - equilibriumDrySolidsFraction) / equilibriumDrySolidsFraction;
	const iceMassGrams = input.initialWaterGrams - liquidWaterGrams;
	if (!Number.isFinite(liquidWaterGrams) || !Number.isFinite(iceMassGrams) || liquidWaterGrams < -massToleranceGrams || iceMassGrams < -massToleranceGrams || iceMassGrams > input.initialWaterGrams + massToleranceGrams) return unavailable("equilibrium_not_reachable", parameters);
	const boundedLiquidWaterGrams = Math.max(0, Math.min(input.initialWaterGrams, liquidWaterGrams));
	const boundedIceMassGrams = input.initialWaterGrams - boundedLiquidWaterGrams;
	const totalSerumGrams = boundedLiquidWaterGrams + input.totalDrySolidsGrams;
	return {
		status: "available",
		authority: "grajales_lagunes_composition_chen",
		parameters,
		initialFreezingPointCelsius,
		equilibriumSerum: {
			liquidWaterGrams: boundedLiquidWaterGrams,
			dissolvedDrySolidsGrams: input.totalDrySolidsGrams,
			totalSerumGrams,
			waterMassFraction: boundedLiquidWaterGrams / totalSerumGrams,
			drySolidsMassFraction: input.totalDrySolidsGrams / totalSerumGrams
		},
		iceMassGrams: boundedIceMassGrams,
		iceMassFractionOfMix: boundedIceMassGrams / input.totalMixtureGrams,
		frozenFractionOfInitialWater: boundedIceMassGrams / input.initialWaterGrams,
		massConservationResidualGrams: boundedIceMassGrams + totalSerumGrams - input.totalMixtureGrams,
		iterations: 0
	};
}

//#endregion
//#region src/engine/config/iceAnchors.ts
/**
* Seeded milk_gelato anchor rows, all transcribed from ALREADY-APPROVED reference
* records — nothing here is invented.
*
*  • −11 °C: verbatim from the LOCKED spec (NPAC 33 → 54.5 % ice; 42 → 45 %).
*  • −12 °C and −13 °C (CONFIG 0.7.0, owner-authorized 2026-07-18): the two anchor
*    points per temperature are the exact (NPAC, ice-fraction) coordinates of the
*    LOCKED clean-reference recipes in
*    `src/spine/temperatureRegulator.ts::TEMPERATURE_REGULATOR_GOLDEN_FIXTURES`:
*      −12: G15 (NPAC 44.98 → 50.35 %) and G17 (NPAC 46.18 → 50.34 %);
*      −13: G11 (NPAC 51.77 → 49.73 %) and G18 (NPAC 53.15 → 49.69 %).
*    This CONNECTS previously-approved data that was never wired into the ice model;
*    it is implementation of approved values, not new calibration. It removes the
*    −11-anchor temperature extrapolation that made −12/−13 recipes fall out of the
*    ice band and blocked Monitor recalculation.
*
* HONEST LIMITATION (documented, not blocking — see
* docs/engine/TRACK_G_ICE_ANCHOR_WIRING.md): the two clean anchors at each of
* −12/−13 sit close together in NPAC (Δ≈1.2 / 1.4), so the WITHIN-band ice-vs-NPAC
* slope is weakly constrained (near-flat ≈ the approved clean-anchor ice level).
* That is sufficient for the actual defect — the NPAC, POD and ice bands are now
* JOINTLY satisfiable, so the solver finds real corrections — but a
* production-grade slope would need additional approved validation points spread
* across the band. No such points exist in the approved records, so none are
* invented. Unseeded categories still fall back to the milk_gelato rows at the
* same temperature (a pre-existing, documented category-fallback approximation) —
* EXCEPT Sorbet, whose ice authority is the composition-sensitive solver in
* `src/engine/sorbetFreezingPhysics.ts` and which therefore never reads these
* rows (see `estimateIceFraction` and `hasDirectIceAuthorityAtTemperature`).
*/
const ICE_ANCHOR_ROWS = [
	{
		category: "milk_gelato",
		temperature_c: -11,
		npac_low: 33,
		ice_at_npac_low: 54.5,
		npac_high: 42,
		ice_at_npac_high: 45,
		status: "seeded",
		source: "locked_spec_v1"
	},
	{
		category: "milk_gelato",
		temperature_c: -12,
		npac_low: 44.98,
		ice_at_npac_low: 50.35,
		npac_high: 46.18,
		ice_at_npac_high: 50.34,
		status: "seeded",
		source: "golden_fixtures:G15,G17"
	},
	{
		category: "milk_gelato",
		temperature_c: -13,
		npac_low: 51.77,
		ice_at_npac_low: 49.73,
		npac_high: 53.15,
		ice_at_npac_high: 49.69,
		status: "seeded",
		source: "golden_fixtures:G11,G18"
	},
	{
		category: "protein_gelato",
		temperature_c: -11,
		npac_low: 33,
		ice_at_npac_low: 54.5,
		npac_high: 42,
		ice_at_npac_high: 45,
		status: "seeded",
		source: "owner_approved_standard_physics:locked_spec_v1"
	},
	{
		category: "protein_gelato",
		temperature_c: -12,
		npac_low: 44.98,
		ice_at_npac_low: 50.35,
		npac_high: 46.18,
		ice_at_npac_high: 50.34,
		status: "seeded",
		source: "owner_approved_standard_physics:G15,G17"
	},
	{
		category: "protein_gelato",
		temperature_c: -13,
		npac_low: 51.77,
		ice_at_npac_low: 49.73,
		npac_high: 53.15,
		ice_at_npac_high: 49.69,
		status: "seeded",
		source: "owner_approved_standard_physics:G11,G18"
	}
];
/**
* The dairy category every unseeded, non-Sorbet category currently borrows.
* Vegan is one of them — see `config/veganFreezingAuthority.ts`.
*/
const ICE_ANCHOR_CATEGORY_FALLBACK = "milk_gelato";
/**
* SINGLE SEAM for anchor-row selection, used by `estimateIceFraction`.
*
* Category-first; Sorbet never borrows (its authority is the composition
* solver); every other unseeded category falls back to the documented
* `milk_gelato` rows. Behaviour is byte-for-byte the historical inline rule.
*
* This is the ONE place the borrowed-dairy dependency is expressed, so a future
* Vegan freezing authority replaces it here and nowhere else.
*/
function resolveIceAnchorRows(anchors, category) {
	const own = anchors.filter((row) => row.category === category);
	if (own.length > 0) return own;
	if (category === "sorbet") return [];
	return anchors.filter((row) => row.category === ICE_ANCHOR_CATEGORY_FALLBACK);
}

//#endregion
//#region src/engine/iceFraction.ts
/**
* Ice fraction — anchor-matrix MVP estimation (spec §9).
*
* Estimates the category-anchored ice-fraction percentage at the target serving
* temperature from (category, temperature, NPAC) for the anchor-calibrated
* categories (milk / protein gelato and the documented milk fallback). It is NOT
* a Sorbet authority: Sorbet ice is ice mass / total mix mass from the
* composition-sensitive solver (`sorbetFreezingPhysics.ts`); this function
* returns null for Sorbet whenever no Sorbet anchor rows exist (none are seeded
* and none may be invented). Inverse-linear inside the calibrated band:
* higher NPAC ⇒ more freezing depression ⇒ SOFTER gelato ⇒ lower ice fraction;
* lower NPAC ⇒ harder ⇒ higher ice fraction.
*
* Strategy (documented; every fallback is CALIBRATION-PENDING):
* 1. Invalid input (null/NaN/negative NPAC, NaN temperature, no anchors)
*    → null. The function never throws in normal recipe use.
* 2. temperature ≥ 0 °C → 0 (physical bound: nothing freezes at or above 0).
* 3. Row selection is CATEGORY-FIRST: anchors are filtered by the input
*    category. Sorbet never falls back because its production path is the
*    composition-sensitive solver in calculateRecipe. Other unseeded
*    categories retain the documented milk_gelato fallback, and return null
*    if even those rows are absent. Within the rows: exact temperature match,
*    otherwise nearest by |Δtemp| (tie → the colder row).
* 4. NPAC inside the band: linear between (npac_low → ice_at_npac_low) and
*    (npac_high → ice_at_npac_high). Outside the band: linear extrapolation on
*    the same band slope, then clamped to the physical [0, 100] range — always
*    finite, never NaN/Infinity.
* 5. Non-anchored temperatures: the row result shifts by
*    (row.temperature − target) × temperature_slope (colder ⇒ more ice) —
*    the slope is a calibration-pending estimate from config.
*
* Upgrade path (spec §9): per-category anchor rows and/or a freezing-curve
* model can replace these internals later with the same signature.
* Only active external reference fixtures may calibrate anchors or slope (spec §16).
* Pure and deterministic; inputs are never mutated.
*/
/** Nearest row by |Δtemperature|; ties resolve to the colder row (deterministic). */
function selectNearestRow(rows, temperatureC) {
	let selected = rows[0];
	let bestDistance = Math.abs(selected.temperature_c - temperatureC);
	for (const candidate of rows) {
		const distance = Math.abs(candidate.temperature_c - temperatureC);
		if (distance < bestDistance || distance === bestDistance && candidate.temperature_c < selected.temperature_c) {
			selected = candidate;
			bestDistance = distance;
		}
	}
	return selected;
}
function estimateIceFraction(input, options = {}) {
	const { anchors = ICE_ANCHOR_ROWS, temperature_slope = 2 } = options;
	const { npac, temperature_c, category } = input;
	if (npac === null || Number.isNaN(npac) || npac < 0) return null;
	if (Number.isNaN(temperature_c)) return null;
	if (anchors.length === 0) return null;
	if (temperature_c >= 0) return 0;
	const rows = resolveIceAnchorRows(anchors, category);
	if (rows.length === 0) return null;
	const row = selectNearestRow(rows, temperature_c);
	if (row.npac_high === row.npac_low) return null;
	const bandSlope = (row.ice_at_npac_high - row.ice_at_npac_low) / (row.npac_high - row.npac_low);
	const shifted = row.ice_at_npac_low + (npac - row.npac_low) * bandSlope + (row.temperature_c - temperature_c) * temperature_slope;
	return Math.min(100, Math.max(0, shifted));
}

//#endregion
//#region src/engine/statuses.ts
/**
* Status classification — target-band evaluation into PI indicator statuses
* (spec §9 bands, §12.7 vocabulary). This layer only CONVERTS existing numeric
* engine values into statuses: no scoring, no corrections, no suggestions.
*
* Rules:
* - Band selection is category-first and temperature-aware. An unseeded
*   category falls back to the milk_gelato bands — explicitly a
*   CALIBRATION-PENDING fallback, flagged on every indicator. Non-anchored
*   temperatures use the nearest band by |Δtemp| (tie → colder; same documented
*   strategy as iceFraction.ts), also flagged. No fake target bands are ever
*   invented for uncalibrated categories or temperatures.
* - Warn thresholds (`warn_above`/`warn_below`) are honored before the band
*   check; out-of-band values map through the per-metric directional table;
*   in-band values split ideal/good by distance from the band center using the
*   calibration-pending IDEAL_ZONE_FRACTION from config.
* - Missing values or missing bands classify as 'needs_correction' (the safe
*   "cannot assess" status — the vocabulary has no 'unknown'); nothing throws
*   in normal recipe use.
* - 'premium' and 'too_expensive' exist in the vocabulary but are produced by
*   the later cost/scoring stage, not here.
*
* All functions are pure, deterministic and never mutate their inputs.
*/
const CATEGORY_FALLBACK = "milk_gelato";
/** Directional out-of-band statuses per metric (spec §12.7 vocabulary).
* Risk-type metrics are one-sided: below their band is 'good' (lower risk is
* never bad). Unspecified directions default to 'needs_correction'. */
const DIRECTIONAL_STATUS = {
	pod: {
		below: "too_weak",
		above: "too_sweet"
	},
	npac: {
		below: "too_hard",
		above: "too_soft"
	},
	ice_fraction: {
		below: "too_soft",
		above: "too_hard"
	},
	water: {
		below: "needs_correction",
		above: "risky"
	},
	total_solids: {
		below: "risky",
		above: "needs_correction"
	},
	lactose: {
		below: "needs_correction",
		above: "risky"
	},
	lactose_sandiness_risk: {
		below: "good",
		above: "risky"
	},
	alcohol: {
		below: "good",
		above: "risky"
	},
	fat: {
		below: "needs_correction",
		above: "needs_correction"
	},
	aerating_protein: {
		below: "needs_correction",
		above: "needs_correction"
	},
	protein_in_solids: {
		below: "needs_correction",
		above: "needs_correction"
	}
};
/** Stable PI indicator order (the spec §9 metric table order). */
const METRIC_ORDER = [
	"pod",
	"npac",
	"ice_fraction",
	"lactose",
	"lactose_sandiness_risk",
	"fat",
	"aerating_protein",
	"protein_in_solids",
	"total_solids",
	"water",
	"alcohol"
];
/**
* Category-first, temperature-aware band selection with the documented
* calibration-pending milk_gelato fallback. Returns null when nothing is
* configured — fake bands are never invented.
*/
function selectTargetBand(category, temperatureC, bands = TARGET_BANDS) {
	if (Number.isNaN(temperatureC)) return null;
	let rows = bands.filter((band) => band.category === category);
	const category_fallback = rows.length === 0;
	if (category_fallback) rows = bands.filter((band) => band.category === CATEGORY_FALLBACK);
	if (rows.length === 0) return null;
	let selected = rows[0];
	let bestDistance = Math.abs(selected.temperature_c - temperatureC);
	for (const candidate of rows) {
		const distance = Math.abs(candidate.temperature_c - temperatureC);
		if (distance < bestDistance || distance === bestDistance && candidate.temperature_c < selected.temperature_c) {
			selected = candidate;
			bestDistance = distance;
		}
	}
	return {
		band: selected,
		category_fallback,
		temperature_fallback: selected.temperature_c !== temperatureC
	};
}
/**
* Core evaluator: one numeric value against one target range.
* Order: missing checks → warn thresholds → out-of-band direction →
* in-band ideal/good split by distance from the band center.
*/
function classifyValue(value, range, metric, options = {}) {
	const { ideal_zone_fraction = IDEAL_ZONE_FRACTION } = options;
	if (value === null || Number.isNaN(value)) return "needs_correction";
	if (!range) return "needs_correction";
	const direction = DIRECTIONAL_STATUS[metric];
	if (range.warn_above !== void 0 && value > range.warn_above) return direction.above;
	if (range.warn_below !== void 0 && value < range.warn_below) return direction.below;
	if (value < range.min) return direction.below;
	if (value > range.max) return direction.above;
	const halfWidth = (range.max - range.min) / 2;
	if (halfWidth <= 0) return "good";
	const center = (range.min + range.max) / 2;
	return Math.abs(value - center) / halfWidth <= ideal_zone_fraction ? "ideal" : "good";
}
/** One classified indicator — preserves key, value, range, band provenance. */
function classifyIndicator(metric, value, selection, options = {}) {
	const range = selection?.band.metrics[metric] ?? null;
	return {
		key: metric,
		value,
		status: classifyValue(value, range, metric, options),
		band: range,
		band_status: selection?.band.status ?? null,
		category_fallback: selection?.category_fallback ?? false,
		temperature_fallback: selection?.temperature_fallback ?? false
	};
}
/** All 11 PI metrics classified in stable order with a single band selection. */
function classifyRecipeIndicators(inputs, category, temperatureC, options = {}) {
	const { bands = TARGET_BANDS, ...classifyOptions } = options;
	const selection = selectTargetBand(category, temperatureC, bands);
	return METRIC_ORDER.map((metric) => classifyIndicator(metric, inputs[metric], selection, classifyOptions));
}
/**
* Lactose sandiness risk — the spec §9 working definition made computable from
* existing composition values: lactose concentration relative to the water
* phase (`lactose_g / water_g × 100`).
* CALIBRATION-PENDING: the exact scoring formula is finalized against the
* external calibration fixtures (spec §9/§16); until then this is the
* documented working definition, not verified truth.
* Null-safe: invalid or non-positive water returns null, never NaN/Infinity.
*/
function computeLactoseSandinessRisk(lactoseG, waterG) {
	if (!Number.isFinite(lactoseG) || !Number.isFinite(waterG)) return null;
	if (lactoseG < 0 || waterG <= 0) return null;
	return lactoseG / waterG * 100;
}

//#endregion
//#region src/engine/cost.ts
/** Standard serving sizes (grams) reported on every cost result. */
const STANDARD_SERVINGS_G = [
	60,
	70,
	80
];
function computeRecipeCosts(items, totalBatchG, customServingG) {
	const missing_cost_ingredient_ids = [];
	let total = 0;
	for (const item of items) {
		const costPerKg = item.ingredient.cost_per_kg;
		if (costPerKg === null) missing_cost_ingredient_ids.push(item.ingredient.id);
		else total += item.effective_grams / 1e3 * costPerKg;
	}
	const complete = missing_cost_ingredient_ids.length === 0;
	const total_cost = complete ? total : null;
	const cost_per_kg = complete && totalBatchG > 0 ? total / totalBatchG * 1e3 : null;
	const serving = (grams) => cost_per_kg !== null ? cost_per_kg * grams / 1e3 : null;
	const costs = {
		total_cost,
		cost_per_kg,
		cost_per_serving_60g: serving(STANDARD_SERVINGS_G[0]),
		cost_per_serving_70g: serving(STANDARD_SERVINGS_G[1]),
		cost_per_serving_80g: serving(STANDARD_SERVINGS_G[2]),
		complete,
		missing_cost_ingredient_ids
	};
	if (customServingG !== void 0) {
		costs.custom_serving_g = customServingG;
		costs.cost_per_custom_serving = customServingG > 0 ? serving(customServingG) : null;
	}
	return costs;
}

//#endregion
//#region src/engine/nutrition.ts
/**
* Nutrition — per-100 g label values (masterplan §12.10; spec §6 mass rules).
*
* Stored-kcal-first: an ingredient's kcal_per_100g is used when > 0; otherwise
* the Atwater fallback derives energy from the composition. No hidden nutrition
* values are invented: saturated fat is reported only when every fat-bearing
* ingredient provides the optional saturated_fat_percent — otherwise null.
*
* Pure, deterministic, non-mutating; zero-mass batches return null.
*/
/**
* Atwater energy factors (kcal per gram) — regulatory standards documented in
* masterplan §12.10, NOT calibration data (hence constants here, not config).
* Polyols count inside carbohydrates on EU labels, so the fallback uses
* (carbohydrate − polyol) × 4 + polyol × 2.4 to avoid double counting.
*/
const ATWATER_KCAL_PER_G = {
	fat: 9,
	protein: 4,
	carbohydrate: 4,
	alcohol: 7,
	fiber: 2,
	polyol: 2.4
};
/** One ingredient's kcal: stored kcal_per_100g when > 0, else Atwater fallback. */
function ingredientKcalContribution(item) {
	const c = item.ingredient.composition;
	const g = item.effective_grams;
	if (c.kcal_per_100g > 0) return g * c.kcal_per_100g / 100;
	const carbExPolyol = Math.max(0, c.carbohydrate_percent - c.polyol_percent);
	return g * (c.fat_percent * ATWATER_KCAL_PER_G.fat + c.protein_percent * ATWATER_KCAL_PER_G.protein + carbExPolyol * ATWATER_KCAL_PER_G.carbohydrate + c.polyol_percent * ATWATER_KCAL_PER_G.polyol + c.fiber_percent * ATWATER_KCAL_PER_G.fiber + c.alcohol_percent * ATWATER_KCAL_PER_G.alcohol) / 100;
}
/** Per-100 g nutrition of the mix. Null for zero-mass batches. */
function computeNutritionPer100g(items, totalBatchG) {
	if (totalBatchG <= 0) return null;
	let kcal = 0;
	let fat = 0;
	let saturated = 0;
	let saturatedComplete = true;
	let carbohydrate = 0;
	let sugars = 0;
	let protein = 0;
	let salt = 0;
	let fiber = 0;
	let alcohol = 0;
	for (const item of items) {
		const g = item.effective_grams;
		if (g <= 0) continue;
		const c = item.ingredient.composition;
		kcal += ingredientKcalContribution(item);
		fat += computeComponentGrams(g, c.fat_percent);
		if (c.saturated_fat_percent !== void 0) saturated += computeComponentGrams(g, c.saturated_fat_percent);
		else if (c.fat_percent > 0) saturatedComplete = false;
		carbohydrate += computeComponentGrams(g, c.carbohydrate_percent);
		sugars += computeComponentGrams(g, c.sugar_percent);
		protein += computeComponentGrams(g, c.protein_percent);
		salt += computeComponentGrams(g, c.salt_percent);
		fiber += computeComponentGrams(g, c.fiber_percent);
		alcohol += computeComponentGrams(g, c.alcohol_percent);
	}
	const per100 = (grams) => grams / totalBatchG * 100;
	return {
		kcal: per100(kcal),
		fat_g: per100(fat),
		saturated_fat_g: saturatedComplete ? per100(saturated) : null,
		carbohydrate_g: per100(carbohydrate),
		sugars_g: per100(sugars),
		protein_g: per100(protein),
		salt_g: per100(salt),
		fiber_g: per100(fiber),
		alcohol_g: per100(alcohol)
	};
}

//#endregion
//#region src/engine/config/scoring.ts
/** Technical-score weights per indicator — Golden Middle aligned (spec §10):
* freezing stability (ice fraction, NPAC) dominates, then POD and alcohol risk. */
const TECHNICAL_INDICATOR_WEIGHTS = {
	ice_fraction: 3,
	npac: 3,
	pod: 2,
	alcohol: 2,
	water: 1.5,
	total_solids: 1.5,
	fat: 1,
	aerating_protein: 1,
	protein_in_solids: 1,
	lactose: 1,
	lactose_sandiness_risk: 1
};
/** Base score per indicator status (in-band statuses score highest). */
const STATUS_SCORES = {
	ideal: 100,
	good: 85,
	premium: 100,
	risky: 55,
	too_expensive: 50,
	too_soft: 40,
	too_hard: 40,
	too_sweet: 40,
	too_weak: 40,
	needs_correction: 30
};
/** Flavor points per main-ingredient % — PREMIUM/SIGNATURE reward main-
* ingredient preservation most strongly (spec §12; monotonic by design). */
const MODE_FLAVOR_SLOPE = {
	eco: 1.5,
	classic: 2,
	premium: 2.5,
	signature: 3
};
/** Flavor-intensity goal modifier applied to the mode slope. */
const GOAL_INTENSITY_MULTIPLIER = {
	light: .9,
	balanced: 1,
	strong: 1.05,
	maximum: 1.1
};
/** Cost-score anchors in reference currency per kg (EUR-minded defaults; the
* engine stays currency-agnostic) — piecewise-linear, clamped at the ends. */
const COST_SCORE_ANCHORS = [
	{
		cost_per_kg: 2.5,
		score: 100
	},
	{
		cost_per_kg: 4,
		score: 80
	},
	{
		cost_per_kg: 6,
		score: 55
	},
	{
		cost_per_kg: 10,
		score: 20
	}
];
/** Cost-priority goal modifier applied to the distance from 100:
* 'low' punishes expensive mixes harder; 'premium' is more forgiving. */
const COST_PRIORITY_PENALTY = {
	low: 1.2,
	balanced: 1,
	premium: .7
};

//#endregion
//#region src/engine/scoring.ts
/**
* Scoring — technical / flavor / cost / overall (spec §12.8; masterplan §4).
*
* Scores are derived views over already-computed truth (indicators, items,
* costs) — they never change indicator statuses or any metric. Every constant
* lives in config/scoring.ts (calibration-pending); overall-score mode weights
* come from config/modes.ts.
*
* Principles encoded:
* - Technical: PI indicator statuses weighted Golden-Middle style (freezing
*   stability and NPAC dominate), refined by distance beyond the band edge.
* - Flavor: rewards main-ingredient preservation (lock_type 'main'),
*   monotonically — a high main ingredient is NEVER punished here; stability
*   concerns live in the technical score. PREMIUM/SIGNATURE slopes are the
*   steepest (spec §12).
* - Cost: anchor-interpolated from cost/kg, adjusted by the user's cost
*   priority; UNKNOWN cost stays null — never a fake score.
* - Overall: mode-weighted blend (ECO weights cost most, SIGNATURE flavor
*   most), renormalized when cost is unknown, and capped by the stability
*   gate: overall ≤ technical + STABILITY_HEADROOM — unstable recipes can
*   never hide behind high flavor or low cost.
*
* Pure, deterministic, non-mutating.
*/
const clamp$1 = (value, min, max) => Math.min(max, Math.max(min, value));
/** Status base score refined by distance beyond the band edge (floor 0). */
function indicatorScore(indicator) {
	const base = STATUS_SCORES[indicator.status];
	const band = indicator.band;
	const value = indicator.value;
	if (!band || value === null || Number.isNaN(value)) return base;
	if (value >= band.min && value <= band.max) return base;
	const halfWidth = (band.max - band.min) / 2;
	if (halfWidth <= 0) return base;
	const overshoot = value > band.max ? (value - band.max) / halfWidth : (band.min - value) / halfWidth;
	return Math.max(0, base - 15 * overshoot);
}
/** Weighted average of per-indicator scores (Golden-Middle-aligned weights). */
function computeTechnicalScore(indicators) {
	const weights = TECHNICAL_INDICATOR_WEIGHTS;
	let weightedSum = 0;
	let weightTotal = 0;
	for (const indicator of indicators) {
		const weight = weights[indicator.key];
		if (weight === void 0) continue;
		weightedSum += weight * indicatorScore(indicator);
		weightTotal += weight;
	}
	return weightTotal > 0 ? weightedSum / weightTotal : 0;
}
/** Main-ingredient reward, monotonic, mode-sloped (spec §12 flavor priority). */
function computeFlavorScore(items, totalBatchG, mode, goals) {
	if (totalBatchG <= 0) return 70;
	let mainGrams = 0;
	for (const item of items) if (item.lock_type === "main") mainGrams += item.effective_grams;
	if (mainGrams <= 0) return 70;
	const mainPercent = mainGrams / totalBatchG * 100;
	const multiplier = GOAL_INTENSITY_MULTIPLIER[goals?.flavor_intensity ?? "balanced"];
	const rewarded = 60 + mainPercent * MODE_FLAVOR_SLOPE[mode] * multiplier;
	return clamp$1(Math.max(70, rewarded), 0, 100);
}
/** Anchor-interpolated cost score; UNKNOWN cost (null) stays null. */
function computeCostScore(costPerKg, goals) {
	if (costPerKg === null || !Number.isFinite(costPerKg) || costPerKg < 0) return null;
	const anchors = COST_SCORE_ANCHORS;
	const first = anchors[0];
	const last = anchors[anchors.length - 1];
	let base;
	if (costPerKg <= first.cost_per_kg) base = first.score;
	else if (costPerKg >= last.cost_per_kg) base = last.score;
	else {
		base = last.score;
		for (let i = 1; i < anchors.length; i++) {
			const hi = anchors[i];
			if (costPerKg <= hi.cost_per_kg) {
				const lo = anchors[i - 1];
				const t = (costPerKg - lo.cost_per_kg) / (hi.cost_per_kg - lo.cost_per_kg);
				base = lo.score + t * (hi.score - lo.score);
				break;
			}
		}
	}
	const penalty = COST_PRIORITY_PENALTY[goals?.cost_priority ?? "balanced"];
	return clamp$1(100 - penalty * (100 - base), 0, 100);
}
/**
* Overall = mode-weighted blend of technical/flavor/cost (config/modes.ts
* weights), renormalized over technical+flavor when cost is unknown, capped by
* the stability gate. Null for zero-mass batches.
*/
function computeScores(input) {
	if (input.total_batch_g <= 0) return null;
	const technical = computeTechnicalScore(input.indicators);
	const flavor = computeFlavorScore(input.items, input.total_batch_g, input.mode, input.goals);
	const cost = computeCostScore(input.costs?.cost_per_kg ?? null, input.goals);
	const weights = MODES[input.mode].score_weights;
	let overall;
	if (cost === null) {
		const available = weights.technical + weights.flavor;
		overall = (weights.technical * technical + weights.flavor * flavor) / available;
	} else overall = weights.cost * cost + weights.technical * technical + weights.flavor * flavor;
	overall = Math.min(overall, technical + 30);
	return {
		technical,
		flavor,
		cost,
		overall
	};
}

//#endregion
//#region src/engine/calculateRecipe.ts
/**
* calculateRecipe — the deterministic pipeline entry point (spec §12/§18).
*
* Pure ASSEMBLY of the already-implemented, individually-tested stages:
* composition (§6) → POD (§7) → PAC/NPAC (§8) → ice fraction (§9) →
* status classification (§9/§12.7). No new math lives here.
*
* Guarantees:
* - `actual_grams` overrides `planned_grams` (effective-grams rule, §6/§15) —
*   already-added production amounts flow into every number.
* - Alcohol stays separate from water/solids; sugar types stay separate (§4/§5)
*   — both by construction of the composition stage.
* - Empty / zero-mass recipes never crash: metric fields are null (not
*   misleading zeros), indicators classify to needs_correction, and no NaN or
*   Infinity appears in the output.
* - Inputs are never mutated; same input ⇒ same output.
* - Every result is stamped with ENGINE_VERSION + CONFIG_VERSION (§17).
* - Nutrition (per 100 g), costs (kg + servings, honest incomplete state) and
*   scores (mode-weighted, stability-gated) ride on top of the metric stages;
*   corrections remain a later stage.
*
* Warnings (deterministic, code-based, emitted in fixed order):
* - alcohol_above_safe_range (warning) — alcohol % above the selected band's
*   warn_above threshold.
* - machine_capacity_exceeded (critical) — total mass above machine capacity.
* - batch_mass_mismatch (info) — |total − target| beyond 0.1 g (the spec §6
*   display precision).
* - low_confidence_ingredient (info, per ingredient, item order) — confidence
*   below 80 (the masterplan §16 "needs verification" boundary).
* - cost_incomplete (info) — at least one ingredient cost is unknown.
* A per-ingredient composition_invalid sanity warning is deferred until its
* tolerance is decided — not invented here.
*/
/** Masterplan §16: below this confidence an ingredient "needs verification". */
const LOW_CONFIDENCE_THRESHOLD = 80;
/** Spec §6 display precision — mass deviations beyond this are reportable. */
const BATCH_MASS_TOLERANCE_G = .1;
function collectWarnings(input, totalBatchG, alcoholPercent, items) {
	const warnings = [];
	const warnAbove = selectTargetBand(input.category, input.target_temperature_c)?.band.metrics.alcohol?.warn_above;
	if (alcoholPercent !== null && warnAbove !== void 0 && alcoholPercent > warnAbove) warnings.push({
		code: "alcohol_above_safe_range",
		severity: "warning",
		context: {
			alcohol_percent: alcoholPercent,
			warn_above: warnAbove
		}
	});
	if (input.machine_capacity_grams !== null && totalBatchG > input.machine_capacity_grams) warnings.push({
		code: "machine_capacity_exceeded",
		severity: "critical",
		context: {
			total_batch_g: totalBatchG,
			machine_capacity_grams: input.machine_capacity_grams
		}
	});
	if (Math.abs(totalBatchG - input.target_batch_grams) > BATCH_MASS_TOLERANCE_G) warnings.push({
		code: "batch_mass_mismatch",
		severity: "info",
		context: {
			total_batch_g: totalBatchG,
			target_batch_grams: input.target_batch_grams,
			difference: totalBatchG - input.target_batch_grams
		}
	});
	for (const item of items) if (item.ingredient.confidence_score < LOW_CONFIDENCE_THRESHOLD) warnings.push({
		code: "low_confidence_ingredient",
		severity: "info",
		context: {
			ingredient_id: item.ingredient.id,
			ingredient_name: item.ingredient.name,
			confidence_score: item.ingredient.confidence_score
		}
	});
	return warnings;
}
/** The full deterministic recipe calculation (spec §12/§18 locked signature). */
function calculateRecipe(input) {
	const { items, total_batch_g, totals, percentages, sugar } = computeComposition(input.items);
	const hasMass = total_batch_g > 0;
	const pod_points = hasMass ? computeRecipePod(items, total_batch_g) : null;
	const pac_points = hasMass ? computeRecipePac(items, total_batch_g) : null;
	const npac_points = hasMass ? computeRecipeNpac(items, total_batch_g, { water_g: totals.water_g }) : null;
	const sorbetFreezing = hasMass && input.category === "sorbet" ? solveSorbetFreezingPhysics({
		totalMixtureGrams: total_batch_g,
		initialWaterGrams: totals.water_g,
		totalDrySolidsGrams: totals.solids_g,
		sucroseGrams: totals.sucrose_g,
		glucoseGrams: totals.glucose_g,
		dextroseGrams: totals.dextrose_g,
		fructoseGrams: totals.fructose_g,
		unsupportedFreezeActiveSolidsGrams: totals.lactose_g + totals.polyol_g + totals.salt_g + totals.alcohol_g + sugar.other_sugar_g,
		temperatureCelsius: input.target_temperature_c
	}) : null;
	const ice_fraction_percent = hasMass ? input.category === "sorbet" ? sorbetFreezing?.status === "available" ? sorbetFreezing.iceMassFractionOfMix * 100 : null : estimateIceFraction({
		npac: npac_points,
		temperature_c: input.target_temperature_c,
		category: input.category
	}) : null;
	const sandiness_risk = hasMass ? computeLactoseSandinessRisk(totals.lactose_g, totals.water_g) : null;
	const statusInputs = {
		pod: pod_points,
		npac: npac_points,
		ice_fraction: ice_fraction_percent,
		lactose: hasMass ? percentages.lactose_percent : null,
		lactose_sandiness_risk: sandiness_risk,
		fat: hasMass ? percentages.fat_percent : null,
		aerating_protein: hasMass ? percentages.protein_percent : null,
		protein_in_solids: hasMass && totals.solids_g > 0 ? totals.protein_g / totals.solids_g * 100 : null,
		total_solids: hasMass ? percentages.solids_percent : null,
		water: hasMass ? percentages.water_percent : null,
		alcohol: hasMass ? percentages.alcohol_percent : null
	};
	const indicators = classifyRecipeIndicators(statusInputs, input.category, input.target_temperature_c);
	const nutrition_per_100g = hasMass ? computeNutritionPer100g(items, total_batch_g) : null;
	const costs = hasMass ? computeRecipeCosts(items, total_batch_g) : null;
	const scores = hasMass ? computeScores({
		indicators,
		items,
		total_batch_g,
		mode: input.mode,
		goals: input.goals,
		costs
	}) : null;
	const warnings = collectWarnings(input, total_batch_g, statusInputs.alcohol, items);
	if (sorbetFreezing?.status === "unavailable") warnings.push({
		code: "composition_invalid",
		severity: "warning",
		context: { reason: `${SORBET_FREEZING_WARNING_REASON_PREFIX}${sorbetFreezing.reason}` }
	});
	if (costs && !costs.complete) warnings.push({
		code: "cost_incomplete",
		severity: "info",
		context: { missing_count: costs.missing_cost_ingredient_ids.length }
	});
	return {
		engine_version: ENGINE_VERSION,
		config_version: CONFIG_VERSION,
		total_batch_g,
		items,
		totals,
		percentages,
		sugar,
		pod_points,
		pac_points,
		npac_points,
		ice_fraction_percent,
		indicators,
		scores,
		nutrition_per_100g,
		costs,
		warnings
	};
}

//#endregion
//#region src/engine/corrections/candidates.ts
const ZERO_PROFILE = {
	water_percent: 0,
	solids_percent: 0,
	fat_percent: 0,
	protein_percent: 0,
	carbohydrate_percent: 0,
	sugar_percent: 0,
	sucrose_percent: 0,
	glucose_percent: 0,
	dextrose_percent: 0,
	fructose_percent: 0,
	lactose_percent: 0,
	polyol_percent: 0,
	fiber_percent: 0,
	salt_percent: 0,
	alcohol_percent: 0,
	kcal_per_100g: 0
};
const reference = (id, name, category, composition, cost_per_kg) => ({
	id,
	name,
	category,
	composition: {
		...ZERO_PROFILE,
		...composition
	},
	pod_value: null,
	pac_value: null,
	npac_value: null,
	de_value: null,
	cost_per_kg,
	confidence_score: 85,
	source_type: "manual",
	is_verified: false
});
/**
* Categories that may receive DAIRY correction candidates. Sorbet and vegan are
* excluded by the locked profile rules (Temperature_Regulator_SORBET/VEGAN.md:
* dairy is forbidden — no approval flag can override), mirrored by the Spine
* profile registry's forbidden correction families. Every other category keeps
* dairy levers unchanged.
*/
const DAIRY_ALLOWED_CATEGORIES = [
	"milk_gelato",
	"fruit_gelato",
	"nut_gelato",
	"chocolate_gelato",
	"alcohol_gelato",
	"custom"
];
const DEFAULT_CORRECTION_CANDIDATES = [
	{
		id: "sucrose",
		name: "Sucrose",
		roles: [
			"sweetness_up",
			"freezing_up",
			"solids_up"
		],
		ingredient: reference("sucrose", "Sucrose", "sugar", {
			solids_percent: 100,
			carbohydrate_percent: 100,
			sugar_percent: 100,
			sucrose_percent: 100,
			kcal_per_100g: 400
		}, 1.1)
	},
	{
		id: "dextrose",
		name: "Dextrose",
		roles: [
			"freezing_up",
			"sweetness_up",
			"solids_up"
		],
		ingredient: reference("dextrose", "Dextrose (monohydrate)", "sugar", {
			water_percent: 8,
			solids_percent: 92,
			carbohydrate_percent: 92,
			sugar_percent: 92,
			dextrose_percent: 92,
			kcal_per_100g: 368
		}, 1.6)
	},
	{
		id: "milk_3_5",
		name: "Milk 3.5 %",
		roles: ["dilution"],
		allowed_categories: DAIRY_ALLOWED_CATEGORIES,
		ingredient: reference("milk_3_5", "Milk 3.5 %", "dairy", {
			water_percent: 87.5,
			solids_percent: 12.5,
			fat_percent: 3.5,
			protein_percent: 3.3,
			carbohydrate_percent: 4.8,
			sugar_percent: 4.8,
			lactose_percent: 4.8,
			salt_percent: .1,
			kcal_per_100g: 64
		}, .9)
	},
	{
		id: "cream_30",
		name: "Cream 30 %",
		roles: ["fat_up"],
		allowed_categories: DAIRY_ALLOWED_CATEGORIES,
		ingredient: reference("cream_30", "Cream 30 %", "dairy", {
			water_percent: 63.4,
			solids_percent: 36.6,
			fat_percent: 30,
			protein_percent: 2.3,
			carbohydrate_percent: 3.3,
			sugar_percent: 3.3,
			lactose_percent: 3.3,
			salt_percent: .1,
			kcal_per_100g: 292
		}, 4)
	},
	{
		id: "smp",
		name: "Skimmed milk powder",
		roles: ["solids_up", "protein_up"],
		allowed_categories: DAIRY_ALLOWED_CATEGORIES,
		ingredient: reference("smp", "Skimmed milk powder", "dairy", {
			water_percent: 3.5,
			solids_percent: 96.5,
			fat_percent: .8,
			protein_percent: 35,
			carbohydrate_percent: 52,
			sugar_percent: 52,
			lactose_percent: 52,
			salt_percent: 1,
			kcal_per_100g: 360
		}, 7)
	},
	{
		id: "inulin",
		name: "Inulin",
		roles: ["solids_up", "stabilizer"],
		ingredient: reference("inulin", "Inulin", "stabilizer", {
			water_percent: 5,
			solids_percent: 95,
			carbohydrate_percent: 90,
			fiber_percent: 90,
			kcal_per_100g: 190
		}, 9)
	},
	{
		id: "water",
		name: "Water",
		roles: ["dilution"],
		allowed_categories: [
			"sorbet",
			"vegan_gelato",
			"fruit_gelato"
		],
		ingredient: reference("water", "Water", "water", { water_percent: 100 }, 0)
	},
	{
		id: "tara_gum",
		name: "Tara gum",
		roles: ["stabilizer"],
		ingredient: reference("tara_gum", "Tara gum", "stabilizer", {
			water_percent: 12,
			solids_percent: 88,
			carbohydrate_percent: 80,
			fiber_percent: 80,
			kcal_per_100g: 200
		}, 18)
	}
];
/** Spec §13 canonical correction table: (metric, direction) → candidate ids,
* in rule order. Ice fraction maps to the NPAC proxy candidates. */
const SELECTION_RULES = {
	pod_low: ["sucrose", "dextrose"],
	pod_high: ["milk_3_5", "water"],
	npac_low: ["dextrose", "sucrose"],
	npac_high: [
		"smp",
		"cream_30",
		"milk_3_5",
		"water"
	],
	ice_fraction_high: ["dextrose", "sucrose"],
	ice_fraction_low: [
		"smp",
		"cream_30",
		"milk_3_5",
		"water"
	],
	fat_low: ["cream_30"],
	fat_high: [
		"milk_3_5",
		"water",
		"smp"
	],
	total_solids_low: ["smp", "inulin"],
	total_solids_high: ["milk_3_5", "water"],
	water_high: ["smp", "inulin"],
	water_low: ["milk_3_5", "water"],
	aerating_protein_low: ["smp"],
	aerating_protein_high: ["cream_30", "milk_3_5"],
	protein_in_solids_low: ["smp"],
	protein_in_solids_high: ["cream_30"],
	lactose_low: ["smp"],
	lactose_high: ["inulin"],
	lactose_sandiness_risk_high: ["inulin"],
	alcohol_high: ["milk_3_5"]
};
/** Mode-dependent ordering (config/modes.ts candidate_ranking). */
function orderCandidates(candidates, ranking) {
	const byId = (a, b) => a.id.localeCompare(b.id);
	switch (ranking) {
		case "cheapest_first": return [...candidates].sort((a, b) => (a.ingredient.cost_per_kg ?? Number.POSITIVE_INFINITY) - (b.ingredient.cost_per_kg ?? Number.POSITIVE_INFINITY) || byId(a, b));
		case "mouthfeel_first": {
			const bump = new Set(["cream_30", "inulin"]);
			return [...candidates.filter((c) => bump.has(c.id)), ...candidates.filter((c) => !bump.has(c.id))];
		}
		case "flavor_first": return [...candidates].sort((a, b) => b.ingredient.composition.solids_percent - a.ingredient.composition.solids_percent || byId(a, b));
		case "balanced": return candidates;
	}
}
/**
* Candidates for one violation: rule lookup → category gate → mode ordering.
* Custom catalogs participate via matching ids (configurable by design).
*/
function selectCandidates(metric, direction, category, ranking, candidates = DEFAULT_CORRECTION_CANDIDATES) {
	const ruleIds = SELECTION_RULES[`${metric}_${direction}`] ?? [];
	const pool = new Map(candidates.map((c) => [c.id, c]));
	const selected = [];
	for (const id of ruleIds) {
		const candidate = pool.get(id);
		if (!candidate) continue;
		if (candidate.allowed_categories && !candidate.allowed_categories.includes(category)) continue;
		selected.push(candidate);
	}
	return orderCandidates(selected, ranking);
}

//#endregion
//#region src/engine/corrections/redact.ts
function redactProposal(proposal, index = 0) {
	const actionTypes = new Set(proposal.actions.map((action) => action.type));
	const direction = actionTypes.size === 1 ? actionTypes.has("add") ? "add" : "reduce" : "rebalance";
	return {
		id: `${proposal.kind}:${proposal.reasons[0] ?? "correction"}:${index}`,
		kind: proposal.kind,
		confidence: proposal.confidence,
		affected_metrics: [...proposal.affected_metrics],
		direction,
		teaser_code: "pro_can_calculate"
	};
}

//#endregion
//#region src/engine/userIntent.ts
/**
* SOFTENING SCALE, as a fraction of the TARGET BATCH.
*
* A pure relative measure (|Δ| / baseline) is unstable at tiny amounts: 2 g of
* tara gum moving to 3 g would read 0.5 — „half the ingredient gone" — and
* would outrank a 109 g move on the milk. A pure absolute measure (|Δ| grams)
* is the opposite lie: it cannot tell 40 → 1 from 600 → 561, because both moved
* 39 g.
*
* The fix is a relative measure with an ABSOLUTE floor added to the
* denominator, taken from the only scale this layer owns — the batch — so it is
* deterministic, batch-independent in meaning and not a tuned constant.
*/
const USER_INTENT_DRIFT_SOFTENING_FRACTION = .001;
/**
* MATERIAL DEVIATION THRESHOLD — the single global policy line between
* „PI rebalanced your recipe" and „PI is proposing to change this ingredient
* substantially" (owner §7, §12, §13).
*
* A line past this is NOT forbidden. It is CONSENT-REQUIRED: the solver must
* first prove no better-preserving candidate reaches the same result, and the
* Preview must say so in words instead of presenting it as a small correction.
*
* At a 1000 g batch, on a 40 g line, the boundary sits at 40 − 0.5 × 41 =
* 19.5 g — so 40 → 20 g is ordinary optimization and 40 → 19 g starts asking.
* ONE documented global number, deliberately not per ingredient or per profile.
*/
const MATERIAL_USER_INTENT_DRIFT = .5;
/**
* The lowest amount a soft-held line may reach while still being ordinary
* optimization. Below this the change is a material deviation.
*/
const materialDeviationFloorGrams = (baselineGrams, targetBatchGrams) => baselineGrams - MATERIAL_USER_INTENT_DRIFT * (baselineGrams + Math.max(0, targetBatchGrams) * USER_INTENT_DRIFT_SOFTENING_FRACTION);
/**
* The gram amount the USER stands behind for this line, or null when the line
* carries no user intent (PI put it there).
*
* `user_intent_anchor_grams` is written when the user adds an ingredient,
* demotes a Main back to Standard, or adopts a library recipe;
* `user_target_grams` is written when the user types an amount. Either is
* intent; the anchor wins when both are present.
*/
function userLineBaselineGrams(item) {
	const anchored = item.user_intent_anchor_grams ?? 0;
	const typed = item.user_target_grams ?? 0;
	const baseline = anchored > 0 ? anchored : typed;
	return baseline > 0 ? baseline : null;
}

//#endregion
//#region src/engine/corrections/verify.ts
/**
* Correction verification (spec §13 step 4): proposals are never trusted on
* paper — every action set is applied to a hypothetical recipe and the FULL
* calculateRecipe pipeline is re-run. A proposal is valid only if it improves
* its targets, breaks no higher-priority metric (Golden Middle, spec §10),
* respects every lock/context rule and stays within machine capacity.
*
* Context rules (enforced here AND at candidate generation):
* - planning: unlocked lines may be reduced; locked lines never change; the
*   main line follows the mode gate below.
* - actual_batch: NOTHING is ever reduced — rescue is add-only; any line with
*   actual_grams present is physically added regardless of lock_type.
* - Lines with actual_grams are never reduced in ANY context (physically
*   added material cannot be taken back out).
*
* Main-ingredient gate (spec §12): PREMIUM/SIGNATURE — never reduced;
* ECO/CLASSIC — only when context is planning, the line has no actuals, and
* allow_main_ingredient_reduction is explicitly true (default false).
*/
const EPSILON$3 = 1e-9;
/**
* USER-INTENT REDUCTION FLOOR: the lowest amount this line may be reduced TO by
* an ordinary correction (owner USER INTENT / SOFT-HOLD).
*
* Derived from the line's OWN user baseline, so it binds on every engine path
* that can reduce — the correction solver, the draft ladder, ECO, Rescue —
* without any caller having to remember to pass it.
*
* Returns 0 (no floor) when the line carries no user intent, when the caller
* supplied no batch scale, or when the line is already at/below its floor —
* a floor can only forbid going LOWER, it can never force a line upward, and it
* can never make an already-legal state unreachable.
*/
function reductionFloorGrams(line, constraints) {
	const batch = constraints.target_batch_grams;
	if (batch === void 0 || !(batch > 0)) return 0;
	const baseline = userLineBaselineGrams(line);
	if (baseline === null) return 0;
	const floor = materialDeviationFloorGrams(baseline, batch);
	if (!Number.isFinite(floor) || floor <= 0) return 0;
	return Math.min(floor, line.planned_grams);
}
/** May this line be reduced under the given constraints? */
function isReductionAllowed(line, constraints) {
	if (constraints.context === "actual_batch") return false;
	if (line.actual_grams !== null) return false;
	if (line.lock_type === "main") return (constraints.mode === "eco" || constraints.mode === "classic") && constraints.allow_main_ingredient_reduction;
	return line.lock_type === "unlocked";
}
/**
* Applies actions immutably. Returns null when any action is not applicable
* under the constraints (never throws). Structurally incapable of reducing
* locked/main/already-added lines or anything in actual-batch context.
*/
function applyCorrectionActions(input, actions, constraints, candidates) {
	const items = input.items.map((item) => ({ ...item }));
	for (const [index, action] of actions.entries()) {
		if (!(action.grams > EPSILON$3) || !Number.isFinite(action.grams)) return null;
		if (action.type === "add") {
			const existing = action.target_line_id !== void 0 ? items.find((item) => item.id === action.target_line_id) : void 0;
			if (existing) {
				if (existing.lock_type !== "unlocked") return null;
				existing.planned_grams += action.grams;
			} else {
				const candidate = candidates.find((c) => c.id === action.ingredient_id);
				if (!candidate) return null;
				items.push({
					id: `correction-${action.ingredient_id}-${index}`,
					ingredient: candidate.ingredient,
					planned_grams: action.grams,
					actual_grams: null,
					lock_type: "unlocked"
				});
			}
		} else {
			if (action.target_line_id === void 0) return null;
			const line = items.find((item) => item.id === action.target_line_id);
			if (!line) return null;
			if (!isReductionAllowed(line, constraints)) return null;
			if (action.grams > line.planned_grams + EPSILON$3) return null;
			const floor = reductionFloorGrams(line, constraints);
			if (line.planned_grams - action.grams < floor - EPSILON$3) return null;
			line.planned_grams = Math.max(0, line.planned_grams - action.grams);
		}
	}
	return {
		...input,
		items
	};
}
const badnessByMetric = (violations) => new Map(violations.map((v) => [v.metric, v.severity_points]));
/** Re-runs calculateRecipe on the hypothetical recipe and judges the outcome. */
function verifyCorrectionProposal(args) {
	const { beforeViolations, targets, hypothetical, constraints, detect, priorityCount } = args;
	const fail = (rejection) => ({
		valid: false,
		after: null,
		afterViolations: [],
		improvement: 0,
		resolved: [],
		rejection
	});
	if (!hypothetical) return fail("apply_failed");
	const after = calculateRecipe(hypothetical);
	if (constraints.machine_capacity_grams !== null && after.total_batch_g > constraints.machine_capacity_grams + EPSILON$3) return {
		...fail("capacity"),
		after
	};
	const afterViolations = detect(after);
	const beforeBadness = badnessByMetric(beforeViolations);
	const afterBadness = badnessByMetric(afterViolations);
	const metricRank = /* @__PURE__ */ new Map();
	for (const v of [...beforeViolations, ...afterViolations]) metricRank.set(v.metric, v.priority_rank);
	for (const target of targets) {
		const before = beforeBadness.get(target.metric) ?? 0;
		if (!((afterBadness.get(target.metric) ?? 0) < before - EPSILON$3)) return {
			...fail("no_improvement"),
			after,
			afterViolations
		};
	}
	const minTargetRank = Math.min(...targets.map((t) => t.priority_rank));
	for (const [metric, afterB] of afterBadness) if ((metricRank.get(metric) ?? Number.POSITIVE_INFINITY) < minTargetRank && afterB > (beforeBadness.get(metric) ?? 0) + EPSILON$3) return {
		...fail("higher_priority_break"),
		after,
		afterViolations
	};
	let improvement = 0;
	const allMetrics = new Set([...beforeBadness.keys(), ...afterBadness.keys()]);
	for (const metric of allMetrics) {
		const weight = priorityCount - (metricRank.get(metric) ?? priorityCount - 1);
		improvement += weight * ((beforeBadness.get(metric) ?? 0) - (afterBadness.get(metric) ?? 0));
	}
	const resolved = beforeViolations.filter((v) => (afterBadness.get(v.metric) ?? 0) === 0).map((v) => v.metric);
	return {
		valid: true,
		after,
		afterViolations,
		improvement,
		resolved
	};
}

//#endregion
//#region src/engine/corrections/solver.ts
/**
* Correction solver (spec §13, §10, §12, §15) — the core product feature.
*
* Deterministic, bounded, pure: detect violations → rank by the Golden Middle
* priority order → generate candidates per the spec §13 table → solve exact
* grams with MASS-CHANGE-AWARE math (the denominator grows with every added
* gram) → verify every proposal by re-running the FULL calculateRecipe →
* rank → redact at source for demo.
*
* The Golden Middle rule is enforced in verify.ts: a proposal that fixes a
* lower-priority metric by breaking a higher-priority one is rejected.
* When no valid correction exists, an explicit tradeoff/impossible proposal
* explains why (blocking constraint codes) and what the user can change.
*
* Algorithm parameters below (MIN/MAX action mass, search bounds) are
* deterministic solver settings, not calibration data.
*/
const MIN_ACTION_GRAMS = .05;
const MAX_ADDITION_FACTOR = 2;
const CANDIDATES_PER_VIOLATION = 3;
const DEFAULT_MAX_PROPOSALS = 3;
const EPSILON$2 = 1e-9;
const METRIC_PRIORITY_KEY = {
	alcohol: "feasibility_safety",
	ice_fraction: "freezing_stability",
	npac: "npac_pac",
	pod: "pod",
	water: "water_solids",
	total_solids: "water_solids",
	fat: "fat",
	aerating_protein: "protein",
	protein_in_solids: "protein",
	lactose: "lactose_sandiness",
	lactose_sandiness_risk: "lactose_sandiness"
};
const priorityRank = (metric) => GOLDEN_MIDDLE_PRIORITY.indexOf(METRIC_PRIORITY_KEY[metric]);
/**
* Preview-only target override: return a COPY of `result` whose indicator bands are
* replaced per `override` (metric → band). IMMUTABLE — the input result and its band
* objects are never mutated; metrics absent from the map keep their engine band, and
* metric VALUES / keys / fallback flags are preserved. Lets a caller solve/detect
* against injected targets (e.g. Temperature Regulator bands) WITHOUT changing the
* global `TARGET_BANDS`. Not re-exported from the engine barrel; when no override is
* supplied the solver never calls this and its behavior is unchanged.
*/
function applyTargetBandOverride(result, override) {
	const indicators = result.indicators.map((indicator) => {
		const band = override[indicator.key];
		return band ? {
			...indicator,
			band: { ...band }
		} : indicator;
	});
	return {
		...result,
		indicators
	};
}
/** Out-of-range indicators → violations sorted by (priority rank, severity). */
function detectViolations(result) {
	const violations = [];
	for (const indicator of result.indicators) {
		if (!(indicator.key in METRIC_PRIORITY_KEY)) continue;
		const metric = indicator.key;
		const band = indicator.band ?? null;
		const value = indicator.value;
		if (value === null || band === null || Number.isNaN(value)) continue;
		let direction = null;
		if (value < band.min) direction = "low";
		else if (value > band.max) direction = "high";
		else if (band.warn_above !== void 0 && value > band.warn_above) direction = "high";
		else if (band.warn_below !== void 0 && value < band.warn_below) direction = "low";
		if (direction === null) continue;
		const halfWidth = (band.max - band.min) / 2;
		const beyond = direction === "high" ? value - band.max : band.min - value;
		const severity_points = Math.max(.01, halfWidth > 0 ? beyond / halfWidth : beyond);
		violations.push({
			metric,
			direction,
			value,
			band,
			severity_points,
			priority_rank: priorityRank(metric),
			reason: `${metric}_${direction}`
		});
	}
	violations.sort((a, b) => a.priority_rank - b.priority_rank || b.severity_points - a.severity_points || a.metric.localeCompare(b.metric));
	return violations;
}
const unitItem = (ingredient) => ({
	id: `unit-${ingredient.id}`,
	ingredient,
	planned_grams: 1,
	actual_grams: null,
	lock_type: "unlocked",
	effective_grams: 1,
	difference: 0,
	is_actual: false
});
const bandOf = (result, metric) => result.indicators.find((indicator) => indicator.key === metric)?.band ?? null;
const center = (band) => (band.min + band.max) / 2;
function modelFor(result, metric) {
	const B = result.total_batch_g;
	if (B <= 0) return null;
	const totals = result.totals;
	const one = () => 1;
	const percentModel = (componentG, fraction, band) => band ? {
		N: componentG,
		D: B,
		t: center(band) / 100,
		n: fraction,
		d: one
	} : null;
	switch (metric) {
		case "pod": return bandOf(result, "pod") ? {
			N: (result.pod_points ?? 0) * B / 100,
			D: B,
			t: center(bandOf(result, "pod")) / 100,
			n: (i) => ingredientPodContribution(unitItem(i)),
			d: one
		} : null;
		case "npac":
		case "ice_fraction": {
			const band = bandOf(result, "npac");
			return band ? {
				N: (result.npac_points ?? 0) * B / 100,
				D: B,
				t: center(band) / 100,
				n: (i) => ingredientNpacContribution(unitItem(i)),
				d: one
			} : null;
		}
		case "water": return percentModel(totals.water_g, (i) => i.composition.water_percent / 100, bandOf(result, metric));
		case "total_solids": return percentModel(totals.solids_g, (i) => i.composition.solids_percent / 100, bandOf(result, metric));
		case "fat": return percentModel(totals.fat_g, (i) => i.composition.fat_percent / 100, bandOf(result, metric));
		case "aerating_protein": return percentModel(totals.protein_g, (i) => i.composition.protein_percent / 100, bandOf(result, metric));
		case "lactose": return percentModel(totals.lactose_g, (i) => i.composition.lactose_percent / 100, bandOf(result, metric));
		case "alcohol": return percentModel(totals.alcohol_g, (i) => i.composition.alcohol_percent / 100, bandOf(result, metric));
		case "protein_in_solids": {
			const band = bandOf(result, metric);
			return band ? {
				N: totals.protein_g,
				D: totals.solids_g,
				t: center(band) / 100,
				n: (i) => i.composition.protein_percent / 100,
				d: (i) => i.composition.solids_percent / 100
			} : null;
		}
		case "lactose_sandiness_risk": {
			const band = bandOf(result, metric);
			return band ? {
				N: totals.lactose_g,
				D: totals.water_g,
				t: center(band) / 100,
				n: (i) => i.composition.lactose_percent / 100,
				d: (i) => i.composition.water_percent / 100
			} : null;
		}
	}
}
/** Solve (N + n·m)/(D + d·m) = t for the added mass m. */
function solveAddition(model, ingredient) {
	const denominator = model.n(ingredient) - model.t * model.d(ingredient);
	if (Math.abs(denominator) < EPSILON$2) return null;
	const m = (model.t * model.D - model.N) / denominator;
	if (!Number.isFinite(m) || m < MIN_ACTION_GRAMS) return null;
	if (m > model.D * MAX_ADDITION_FACTOR) return null;
	return m;
}
const severityFor = (rank) => rank === 0 ? "critical" : rank <= 3 ? "warning" : "info";
const addAction = (candidate, grams) => ({
	type: "add",
	ingredient_id: candidate.id,
	ingredient_name: candidate.name,
	ingredient_category: candidate.ingredient.category,
	grams
});
function confidenceFor(primary, afterViolations) {
	if (afterViolations.length === 0) return "high";
	if (!afterViolations.some((v) => v.metric === primary.metric)) return "medium";
	return "low";
}
function proposeCorrections(request) {
	const { input, context, redact, allow_main_ingredient_reduction = false, candidates = DEFAULT_CORRECTION_CANDIDATES, max_proposals = DEFAULT_MAX_PROPOSALS, focus, targetBandOverride } = request;
	const constraints = {
		context,
		mode: input.mode,
		allow_main_ingredient_reduction,
		machine_capacity_grams: input.machine_capacity_grams,
		target_batch_grams: input.target_batch_grams
	};
	const before = targetBandOverride ? applyTargetBandOverride(calculateRecipe(input), targetBandOverride) : calculateRecipe(input);
	const detect = targetBandOverride ? (result) => detectViolations(applyTargetBandOverride(result, targetBandOverride)) : detectViolations;
	const allViolations = detectViolations(before);
	const violations = focus?.length ? allViolations.filter((violation) => focus.includes(violation.metric)) : allViolations;
	if (violations.length === 0) return redact ? {
		redacted: true,
		context,
		proposals: []
	} : {
		redacted: false,
		context,
		proposals: []
	};
	const ranking = MODES[input.mode].candidate_ranking;
	const proposals = [];
	const improvementById = /* @__PURE__ */ new Map();
	const blocked = { capacity: false };
	const tryActions = (targets, actions) => {
		const outcome = verifyCorrectionProposal({
			beforeViolations: allViolations,
			targets,
			hypothetical: applyCorrectionActions(input, actions, constraints, candidates),
			constraints,
			detect,
			priorityCount: GOLDEN_MIDDLE_PRIORITY.length
		});
		if (!outcome.valid) {
			if (outcome.rejection === "capacity") blocked.capacity = true;
			return;
		}
		const primary = targets[0];
		const after = outcome.after;
		const predicted = targets.map((target) => ({
			metric: target.metric,
			before: target.value,
			after: after.indicators.find((indicator) => indicator.key === target.metric)?.value ?? null
		}));
		const id = `${primary.reason}:${actions.map((action) => `${action.type}-${action.ingredient_id}`).join("+")}`;
		if (proposals.some((proposal) => proposal.id === id)) return;
		proposals.push({
			id,
			kind: "correction",
			confidence: confidenceFor(primary, outcome.afterViolations),
			severity: severityFor(primary.priority_rank),
			reasons: targets.map((target) => target.reason),
			affected_metrics: targets.map((target) => target.metric),
			actions,
			predicted,
			resolves: outcome.resolved,
			residual_reasons: outcome.afterViolations.map((violation) => violation.reason)
		});
		improvementById.set(id, outcome.improvement);
	};
	const primary = violations[0];
	const secondary = violations[1];
	for (const violation of [primary, secondary].filter((v) => v !== void 0)) {
		const model = modelFor(before, violation.metric);
		if (!model) continue;
		const options = selectCandidates(violation.metric, violation.direction, input.category, ranking, candidates).slice(0, CANDIDATES_PER_VIOLATION);
		for (const candidate of options) {
			const grams = solveAddition(model, candidate.ingredient);
			if (grams === null) continue;
			tryActions([violation], [addAction(candidate, grams)]);
		}
	}
	const reduceOutcome = buildReduceAction(before, primary, constraints);
	if (reduceOutcome.action) tryActions([primary], [reduceOutcome.action]);
	if (secondary) {
		const m1 = modelFor(before, primary.metric);
		const m2 = modelFor(before, secondary.metric);
		if (m1 && m2) {
			const c1s = selectCandidates(primary.metric, primary.direction, input.category, ranking, candidates).slice(0, CANDIDATES_PER_VIOLATION);
			const c2s = selectCandidates(secondary.metric, secondary.direction, input.category, ranking, candidates).slice(0, CANDIDATES_PER_VIOLATION);
			outer: for (const c1 of c1s) for (const c2 of c2s) {
				if (c1.id === c2.id) continue;
				const pair = solvePair(m1, m2, c1.ingredient, c2.ingredient);
				if (!pair) continue;
				tryActions([primary, secondary], [addAction(c1, pair[0]), addAction(c2, pair[1])]);
				if (proposals.length >= max_proposals + 2) break outer;
			}
		}
	}
	proposals.sort((a, b) => (improvementById.get(b.id) ?? 0) - (improvementById.get(a.id) ?? 0) || a.actions.length - b.actions.length || totalGrams(a) - totalGrams(b) || a.id.localeCompare(b.id));
	const ranked = proposals.slice(0, max_proposals);
	if (ranked.length === 0) ranked.push(buildBlockedProposal(primary, blocked, reduceOutcome.blocking));
	return redact ? {
		redacted: true,
		context,
		proposals: ranked.map((proposal, index) => redactProposal(proposal, index))
	} : {
		redacted: false,
		context,
		proposals: ranked
	};
}
const totalGrams = (proposal) => proposal.actions.reduce((sum, action) => sum + action.grams, 0);
function buildReduceAction(before, violation, constraints) {
	if (violation.direction !== "high") return {
		action: null,
		blocking: null
	};
	const model = modelFor(before, violation.metric);
	if (!model) return {
		action: null,
		blocking: null
	};
	let dominant = null;
	let dominantShare = 0;
	for (const item of before.items) {
		const share = model.n(item.ingredient) * item.effective_grams;
		if (share > dominantShare + EPSILON$2) {
			dominantShare = share;
			dominant = item;
		}
	}
	if (!dominant || dominantShare <= EPSILON$2) return {
		action: null,
		blocking: null
	};
	if (!isReductionAllowed(dominant, constraints)) return {
		action: null,
		blocking: {
			constraint: dominant.actual_grams !== null ? "already_added" : dominant.lock_type === "main" ? "main_ingredient_floor" : "locked_ingredient",
			line_id: dominant.id,
			ingredient_name: dominant.ingredient.name
		}
	};
	const n = model.n(dominant.ingredient);
	const d = model.d(dominant.ingredient);
	const denominator = n - model.t * d;
	if (denominator <= EPSILON$2) return {
		action: null,
		blocking: null
	};
	const ideal = (model.N - model.t * model.D) / denominator;
	if (!Number.isFinite(ideal) || ideal < MIN_ACTION_GRAMS) return {
		action: null,
		blocking: null
	};
	const reducibleGrams = dominant.planned_grams - reductionFloorGrams(dominant, constraints);
	const grams = Math.min(ideal, reducibleGrams);
	if (grams < MIN_ACTION_GRAMS) return {
		action: null,
		blocking: null
	};
	return {
		action: {
			type: "reduce",
			ingredient_id: dominant.ingredient.id,
			ingredient_name: dominant.ingredient.name,
			ingredient_category: dominant.ingredient.category,
			grams,
			target_line_id: dominant.id
		},
		blocking: null
	};
}
function buildBlockedProposal(primary, blocked, reduceBlocking) {
	let kind = "impossible";
	let reason = "no_valid_correction";
	let blocking = { constraint: "no_candidate" };
	if (blocked.capacity) {
		kind = "tradeoff";
		reason = "machine_capacity_blocked";
		blocking = { constraint: "machine_capacity" };
	} else if (reduceBlocking) {
		kind = "tradeoff";
		reason = reduceBlocking.constraint === "main_ingredient_floor" ? "main_ingredient_floor" : "locked_ingredient_blocked";
		blocking = reduceBlocking;
	} else if (primary.metric === "alcohol") {
		kind = "tradeoff";
		reason = "alcohol_unfixable";
	}
	return {
		id: `${kind}:${primary.reason}`,
		kind,
		confidence: "tradeoff",
		severity: severityFor(primary.priority_rank),
		reasons: [primary.reason, reason],
		affected_metrics: [primary.metric],
		actions: [],
		predicted: [],
		resolves: [],
		residual_reasons: [primary.reason],
		blocking
	};
}
function solvePair(m1, m2, ca, cb) {
	const a11 = m1.n(ca) - m1.t * m1.d(ca);
	const a12 = m1.n(cb) - m1.t * m1.d(cb);
	const a21 = m2.n(ca) - m2.t * m2.d(ca);
	const a22 = m2.n(cb) - m2.t * m2.d(cb);
	const b1 = m1.t * m1.D - m1.N;
	const b2 = m2.t * m2.D - m2.N;
	const det = a11 * a22 - a12 * a21;
	if (Math.abs(det) < EPSILON$2) return null;
	const mA = (b1 * a22 - a12 * b2) / det;
	const mB = (a11 * b2 - b1 * a21) / det;
	if (!Number.isFinite(mA) || !Number.isFinite(mB)) return null;
	if (mA < MIN_ACTION_GRAMS || mB < MIN_ACTION_GRAMS) return null;
	if (mA + mB > m1.D * MAX_ADDITION_FACTOR) return null;
	return [mA, mB];
}

//#endregion
//#region src/engine/corrections/apply.ts
/** Propose corrections through the existing solver. Pure passthrough — no re-ranking. */
function proposeAutoFix(args) {
	return proposeCorrections({
		input: args.input,
		context: args.context,
		redact: !args.exactCorrectionGrams,
		allow_main_ingredient_reduction: args.allowMainIngredientReduction ?? false,
		focus: args.focus,
		candidates: args.candidates,
		max_proposals: args.maxProposals,
		targetBandOverride: args.targetBandOverride
	});
}
/**
* Apply a proposal's actions immutably via the existing solver apply. Returns a
* discriminated result (never throws):
*   - redacted_proposal: a demo/redacted proposal has no actions to apply;
*   - no_actions: a tradeoff/impossible proposal carries an empty action set;
*   - apply_failed: `applyCorrectionActions` rejected an action (locked line,
*     reduction not allowed, etc.).
*/
function applyAutoFix(args) {
	const { input, proposal, context } = args;
	if (!("actions" in proposal)) return {
		success: false,
		reason: "redacted_proposal"
	};
	if (proposal.actions.length === 0) return {
		success: false,
		reason: "no_actions"
	};
	const constraints = {
		context,
		mode: input.mode,
		allow_main_ingredient_reduction: args.allowMainIngredientReduction ?? false,
		machine_capacity_grams: input.machine_capacity_grams,
		target_batch_grams: input.target_batch_grams
	};
	const candidates = args.candidates ?? DEFAULT_CORRECTION_CANDIDATES;
	const newInput = applyCorrectionActions(input, proposal.actions, constraints, candidates);
	if (newInput === null) return {
		success: false,
		reason: "apply_failed"
	};
	return {
		success: true,
		newInput,
		actions: proposal.actions
	};
}

//#endregion
//#region src/engine/corrections/recovery.ts
const EPSILON$1 = 1e-9;
const DEFAULT_FINE_STEP_G = .1;
const DEFAULT_COARSE_STEP_G = .5;
const effectiveGrams = (item) => item.actual_grams ?? item.planned_grams;
const totalMass = (input) => input.items.reduce((sum, item) => sum + effectiveGrams(item), 0);
const roundTo = (value, precision) => Math.round((value + Number.EPSILON) / precision) * precision;
const withLineAddition = (input, lineId, additionG) => {
	const items = input.items.map((item) => {
		if (item.id !== lineId) return item;
		return item.actual_grams === null ? {
			...item,
			planned_grams: item.planned_grams + additionG
		} : {
			...item,
			actual_grams: item.actual_grams + additionG
		};
	});
	return {
		...input,
		items,
		target_batch_grams: totalMass({
			...input,
			items
		})
	};
};
/**
* Minimum-material recovery is add-only and deliberately conservative about
* which selected products it may use. Main, exact/percentage locks,
* stabilizers, flavourings and alcohol are not silent dilution material.
* Confirmed `already_added` products remain eligible because their physical
* amount is a lower bound, not an upper bound.
*/
const minimumRecoveryLines = (input) => input.items.filter((item) => item.lock_type !== "main" && item.lock_type !== "grams" && item.lock_type !== "percent" && item.grams_constraint === void 0 && item.percent_constraint === void 0 && item.ingredient.category !== "alcohol" && item.ingredient.category !== "flavor" && item.ingredient.category !== "stabilizer" && item.ingredient.flags?.is_stabilizer !== true);
const reasonsFor = (result) => detectViolations(result).map((violation) => violation.reason);
const reasonKey = (reasons) => [...reasons].sort().join("|");
const actionFor = (item, grams) => ({
	type: "add",
	ingredient_id: item.ingredient.id,
	ingredient_name: item.ingredient.name,
	ingredient_category: item.ingredient.category,
	grams,
	target_line_id: item.id
});
function minimumSafeRecovery(request) {
	const fineStepG = Math.max(.1, request.fineStepG ?? DEFAULT_FINE_STEP_G);
	const coarseStepG = Math.max(fineStepG, request.coarseStepG ?? DEFAULT_COARSE_STEP_G);
	const maxAdditionalMassG = Math.max(coarseStepG, request.maxAdditionalMassG ?? Math.min(500, Math.max(10, request.input.target_batch_grams / 2)));
	const eligible = minimumRecoveryLines(request.input);
	const candidates = [];
	const reasonSets = /* @__PURE__ */ new Map();
	let evaluatedCandidateCount = 0;
	let hardSafeCandidateCount = 0;
	for (const item of eligible) {
		let firstCoarseSafe = null;
		for (let additionG = coarseStepG; additionG <= maxAdditionalMassG + EPSILON$1; additionG += coarseStepG) {
			const roundedAddition = roundTo(additionG, fineStepG);
			const reasons = reasonsFor(calculateRecipe(withLineAddition(request.input, item.id, roundedAddition)));
			evaluatedCandidateCount += 1;
			reasonSets.set(reasonKey(reasons), reasons);
			if (reasons.length === 0) {
				firstCoarseSafe = roundedAddition;
				break;
			}
		}
		if (firstCoarseSafe === null) continue;
		let bestAddition = firstCoarseSafe;
		const refinementStart = Math.max(fineStepG, firstCoarseSafe - coarseStepG + fineStepG);
		for (let additionG = refinementStart; additionG <= firstCoarseSafe + EPSILON$1; additionG += fineStepG) {
			const roundedAddition = roundTo(additionG, fineStepG);
			const reasons = reasonsFor(calculateRecipe(withLineAddition(request.input, item.id, roundedAddition)));
			evaluatedCandidateCount += 1;
			reasonSets.set(reasonKey(reasons), reasons);
			if (reasons.length === 0) {
				bestAddition = roundedAddition;
				break;
			}
		}
		for (const additionG of new Set([bestAddition, firstCoarseSafe])) {
			const input = withLineAddition(request.input, item.id, additionG);
			const result = calculateRecipe(input);
			if (reasonsFor(result).length !== 0) continue;
			hardSafeCandidateCount += 1;
			candidates.push({
				input,
				result,
				actions: [actionFor(item, additionG)],
				additionalMassG: additionG,
				scaleFactor: null
			});
		}
	}
	candidates.sort((left, right) => left.additionalMassG - right.additionalMassG || left.actions[0].target_line_id.localeCompare(right.actions[0].target_line_id));
	return {
		candidates,
		trace: {
			objective: "minimum_safe",
			evaluatedCandidateCount,
			hardSafeCandidateCount,
			eligibleLineCount: eligible.length,
			uniqueHardReasonSets: [...reasonSets.values()],
			finalCandidateGrams: candidates.map((candidate) => candidate.result.total_batch_g)
		}
	};
}
function restoreOriginalProfile(request) {
	const precision = Math.max(.1, request.fineStepG ?? DEFAULT_FINE_STEP_G);
	const currentById = new Map(request.input.items.map((item) => [item.id, item]));
	let scaleFactor = 1;
	for (const baseline of request.baselineInput.items) {
		const current = currentById.get(baseline.id);
		if (!current || baseline.planned_grams <= EPSILON$1) continue;
		scaleFactor = Math.max(scaleFactor, effectiveGrams(current) / baseline.planned_grams);
	}
	if (scaleFactor <= 1.000000001) return {
		candidates: [],
		trace: {
			objective: "restore_original_profile",
			evaluatedCandidateCount: 0,
			hardSafeCandidateCount: 0,
			eligibleLineCount: request.input.items.length,
			uniqueHardReasonSets: [],
			finalCandidateGrams: []
		}
	};
	const baselineById = new Map(request.baselineInput.items.map((item) => [item.id, item]));
	const actions = [];
	const items = request.input.items.map((item) => {
		const baseline = baselineById.get(item.id);
		if (!baseline) return item;
		const currentGrams = effectiveGrams(item);
		const targetGrams = Math.max(currentGrams, roundTo(baseline.planned_grams * scaleFactor, precision));
		const additionG = targetGrams - currentGrams;
		if (additionG > EPSILON$1) actions.push(actionFor(item, additionG));
		return item.actual_grams === null ? {
			...item,
			planned_grams: targetGrams
		} : {
			...item,
			actual_grams: targetGrams
		};
	});
	const input = {
		...request.input,
		items,
		target_batch_grams: totalMass({
			...request.input,
			items
		})
	};
	const result = calculateRecipe(input);
	const reasons = reasonsFor(result);
	const candidate = {
		input,
		result,
		actions,
		additionalMassG: result.total_batch_g - totalMass(request.input),
		scaleFactor
	};
	return {
		candidates: reasons.length === 0 && actions.length > 0 ? [candidate] : [],
		trace: {
			objective: "restore_original_profile",
			evaluatedCandidateCount: 1,
			hardSafeCandidateCount: reasons.length === 0 ? 1 : 0,
			eligibleLineCount: request.input.items.length,
			uniqueHardReasonSets: [reasons],
			finalCandidateGrams: reasons.length === 0 ? [result.total_batch_g] : []
		}
	};
}
/**
* Existing Engine/Rescue authority for the two Production recovery objectives.
* This changes no band, coefficient, PAC/NPAC rule or ProductBehavior value;
* it generates add-only candidate vectors and accepts them only after the
* canonical Engine re-runs the completed batch.
*/
function proposeBatchRecovery(request) {
	return request.objective === "minimum_safe" ? minimumSafeRecovery(request) : restoreOriginalProfile(request);
}

//#endregion
//#region src/data/ingredients/canonicalIngredientIdentity.ts
const CORE_INGREDIENT_IDENTITIES = [
	{
		role: "sweetener_sucrose",
		toolboxId: "sucrose",
		mapperId: "PI-ING-000514",
		namePl: "Sacharoza (cukier)"
	},
	{
		role: "sugar_freezing_control",
		toolboxId: "dextrose",
		mapperId: "PI-ING-000494",
		namePl: "Dekstroza"
	},
	{
		role: "stabilizer",
		toolboxId: "tara_gum",
		mapperId: "PI-ING-000492",
		namePl: "Guma tara"
	},
	{
		role: "dairy_fat",
		toolboxId: "cream_30",
		mapperId: "PI-ING-000180",
		namePl: "Śmietanka 30%"
	},
	{
		role: "primary_liquid",
		toolboxId: "milk_3_5",
		mapperId: "PI-ING-000236",
		namePl: "Mleko 3,5%"
	},
	{
		role: "milk_solids",
		toolboxId: "smp",
		mapperId: "PI-ING-000270",
		namePl: "Odtłuszczone mleko w proszku"
	},
	{
		role: "fiber_body",
		toolboxId: "inulin",
		mapperId: "PI-ING-000456",
		namePl: "Inulina"
	},
	{
		role: "water",
		toolboxId: "water",
		mapperId: "PI-ING-001409",
		namePl: "Woda"
	}
];
/** Exact legacy/demo identities used only to route an existing line through
* the server resolver. They grant no eligibility and contain no policy data. */
const LEGACY_BUILTIN_INGREDIENT_IDENTITIES = [
	{
		role: "salt",
		toolboxId: "salt",
		mapperId: "PI-ING-000458",
		namePl: "Sól"
	},
	{
		role: "fruit_main",
		toolboxId: "raspberry",
		mapperId: "PI-ING-000394",
		namePl: "Maliny"
	},
	{
		role: "fruit_main",
		toolboxId: "banana",
		mapperId: "PI-ING-000345",
		namePl: "Banan"
	},
	{
		role: "cocoa_main",
		toolboxId: "cocoa_2224",
		mapperId: "PI-ING-001578",
		namePl: "Kakao 22/24"
	},
	{
		role: "chocolate_main",
		toolboxId: "dark_chocolate_70",
		mapperId: "PI-ING-000102",
		namePl: "Czekolada gorzka 70%"
	},
	{
		role: "nut_main",
		toolboxId: "pistachio_paste",
		mapperId: "PI-ING-000614",
		namePl: "Pasta pistacjowa 100%"
	},
	{
		role: "alcohol_main",
		toolboxId: "whiskey_40",
		mapperId: "PI-ING-000038",
		namePl: "Whisky 40%"
	}
];
/** Protein-profile aliases share canonical deduplication without widening the frozen core toolbox. */
const PROTEIN_INGREDIENT_IDENTITIES = [
	{
		role: "protein_source",
		toolboxId: "wpc_60",
		mapperId: "PI-ING-000294",
		namePl: "WPC60"
	},
	{
		role: "protein_source",
		toolboxId: "mpc_75",
		mapperId: "PI-ING-000237",
		namePl: "MPC75"
	},
	{
		role: "protein_source",
		toolboxId: "protein_gel_wpc",
		mapperId: "PI-ING-000264",
		namePl: "Protein Gel WPC"
	},
	{
		role: "protein_source",
		toolboxId: "wpc_80",
		mapperId: "PI-ING-000295",
		namePl: "WPC80"
	},
	{
		role: "high_protein_dairy",
		toolboxId: "skyr_12",
		mapperId: "PI-ING-001395",
		namePl: "Skyr"
	},
	{
		role: "high_protein_dairy",
		toolboxId: "skyr_11",
		mapperId: "PI-ING-001451",
		namePl: "Skyr"
	},
	{
		role: "protein_source",
		toolboxId: "pea_protein",
		mapperId: "PI-ING-000451",
		namePl: "Bialko grochu"
	},
	{
		role: "protein_source",
		toolboxId: "rice_protein",
		mapperId: "PI-ING-000452",
		namePl: "Bialko ryzowe"
	}
];
const ALL_INGREDIENT_IDENTITIES = [
	...CORE_INGREDIENT_IDENTITIES,
	...PROTEIN_INGREDIENT_IDENTITIES,
	...LEGACY_BUILTIN_INGREDIENT_IDENTITIES
];
const BY_TOOLBOX_ID = new Map(ALL_INGREDIENT_IDENTITIES.map((entry) => [entry.toolboxId, entry]));
const BY_MAPPER_ID = new Map(ALL_INGREDIENT_IDENTITIES.map((entry) => [entry.mapperId, entry]));
/** True only for the closed, exact Mapper/toolbox bridge above. It is used to
* require resolver authority for accepted built-ins without inferring identity
* from a translated display name. */
function hasCanonicalIngredientIdentity(id) {
	if (!id) return false;
	return BY_TOOLBOX_ID.has(id) || BY_MAPPER_ID.has(id);
}
/** Exact stable key. Legacy toolbox ids resolve through the closed registry. */
function canonicalIngredientId(ingredient) {
	const toolboxIdentity = BY_TOOLBOX_ID.get(ingredient.id);
	if (toolboxIdentity) return toolboxIdentity.mapperId;
	if (ingredient.id.startsWith("PI-ING-")) return ingredient.id;
	const explicit = ingredient.canonical_ingredient_id?.trim();
	if (explicit) return explicit;
	return ingredient.id;
}

//#endregion
//#region src/features/recipe-constraints/constraintSet.ts
/** Spec §6 display precision — the same tolerance the engine's batch-mismatch
* warning uses. Used ONLY for sum-vs-batch sanity, never for lock precision. */
const BATCH_SUM_TOLERANCE_G = .1;
/** Numeric equality for a percentage share (percentage points). */
const PERCENT_LOCK_TOLERANCE = 1e-9;
/**
* Verify that a (possibly solver-modified) recipe still honors the constraint
* set: locked lines carry the EXACT grams (Object.is — no epsilon), range
* lines stay inside [minGrams, maxGrams]. Solver-added lines are ignored
* (they carry no constraint). Usable as a final apply-gate by UI flows.
*/
function verifyConstraintsPreserved(set, after) {
	const violations = [];
	const lineById = new Map(after.items.map((item) => [item.id, item]));
	for (const [lineId, constraint] of Object.entries(set.byLineId)) {
		if (constraint.mode === "ai") continue;
		const line = lineById.get(lineId);
		if (!line) {
			violations.push({
				lineId,
				code: "line_missing"
			});
			continue;
		}
		if (constraint.mode === "locked") {
			if (!Object.is(line.planned_grams, constraint.grams)) violations.push({
				lineId,
				code: "locked_grams_changed"
			});
		} else if (constraint.mode === "percent") {
			const actualPercent = after.target_batch_grams > 0 ? line.planned_grams / after.target_batch_grams * 100 : NaN;
			if (!Number.isFinite(actualPercent) || Math.abs(actualPercent - constraint.percent) > 1e-9) violations.push({
				lineId,
				code: "locked_percent_changed"
			});
		} else if (line.planned_grams < constraint.minGrams || line.planned_grams > constraint.maxGrams) violations.push({
			lineId,
			code: "range_exceeded"
		});
	}
	return {
		ok: violations.length === 0,
		violations
	};
}

//#endregion
//#region src/features/formulation-strategy/strategy.ts
/** Frozen migration: only historical ECO remains ECO; every old quality tier becomes OPTIMAL. */
function normalizeFormulationStrategy(value) {
	return value === "eco" ? "eco" : "optimal";
}

//#endregion
//#region src/data/ingredients/verifiedVeganToolbox.ts
/**
* Small role-filtered Vegan formulation pool mirrored from the canonical
* mapper_basement.csv v1.0 rows. It is deliberately NOT a replacement Mapper:
* exact ids/compositions are pinned against the CSV by tests and the full
* catalogue remains backend-owned. Mapper 2088 adds four verified,
* engine-approved soy products; those exact canonical rows are mirrored here.
*/
const ZERO = {
	water_percent: 0,
	solids_percent: 0,
	fat_percent: 0,
	protein_percent: 0,
	carbohydrate_percent: 0,
	sugar_percent: 0,
	sucrose_percent: 0,
	glucose_percent: 0,
	dextrose_percent: 0,
	fructose_percent: 0,
	lactose_percent: 0,
	polyol_percent: 0,
	fiber_percent: 0,
	salt_percent: 0,
	alcohol_percent: 0,
	kcal_per_100g: 0
};
const verified = (id, name, composition, pod, pac, costPerKg) => ({
	id,
	canonical_ingredient_id: id,
	private_product_id: null,
	identity_provenance: "mapper",
	name,
	category: "other",
	composition: {
		...ZERO,
		...composition
	},
	pod_value: pod,
	pac_value: pac,
	npac_value: null,
	de_value: null,
	cost_per_kg: costPerKg,
	confidence_score: 95,
	source_type: "verified_db",
	is_verified: true,
	flags: {
		vegan_eligibility: "VEGAN_VERIFIED",
		vegan_eligibility_reasons: ["verified_mapper_vegan_true"]
	}
});
const VERIFIED_VEGAN_FORMULATION_CANDIDATES = [
	verified("PI-ING-001565", "OAT DRINK · Beverage · Chilled · BIO", {
		water_percent: 92.18,
		solids_percent: 7.82,
		fat_percent: 1.3,
		protein_percent: .4,
		carbohydrate_percent: 6,
		sugar_percent: 4.1,
		sucrose_percent: 4.1,
		salt_percent: .12,
		kcal_per_100g: 37
	}, 4.1, 4.802, null),
	verified("PI-ING-001566", "RICE DRINK · Beverage · Chilled", {
		water_percent: 88.6,
		solids_percent: 11.4,
		fat_percent: .9,
		protein_percent: .1,
		carbohydrate_percent: 10.3,
		sugar_percent: 4.47,
		sucrose_percent: .03,
		salt_percent: .1,
		kcal_per_100g: 50
	}, 4.47, 5.055, null),
	verified("PI-ING-002109", "SOY DRINK 0% ADDED SUGAR · Carrefour · UHT", {
		water_percent: 93.94,
		solids_percent: 6.06,
		fat_percent: 1.8,
		protein_percent: 3.2,
		carbohydrate_percent: 1,
		sugar_percent: .7,
		sucrose_percent: .7,
		fiber_percent: 0,
		salt_percent: .06,
		kcal_per_100g: 33
	}, .7, .7, 1.71),
	verified("PI-ING-002110", "HIGH-PROTEIN SOY DRINK · EcoCesta · BIO", {
		water_percent: 88.1,
		solids_percent: 11.9,
		fat_percent: 2.6,
		protein_percent: 5.2,
		carbohydrate_percent: 2.7,
		sugar_percent: 2.4,
		sucrose_percent: 2.4,
		fiber_percent: 1.3,
		salt_percent: .1,
		kcal_per_100g: 58
	}, 2.4, 2.4, 3.25),
	verified("PI-ING-002111", "SOY SKYR HIGH PROTEIN NATURAL · Alpro · Chilled", {
		water_percent: 86.47,
		solids_percent: 13.53,
		fat_percent: 3.3,
		protein_percent: 6,
		carbohydrate_percent: 2.6,
		sugar_percent: 2.5,
		sucrose_percent: 2.5,
		fiber_percent: 1.3,
		salt_percent: .33,
		kcal_per_100g: 68
	}, 2.5, 2.5, 6.97),
	verified("PI-ING-002112", "SOY PLUS LIGHT 0% SUGAR · Vivesoy · UHT", {
		water_percent: 94.48,
		solids_percent: 5.52,
		fat_percent: 1.4,
		protein_percent: 2.7,
		carbohydrate_percent: .5,
		sugar_percent: 0,
		sucrose_percent: 0,
		fiber_percent: .8,
		salt_percent: .12,
		kcal_per_100g: 27
	}, 0, 0, null),
	verified("PI-ING-001587", "ALMOND DRINK · Beverage · Chilled", {
		water_percent: 90.7,
		solids_percent: 9.3,
		fat_percent: 2.2,
		protein_percent: .7,
		carbohydrate_percent: 5.9,
		sugar_percent: 3.28,
		sucrose_percent: .56,
		glucose_percent: .05,
		fructose_percent: 2.6,
		fiber_percent: .3,
		salt_percent: .2,
		kcal_per_100g: 47
	}, 5.089, 6.835, null),
	verified("PI-ING-000163", "REFINED COCONUT OIL · Elstar Fats Coconut · Dry", {
		solids_percent: 100,
		fat_percent: 100,
		kcal_per_100g: 900
	}, 0, 0, 5),
	verified("PI-ING-000305", "SUNFLOWER OIL · Fat", {
		solids_percent: 100,
		fat_percent: 100,
		kcal_per_100g: 900
	}, 0, 0, 4),
	verified("PI-ING-000451", "PEA PROTEIN · Protein · Dry", {
		water_percent: 2.2,
		solids_percent: 97.8,
		fat_percent: 9,
		protein_percent: 81.7,
		carbohydrate_percent: .7,
		fiber_percent: 1.4,
		salt_percent: 5,
		kcal_per_100g: 413
	}, 0, 29.25, 12),
	verified("PI-ING-000452", "RICE PROTEIN · Protein · Dry", {
		water_percent: 1,
		solids_percent: 99,
		fat_percent: 5,
		protein_percent: 84,
		carbohydrate_percent: 5,
		fiber_percent: 5,
		kcal_per_100g: 429
	}, 0, 0, 12)
];
const VEGAN_VERIFIED_CANONICAL_IDS = new Set([
	"PI-ING-000163",
	"PI-ING-000305",
	"PI-ING-000451",
	"PI-ING-000452",
	"PI-ING-001565",
	"PI-ING-001566",
	"PI-ING-001587",
	"PI-ING-002109",
	"PI-ING-002110",
	"PI-ING-002111",
	"PI-ING-002112",
	"PI-ING-000514",
	"PI-ING-000494",
	"PI-ING-000492",
	"PI-ING-000456",
	"PI-ING-001409",
	"sucrose",
	"dextrose",
	"tara_gum",
	"inulin",
	"water"
]);

//#endregion
//#region src/data/ingredients/veganEligibility.ts
const PRIVATE_PRODUCT_VEGAN_REASON_PREFIX = "private_product_vegan_";
/** Runtime assessment for an already-mapped Engine ingredient. Mapper-derived
* ingredients carry the canonical assessment in flags. Legacy/manual rows with
* no proof remain UNKNOWN; explicit animal flags remain FALSE. */
function assessEngineIngredientVeganEligibility(ingredient) {
	const flaggedStatus = ingredient.flags?.vegan_eligibility;
	const flaggedReasons = [...ingredient.flags?.vegan_eligibility_reasons ?? []];
	const hasAnimalFlag = ingredient.flags?.is_animal_origin === true || ingredient.flags?.is_dairy === true;
	if (flaggedStatus === "VEGAN_VERIFIED" && hasAnimalFlag) return {
		status: "VEGAN_CONFLICT",
		reasons: ["verified_vegan_vs_engine_animal_flag", ...flaggedReasons]
	};
	if (ingredient.identity_provenance === "private_product") {
		if (flaggedStatus && flaggedReasons.some((reason) => reason.startsWith(PRIVATE_PRODUCT_VEGAN_REASON_PREFIX))) return {
			status: flaggedStatus,
			reasons: flaggedReasons
		};
		if (hasAnimalFlag) return {
			status: "VEGAN_FALSE",
			reasons: ["engine_animal_origin_flag"]
		};
		return {
			status: "VEGAN_UNKNOWN",
			reasons: ["private_product_has_no_own_verified_vegan_evidence"]
		};
	}
	if (ingredient.flags?.vegan_eligibility) return {
		status: ingredient.flags.vegan_eligibility,
		reasons: flaggedReasons
	};
	if (hasAnimalFlag) return {
		status: "VEGAN_FALSE",
		reasons: ["engine_animal_origin_flag"]
	};
	const canonicalId = ingredient.canonical_ingredient_id ?? ingredient.id;
	if (VEGAN_VERIFIED_CANONICAL_IDS.has(canonicalId)) return {
		status: "VEGAN_VERIFIED",
		reasons: ["verified_canonical_mapper_identity"]
	};
	return {
		status: "VEGAN_UNKNOWN",
		reasons: ["engine_ingredient_has_no_verified_vegan_evidence"]
	};
}
function veganRecipeEligibilityIssues(items) {
	return items.filter((item) => item.planned_grams > 0).flatMap((item) => {
		const assessment = assessEngineIngredientVeganEligibility(item.ingredient);
		if (assessment.status === "VEGAN_VERIFIED") return [];
		return [{
			lineId: item.id,
			ingredientId: item.ingredient.id,
			ingredientName: item.ingredient.name,
			status: assessment.status,
			reasons: assessment.reasons
		}];
	});
}

//#endregion
//#region src/features/formulation/ingredientRoles.ts
/**
* THE PAC/POD UNIT CONTRACT (spec §7–§8; `engine/pod.ts`, `engine/pac.ts`).
*
* Stored `pod_value` / `pac_value` — on the Mapper row and on `EngineIngredient`
* alike — are per-100 g POINTS with sucrose = 100; the engine spends them as
* `grams × value / 100`. The engine's own coefficient tables in
* `src/engine/config/coefficients.ts` (sucrose 1.00, dextrose 1.90) are the
* 0–1 FACTOR scale this classifier has always reasoned in.
*
* Role classification is the only place that has to cross between the two, so
* the conversion happens HERE, once, on the read side. The stored value is
* never rewritten and no calculation that legitimately spends PAC=100 as an
* index is touched.
*/
const ROLE_CLASSIFICATION_POINTS_PER_FACTOR = 100;
/** Stored per-100 g points → the coefficient factor role rules compare against. */
function normalizeStoredPointsToRoleFactor(points) {
	return points == null || !Number.isFinite(points) ? null : points / 100;
}
/**
* „This component IS the ingredient" — the dominance convention this file
* already applies to salt and fibre, reused for the sucrose sweeteners.
*/
const DOMINANT_COMPONENT_PERCENT = 50;
/**
* The PAC/POD FACTOR separating sucrose (1.00) from the freezing-control sugars
* (dextrose/glucose/fructose 1.90) in the engine's coefficient table (spec §8).
* This is the long-standing separator — unchanged in value, now finally
* compared on the scale it was written for.
*/
const SUGAR_FREEZING_CONTROL_FACTOR = 1.3;
/**
* Plain water carries no solids, no sweetness and no freezing power of its own.
* This is the composition SANITY half of the water rule — never the whole test:
* a zero-sugar cola has exactly the same numbers.
*/
function isInertAqueous(ingredient) {
	const c = ingredient.composition;
	return c.water_percent >= 99 && c.solids_percent <= 1 && c.sugar_percent <= 0 && c.fat_percent <= 0 && c.protein_percent <= 0 && c.polyol_percent <= 0 && c.alcohol_percent <= 0 && c.fiber_percent <= 0 && (ingredient.pod_value === null || ingredient.pod_value === 0) && (ingredient.pac_value === null || ingredient.pac_value === 0);
}
/** Deterministic functional-role resolution from existing engine data only. */
function resolveFunctionalRole(ingredient) {
	const c = ingredient.composition;
	const id = ingredient.id.toLowerCase();
	const name = ingredient.name.toLowerCase();
	if (ingredient.category === "water" || id === "water" || name === "water") return "water";
	if (ingredient.source_subcategory?.trim().toLocaleLowerCase("en") === "water" && isInertAqueous(ingredient)) return "water";
	if (id.includes("inulin") || name.includes("inulin") || name.includes("inulina")) return "fiber_body";
	if (ingredient.category === "stabilizer") return "stabilizer";
	if (c.salt_percent >= DOMINANT_COMPONENT_PERCENT) return "salt_modifier";
	if (ingredient.category === "fruit") return "fruit";
	if (ingredient.category === "chocolate_cocoa") return "chocolate_cocoa";
	if (ingredient.category === "nut_paste") return "nut_paste";
	if (ingredient.category === "alcohol" || c.alcohol_percent >= 5) return "alcohol";
	if (ingredient.category === "egg") return "egg";
	if (ingredient.category === "sugar") {
		const controlSugars = c.dextrose_percent + c.fructose_percent + c.glucose_percent;
		const pac = normalizeStoredPointsToRoleFactor(ingredient.pac_value);
		const pod = normalizeStoredPointsToRoleFactor(ingredient.pod_value);
		return c.sucrose_percent >= DOMINANT_COMPONENT_PERCENT && c.sucrose_percent > controlSugars && c.sucrose_percent > c.polyol_percent && (pac === null || pac < SUGAR_FREEZING_CONTROL_FACTOR) && (pod === null || pod < SUGAR_FREEZING_CONTROL_FACTOR) ? "sweetener_sucrose" : "sugar_freezing_control";
	}
	if (c.fiber_percent >= DOMINANT_COMPONENT_PERCENT) return "fiber_body";
	if (ingredient.category === "dairy") {
		if (c.fat_percent >= 20) return "dairy_fat";
		if (c.protein_percent >= 50) return "protein_source";
		if (c.solids_percent >= 85) return c.protein_percent >= 25 ? "milk_solids" : "milk_solids";
		if (c.protein_percent >= 25) return "protein_source";
		return "primary_liquid";
	}
	const animal = ingredient.flags?.is_animal_origin === true;
	if (!animal && (name.includes("coconut") || name.includes("kokos")) && c.fat_percent >= 10) return "plant_fat";
	if (!animal && c.water_percent >= 75 && (name.includes("drink") || name.includes("oat") || name.includes("soy") || name.includes("napój"))) return "plant_liquid";
	if (c.protein_percent >= 30) return "protein_source";
	return "flavor_other";
}

//#endregion
//#region src/features/recipe-constraints/gelatoStabilizerSystemAuthority.ts
const GELATO_STABILIZER_SYSTEM_POLICY = Object.freeze({
	policyId: "gellatti-gelato-stabilizer-system",
	version: 1,
	provenance: "owner-approved Gellatti formulation policy",
	minPercent: .2,
	preferredPercent: .3,
	maxPercent: .5,
	gramSemantics: "whole_grams"
});
const GELATO_CATEGORIES = new Set([
	"milk_gelato",
	"fruit_gelato",
	"nut_gelato",
	"chocolate_gelato",
	"alcohol_gelato"
]);
const gelatoStabilizerSystemApplies = (category) => GELATO_CATEGORIES.has(category);
/** Owner-approved integer feasibility conversion. Hard bounds are rounded
* inward, so rounding can never broaden the percentage authority. */
function gelatoStabilizerWholeGramBand(baseGrams) {
	if (!Number.isFinite(baseGrams) || baseGrams <= 0) return {
		minGrams: 0,
		preferredGrams: 0,
		maxGrams: 0
	};
	const minimumGrams = Math.ceil(baseGrams * GELATO_STABILIZER_SYSTEM_POLICY.minPercent / 100);
	const maximumGrams = Math.floor(baseGrams * GELATO_STABILIZER_SYSTEM_POLICY.maxPercent / 100);
	const rawPreferred = Math.round(baseGrams * GELATO_STABILIZER_SYSTEM_POLICY.preferredPercent / 100);
	return {
		minGrams: minimumGrams,
		preferredGrams: Math.min(maximumGrams, Math.max(minimumGrams, rawPreferred)),
		maxGrams: maximumGrams
	};
}
const gelatoStabilizerSystemItems = (items) => items.filter((item) => resolveFunctionalRole(item.ingredient) === "stabilizer");
/** Canonical aggregate assessment used by terminal recipe authority. Individual
* products may impose a tighter ProductBehavior ceiling in parallel. */
function assessGelatoStabilizerSystem(input) {
	if (!gelatoStabilizerSystemApplies(input.category)) return {
		applicable: false,
		present: false,
		totalGrams: 0,
		lineIds: [],
		band: null,
		issues: []
	};
	const positive = gelatoStabilizerSystemItems(input.items).filter((item) => item.planned_grams > 0);
	const lineIds = positive.map((item) => item.id);
	const totalGrams = positive.reduce((sum, item) => sum + item.planned_grams, 0);
	const band = gelatoStabilizerWholeGramBand(input.target_batch_grams);
	const issues = [];
	if (positive.length === 0) return {
		applicable: true,
		present: false,
		totalGrams: 0,
		lineIds: [],
		band,
		issues: []
	};
	const fractional = positive.filter((item) => !Number.isInteger(item.planned_grams));
	if (fractional.length > 0) issues.push({
		code: "component_not_whole_grams",
		lineIds: fractional.map((item) => item.id),
		messagePl: "Składniki systemu stabilizującego Gelato muszą mieć pełne gramy.",
		totalGrams,
		minGrams: band.minGrams,
		maxGrams: band.maxGrams
	});
	if (totalGrams < band.minGrams) issues.push({
		code: "aggregate_below_minimum",
		lineIds,
		messagePl: `Łączny system stabilizujący dla tej partii wymaga co najmniej ${band.minGrams} g.`,
		totalGrams,
		minGrams: band.minGrams,
		maxGrams: band.maxGrams
	});
	else if (totalGrams > band.maxGrams) issues.push({
		code: "aggregate_above_maximum",
		lineIds,
		messagePl: `Łączny limit systemu stabilizującego dla tej partii został osiągnięty: ${band.maxGrams} g.`,
		totalGrams,
		minGrams: band.minGrams,
		maxGrams: band.maxGrams
	});
	return {
		applicable: true,
		present: positive.length > 0,
		totalGrams,
		lineIds,
		band,
		issues
	};
}

//#endregion
//#region src/features/recipe-constraints/sorbetStabilizerSystemAuthority.ts
const SORBET_STABILIZER_SYSTEM_POLICY = Object.freeze({
	policyId: "gellatti-sorbet-stabilizer-system",
	version: 1,
	provenance: "owner-approved Gellatti Sorbet formulation policy",
	minPercent: .2,
	preferredPercent: .4,
	maxPercent: .5,
	gramSemantics: "whole_grams",
	optionalWhenAbsent: true
});
const sorbetStabilizerSystemApplies = (category) => category === "sorbet";
/** Hard limits round inward, so whole-gram execution cannot broaden the
* owner-approved percentage envelope. */
function sorbetStabilizerWholeGramBand(baseGrams) {
	if (!Number.isFinite(baseGrams) || baseGrams <= 0) return {
		minGrams: 0,
		preferredGrams: 0,
		maxGrams: 0
	};
	const minGrams = Math.ceil(baseGrams * SORBET_STABILIZER_SYSTEM_POLICY.minPercent / 100);
	const maxGrams = Math.floor(baseGrams * SORBET_STABILIZER_SYSTEM_POLICY.maxPercent / 100);
	const rawPreferred = Math.round(baseGrams * SORBET_STABILIZER_SYSTEM_POLICY.preferredPercent / 100);
	return {
		minGrams,
		preferredGrams: Math.min(maxGrams, Math.max(minGrams, rawPreferred)),
		maxGrams
	};
}
const sorbetStabilizerSystemItems = (items) => items.filter((item) => resolveFunctionalRole(item.ingredient) === "stabilizer");
function assessSorbetStabilizerSystem(input) {
	if (!sorbetStabilizerSystemApplies(input.category)) return {
		applicable: false,
		present: false,
		totalGrams: 0,
		lineIds: [],
		band: null,
		issues: []
	};
	const positive = sorbetStabilizerSystemItems(input.items).filter((item) => item.planned_grams > 0);
	const lineIds = positive.map((item) => item.id);
	const totalGrams = positive.reduce((sum, item) => sum + item.planned_grams, 0);
	const band = sorbetStabilizerWholeGramBand(input.target_batch_grams);
	const issues = [];
	if (positive.length === 0) return {
		applicable: true,
		present: false,
		totalGrams: 0,
		lineIds: [],
		band,
		issues
	};
	const fractional = positive.filter((item) => !Number.isInteger(item.planned_grams));
	if (fractional.length > 0) issues.push({
		code: "component_not_whole_grams",
		lineIds: fractional.map((item) => item.id),
		messagePl: "Składniki systemu stabilizującego Sorbet muszą mieć pełne gramy.",
		totalGrams,
		minGrams: band.minGrams,
		maxGrams: band.maxGrams
	});
	if (totalGrams < band.minGrams) issues.push({
		code: "aggregate_below_minimum",
		lineIds,
		messagePl: `Łączny system stabilizujący Sorbet wymaga co najmniej ${band.minGrams} g.`,
		totalGrams,
		minGrams: band.minGrams,
		maxGrams: band.maxGrams
	});
	else if (totalGrams > band.maxGrams) issues.push({
		code: "aggregate_above_maximum",
		lineIds,
		messagePl: `Łączny limit systemu stabilizującego Sorbet wynosi ${band.maxGrams} g.`,
		totalGrams,
		minGrams: band.minGrams,
		maxGrams: band.maxGrams
	});
	return {
		applicable: true,
		present: positive.length > 0,
		totalGrams,
		lineIds,
		band,
		issues
	};
}

//#endregion
//#region src/features/formulation/stabilizerDosage.ts
const APPROVED_STABILIZER_DOSAGES = [{
	mapperId: "PI-ING-000492",
	toolboxId: "tara_gum",
	namePl: "Guma tara",
	kind: "pure_gum",
	minPercentOfTotalMix: .2,
	maxPercentOfTotalMix: 1,
	unit: "percent_of_total_mix",
	provenance: "mapper_basement v1.0 PI-ING-000492 recommended_dosage_percent_min/max (percent of total mix; staging-verified read-only 2026-07-24)"
}, {
	mapperId: "PI-ING-000490",
	toolboxId: null,
	namePl: "IC · Solmix Stabilizer",
	kind: "stabilizer_blend",
	minPercentOfTotalMix: .2,
	maxPercentOfTotalMix: 1,
	unit: "percent_of_total_mix",
	provenance: "mapper_basement v1.0 PI-ING-000490 recommended_dosage_percent_min/max (percent of total mix; staging-verified read-only 2026-07-24)"
}];
/** EXACT-identity lookup (engine toolbox id OR stable Mapper id). No fallback
* of any kind — an unregistered ingredient has no approved window. */
function approvedStabilizerDosage(ingredientId) {
	return APPROVED_STABILIZER_DOSAGES.find((entry) => entry.mapperId === ingredientId || entry.toolboxId === ingredientId) ?? null;
}
const DOSAGE_EPS = 1e-9;
/**
* A stabilizer carrier has an approved identity/dose contract, but no approved
* Engine activity gradient. Its dosage window is a safety clamp only: it is
* never permission for PI to move the dose while chasing POD, NPAC or a
* Direction preference. Inulin resolves to `fiber_body`, so it deliberately
* remains an adjustable solids/body lever.
*/
const isTemplateControlledStabilizer = (ingredient) => resolveFunctionalRole(ingredient) === "stabilizer";
const INTERNAL_STABILIZER_REQUIRED_CATEGORIES = new Set([
	"milk_gelato",
	"fruit_gelato",
	"nut_gelato",
	"chocolate_gelato",
	"alcohol_gelato",
	"sorbet",
	"vegan_gelato",
	"protein_gelato"
]);
/**
* Final executable stabilizer authority. Manufacturer recommended dosage and
* heat/cold fields are intentionally absent here: they remain informational.
*
* Standard Gelato and Sorbet have published Gellatti aggregate bands. Vegan
* and Protein currently have only the locked internal presence requirement;
* their approved templates may seed their recorded dose, but no manufacturer
* window is promoted into a generic hard gate.
*/
function internalStabilizerProfileIssues(input) {
	if (!INTERNAL_STABILIZER_REQUIRED_CATEGORIES.has(input.category)) return [];
	const stabilizers = input.items.filter((item) => isTemplateControlledStabilizer(item.ingredient));
	const positive = stabilizers.filter((item) => item.planned_grams > DOSAGE_EPS);
	if (positive.length === 0) return [{
		code: "stabilizer_missing",
		lineIds: stabilizers.map((item) => item.id),
		ingredientNames: stabilizers.map((item) => item.ingredient.name),
		grams: 0,
		minGrams: null,
		maxGrams: null,
		provenance: "GELLATTI Spine v1.0: stabilizer required for every active profile"
	}];
	const assessment = gelatoStabilizerSystemApplies(input.category) ? assessGelatoStabilizerSystem(input) : input.category === "sorbet" ? assessSorbetStabilizerSystem(input) : null;
	if (assessment === null) return [];
	return assessment.issues.map((issue) => ({
		code: issue.code === "aggregate_below_minimum" ? "stabilizer_below_gellatti_minimum" : issue.code === "aggregate_above_maximum" ? "stabilizer_above_gellatti_maximum" : "stabilizer_not_whole_grams",
		lineIds: issue.lineIds,
		ingredientNames: positive.map((item) => item.ingredient.name),
		grams: issue.totalGrams,
		minGrams: issue.minGrams,
		maxGrams: issue.maxGrams,
		provenance: input.category === "sorbet" ? "owner-approved Gellatti Sorbet formulation policy" : "owner-approved Gellatti formulation policy"
	}));
}
function internalStabilizerProfileMessagePl(issues) {
	const issue = issues[0];
	if (!issue) return "";
	if (issue.code === "stabilizer_missing") return "Finalna receptura tego profilu wymaga dodatniej ilości stabilizatora zgodnie z wewnętrzną authority Gellatti.";
	if (issue.code === "stabilizer_not_whole_grams") return "Składniki systemu stabilizującego muszą mieć pełne gramy.";
	const boundary = issue.code === "stabilizer_below_gellatti_minimum" ? issue.minGrams : issue.maxGrams;
	return issue.code === "stabilizer_below_gellatti_minimum" ? `Wewnętrzne minimum systemu stabilizującego Gellatti wynosi ${boundary ?? 0} g.` : `Wewnętrzne maksimum systemu stabilizującego Gellatti wynosi ${boundary ?? 0} g.`;
}

//#endregion
//#region src/features/formulation/veganProfileConstraints.ts
/** Highest owner-supplied external Vegan body reference (83.1 g / 1000 g).
* This is a fail-closed calibration envelope, NOT a universal dosage claim. */
const VEGAN_INULIN_CALIBRATION_MAX_PERCENT = 8.31;
/** Exact pure-inulin Mapper identities covered by the owner calibration envelope. */
const PURE_INULIN_CANONICAL_IDS = new Set(["PI-ING-000455", "PI-ING-000456"]);
const plannedSum = (input) => input.items.reduce((sum, item) => sum + item.planned_grams, 0);
function veganProfileConstraintIssues(input) {
	if (input.category !== "vegan_gelato") return [];
	const total = plannedSum(input);
	const issues = [];
	if (internalStabilizerProfileIssues(input).some((issue) => issue.code === "stabilizer_missing")) issues.push({
		code: "stabilizer_missing",
		lineId: null,
		ingredientName: "Stabilizator",
		grams: 0,
		minGrams: null,
		maxGrams: null,
		provenance: "Vegan final task §32: 0 g requires an explicitly verified process profile"
	});
	const inulinLines = input.items.filter((item) => {
		const id = canonicalIngredientId(item.ingredient);
		return PURE_INULIN_CANONICAL_IDS.has(id) || item.ingredient.id === "inulin";
	});
	const inulinGrams = inulinLines.reduce((sum, item) => sum + item.planned_grams, 0);
	const inulinMax = VEGAN_INULIN_CALIBRATION_MAX_PERCENT / 100 * total;
	if (total > 0 && inulinGrams > inulinMax + 1e-9) issues.push({
		code: "inulin_above_calibration_envelope",
		lineId: inulinLines[0]?.id ?? null,
		ingredientName: inulinLines[0]?.ingredient.name ?? "Inulina",
		grams: inulinGrams,
		minGrams: null,
		maxGrams: inulinMax,
		provenance: "Owner external Vegan high-inulin reference: 83.1 g per 1000 g; Mapper has no approved inulin dosage window"
	});
	return issues;
}

//#endregion
//#region src/features/formulation/violationBands.ts
/**
* HARD vs SOFT violation classification by BAND PROVENANCE (owner P0 Phase 8,
* NIGHTLY, Agent A). PURE — reads the engine's own indicator provenance flags;
* no band value is touched or invented (science freeze).
*
* Binding rule: a violation measured against a PROVISIONAL band — a
* `category_fallback` cell (an unseeded profile scored with milk_gelato
* bands), a `temperature_fallback` cell (nearest-temperature band) or an
* `estimated` band — may inform diagnostics, score and guidance, but must
* NEVER alone hard-reject a formulation or classify it unsafe. Violations on
* NATIVE approved bands stay hard: the beat-the-null gate for unconstrained
* proposals on native-band profiles is absolute (the 8 × 125 g rule).
*/
/** Classify the CURRENT recipe's out-of-band metrics by band provenance. */
function classifyViolationBands(input) {
	const result = calculateRecipe(input);
	const violations = detectViolations(result);
	const indicatorByKey = new Map(result.indicators.map((indicator) => [indicator.key, indicator]));
	const hard = /* @__PURE__ */ new Set();
	const soft = /* @__PURE__ */ new Set();
	for (const violation of violations) {
		const indicator = indicatorByKey.get(violation.metric);
		if (indicator?.category_fallback === true || indicator?.temperature_fallback === true || indicator?.band_status === "estimated") soft.add(violation.metric);
		else hard.add(violation.metric);
	}
	const categoryFallback = result.indicators.some((i) => i.category_fallback === true);
	const temperatureFallback = result.indicators.some((i) => i.temperature_fallback === true);
	return {
		hardMetrics: [...hard],
		softMetrics: [...soft],
		bandSource: categoryFallback ? "category_fallback" : "native",
		temperatureFallback
	};
}

//#endregion
//#region src/features/product-intelligence/mainCapability.ts
/** §23: never show a vague tooltip when the real reason is known. */
const REASON_PL = {
	calibrated_main_policy: null,
	user_held_no_calibration: null,
	structural_product: "Składnik techniczny — nie definiuje smaku receptury.",
	topping_product: "Produkt po produkcji (topping) nie może być składnikiem głównym.",
	protein_contributor: "Składnik białkowy nie jest automatycznie smakiem Main.",
	standard_base_product: "Składnik bazowy/standardowy — nie definiuje smaku receptury.",
	post_process_scope: "Topping nie może pełnić roli Main.",
	base_recipe_not_approved: "Produkt nie jest zatwierdzony do receptury bazowej.",
	snapshot_missing: "Produkt wymaga ponownej walidacji przed ustawieniem jako Main.",
	revalidation_required: "Historyczny produkt wymaga utworzenia nowej, zweryfikowanej wersji przed ustawieniem jako Main.",
	unknown_product: "Gellatti nie rozpoznaje jeszcze tego produktu — brakuje danych o jego roli."
};
/**
* Semantic roles that carry recipe flavour identity. These come from the
* server classifier's product semantics (category/subcategory/family), never
* from an ingredient-id list. `UNKNOWN_REQUIRES_EVIDENCE` is emitted only
* inside the classifier's flavour-candidate branch: the product IS a flavour
* carrier, only its governed form/concentration is still unproven — which is a
* calibration gap, not a capability gap (§4).
*/
const FLAVOUR_CARRIER_ROLES = new Set([
	"MAIN_ALLOWED",
	"MAIN_PROFILE_SPECIFIC",
	"MAIN_CAPABLE_UNCALIBRATED",
	"UNKNOWN_REQUIRES_EVIDENCE"
]);
const TECHNICAL_ROLE_REASON = {
	STRUCTURAL_ONLY: "structural_product",
	NOT_MAIN: "structural_product",
	TOPPING_ONLY: "topping_product",
	PROTEIN_CONTRIBUTOR_ONLY: "protein_contributor",
	STANDARD_ONLY: "standard_base_product"
};
function capability(state, reasonCode, snapshot, calibrationLevel = "NONE") {
	return {
		state,
		reasonCode,
		reasonPl: REASON_PL[reasonCode],
		familyId: snapshot?.familyId ?? null,
		subfamilyId: snapshot?.subfamilyId ?? null,
		formId: snapshot?.formId ?? null,
		calibrationLevel,
		policyId: calibrationLevel === "NONE" ? null : snapshot?.mainPolicyId ?? null,
		policyVersion: calibrationLevel === "NONE" ? null : snapshot?.mainPolicyVersion ?? null,
		userHeld: state === "MAIN_CAPABLE_UNCALIBRATED",
		selectable: state === "MAIN_CAPABLE" || state === "MAIN_CAPABLE_UNCALIBRATED"
	};
}
/** A complete, approved envelope for the resolved profile. */
function hasCalibratedMainEnvelope(snapshot) {
	return Boolean(snapshot && snapshot.mainPolicyId && snapshot.mainPolicyVersion && snapshot.ecoFloorPercent !== null && snapshot.optimalCeilingPercent !== null && snapshot.hardLimitPercent !== null && snapshot.mainEquivalentFactor !== null);
}
/**
* §8 calibration hierarchy: an envelope bound to this exact product identity
* outranks a family/form policy. Both remain calibrated authority; only their
* provenance differs.
*/
function calibrationLevelOf(snapshot) {
	if (snapshot.mainCalibrationLevel === "EXACT_PRODUCT" || snapshot.mainCalibrationLevel === "FAMILY") return snapshot.mainCalibrationLevel;
	return "FAMILY";
}
/**
* THE canonical Main-capability API (§26). Consumers must not re-derive Main
* eligibility from names, categories, ingredient ids or policy fields.
*/
function resolveMainCapability(input) {
	const snapshot = input.snapshot;
	if (!snapshot) return input.snapshotRequired ? capability("MAIN_UNKNOWN", "snapshot_missing", null) : capability("MAIN_CAPABLE_UNCALIBRATED", "user_held_no_calibration", null);
	if (snapshot.resolutionState !== "RESOLVED") return capability("MAIN_UNKNOWN", "revalidation_required", snapshot);
	if (snapshot.processScope !== "BASE_FORMULATION") return capability("MAIN_TECHNICAL_BLOCKED", "post_process_scope", snapshot);
	if (snapshot.moduleEligibility.BASE_RECIPE === "blocked") return capability("MAIN_TECHNICAL_BLOCKED", "base_recipe_not_approved", snapshot);
	const serverState = snapshot.mainCapability;
	if (serverState === "MAIN_TECHNICAL_BLOCKED") return capability("MAIN_TECHNICAL_BLOCKED", TECHNICAL_ROLE_REASON[snapshot.behaviorRole ?? ""] ?? TECHNICAL_ROLE_REASON[snapshot.mainClassification] ?? "structural_product", snapshot);
	if (serverState === "MAIN_UNKNOWN") return capability("MAIN_UNKNOWN", "unknown_product", snapshot);
	if (serverState === "MAIN_CAPABLE" || serverState === "MAIN_CAPABLE_UNCALIBRATED") return hasCalibratedMainEnvelope(snapshot) ? capability("MAIN_CAPABLE", "calibrated_main_policy", snapshot, calibrationLevelOf(snapshot)) : capability("MAIN_CAPABLE_UNCALIBRATED", "user_held_no_calibration", snapshot);
	const role = snapshot.behaviorRole ?? snapshot.mainClassification;
	const technicalReason = TECHNICAL_ROLE_REASON[role];
	if (technicalReason) return capability("MAIN_TECHNICAL_BLOCKED", technicalReason, snapshot);
	if (FLAVOUR_CARRIER_ROLES.has(role)) return hasCalibratedMainEnvelope(snapshot) ? capability("MAIN_CAPABLE", "calibrated_main_policy", snapshot, calibrationLevelOf(snapshot)) : capability("MAIN_CAPABLE_UNCALIBRATED", "user_held_no_calibration", snapshot);
	if (role === "MAIN_BLOCKED_POLICY") return capability("MAIN_CAPABLE_UNCALIBRATED", "user_held_no_calibration", snapshot);
	return capability("MAIN_UNKNOWN", "unknown_product", snapshot);
}
/**
* Line ids whose Main sensory envelope is user-held. §21: a group that mixes
* calibrated and uncalibrated Mains has no combined approved envelope, so the
* entire group avoids borrowing one member's science. The group may still move
* together through the unchanged Engine safety frontier.
*/
function userHeldMainLineIds(input) {
	const excluded = new Set(input.excludeLineIds ?? []);
	const mains = input.items.filter((item) => item.lock_type === "main" && !excluded.has(item.id));
	if (mains.length === 0) return [];
	return mains.some((item) => input.snapshots[item.id] !== void 0 && resolveMainCapability({
		snapshot: input.snapshots[item.id],
		snapshotRequired: true
	}).userHeld) ? mains.map((item) => item.id) : [];
}

//#endregion
//#region src/features/product-intelligence/productBehaviorResolver.ts
function productBehaviorSnapshotFingerprint(snapshots) {
	return JSON.stringify(Object.entries(snapshots).filter((entry) => entry[1] !== void 0).sort(([left], [right]) => left.localeCompare(right)).map(([lineId, value]) => [
		lineId,
		value.productVersionId,
		value.resolutionState,
		value.factsFingerprint,
		value.behaviorBindingId,
		value.behaviorBindingVersion,
		value.taxonomyVersion,
		value.mapperVerificationStatus ?? null,
		value.mainCapability ?? null,
		value.mainAuthority ?? null,
		value.mainCalibrationLevel ?? null,
		value.behaviorRole ?? null,
		value.mainPolicyId,
		value.mainPolicyVersion,
		value.mainBasis,
		value.ecoFloorPercent,
		value.optimalCeilingPercent,
		value.hardLimitPercent,
		value.multiMainHardLimitPercent ?? null,
		value.mainEquivalentFactor,
		value.requiresLiquidDairyCarrier,
		value.liquidDairyCarrierFloorPercent,
		value.approvedLiquidDairyCarrier,
		value.approvedMixedFamilyIds,
		value.moduleEligibility,
		value.processScope,
		value.resolutionContext,
		value.sharedFacts ?? null,
		value.historicalIdentity ?? null
	]));
}

//#endregion
//#region src/features/product-intelligence/productBehaviorAccess.ts
const hasStableProductBehaviorIdentity = (ingredient) => [ingredient.id, ingredient.canonical_ingredient_id].some((identity) => hasCanonicalIngredientIdentity(identity) || typeof identity === "string" && /^PI-ING-\d{6}$/.test(identity));
const LEGACY_READ_ONLY_MODULES = new Set([
	"MONITOR",
	"SUMMARY",
	"NUTRITION",
	"ALLERGENS",
	"PROCESS",
	"LABEL",
	"MASTER_LABEL",
	"EXPORT",
	"COST"
]);
/**
* Trustless recipe boundary for resolved products. Callers pass every line ID
* whose product lineage requires a Unified Product Intelligence snapshot; a
* missing snapshot and a denied module permission fail through the same gate.
*/
function productBehaviorModuleGate(snapshots, module, requiredLineIds) {
	const required = new Set(requiredLineIds);
	const missingLineIds = requiredLineIds.filter((lineId) => snapshots[lineId] === void 0);
	const blockedLineIds = [...new Set([...missingLineIds, ...Object.entries(snapshots).filter((entry) => entry[1] !== void 0).filter(([lineId]) => required.has(lineId)).filter(([, snapshot]) => {
		if (snapshot.resolutionState === "REVALIDATION_REQUIRED") return true;
		if (snapshot.resolutionState === "LEGACY_RECONSTRUCTED" && !LEGACY_READ_ONLY_MODULES.has(module)) return true;
		const state = snapshot.moduleEligibility[module];
		return state !== "eligible" && state !== "label_only";
	}).map(([lineId]) => lineId)])].sort();
	return blockedLineIds.length === 0 ? {
		ready: true,
		blockedLineIds: [],
		reason: null
	} : {
		ready: false,
		blockedLineIds,
		reason: `Brak zatwierdzonego uprawnienia ${module} dla: ${blockedLineIds.join(", ")}.`
	};
}
/** A line created by Mapper/private/catalog intake, any native template that
* already carries a stable PI identity, or by the closed exact built-in-to-
* Mapper bridge must carry the immutable resolver snapshot. Native templates
* are a representation provenance, not an exemption from ProductBehavior.
* Only synthetic fixtures with no canonical product lineage stay outside the
* persistence gate. */
function productBehaviorRequiredLineIds(input) {
	const base = input.items.filter(({ planned_grams, actual_grams, ingredient }) => (typeof planned_grams !== "number" || (actual_grams ?? planned_grams) > 0) && (hasStableProductBehaviorIdentity(ingredient) || ingredient.identity_provenance === "mapper" || ingredient.identity_provenance === "private_product" || ingredient.identity_provenance === "reference")).map(({ id }) => id);
	const toppings = (input.toppings ?? []).filter(({ planned_grams, actual_grams, ingredient }) => (typeof planned_grams !== "number" || (actual_grams ?? planned_grams) > 0) && (ingredient.kind === "catalog_label_topping" || typeof ingredient.catalog_product_id === "string" || hasStableProductBehaviorIdentity(ingredient) || ingredient.identity_provenance === "mapper" || ingredient.identity_provenance === "private_product" || ingredient.identity_provenance === "reference")).map(({ id }) => id);
	return [...new Set([...base, ...toppings])].sort();
}
/**
* Owner-facing reason a line may not be Main, or null when it may.
*
* GLOBAL MAIN AUTHORITY (owner v1.4 §26): this is a thin projection of the one
* canonical `resolveMainCapability` answer. It no longer decides eligibility
* itself, and a missing calibrated envelope no longer blocks the owner's Main
* intent — such a product resolves to user-held Main instead (§4, §5).
*/
function mainBehaviorBlockReason(snapshot, snapshotRequired = false) {
	if (!snapshot && !snapshotRequired) return null;
	const capability = resolveMainCapability({
		snapshot,
		snapshotRequired
	});
	return capability.selectable ? null : capability.reasonPl;
}

//#endregion
//#region src/features/product-intelligence/mainEnvelope.ts
const EPSILON = 1e-7;
const mainRatioWeight = (item) => typeof item.main_ratio_weight === "number" && Number.isFinite(item.main_ratio_weight) && item.main_ratio_weight > 0 ? item.main_ratio_weight : 1;
const validEnvelopeNumber = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
/**
* Resolve Multi-Main authority without manufacturing a product-pair policy.
*
* A published shared combination cap remains authoritative when every member
* carries that exact group/version/cap. Otherwise the feasible group range is
* the conservative algebraic intersection of the already-published individual
* hard envelopes:
*
*   derivedCombinedHardLimit = min(individualHardLimit_i)
*
* Since every positive member's equivalent contribution is at most the group
* total, this guarantees that no member can exceed its own hard limit at any
* ratio. The stored ratio and factors then convert that shared equivalent cap
* into raw grams for search. This is O(N), creates no new scientific constant
* and still fails closed when bases or family compatibility cannot be proven.
*/
function resolveMultiMainEnvelope(resolved) {
	if (resolved.length < 2) return null;
	const first = resolved[0].snapshot;
	if (first.mainBasis === null || resolved.some(({ snapshot }) => snapshot.mainBasis !== first.mainBasis || !validEnvelopeNumber(snapshot.ecoFloorPercent) || !validEnvelopeNumber(snapshot.optimalCeilingPercent) || !validEnvelopeNumber(snapshot.hardLimitPercent) || !validEnvelopeNumber(snapshot.mainEquivalentFactor) || snapshot.mainEquivalentFactor <= 0 || snapshot.optimalCeilingPercent > snapshot.hardLimitPercent + EPSILON)) return null;
	const families = [...new Set(resolved.map(({ snapshot }) => snapshot.familyId).filter(Boolean))];
	const hasCompleteFamilyAuthority = resolved.every(({ snapshot }) => snapshot.familyId !== null);
	const mixedFamiliesApproved = families.length <= 1 || families.every((family) => resolved.every(({ snapshot }) => snapshot.familyId === family || snapshot.approvedMixedFamilyIds.includes(family)));
	const sharedPublishedPolicy = first.mainPolicyId !== null && first.mainPolicyVersion !== null && validEnvelopeNumber(first.multiMainHardLimitPercent) && resolved.every(({ snapshot }) => snapshot.mainPolicyId === first.mainPolicyId && snapshot.mainPolicyVersion === first.mainPolicyVersion && snapshot.mainBasis === first.mainBasis && snapshot.multiMainHardLimitPercent === first.multiMainHardLimitPercent);
	if (!mixedFamiliesApproved || !sharedPublishedPolicy && !hasCompleteFamilyAuthority) return null;
	const weighted = resolved.map(({ item, snapshot }) => ({
		ratioWeight: mainRatioWeight(item),
		weightedEquivalentFactor: mainRatioWeight(item) * snapshot.mainEquivalentFactor,
		snapshot
	}));
	const totalRatioWeight = weighted.reduce((sum, value) => sum + value.ratioWeight, 0);
	const totalWeightedEquivalentFactor = weighted.reduce((sum, value) => sum + value.weightedEquivalentFactor, 0);
	if (!(totalRatioWeight > 0) || !(totalWeightedEquivalentFactor > 0)) return null;
	const floorPercent = Math.max(...resolved.map(({ snapshot }) => snapshot.ecoFloorPercent));
	if (sharedPublishedPolicy) return {
		floorPercent,
		optimalCeilingPercent: first.multiMainHardLimitPercent,
		hardLimitPercent: first.multiMainHardLimitPercent,
		policyId: first.mainPolicyId,
		totalRatioWeight,
		totalWeightedEquivalentFactor
	};
	const derivedCombinedHardLimit = Math.min(...resolved.map(({ snapshot }) => snapshot.hardLimitPercent));
	return {
		floorPercent,
		optimalCeilingPercent: derivedCombinedHardLimit,
		hardLimitPercent: derivedCombinedHardLimit,
		policyId: null,
		totalRatioWeight,
		totalWeightedEquivalentFactor
	};
}
const baseSnapshots = (snapshots) => Object.values(snapshots).filter((snapshot) => snapshot !== void 0 && snapshot.processScope === "BASE_FORMULATION");
/** Technical product constraint shared by the LP, candidate generator and
* final Preview/Apply gates. It deliberately ignores sensory Main policy
* readiness: only the approved liquid-dairy carrier minimum is checked. */
function verifyMainTechnicalCarrier(input) {
	const managedMains = input.recipe.items.filter((item) => item.lock_type === "main" && input.snapshots[item.id] !== void 0);
	const dairyPolicies = managedMains.map((item) => input.snapshots[item.id]).filter((snapshot) => snapshot.requiresLiquidDairyCarrier && snapshot.liquidDairyCarrierFloorPercent !== null);
	const dairyFloor = dairyPolicies.length > 0 ? Math.max(...dairyPolicies.map((snapshot) => snapshot.liquidDairyCarrierFloorPercent)) : null;
	if (dairyFloor === null) return [];
	const carrierIds = new Set(baseSnapshots(input.snapshots).filter((snapshot) => snapshot.approvedLiquidDairyCarrier).map((snapshot) => snapshot.lineId));
	const carrierGrams = input.recipe.items.reduce((sum, item) => sum + (carrierIds.has(item.id) ? item.planned_grams : 0), 0);
	const carrierPercent = input.recipe.target_batch_grams > 0 ? carrierGrams / input.recipe.target_batch_grams * 100 : 0;
	return carrierPercent < dairyFloor - EPSILON ? [{
		code: "liquid_dairy_carrier_below_floor",
		lineIds: managedMains.map((item) => item.id),
		messagePl: `Zatwierdzony płynny nośnik mleczny ma ${carrierPercent.toFixed(1)}%; wymagane minimum to ${dairyFloor.toFixed(1)}%.`
	}] : [];
}
/** Product-layer Main contract. It consumes immutable resolver snapshots only;
* it never derives families/forms/policies from ingredient names and never
* changes Engine science. Product-lineage and accepted built-in Main rows fail
* closed if authority is absent; only synthetic non-canonical fixtures remain
* outside this boundary. */
function verifyMainEnvelope(input) {
	const technicalOnlyMainLineIds = new Set(input.technicalOnlyMainLineIds ?? []);
	const userHeld = new Set(userHeldMainLineIds({
		items: input.recipe.items,
		snapshots: input.snapshots,
		excludeLineIds: [...technicalOnlyMainLineIds]
	}));
	const mains = input.recipe.items.filter((item) => item.lock_type === "main" && !technicalOnlyMainLineIds.has(item.id) && !userHeld.has(item.id));
	if (mains.length === 0) return {
		ok: true,
		equivalentPercent: null,
		targetPercent: null,
		hardLimitPercent: null,
		policyId: null
	};
	const managed = mains.filter((item) => input.snapshots[item.id] !== void 0);
	const requiredLineIds = new Set(productBehaviorRequiredLineIds({ items: input.recipe.items }));
	const missingRequired = mains.filter((item) => input.snapshots[item.id] === void 0 && requiredLineIds.has(item.id));
	if (missingRequired.length > 0) return {
		ok: false,
		violations: [{
			code: "main_behavior_missing",
			lineIds: missingRequired.map((item) => item.id),
			messagePl: "Składnik Główny wymaga ponownej walidacji technicznej produktu."
		}]
	};
	if (managed.length === 0) return {
		ok: true,
		equivalentPercent: null,
		targetPercent: null,
		hardLimitPercent: null,
		policyId: null
	};
	const violations = [];
	if (managed.length !== mains.length) violations.push({
		code: "main_behavior_missing",
		lineIds: mains.filter((item) => input.snapshots[item.id] === void 0).map((item) => item.id),
		messagePl: "Nie wszystkie składniki Główne mają aktualny snapshot techniczny produktu."
	});
	const resolved = managed.map((item) => ({
		item,
		snapshot: input.snapshots[item.id]
	}));
	for (const { item, snapshot } of resolved) {
		const reason = mainBehaviorBlockReason(snapshot);
		if (reason) violations.push({
			code: "main_behavior_blocked",
			lineIds: [item.id],
			messagePl: reason
		});
	}
	if (violations.length > 0) return {
		ok: false,
		violations
	};
	const first = resolved[0].snapshot;
	const multi = resolved.length > 1;
	const multiEnvelope = multi ? resolveMultiMainEnvelope(resolved) : null;
	if (multi && multiEnvelope === null) return {
		ok: false,
		violations: [{
			code: "multi_main_policy_unknown",
			lineIds: managed.map((item) => item.id),
			messagePl: "Nie można bezpiecznie wyznaczyć wspólnego zakresu Main z dostępnych podstaw i rodzin produktów."
		}]
	};
	const equivalentGrams = resolved.reduce((sum, { item, snapshot }) => sum + item.planned_grams * (snapshot.mainEquivalentFactor ?? 0), 0);
	const equivalentPercent = input.recipe.target_batch_grams > 0 ? equivalentGrams / input.recipe.target_batch_grams * 100 : 0;
	const floor = multi ? multiEnvelope.floorPercent : first.ecoFloorPercent;
	const ceiling = multi ? multiEnvelope.optimalCeilingPercent : first.optimalCeilingPercent;
	const hard = multi ? multiEnvelope.hardLimitPercent : first.hardLimitPercent;
	if (input.enforceFloor !== false && equivalentPercent < floor - EPSILON) violations.push({
		code: "main_below_floor",
		lineIds: managed.map((item) => item.id),
		messagePl: `Grupa Main ma ${equivalentPercent.toFixed(1)}%; wymagane minimum to ${floor.toFixed(1)}%.`
	});
	if (input.mode === "optimal" && equivalentPercent > ceiling + EPSILON) violations.push({
		code: "main_above_optimal_ceiling",
		lineIds: managed.map((item) => item.id),
		messagePl: `Grupa Main przekracza zatwierdzony poziom OPTIMAL ${ceiling.toFixed(1)}%.`
	});
	if (equivalentPercent > hard + EPSILON) violations.push({
		code: "main_above_hard_limit",
		lineIds: managed.map((item) => item.id),
		messagePl: `Grupa Main przekracza twardy limit ${hard.toFixed(1)}%.`
	});
	violations.push(...verifyMainTechnicalCarrier({
		recipe: input.recipe,
		snapshots: input.snapshots
	}));
	return violations.length > 0 ? {
		ok: false,
		violations
	} : {
		ok: true,
		equivalentPercent,
		targetPercent: input.mode === "optimal" ? ceiling : floor,
		hardLimitPercent: hard,
		policyId: multi ? multiEnvelope.policyId : first.mainPolicyId
	};
}

//#endregion
//#region src/features/recipe-composition/labelTopping.ts
function isCatalogLabelToppingIngredient(ingredient) {
	return "kind" in ingredient && ingredient.kind === "catalog_label_topping";
}
function cloneToppingIngredient(ingredient) {
	if (isCatalogLabelToppingIngredient(ingredient)) return {
		...ingredient,
		label_nutrition_per_100g: { ...ingredient.label_nutrition_per_100g }
	};
	return {
		...ingredient,
		composition: { ...ingredient.composition },
		flags: ingredient.flags ? { ...ingredient.flags } : void 0
	};
}

//#endregion
//#region src/features/recipe-composition/recipeCompositionPersistence.ts
function recipeCompositionFromState(state) {
	const itemIds = new Set(state.items.map((item) => item.id));
	const baseOrder = [...(state.baseOrder ?? []).filter((id) => itemIds.has(id)), ...state.items.map((item) => item.id).filter((id) => !(state.baseOrder ?? []).includes(id))];
	const behaviorSnapshots = Object.fromEntries(Object.entries(state.productBehaviorSnapshots ?? {}).filter((entry) => entry[1] !== void 0).map(([lineId, snapshot]) => [lineId, structuredClone(snapshot)]));
	return {
		schemaVersion: 1,
		baseScope: "BASE_FORMULATION",
		baseOrder,
		toppings: (state.toppings ?? []).map((item, index) => ({
			...item,
			ingredient: cloneToppingIngredient(item.ingredient),
			addon_sort_order: index
		})),
		...Object.keys(behaviorSnapshots).length > 0 ? { behaviorSnapshots } : {},
		...state.ownerReviewGate ? { ownerReviewGate: {
			...state.ownerReviewGate,
			omittedToppingLineIds: [...state.ownerReviewGate.omittedToppingLineIds],
			technicalOnlyMainLineIds: [...state.ownerReviewGate.technicalOnlyMainLineIds]
		} } : {},
		migrationAmbiguities: (state.compositionMigrationAmbiguities ?? []).map((item) => ({ ...item }))
	};
}

//#endregion
//#region src/features/product-intelligence/ownerInulinPolicy.ts
const OWNER_INULIN_POLICY = Object.freeze({
	policyId: "gellatti-generic-inulin",
	version: 1,
	provenance: "owner-approved Gellatti formulation policy",
	mapperIngredientId: "PI-ING-000456",
	minPercent: 2,
	preferredPercent: 4,
	maxPercent: 8,
	presenceSemantics: "optional_zero_or_range"
});
function ownerInulinGramBand(baseGrams) {
	return {
		minGrams: baseGrams * OWNER_INULIN_POLICY.minPercent / 100,
		preferredGrams: baseGrams * OWNER_INULIN_POLICY.preferredPercent / 100,
		maxGrams: baseGrams * OWNER_INULIN_POLICY.maxPercent / 100
	};
}
/** Exact canonical Inulin lines governed by the published Gellatti policy.
* This deliberately does not borrow the policy for another fibre/inulin SKU. */
const ownerInulinPolicyLineIds = (input) => input.items.filter((item) => canonicalIngredientId(item.ingredient) === OWNER_INULIN_POLICY.mapperIngredientId).map((item) => item.id);
/**
* Published internal authority: canonical Inulin is optional when absent/0 g;
* once present, its aggregate dose must be inside 2–8% of the target mix.
* This is Gellatti formulation science, not a manufacturer dosage field.
*/
function ownerInulinPolicyIssues(input) {
	const lineIds = ownerInulinPolicyLineIds(input);
	if (lineIds.length === 0) return [];
	const governed = new Set(lineIds);
	const grams = input.items.filter((item) => governed.has(item.id)).reduce((sum, item) => sum + item.planned_grams, 0);
	if (!(grams > 0)) return [];
	const band = ownerInulinGramBand(input.target_batch_grams);
	const base = {
		lineIds,
		grams,
		minGrams: band.minGrams,
		maxGrams: band.maxGrams,
		provenance: OWNER_INULIN_POLICY.provenance
	};
	if (grams < band.minGrams - 1e-9) return [{
		...base,
		code: "inulin_below_owner_minimum"
	}];
	if (grams > band.maxGrams + 1e-9) return [{
		...base,
		code: "inulin_above_owner_maximum"
	}];
	return [];
}

//#endregion
//#region src/features/formulation/mainIngredientContract.ts
const MAIN_RATIO_TOLERANCE = 1e-7;
const POSITIVE_GRAMS_EPSILON = 1e-9;
/** Positive, user-entered Main lines in stable draft order. */
function captureMainIngredientIntent(input) {
	return input.items.filter((item) => item.lock_type === "main" && item.planned_grams > POSITIVE_GRAMS_EPSILON).map((item) => ({
		lineId: item.id,
		canonicalIngredientId: canonicalIngredientId(item.ingredient),
		ingredientName: item.ingredient.name,
		grams: item.planned_grams,
		ratioWeight: typeof item.main_ratio_weight === "number" && Number.isFinite(item.main_ratio_weight) && item.main_ratio_weight > 0 ? item.main_ratio_weight : 1,
		ratioExplicit: typeof item.main_ratio_weight === "number" && Number.isFinite(item.main_ratio_weight) && item.main_ratio_weight > 0
	}));
}
/**
* Trustless before/after verification used by Preview and the final Apply door.
* Stable line id + canonical id are both required; row order and display names
* are deliberately irrelevant.
*/
function verifyMainIngredientIdentity(before, after, byLineId = {}) {
	const mains = captureMainIngredientIntent(before);
	if (mains.length === 0) return {
		ok: true,
		mains,
		scaleFactor: null
	};
	const afterByLineId = new Map(after.items.map((item) => [item.id, item]));
	const violations = [];
	const survivingGrams = [];
	for (const main of mains) {
		const next = afterByLineId.get(main.lineId);
		if (!next) {
			violations.push({
				code: "main_line_missing",
				lineIds: [main.lineId],
				ingredientNames: [main.ingredientName]
			});
			continue;
		}
		if (canonicalIngredientId(next.ingredient) !== main.canonicalIngredientId) violations.push({
			code: "main_canonical_identity_changed",
			lineIds: [main.lineId],
			ingredientNames: [main.ingredientName]
		});
		if (next.lock_type !== "main") violations.push({
			code: "main_role_removed",
			lineIds: [main.lineId],
			ingredientNames: [main.ingredientName]
		});
		if (!(next.planned_grams > POSITIVE_GRAMS_EPSILON)) violations.push({
			code: "main_ingredient_zeroed",
			lineIds: [main.lineId],
			ingredientNames: [main.ingredientName]
		});
		const nextRatioWeight = typeof next.main_ratio_weight === "number" && Number.isFinite(next.main_ratio_weight) && next.main_ratio_weight > 0 ? next.main_ratio_weight : 1;
		if ((typeof next.main_ratio_weight === "number" && Number.isFinite(next.main_ratio_weight) && next.main_ratio_weight > 0) !== main.ratioExplicit || Math.abs(nextRatioWeight - main.ratioWeight) > 1e-7) violations.push({
			code: "main_ratio_metadata_changed",
			lineIds: [main.lineId],
			ingredientNames: [main.ingredientName]
		});
		survivingGrams.push(next.planned_grams);
	}
	if (violations.length === 0 && mains.length > 1) {
		const actualTotal = survivingGrams.reduce((sum, grams) => sum + grams, 0);
		if (!(actualTotal > POSITIVE_GRAMS_EPSILON)) violations.push({
			code: "main_ratio_changed",
			lineIds: mains.map((main) => main.lineId),
			ingredientNames: mains.map((main) => main.ingredientName)
		});
		else {
			const expected = resolveMainRatioScale(before, byLineId, actualTotal);
			const expectedByLineId = expected.ok ? new Map(expected.allocations.map((allocation) => [allocation.lineId, allocation.grams])) : /* @__PURE__ */ new Map();
			if (!expected.ok || mains.some((main, index) => Math.abs((expectedByLineId.get(main.lineId) ?? NaN) - survivingGrams[index]) > 1e-7)) violations.push({
				code: "main_ratio_changed",
				lineIds: mains.map((main) => main.lineId),
				ingredientNames: mains.map((main) => main.ingredientName)
			});
		}
	}
	if (violations.length > 0) return {
		ok: false,
		mains,
		violations
	};
	return {
		ok: true,
		mains,
		scaleFactor: survivingGrams[0] / mains[0].grams
	};
}
/**
* Resolve a deterministic Main-group allocation. New user-created Crown sets
* persist their entered gram relationship as ratio metadata; legacy drafts
* without that metadata retain the accepted equal-share fallback. Exact locks
* win per line without locking the rest of the group; unlocked lines share the
* remaining mass by their confirmed weights. Stable largest-remainder rounding
* keeps every executable Main amount whole-gram and the split within 1 g.
*/
function resolveMainRatioScale(input, byLineId, desiredMainTotal) {
	const mains = captureMainIngredientIntent(input);
	if (mains.length === 0) return {
		ok: true,
		scaleFactor: 1,
		mains,
		allocations: [],
		allocatedMainTotal: 0,
		heldEntirelyByExactConstraints: false
	};
	const exact = /* @__PURE__ */ new Map();
	const bounds = /* @__PURE__ */ new Map();
	const conflict = () => ({
		ok: false,
		code: "main_ratio_conflict",
		lineIds: mains.map((main) => main.lineId),
		ingredientNames: mains.map((main) => main.ingredientName),
		messagePl: `Blokady lub zakresy składników Głównych (${mains.map((main) => main.ingredientName).join(", ")}) są sprzeczne z ich zapisaną proporcją. Gellatti nie zmieniło receptury.`
	});
	for (const main of mains) {
		const constraint = byLineId[main.lineId];
		if (constraint?.mode === "locked") {
			const grams = constraint.grams;
			if (grams === void 0 || !Number.isFinite(grams) || grams < 0) return conflict();
			exact.set(main.lineId, grams);
		} else if (constraint?.mode === "percent") {
			const percent = constraint.percent;
			if (percent === void 0 || !Number.isFinite(percent) || percent < 0 || percent > 100) return conflict();
			exact.set(main.lineId, input.target_batch_grams * percent / 100);
		} else if (constraint?.mode === "range") {
			if (constraint.minGrams === void 0 || constraint.maxGrams === void 0 || !Number.isFinite(constraint.minGrams) || !Number.isFinite(constraint.maxGrams)) return conflict();
			if (constraint.minGrams < 0 || constraint.maxGrams < constraint.minGrams) return conflict();
			bounds.set(main.lineId, {
				min: constraint.minGrams,
				max: constraint.maxGrams
			});
		} else bounds.set(main.lineId, {
			min: 1,
			max: Number.POSITIVE_INFINITY
		});
	}
	const originalTotal = mains.reduce((sum, main) => sum + main.grams, 0);
	const exactTotal = [...exact.values()].reduce((sum, grams) => sum + grams, 0);
	const variable = mains.filter((main) => !exact.has(main.lineId));
	if (variable.length === 0) {
		if (!(exactTotal > POSITIVE_GRAMS_EPSILON)) return conflict();
		return {
			ok: true,
			scaleFactor: originalTotal > 0 ? exactTotal / originalTotal : 1,
			mains,
			allocations: mains.map((main) => ({
				lineId: main.lineId,
				grams: exact.get(main.lineId)
			})),
			allocatedMainTotal: exactTotal,
			heldEntirelyByExactConstraints: true
		};
	}
	const variableTarget = Math.max(desiredMainTotal, exactTotal) - exactTotal;
	const minimumTotal = variable.reduce((sum, main) => sum + bounds.get(main.lineId).min, 0);
	const maximumTotal = variable.reduce((sum, main) => sum + bounds.get(main.lineId).max, 0);
	if (variableTarget < minimumTotal - 1e-7) return conflict();
	let boundedTarget = Math.min(variableTarget, maximumTotal);
	const continuous = /* @__PURE__ */ new Map();
	const allExactWhole = [...exact.values()].every((grams) => Math.abs(grams - Math.round(grams)) <= MAIN_RATIO_TOLERANCE);
	const requestedWhole = Math.abs(boundedTarget - Math.round(boundedTarget)) <= MAIN_RATIO_TOLERANCE;
	let wholeRatioAllocation = null;
	if (allExactWhole && requestedWhole) {
		const weightTotal = variable.reduce((sum, main) => sum + main.ratioWeight, 0);
		const allocate = (target) => {
			const floors = variable.map((main, index) => {
				const exactShare = target * main.ratioWeight / weightTotal;
				return {
					main,
					index,
					grams: Math.floor(exactShare),
					fraction: exactShare - Math.floor(exactShare)
				};
			});
			let remainder = target - floors.reduce((sum, row) => sum + row.grams, 0);
			floors.sort((left, right) => right.fraction - left.fraction || left.index - right.index);
			for (const row of floors) {
				if (remainder <= 0) break;
				row.grams += 1;
				remainder -= 1;
			}
			return new Map(floors.map((row) => [row.main.lineId, row.grams]));
		};
		const lowerTarget = Math.ceil(minimumTotal - MAIN_RATIO_TOLERANCE);
		for (let target = Math.floor(boundedTarget + MAIN_RATIO_TOLERANCE); target >= lowerTarget; target -= 1) {
			const allocation = allocate(target);
			if (variable.every((main) => {
				const grams = allocation.get(main.lineId);
				const bound = bounds.get(main.lineId);
				return grams >= bound.min - 1e-7 && grams <= bound.max + 1e-7;
			})) {
				boundedTarget = target;
				wholeRatioAllocation = allocation;
				for (const [lineId, grams] of allocation) continuous.set(lineId, grams);
				break;
			}
		}
		if (wholeRatioAllocation === null) return conflict();
	}
	const active = new Set(wholeRatioAllocation === null ? variable.map((main) => main.lineId) : []);
	let remaining = boundedTarget;
	while (active.size > 0) {
		const activeLines = variable.filter((main) => active.has(main.lineId));
		const weightTotal = activeLines.reduce((sum, main) => sum + main.ratioWeight, 0);
		let clamped = false;
		for (const main of activeLines) {
			const bound = bounds.get(main.lineId);
			const proposed = remaining * main.ratioWeight / weightTotal;
			if (proposed < bound.min - 1e-7) {
				continuous.set(main.lineId, bound.min);
				remaining -= bound.min;
				active.delete(main.lineId);
				clamped = true;
			} else if (proposed > bound.max + 1e-7) {
				continuous.set(main.lineId, bound.max);
				remaining -= bound.max;
				active.delete(main.lineId);
				clamped = true;
			}
		}
		if (!clamped) {
			for (const main of activeLines) continuous.set(main.lineId, remaining * main.ratioWeight / weightTotal);
			break;
		}
		if (remaining < -1e-7) return conflict();
	}
	const wholeTarget = Math.abs(boundedTarget - Math.round(boundedTarget)) <= MAIN_RATIO_TOLERANCE;
	if (wholeRatioAllocation === null && allExactWhole && wholeTarget) {
		const floors = variable.map((main) => ({
			main,
			grams: Math.floor(continuous.get(main.lineId) ?? 0),
			fraction: (continuous.get(main.lineId) ?? 0) % 1
		}));
		let remainder = Math.round(boundedTarget) - floors.reduce((sum, row) => sum + row.grams, 0);
		floors.sort((left, right) => right.fraction - left.fraction || mains.findIndex((main) => main.lineId === left.main.lineId) - mains.findIndex((main) => main.lineId === right.main.lineId));
		for (const row of floors) {
			if (remainder <= 0) break;
			const max = bounds.get(row.main.lineId).max;
			if (row.grams + 1 <= max + 1e-7) {
				row.grams += 1;
				remainder -= 1;
			}
		}
		if (remainder !== 0) return conflict();
		for (const row of floors) continuous.set(row.main.lineId, row.grams);
	}
	const allocations = mains.map((main) => ({
		lineId: main.lineId,
		grams: exact.get(main.lineId) ?? continuous.get(main.lineId) ?? 0
	}));
	const allocatedMainTotal = allocations.reduce((sum, allocation) => sum + allocation.grams, 0);
	if (!(allocatedMainTotal > POSITIVE_GRAMS_EPSILON) || !Number.isFinite(allocatedMainTotal)) return conflict();
	return {
		ok: true,
		scaleFactor: originalTotal > 0 ? allocatedMainTotal / originalTotal : 1,
		mains,
		allocations,
		allocatedMainTotal,
		heldEntirelyByExactConstraints: false
	};
}

//#endregion
//#region src/features/recipe-score/recipeMatchScore.ts
/** The exact §15.1 label table (3–4 share one row, 1–2 share one row). */
const MATCH_SCORE_LABELS = Object.freeze({
	10: "Wyjątkowo dobrze dopasowana",
	9: "Świetnie dopasowana",
	8: "Bardzo dobrze dopasowana",
	7: "Dobrze dopasowana",
	6: "Blisko optimum",
	5: "Wymaga korekty",
	4: "Wyraźnie niezbalansowana",
	3: "Wyraźnie niezbalansowana",
	2: "Wymaga przebudowy",
	1: "Wymaga przebudowy"
});
/** The exact §15.1 „Brak danych" label. */
const MATCH_SCORE_NO_DATA_LABEL = "Brak wystarczających danych do oceny";
/** Tooltip contract (§15.2): 10/10 is honest fit-to-goal, NOT a laboratory guarantee. */
const MATCH_SCORE_TOOLTIPS = Object.freeze({
	"recipe-score.match.tooltip": "Dopasowanie receptury ocenia, jak dobrze wynik odpowiada produktowi, trybowi i założeniom. 10/10 oznacza bardzo dobre dopasowanie do celu — nie jest gwarancją laboratoryjną.",
	"recipe-score.match.tooltip.no-data": "Za mało danych, aby ocenić dopasowanie receptury. Uzupełnij składniki i gramatury, aby otrzymać ocenę."
});

//#endregion
//#region src/features/recipe-score/technicalFit.ts
/**
* „Dopasowanie techniczne" — the PUBLIC headline recipe-fit integer
* (ACCEPTANCE ADDENDUM 2, owner decision 2026-07-24; supersedes the §15.1
* no-sub-dimensions rule for the headline).
*
* PUBLIC CONTRACT (adapter layer ONLY — the engine is untouched, science
* freeze respected):
*  - the headline integer is TECHNICAL recipe-fit, derived from the engine's
*    band/technical dimension — NEVER from the mode-weighted `overall` blend
*    (which mixes flavor/cost sub-scores and made T17 — all native bands in
*    range, 0 violations — present as 9/10);
*  - when ALL native approved technological bands are in range (0 violations,
*    no provisional/fallback banding) the technical fit shows EXACTLY 10/10;
*  - with violations the score degrades HONESTLY from the engine's own
*    `scores.technical` dimension (clamped, integer-only, capped at 9 so a
*    10/10 can only ever mean „all native bands in range");
*  - provisional/fallback profiles (category_fallback / temperature_fallback /
*    estimated bands) keep „Ocena częściowa / prowizoryczna" and can NEVER
*    show a validated native 10/10 (structural cap at 9 + provisional flag);
*  - cost and subjective flavor are SEPARATE labeled dimensions
*    (`commercialDimensions`) — never mixed into the technical integer, still
*    integer-only (no fake precision), honest „Brak danych" for unknown cost.
*
* The former `recipeMatchScore` (overall-based) remains available for QA
* recorders/diagnostics; public headline surfaces (OverallScoreCard, Monitor
* readouts) consume THIS adapter.
*/
/** Binding public name of the headline technical dimension. */
const TECHNICAL_FIT_DISPLAY_NAME = "Dopasowanie techniczne";
/** The exact provisional-profile qualifier (kept from the frozen contract). */
const TECHNICAL_FIT_PROVISIONAL_LABEL = "Ocena częściowa / prowizoryczna";
const TECHNICAL_FIT_TOOLTIPS = Object.freeze({
	"recipe-score.technical.tooltip": "Dopasowanie techniczne ocenia wyłącznie zgodność receptury z zatwierdzonymi zakresami technologicznymi. 10/10 oznacza, że wszystkie natywne zatwierdzone zakresy są w normie. Koszt i profil smakowy są osobnymi wymiarami i nigdy nie wpływają na tę ocenę. Nie jest to gwarancja laboratoryjna.",
	"recipe-score.technical.tooltip.no-data": "Za mało danych, aby ocenić dopasowanie techniczne. Uzupełnij składniki i gramatury, aby otrzymać ocenę."
});
const clampToScale = (value) => Math.min(10, Math.max(1, value));
/**
* Derive the public „Dopasowanie techniczne" from an engine result. PURE:
* reads the engine's own violations/provenance/`scores.technical`; never
* re-derives any band value, never mutates its input.
*/
function recipeTechnicalFit(result) {
	const technical = result?.scores?.technical;
	if (result == null || result.scores == null || technical === void 0 || technical === null || !Number.isFinite(technical)) return {
		score: null,
		label: MATCH_SCORE_NO_DATA_LABEL,
		display: "—",
		ariaText: `${TECHNICAL_FIT_DISPLAY_NAME}: ${MATCH_SCORE_NO_DATA_LABEL}`,
		tooltipKey: "recipe-score.technical.tooltip.no-data",
		validatedNative: false,
		provisional: false,
		violationCount: 0
	};
	const violations = detectViolations(result);
	const provisional = result.indicators.some((indicator) => indicator.category_fallback === true || indicator.temperature_fallback === true || indicator.band_status === "estimated");
	const validatedNative = violations.length === 0 && !provisional;
	const score = validatedNative ? 10 : Math.min(9, clampToScale(Math.round(technical / 10)));
	const label = MATCH_SCORE_LABELS[score];
	const provisionalSuffix = provisional ? ` — ${TECHNICAL_FIT_PROVISIONAL_LABEL}` : "";
	return {
		score,
		label,
		display: `${score}/10`,
		ariaText: `${TECHNICAL_FIT_DISPLAY_NAME}: ${score} na 10 — ${label}${provisionalSuffix}`,
		tooltipKey: "recipe-score.technical.tooltip",
		validatedNative,
		provisional,
		violationCount: violations.length
	};
}

//#endregion
//#region src/features/product-intelligence/recipeBehaviorAuthority.ts
function buildRecipeBehaviorAuthority(input) {
	const requiredLineIds = productBehaviorRequiredLineIds({
		items: input.items,
		toppings: input.toppings
	});
	return {
		requiredLineIds,
		snapshots: input.snapshots,
		missingLineIds: requiredLineIds.filter((lineId) => input.snapshots[lineId] === void 0),
		revalidationRequiredLineIds: requiredLineIds.filter((lineId) => input.snapshots[lineId]?.resolutionState === "REVALIDATION_REQUIRED"),
		fingerprint: productBehaviorSnapshotFingerprint(input.snapshots)
	};
}
const FACT_REQUIREMENTS = {
	MONITOR: ["technical"],
	SUMMARY: ["technical", "nutrition"],
	NUTRITION: ["nutrition"],
	ALLERGENS: ["allergens"],
	LABEL: ["nutrition", "allergens"],
	MASTER_LABEL: ["nutrition", "allergens"],
	EXPORT: ["nutrition", "allergens"]
};
const REQUIRED_TECHNICAL_FACTS = [
	"water",
	"totalSolids",
	"fat",
	"protein",
	"carbohydrate",
	"sugars",
	"salt"
];
const REQUIRED_NUTRITION_FACTS = [
	"energyKcal",
	"fat",
	"carbohydrate",
	"protein",
	"salt"
];
const hasFiniteRequiredFacts = (facts, keys) => keys.every((key) => {
	const value = facts[key];
	return typeof value === "number" && Number.isFinite(value);
});
function missingFacts(facts, requirement) {
	if (!facts) return true;
	switch (requirement) {
		case "technical": return facts.technicalComposition === null || !hasFiniteRequiredFacts(facts.technicalComposition, REQUIRED_TECHNICAL_FACTS);
		case "nutrition": return facts.nutritionPer100g === null || !hasFiniteRequiredFacts(facts.nutritionPer100g, REQUIRED_NUTRITION_FACTS);
		case "allergens": return facts.allergens === null;
	}
}
/** Recipe-wide module boundary. Besides eligibility, modules that render
* product facts require those facts to be frozen in the exact version snapshot.
* Technical composition belongs only to BASE_FORMULATION. Label-only toppings
* remain eligible for Summary/Nutrition without invented Engine composition. */
function recipeBehaviorModuleGate(authority, module) {
	const eligibility = productBehaviorModuleGate(authority.snapshots, module, authority.requiredLineIds);
	const requirements = FACT_REQUIREMENTS[module] ?? [];
	if (!eligibility.ready || requirements.length === 0) return eligibility;
	const missing = authority.requiredLineIds.filter((lineId) => {
		const snapshot = authority.snapshots[lineId];
		if (!snapshot) return true;
		return requirements.some((requirement) => requirement === "technical" && snapshot.processScope === "POST_PROCESS_ADDON" ? false : missingFacts(snapshot.sharedFacts, requirement));
	});
	return missing.length === 0 ? eligibility : {
		ready: false,
		blockedLineIds: missing,
		reason: `Brak zamrożonych danych ${module} dla: ${missing.join(", ")}.`
	};
}
const TECHNICAL_TO_INGREDIENT = {
	water: "water_percent",
	totalSolids: "solids_percent",
	fat: "fat_percent",
	saturatedFat: "saturated_fat_percent",
	protein: "protein_percent",
	carbohydrate: "carbohydrate_percent",
	sugars: "sugar_percent",
	sucrose: "sucrose_percent",
	glucose: "glucose_percent",
	dextrose: "dextrose_percent",
	fructose: "fructose_percent",
	lactose: "lactose_percent",
	polyols: "polyol_percent",
	fibre: "fiber_percent",
	salt: "salt_percent",
	alcohol: "alcohol_percent",
	energyKcal: "kcal_per_100g"
};
const projectCompositionValue = (composition, key, value) => {
	if (typeof value === "number" && Number.isFinite(value)) composition[key] = value;
	else Reflect.deleteProperty(composition, key);
};
/** Rebuilds the module input from immutable shared facts. It changes no Engine
* formula; it only prevents downstream views from re-reading mutable product
* objects after the exact version was resolved. Missing/null frozen values
* explicitly erase old mutable values instead of inheriting them. */
function recipeInputFromFrozenBehavior(input, authority, projection) {
	const required = new Set(authority.requiredLineIds);
	return {
		...input,
		items: input.items.map((item) => {
			if (!required.has(item.id)) return item;
			const snapshot = authority.snapshots[item.id];
			if (!snapshot || snapshot.processScope !== "BASE_FORMULATION") return item;
			const ingredient = structuredClone(item.ingredient);
			const technical = snapshot.sharedFacts?.technicalComposition;
			if (technical) {
				for (const [source, target] of Object.entries(TECHNICAL_TO_INGREDIENT)) projectCompositionValue(ingredient.composition, target, technical[source]);
				ingredient.pod_value = typeof technical.podValue === "number" && Number.isFinite(technical.podValue) ? technical.podValue : null;
				ingredient.pac_value = typeof technical.pacValue === "number" && Number.isFinite(technical.pacValue) ? technical.pacValue : null;
				ingredient.de_value = typeof technical.deValue === "number" && Number.isFinite(technical.deValue) ? technical.deValue : null;
			}
			if (projection === "nutrition") {
				const nutrition = snapshot.sharedFacts?.nutritionPer100g;
				const nutritionProjection = {
					kcal_per_100g: nutrition?.energyKcal,
					fat_percent: nutrition?.fat,
					saturated_fat_percent: nutrition?.saturatedFat,
					carbohydrate_percent: nutrition?.carbohydrate,
					sugar_percent: nutrition?.sugars,
					protein_percent: nutrition?.protein,
					salt_percent: nutrition?.salt,
					fiber_percent: nutrition?.fibre
				};
				for (const [target, value] of Object.entries(nutritionProjection)) projectCompositionValue(ingredient.composition, target, value);
			}
			return {
				...item,
				ingredient
			};
		})
	};
}
/** Projects POST_PROCESS_ADDON rows from the same immutable version facts used
* by Base consumers. This prevents Summary/Production/Master Label from
* accepting a valid snapshot while calculating from a mutable topping object. */
function recipeToppingsFromFrozenBehavior(toppings, authority, projection) {
	const required = new Set(authority.requiredLineIds);
	return toppings.map((item) => {
		if (!required.has(item.id)) return item;
		const snapshot = authority.snapshots[item.id];
		if (!snapshot || snapshot.processScope !== "POST_PROCESS_ADDON") return item;
		const ingredient = structuredClone(item.ingredient);
		if (isCatalogLabelToppingIngredient(ingredient)) {
			const nutrition = snapshot.sharedFacts?.nutritionPer100g;
			const allergens = snapshot.sharedFacts?.allergens;
			if (!nutrition || !allergens || nutrition.energyKcal === null || nutrition.fat === null || nutrition.carbohydrate === null || nutrition.protein === null || nutrition.salt === null) throw new Error(`Frozen label authority is incomplete for ${item.id}.`);
			ingredient.label_nutrition_per_100g = {
				basis: "per_100g",
				energyKcal: nutrition.energyKcal,
				fat: nutrition.fat,
				saturatedFat: nutrition.saturatedFat,
				carbohydrate: nutrition.carbohydrate,
				sugars: nutrition.sugars,
				protein: nutrition.protein,
				salt: nutrition.salt,
				fibre: nutrition.fibre
			};
			ingredient.ingredients_text = allergens.ingredientsText ?? "";
			ingredient.allergens_text = allergens.allergensText ?? "";
			return {
				...item,
				ingredient
			};
		}
		const technical = snapshot.sharedFacts?.technicalComposition;
		if (technical) {
			for (const [source, target] of Object.entries(TECHNICAL_TO_INGREDIENT)) projectCompositionValue(ingredient.composition, target, technical[source]);
			ingredient.pod_value = typeof technical.podValue === "number" ? technical.podValue : null;
			ingredient.pac_value = typeof technical.pacValue === "number" ? technical.pacValue : null;
			ingredient.de_value = typeof technical.deValue === "number" ? technical.deValue : null;
		}
		if (projection === "nutrition") {
			const nutrition = snapshot.sharedFacts?.nutritionPer100g;
			const nutritionProjection = {
				kcal_per_100g: nutrition?.energyKcal,
				fat_percent: nutrition?.fat,
				saturated_fat_percent: nutrition?.saturatedFat,
				carbohydrate_percent: nutrition?.carbohydrate,
				sugar_percent: nutrition?.sugars,
				protein_percent: nutrition?.protein,
				salt_percent: nutrition?.salt,
				fiber_percent: nutrition?.fibre
			};
			for (const [target, value] of Object.entries(nutritionProjection)) projectCompositionValue(ingredient.composition, target, value);
		}
		return {
			...item,
			ingredient
		};
	});
}

//#endregion
//#region src/spine/temperatureRegulator.ts
const TEMPERATURE_REGULATOR_CONFIG_VERSION = "0.1.0";
/**
* Protein product qualification carried by the Protein regulator rows.
*
* REPLACES `PROTEIN_GELATO_TARGET` (Protein Engine v2, owner decision
* 2026-08-22). The old constant declared a 20 % protein BY MASS target with a
* 0.1 pp tolerance and a user-facing 1 pp control step. It had no provenance —
* no controlled frozen-dessert study exceeds 10 % protein — and it is almost
* certainly a unit confusion with the EU claim threshold, which is 20 % of
* ENERGY, not of mass.
*
* There is no target and no control step any more: protein % is an OUTPUT.
* What the profile still asserts is that a Protein product must be able to
* carry its own claim — Regulation (EC) No 1924/2006, Annex, "HIGH PROTEIN":
* at least 20 % of the energy value of the food provided by protein.
*
* The runtime authority lives in
* `src/features/protein-gelato/proteinQualification.ts`; this entry records it
* in the regulator registry so every Protein temperature row states the rule
* it is evaluated under.
*/
const PROTEIN_GELATO_QUALIFICATION = {
	highProteinEnergySharePercent: 20,
	source: "EU Regulation (EC) No 1924/2006, Annex — HIGH PROTEIN"
};
const standardGelatoMinus11 = {
	productProfile: "standard_gelato",
	servingTemperatureC: -11,
	status: "locked_base_reference_zero_delta",
	configVersion: TEMPERATURE_REGULATOR_CONFIG_VERSION,
	npac: {
		band: [33, 43],
		cleanCenter: [39, 41],
		overlapNext: [42, 43]
	},
	iceFraction: { band: [45, 54.5] },
	pod: { band: [12, 17] },
	lactose: { band: [4, 6] },
	lactoseSanding: { band: [5, 9] },
	fat: { band: [5, 12] },
	aeratingProtein: { band: [3, 6] },
	proteinShareInSolids: { band: [9, 13] },
	solids: { band: [31, 45] },
	water: { band: [57, 70] },
	stabilizer: { required: true },
	disabledGates: [],
	advisoryGates: [],
	notes: ["−11 °C = base reference / zero delta — the current Base Engine is already calibrated for −11 °C", "NPAC alone is not enough: lactose, sanding, ice fraction, protein, solids, water and stabilizer still gate"]
};
const standardGelatoMinus12 = {
	productProfile: "standard_gelato",
	servingTemperatureC: -12,
	status: "locked_v0_1",
	configVersion: TEMPERATURE_REGULATOR_CONFIG_VERSION,
	npac: {
		band: [42, 50],
		cleanCenter: [45, 46.2],
		lockedReference: 46.18,
		lowerCleanAnchor: 44.98,
		overlapPrevious: [42, 43],
		overlapNext: [48, 50]
	},
	iceFraction: {
		band: [46, 54],
		lockedReference: 50.34
	},
	pod: {
		band: [12, 17],
		lockedReference: 15.57
	},
	lactose: {
		band: [4, 6],
		lockedReference: 5.44
	},
	lactoseSanding: {
		band: [5, 9],
		lockedReference: 8.62
	},
	fat: {
		band: [5, 12],
		lockedReference: 6.19
	},
	aeratingProtein: {
		band: [3, 6],
		lockedReference: 3.65
	},
	proteinShareInSolids: {
		band: [9, 13],
		lockedReference: 9.9
	},
	solids: {
		band: [31, 44],
		lockedReference: 36.82
	},
	water: {
		band: [56, 70],
		lockedReference: 63.18
	},
	stabilizer: { required: true },
	disabledGates: [],
	advisoryGates: [],
	notes: ["main locked reference: G17", "lower clean anchor: G15"]
};
const standardGelatoMinus13 = {
	productProfile: "standard_gelato",
	servingTemperatureC: -13,
	status: "locked_v0_1",
	configVersion: TEMPERATURE_REGULATOR_CONFIG_VERSION,
	npac: {
		band: [48, 55],
		cleanCenter: [51.5, 53.2],
		lockedReference: 53.15,
		lowerCleanAnchor: 51.77,
		overlapPrevious: [48, 50]
	},
	iceFraction: {
		band: [46, 52],
		lockedReference: 49.69
	},
	pod: {
		band: [12, 17],
		lockedReference: 16.37
	},
	lactose: {
		band: [4, 6],
		lockedReference: 5.51
	},
	lactoseSanding: {
		band: [5, 9],
		lockedReference: 8.78
	},
	fat: {
		band: [5, 12],
		lockedReference: 5.89
	},
	aeratingProtein: {
		band: [3, 6],
		lockedReference: 3.69
	},
	proteinShareInSolids: {
		band: [9, 13],
		lockedReference: 9.93
	},
	solids: {
		band: [35, 45],
		lockedReference: 37.22
	},
	water: {
		band: [55, 65],
		lockedReference: 62.78
	},
	stabilizer: { required: true },
	disabledGates: [],
	advisoryGates: [],
	notes: ["main locked reference: G18", "lower clean anchor: G11"]
};
const PROTEIN_DISABLED_GATES = [
	"lactose",
	"lactose_sanding",
	"aerating_protein",
	"protein_share_in_solids"
];
const proteinGelatoMinus11 = {
	productProfile: "protein_gelato",
	servingTemperatureC: -11,
	status: "owner_approved_standard_physics_protein_v1",
	configVersion: TEMPERATURE_REGULATOR_CONFIG_VERSION,
	npac: {
		band: [33, 42],
		cleanCenter: [39, 41],
		overlapNext: [42, 42]
	},
	iceFraction: { band: [45, 54.5] },
	pod: { band: [12, 17] },
	fat: { band: [5, 12] },
	solids: { band: [31, 45] },
	water: { band: [57, 70] },
	proteinQualification: PROTEIN_GELATO_QUALIFICATION,
	stabilizer: { required: true },
	disabledGates: PROTEIN_DISABLED_GATES,
	advisoryGates: [],
	notes: ["separate Protein Gelato profile; Standard Gelato serving physics reused by owner decision", "protein % is an OUTPUT of the formulation; the profile only requires the recipe to earn the HIGH PROTEIN claim, and never replaces Main flavor identity"]
};
const proteinGelatoMinus12 = {
	productProfile: "protein_gelato",
	servingTemperatureC: -12,
	status: "owner_approved_standard_physics_protein_v1",
	configVersion: TEMPERATURE_REGULATOR_CONFIG_VERSION,
	npac: {
		band: [42, 50],
		cleanCenter: [45, 46.2],
		lockedReference: 46.18,
		lowerCleanAnchor: 44.98,
		overlapPrevious: [42, 43],
		overlapNext: [48, 50]
	},
	iceFraction: {
		band: [46, 54],
		lockedReference: 50.34
	},
	pod: {
		band: [12, 17],
		lockedReference: 15.57
	},
	fat: {
		band: [5, 12],
		lockedReference: 6.19
	},
	solids: {
		band: [31, 44],
		lockedReference: 36.82
	},
	water: {
		band: [56, 70],
		lockedReference: 63.18
	},
	proteinQualification: PROTEIN_GELATO_QUALIFICATION,
	stabilizer: { required: true },
	disabledGates: PROTEIN_DISABLED_GATES,
	advisoryGates: [],
	notes: ["separate Protein Gelato profile; G17/G15 physical calibration reused by owner decision"]
};
const proteinGelatoMinus13 = {
	productProfile: "protein_gelato",
	servingTemperatureC: -13,
	status: "owner_approved_standard_physics_protein_v1",
	configVersion: TEMPERATURE_REGULATOR_CONFIG_VERSION,
	npac: {
		band: [48, 55],
		cleanCenter: [51.5, 53.2],
		lockedReference: 53.15,
		lowerCleanAnchor: 51.77,
		overlapPrevious: [48, 50]
	},
	iceFraction: {
		band: [46, 52],
		lockedReference: 49.69
	},
	pod: {
		band: [12, 17],
		lockedReference: 16.37
	},
	fat: {
		band: [5, 12],
		lockedReference: 5.89
	},
	solids: {
		band: [35, 45],
		lockedReference: 37.22
	},
	water: {
		band: [55, 65],
		lockedReference: 62.78
	},
	proteinQualification: PROTEIN_GELATO_QUALIFICATION,
	stabilizer: { required: true },
	disabledGates: PROTEIN_DISABLED_GATES,
	advisoryGates: [],
	notes: ["separate Protein Gelato profile; G18/G11 physical calibration reused by owner decision"]
};
const SORBET_DISABLED_GATES = [
	"dairy_fat_logic",
	"lactose",
	"lactose_sanding",
	"aerating_dairy_protein",
	"dairy_protein_share_in_solids",
	"msnf_required_gate"
];
const sorbetMinus11 = {
	productProfile: "sorbet",
	servingTemperatureC: -11,
	status: "locked_v0_1",
	configVersion: TEMPERATURE_REGULATOR_CONFIG_VERSION,
	pod: {
		band: [15, 25],
		lockedReference: 19.16
	},
	npac: {
		band: [35, 40],
		cleanCenter: [37, 38],
		lockedReference: 37.71,
		overlapNext: [39, 40]
	},
	iceFraction: {
		band: [51, 59],
		lockedReference: 57.43
	},
	solids: {
		band: [25, 33],
		lockedReference: 27.85
	},
	water: {
		band: [67, 75],
		lockedReference: 72.15
	},
	stabilizer: { required: true },
	disabledGates: SORBET_DISABLED_GATES,
	advisoryGates: [],
	notes: ["main locked reference: S01", "never evaluated with Standard Gelato dairy gates"]
};
const sorbetMinus12 = {
	productProfile: "sorbet",
	servingTemperatureC: -12,
	status: "locked_v0_1",
	configVersion: TEMPERATURE_REGULATOR_CONFIG_VERSION,
	pod: {
		band: [15, 25],
		lockedReference: 19.97
	},
	npac: {
		band: [42, 49],
		cleanCenter: [44, 45],
		lockedReference: 44.18,
		overlapPrevious: [39, 40],
		overlapNext: [48, 49]
	},
	iceFraction: {
		band: [51, 59],
		lockedReference: 55.95
	},
	solids: {
		band: [25, 33],
		lockedReference: 29.29
	},
	water: {
		band: [67, 73],
		lockedReference: 70.71
	},
	stabilizer: { required: true },
	disabledGates: SORBET_DISABLED_GATES,
	advisoryGates: [],
	notes: ["main locked reference: S02"]
};
const sorbetMinus13 = {
	productProfile: "sorbet",
	servingTemperatureC: -13,
	status: "locked_v0_1",
	configVersion: TEMPERATURE_REGULATOR_CONFIG_VERSION,
	pod: {
		band: [15, 25],
		lockedReference: 21.21
	},
	npac: {
		band: [48, 55],
		cleanCenter: [51, 52.5],
		lockedReference: 52.22,
		overlapPrevious: [48, 49]
	},
	iceFraction: {
		band: [50, 58],
		lockedReference: 54.28
	},
	solids: {
		band: [25, 33],
		lockedReference: 30.82
	},
	water: {
		band: [67, 73],
		lockedReference: 69.18
	},
	stabilizer: { required: true },
	disabledGates: SORBET_DISABLED_GATES,
	advisoryGates: [],
	notes: ["main locked reference: S03"]
};
const VEGAN_DISABLED_GATES = [
	"lactose",
	"lactose_sanding",
	"aerating_dairy_protein",
	"dairy_protein_share_in_solids",
	"msnf_required_gate"
];
const veganGelatoMinus11 = {
	productProfile: "vegan_gelato",
	servingTemperatureC: -11,
	status: "locked_pinguino_internal_v0_1",
	configVersion: TEMPERATURE_REGULATOR_CONFIG_VERSION,
	pod: { band: [13, 25] },
	npac: {
		band: [35, 52],
		cleanCenter: [40, 47],
		overlapNext: [47, 52]
	},
	iceFraction: { band: [45, 61] },
	fat: { band: [0, 12] },
	solids: { band: [30, 43] },
	water: { band: [54, 72] },
	stabilizer: { required: true },
	disabledGates: VEGAN_DISABLED_GATES,
	advisoryGates: [],
	notes: ["derived from GELLATTI temperature logic — locked internal v0.1, not externally confirmed", "never fails because lactose or dairy protein is 0"]
};
const veganGelatoMinus12 = {
	productProfile: "vegan_gelato",
	servingTemperatureC: -12,
	status: "locked_pinguino_internal_v0_1",
	configVersion: TEMPERATURE_REGULATOR_CONFIG_VERSION,
	pod: { band: [13, 25] },
	npac: {
		band: [44, 59],
		cleanCenter: [48, 54],
		overlapPrevious: [44, 52],
		overlapNext: [54, 59]
	},
	iceFraction: { band: [46, 60] },
	fat: { band: [0, 12] },
	solids: { band: [30, 43] },
	water: { band: [52, 70] },
	stabilizer: { required: true },
	disabledGates: VEGAN_DISABLED_GATES,
	advisoryGates: [],
	notes: ["derived from GELLATTI temperature logic — locked internal v0.1, not externally confirmed"]
};
const veganGelatoMinus13 = {
	productProfile: "vegan_gelato",
	servingTemperatureC: -13,
	status: "locked_pinguino_v0_1",
	configVersion: TEMPERATURE_REGULATOR_CONFIG_VERSION,
	pod: {
		band: [13, 25],
		lockedReference: 22.08,
		mediumEvidence: 20.58
	},
	npac: {
		band: [50, 64],
		cleanCenter: [53.5, 60],
		lockedReference: 59.47,
		mediumEvidence: 53.75
	},
	iceFraction: {
		band: [46, 58],
		lockedReference: 51.06,
		mediumEvidence: 51.35
	},
	fat: {
		band: [0, 12],
		lockedReference: 5.08,
		mediumEvidence: 4.21
	},
	solids: {
		band: [30, 43],
		lockedReference: 36.24,
		mediumEvidence: 36.17
	},
	water: {
		band: [50, 67],
		lockedReference: 63.76,
		mediumEvidence: 63.83
	},
	stabilizer: { required: true },
	disabledGates: VEGAN_DISABLED_GATES,
	advisoryGates: [],
	notes: ["observed calibration anchor — external calibration data directly exposed Vegan −13 °C", "main clean reference: V02 fixed; medium evidence: V02-AUTO"]
};
const CHOCOLATE_PROTEIN_SHARE = {
	band: [8, 13],
	visibleBenchmark: [9, 13],
	hardMinimum: 7,
	notes: ["soft/advisory gate — never a standard-gelato hard fail when chocolate structure is good"]
};
const chocolateGelatoMinus11 = {
	productProfile: "chocolate_gelato",
	servingTemperatureC: -11,
	status: "locked_pinguino_internal_v0_1",
	configVersion: TEMPERATURE_REGULATOR_CONFIG_VERSION,
	pod: { band: [12, 20] },
	npac: {
		band: [34, 45],
		cleanCenter: [40, 42],
		overlapNext: [43, 45]
	},
	iceFraction: { band: [45, 54.5] },
	lactose: { band: [4, 6] },
	lactoseSanding: { band: [5, 9] },
	fat: { band: [5, 12] },
	aeratingProtein: { band: [3, 6] },
	proteinShareInSolids: CHOCOLATE_PROTEIN_SHARE,
	solids: { band: [31, 45] },
	water: { band: [57, 70] },
	stabilizer: { required: true },
	disabledGates: [],
	advisoryGates: ["protein_share_in_solids"],
	notes: ["derived from Standard Gelato temperature logic with chocolate-specific overrides", "chocolate/cocoa solids dilute protein share — do not overcorrect with skimmed milk powder if lactose sanding worsens"]
};
const chocolateGelatoMinus12 = {
	productProfile: "chocolate_gelato",
	servingTemperatureC: -12,
	status: "locked_pinguino_internal_v0_1",
	configVersion: TEMPERATURE_REGULATOR_CONFIG_VERSION,
	pod: { band: [12, 20] },
	npac: {
		band: [43, 52],
		cleanCenter: [47, 49.5],
		overlapPrevious: [43, 45],
		overlapNext: [49, 52]
	},
	iceFraction: { band: [46, 54] },
	lactose: { band: [4, 6] },
	lactoseSanding: { band: [5, 9] },
	fat: { band: [5, 12] },
	aeratingProtein: { band: [3, 6] },
	proteinShareInSolids: CHOCOLATE_PROTEIN_SHARE,
	solids: { band: [31, 45] },
	water: { band: [56, 70] },
	stabilizer: { required: true },
	disabledGates: [],
	advisoryGates: ["protein_share_in_solids"],
	notes: ["derived from Standard Gelato temperature logic with chocolate-specific overrides", "higher/wider than typical Standard Gelato — cocoa bitterness and cocoa solids change product tolerance"]
};
const chocolateGelatoMinus13 = {
	productProfile: "chocolate_gelato",
	servingTemperatureC: -13,
	status: "locked_pinguino_v0_1",
	configVersion: TEMPERATURE_REGULATOR_CONFIG_VERSION,
	pod: {
		band: [12, 20],
		fixedReference: 18.43,
		optimizedEvidence: 15.8
	},
	npac: {
		band: [49, 57],
		cleanCenter: [49.8, 54.1],
		fixedReference: 54.08,
		lowerEvidence: 49.8,
		overlapPrevious: [49, 52]
	},
	iceFraction: {
		band: [46, 52],
		fixedReference: 43.97,
		optimizedEvidence: 46.11
	},
	lactose: {
		band: [4, 6],
		fixedReference: 4.61,
		optimizedEvidence: 5.37
	},
	lactoseSanding: {
		band: [5, 9],
		fixedReference: 8.41,
		optimizedEvidence: 9.37
	},
	fat: {
		band: [5, 12],
		fixedReference: 10.37,
		optimizedEvidence: 8.95
	},
	aeratingProtein: {
		band: [3, 6],
		fixedReference: 3.09,
		optimizedEvidence: 3.59
	},
	proteinShareInSolids: {
		...CHOCOLATE_PROTEIN_SHARE,
		fixedReference: 6.84,
		optimizedEvidence: 8.42
	},
	solids: {
		band: [35, 45],
		fixedReference: 45.12,
		optimizedEvidence: 42.62
	},
	water: {
		band: [55, 65],
		fixedReference: 54.88,
		optimizedEvidence: 57.38
	},
	stabilizer: { required: true },
	disabledGates: [],
	advisoryGates: ["protein_share_in_solids"],
	notes: ["main observed chocolate setting — C01 fixed is stress/reference evidence, C01 optimized is optimizer behavior evidence", "chocolate tolerates POD up to 20 — cocoa bitterness reduces perceived sweetness"]
};
const REGISTRY = {
	standard_gelato: {
		[-11]: standardGelatoMinus11,
		[-12]: standardGelatoMinus12,
		[-13]: standardGelatoMinus13
	},
	sorbet: {
		[-11]: sorbetMinus11,
		[-12]: sorbetMinus12,
		[-13]: sorbetMinus13
	},
	vegan_gelato: {
		[-11]: veganGelatoMinus11,
		[-12]: veganGelatoMinus12,
		[-13]: veganGelatoMinus13
	},
	chocolate_gelato: {
		[-11]: chocolateGelatoMinus11,
		[-12]: chocolateGelatoMinus12,
		[-13]: chocolateGelatoMinus13
	},
	protein_gelato: {
		[-11]: proteinGelatoMinus11,
		[-12]: proteinGelatoMinus12,
		[-13]: proteinGelatoMinus13
	}
};
const isActiveProfile = (value) => value === "standard_gelato" || value === "sorbet" || value === "vegan_gelato" || value === "chocolate_gelato" || value === "protein_gelato";
const isSupportedTemperature = (value) => value === -11 || value === -12 || value === -13;
/**
* Untrusted lookup: unsupported product or temperature returns null —
* NEVER a fallback to another product or another temperature.
*/
const getTemperatureRegulatorSettingsOrNull = (productProfile, servingTemperatureC) => isActiveProfile(productProfile) && isSupportedTemperature(servingTemperatureC) ? REGISTRY[productProfile][servingTemperatureC] : null;

//#endregion
//#region src/features/recipe-direction/recipeDirectionTargets.ts
const DEFAULT_RECIPE_DIRECTION_TARGETS = Object.freeze({
	sweetness: 0,
	softness: 0,
	creaminess: 0,
	flavor: 0
});
const profileForCategory = (category) => {
	switch (category) {
		case "milk_gelato":
		case "fruit_gelato":
		case "nut_gelato":
		case "alcohol_gelato":
		case "custom": return "standard_gelato";
		case "chocolate_gelato": return "chocolate_gelato";
		case "sorbet": return "sorbet";
		case "vegan_gelato": return "vegan_gelato";
		case "protein_gelato": return "protein_gelato";
	}
};
const targetFifth = (band, target) => {
	const [min, max] = band;
	const fifth = (max - min) / 5;
	const index = target + 2;
	return {
		min: min + index * fifth,
		max: min + (index + 1) * fifth
	};
};
/** Scope guard: profiles outside this Gelato-only change retain their accepted
* three-zone calibration even though the stored target is now lossless. */
const legacyTargetThird = (band, target) => {
	const [min, max] = band;
	const third = (max - min) / 3;
	if (target < 0) return {
		min,
		max: min + third
	};
	if (target > 0) return {
		min: max - third,
		max
	};
	return {
		min: min + third,
		max: max - third
	};
};
const softnessBand = (band, cleanCenter, target) => {
	const firmSpanMidpoint = (band[0] + cleanCenter[0]) / 2;
	const softSpanMidpoint = (cleanCenter[1] + band[1]) / 2;
	if (target === -2) return {
		min: softSpanMidpoint,
		max: band[1]
	};
	if (target === -1) return {
		min: cleanCenter[1],
		max: softSpanMidpoint
	};
	if (target === 1) return {
		min: firmSpanMidpoint,
		max: cleanCenter[0]
	};
	if (target === 2) return {
		min: band[0],
		max: firmSpanMidpoint
	};
	return {
		min: cleanCenter[0],
		max: cleanCenter[1]
	};
};
const SORBET_SWEETNESS_TARGET_CENTERS = Object.freeze({
	[-2]: 16,
	[-1]: 18,
	0: 20,
	1: 22,
	2: 24
});
const SORBET_HARDNESS_TARGET_CENTERS = Object.freeze({
	[-11]: Object.freeze({
		[-2]: 39.5,
		[-1]: 38.5,
		0: 37.5,
		1: 36.5,
		2: 35.5
	}),
	[-12]: Object.freeze({
		[-2]: 48.3,
		[-1]: 46.9,
		0: 45.5,
		1: 44.1,
		2: 42.7
	}),
	[-13]: Object.freeze({
		[-2]: 54.3,
		[-1]: 52.9,
		0: 51.5,
		1: 50.1,
		2: 48.7
	})
});
const exactPreferencePoint = (center) => ({
	min: center,
	max: center
});
function normalizeRecipeDirectionTargets(value) {
	const normalize = (candidate) => {
		if (candidate == null || !Number.isFinite(candidate)) return 0;
		return Math.max(-2, Math.min(2, Math.round(candidate)));
	};
	return {
		sweetness: normalize(value?.sweetness),
		softness: normalize(value?.softness),
		creaminess: normalize(value?.creaminess),
		flavor: normalize(value?.flavor)
	};
}
/**
* The plan depends ONLY on these four values, and the pipeline rebuilds it many
* times per solve (every violation measure, every candidate, every advisor
* simulation). Memoising on that exact value fingerprint — not on object
* identity — is safe for any caller and removes a large amount of repeated work
* from the Direction and Rescue hot paths.
*/
const DIRECTION_PLAN_CACHE_LIMIT = 512;
const directionPlanCache = /* @__PURE__ */ new Map();
const directionPlanKey = (input) => [
	input.category,
	input.target_temperature_c,
	input.goals?.direction_targets_active === true ? 1 : 0,
	input.goals?.direction_targets?.sweetness ?? 0,
	input.goals?.direction_targets?.softness ?? 0,
	input.goals?.direction_targets?.creaminess ?? 0,
	input.goals?.direction_targets?.flavor ?? 0
].join("|");
function buildRecipeDirectionPlan(input) {
	const cacheKey = directionPlanKey(input);
	const cached = directionPlanCache.get(cacheKey);
	if (cached) return cached;
	const plan = computeRecipeDirectionPlan(input);
	if (directionPlanCache.size >= 512) {
		const oldest = directionPlanCache.keys().next().value;
		if (oldest !== void 0) directionPlanCache.delete(oldest);
	}
	directionPlanCache.set(cacheKey, plan);
	return plan;
}
function computeRecipeDirectionPlan(input) {
	const targets = normalizeRecipeDirectionTargets(input.goals?.direction_targets);
	const enabled = input.goals?.direction_targets_active === true;
	const profile = profileForCategory(input.category);
	const regulator = profile ? getTemperatureRegulatorSettingsOrNull(profile, input.target_temperature_c) : null;
	const axes = [];
	const bands = {};
	const sweetnessOperational = profile === "vegan_gelato" || profile === "standard_gelato" || profile === "protein_gelato" || profile === "sorbet" && (input.target_temperature_c === -11 || input.target_temperature_c === -12 || input.target_temperature_c === -13) || profile === "chocolate_gelato" && (input.target_temperature_c === -11 || input.target_temperature_c === -12);
	const softnessOperational = profile === "vegan_gelato" || profile === "standard_gelato" || profile === "sorbet" && (input.target_temperature_c === -11 || input.target_temperature_c === -12 || input.target_temperature_c === -13);
	if (regulator?.pod && sweetnessOperational) {
		const targetCenter = profile === "sorbet" ? SORBET_SWEETNESS_TARGET_CENTERS[targets.sweetness] : null;
		const targetBand = targetCenter !== null ? exactPreferencePoint(targetCenter) : profile === "standard_gelato" || profile === "vegan_gelato" || profile === "protein_gelato" ? targetFifth(regulator.pod.band, targets.sweetness) : legacyTargetThird(regulator.pod.band, targets.sweetness);
		if (enabled) bands.pod = targetBand;
		axes.push({
			axis: "sweetness",
			target: targets.sweetness,
			status: "working",
			metric: "pod",
			targetBand,
			targetCenter,
			reason: null
		});
	} else if (!sweetnessOperational && regulator?.pod) axes.push({
		axis: "sweetness",
		target: targets.sweetness,
		status: "blocked_runtime",
		metric: "pod",
		targetBand: null,
		targetCenter: null,
		reason: "Pełna ścieżka −1/0/+1 dla tego profilu i temperatury nie ma jeszcze zweryfikowanego, bezpiecznego Preview/Apply."
	});
	else axes.push({
		axis: "sweetness",
		target: targets.sweetness,
		status: "blocked_data",
		metric: "pod",
		targetBand: null,
		targetCenter: null,
		reason: "Brak zatwierdzonego zakresu POD dla tego profilu i temperatury."
	});
	if (regulator?.npac?.cleanCenter && softnessOperational) {
		const sorbetTemperature = input.target_temperature_c;
		const targetCenter = profile === "sorbet" ? SORBET_HARDNESS_TARGET_CENTERS[sorbetTemperature]?.[targets.softness] ?? null : null;
		const targetBand = targetCenter !== null ? exactPreferencePoint(targetCenter) : softnessBand(regulator.npac.band, regulator.npac.cleanCenter, targets.softness);
		if (enabled) bands.npac = targetBand;
		axes.push({
			axis: "softness",
			target: targets.softness,
			status: "working",
			metric: "npac",
			targetBand,
			targetCenter,
			reason: null
		});
	} else if (!softnessOperational && regulator?.npac?.cleanCenter) axes.push({
		axis: "softness",
		target: targets.softness,
		status: "blocked_science",
		metric: "npac",
		targetBand: null,
		targetCenter: null,
		reason: "Brakuje zweryfikowanych danych miękkości dla tej kategorii. Gellatti nie użyje danych z innego typu receptury."
	});
	else axes.push({
		axis: "softness",
		target: targets.softness,
		status: "blocked_data",
		metric: "npac",
		targetBand: null,
		targetCenter: null,
		reason: "Brak zatwierdzonego czystego centrum NPAC dla tego profilu i temperatury."
	});
	axes.push({
		axis: "creaminess",
		target: targets.creaminess,
		status: "blocked_science",
		metric: null,
		targetBand: null,
		targetCenter: null,
		reason: "Brak zatwierdzonego modelu sensorycznej kremowości; sam tłuszcz nie jest kremowością."
	}, {
		axis: "flavor",
		target: targets.flavor,
		status: "blocked_data",
		metric: null,
		targetBand: null,
		targetCenter: null,
		reason: "Brak zweryfikowanych profili mocy smaku dla poszczególnych klas składników."
	});
	return {
		profile,
		servingTemperatureC: input.target_temperature_c,
		bands,
		axes
	};
}

//#endregion
//#region src/features/recipe-direction/recipeDirectionAssessment.ts
/**
* Product-layer target fit only. Native Engine bands remain the sole safety
* authority; this function merely asks whether the already-computed result is
* inside the immutable Sweetness/Softness preference zones selected by the
* owner. No Engine constants or Mapper values are changed.
*/
function assessRecipeDirection(input, result) {
	const plan = buildRecipeDirectionPlan(input);
	const active = input.goals?.direction_targets_active === true;
	const indicators = new Map(result.indicators.map((indicator) => [indicator.key, indicator]));
	const residuals = [];
	if (active) for (const axis of plan.axes) {
		if (axis.status !== "working" || axis.metric === null || axis.targetBand === null) continue;
		const value = indicators.get(axis.metric)?.value;
		if (value === null || value === void 0 || !Number.isFinite(value)) continue;
		const absoluteDistance = axis.targetCenter === null ? value < axis.targetBand.min ? axis.targetBand.min - value : value > axis.targetBand.max ? value - axis.targetBand.max : 0 : Math.abs(value - axis.targetCenter);
		const exactCenterReached = axis.targetCenter !== null && absoluteDistance <= 1e-9;
		const side = exactCenterReached ? "inside" : value < axis.targetBand.min ? "below" : value > axis.targetBand.max ? "above" : "inside";
		residuals.push({
			axis: axis.axis,
			metric: axis.metric,
			reached: axis.targetCenter === null ? side === "inside" : exactCenterReached,
			side,
			value,
			targetCenter: axis.targetCenter,
			absoluteDistance
		});
	}
	const reachedAxisCount = residuals.filter((residual) => residual.reached).length;
	const supportedAxisCount = residuals.length;
	const missedAxisCount = supportedAxisCount - reachedAxisCount;
	const score = !active || supportedAxisCount === 0 ? null : Math.max(1, 10 - missedAxisCount);
	return {
		active,
		reached: active && supportedAxisCount > 0 && missedAxisCount === 0,
		supportedAxisCount,
		reachedAxisCount,
		score,
		residuals,
		blockedAxes: active ? plan.axes.filter((axis) => axis.status !== "working").map((axis) => ({
			axis: axis.axis,
			reason: axis.reason ?? "Brak kalibracji."
		})) : []
	};
}

//#endregion
//#region src/features/protein-gelato/proteinScienceAuthority.ts
/**
* The ONLY hard Protein-specific qualification in v2.
*
* Protein Gelato is a protein PRODUCT, so it must legally be able to carry the
* claim its profile name makes. Regulation (EC) 1924/2006 defines that on an
* ENERGY-SHARE basis, not a mass basis: HIGH PROTEIN requires at least 20 % of
* the food's energy to come from protein.
*
* This replaces the pre-v2 `protein_target` gate (20 % protein BY MASS, no
* provenance). Inside the Protein profile's own fat band (5-12 %) the energy
* rule is strictly weaker than the mass rule it replaces, so no recipe that was
* legal before becomes illegal now — the change is a relaxation plus a quality
* layer, never a new restriction.
*/
const PROTEIN_QUALIFICATION = {
	authority: "HARD",
	/** kcal per gram of protein used for the claim arithmetic (Atwater, EU Annex XIV 1169/2011). */
	kcalPerProteinGram: 4,
	/** HIGH PROTEIN — the claim the "Protein" profile name makes. */
	highProteinEnergySharePercent: 20,
	/** SOURCE OF PROTEIN — reported for context only, never a gate. */
	sourceOfProteinEnergySharePercent: 12,
	source: "EU_1924_2006_PROTEIN_CLAIM"
};
/**
* AFR 2022 Table 1 + Figs. 2/3/5 — the only controlled protein-concentration
* series that reports aeration, firmness, melting AND sensory across the range.
*
* Formulation held constant: 10 % milk fat, 15 % sugar, 0.15 % stabiliser-
* emulsifier blend, buffalo milk base. The 4 % control took its protein from
* SMP; the 6/8/10 % samples replaced the SMP entirely with WPI (87 % protein,
* 0.8 % fat, 2.0 % ash). Pasteurised 80 degC/1 min, homogenised 140 kg/cm2,
* aged overnight, batch-frozen to -5 degC, hardened at -20 degC.
*
* The series is MONOTONE AND ADVERSE in every structural dimension: overrun
* falls 94.9 -> 33.9 %, hardness rises 13.60 -> 47.66 N, melting rate rises
* 0.26 -> 0.74 g/min, and both the body-and-texture and meltdown sensory
* scores fall. There is NO protein level in this dataset at which more protein
* improved the product.
*
* CRITICAL BREAKPOINT (the authors' own statistics, p < 0.05): 6 % protein was
* NOT significantly different from the 4 % control for hardness, body-and-
* texture or meltdown. 8 % and 10 % were significantly worse on all of them,
* and 8/10 % also lost flavour score to the characteristic whey note. This is
* the single most important quantitative fact for Protein v2: quality is
* preserved to about 6 % protein and measurably degrades at and beyond 8 %.
*
* The authors also record that reaching 8 % protein with SMP instead of WPI
* produced "an unacceptable product with very low overrun and too hard body" —
* direct evidence that the protein SOURCE, not the protein number, decides
* whether a given protein level is achievable at all.
*
* HONEST LIMITATION: one buffalo-milk WPI system on one batch freezer with one
* fixed dasher speed. Absolute values are NOT transferable to a Gellatti batch.
* Only the SHAPE is used, and only to rank candidates — never to accept or
* reject one.
*/
const PROTEIN_CONCENTRATION_EVIDENCE = {
	authority: "QUALITY",
	fixtureFatPercent: 10,
	fixtureSugarPercent: 15,
	fixtureStabilizerEmulsifierPercent: .15,
	/** Measured series, ascending by protein. `qualityLoss` records the authors' significance finding. */
	series: [
		{
			proteinPercent: 4,
			overrunPercent: 94.9,
			flowBehaviourIndex: .86,
			consistencyCoefficientPaSn: .18,
			meltingRateGPerMin: .26,
			qualityLoss: "control"
		},
		{
			proteinPercent: 6,
			overrunPercent: 60.5,
			flowBehaviourIndex: .752,
			consistencyCoefficientPaSn: .37,
			meltingRateGPerMin: .24,
			qualityLoss: "not_significant_vs_control"
		},
		{
			proteinPercent: 8,
			overrunPercent: 44.3,
			flowBehaviourIndex: .68,
			consistencyCoefficientPaSn: 1.61,
			meltingRateGPerMin: .54,
			qualityLoss: "significant"
		},
		{
			proteinPercent: 10,
			overrunPercent: 33.9,
			flowBehaviourIndex: .57,
			consistencyCoefficientPaSn: 4.22,
			meltingRateGPerMin: .74,
			qualityLoss: "significant"
		}
	],
	hardnessAtLowProteinNewton: 13.6,
	hardnessAtHighProteinNewton: 47.66,
	lossModulus100HzLowPa: 10.9,
	lossModulus100HzHighPa: 34.3,
	storageModulus100HzLowPa: 7.25,
	storageModulus100HzHighPa: 32.7,
	/**
	* Highest protein level with NO statistically significant quality loss versus
	* a conventional ice cream. Not a gate — the reference point the quality
	* model measures degradation from.
	*/
	qualityPreservedMaxPercent: 6,
	/** Lowest level at which the study measured significant structural and sensory loss. */
	significantQualityLossFromPercent: 8,
	source: "AFR_2022_WPI_CONCENTRATION"
};
/**
* The protein window actually covered by controlled frozen-dessert evidence.
* 4.5 % (IJFP 2025) … 10 % (AFR 2022 / LWT 2021), with JFS 2026 at 6 %.
* Above `evidenceCeilingPercent` NO controlled dataset exists, so v2 keeps
* formulating but flags the candidate as beyond-evidence and ranks it lower.
*/
const PROTEIN_EVIDENCE_WINDOW = {
	authority: "QUALITY",
	evidenceFloorPercent: 4.5,
	evidenceCeilingPercent: 10,
	sources: [
		"IJFP_2025_WHEY_CASEIN_RATIO",
		"JFS_2026_PROTEIN_SOURCE",
		"AFR_2022_WPI_CONCENTRATION",
		"LWT_2021_PROTEIN_EMULSIFIER"
	]
};
/**
* Fat window shared by every controlled fixture: 6 % (AFR buffalo milk) …
* 13 % (IJFP 2025), with JFS 2026 and JDS 2005 at 12 %. A Protein candidate
* outside this fat window, or outside the resulting protein:fat envelope, is
* ADVISORY-flagged as beyond evidence. There is no controlled protein:fat
* series, so no optimum is asserted and no score is deducted for it.
*/
const PROTEIN_FAT_EVIDENCE_ENVELOPE = {
	authority: "ADVISORY",
	fatFloorPercent: 6,
	fatCeilingPercent: 13,
	/** 4.5/13 rounded down … 10/6 rounded up, from the fixture set above. */
	proteinToFatFloor: .34,
	proteinToFatCeiling: 1.67,
	sources: [
		"IJFP_2025_WHEY_CASEIN_RATIO",
		"JFS_2026_PROTEIN_SOURCE",
		"AFR_2022_WPI_CONCENTRATION"
	]
};
/**
* The Protein profile disables the standard-gelato `lactose` and
* `lactose_sanding` HARD gates by owner decision. v2 does NOT re-enable them.
* It reuses the SAME already-approved sanding band as a QUALITY signal only, so
* a protein source that drags a large lactose load into the mix (WPC 60 at
* 28 % lactose) is ranked below one that does not (WPI-grade at ~1 %), without
* any recipe becoming invalid.
*
* Band provenance: src/engine/config/targets.ts lactose_sandiness_risk 5-9 %,
* unchanged. Mechanism: lactose crystallises out of the freeze-concentrated
* serum phase during storage; stabiliser gums suppress nucleation.
*/
const PROTEIN_LACTOSE_QUALITY = {
	authority: "QUALITY",
	approvedSandingRiskMaxPercent: 9,
	reusedFrom: "src/engine/config/targets.ts::lactose_sandiness_risk"
};

//#endregion
//#region src/features/protein-gelato/proteinQualification.ts
/**
* PINGÜINO — Protein product qualification (Protein Engine v2, HARD authority).
*
* WHAT REPLACED WHAT
* ------------------
* v1 gated Protein Gelato on `target_protein_percent`, defaulting to 20 %
* protein BY MASS of the mix, with a 0.1 pp tolerance. That number has no
* provenance anywhere in the repository or in the frozen-dessert literature —
* no controlled study goes above 10 % protein — and it is almost certainly a
* unit confusion with the EU "HIGH PROTEIN" claim, which is 20 % of ENERGY.
*
* v2 keeps a hard qualification, because a product profile called "Protein"
* must be able to carry the claim its name makes, but sources it correctly:
*
*   Regulation (EC) No 1924/2006, Annex:
*     SOURCE OF PROTEIN — at least 12 % of the energy value from protein
*     HIGH PROTEIN      — at least 20 % of the energy value from protein
*
* The user never selects this. It is not a target, it has no tolerance band,
* and the optimizer does not try to exceed it — exceeding it costs measured
* structure and buys nothing (see proteinStructureQuality.ts).
*
* RELAXATION PROOF (why this cannot invalidate an existing recipe): the energy
* rule requires protein >= 0.5625 x fat + 0.25 x carbohydrate. Inside the
* Protein profile's own fat band (5-12 %), a recipe at the old 20 %-by-mass
* gate would need more than 35 % fat to fail the energy rule, which the profile
* forbids. Every recipe legal under the old gate is legal under the new one.
*/
const NOT_APPLICABLE$1 = {
	applicable: false,
	actualPercent: null,
	energySharePercent: null,
	requiredPercent: null,
	excessPp: null,
	claim: "none",
	qualified: false
};
/**
* Minimum protein mass % that earns the claim for a given non-protein energy
* load. Solving `4P / (4P + nonProteinKcal) = share` for P gives
* `P = nonProteinKcal x share / (4 x (1 - share))`; at share = 0.20 that is
* `nonProteinKcal / 16`.
*/
function requiredProteinPercentFor(nonProteinKcalPer100g, energySharePercent = PROTEIN_QUALIFICATION.highProteinEnergySharePercent) {
	const share = energySharePercent / 100;
	if (share <= 0) return 0;
	if (share >= 1) return Number.POSITIVE_INFINITY;
	return nonProteinKcalPer100g * share / (PROTEIN_QUALIFICATION.kcalPerProteinGram * (1 - share));
}
/**
* Pure, deterministic. Reads only values the Base Engine already computes —
* no new science, no new coefficient, no Mapper dependency.
*/
function assessProteinQualification(input, result = calculateRecipe(input)) {
	if (input.category !== "protein_gelato") return NOT_APPLICABLE$1;
	const nutrition = result.nutrition_per_100g;
	const actualPercent = result.percentages.protein_percent;
	if (nutrition === null || !(nutrition.kcal > 0)) return {
		applicable: true,
		actualPercent,
		energySharePercent: null,
		requiredPercent: null,
		excessPp: null,
		claim: "none",
		qualified: false
	};
	const proteinKcal = nutrition.protein_g * PROTEIN_QUALIFICATION.kcalPerProteinGram;
	const energySharePercent = proteinKcal / nutrition.kcal * 100;
	const requiredPercent = requiredProteinPercentFor(Math.max(0, nutrition.kcal - proteinKcal));
	const claim = energySharePercent >= PROTEIN_QUALIFICATION.highProteinEnergySharePercent - 1e-9 ? "high_protein" : energySharePercent >= PROTEIN_QUALIFICATION.sourceOfProteinEnergySharePercent - 1e-9 ? "source_of_protein" : "none";
	return {
		applicable: true,
		actualPercent,
		energySharePercent,
		requiredPercent,
		excessPp: actualPercent - requiredPercent,
		claim,
		qualified: claim === "high_protein"
	};
}

//#endregion
//#region src/features/protein-gelato/proteinBehavior.ts
/** Protein density below which a line is a flavour/base ingredient, not a protein source. */
const PROTEIN_SOURCE_MIN_PERCENT = 10;
/** Isolate-grade protein density (WPI/MPI conventionally sit at or above this). */
const ISOLATE_MIN_PROTEIN_PERCENT = 88;
/** Above this lactose density a "milk protein" powder is really a milk powder. */
const MILK_POWDER_MIN_LACTOSE_PERCENT = 30;
/** At or below this moisture the product is a powder, whatever its name says. */
const POWDER_MAX_WATER_PERCENT = 15;
/** Protein density that only a concentrated protein fraction reaches. */
const CONCENTRATED_PROTEIN_MIN_PERCENT = 50;
/** Skim/whole milk powders sit in this protein window. */
const MILK_POWDER_MIN_PROTEIN_PERCENT = 20;
/** Fat share separating whole milk powder from skimmed. */
const WHOLE_MILK_POWDER_MIN_FAT_PERCENT = 15;
/** Fluid dairy is a protein-relevant base from roughly milk strength upward. */
const FLUID_DAIRY_MIN_PROTEIN_PERCENT = 2.5;
const normalize = (value) => value.toLowerCase().replace(/[·•]/g, " ").replace(/[^a-z0-9%]+/g, " ").replace(/\s+/g, " ").trim();
/**
* Short acronyms ("wpc", "smp", "mpi") must match a WHOLE WORD — a substring
* test would classify unrelated products by accident. Multi-word phrases are
* matched as substrings of the normalised name.
*/
const hasAny = (haystack, needles) => {
	const words = new Set(haystack.split(" "));
	return needles.some((needle) => needle.includes(" ") ? haystack.includes(needle) : words.has(needle));
};
/** Name tokens per class. Order of evaluation is fixed and total. */
const TOKENS = {
	wpi: [
		"whey protein isolate",
		"wpi",
		"izolat bialka serwatkowego",
		"izolat serwatki"
	],
	wpc: [
		"whey protein concentrate",
		"wpc",
		"koncentrat bialka serwatkowego"
	],
	mpc: [
		"milk protein concentrate",
		"mpc",
		"milk protein isolate",
		"mpi"
	],
	micellarCasein: [
		"micellar casein",
		"kazeina micelarna",
		"micellar milk protein"
	],
	caseinate: [
		"caseinate",
		"kazeinian",
		"sodium casein",
		"calcium casein",
		"casein"
	],
	skimMilkPowder: [
		"skimmed milk powder",
		"skim milk powder",
		"smp",
		"mleko w proszku odtluszczone"
	],
	milkPowder: [
		"milk powder",
		"whole milk powder",
		"mleko w proszku"
	],
	fermented: [
		"skyr",
		"yoghurt",
		"yogurt",
		"jogurt",
		"quark",
		"twarog",
		"kefir",
		"fromage frais"
	],
	plant: [
		"pea protein",
		"rice protein",
		"soy protein",
		"soya protein",
		"hemp protein",
		"bialko grochu",
		"bialko ryzu",
		"bialko sojowe"
	],
	egg: [
		"egg white",
		"egg albumen",
		"bialko jaja",
		"dried egg"
	],
	fluidDairy: [
		"milk 3",
		"milk 1",
		"cream",
		"mleko",
		"smietana",
		"fluid milk"
	]
};
/**
* Deterministic classification. Explicit name evidence wins; where two protein
* classes are named at once the product contradicts itself and is honestly
* demoted to `mixed_dairy_protein` rather than guessed at.
*/
function classifySource(ingredient) {
	const name = normalize(ingredient.name);
	const composition = ingredient.composition;
	const protein = composition.protein_percent;
	const lactose = composition.lactose_percent;
	const dairy = ingredient.flags?.is_dairy === true || ingredient.category === "dairy";
	const namedWhey = hasAny(name, TOKENS.wpi) || hasAny(name, TOKENS.wpc);
	const namedMilkProtein = hasAny(name, TOKENS.mpc);
	if ([
		namedWhey,
		namedMilkProtein,
		hasAny(name, TOKENS.micellarCasein) || hasAny(name, TOKENS.caseinate)
	].filter(Boolean).length > 1) return {
		sourceClass: "mixed_dairy_protein",
		sourceEvidence: "DETERMINISTICALLY_INFERRED",
		rationale: "product name asserts more than one dairy protein class; no single class is inferable without invention"
	};
	if (hasAny(name, TOKENS.wpi)) return {
		sourceClass: "whey_protein_isolate",
		sourceEvidence: "EXPLICIT",
		rationale: "product name states whey protein isolate"
	};
	if (hasAny(name, TOKENS.wpc)) return {
		sourceClass: "whey_protein_concentrate",
		sourceEvidence: "EXPLICIT",
		rationale: "product name states whey protein concentrate"
	};
	if (hasAny(name, TOKENS.micellarCasein)) return {
		sourceClass: "micellar_casein",
		sourceEvidence: "EXPLICIT",
		rationale: "product name states micellar casein"
	};
	if (hasAny(name, TOKENS.caseinate)) return {
		sourceClass: "caseinate",
		sourceEvidence: "EXPLICIT",
		rationale: "product name states a caseinate"
	};
	if (namedMilkProtein) {
		if (lactose >= MILK_POWDER_MIN_LACTOSE_PERCENT) return {
			sourceClass: "skim_milk_powder",
			sourceEvidence: "DETERMINISTICALLY_INFERRED",
			rationale: `named as milk protein but carries ${lactose.toFixed(1)} % lactose, which is milk-powder composition`
		};
		return {
			sourceClass: "milk_protein_concentrate",
			sourceEvidence: "EXPLICIT",
			rationale: "product name states milk protein concentrate/isolate"
		};
	}
	if (hasAny(name, TOKENS.plant)) return {
		sourceClass: "plant_protein",
		sourceEvidence: "EXPLICIT",
		rationale: "product name states a named plant protein"
	};
	if (hasAny(name, TOKENS.egg)) return {
		sourceClass: "egg_protein",
		sourceEvidence: "EXPLICIT",
		rationale: "product name states an egg protein"
	};
	if (hasAny(name, TOKENS.skimMilkPowder)) return {
		sourceClass: "skim_milk_powder",
		sourceEvidence: "EXPLICIT",
		rationale: "product name states skimmed milk powder"
	};
	if (hasAny(name, TOKENS.milkPowder)) return {
		sourceClass: "milk_powder",
		sourceEvidence: "EXPLICIT",
		rationale: "product name states a milk powder"
	};
	if (hasAny(name, TOKENS.fermented) && dairy) return {
		sourceClass: "fermented_dairy",
		sourceEvidence: "EXPLICIT",
		rationale: "product name states a fermented dairy product"
	};
	if (ingredient.category === "egg" && protein >= PROTEIN_SOURCE_MIN_PERCENT) return {
		sourceClass: "egg_protein",
		sourceEvidence: "DETERMINISTICALLY_INFERRED",
		rationale: "egg category with protein-source density"
	};
	if (dairy) {
		const powder = composition.water_percent <= POWDER_MAX_WATER_PERCENT;
		if (powder && protein >= CONCENTRATED_PROTEIN_MIN_PERCENT && lactose <= 10) return {
			sourceClass: "mixed_dairy_protein",
			sourceEvidence: "DETERMINISTICALLY_INFERRED",
			rationale: `dry dairy protein fraction (${protein.toFixed(1)} % protein, ${lactose.toFixed(1)} % lactose) whose whey/casein fraction is not derivable from the available evidence`
		};
		if (powder && protein >= MILK_POWDER_MIN_PROTEIN_PERCENT && lactose >= MILK_POWDER_MIN_LACTOSE_PERCENT) return composition.fat_percent >= WHOLE_MILK_POWDER_MIN_FAT_PERCENT ? {
			sourceClass: "milk_powder",
			sourceEvidence: "DETERMINISTICALLY_INFERRED",
			rationale: `dry milk matrix with ${composition.fat_percent.toFixed(1)} % fat — whole milk powder composition`
		} : {
			sourceClass: "skim_milk_powder",
			sourceEvidence: "DETERMINISTICALLY_INFERRED",
			rationale: `dry milk matrix with ${lactose.toFixed(1)} % lactose and ${composition.fat_percent.toFixed(1)} % fat — skimmed milk powder composition`
		};
		if (powder && protein >= PROTEIN_SOURCE_MIN_PERCENT) return {
			sourceClass: "mixed_dairy_protein",
			sourceEvidence: "DETERMINISTICALLY_INFERRED",
			rationale: "dry dairy protein source without a derivable protein fraction"
		};
		if (!powder && protein >= FLUID_DAIRY_MIN_PROTEIN_PERCENT) return {
			sourceClass: "fluid_dairy",
			sourceEvidence: "DETERMINISTICALLY_INFERRED",
			rationale: `fluid dairy base (${composition.water_percent.toFixed(1)} % water) carrying the native milk protein matrix`
		};
		if (protein >= PROTEIN_SOURCE_MIN_PERCENT) return {
			sourceClass: "mixed_dairy_protein",
			sourceEvidence: "DETERMINISTICALLY_INFERRED",
			rationale: "verified dairy protein source without an explicit fraction in its name"
		};
	}
	if (protein >= PROTEIN_SOURCE_MIN_PERCENT) return {
		sourceClass: "unknown",
		sourceEvidence: "UNKNOWN",
		rationale: "protein-dense product with no derivable protein class — baseline behaviour applies"
	};
	return {
		sourceClass: "unknown",
		sourceEvidence: "UNKNOWN",
		rationale: "not a protein source"
	};
}
/**
* Class-level whey:casein only. Bovine milk protein is approximately
* 80 % casein / 20 % whey, so every product that retains the intact milk
* protein matrix (MPC, milk powders, fluid and fermented dairy) inherits that
* split by definition. Whey fractions are whey-only, caseinates and micellar
* casein are casein-only. Anything else returns UNKNOWN rather than a number.
*/
function classifyWheyCasein(sourceClass) {
	switch (sourceClass) {
		case "whey_protein_isolate":
		case "whey_protein_concentrate": return {
			wheyCaseinClass: "whey_dominant",
			wheyCaseinEvidence: "DETERMINISTICALLY_INFERRED",
			caseinSharePercent: 0
		};
		case "micellar_casein":
		case "caseinate": return {
			wheyCaseinClass: "casein_dominant",
			wheyCaseinEvidence: "DETERMINISTICALLY_INFERRED",
			caseinSharePercent: 100
		};
		case "milk_protein_concentrate":
		case "skim_milk_powder":
		case "milk_powder":
		case "fluid_dairy":
		case "fermented_dairy": return {
			wheyCaseinClass: "mixed_milk_protein",
			wheyCaseinEvidence: "DETERMINISTICALLY_INFERRED",
			caseinSharePercent: 80
		};
		default: return {
			wheyCaseinClass: "unknown",
			wheyCaseinEvidence: "UNKNOWN",
			caseinSharePercent: null
		};
	}
}
function classifyForm(sourceClass, proteinPercent) {
	switch (sourceClass) {
		case "whey_protein_isolate": return "isolate";
		case "whey_protein_concentrate": return proteinPercent >= ISOLATE_MIN_PROTEIN_PERCENT ? "isolate" : "concentrate";
		case "milk_protein_concentrate":
		case "micellar_casein":
		case "caseinate": return proteinPercent >= ISOLATE_MIN_PROTEIN_PERCENT ? "isolate" : "concentrate";
		case "skim_milk_powder":
		case "milk_powder":
		case "fluid_dairy":
		case "fermented_dairy": return "whole_matrix";
		case "plant_protein":
		case "egg_protein": return proteinPercent >= ISOLATE_MIN_PROTEIN_PERCENT ? "isolate" : "concentrate";
		default: return "unknown";
	}
}
/** Pure, deterministic, non-mutating. Same ingredient in, same behaviour out. */
function deriveProteinBehavior(ingredient) {
	const composition = ingredient.composition;
	const proteinPercent = composition.protein_percent;
	const decision = classifySource(ingredient);
	const wheyCasein = classifyWheyCasein(decision.sourceClass);
	return {
		sourceClass: decision.sourceClass,
		sourceEvidence: decision.sourceEvidence,
		wheyCaseinClass: wheyCasein.wheyCaseinClass,
		wheyCaseinEvidence: wheyCasein.wheyCaseinEvidence,
		caseinSharePercent: wheyCasein.caseinSharePercent,
		form: classifyForm(decision.sourceClass, proteinPercent),
		proteinPercent,
		lactosePerProteinGram: proteinPercent > 0 ? composition.lactose_percent / proteinPercent : null,
		fatPerProteinGram: proteinPercent > 0 ? composition.fat_percent / proteinPercent : null,
		isProteinContributor: proteinPercent > 0,
		rationale: decision.rationale
	};
}
/**
* Aggregate the derived behaviour of an executable recipe. Weighting is by
* PROTEIN GRAMS DELIVERED, not by line mass — a 2 g line of isolate and a
* 400 g line of milk are compared on what they actually contribute.
*/
function recipeProteinSourceProfile(items) {
	const byClass = /* @__PURE__ */ new Map();
	let totalProteinG = 0;
	let unknownProteinG = 0;
	let caseinWeightedG = 0;
	let caseinKnownProteinG = 0;
	for (const item of items) {
		if (item.grams <= 0) continue;
		const behavior = deriveProteinBehavior(item.ingredient);
		const proteinG = item.grams * behavior.proteinPercent / 100;
		if (proteinG <= 0) continue;
		totalProteinG += proteinG;
		byClass.set(behavior.sourceClass, (byClass.get(behavior.sourceClass) ?? 0) + proteinG);
		if (behavior.sourceClass === "unknown") unknownProteinG += proteinG;
		if (behavior.caseinSharePercent !== null) {
			caseinWeightedG += proteinG * behavior.caseinSharePercent / 100;
			caseinKnownProteinG += proteinG;
		}
	}
	let dominantClass = null;
	let dominantGrams = 0;
	for (const key of [...byClass.keys()].sort()) {
		const grams = byClass.get(key);
		if (grams > dominantGrams + 1e-9) {
			dominantGrams = grams;
			dominantClass = key;
		}
	}
	const caseinSharePercent = caseinKnownProteinG > 0 ? caseinWeightedG / caseinKnownProteinG * 100 : null;
	const wheyCaseinClass = caseinSharePercent === null ? "unknown" : caseinSharePercent >= 65 ? "casein_dominant" : caseinSharePercent <= 35 ? "whey_dominant" : "mixed_milk_protein";
	return {
		classifiedProteinG: totalProteinG - unknownProteinG,
		unknownProteinG,
		totalProteinG,
		dominantClass,
		dominantShare: totalProteinG > 0 ? dominantGrams / totalProteinG * 100 : 0,
		caseinSharePercent,
		wheyCaseinClass,
		fullyClassified: totalProteinG > 0 && unknownProteinG <= 1e-9,
		byClass
	};
}

//#endregion
//#region src/features/protein-gelato/proteinStructureQuality.ts
/**
* PINGÜINO — Protein structural quality (Protein Engine v2, QUALITY authority).
*
* NOTHING IN THIS FILE CAN INVALIDATE A RECIPE. It produces a 1-10 structural
* quality score, a set of Polish warnings and a deterministic tie-break signal.
* Hard safety stays entirely with the unchanged Base Engine bands, and the only
* Protein-specific hard rule stays in proteinQualification.ts.
*
* THE CENTRAL FINDING THIS LAYER ENCODES
* --------------------------------------
* Every controlled dataset points the same way: in a frozen dessert, protein
* above what the product needs is structurally EXPENSIVE, never free.
*
*   AFR 2022, Table 1 (10 % fat, 15 % sugar, WPI, constant dasher speed):
*     4 % protein -> overrun 94.9 %   hardness 13.60 N   melting 0.26 g/min
*     6 % protein -> overrun 60.5 %                      melting 0.24 g/min
*     8 % protein -> overrun 44.3 %                      melting 0.54 g/min
*    10 % protein -> overrun 33.9 %   hardness 47.66 N   melting 0.74 g/min
*
*   The authors' own statistics: 6 % was NOT significantly different from the
*   4 % control for hardness, body-and-texture or meltdown. 8 % and 10 % were
*   significantly worse on all of them and also lost flavour score.
*
* There is no protein level in any of the cited work at which MORE protein made
* a better frozen dessert. So the quality model never rewards protein. It
* measures protein bought BEYOND the claim requirement and charges for it,
* which is exactly the owner's product philosophy: the Engine should find the
* best legal Protein recipe, not the highest possible protein number.
*/
const NOT_APPLICABLE = {
	applicable: false,
	score: null,
	overrunProxyPercent: null,
	penalties: {
		proteinExcess: 0,
		beyondEvidence: 0,
		lactoseLoad: 0
	},
	beyondControlledEvidence: false,
	sourceProfile: null,
	warnings: []
};
/**
* One quality point per this many percentage points of protein bought above the
* claim requirement.
*
* PROVENANCE, not a preference: AFR 2022 measured its series in exactly 2 pp
* steps (4 -> 6 -> 8 -> 10 %) and every step from 6 % upward produced a further
* statistically significant loss of overrun and of sensory body-and-texture.
* 2 pp is therefore the smallest protein increment the literature demonstrates
* a real structural cost for.
*/
const PROTEIN_EXCESS_PENALTY_STEP_PP = 2;
/** Ceiling on the excess penalty so a single dimension can never zero a score. */
const MAX_EXCESS_PENALTY = 6;
/** Flat charge for leaving the controlled-evidence window entirely. */
const BEYOND_EVIDENCE_PENALTY = 1;
/** Lactose above the approved sanding band, per this many pp, capped. */
const LACTOSE_PENALTY_STEP_PP = 3;
const MAX_LACTOSE_PENALTY = 2;
/**
* Overrun the AFR 2022 series measured at `proteinPercent`, by piecewise-linear
* interpolation between the four measured points. Outside the measured range it
* holds the end value rather than extrapolating a number nobody measured.
*
* PRESENTATION AND RANKING ONLY. This is one buffalo-milk WPI system on one
* batch freezer; it is not a prediction of a Gellatti batch's overrun and is
* never compared against a band.
*/
function overrunProxyAtProteinPercent(proteinPercent) {
	const series = PROTEIN_CONCENTRATION_EVIDENCE.series;
	const first = series[0];
	const last = series[series.length - 1];
	if (proteinPercent <= first.proteinPercent) return first.overrunPercent;
	if (proteinPercent >= last.proteinPercent) return last.overrunPercent;
	for (let index = 1; index < series.length; index += 1) {
		const low = series[index - 1];
		const high = series[index];
		if (proteinPercent <= high.proteinPercent) {
			const span = high.proteinPercent - low.proteinPercent;
			const ratio = span === 0 ? 0 : (proteinPercent - low.proteinPercent) / span;
			return low.overrunPercent + ratio * (high.overrunPercent - low.overrunPercent);
		}
	}
	return last.overrunPercent;
}
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
function assessProteinStructure(input, result = calculateRecipe(input), qualification = assessProteinQualification(input, result)) {
	if (!qualification.applicable) return NOT_APPLICABLE;
	const warnings = [];
	const proteinPercent = result.percentages.protein_percent;
	const fatPercent = result.percentages.fat_percent;
	const lactosePercent = result.percentages.lactose_percent;
	const sourceProfile = recipeProteinSourceProfile(result.items.map((item) => ({
		ingredient: item.ingredient,
		grams: item.effective_grams
	})));
	const excessPp = qualification.excessPp ?? 0;
	const proteinExcess = clamp(Math.floor(Math.max(0, excessPp) / 2), 0, MAX_EXCESS_PENALTY);
	if (proteinExcess > 0) warnings.push({
		code: "protein_excess_over_claim",
		scored: true,
		messagePl: `Receptura ma ${proteinPercent.toFixed(1)}% białka, a do deklaracji „wysoka zawartość białka” wystarcza ${(qualification.requiredPercent ?? 0).toFixed(1)}%. Nadmiar ${excessPp.toFixed(1)} pp nie poprawia produktu — w badaniach obniża napowietrzenie i zwiększa twardość.`
	});
	const beyondControlledEvidence = proteinPercent > PROTEIN_EVIDENCE_WINDOW.evidenceCeilingPercent + 1e-9;
	const beyondEvidence = beyondControlledEvidence ? BEYOND_EVIDENCE_PENALTY : 0;
	if (beyondControlledEvidence) warnings.push({
		code: "protein_beyond_controlled_evidence",
		scored: true,
		messagePl: `${proteinPercent.toFixed(1)}% białka wykracza poza wszystkie kontrolowane badania mrożonych deserów (maksimum ${PROTEIN_EVIDENCE_WINDOW.evidenceCeilingPercent}%). Zachowanie struktury w tym zakresie nie jest zweryfikowane.`
	});
	const lactoseOver = Math.max(0, lactosePercent - PROTEIN_LACTOSE_QUALITY.approvedSandingRiskMaxPercent);
	const lactoseLoad = lactoseOver > 1e-9 ? clamp(1 + Math.floor(lactoseOver / LACTOSE_PENALTY_STEP_PP), 1, MAX_LACTOSE_PENALTY) : 0;
	if (lactoseLoad > 0) warnings.push({
		code: "lactose_load_over_approved_sanding_band",
		scored: true,
		messagePl: `Laktoza ${lactosePercent.toFixed(1)}% przekracza zatwierdzony zakres ryzyka piaszczystości (maks. ${PROTEIN_LACTOSE_QUALITY.approvedSandingRiskMaxPercent}%). Źródło białka wnosi dużo laktozy — źródło o wyższej czystości dostarczy to samo białko przy mniejszym ryzyku.`
	});
	if (fatPercent < PROTEIN_FAT_EVIDENCE_ENVELOPE.fatFloorPercent || fatPercent > PROTEIN_FAT_EVIDENCE_ENVELOPE.fatCeilingPercent) warnings.push({
		code: "fat_outside_evidence_envelope",
		scored: false,
		messagePl: `Tłuszcz ${fatPercent.toFixed(1)}% leży poza oknem ${PROTEIN_FAT_EVIDENCE_ENVELOPE.fatFloorPercent}-${PROTEIN_FAT_EVIDENCE_ENVELOPE.fatCeilingPercent}%, w którym badano receptury wysokobiałkowe. Twarde granice bezpieczeństwa obliczeń pozostają nadrzędne.`
	});
	const proteinToFat = fatPercent > 0 ? proteinPercent / fatPercent : null;
	if (proteinToFat !== null && (proteinToFat < PROTEIN_FAT_EVIDENCE_ENVELOPE.proteinToFatFloor || proteinToFat > PROTEIN_FAT_EVIDENCE_ENVELOPE.proteinToFatCeiling)) warnings.push({
		code: "protein_to_fat_outside_evidence_envelope",
		scored: false,
		messagePl: `Stosunek białko:tłuszcz ${proteinToFat.toFixed(2)} leży poza zakresem badanych receptur (${PROTEIN_FAT_EVIDENCE_ENVELOPE.proteinToFatFloor}-${PROTEIN_FAT_EVIDENCE_ENVELOPE.proteinToFatCeiling}). Brak kontrolowanej serii białko:tłuszcz, więc jest to wyłącznie informacja.`
	});
	if (sourceProfile.wheyCaseinClass === "whey_dominant" && proteinPercent > 6) warnings.push({
		code: "whey_dominant_aeration_risk",
		scored: false,
		messagePl: "Białko pochodzi głównie z serwatki. Przy tym poziomie białka badania notują niższe napowietrzenie i twardszą strukturę niż dla białka kazeinowego."
	});
	if (sourceProfile.wheyCaseinClass === "casein_dominant" && proteinPercent > 6) warnings.push({
		code: "casein_dominant_ice_coarsening_risk",
		scored: false,
		messagePl: "Białko pochodzi głównie z kazeiny. Badania notują lepsze napowietrzenie, ale grubsze kryształy lodu niż dla izolatu serwatkowego."
	});
	if (!sourceProfile.fullyClassified && sourceProfile.totalProteinG > 0) warnings.push({
		code: "protein_source_class_unknown",
		scored: false,
		messagePl: "Część białka pochodzi ze źródła bez rozpoznanej klasy. Receptura pozostaje w pełni ważna — ocena strukturalna korzysta wtedy z zachowania bazowego."
	});
	return {
		applicable: true,
		score: clamp(10 - (proteinExcess + beyondEvidence + lactoseLoad), 1, 10),
		overrunProxyPercent: overrunProxyAtProteinPercent(proteinPercent),
		penalties: {
			proteinExcess,
			beyondEvidence,
			lactoseLoad
		},
		beyondControlledEvidence,
		sourceProfile,
		warnings
	};
}

//#endregion
//#region src/features/protein-gelato/proteinAuthority.ts
/**
* PINGÜINO — Protein Engine v2 authority seam.
*
* OWNER DECISION IMPLEMENTED HERE (binding): the user never selects a protein
* percentage. Protein % is an OUTPUT of the formulation. The Engine looks for
* the best legal Protein recipe and reports what protein that recipe actually
* contains.
*
* The optimizer objective changed accordingly:
*
*   v1  minimise |actual protein - 20 % by mass|   (no provenance, monotone
*       "more protein is better" up to the target, score 10 only on the target)
*
*   v2  among hard-safe candidates that EARN the EU HIGH PROTEIN claim, take
*       the one with the best measured structural quality; break ties toward
*       LESS protein, because no controlled dataset shows more protein
*       improving a frozen dessert.
*
* Nothing here changes Base Engine science. Every candidate is still validated
* by the unchanged native Engine, Main and locks are never variables, and the
* Mapper base is untouched.
*/
const hardSafeResult = (result) => detectViolations(result).length === 0 && !result.warnings.some((warning) => warning.severity === "critical");
function assessProteinFormulation(input, result = calculateRecipe(input)) {
	const qualification = assessProteinQualification(input, result);
	const hardSafe = hardSafeResult(result);
	if (!qualification.applicable) return {
		applicable: false,
		actualPercent: null,
		qualification,
		structure: assessProteinStructure(input, result, qualification),
		hardSafe,
		score: null
	};
	const structure = assessProteinStructure(input, result, qualification);
	const score = !hardSafe ? Math.min(9, Math.max(1, Math.round((result.scores?.technical ?? 10) / 10))) : qualification.qualified ? structure.score ?? 10 : Math.min(5, structure.score ?? 5);
	return {
		applicable: true,
		actualPercent: qualification.actualPercent,
		qualification,
		structure,
		hardSafe,
		score
	};
}
/** Ladder resolution, pp. */
const PROTEIN_LADDER_STEP_PP = .5;
/**
* The lowest rung must CLEAR the qualification requirement, not sit on it.
*
* Two effects conspire at the boundary. The exact solver returns the closest
* hard-safe candidate rather than the requested percentage exactly — its
* residual is bounded by whole-gram granularity, roughly 0.06-0.08 pp for a
* 60-80 % protein source in a 1 kg batch. And the requirement itself RISES as
* protein rises, because protein adds energy to its own denominator. A rung
* placed exactly at the requirement can therefore settle a hundredth of a point
* low and lose the claim: a measured case landed at 8.489 % protein against a
* requirement of 8.4896 %, i.e. an energy share of 19.9988 %.
*
* Half a ladder step is comfortably above the solver residual and still far
* inside the controlled-evidence window.
*/
const PROTEIN_QUALIFICATION_MARGIN_PP = PROTEIN_LADDER_STEP_PP / 2;
/**
* Canonical public score seam for a concrete RecipeInput. Non-Protein behaviour
* is byte-for-byte the existing technical-fit adapter.
*
* For Protein the score is the QUALITY of the formulation — never its protein
* number. A recipe with more protein can, and routinely does, score lower.
*/
function recipeFitForInput(input, result = calculateRecipe(input)) {
	const base = recipeTechnicalFit(result);
	const direction = assessRecipeDirection(input, result);
	const protein = assessProteinFormulation(input, result);
	if (base.score === null) return base;
	if (!protein.applicable && direction.score === null) return base;
	const score = Math.min(base.score, direction.score ?? 10, protein.applicable && protein.score !== null ? protein.score : 10);
	const label = MATCH_SCORE_LABELS[score];
	const directionAria = direction.active ? ` Kierunek receptury: ${direction.reachedAxisCount} z ${direction.supportedAxisCount} obsługiwanych osi w celu.` : "";
	const proteinAria = protein.applicable ? ` Białko ${protein.actualPercent?.toFixed(1)}% masy, ${protein.qualification.energySharePercent?.toFixed(0)}% energii.` : "";
	return {
		...base,
		score,
		label,
		display: `${score}/10`,
		ariaText: `Dopasowanie receptury: ${score} na 10 — ${label}.${directionAria}${proteinAria}`,
		validatedNative: base.validatedNative && (!protein.applicable || protein.qualification.qualified)
	};
}

//#endregion
//#region src/features/recipe-constraints/recipeConstraintAuthority.ts
/**
* One exact-candidate hard gate. It composes existing Engine bands, profile
* rules and immutable ProductBehavior/Main authorities without copying a
* scientific constant. Solver code may use the same underlying bounds early;
* this independent final evaluation is the terminal truth for the vector.
*/
function evaluateRecipeConstraintAuthority(input) {
	const { recipe } = input;
	const snapshots = input.snapshots ?? {};
	const requireProductBehavior = input.requireProductBehavior ?? true;
	const result = calculateRecipe(recipe);
	const issues = [];
	const plannedTotal = recipe.items.reduce((sum, item) => sum + item.planned_grams, 0);
	if (Math.abs(plannedTotal - recipe.target_batch_grams) > .1) issues.push({
		source: "batch",
		code: "batch_total_mismatch",
		lineIds: recipe.items.map((item) => item.id),
		messagePl: `Suma receptury ${plannedTotal.toFixed(1)} g nie odpowiada partii ${recipe.target_batch_grams.toFixed(1)} g.`
	});
	const native = classifyViolationBands(recipe);
	for (const metric of native.hardMetrics) issues.push({
		source: "engine",
		code: "native_band_violation",
		lineIds: recipe.items.map((item) => item.id),
		metric,
		messagePl: `Parametr ${metric} jest poza zatwierdzonym zakresem profilu.`
	});
	for (const warning of result.warnings.filter((entry) => entry.severity === "critical")) issues.push({
		source: "engine",
		code: "critical_warning",
		lineIds: recipe.items.map((item) => item.id),
		metric: warning.code,
		messagePl: `Krytyczne ostrzeżenie Engine: ${warning.code}.`
	});
	if (recipe.category === "vegan_gelato") {
		const eligibility = veganRecipeEligibilityIssues(recipe.items);
		if (eligibility.length > 0) issues.push({
			source: "profile",
			code: "vegan_ingredient_invalid",
			lineIds: eligibility.map((issue) => issue.lineId),
			messagePl: "Profil Wegański zawiera składniki bez zatwierdzonej zgodności Vegan: " + eligibility.map((issue) => issue.ingredientName).join(", ")
		});
		const profile = veganProfileConstraintIssues(recipe);
		if (profile.length > 0) issues.push({
			source: "profile",
			code: "vegan_profile_invalid",
			lineIds: profile.flatMap((issue) => issue.lineId ? [issue.lineId] : []),
			messagePl: "Receptura przekracza zatwierdzoną kopertę profilu Wegańskiego."
		});
	}
	const protein = assessProteinFormulation(recipe, result);
	if (protein.applicable && !protein.qualification.qualified) issues.push({
		source: "profile",
		code: "protein_claim_unmet",
		lineIds: recipe.items.map((item) => item.id),
		messagePl: `Profil Protein wymaga deklaracji „wysoka zawartość białka” (min. 20% energii z białka); kandydat ma ${protein.qualification.energySharePercent?.toFixed(0)}% energii z białka przy ${protein.actualPercent?.toFixed(1)}% białka w masie.`
	});
	const stabilizerSystem = assessGelatoStabilizerSystem(recipe);
	const sorbetStabilizerSystem = assessSorbetStabilizerSystem(recipe);
	const stabilizerIssues = [...stabilizerSystem.issues, ...sorbetStabilizerSystem.issues].filter((issue) => input.module !== "BATCH_RESCUE" || issue.code !== "component_not_whole_grams");
	issues.push(...stabilizerIssues.map((issue) => ({
		source: "owner_policy",
		code: issue.code,
		lineIds: issue.lineIds,
		messagePl: issue.messagePl
	})));
	const requiredLineIds = productBehaviorRequiredLineIds({ items: recipe.items });
	if (requireProductBehavior && requiredLineIds.length > 0) {
		const technicalOnlyMainLineIds = new Set(input.technicalOnlyMainLineIds ?? []);
		const userHeldMain = new Set(userHeldMainLineIds({
			items: recipe.items,
			snapshots,
			excludeLineIds: [...technicalOnlyMainLineIds]
		}));
		const sensoryMainLineIds = new Set(recipe.items.filter((item) => item.lock_type === "main" && !technicalOnlyMainLineIds.has(item.id) && !userHeldMain.has(item.id)).map((item) => item.id));
		const behavior = productBehaviorModuleGate(snapshots, input.module ?? (normalizeFormulationStrategy(recipe.goals?.formulation_strategy ?? recipe.mode) === "eco" ? "ECO" : "OPTIMAL"), requiredLineIds);
		if (!behavior.ready) issues.push({
			source: "product_behavior",
			code: "product_behavior_invalid",
			lineIds: behavior.blockedLineIds,
			messagePl: behavior.reason ?? "Brak aktualnego ProductBehavior dla receptury."
		});
		for (const lineId of requiredLineIds) {
			if (!sensoryMainLineIds.has(lineId)) continue;
			const snapshot = snapshots[lineId];
			if (!snapshot || snapshot.resolutionState !== "RESOLVED") continue;
			const eligible = snapshot.sharedFacts?.profileEligibility;
			if (!Array.isArray(eligible)) issues.push({
				source: "profile",
				code: "profile_evidence_missing",
				lineIds: [lineId],
				messagePl: "Brak zamrożonej zgodności produktu z wybranym profilem."
			});
			else if (!eligible.includes(recipe.category)) issues.push({
				source: "profile",
				code: "profile_not_eligible",
				lineIds: [lineId],
				messagePl: "Produkt nie jest zatwierdzony dla wybranego profilu receptury."
			});
		}
		if (behavior.ready) {
			const main = verifyMainEnvelope({
				recipe,
				snapshots,
				mode: normalizeFormulationStrategy(recipe.goals?.formulation_strategy ?? recipe.mode),
				enforceFloor: input.enforceMainFloor,
				technicalOnlyMainLineIds: input.technicalOnlyMainLineIds
			});
			if (!main.ok) issues.push(...main.violations.map((violation) => ({
				source: "main",
				code: violation.code,
				lineIds: violation.lineIds,
				messagePl: violation.messagePl
			})));
		}
	}
	return {
		valid: issues.length === 0,
		result,
		issues
	};
}

//#endregion
//#region src/features/practical-recipe/practicalRecipe.ts
const PRACTICAL_RECIPE_MODEL_VERSION = "pro-whole-gram-v1";
const INTEGER_EPSILON = 1e-9;
const MAX_MAIN_COMBINATIONS = 4096;
const MAX_HARD_GATE_REPAIR_ROUNDS = 12;
const cloneInput = (input) => ({
	...input,
	goals: input.goals === void 0 ? void 0 : structuredClone(input.goals),
	items: input.items.map((item) => ({
		...item,
		ingredient: item.ingredient,
		percent_constraint: item.percent_constraint === void 0 ? void 0 : { ...item.percent_constraint },
		grams_constraint: item.grams_constraint === void 0 ? void 0 : { ...item.grams_constraint }
	}))
});
const totalPlanned = (input) => input.items.reduce((sum, item) => sum + item.planned_grams, 0);
const isWholeGram = (value) => Number.isFinite(value) && Math.abs(value - Math.round(value)) <= INTEGER_EPSILON;
const block = (exactInput, exactResult, exactHardMetrics, code, lineIds, messagePl, attemptedInput, executableHardMetrics = []) => ({
	ok: false,
	code,
	lineIds,
	messagePl,
	exactInput,
	exactResult,
	attemptedInput,
	exactHardMetrics,
	executableHardMetrics
});
const constraintFor = (set, lineId) => set.byLineId[lineId];
const percentFor = (input, set, item) => {
	const constraint = constraintFor(set, item.id);
	if (constraint?.mode === "percent") return constraint.percent;
	if (item.percent_constraint !== void 0) return item.percent_constraint.percent;
	if (constraint === void 0 && item.lock_type === "percent" && input.target_batch_grams > 0) return item.planned_grams / input.target_batch_grams * 100;
	return null;
};
const exactGramsLockFor = (set, item) => {
	const constraint = set.byLineId[item.id];
	if (constraint?.mode === "locked") return constraint.grams;
	if (item.grams_constraint !== void 0) return item.grams_constraint.grams;
	if (constraint === void 0 && item.lock_type === "grams") return item.planned_grams;
	if (item.lock_type === "required") return item.planned_grams;
	return null;
};
const rangeFor = (set, item) => {
	const constraint = set.byLineId[item.id];
	if (constraint?.mode === "range") return {
		minGrams: constraint.minGrams,
		maxGrams: constraint.maxGrams
	};
	if (item.range_constraint !== void 0) return {
		minGrams: item.range_constraint.min_grams,
		maxGrams: item.range_constraint.max_grams
	};
	return null;
};
const unavailableCanonicalIds = (input) => new Set([...input.goals?.excluded_ingredient_ids ?? [], ...input.goals?.unavailable_main_ingredient_ids ?? []]);
function protectionFor(input, set, item) {
	if (item.actual_grams !== null || item.lock_type === "already_added") return "physical";
	if (exactGramsLockFor(set, item) !== null) return "grams_lock";
	if (percentFor(input, set, item) !== null) return "percent_lock";
	if (item.lock_type === "main") return "main";
	if (isTemplateControlledStabilizer(item.ingredient)) return "stabilizer";
	if (unavailableCanonicalIds(input).has(canonicalIngredientId(item.ingredient))) return "unavailable";
	if (item.lock_type === "required") return "required";
	if (set.byLineId[item.id]?.mode === "range") return "range";
	return "editable";
}
/**
* Owner zero-gram executable invariant (2026-08-22). A recipe line is
* "optional" when it is an unlocked Standard line with no physical mass, no
* gram/percent/range contract and no Main/required role (an unavailable/excluded Standard line counts as optional:
* driven to 0 g it is simply not used, and its exclusion record lives in the
* recipe goals, not in the row). A 0 g stabilizer line is equally unused: a
* required profile must first gain a positive approved stabilizer elsewhere,
* while an optional profile simply omits it. When the Engine resolves such a
* line to exactly 0 g, the executable recipe OMITS the row: "not used" is the
* absence of the ingredient, never an explicit 0 g ingredient row. Every
* protected line keeps its contract; any protected 0 g row is refused below.
*/
const isOmittableUnusedLine = (input, set, item) => item.actual_grams === null && item.lock_type === "unlocked" && exactGramsLockFor(set, item) === null && percentFor(input, set, item) === null && rangeFor(set, item) === null;
/** Line ids of optional lines that currently weigh exactly 0 g. */
const unusedZeroGramLineIds = (input, set) => input.items.filter((item) => item.planned_grams === 0 && isOmittableUnusedLine(input, set, item)).map((item) => item.id);
function mainIntegerCandidates(exactInput, rounded, set) {
	const mainIndexes = exactInput.items.map((item, index) => ({
		item,
		index
	})).filter(({ item }) => item.lock_type === "main" && item.planned_grams > 0);
	if (mainIndexes.length <= 1) return rounded;
	const candidateValues = mainIndexes.map(({ item, index }) => {
		const alreadyFixed = rounded.items[index].planned_grams;
		if (item.actual_grams !== null || item.grams_constraint !== void 0 || item.percent_constraint !== void 0) return [alreadyFixed];
		return [...new Set([
			Math.round(item.planned_grams),
			Math.floor(item.planned_grams),
			Math.ceil(item.planned_grams)
		])].filter((value) => value > 0);
	});
	let explored = 0;
	let bestInput = null;
	let bestError = Number.POSITIVE_INFINITY;
	let bestOrder = "";
	const chosen = [];
	const visit = (depth) => {
		if (explored >= MAX_MAIN_COMBINATIONS) return;
		if (depth < candidateValues.length) {
			for (const value of candidateValues[depth]) {
				chosen.push(value);
				visit(depth + 1);
				chosen.pop();
			}
			return;
		}
		explored += 1;
		const candidate = cloneInput(rounded);
		mainIndexes.forEach(({ index }, position) => {
			candidate.items[index] = {
				...candidate.items[index],
				planned_grams: chosen[position]
			};
		});
		if (!verifyMainIngredientIdentity(exactInput, candidate, set.byLineId).ok) return;
		const error = mainIndexes.reduce((sum, { item }, position) => sum + Math.abs(chosen[position] - item.planned_grams), 0);
		const order = chosen.join("|");
		if (bestInput === null || error < bestError - INTEGER_EPSILON || Math.abs(error - bestError) <= INTEGER_EPSILON && order < bestOrder) {
			bestInput = candidate;
			bestError = error;
			bestOrder = order;
		}
	};
	visit(0);
	return bestInput;
}
function reconcileResidual(exactInput, roundedInput, set, nonIncreasableLineIds) {
	const residualBefore = Math.round(exactInput.target_batch_grams) - totalPlanned(roundedInput);
	if (Math.abs(residualBefore) <= INTEGER_EPSILON) return {
		input: roundedInput,
		adjustedLineIds: /* @__PURE__ */ new Set(),
		residualBefore: 0
	};
	const direction = residualBefore > 0 ? 1 : -1;
	const unavailable = unavailableCanonicalIds(exactInput);
	const flavourHeld = nonIncreasableLineIds;
	const candidates = exactInput.items.map((item, index) => ({
		item,
		index,
		practical: roundedInput.items[index]
	})).filter(({ item, practical }) => {
		if (item.actual_grams !== null || item.lock_type !== "unlocked") return false;
		if (set.byLineId[item.id] !== void 0) return false;
		if (direction > 0 && flavourHeld.has(item.id)) return false;
		if (item.percent_constraint !== void 0 || item.grams_constraint !== void 0) return false;
		if (isTemplateControlledStabilizer(item.ingredient)) return false;
		if (unavailable.has(canonicalIngredientId(item.ingredient))) return false;
		if (direction < 0 && practical.planned_grams <= 0) return false;
		if (direction < 0 && (item.user_intent_anchor_grams ?? 0) > 0 && practical.planned_grams <= 1) return false;
		return true;
	}).map(({ item, index, practical }) => ({
		item,
		index,
		practical,
		errorCost: Math.abs(practical.planned_grams + direction - item.planned_grams) - Math.abs(practical.planned_grams - item.planned_grams)
	})).sort((a, b) => a.errorCost - b.errorCost || a.index - b.index);
	const requiredAdjustments = Math.abs(Math.round(residualBefore));
	if (requiredAdjustments > candidates.length) return null;
	const input = cloneInput(roundedInput);
	const adjustedLineIds = /* @__PURE__ */ new Set();
	for (let index = 0; index < requiredAdjustments; index += 1) {
		const candidate = candidates[index];
		const current = input.items[candidate.index];
		input.items[candidate.index] = {
			...current,
			planned_grams: current.planned_grams + direction
		};
		adjustedLineIds.add(candidate.item.id);
	}
	return {
		input,
		adjustedLineIds,
		residualBefore
	};
}
const wholeGramTransferEligible = (input, set, item) => protectionFor(input, set, item) === "editable";
const hardGateMeasure = (input) => {
	const metrics = classifyViolationBands(input).hardMetrics;
	const metricSet = new Set(metrics);
	const severity = detectViolations(calculateRecipe(input)).filter((violation) => metricSet.has(violation.metric)).reduce((sum, violation) => sum + violation.severity_points, 0);
	return {
		metrics,
		count: metrics.length,
		severity
	};
};
const measureIsBetter = (candidate, current) => candidate.count < current.count || candidate.count === current.count && candidate.severity < current.severity - INTEGER_EPSILON;
/**
* Nearest integer rounding can place a value a fraction beyond a native band.
* Search only paired 1 g transfers between ordinary editable lines, preserving
* the exact batch and every stronger contract. Every candidate is evaluated by
* the frozen Engine; there are no replicated formulas or inferred gradients.
*/
function repairIntroducedHardGate(exactInput, initial, set, exactHardMetrics) {
	let working = cloneInput(initial);
	let measure = hardGateMeasure(working);
	const introduced = () => measure.metrics.filter((metric) => !exactHardMetrics.includes(metric));
	if (introduced().length === 0) return working;
	const eligibleIndexes = exactInput.items.map((item, index) => ({
		item,
		index
	})).filter(({ item }) => wholeGramTransferEligible(exactInput, set, item)).map(({ index }) => index);
	const visited = /* @__PURE__ */ new Set();
	for (let round = 0; round < MAX_HARD_GATE_REPAIR_ROUNDS; round += 1) {
		const key = working.items.map((item) => item.planned_grams).join("|");
		visited.add(key);
		let best = null;
		for (const donorIndex of eligibleIndexes) {
			if (working.items[donorIndex].planned_grams < 1) continue;
			if ((exactInput.items[donorIndex].user_intent_anchor_grams ?? 0) > 0 && working.items[donorIndex].planned_grams <= 1) continue;
			for (const receiverIndex of eligibleIndexes) {
				if (receiverIndex === donorIndex) continue;
				const candidate = cloneInput(working);
				candidate.items[donorIndex] = {
					...candidate.items[donorIndex],
					planned_grams: candidate.items[donorIndex].planned_grams - 1
				};
				candidate.items[receiverIndex] = {
					...candidate.items[receiverIndex],
					planned_grams: candidate.items[receiverIndex].planned_grams + 1
				};
				const candidateKey = candidate.items.map((item) => item.planned_grams).join("|");
				if (visited.has(candidateKey)) continue;
				const candidateMeasure = hardGateMeasure(candidate);
				if (!measureIsBetter(candidateMeasure, measure)) continue;
				const cost = candidate.items.reduce((sum, item, index) => sum + Math.abs(item.planned_grams - exactInput.items[index].planned_grams), 0);
				const order = `${donorIndex}|${receiverIndex}`;
				if (best === null || candidateMeasure.count < best.measure.count || candidateMeasure.count === best.measure.count && (candidateMeasure.severity < best.measure.severity - INTEGER_EPSILON || Math.abs(candidateMeasure.severity - best.measure.severity) <= INTEGER_EPSILON && (cost < best.cost - INTEGER_EPSILON || Math.abs(cost - best.cost) <= INTEGER_EPSILON && order < best.order))) best = {
					input: candidate,
					measure: candidateMeasure,
					cost,
					order
				};
			}
		}
		if (best === null) return null;
		working = best.input;
		measure = best.measure;
		if (introduced().length === 0) return working;
	}
	return null;
}
/**
* Convert one already-computed exact Pro candidate into the physical whole-gram
* recipe that will actually be weighed. This is product orchestration only:
* the frozen Engine is called before and after, and remains the sole source of
* every scientific metric and hard-band verdict.
*/
function practicalizeRecipeCandidate(exactInput, set, nonIncreasableLineIds = /* @__PURE__ */ new Set(), terminalAuthorityTargetBatchGrams = exactInput.target_batch_grams) {
	const exact = cloneInput(exactInput);
	const exactResult = calculateRecipe(exact);
	const exactHardMetrics = classifyViolationBands(exact).hardMetrics;
	if (!isWholeGram(exact.target_batch_grams)) return block(exact, exactResult, exactHardMetrics, "target_batch_not_whole_gram", [], "Docelowa partia nie jest pełną liczbą gramów. Ustaw pełne gramy partii przed przygotowaniem receptury wykonawczej.");
	const rounded = cloneInput(exact);
	const unavailable = unavailableCanonicalIds(exact);
	for (let index = 0; index < exact.items.length; index += 1) {
		const item = exact.items[index];
		if ((item.actual_grams !== null || item.lock_type === "already_added") && !isWholeGram(item.planned_grams)) return block(exact, exactResult, exactHardMetrics, "physical_mass_not_whole_gram", [item.id], `${item.ingredient.name}: materiał fizycznie dodany nie może zostać zaokrąglony ani przepisany.`);
		const gramsLock = exactGramsLockFor(set, item);
		if (gramsLock !== null) {
			if (!isWholeGram(gramsLock)) return block(exact, exactResult, exactHardMetrics, "exact_gram_lock_not_whole_gram", [item.id], `${item.ingredient.name}: dokładna blokada gramów (${gramsLock} g) nie daje receptury w pełnych gramach.`);
			rounded.items[index] = {
				...rounded.items[index],
				planned_grams: Math.round(gramsLock)
			};
			continue;
		}
		const percent = percentFor(exact, set, item);
		if (percent !== null) {
			const lockedGrams = exact.target_batch_grams * percent / 100;
			if (!isWholeGram(lockedGrams)) return block(exact, exactResult, exactHardMetrics, "percent_lock_not_whole_gram", [item.id], `${item.ingredient.name}: blokada ${percent}% daje ${lockedGrams} g, czego nie można wykonać w pełnych gramach bez złamania udziału.`);
			rounded.items[index] = {
				...rounded.items[index],
				planned_grams: Math.round(lockedGrams)
			};
			continue;
		}
		const range = rangeFor(set, item);
		if (range !== null) {
			const minimumWholeGram = Math.ceil(range.minGrams - INTEGER_EPSILON);
			const maximumWholeGram = Math.floor(range.maxGrams + INTEGER_EPSILON);
			if (minimumWholeGram > maximumWholeGram) return block(exact, exactResult, exactHardMetrics, "constraint_changed", [item.id], `${item.ingredient.name}: zakres ${range.minGrams}–${range.maxGrams} g nie zawiera żadnej wykonalnej pełnej liczby gramów.`, rounded);
			rounded.items[index] = {
				...rounded.items[index],
				planned_grams: Math.min(maximumWholeGram, Math.max(minimumWholeGram, Math.round(item.planned_grams)))
			};
			continue;
		}
		if (unavailable.has(canonicalIngredientId(item.ingredient)) && item.planned_grams > INTEGER_EPSILON) {
			rounded.items[index] = {
				...rounded.items[index],
				planned_grams: Math.round(item.planned_grams)
			};
			continue;
		}
		rounded.items[index] = {
			...rounded.items[index],
			planned_grams: Math.round(item.planned_grams)
		};
	}
	const withMain = mainIntegerCandidates(exact, rounded, set);
	if (withMain === null) return block(exact, exactResult, exactHardMetrics, "main_ratio_not_whole_gram_representable", exact.items.filter((item) => item.lock_type === "main").map((item) => item.id), "Proporcji składników Głównych nie da się zachować w pełnych gramach dla tej partii.", rounded);
	const reconciled = reconcileResidual(exact, withMain, set, nonIncreasableLineIds);
	if (reconciled === null) return block(exact, exactResult, exactHardMetrics, "batch_residual_unresolved", [], "Po zaokrągleniu pozostaje różnica partii, której nie można przypisać bez naruszenia blokad, Main, stabilizatora lub dostępności.", withMain);
	let executable = reconciled.input;
	const constraints = verifyConstraintsPreserved(set, executable);
	if (!constraints.ok) return block(exact, exactResult, exactHardMetrics, "constraint_changed", [...new Set(constraints.violations.map((violation) => violation.lineId))], "Pełne gramy naruszyły blokadę receptury. Gellatti nie zastosowało zaokrąglenia.", executable);
	const main = verifyMainIngredientIdentity(exact, executable, set.byLineId);
	if (!main.ok) return block(exact, exactResult, exactHardMetrics, "main_ratio_not_whole_gram_representable", [...new Set(main.violations.flatMap((violation) => violation.lineIds))], "Pełne gramy zmieniłyby tożsamość lub proporcję składników Głównych.", executable);
	const stabilizerChanged = exact.items.filter((item, index) => {
		if (!isTemplateControlledStabilizer(item.ingredient)) return false;
		return executable.items[index].planned_grams !== Math.round(item.planned_grams);
	});
	if (stabilizerChanged.length > 0) return block(exact, exactResult, exactHardMetrics, "stabilizer_contract_changed", stabilizerChanged.map((item) => item.id), "Stabilizator nie może przejmować różnicy po zaokrągleniu.", executable);
	const unapprovedRoundedStabilizers = exact.items.filter((item, index) => {
		if (!isTemplateControlledStabilizer(item.ingredient)) return false;
		if (Object.is(executable.items[index].planned_grams, item.planned_grams)) return false;
		return approvedStabilizerDosage(canonicalIngredientId(item.ingredient)) === null && approvedStabilizerDosage(item.ingredient.id) === null;
	});
	if (unapprovedRoundedStabilizers.length > 0) return block(exact, exactResult, exactHardMetrics, "stabilizer_contract_changed", unapprovedRoundedStabilizers.map((item) => item.id), "Ten stabilizator nie ma zatwierdzonego zakresu do praktycznego zaokrąglenia. Zachowaliśmy dokładną wartość i zablokowaliśmy wersję wykonawczą.", executable);
	let executableResult = calculateRecipe(executable);
	let executableHardMetrics = classifyViolationBands(executable).hardMetrics;
	let newHardMetrics = executableHardMetrics.filter((metric) => !exactHardMetrics.includes(metric));
	if (newHardMetrics.length > 0) {
		const repaired = repairIntroducedHardGate(exact, executable, set, exactHardMetrics);
		if (repaired !== null) {
			executable = repaired;
			executableResult = calculateRecipe(executable);
			executableHardMetrics = classifyViolationBands(executable).hardMetrics;
			newHardMetrics = executableHardMetrics.filter((metric) => !exactHardMetrics.includes(metric));
		}
	}
	if (newHardMetrics.length > 0) return block(exact, exactResult, exactHardMetrics, "post_rounding_hard_gate", [], `Pełne gramy wprowadzają problem technologiczny: ${newHardMetrics.join(", ")}. Gellatti nie zastosowało tej wersji.`, executable, executableHardMetrics);
	const executableTotalGrams = totalPlanned(executable);
	if (Math.abs(executableTotalGrams - exact.target_batch_grams) > INTEGER_EPSILON) return block(exact, exactResult, exactHardMetrics, "batch_residual_unresolved", [], "Suma pełnych gramów nie zgadza się z docelową partią.", executable, executableHardMetrics);
	const omittedLineIds = new Set(unusedZeroGramLineIds(executable, set));
	const executableInput = omittedLineIds.size === 0 ? executable : {
		...executable,
		items: executable.items.filter((item) => !omittedLineIds.has(item.id))
	};
	const nonPositiveExecutableLines = executableInput.items.filter((item) => !(item.planned_grams > 0));
	if (nonPositiveExecutableLines.length > 0) return block(exact, exactResult, exactHardMetrics, "zero_gram_executable_line", nonPositiveExecutableLines.map((item) => item.id), "Receptura wykonawcza nie może zawierać składnika o ilości 0 g. Usuń nieużywany składnik albo ustaw dodatnią ilość zgodną z jego authority.", executableInput, executableHardMetrics);
	const terminalAuthorityInput = {
		...executableInput,
		target_batch_grams: terminalAuthorityTargetBatchGrams
	};
	const stabilizerProfileIssues = internalStabilizerProfileIssues(terminalAuthorityInput);
	if (stabilizerProfileIssues.length > 0) return block(exact, exactResult, exactHardMetrics, "profile_stabilizer_invalid", stabilizerProfileIssues.flatMap((issue) => issue.lineIds), internalStabilizerProfileMessagePl(stabilizerProfileIssues), executableInput, executableHardMetrics);
	const inulinIssues = ownerInulinPolicyIssues(terminalAuthorityInput);
	if (inulinIssues.length > 0) {
		const issue = inulinIssues[0];
		return block(exact, exactResult, exactHardMetrics, "inulin_outside_owner_policy", issue.lineIds, `Inulina ${issue.grams.toFixed(1)} g jest poza wewnętrznym zakresem Gellatti ${issue.minGrams.toFixed(1)}–${issue.maxGrams.toFixed(1)} g (${OWNER_INULIN_POLICY.minPercent}–${OWNER_INULIN_POLICY.maxPercent}% partii).`, executableInput, executableHardMetrics);
	}
	const executableById = new Map(executable.items.map((item) => [item.id, item]));
	const reconciledById = new Map(reconciled.input.items.map((item) => [item.id, item]));
	return {
		ok: true,
		audit: {
			modelVersion: PRACTICAL_RECIPE_MODEL_VERSION,
			exactInput: exact,
			exactResult,
			executableInput,
			executableResult: omittedLineIds.size === 0 ? executableResult : calculateRecipe(executableInput),
			lines: exact.items.map((item) => {
				const practical = executableById.get(item.id)?.planned_grams ?? 0;
				return {
					lineId: item.id,
					ingredientName: item.ingredient.name,
					exactGrams: item.planned_grams,
					practicalGrams: practical,
					deltaGrams: practical - item.planned_grams,
					residualAdjusted: reconciled.adjustedLineIds.has(item.id) || practical !== (reconciledById.get(item.id)?.planned_grams ?? 0),
					protection: protectionFor(exact, set, item)
				};
			}),
			targetBatchGrams: exact.target_batch_grams,
			exactTotalGrams: totalPlanned(exact),
			executableTotalGrams,
			residualBeforeReconciliationGrams: reconciled.residualBefore,
			residualAfterReconciliationGrams: exact.target_batch_grams - executableTotalGrams,
			exactHardMetrics,
			executableHardMetrics,
			hardGatePassed: executableHardMetrics.length === 0
		}
	};
}

//#endregion
//#region src/features/recipe-composition/finalProduct.ts
const toppingEffectiveGrams = (item, context) => context === "actual_batch" ? item.actual_grams ?? item.planned_grams : item.planned_grams;
function scienceToppingItem(item, context) {
	if (isCatalogLabelToppingIngredient(item.ingredient)) return null;
	const grams = toppingEffectiveGrams(item, context);
	if (grams <= 0) return null;
	return {
		id: item.id,
		ingredient: item.ingredient,
		planned_grams: grams,
		actual_grams: context === "actual_batch" ? grams : null,
		lock_type: context === "actual_batch" ? "already_added" : "unlocked",
		production_step: item.production_step,
		notes: item.notes
	};
}
function labelToppingItem(item, context) {
	if (!isCatalogLabelToppingIngredient(item.ingredient)) return null;
	const grams = toppingEffectiveGrams(item, context);
	if (grams <= 0) return null;
	return {
		id: item.id,
		ingredient: item.ingredient,
		planned_grams: grams,
		actual_grams: context === "actual_batch" ? grams : null,
		lock_type: context === "actual_batch" ? "already_added" : "unlocked",
		production_step: item.production_step,
		notes: item.notes,
		effective_grams: grams,
		difference: context === "actual_batch" ? grams - item.planned_grams : 0,
		is_actual: context === "actual_batch"
	};
}
function combineLabelNutrition(factual, factualMassG, labelItems, finalMassG) {
	if (!factual || finalMassG <= 0) return null;
	const total = {
		kcal: factual.kcal * factualMassG / 100,
		fat_g: factual.fat_g * factualMassG / 100,
		saturated_fat_g: factual.saturated_fat_g === null ? null : factual.saturated_fat_g * factualMassG / 100,
		carbohydrate_g: factual.carbohydrate_g * factualMassG / 100,
		sugars_g: factual.sugars_g * factualMassG / 100,
		protein_g: factual.protein_g * factualMassG / 100,
		salt_g: factual.salt_g * factualMassG / 100,
		fiber_g: factual.fiber_g * factualMassG / 100
	};
	for (const item of labelItems) {
		const grams = item.effective_grams;
		const label = item.ingredient.label_nutrition_per_100g;
		total.kcal += label.energyKcal * grams / 100;
		total.fat_g += label.fat * grams / 100;
		if (label.saturatedFat === null) total.saturated_fat_g = null;
		else if (total.saturated_fat_g !== null) total.saturated_fat_g += label.saturatedFat * grams / 100;
		total.carbohydrate_g += label.carbohydrate * grams / 100;
		if (label.sugars === null) total.sugars_g = null;
		else if (total.sugars_g !== null) total.sugars_g += label.sugars * grams / 100;
		total.protein_g += label.protein * grams / 100;
		total.salt_g += label.salt * grams / 100;
		if (label.fibre === null) total.fiber_g = null;
		else if (total.fiber_g !== null) total.fiber_g += label.fibre * grams / 100;
	}
	const per100 = (value) => value / finalMassG * 100;
	return {
		kcal: per100(total.kcal),
		fat_g: per100(total.fat_g),
		saturated_fat_g: total.saturated_fat_g === null ? null : per100(total.saturated_fat_g),
		carbohydrate_g: per100(total.carbohydrate_g),
		sugars_g: total.sugars_g === null ? null : per100(total.sugars_g),
		protein_g: per100(total.protein_g),
		salt_g: per100(total.salt_g),
		fiber_g: total.fiber_g === null ? null : per100(total.fiber_g),
		alcohol_g: labelItems.length === 0 ? factual.alcohol_g : null
	};
}
function combineCosts(factual, labelItems, finalMassG) {
	if (!factual) return null;
	const missing = [...factual.missing_cost_ingredient_ids];
	let knownTotal = factual.total_cost ?? 0;
	if (!factual.complete) knownTotal = 0;
	for (const item of labelItems) {
		const price = item.ingredient.cost_per_kg;
		if (price === null) missing.push(item.ingredient.id);
		else knownTotal += item.effective_grams / 1e3 * price;
	}
	const complete = factual.complete && missing.length === 0;
	const totalCost = complete ? knownTotal : null;
	const perKg = complete && finalMassG > 0 ? knownTotal / finalMassG * 1e3 : null;
	const serving = (grams) => perKg === null ? null : perKg * grams / 1e3;
	return {
		total_cost: totalCost,
		cost_per_kg: perKg,
		cost_per_serving_60g: serving(60),
		cost_per_serving_70g: serving(70),
		cost_per_serving_80g: serving(80),
		complete,
		missing_cost_ingredient_ids: [...new Set(missing)]
	};
}
function calculateFinalProduct(baseInput, toppings = [], context = "planning") {
	const baseResult = calculateRecipe(baseInput);
	const scienceItems = toppings.flatMap((item) => {
		const next = scienceToppingItem(item, context);
		return next ? [next] : [];
	});
	const scienceInputItems = [...baseInput.items.map((item) => ({ ...item })), ...scienceItems];
	const factualMassG = scienceInputItems.reduce((sum, item) => sum + (item.actual_grams ?? item.planned_grams), 0);
	const factualFinalResult = calculateRecipe({
		...baseInput,
		items: scienceInputItems,
		target_batch_grams: factualMassG
	});
	const labelItems = toppings.flatMap((item) => {
		const next = labelToppingItem(item, context);
		return next ? [next] : [];
	});
	const toppingMassG = toppings.reduce((sum, item) => sum + toppingEffectiveGrams(item, context), 0);
	const finalMassG = factualMassG + labelItems.reduce((sum, item) => sum + item.effective_grams, 0);
	return {
		baseResult,
		finalItems: [...factualFinalResult.items, ...labelItems],
		finalNutritionPer100g: labelItems.length === 0 ? factualFinalResult.nutrition_per_100g : null,
		finalLabelNutritionPer100g: combineLabelNutrition(factualFinalResult.nutrition_per_100g, factualMassG, labelItems, finalMassG),
		finalCosts: combineCosts(factualFinalResult.costs, labelItems, finalMassG),
		baseMassG: baseResult.total_batch_g,
		toppingMassG,
		finalMassG,
		toppingCount: toppings.length
	};
}

//#endregion
//#region src/features/production-workspace/productionSession.ts
const PRODUCTION_GRAMS_EPSILON = 1e-6;
function productionLotCodeForRun(sessionId, completedAt) {
	return `LOT-${completedAt.slice(0, 10).replaceAll("-", "")}-${sessionId.replace(/[^a-z0-9]/gi, "").slice(0, 10).toUpperCase() || "RUN"}`;
}
function cloneRecipeInput(input) {
	return {
		...input,
		goals: input.goals ? { ...input.goals } : void 0,
		items: input.items.map((item) => ({
			...item,
			ingredient: {
				...item.ingredient,
				composition: { ...item.ingredient.composition },
				flags: item.ingredient.flags ? { ...item.ingredient.flags } : void 0
			},
			actual_grams: null
		}))
	};
}
function productionSourceFingerprint(input, composition) {
	return JSON.stringify({
		category: input.category,
		temperature: input.target_temperature_c,
		batch: input.target_batch_grams,
		machine: input.machine_capacity_grams,
		items: input.items.map((item) => ({
			lineId: item.id,
			ingredientId: item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
			grams: item.planned_grams,
			lockType: item.lock_type,
			productionStep: item.production_step ?? null,
			carbonationStatus: item.ingredient.carbonation_status ?? "UNKNOWN"
		})),
		composition: composition ? {
			baseOrder: composition.baseOrder,
			behaviorSnapshots: Object.entries(composition.behaviorSnapshots ?? {}).sort(([left], [right]) => left.localeCompare(right)).map(([lineId, snapshot]) => ({
				lineId,
				productVersionId: snapshot.productVersionId,
				factsFingerprint: snapshot.factsFingerprint,
				behaviorBindingId: snapshot.behaviorBindingId,
				behaviorBindingVersion: snapshot.behaviorBindingVersion,
				taxonomyVersion: snapshot.taxonomyVersion,
				resolverVersion: snapshot.resolverVersion
			})),
			toppings: composition.toppings.map((item) => ({
				lineId: item.id,
				ingredientId: item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
				grams: item.planned_grams,
				position: item.addon_sort_order
			}))
		} : null
	});
}
function createProductionSession(input) {
	const plannedInput = cloneRecipeInput(input.plannedInput);
	const plannedComposition = input.plannedComposition ?? recipeCompositionFromState({
		items: plannedInput.items,
		baseOrder: plannedInput.items.map((item) => item.id)
	});
	const basePosition = new Map(plannedComposition.baseOrder.map((lineId, index) => [lineId, index]));
	const orderedBaseItems = plannedInput.items.map((item, sourceIndex) => ({
		item,
		sourceIndex
	})).sort((a, b) => (basePosition.get(a.item.id) ?? a.sourceIndex) - (basePosition.get(b.item.id) ?? b.sourceIndex)).map(({ item }) => item);
	return {
		schemaVersion: 2,
		sessionId: input.sessionId,
		ownerUserId: input.ownerUserId,
		source: { ...input.source },
		sourceFingerprint: productionSourceFingerprint(plannedInput, plannedComposition),
		status: "in_progress",
		startedAt: input.startedAt,
		completedAt: null,
		plannedInput,
		plannedComposition,
		thermalMode: input.thermalMode ?? null,
		processReadiness: input.processReadiness ?? null,
		processAdvisories: structuredClone(input.processAdvisories ?? []),
		heatInformationAcknowledgedAt: input.heatInformationAcknowledgedAt ?? null,
		degassingRequired: input.degassingRequired ?? false,
		degassingAcknowledged: input.degassingAcknowledged ?? false,
		degassingAcknowledgedAt: input.degassingAcknowledgedAt ?? null,
		carbonatedProductIds: [...input.carbonatedProductIds ?? []],
		durableRescueAcceptedAt: null,
		durableRescueRevision: 0,
		durableActualRevision: 0,
		lastDeviationDecision: null,
		rescueAddedItems: [],
		topUpTasks: [],
		lines: orderedBaseItems.map((item) => ({
			lineId: item.id,
			canonicalIngredientId: item.ingredient.canonical_ingredient_id ?? item.ingredient.id ?? null,
			name: item.ingredient.name,
			plannedGrams: item.planned_grams,
			targetGrams: item.planned_grams,
			draftActualGrams: item.planned_grams,
			draftActualEdited: false,
			physicalAddedGrams: 0,
			confirmed: false,
			confirmedAt: null,
			confirmationOrder: null,
			recordCorrectionCount: 0
		})),
		addonLines: plannedComposition.toppings.map((item) => ({
			lineId: item.id,
			canonicalIngredientId: item.ingredient.canonical_ingredient_id ?? item.ingredient.id ?? null,
			name: item.ingredient.name,
			plannedGrams: item.planned_grams,
			targetGrams: item.planned_grams,
			draftActualGrams: item.planned_grams,
			draftActualEdited: false,
			physicalAddedGrams: 0,
			confirmed: false,
			confirmedAt: null,
			confirmationOrder: null,
			recordCorrectionCount: 0
		})),
		stage: "base",
		substitutions: [],
		customerLabelNote: "",
		internalProductionNote: "",
		completionSnapshot: null
	};
}
function requireActive(session) {
	if (session.status !== "in_progress") throw new Error("Completed production is immutable.");
}
function pendingProductionTopUpTasks(session) {
	return session.topUpTasks.filter((task) => task.status === "pending");
}
/** Confirmed actuals + pending target grams: the predicted finished batch. */
function buildProductionForecastInput(session) {
	const byId = new Map(session.lines.map((line) => [line.lineId, line]));
	const pendingTopUpLineIds = new Set(pendingProductionTopUpTasks(session).map((task) => task.sourceRecipeLineId));
	const items = [...session.plannedInput.items, ...session.rescueAddedItems].map((item) => {
		const line = byId.get(item.id);
		if (!line) throw new Error(`Production line missing for ${item.id}.`);
		const hasPendingTopUp = pendingTopUpLineIds.has(line.lineId);
		return {
			...item,
			planned_grams: line.targetGrams,
			actual_grams: line.confirmed && !hasPendingTopUp ? line.physicalAddedGrams : null,
			lock_type: line.confirmed && !hasPendingTopUp ? "already_added" : item.lock_type
		};
	});
	const targetBatchGrams = session.durableRescueRevision > 0 ? session.lines.reduce((sum, line) => sum + line.targetGrams, 0) : session.plannedInput.target_batch_grams;
	return {
		...session.plannedInput,
		target_batch_grams: targetBatchGrams,
		items
	};
}
/** Every line uses its actual confirmed mass; intended only at completion. */
function buildFinalActualInput(session) {
	if (pendingProductionTopUpTasks(session).length > 0) throw new Error("Every authorized Production top-up task must be confirmed before completion.");
	if (session.lines.some((line) => !line.confirmed)) throw new Error("Every ingredient must be confirmed before production completion.");
	const byId = new Map(session.lines.map((line) => [line.lineId, line]));
	const items = [...session.plannedInput.items, ...session.rescueAddedItems].map((item) => {
		const line = byId.get(item.id);
		return {
			...item,
			planned_grams: line.plannedGrams,
			actual_grams: line.physicalAddedGrams,
			lock_type: "already_added"
		};
	});
	const actualTotal = items.reduce((sum, item) => sum + (item.actual_grams ?? 0), 0);
	return {
		...session.plannedInput,
		target_batch_grams: actualTotal,
		items
	};
}
const productionTopUpTaskId = (revisionId, lineId) => `production-top-up:${revisionId}:${encodeURIComponent(lineId)}`;
function materializeAuthorizedProductionTopUps(session, rescueRevision, sourceActualRevision, executedAfterAuthorizationLineIds = /* @__PURE__ */ new Set()) {
	if (session.lines.some((line) => {
		if (!executedAfterAuthorizationLineIds.has(line.lineId)) return false;
		return Math.abs(line.physicalAddedGrams - line.targetGrams) > 1e-6;
	})) return {
		...session,
		topUpTasks: session.topUpTasks.map((task) => task.status === "pending" ? {
			...task,
			status: "invalidated"
		} : task)
	};
	const existingByKey = new Map(session.topUpTasks.map((task) => [`${task.revisionId}:${task.sourceRecipeLineId}`, task]));
	const materialized = [];
	const lines = session.lines.map((line) => {
		const confirmedBeforeAuthorization = line.confirmedAt !== null && !executedAfterAuthorizationLineIds.has(line.lineId);
		const authorizedDeltaG = line.targetGrams - line.physicalAddedGrams;
		if (!confirmedBeforeAuthorization || authorizedDeltaG <= 1e-6) return line;
		const existing = existingByKey.get(`${rescueRevision}:${line.lineId}`);
		materialized.push(existing?.status === "pending" && Math.abs(existing.physicalBaselineG - line.physicalAddedGrams) <= 1e-6 && Math.abs(existing.cumulativeTargetG - line.targetGrams) <= 1e-6 ? existing : {
			taskId: productionTopUpTaskId(rescueRevision, line.lineId),
			sourceIngredientId: line.canonicalIngredientId,
			sourceRecipeLineId: line.lineId,
			ingredientName: line.name,
			physicalBaselineG: line.physicalAddedGrams,
			authorizedDeltaG,
			draftDeltaG: authorizedDeltaG,
			cumulativeTargetG: line.targetGrams,
			revisionId: rescueRevision,
			sourceActualRevision,
			status: "pending",
			completedAt: null
		});
		return {
			...line,
			confirmed: true,
			draftActualGrams: line.physicalAddedGrams,
			draftActualEdited: false
		};
	});
	const materializedIds = new Set(materialized.map((task) => task.taskId));
	const history = session.topUpTasks.map((task) => task.status === "pending" && !materializedIds.has(task.taskId) ? {
		...task,
		status: "invalidated"
	} : task);
	const historyIds = new Set(history.map((task) => task.taskId));
	return {
		...session,
		lines,
		topUpTasks: [...history, ...materialized.filter((task) => !historyIds.has(task.taskId))]
	};
}
function productionLineIdsExecutedAfterRescue(run, rescueRevision) {
	let decisionIndex = -1;
	for (let index = 0; index < run.events.length; index += 1) {
		const event = run.events[index];
		if (event.type === "deviation_decision_accepted" && event.amendment?.rescueRevision === rescueRevision) decisionIndex = index;
	}
	if (decisionIndex < 0) return /* @__PURE__ */ new Set();
	return new Set(run.events.slice(decisionIndex + 1).flatMap((event) => {
		if (event.type !== "ingredient_actual_confirmed" && event.type !== "actual_entry_corrected") return [];
		const lineId = event.amendment?.lineId;
		return typeof lineId === "string" && lineId.length > 0 ? [lineId] : [];
	}));
}
function applyVerifiedRescueInput(session, candidate, rescueRevision = session.durableRescueRevision + 1) {
	requireActive(session);
	const candidateBatchGrams = candidate.items.reduce((sum, item) => sum + item.planned_grams, 0);
	const authority = evaluateRecipeConstraintAuthority({
		recipe: {
			...candidate,
			target_batch_grams: candidateBatchGrams
		},
		snapshots: session.plannedComposition.behaviorSnapshots ?? {},
		module: "BATCH_RESCUE",
		technicalOnlyMainLineIds: session.plannedComposition.ownerReviewGate?.technicalOnlyMainLineIds
	});
	if (!authority.valid) throw new Error(authority.issues[0]?.messagePl ?? "Production Rescue requires a fully verified recipe candidate.");
	const candidateById = new Map(candidate.items.map((item) => [item.id, item]));
	const lines = session.lines.map((line) => {
		const item = candidateById.get(line.lineId);
		if (!item) throw new Error(`Verified rescue removed production line ${line.lineId}.`);
		const candidateFinalGrams = item.actual_grams ?? item.planned_grams;
		if (candidateFinalGrams + 1e-6 < line.physicalAddedGrams) throw new Error(`Verified rescue attempted to reduce physically added ${line.name}.`);
		const hasConfirmedPhysicalFact = line.confirmed || line.confirmedAt !== null && line.physicalAddedGrams > 1e-6;
		return {
			...line,
			targetGrams: candidateFinalGrams,
			draftActualGrams: hasConfirmedPhysicalFact ? line.physicalAddedGrams : candidateFinalGrams,
			draftActualEdited: false,
			confirmed: hasConfirmedPhysicalFact,
			confirmedAt: hasConfirmedPhysicalFact ? line.confirmedAt : null,
			confirmationOrder: hasConfirmedPhysicalFact ? line.confirmationOrder : null
		};
	});
	const originalIds = new Set(session.plannedInput.items.map((item) => item.id));
	const existingLineIds = new Set(session.lines.map((line) => line.lineId));
	const rescueAddedItems = candidate.items.filter((item) => !originalIds.has(item.id)).map((item) => ({
		...item,
		actual_grams: null
	}));
	const requiredRescueIds = productBehaviorRequiredLineIds({ items: rescueAddedItems });
	const rescueGate = productBehaviorModuleGate(session.plannedComposition.behaviorSnapshots ?? {}, "PRODUCTION", requiredRescueIds);
	if (!rescueGate.ready) throw new Error(rescueGate.reason ?? "Production rescue requires verified product behavior.");
	const addedLines = rescueAddedItems.filter((item) => !existingLineIds.has(item.id)).map((item) => ({
		lineId: item.id,
		canonicalIngredientId: item.ingredient.canonical_ingredient_id ?? item.ingredient.id ?? null,
		name: item.ingredient.name,
		plannedGrams: 0,
		targetGrams: item.planned_grams,
		draftActualGrams: item.planned_grams,
		draftActualEdited: false,
		physicalAddedGrams: 0,
		confirmed: false,
		confirmedAt: null,
		confirmationOrder: null,
		recordCorrectionCount: 0
	}));
	return materializeAuthorizedProductionTopUps({
		...session,
		durableRescueRevision: rescueRevision,
		rescueAddedItems,
		lines: [...lines, ...addedLines]
	}, rescueRevision, session.durableActualRevision);
}
function completeProductionSession(session, _finalResult, completedAt, operatorUserId) {
	requireActive(session);
	const finalActualInput = buildFinalActualInput(session);
	if (session.addonLines.some((line) => !line.confirmed)) throw new Error("Every topping must be confirmed before production completion.");
	const addonById = new Map(session.addonLines.map((line) => [line.lineId, line]));
	const actualToppings = session.plannedComposition.toppings.map((item) => ({
		...item,
		actual_grams: addonById.get(item.id)?.physicalAddedGrams ?? null
	}));
	const authority = buildRecipeBehaviorAuthority({
		items: finalActualInput.items,
		toppings: actualToppings,
		snapshots: session.plannedComposition.behaviorSnapshots ?? {}
	});
	const productionGate = recipeBehaviorModuleGate(authority, "PRODUCTION");
	const nutritionGate = recipeBehaviorModuleGate(authority, "NUTRITION");
	if (!productionGate.ready || !nutritionGate.ready) throw new Error(productionGate.reason ?? nutritionGate.reason ?? "Production facts require revalidation.");
	const authoritativeInput = recipeInputFromFrozenBehavior(finalActualInput, authority, "nutrition");
	const authoritativeToppings = recipeToppingsFromFrozenBehavior(actualToppings, authority, "nutrition");
	const authoritativeResult = calculateRecipe(authoritativeInput);
	const finalProduct = calculateFinalProduct(authoritativeInput, authoritativeToppings, "actual_batch");
	const actualFinalMassG = finalProduct.finalMassG;
	const frozenComposition = {
		...session.plannedComposition,
		toppings: authoritativeToppings
	};
	const snapshot = {
		sessionId: session.sessionId,
		ownerUserId: session.ownerUserId,
		source: { ...session.source },
		plannedInput: cloneRecipeInput(session.plannedInput),
		finalActualInput: authoritativeInput,
		finalResult: authoritativeResult,
		finalProduct: {
			items: finalProduct.finalItems,
			nutritionPer100g: finalProduct.finalNutritionPer100g,
			labelNutritionPer100g: finalProduct.finalLabelNutritionPer100g,
			costs: finalProduct.finalCosts,
			baseMassG: finalProduct.baseMassG,
			toppingMassG: finalProduct.toppingMassG,
			finalMassG: finalProduct.finalMassG
		},
		productComposition: frozenComposition,
		confirmedOrder: [...session.lines, ...session.addonLines].filter((line) => line.confirmedAt !== null && line.confirmationOrder !== null).sort((a, b) => a.confirmationOrder - b.confirmationOrder).map((line) => ({
			lineId: line.lineId,
			canonicalIngredientId: line.canonicalIngredientId,
			actualGrams: line.physicalAddedGrams,
			confirmedAt: line.confirmedAt,
			order: line.confirmationOrder
		})),
		originalBatchTargetG: session.plannedInput.target_batch_grams,
		actualFinalMassG,
		machineCapacityG: session.plannedInput.machine_capacity_grams,
		servingTemperatureC: session.plannedInput.target_temperature_c,
		productionCompletedAt: completedAt,
		lotCode: productionLotCodeForRun(session.sessionId, completedAt),
		operatorUserId,
		substitutions: session.substitutions.map((substitution) => ({ ...substitution })),
		customerLabelNote: session.customerLabelNote,
		internalProductionNote: session.internalProductionNote
	};
	return {
		...session,
		status: "completed",
		completedAt,
		completionSnapshot: snapshot
	};
}
/**
* Rebuild the physical workspace from the server-authoritative run. The exact
* immutable recipe version remains the source of ingredient facts; the run
* contributes only its frozen scaled plan, validated Rescue snapshot and
* recorded actuals. Any mismatch fails closed instead of guessing.
*/
function hydrateProductionSessionFromRun(run, source, plannedInput, plannedComposition) {
	if (run.status === "draft" || run.status === "planned" || run.status === "cancelled") throw new Error(`Cannot hydrate a non-active Production run (${run.status}).`);
	if (source.recipeId !== run.recipeId || source.recipeVersionId !== run.recipeVersionId || source.recipeVersionNumber !== run.recipeVersionNumber) throw new Error("Durable Production run does not match the exact recipe version.");
	const expectedIds = [...plannedComposition.baseOrder, ...plannedComposition.toppings.slice().sort((a, b) => a.addon_sort_order - b.addon_sort_order).map((item) => item.id)];
	if (run.plannedItems.length !== expectedIds.length || run.plannedItems.some((line, index) => line.id !== expectedIds[index] || Math.abs(line.plannedGrams - (plannedInput.items.find((item) => item.id === line.id)?.planned_grams ?? plannedComposition.toppings.find((item) => item.id === line.id)?.planned_grams ?? NaN)) > 1e-6)) throw new Error("Durable Production plan differs from the exact local recipe version.");
	let session = createProductionSession({
		sessionId: run.runId,
		ownerUserId: run.ownerUserId,
		source,
		plannedInput,
		plannedComposition,
		thermalMode: run.thermalMode ?? null,
		processReadiness: run.processReadiness ?? null,
		processAdvisories: run.processAdvisories ?? [],
		heatInformationAcknowledgedAt: run.heatInformationAcknowledgedAt ?? null,
		degassingRequired: run.degassingRequired === true,
		degassingAcknowledged: run.degassingAcknowledged === true,
		degassingAcknowledgedAt: run.degassingAcknowledgedAt ?? null,
		carbonatedProductIds: [...run.carbonatedProductIds ?? []],
		startedAt: run.events.find((event) => event.type === "started")?.at ?? run.createdAt
	});
	if (run.rescue) {
		const rescueBaseSnapshots = Object.fromEntries(run.rescue.recipeInput.items.flatMap((item) => {
			const snapshot = run.rescue?.productComposition.behaviorSnapshots?.[item.id];
			return snapshot ? [[item.id, snapshot]] : [];
		}));
		session = {
			...session,
			plannedComposition: {
				...session.plannedComposition,
				behaviorSnapshots: {
					...session.plannedComposition.behaviorSnapshots ?? {},
					...rescueBaseSnapshots
				}
			}
		};
		session = applyVerifiedRescueInput(session, run.rescue.recipeInput, run.rescue.revision);
		session = {
			...session,
			durableRescueAcceptedAt: run.rescue.acceptedAt,
			durableRescueRevision: run.rescue.revision
		};
	}
	const decisionEvent = [...run.events].reverse().find((event) => event.type === "deviation_decision_accepted");
	const decision = decisionEvent?.amendment;
	const strategy = decision?.stableOptionId;
	if (decisionEvent && (strategy === "keep_original_batch" || strategy === "enlarge_batch" || strategy === "restore_original_recipe" || strategy === "leave_as_is") && typeof decision?.sourceActualRevision === "number" && typeof decision?.rescueRevision === "number" && typeof decision?.finalMassG === "number" && typeof decision?.scoreDisplay === "string") session = {
		...session,
		lastDeviationDecision: {
			strategy,
			acceptedAt: decisionEvent.at,
			sourceActualRevision: decision.sourceActualRevision,
			rescueRevision: decision.rescueRevision,
			finalMassG: decision.finalMassG,
			scoreDisplay: decision.scoreDisplay
		}
	};
	if (run.actual) {
		const actualById = new Map(run.actual.items.map((item, index) => [item.id, {
			item,
			index
		}]));
		const restoreLine = (line) => {
			const recorded = actualById.get(line.lineId);
			const grams = recorded?.item.actualGrams;
			if (!recorded || grams === null || grams === void 0) return line;
			return {
				...line,
				draftActualGrams: grams,
				draftActualEdited: false,
				physicalAddedGrams: grams,
				confirmed: true,
				confirmedAt: recorded.item.confirmedAt ?? run.actual.recordedAt,
				confirmationOrder: recorded.item.confirmationOrder ?? recorded.index + 1
			};
		};
		session = {
			...session,
			durableActualRevision: run.actual.revision,
			lines: session.lines.map(restoreLine),
			addonLines: session.addonLines.map(restoreLine),
			stage: session.lines.every((line) => actualById.get(line.lineId)?.item.actualGrams != null) && session.addonLines.length > 0 ? "addons" : "base",
			substitutions: run.actual.substitutions.map((item) => ({
				originalLineId: item.originalIngredientId,
				originalCanonicalIngredientId: item.originalIngredientId,
				substituteCanonicalIngredientId: null,
				substituteName: item.substituteName,
				grams: item.grams ?? 0,
				reason: item.reason
			})),
			internalProductionNote: run.actual.operatorNotes ?? ""
		};
	}
	if (run.rescue && run.actual) session = materializeAuthorizedProductionTopUps(session, run.rescue.revision, session.lastDeviationDecision?.sourceActualRevision ?? run.actual.revision, productionLineIdsExecutedAfterRescue(run, run.rescue.revision));
	return run.status === "completed" ? completeProductionSession(session, calculateRecipe(buildFinalActualInput(session)), run.completedAt ?? run.updatedAt, run.actual?.recordedBy ?? run.ownerUserId) : session;
}

//#endregion
//#region src/features/production-workspace/productionRescue.ts
/**
* Production-specific Rescue orchestration contract. Engine/config versions
* continue to identify the formulas and calibrated data; this stamp identifies
* the option-selection and practicalization layer authorized by the server.
*/
const PRODUCTION_RESCUE_MODEL_VERSION = "production-rescue-v3";
/**
* OWNER RULE §17 — a batch size is spoken exactly as the Engine verified it.
* 1086 g is reported as 1086 g; it is never rounded up to a tidier 1100 g.
*/
const formatBatchMassG = (grams) => Number.isInteger(grams) ? grams.toFixed(0) : grams.toFixed(1).replace(/\.0$/, "");
const totalFor = (input) => input.items.reduce((sum, item) => sum + (item.actual_grams ?? item.planned_grams), 0);
const productionRescueCandidateFingerprint = (input) => JSON.stringify({
	mode: input.mode,
	category: input.category,
	temperature: input.target_temperature_c,
	batch: input.target_batch_grams,
	machine: input.machine_capacity_grams,
	goals: input.goals ?? null,
	items: input.items.map((item) => ({
		lineId: item.id,
		canonicalId: canonicalIngredientId(item.ingredient),
		grams: item.planned_grams,
		actual: item.actual_grams,
		lock: item.lock_type,
		composition: item.ingredient.composition
	}))
});
/**
* The correction solver may express a top-up as a new toolbox line. Production
* cannot turn that into a second canonical ingredient: the operator is adding
* more of the same material already present in the plan. Fold only solver-new
* lines into the matching base line and leave genuinely new ingredients alone.
*/
function foldCanonicalTopUps(base, proposed) {
	const baseLineIds = new Set(base.items.map((item) => item.id));
	const baseLineByCanonical = new Map(base.items.map((item) => [canonicalIngredientId(item.ingredient), item.id]));
	const folded = proposed.items.map((item) => ({ ...item }));
	const byLineId = new Map(folded.map((item) => [item.id, item]));
	const removeIds = /* @__PURE__ */ new Set();
	for (const item of folded) {
		if (baseLineIds.has(item.id)) continue;
		const baseLineId = baseLineByCanonical.get(canonicalIngredientId(item.ingredient));
		if (!baseLineId) continue;
		const target = byLineId.get(baseLineId);
		if (!target) continue;
		const topUpGrams = item.actual_grams ?? item.planned_grams;
		if (target.actual_grams !== null) target.actual_grams += topUpGrams;
		else target.planned_grams += topUpGrams;
		removeIds.add(item.id);
	}
	if (removeIds.size === 0) return proposed;
	return {
		...proposed,
		items: folded.filter((item) => !removeIds.has(item.id))
	};
}
function assessProductionHardSafety(input, result) {
	const violationMetrics = detectViolations(result).map((violation) => violation.metric);
	const provisional = result.indicators.some((indicator) => indicator.category_fallback || indicator.temperature_fallback || indicator.band_status === "estimated");
	const capacityExceeded = input.machine_capacity_grams !== null && result.total_batch_g > input.machine_capacity_grams + 1e-6;
	const nativeProfileValidated = recipeFitForInput(input, result).validatedNative;
	return {
		safe: violationMetrics.length === 0 && !provisional && !capacityExceeded && nativeProfileValidated,
		violationMetrics,
		provisional,
		capacityExceeded,
		nativeProfileValidated
	};
}
const nativeSafe = (input, result) => assessProductionHardSafety(input, result).safe;
function preservesPhysicalReality(session, candidate) {
	const candidateById = new Map(candidate.items.map((item) => [item.id, item]));
	return session.lines.every((line) => {
		if (line.physicalAddedGrams <= 1e-6) return true;
		const item = candidateById.get(line.lineId);
		if (!item) return false;
		return (item.actual_grams ?? item.planned_grams) + PRODUCTION_GRAMS_EPSILON >= line.physicalAddedGrams;
	});
}
function candidateFromProposal(forecastInput, proposal, context) {
	const applied = applyAutoFix({
		input: forecastInput,
		proposal,
		context
	});
	if (!applied.success) return null;
	const canonicalCandidate = foldCanonicalTopUps(forecastInput, applied.newInput);
	const total = totalFor(canonicalCandidate);
	return {
		...canonicalCandidate,
		target_batch_grams: total
	};
}
const sourceItemFor = (session, lineId) => [...session.plannedInput.items, ...session.rescueAddedItems].find((item) => item.id === lineId);
/**
* The immutable recipe version remains the audit origin, while accepted Rescue
* targets become the canonical plan for the next deviation. Rebuild that plan
* from Production lines so a second restore scales the accepted revision, not
* a stale 1000 g source vector.
*/
function currentCanonicalProductionPlan(session) {
	const lineById = new Map(session.lines.map((line) => [line.lineId, line]));
	const items = [...session.plannedInput.items, ...session.rescueAddedItems].map((item) => {
		const line = lineById.get(item.id);
		if (!line) throw new Error(`Production line missing for ${item.id}.`);
		return {
			...item,
			planned_grams: line.targetGrams,
			actual_grams: null,
			lock_type: item.lock_type === "already_added" ? "unlocked" : item.lock_type
		};
	});
	return {
		...session.plannedInput,
		target_batch_grams: totalFor({
			...session.plannedInput,
			items
		}),
		items
	};
}
function persistedProductionConstraint(source, candidate, sourceBatchGrams) {
	if (source?.grams_constraint !== void 0) return {
		mode: "locked",
		grams: source.grams_constraint.grams
	};
	if (source?.percent_constraint !== void 0) return {
		mode: "percent",
		percent: source.percent_constraint.percent
	};
	if (source?.range_constraint !== void 0) return {
		mode: "range",
		minGrams: source.range_constraint.min_grams,
		maxGrams: source.range_constraint.max_grams
	};
	if (source?.lock_type === "grams") return {
		mode: "locked",
		grams: source.planned_grams
	};
	if (source?.lock_type === "percent" && sourceBatchGrams > 0) return {
		mode: "percent",
		percent: source.planned_grams / sourceBatchGrams * 100
	};
	if (candidate.range_constraint !== void 0) return {
		mode: "range",
		minGrams: candidate.range_constraint.min_grams,
		maxGrams: candidate.range_constraint.max_grams
	};
	return null;
}
function productionConstraintSet(session, exactPlanningCandidate) {
	const byLineId = {};
	const lineById = new Map(session.lines.map((line) => [line.lineId, line]));
	for (const item of exactPlanningCandidate.items) {
		const line = lineById.get(item.id);
		if (line && line.physicalAddedGrams > 1e-6) {
			byLineId[item.id] = {
				mode: "range",
				minGrams: line.physicalAddedGrams,
				maxGrams: Math.max(line.physicalAddedGrams, Math.ceil(item.planned_grams))
			};
			continue;
		}
		const persisted = persistedProductionConstraint(sourceItemFor(session, item.id), item, session.plannedInput.target_batch_grams);
		if (persisted) byLineId[item.id] = persisted;
	}
	return { byLineId };
}
/**
* Convert a solver rescue into the actual whole-gram plan the operator will
* execute. Confirmed physical history stays in `ProductionSession`; this copy
* deliberately represents final planned targets so Engine evaluates exactly
* the same vector that the UI and Apply use.
*/
function practicalizeProductionRescueCandidate(session, exactCandidate, targetBatchGrams) {
	const exactPlanningCandidate = {
		...exactCandidate,
		target_batch_grams: targetBatchGrams,
		items: exactCandidate.items.map((item) => ({
			...item,
			planned_grams: item.actual_grams ?? item.planned_grams,
			actual_grams: null,
			lock_type: item.lock_type === "already_added" ? "unlocked" : item.lock_type
		}))
	};
	return practicalizeRecipeCandidate(exactPlanningCandidate, productionConstraintSet(session, exactPlanningCandidate));
}
/**
* Physical Production entries already support 0.1 g precision (the owner case
* itself contains 58.5 g). An Engine recovery may therefore remain a tenth-
* gram execution plan instead of being distorted by the separate whole-gram
* recipe-publication model. This is validation only: the candidate still comes
* from Engine Rescue and is re-run by the canonical Engine here.
*/
function tenthGramProductionAudit(session, exactCandidate) {
	const baseExecutableInput = {
		...exactCandidate,
		items: exactCandidate.items.map((item) => ({
			...item,
			planned_grams: item.actual_grams ?? item.planned_grams,
			actual_grams: null,
			lock_type: item.lock_type === "already_added" ? "unlocked" : item.lock_type
		}))
	};
	const physicalById = new Map(session.lines.map((line) => [line.lineId, line.physicalAddedGrams]));
	let executableCandidates = [baseExecutableInput];
	for (const [index, item] of baseExecutableInput.items.entries()) {
		if (!isTemplateControlledStabilizer(item.ingredient)) continue;
		const physicalFloor = physicalById.get(item.id) ?? 0;
		const choices = (physicalFloor > 1e-6 ? [item.planned_grams] : [
			Math.round(item.planned_grams),
			Math.floor(item.planned_grams),
			Math.ceil(item.planned_grams)
		]).filter((grams, position, values) => grams > 0 && Math.abs(grams * 10 - Math.round(grams * 10)) <= 1e-8 && grams + 1e-6 >= physicalFloor && values.indexOf(grams) === position);
		executableCandidates = executableCandidates.flatMap((candidate) => choices.map((grams) => ({
			...candidate,
			items: candidate.items.map((candidateItem, candidateIndex) => candidateIndex === index ? {
				...candidateItem,
				planned_grams: grams
			} : candidateItem)
		}))).slice(0, 128);
	}
	const exactResult = calculateRecipe(exactCandidate);
	const exactHardMetrics = detectViolations(exactResult).map((violation) => violation.metric);
	executableCandidates = executableCandidates.map((candidate) => ({
		...candidate,
		target_batch_grams: totalFor(candidate)
	})).sort((left, right) => left.items.reduce((sum, item, index) => {
		const exactItem = exactCandidate.items[index];
		return sum + Math.abs(item.planned_grams - (exactItem.actual_grams ?? exactItem.planned_grams));
	}, 0) - right.items.reduce((sum, item, index) => {
		const exactItem = exactCandidate.items[index];
		return sum + Math.abs(item.planned_grams - (exactItem.actual_grams ?? exactItem.planned_grams));
	}, 0));
	for (const executableInput of executableCandidates) {
		if (executableInput.items.some((item) => Math.abs(item.planned_grams * 10 - Math.round(item.planned_grams * 10)) > 1e-8)) continue;
		if (!verifyConstraintsPreserved(productionConstraintSet(session, executableInput), executableInput).ok) continue;
		const executableResult = calculateRecipe(executableInput);
		const executableHardMetrics = detectViolations(executableResult).map((violation) => violation.metric);
		if (executableHardMetrics.length > 0) continue;
		return {
			modelVersion: "production-tenth-gram-v1",
			exactInput: exactCandidate,
			exactResult,
			executableInput,
			executableResult,
			lines: executableInput.items.map((item) => {
				const exact = exactCandidate.items.find((candidate) => candidate.id === item.id);
				const exactGrams = exact.actual_grams ?? exact.planned_grams;
				return {
					lineId: item.id,
					ingredientName: item.ingredient.name,
					exactGrams,
					practicalGrams: item.planned_grams,
					deltaGrams: item.planned_grams - exactGrams,
					residualAdjusted: false,
					protection: session.lines.some((line) => line.lineId === item.id && line.physicalAddedGrams > 1e-6) ? "physical" : "editable"
				};
			}),
			targetBatchGrams: executableInput.target_batch_grams,
			exactTotalGrams: exactResult.total_batch_g,
			executableTotalGrams: executableResult.total_batch_g,
			residualBeforeReconciliationGrams: 0,
			residualAfterReconciliationGrams: 0,
			exactHardMetrics,
			executableHardMetrics,
			hardGatePassed: true
		};
	}
	return null;
}
function instructionsFor(before, after, actions) {
	const beforeById = new Map(before.items.map((item) => [item.id, item]));
	const actionNameByLine = new Map(actions.filter((action) => action.target_line_id).map((action) => [action.target_line_id, action.ingredient_name]));
	const instructions = [];
	for (const item of after.items) {
		const beforeItem = beforeById.get(item.id);
		const beforeGrams = beforeItem ? beforeItem.actual_grams ?? beforeItem.planned_grams : 0;
		const afterGrams = item.actual_grams ?? item.planned_grams;
		const delta = afterGrams - beforeGrams;
		if (Math.abs(delta) <= 1e-6) continue;
		instructions.push({
			lineId: beforeItem ? item.id : null,
			ingredientName: actionNameByLine.get(item.id) ?? item.ingredient.name,
			kind: delta > 0 ? "add" : "reduce_pending_plan",
			grams: Math.abs(delta),
			finalTargetGrams: afterGrams
		});
	}
	return instructions.sort((a, b) => (a.kind === "add" ? 0 : 1) - (b.kind === "add" ? 0 : 1) || a.ingredientName.localeCompare(b.ingredientName));
}
function bestOption(id, title, explanation, session, forecastInput, context, acceptMass, recoveryObjective = null) {
	const canonicalPlan = currentCanonicalProductionPlan(session);
	const proposed = proposeAutoFix({
		input: forecastInput,
		context,
		exactCorrectionGrams: true,
		maxProposals: 12
	});
	const solverCandidates = proposed.redacted ? [] : proposed.proposals.flatMap((proposal) => {
		if (proposal.kind !== "correction" || proposal.actions.length === 0) return [];
		const input = candidateFromProposal(forecastInput, proposal, context);
		return input ? [{
			input,
			actions: proposal.actions,
			precision: "whole"
		}] : [];
	});
	const recovery = recoveryObjective ? proposeBatchRecovery({
		input: forecastInput,
		baselineInput: canonicalPlan,
		objective: recoveryObjective
	}) : null;
	const completedCandidates = [...solverCandidates, ...recovery?.candidates.map((candidate) => ({
		input: candidate.input,
		actions: candidate.actions,
		precision: "tenth"
	})) ?? []];
	const candidates = [];
	for (const completed of completedCandidates) {
		if (context === "actual_batch" && completed.actions.some((action) => action.type !== "add")) continue;
		const exactCandidateInput = foldCanonicalTopUps(forecastInput, completed.input);
		if (!exactCandidateInput || !preservesPhysicalReality(session, exactCandidateInput)) continue;
		const exactMass = totalFor(exactCandidateInput);
		if (completed.precision === "tenth") {
			const audit = tenthGramProductionAudit(session, exactCandidateInput);
			if (!audit?.hardGatePassed) continue;
			const candidateInput = audit.executableInput;
			if (!preservesPhysicalReality(session, candidateInput)) continue;
			const mass = totalFor(candidateInput);
			if (!acceptMass(mass) || !nativeSafe(candidateInput, audit.executableResult)) continue;
			const score = recipeFitForInput(candidateInput, audit.executableResult);
			candidates.push({
				id,
				title: title(mass),
				explanation: explanation(mass),
				finalMassG: mass,
				scoreDisplay: score.display,
				exactCandidateInput,
				candidateInput,
				practicalAudit: audit,
				instructions: instructionsFor(forecastInput, candidateInput, completed.actions),
				verifiedByEngine: true
			});
			continue;
		}
		const practicalTargets = id === "keep_original_batch" ? [canonicalPlan.target_batch_grams] : [...new Set([
			Math.round(exactMass),
			Math.ceil(exactMass),
			Math.floor(exactMass),
			...Array.from({ length: 11 }, (_, offset) => Math.ceil(exactMass) + offset)
		])].sort((left, right) => Math.abs(left - exactMass) - Math.abs(right - exactMass));
		for (const practicalTarget of practicalTargets) {
			const practical = practicalizeProductionRescueCandidate(session, exactCandidateInput, practicalTarget);
			if (!practical.ok) continue;
			const candidateInput = practical.audit.executableInput;
			if (!preservesPhysicalReality(session, candidateInput)) continue;
			const mass = totalFor(candidateInput);
			if (!acceptMass(mass)) continue;
			const result = practical.audit.executableResult;
			if (!nativeSafe(candidateInput, result)) continue;
			const score = recipeFitForInput(candidateInput, result);
			candidates.push({
				id,
				title: title(mass),
				explanation: explanation(mass),
				finalMassG: mass,
				scoreDisplay: score.display,
				exactCandidateInput,
				candidateInput,
				practicalAudit: practical.audit,
				instructions: instructionsFor(forecastInput, candidateInput, completed.actions),
				verifiedByEngine: true
			});
		}
	}
	candidates.sort((a, b) => a.finalMassG - b.finalMassG || a.instructions.reduce((sum, instruction) => sum + instruction.grams, 0) - b.instructions.reduce((sum, instruction) => sum + instruction.grams, 0));
	return {
		option: candidates[0] ?? null,
		trace: {
			solverProposalCount: proposed.redacted ? 0 : proposed.proposals.length,
			evaluatedCandidateCount: recovery?.trace.evaluatedCandidateCount ?? 0,
			generatedSafeCandidateCount: solverCandidates.length + (recovery?.trace.hardSafeCandidateCount ?? 0),
			acceptedCandidateCount: candidates.length,
			hardReasonSets: recovery?.trace.uniqueHardReasonSets ?? [],
			finalCandidateGrams: candidates.map((candidate) => candidate.finalMassG)
		}
	};
}
const emptyStrategyTrace = () => ({
	solverProposalCount: 0,
	evaluatedCandidateCount: 0,
	generatedSafeCandidateCount: 0,
	acceptedCandidateCount: 0,
	hardReasonSets: [],
	finalCandidateGrams: []
});
/**
* Product-layer rescue orchestration. It never invents quantities: every
* exposed candidate was generated and re-run by the existing Engine. Options
* that cannot be proven safe are omitted rather than rendered disabled.
*/
function assessProductionRescue(session) {
	const forecastInput = buildProductionForecastInput(session);
	const forecastResult = calculateRecipe(forecastInput);
	const forecastScore = recipeFitForInput(forecastInput, forecastResult);
	const hardSafety = assessProductionHardSafety(forecastInput, forecastResult);
	const hasConfirmedDeviation = session.lines.some((line) => line.confirmed && Math.abs(line.physicalAddedGrams - line.plannedGrams) > 1e-6);
	if (!hasConfirmedDeviation) return {
		state: "not_needed",
		forecastInput,
		forecastResult,
		forecastScoreDisplay: forecastScore.display,
		hardSafety,
		hasConfirmedDeviation,
		options: [],
		reason: null,
		strategyTrace: {}
	};
	const options = [];
	const currentTarget = currentCanonicalProductionPlan(session).target_batch_grams;
	const keepSearch = bestOption("keep_original_batch", (mass) => `Napraw do ${formatBatchMassG(mass)} g`, () => "Zmienia wyłącznie to, czego jeszcze nie potwierdzono, i zachowuje docelową masę partii.", session, forecastInput, "planning", (mass) => Math.abs(mass - currentTarget) <= .1);
	if (keepSearch.option) options.push(keepSearch.option);
	const enlargeSearch = hardSafety.safe ? {
		option: null,
		trace: emptyStrategyTrace()
	} : bestOption("enlarge_batch", (mass) => `Minimalna bezpieczna korekta · ${formatBatchMassG(mass)} g`, (mass) => `Najmniejsza bezpieczna partia powyżej ${formatBatchMassG(currentTarget)} g dla tego, co jest już w naczyniu: ${formatBatchMassG(mass)} g.`, session, forecastInput, "actual_batch", (mass) => mass > currentTarget + .1, "minimum_safe");
	if (enlargeSearch.option) options.push(enlargeSearch.option);
	const restoreSearch = bestOption("restore_original_recipe", (mass) => `Przywróć oryginalną recepturę · ${formatBatchMassG(mass)} g`, (mass) => `Skaluje wyjściową recepturę do ${formatBatchMassG(mass)} g i może ponownie otworzyć potwierdzone produkty wyłącznie jako dodatnie dolewki.`, session, forecastInput, "actual_batch", (mass) => mass > currentTarget + .1, "restore_original_profile");
	if (restoreSearch.option) options.push(restoreSearch.option);
	if (hardSafety.safe) {
		let continuationAudit = tenthGramProductionAudit(session, forecastInput);
		if (!continuationAudit) {
			const practical = practicalizeProductionRescueCandidate(session, forecastInput, Math.round(totalFor(forecastInput)));
			continuationAudit = practical.ok ? practical.audit : null;
		}
		if (continuationAudit && preservesPhysicalReality(session, continuationAudit.executableInput) && nativeSafe(continuationAudit.executableInput, continuationAudit.executableResult)) {
			const candidateInput = continuationAudit.executableInput;
			options.push({
				id: "leave_as_is",
				title: "Kontynuuj bez korekty",
				explanation: "Przewidywana gotowa partia pozostaje w zatwierdzonych zakresach technologicznych.",
				finalMassG: continuationAudit.executableResult.total_batch_g,
				scoreDisplay: recipeFitForInput(candidateInput, continuationAudit.executableResult).display,
				exactCandidateInput: forecastInput,
				candidateInput,
				practicalAudit: continuationAudit,
				instructions: instructionsFor(forecastInput, candidateInput, []),
				verifiedByEngine: true
			});
		}
	}
	return {
		state: options.length > 0 ? "options" : "impossible",
		forecastInput,
		forecastResult,
		forecastScoreDisplay: forecastScore.display,
		hardSafety,
		hasConfirmedDeviation,
		options,
		reason: options.length > 0 ? null : "Brak bezpiecznej korekty, która zachowuje fizycznie dodane składniki i zatwierdzone zakresy receptury.",
		strategyTrace: {
			keep_original_batch: keepSearch.trace,
			enlarge_batch: enlargeSearch.trace,
			restore_original_recipe: restoreSearch.trace
		}
	};
}

//#endregion
//#region src/features/pro-core/recipeScaling.ts
/**
* Distribute `targetUnits` (an integer) across `sources` proportionally, returning integer unit
* counts whose sum is EXACTLY `targetUnits`. Deterministic largest-remainder (Hamilton) method:
* floor each proportional share, then hand the leftover units to the largest fractional
* remainders, breaking ties by the lowest index. Pure; the input array is never mutated.
*/
function allocateUnits(sources, targetUnits) {
	if (sources.length === 0) return [];
	const sourceTotal = sources.reduce((sum, g) => sum + g, 0);
	if (sourceTotal <= 0) return sources.map(() => 0);
	const raw = sources.map((g) => g / sourceTotal * targetUnits);
	const result = raw.map((r) => Math.floor(r));
	const remaining = targetUnits - result.reduce((sum, f) => sum + f, 0);
	const byRemainderDesc = raw.map((r, i) => ({
		i,
		frac: r - Math.floor(r)
	})).sort((a, b) => b.frac - a.frac || a.i - b.i).map((x) => x.i);
	if (remaining > 0) for (let k = 0; k < remaining && k < byRemainderDesc.length; k += 1) {
		const idx = byRemainderDesc[k];
		result[idx] = (result[idx] ?? 0) + 1;
	}
	else if (remaining < 0) {
		const bySmallest = [...byRemainderDesc].reverse();
		for (let k = 0, take = -remaining; take > 0 && k < bySmallest.length; k += 1) {
			const idx = bySmallest[k];
			if ((result[idx] ?? 0) > 0) {
				result[idx] = (result[idx] ?? 0) - 1;
				take -= 1;
			}
		}
	}
	return result;
}
/** grams → integer units on a 10^decimals grid (nearest). */
function toUnits(grams, decimals) {
	return Math.round(grams * 10 ** decimals);
}
/** Resolve the requested target into exact grams, or an honest refusal when info is missing. */
function resolveTargetGrams(target) {
	switch (target.kind) {
		case "weight_g": return { grams: target.grams };
		case "volume_ml": {
			const density = target.densityGPerMl;
			if (density == null || !(density > 0)) return { missing: ["density_g_per_ml"] };
			return { grams: target.ml * density };
		}
		case "portions": {
			const portion = target.portionWeightG;
			if (portion == null || !(portion > 0)) return { missing: ["portion_weight_g"] };
			return { grams: target.count * portion };
		}
	}
}
/**
* Scale an immutable recipe version to a requested target. Returns an exact result, an honest
* `needs_more_information` refusal (volume/portions without density/yield), or an `invalid`
* refusal (non-positive target or a zero-mass source recipe).
*/
function scaleRecipeVersion(version, target, options = {}) {
	const canonicalDecimals = options.canonicalDecimals ?? 3;
	const displayDecimals = options.displayDecimals ?? 1;
	const resolved = resolveTargetGrams(target);
	if ("missing" in resolved) return {
		ok: false,
		reason: "needs_more_information",
		missing: resolved.missing,
		message: target.kind === "volume_ml" ? "Scaling to a volume needs an explicit density (g/ml). No density was supplied, so no volume was assumed." : "Scaling to portions needs an explicit portion weight (g) or yield. None was supplied, so no yield was assumed."
	};
	if ("invalid" in resolved) return {
		ok: false,
		reason: "invalid",
		message: resolved.invalid
	};
	const requestedBatchG = resolved.grams;
	if (!(requestedBatchG > 0)) return {
		ok: false,
		reason: "invalid",
		message: "Target batch weight must be greater than zero."
	};
	const items = version.recipeInput.items;
	const basePosition = new Map((version.productComposition?.baseOrder ?? items.map((item) => item.id)).map((id, index) => [id, index]));
	const sources = items.map((it) => it.planned_grams);
	const sourceTotalG = sources.reduce((sum, g) => sum + g, 0);
	if (!(sourceTotalG > 0)) return {
		ok: false,
		reason: "invalid",
		message: "Cannot scale a recipe with zero total mass."
	};
	const canonicalUnits = allocateUnits(sources, toUnits(requestedBatchG, canonicalDecimals));
	const displayUnits = allocateUnits(sources, toUnits(requestedBatchG, displayDecimals));
	const lines = items.map((it, i) => ({
		id: it.id,
		name: it.ingredient.name,
		canonicalIngredientId: it.ingredient.id ? canonicalIngredientId(it.ingredient) || null : null,
		processScope: "BASE_FORMULATION",
		scopePosition: basePosition.get(it.id) ?? i,
		sourceGrams: it.planned_grams,
		grams: canonicalUnits[i] / 10 ** canonicalDecimals,
		displayGrams: displayUnits[i] / 10 ** displayDecimals
	}));
	return {
		ok: true,
		recipeId: version.recipeId,
		recipeVersionId: version.versionId,
		recipeVersionNumber: version.versionNumber,
		sourceTotalG,
		requestedBatchG,
		canonicalTotalG: canonicalUnits.reduce((sum, u) => sum + u, 0) / 10 ** canonicalDecimals,
		displayTotalG: displayUnits.reduce((sum, u) => sum + u, 0) / 10 ** displayDecimals,
		factor: requestedBatchG / sourceTotalG,
		canonicalDecimals,
		displayDecimals,
		lines,
		productComposition: version.productComposition ? JSON.parse(JSON.stringify(version.productComposition)) : null,
		productProfile: version.productProfile,
		temperatureC: version.temperatureC,
		engineVersion: version.engineVersion,
		configVersion: version.configVersion,
		mapperDatasetVersion: version.mapperDatasetVersion
	};
}
/**
* Build a scaled engine `RecipeInput` from a version + an exact scale result (deep clone of the
* version input with each line's `planned_grams` set to the canonical scaled grams and the batch
* total updated). Used to prove Engine composition invariance and to freeze the production plan.
* The source version is never mutated.
*/
function scaledRecipeInput(version, scaled) {
	const clone = JSON.parse(JSON.stringify(version.recipeInput));
	const gramsById = new Map(scaled.lines.map((l) => [l.id, l.grams]));
	for (const item of clone.items) {
		const g = gramsById.get(item.id);
		if (g !== void 0) {
			item.planned_grams = g;
			item.actual_grams = null;
		}
	}
	clone.target_batch_grams = scaled.canonicalTotalG;
	return clone;
}

//#endregion
export { CONFIG_VERSION, ENGINE_VERSION, PRACTICAL_RECIPE_MODEL_VERSION, PRODUCTION_RESCUE_MODEL_VERSION, assessProductionRescue, hydrateProductionSessionFromRun, productionRescueCandidateFingerprint, scaleRecipeVersion, scaledRecipeInput };