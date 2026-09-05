/**
 * ISO 3166-1 alpha-2 — the SHARED MARKET VOCABULARY.
 *
 * This is a REFERENCE VOCABULARY, not a business authority. It answers exactly
 * one question: "is this string a real market code?" It never answers whether
 * Gellatti sells there, ships there, or has a product default there.
 *
 * The two business authorities stay exactly where they are and remain separate:
 *   - `catalog_market_countries`  -> Product / market availability
 *   - `shop_countries`            -> Shop availability, shipping, Local Starter Pack
 * Both are SUBSETS of this vocabulary. Adding a code here supports NOTHING on its
 * own; it only makes the code spellable.
 *
 * WHY THIS EXISTS: country validation was `/^[a-z]{2}$/i` — any two letters were
 * accepted, so "XX" or "QQ" could be written into a product country preference
 * or a slot assignment and nothing would object.
 *
 * PROVENANCE: the 249 officially assigned codes (Wikipedia ISO 3166-1 alpha-2,
 * fetched 2026-09-05), independently cross-validated — every code is recognised
 * by this runtime's ICU region data. Exceptionally reserved (AC, EU, UK, UN…),
 * user-assigned (XK) and CLDR aggregates (QO) are deliberately EXCLUDED: ICU
 * alone yields 280 regions, which is a superset of ISO 3166-1.
 */

/** Officially assigned ISO 3166-1 alpha-2 codes with their English reference names. */
export const ISO_3166_1_ALPHA2 = new Map<string, string>([
  ['AD', 'Andorra'],
  ['AE', 'United Arab Emirates'],
  ['AF', 'Afghanistan'],
  ['AG', 'Antigua & Barbuda'],
  ['AI', 'Anguilla'],
  ['AL', 'Albania'],
  ['AM', 'Armenia'],
  ['AO', 'Angola'],
  ['AQ', 'Antarctica'],
  ['AR', 'Argentina'],
  ['AS', 'American Samoa'],
  ['AT', 'Austria'],
  ['AU', 'Australia'],
  ['AW', 'Aruba'],
  ['AX', 'Åland Islands'],
  ['AZ', 'Azerbaijan'],
  ['BA', 'Bosnia & Herzegovina'],
  ['BB', 'Barbados'],
  ['BD', 'Bangladesh'],
  ['BE', 'Belgium'],
  ['BF', 'Burkina Faso'],
  ['BG', 'Bulgaria'],
  ['BH', 'Bahrain'],
  ['BI', 'Burundi'],
  ['BJ', 'Benin'],
  ['BL', 'St. Barthélemy'],
  ['BM', 'Bermuda'],
  ['BN', 'Brunei'],
  ['BO', 'Bolivia'],
  ['BQ', 'Caribbean Netherlands'],
  ['BR', 'Brazil'],
  ['BS', 'Bahamas'],
  ['BT', 'Bhutan'],
  ['BV', 'Bouvet Island'],
  ['BW', 'Botswana'],
  ['BY', 'Belarus'],
  ['BZ', 'Belize'],
  ['CA', 'Canada'],
  ['CC', 'Cocos (Keeling) Islands'],
  ['CD', 'Congo - Kinshasa'],
  ['CF', 'Central African Republic'],
  ['CG', 'Congo - Brazzaville'],
  ['CH', 'Switzerland'],
  ['CI', 'Côte d’Ivoire'],
  ['CK', 'Cook Islands'],
  ['CL', 'Chile'],
  ['CM', 'Cameroon'],
  ['CN', 'China'],
  ['CO', 'Colombia'],
  ['CR', 'Costa Rica'],
  ['CU', 'Cuba'],
  ['CV', 'Cape Verde'],
  ['CW', 'Curaçao'],
  ['CX', 'Christmas Island'],
  ['CY', 'Cyprus'],
  ['CZ', 'Czechia'],
  ['DE', 'Germany'],
  ['DJ', 'Djibouti'],
  ['DK', 'Denmark'],
  ['DM', 'Dominica'],
  ['DO', 'Dominican Republic'],
  ['DZ', 'Algeria'],
  ['EC', 'Ecuador'],
  ['EE', 'Estonia'],
  ['EG', 'Egypt'],
  ['EH', 'Western Sahara'],
  ['ER', 'Eritrea'],
  ['ES', 'Spain'],
  ['ET', 'Ethiopia'],
  ['FI', 'Finland'],
  ['FJ', 'Fiji'],
  ['FK', 'Falkland Islands'],
  ['FM', 'Micronesia'],
  ['FO', 'Faroe Islands'],
  ['FR', 'France'],
  ['GA', 'Gabon'],
  ['GB', 'United Kingdom'],
  ['GD', 'Grenada'],
  ['GE', 'Georgia'],
  ['GF', 'French Guiana'],
  ['GG', 'Guernsey'],
  ['GH', 'Ghana'],
  ['GI', 'Gibraltar'],
  ['GL', 'Greenland'],
  ['GM', 'Gambia'],
  ['GN', 'Guinea'],
  ['GP', 'Guadeloupe'],
  ['GQ', 'Equatorial Guinea'],
  ['GR', 'Greece'],
  ['GS', 'South Georgia & South Sandwich Islands'],
  ['GT', 'Guatemala'],
  ['GU', 'Guam'],
  ['GW', 'Guinea-Bissau'],
  ['GY', 'Guyana'],
  ['HK', 'Hong Kong SAR China'],
  ['HM', 'Heard & McDonald Islands'],
  ['HN', 'Honduras'],
  ['HR', 'Croatia'],
  ['HT', 'Haiti'],
  ['HU', 'Hungary'],
  ['ID', 'Indonesia'],
  ['IE', 'Ireland'],
  ['IL', 'Israel'],
  ['IM', 'Isle of Man'],
  ['IN', 'India'],
  ['IO', 'British Indian Ocean Territory'],
  ['IQ', 'Iraq'],
  ['IR', 'Iran'],
  ['IS', 'Iceland'],
  ['IT', 'Italy'],
  ['JE', 'Jersey'],
  ['JM', 'Jamaica'],
  ['JO', 'Jordan'],
  ['JP', 'Japan'],
  ['KE', 'Kenya'],
  ['KG', 'Kyrgyzstan'],
  ['KH', 'Cambodia'],
  ['KI', 'Kiribati'],
  ['KM', 'Comoros'],
  ['KN', 'St. Kitts & Nevis'],
  ['KP', 'North Korea'],
  ['KR', 'South Korea'],
  ['KW', 'Kuwait'],
  ['KY', 'Cayman Islands'],
  ['KZ', 'Kazakhstan'],
  ['LA', 'Laos'],
  ['LB', 'Lebanon'],
  ['LC', 'St. Lucia'],
  ['LI', 'Liechtenstein'],
  ['LK', 'Sri Lanka'],
  ['LR', 'Liberia'],
  ['LS', 'Lesotho'],
  ['LT', 'Lithuania'],
  ['LU', 'Luxembourg'],
  ['LV', 'Latvia'],
  ['LY', 'Libya'],
  ['MA', 'Morocco'],
  ['MC', 'Monaco'],
  ['MD', 'Moldova'],
  ['ME', 'Montenegro'],
  ['MF', 'St. Martin'],
  ['MG', 'Madagascar'],
  ['MH', 'Marshall Islands'],
  ['MK', 'North Macedonia'],
  ['ML', 'Mali'],
  ['MM', 'Myanmar (Burma)'],
  ['MN', 'Mongolia'],
  ['MO', 'Macao SAR China'],
  ['MP', 'Northern Mariana Islands'],
  ['MQ', 'Martinique'],
  ['MR', 'Mauritania'],
  ['MS', 'Montserrat'],
  ['MT', 'Malta'],
  ['MU', 'Mauritius'],
  ['MV', 'Maldives'],
  ['MW', 'Malawi'],
  ['MX', 'Mexico'],
  ['MY', 'Malaysia'],
  ['MZ', 'Mozambique'],
  ['NA', 'Namibia'],
  ['NC', 'New Caledonia'],
  ['NE', 'Niger'],
  ['NF', 'Norfolk Island'],
  ['NG', 'Nigeria'],
  ['NI', 'Nicaragua'],
  ['NL', 'Netherlands'],
  ['NO', 'Norway'],
  ['NP', 'Nepal'],
  ['NR', 'Nauru'],
  ['NU', 'Niue'],
  ['NZ', 'New Zealand'],
  ['OM', 'Oman'],
  ['PA', 'Panama'],
  ['PE', 'Peru'],
  ['PF', 'French Polynesia'],
  ['PG', 'Papua New Guinea'],
  ['PH', 'Philippines'],
  ['PK', 'Pakistan'],
  ['PL', 'Poland'],
  ['PM', 'St. Pierre & Miquelon'],
  ['PN', 'Pitcairn Islands'],
  ['PR', 'Puerto Rico'],
  ['PS', 'Palestinian Territories'],
  ['PT', 'Portugal'],
  ['PW', 'Palau'],
  ['PY', 'Paraguay'],
  ['QA', 'Qatar'],
  ['RE', 'Réunion'],
  ['RO', 'Romania'],
  ['RS', 'Serbia'],
  ['RU', 'Russia'],
  ['RW', 'Rwanda'],
  ['SA', 'Saudi Arabia'],
  ['SB', 'Solomon Islands'],
  ['SC', 'Seychelles'],
  ['SD', 'Sudan'],
  ['SE', 'Sweden'],
  ['SG', 'Singapore'],
  ['SH', 'St. Helena'],
  ['SI', 'Slovenia'],
  ['SJ', 'Svalbard & Jan Mayen'],
  ['SK', 'Slovakia'],
  ['SL', 'Sierra Leone'],
  ['SM', 'San Marino'],
  ['SN', 'Senegal'],
  ['SO', 'Somalia'],
  ['SR', 'Suriname'],
  ['SS', 'South Sudan'],
  ['ST', 'São Tomé & Príncipe'],
  ['SV', 'El Salvador'],
  ['SX', 'Sint Maarten'],
  ['SY', 'Syria'],
  ['SZ', 'Eswatini'],
  ['TC', 'Turks & Caicos Islands'],
  ['TD', 'Chad'],
  ['TF', 'French Southern Territories'],
  ['TG', 'Togo'],
  ['TH', 'Thailand'],
  ['TJ', 'Tajikistan'],
  ['TK', 'Tokelau'],
  ['TL', 'Timor-Leste'],
  ['TM', 'Turkmenistan'],
  ['TN', 'Tunisia'],
  ['TO', 'Tonga'],
  ['TR', 'Türkiye'],
  ['TT', 'Trinidad & Tobago'],
  ['TV', 'Tuvalu'],
  ['TW', 'Taiwan'],
  ['TZ', 'Tanzania'],
  ['UA', 'Ukraine'],
  ['UG', 'Uganda'],
  ['UM', 'U.S. Outlying Islands'],
  ['US', 'United States'],
  ['UY', 'Uruguay'],
  ['UZ', 'Uzbekistan'],
  ['VA', 'Vatican City'],
  ['VC', 'St. Vincent & Grenadines'],
  ['VE', 'Venezuela'],
  ['VG', 'British Virgin Islands'],
  ['VI', 'U.S. Virgin Islands'],
  ['VN', 'Vietnam'],
  ['VU', 'Vanuatu'],
  ['WF', 'Wallis & Futuna'],
  ['WS', 'Samoa'],
  ['YE', 'Yemen'],
  ['YT', 'Mayotte'],
  ['ZA', 'South Africa'],
  ['ZM', 'Zambia'],
  ['ZW', 'Zimbabwe'],
]);

export type MarketCode = string;

/** Every officially assigned code, sorted. */
export const ISO_MARKET_CODES: readonly string[] = Object.freeze([...ISO_3166_1_ALPHA2.keys()]);

/**
 * Normalize a candidate to a real market code, or null.
 * Replaces the `/^[a-z]{2}$/i` shape check: shape is necessary, membership is
 * what actually makes a code real.
 */
export function marketCode(value: unknown): MarketCode | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  return ISO_3166_1_ALPHA2.has(upper) ? upper : null;
}

/** Reference English name. Display names stay with the locale layer, not here. */
export function marketReferenceName(code: string): string | null {
  return ISO_3166_1_ALPHA2.get(code.trim().toUpperCase()) ?? null;
}

/**
 * How a market stands relative to a business authority's supported set.
 * SUPPORTED   — the authority lists it
 * UNSUPPORTED — a real market the authority does not list yet
 * UNKNOWN     — not a real market code at all
 */
export type MarketSupport = 'SUPPORTED' | 'UNSUPPORTED' | 'UNKNOWN';

export function marketSupport(value: unknown, supported: Iterable<string>): MarketSupport {
  const code = marketCode(value);
  if (code === null) return 'UNKNOWN';
  for (const entry of supported) {
    if (typeof entry === 'string' && entry.trim().toUpperCase() === code) return 'SUPPORTED';
  }
  return 'UNSUPPORTED';
}
