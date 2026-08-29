/**
 * Gellatti publication image library.
 *
 * A Community publication always carries an image: a recipe card with an
 * empty frame reads as an unfinished product, and the ranking surfaces are
 * built around a picture. These are the shipped Gellatti flavour renders in
 * `public/recipes/` — no external asset is fetched and nothing is scraped.
 */
export interface PublicationImage {
  /** Public path served by the app. */
  readonly url: string;
  /** Human label, shown as the alternative text and in the picker. */
  readonly label: string;
}

export const PUBLICATION_IMAGES: readonly PublicationImage[] = [
  { url: '/recipes/FL-000001_chocolate_fudge_with_brown_sugar.webp', label: "Chocolate fudge with brown sugar" },
  { url: '/recipes/FL-000002_chocolate_fudge_with_caramel_swirl.webp', label: "Chocolate fudge with caramel swirl" },
  { url: '/recipes/FL-000003_chocolate_fudge_with_fudge_ripple.webp', label: "Chocolate fudge with fudge ripple" },
  { url: '/recipes/FL-000004_chocolate_fudge_with_kataifi_crunch.webp', label: "Chocolate fudge with kataifi crunch" },
  { url: '/recipes/FL-000005_chocolate_fudge_with_milk_crumble.webp', label: "Chocolate fudge with milk crumble" },
  { url: '/recipes/FL-000006_chocolate_fudge_with_oreo_style_crumble.webp', label: "Chocolate fudge with oreo style crumble" },
  { url: '/recipes/FL-000007_chocolate_fudge_with_pistachio_crunch.webp', label: "Chocolate fudge with pistachio crunch" },
  { url: '/recipes/FL-000008_chocolate_fudge_with_protein_boost.webp', label: "Chocolate fudge with protein boost" },
  { url: '/recipes/FL-000009_chocolate_fudge_with_speculoos_crumble.webp', label: "Chocolate fudge with speculoos crumble" },
  { url: '/recipes/FL-000010_chocolate_fudge_with_toasted_coconut.webp', label: "Chocolate fudge with toasted coconut" },
  { url: '/recipes/FL-000021_vanilla_bean_with_toasted_coconut.webp', label: "Vanilla bean with toasted coconut" },
  { url: '/recipes/FL-000022_chocolate_fudge.webp', label: "Chocolate fudge" },
  { url: '/recipes/FL-000023_chocolate_fudge_with_biscuit_crumble.webp', label: "Chocolate fudge with biscuit crumble" },
  { url: '/recipes/FL-000024_chocolate_fudge_with_black_sesame_swirl.webp', label: "Chocolate fudge with black sesame swirl" },
  { url: '/recipes/FL-000025_chocolate_fudge_with_brown_butter.webp', label: "Chocolate fudge with brown butter" },
  { url: '/recipes/FL-000026_chocolate_fudge_with_brownie_pieces.webp', label: "Chocolate fudge with brownie pieces" },
  { url: '/recipes/FL-000027_chocolate_fudge_with_cheesecake_swirl.webp', label: "Chocolate fudge with cheesecake swirl" },
  { url: '/recipes/FL-000028_chocolate_fudge_with_chocolate_chips.webp', label: "Chocolate fudge with chocolate chips" },
  { url: '/recipes/FL-000029_chocolate_fudge_with_coconut_flakes.webp', label: "Chocolate fudge with coconut flakes" },
  { url: '/recipes/FL-000030_chocolate_fudge_with_cookie_dough.webp', label: "Chocolate fudge with cookie dough" },
  { url: '/recipes/FL-000031_chocolate_fudge_with_dark_chocolate.webp', label: "Chocolate fudge with dark chocolate" },
  { url: '/recipes/FL-000032_chocolate_fudge_with_dulce_de_leche_swirl.webp', label: "Chocolate fudge with dulce de leche swirl" },
  { url: '/recipes/FL-000033_chocolate_fudge_with_hazelnut_praline.webp', label: "Chocolate fudge with hazelnut praline" },
  { url: '/recipes/FL-000034_chocolate_fudge_with_honey_swirl.webp', label: "Chocolate fudge with honey swirl" },
  { url: '/recipes/FL-000035_chocolate_fudge_with_lemon_curd.webp', label: "Chocolate fudge with lemon curd" },
  { url: '/recipes/FL-000036_chocolate_fudge_with_mango_swirl.webp', label: "Chocolate fudge with mango swirl" },
  { url: '/recipes/FL-000037_chocolate_fudge_with_matcha_dust.webp', label: "Chocolate fudge with matcha dust" },
  { url: '/recipes/FL-000038_chocolate_fudge_with_milk_chocolate.webp', label: "Chocolate fudge with milk chocolate" },
  { url: '/recipes/FL-000039_chocolate_fudge_with_passion_fruit_swirl.webp', label: "Chocolate fudge with passion fruit swirl" },
  { url: '/recipes/FL-000040_chocolate_fudge_with_peanut_butter_swirl.webp', label: "Chocolate fudge with peanut butter swirl" },
  { url: '/recipes/FL-000051_vanilla_bean.webp', label: "Vanilla bean" },
  { url: '/recipes/FL-000052_vanilla_bean_with_biscuit_crumble.webp', label: "Vanilla bean with biscuit crumble" },
  { url: '/recipes/FL-000053_vanilla_bean_with_black_sesame_swirl.webp', label: "Vanilla bean with black sesame swirl" },
  { url: '/recipes/FL-000054_vanilla_bean_with_brown_butter.webp', label: "Vanilla bean with brown butter" },
  { url: '/recipes/FL-000055_vanilla_bean_with_brownie_pieces.webp', label: "Vanilla bean with brownie pieces" },
  { url: '/recipes/FL-000056_vanilla_bean_with_cheesecake_swirl.webp', label: "Vanilla bean with cheesecake swirl" },
  { url: '/recipes/FL-000057_vanilla_bean_with_chocolate_chips.webp', label: "Vanilla bean with chocolate chips" },
  { url: '/recipes/FL-000058_vanilla_bean_with_coconut_flakes.webp', label: "Vanilla bean with coconut flakes" },
  { url: '/recipes/FL-000059_vanilla_bean_with_cookie_dough.webp', label: "Vanilla bean with cookie dough" },
  { url: '/recipes/FL-000060_vanilla_bean_with_dark_chocolate.webp', label: "Vanilla bean with dark chocolate" },
  { url: '/recipes/FL-000061_vanilla_bean_with_dulce_de_leche_swirl.webp', label: "Vanilla bean with dulce de leche swirl" },
  { url: '/recipes/FL-000062_vanilla_bean_with_hazelnut_praline.webp', label: "Vanilla bean with hazelnut praline" },
  { url: '/recipes/FL-000063_vanilla_bean_with_honey_swirl.webp', label: "Vanilla bean with honey swirl" },
  { url: '/recipes/FL-000064_vanilla_bean_with_lemon_curd.webp', label: "Vanilla bean with lemon curd" },
  { url: '/recipes/FL-000065_vanilla_bean_with_mango_swirl.webp', label: "Vanilla bean with mango swirl" },
  { url: '/recipes/FL-000066_vanilla_bean_with_matcha_dust.webp', label: "Vanilla bean with matcha dust" },
  { url: '/recipes/FL-000067_vanilla_bean_with_milk_chocolate.webp', label: "Vanilla bean with milk chocolate" },
  { url: '/recipes/FL-000068_vanilla_bean_with_passion_fruit_swirl.webp', label: "Vanilla bean with passion fruit swirl" },
  { url: '/recipes/FL-000069_vanilla_bean_with_peanut_butter_swirl.webp', label: "Vanilla bean with peanut butter swirl" },
  { url: '/recipes/FL-000070_vanilla_bean_with_raspberry_ripple.webp', label: "Vanilla bean with raspberry ripple" },
  { url: '/recipes/FL-000071_vanilla_bean_with_sea_salt.webp', label: "Vanilla bean with sea salt" },
  { url: '/recipes/FL-000072_vanilla_bean_with_strawberry_ripple.webp', label: "Vanilla bean with strawberry ripple" },
  { url: '/recipes/FL-000073_vanilla_bean_with_white_chocolate.webp', label: "Vanilla bean with white chocolate" },
  { url: '/recipes/FL-000074_vanilla_bean_with_yuzu_ripple.webp', label: "Vanilla bean with yuzu ripple" },
  { url: '/recipes/FL-000075_chocolate_fudge_with_almond_crunch.webp', label: "Chocolate fudge with almond crunch" },
  { url: '/recipes/FL-000076_chocolate_fudge_with_blueberry_compote.webp', label: "Chocolate fudge with blueberry compote" },
  { url: '/recipes/FL-000077_chocolate_fudge_with_candied_citrus.webp', label: "Chocolate fudge with candied citrus" },
  { url: '/recipes/FL-000078_chocolate_fudge_with_cardamom.webp', label: "Chocolate fudge with cardamom" },
  { url: '/recipes/FL-000079_chocolate_fudge_with_chamoy_swirl.webp', label: "Chocolate fudge with chamoy swirl" },
  { url: '/recipes/FL-000080_chocolate_fudge_with_cherry_ripple.webp', label: "Chocolate fudge with cherry ripple" },
  { url: '/recipes/FL-000081_chocolate_fudge_with_chili_lime.webp', label: "Chocolate fudge with chili lime" },
  { url: '/recipes/FL-000082_chocolate_fudge_with_cinnamon.webp', label: "Chocolate fudge with cinnamon" },
  { url: '/recipes/FL-000083_chocolate_fudge_with_coffee_swirl.webp', label: "Chocolate fudge with coffee swirl" },
  { url: '/recipes/FL-000084_chocolate_fudge_with_cream_cheese.webp', label: "Chocolate fudge with cream cheese" },
  { url: '/recipes/FL-000085_chocolate_fudge_with_espresso_crunch.webp', label: "Chocolate fudge with espresso crunch" },
  { url: '/recipes/FL-000086_chocolate_fudge_with_graham_cracker.webp', label: "Chocolate fudge with graham cracker" },
  { url: '/recipes/FL-000087_chocolate_fudge_with_lavender.webp', label: "Chocolate fudge with lavender" },
  { url: '/recipes/FL-000088_chocolate_fudge_with_lime_zest.webp', label: "Chocolate fudge with lime zest" },
  { url: '/recipes/FL-000089_chocolate_fudge_with_maple_swirl.webp', label: "Chocolate fudge with maple swirl" },
  { url: '/recipes/FL-000090_chocolate_fudge_with_marshmallow_swirl.webp', label: "Chocolate fudge with marshmallow swirl" },
  { url: '/recipes/FL-000091_chocolate_fudge_with_mascarpone_cream.webp', label: "Chocolate fudge with mascarpone cream" },
  { url: '/recipes/FL-000092_chocolate_fudge_with_meringue_pieces.webp', label: "Chocolate fudge with meringue pieces" },
  { url: '/recipes/FL-000093_chocolate_fudge_with_mint.webp', label: "Chocolate fudge with mint" },
  { url: '/recipes/FL-000094_chocolate_fudge_with_orange_zest.webp', label: "Chocolate fudge with orange zest" },
  { url: '/recipes/FL-000095_chocolate_fudge_with_pecan_praline.webp', label: "Chocolate fudge with pecan praline" },
  { url: '/recipes/FL-000096_chocolate_fudge_with_rose_water.webp', label: "Chocolate fudge with rose water" },
  { url: '/recipes/FL-000097_chocolate_fudge_with_shortbread_crumble.webp', label: "Chocolate fudge with shortbread crumble" },
  { url: '/recipes/FL-000098_chocolate_fudge_with_tahini_swirl.webp', label: "Chocolate fudge with tahini swirl" },
  { url: '/recipes/FL-000099_chocolate_fudge_with_waffle_cone_crunch.webp', label: "Chocolate fudge with waffle cone crunch" },
  { url: '/recipes/FL-000100_chocolate_fudge_with_yogurt_tang.webp', label: "Chocolate fudge with yogurt tang" },
];

/** Suggest a library image from the recipe title, so the picker opens on a
 *  sensible default instead of a blank grid. Falls back to the first entry. */
export function suggestPublicationImage(title: string): PublicationImage {
  const words = title
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((word) => word.length > 3);
  const scored = PUBLICATION_IMAGES.map((image) => ({
    image,
    score: words.filter((word) => image.url.toLowerCase().includes(word)).length,
  }));
  const best = scored.reduce((winner, entry) => (entry.score > winner.score ? entry : winner));
  return best.score > 0 ? best.image : PUBLICATION_IMAGES[0]!;
}
