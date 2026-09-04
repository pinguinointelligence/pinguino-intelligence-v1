/** Resolved published Main policy per canonical fresh fruit (product_behavior_policy_versions,
 * status=published, product_profile=milk_gelato, most specific match). Read from the staging
 * database on 2026-09-05; NOT hand-written. All 55 rows of Mapper
 * category=fruit / subcategory=fresh_fruit_profile. */
export const FRESH_FRUIT_MAIN_POLICIES = {
  fruit: { key: 'main-fruit-fresh-dairy', eco: 20, ceiling: 35, hard: 45 },
  berry: { key: 'main-berry-fresh-dairy', eco: 25, ceiling: 35, hard: 45 },
  banana: { key: 'main-banana-fresh-dairy', eco: 10, ceiling: 20, hard: 30 },
  kiwi: { key: 'main-kiwi-fresh-dairy', eco: 10, ceiling: 15, hard: 20 },
} as const;

/** Every fruit requires a liquid dairy carrier at 30 % and carries equivalent factor 1. */
export const FRESH_FRUIT_CARRIER_FLOOR_PERCENT = 30;

export const FRESH_FRUITS: readonly {
  id: string;
  name: string;
  policy: keyof typeof FRESH_FRUIT_MAIN_POLICIES;
}[] = [
  { id: 'PI-ING-000341', name: 'ACAI BERRIES \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000343', name: 'APPLE \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000344', name: 'APRICOTS \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000345', name: 'BANANA \u00b7 Fresh Fruit', policy: 'banana' },
  { id: 'PI-ING-000346', name: 'BLACK CURRANT \u00b7 Fresh Fruit', policy: 'berry' },
  { id: 'PI-ING-000347', name: 'BLUEBERRY \u00b7 Fresh Fruit', policy: 'berry' },
  { id: 'PI-ING-000348', name: 'CARAMBOLA \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000349', name: 'CHERIMOYA \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000350', name: 'CHERRY TOMATOES \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000352', name: 'ELDERBERRY \u00b7 Fresh Fruit', policy: 'berry' },
  { id: 'PI-ING-000354', name: 'FIGS \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000361', name: 'GOOSEBERRY \u00b7 Fresh Fruit', policy: 'berry' },
  { id: 'PI-ING-000363', name: 'GRAPEFRUIT \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000364', name: 'GUAVA \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000365', name: 'HASKAP BERRY \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000366', name: 'KIWI \u00b7 Fresh Fruit', policy: 'kiwi' },
  { id: 'PI-ING-000367', name: 'KUMQUATS \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000369', name: 'LIME \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000370', name: 'LINGONBERRY \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000371', name: 'LOQUAT \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000372', name: 'LYCHEE \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000375', name: 'MELON CANTALOUP \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000376', name: 'MELON HONEYDEW \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000377', name: 'NECTARINE \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000380', name: 'ORANGES \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000381', name: 'PAPAYA \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000385', name: 'PEACH \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000387', name: 'PEAR \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000388', name: 'PERSIMMON KAKI \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000390', name: 'PINEAPPLE \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000391', name: 'PLUM JAM \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000392', name: 'POMEGRANATE \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000393', name: 'POMELO POMMELO SHADDOCK \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000394', name: 'RASPBERRIES \u00b7 Fresh Fruit', policy: 'berry' },
  { id: 'PI-ING-000395', name: 'RASPBERRY TOMATO \u00b7 Fresh Fruit', policy: 'berry' },
  { id: 'PI-ING-000396', name: 'RAW BLACKBERRIES \u00b7 Fresh Fruit', policy: 'berry' },
  { id: 'PI-ING-000397', name: 'RED CURRANT \u00b7 Fresh Fruit', policy: 'berry' },
  {
    id: 'PI-ING-000398',
    name: 'RED GRAPEFRUIT NECTAR CONCENTRATED \u00b7 Purena Fresh Fruit \u00b7 50%',
    policy: 'fruit',
  },
  {
    id: 'PI-ING-000399',
    name: 'ROASTED APPLE \u00b7 Alfapro Fresh Fruit \u00b7 0013808',
    policy: 'fruit',
  },
  { id: 'PI-ING-000400', name: 'ROSE HIP \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000401', name: 'ROSEHIP \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000402', name: 'SWEET CHERRIES \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000404', name: 'TAYBERRY \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000405', name: 'WATERMELON \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-000406', name: 'WILD STRAWBERRY \u00b7 Fresh Fruit', policy: 'berry' },
  { id: 'PI-ING-001405', name: 'GRAPE GREEN \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-001406', name: 'GRAPE \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-001408', name: 'SOUR CHERRIES \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-001421', name: 'PLUMS \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-001494', name: 'QUINCES \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-001497', name: 'RHUBARB \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-001499', name: 'SEA BUCKTHORN \u00b7 Fresh Fruit', policy: 'fruit' },
  { id: 'PI-ING-001553', name: 'STRAWBERRIES \u00b7 Fresh Fruit', policy: 'berry' },
  { id: 'PI-ING-001556', name: 'CRANBERRY \u00b7 Fresh Fruit', policy: 'berry' },
  { id: 'PI-ING-001558', name: 'MELON \u00b7 Fresh Fruit', policy: 'fruit' },
];
