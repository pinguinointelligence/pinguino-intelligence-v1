/**
 * DETERMINISTIC fixture for the Studio-picker browser proof (DEV only).
 *
 * Real Studio sign-in is required to fetch the owner's products (RLS), which a local preview
 * lacks — so this builds the SAME `IngredientLibrary` shape the production hook produces, using
 * the REAL pure builders (`buildProductEngineLibrary` + `ingredientRowToEngineIngredient`) over a
 * few clearly-labelled SAMPLE rows. It touches NO database and NO service: it only proves the
 * picker renders the "My Products" group + provenance. Production keeps using `useIngredientLibrary`
 * (real RLS data) — this fixture is never imported by it.
 */
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import { buildProductEngineLibrary } from '@/data/products/productEngineLibrary';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import type { ProductRow } from '@/data/products/productRow';
import type { IngredientLibrary } from '@/features/ingredient-builder/ingredientLibrary';

export const STUDIO_PICKER_PROOF_NOTE =
  'DEV fixture — deterministic sample rows run through the real picker + buildProductEngineLibrary. Not real DB data.';

const ref = (over: Partial<IngredientRow>): IngredientRow =>
  ({
    ingredient_id: 'PI-ING-000000', ingredient_name_internal: 'x', ingredient_name_display: 'X',
    ingredient_category: 'dairy', water_percent: 0, total_solids_percent: 0, fat_percent: 0, protein_percent: 0,
    carbohydrate_percent: 0, total_sugars_percent: 0, sucrose_percent: 0, glucose_percent: 0, dextrose_percent: 0,
    fructose_percent: 0, lactose_percent: 0, polyol_percent: 0, fiber_percent: 0, salt_percent: 0, alcohol_percent: 0,
    saturated_fat_percent: null, kcal_per_100g: 0, pac_value: null, pod_value: null, de_value: null, cost_per_kg: null,
    data_confidence_percent: 90, verification_status: 'Verified', vegan: 'false',
    ...over,
  }) as IngredientRow;

const prod = (over: Partial<ProductRow>): ProductRow =>
  ({
    id: 'p', product_code: 'PR-ING-000000', product_name_display: 'X', mapper_status: 'matched',
    matched_basement_id: 'PI-ING-000000', status: 'pi_generated', pac_value: null, pod_value: null, detected_text: null,
    ...over,
  }) as ProductRow;

/** Build the deterministic library the proof page renders (real builders, sample inputs). */
export function buildStudioPickerProofLibrary(): IngredientLibrary {
  const references: IngredientRow[] = [
    ref({ ingredient_id: 'PI-ING-000010', ingredient_name_display: 'Whole Milk', ingredient_category: 'dairy', water_percent: 87.5, total_solids_percent: 12.5, fat_percent: 3.6, protein_percent: 3.2, carbohydrate_percent: 4.8, total_sugars_percent: 4.8, lactose_percent: 4.8, pac_value: 4.8, pod_value: 4.8 }),
    ref({ ingredient_id: 'PI-ING-000180', ingredient_name_display: 'Cream 35%', ingredient_category: 'dairy', water_percent: 58, total_solids_percent: 42, fat_percent: 35, protein_percent: 2.1, carbohydrate_percent: 2.9, total_sugars_percent: 2.9, lactose_percent: 2.9, pac_value: 3.3, pod_value: 0.46 }),
    ref({ ingredient_id: 'PI-ING-000300', ingredient_name_display: 'Dark Chocolate 70%', ingredient_category: 'chocolate', water_percent: 1, total_solids_percent: 99, fat_percent: 42, protein_percent: 8, carbohydrate_percent: 46, total_sugars_percent: 29, sucrose_percent: 29, pac_value: 29, pod_value: 29 }),
    // Yogurt anchor — enables the class-derived (PI Calculated) example below.
    ref({ ingredient_id: 'PI-ING-000297', ingredient_name_display: 'Yogurt 5% — Standard', ingredient_category: 'dairy', water_percent: 87, total_solids_percent: 13, fat_percent: 5, protein_percent: 3.6, carbohydrate_percent: 5, total_sugars_percent: 5, lactose_percent: 5, salt_percent: 0.2, pac_value: 6.17, pod_value: 0.8 }),
  ];
  const products: ProductRow[] = [
    prod({ id: 'a', product_code: 'PR-ING-000010', product_name_display: 'Nata para montar 35% Hacendado', matched_basement_id: 'PI-ING-000180', status: 'pi_generated' }),
    prod({ id: 'b', product_code: 'PR-ING-000028', product_name_display: 'Chocolate negro 72% Hacendado', matched_basement_id: 'PI-ING-000300', status: 'pi_generated' }),
    prod({ id: 'c', product_code: 'PR-ING-000032', product_name_display: 'Chocolate 85% 0% azúcares edulcorante maltitol', matched_basement_id: 'PI-ING-000300', status: 'pi_generated' }),
    // The LIVE-ACTIVATED class-derived PI Calculated product (owner-approved 000014, status
    // pi_calculated, NOT matched): it enters via the class_derived branch with EPHEMERAL pac/pod
    // adopted from the Yogurt 5% anchor. The product row carries NO pac/pod (stays null).
    prod({ id: 'd', product_code: 'PR-ING-000014', product_name_display: 'Yogur natural Hacendado pack 6', product_category: 'dairy', mapper_status: null, matched_basement_id: null, status: 'pi_calculated', fat_percent: 3, carbohydrate_percent: 4.5, total_sugars_percent: 4.5, protein_percent: 3.5, salt_percent: 0.1 } as Partial<ProductRow>),
  ];
  const referenceById = new Map(references.map((r) => [r.ingredient_id, r]));
  const productLib = buildProductEngineLibrary({ products, referenceById });
  const ingredients = references.map(ingredientRowToEngineIngredient);
  const searchIndex = new Map(ingredients.map((i) => [i.id, `${i.name} ${i.id} ${i.category}`.toLowerCase()]));
  return {
    ingredients,
    searchIndex,
    source: 'pi_base',
    status: 'ready',
    products: productLib.ingredients,
    productProvenance: productLib.provenance,
  };
}
