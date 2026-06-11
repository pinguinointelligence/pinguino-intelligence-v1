# PINGÜINO COMMERCIAL ECOSYSTEM — V1

**Status:** Canonical business-layer blueprint. Companion to [PINGUINO_MASTERPLAN_V1.md](PINGUINO_MASTERPLAN_V1.md), which remains the canonical product + technical blueprint for the app. This document defines the commercial ecosystem around the app; nothing in it changes the app's engine plan or build order.

**Created:** 2026-06-11 · **Document version:** 1.0 · **Implementation status:** planned only — no ecosystem feature, route, or table is implemented by this document.

---

## Table of contents

1. [Ecosystem overview](#1-ecosystem-overview)
2. [Four commercial offers](#2-four-commercial-offers)
3. [Public partner map — "Find PINGÜINO Gelato Near You"](#3-public-partner-map--find-pingüino-gelato-near-you)
4. [Partner branding](#4-partner-branding)
5. [Login & accounts](#5-login--accounts)
6. [Customer dashboard](#6-customer-dashboard)
   — [6A. Hello PI — conversational recipe creation assistant](#6a-hello-pi--conversational-recipe-creation-assistant)
7. [Website / app navigation](#7-website--app-navigation)
8. [Database additions (planned)](#8-database-additions-planned)
9. [Relation to the current MVP](#9-relation-to-the-current-mvp)
10. [Risks & open questions](#10-risks--open-questions)

---

## 1. Ecosystem overview

PINGÜINO is not only an app. It is a full commercial ecosystem: software, machines, ready mixtures, ingredient packs and a partner network that reinforce each other.

| Pillar | What it is |
|---|---|
| **PINGÜINO Intelligence** | The AI recipe app and production assistant — deterministic engine, PI indicators, exact corrections, labels (the subject of the masterplan) |
| **PINGÜINO Machines** | All-in-one gelato production / display / mobile machine offer — one machine instead of separate batch freezer, pozzetti, display showcase and mobile food cart |
| **PINGÜINO Ready Mixtures** | Ready-to-use mixtures and starter flavour packs produced by us, for clients who do not want to formulate |
| **PINGÜINO Ingredients** | Professional powders, bases and ingredient packs for clients who produce themselves |
| **PINGÜINO Partner Network** | The public map of shops using PINGÜINO — partner marketing, verified badges, public flavour pages |

**The flywheel:** the app attracts professional producers → producers join the partner map → the public map markets the brand to consumers and new operators → new operators buy machines and mixtures (no formulation skill needed) → formulating producers buy ingredient packs → every pillar feeds app subscriptions, and the app makes every physical product smarter.

---

## 2. Four commercial offers

> Pricing, machine models and pack SKUs are **TBD** (business data pending). Structure below is canonical; numbers come later.

### Offer 1 — App Only

**For:** gelato shops, cafés, restaurants and producers that already have their own machines.

Includes:

- recipe calculator
- AI recipe assistant
- ingredient database
- PI Profile Indicators
- exact correction grams (Pro)
- label generator
- recipe library
- production sheet
- Actual Batch Mode

### Offer 2 — Machine + App

**For:** cafés, bars, restaurants, hotels, catering, events, food trucks and new operators.

Includes:

- PINGÜINO machine / all-in-one hardware — **no need for a separate batch freezer, pozzetti, display showcase or mobile food cart**
- app subscription
- starter recipes
- training
- optional starter ingredients

### Offer 3 — Machine + Ready Mixtures

**For:** clients who do not want to formulate recipes at all.

Includes:

- machine
- ready mixtures produced by us
- starter flavour packs
- rotating seasonal flavours
- standard flavours
- premium flavours
- signature flavours
- simplified operation without needing the full app

### Offer 4 — Ingredients / Powder Packs

**For:** clients who produce themselves but want professional inputs.

Includes:

- base powders
- sugars
- stabilizers
- inulin
- flavour packs
- recipe packs
- ingredient packs for ECO / CLASSIC / PREMIUM / SIGNATURE production
- optional app access

---

## 3. Public partner map — "Find PINGÜINO Gelato Near You"

A public website section where consumers find shops serving PINGÜINO gelato. Listing is **opt-in** per shop location (`is_public`).

Each shop profile can include:

| Field | Notes |
|---|---|
| Company name | legal/brand owner |
| Shop name | public-facing name |
| Location / address | street, city, country |
| Map coordinates | lat/lng |
| Opening hours | structured (per weekday) |
| PINGÜINO verified badge | per §4 criteria |
| Machine type | from the machine catalog |
| Available flavours | linked to the public flavour registry |
| Seasonal flavours | with availability windows |
| Signature flavours | partner's own, badge-eligible |
| Photos | shop + product |
| Website / Instagram links | external |
| Public flavour page | per-shop page listing live flavours |

Map provider (Google Maps / Mapbox / Leaflet+OSM) is **deferred to build time** (stage E2, §9). Publicly displayed shop data is subject to the GDPR note in §10.

---

## 4. Partner branding

Badge artwork follows the Design Lock (masterplan §3) — ivory/charcoal, no candy styling. Award criteria (one line each; formal program rules come with stage E4):

| Badge | Meaning / award criteria |
|---|---|
| **Made with PINGÜINO Intelligence** | The recipe was formulated and balanced in the app |
| **PINGÜINO Verified Flavour** | Recipe + ingredients reviewed and verified by PINGÜINO |
| **PINGÜINO Partner** | Active partner: subscribed shop, listed on the map, meets program terms |
| **PINGÜINO Signature Flavour** | A partner's signature-mode flavour accepted into the signature program |
| **Powered by PINGÜINO** | The shop runs on PINGÜINO machines and/or mixtures |

---

## 5. Login & accounts

Authentication via **Supabase Auth**: email + password first (already planned in app Phase 2), **Google OAuth later**.

The account surface must support:

- email + password login
- Google login (later)
- company profile
- user profile
- subscription plan
- role: owner / staff / admin
- shop locations
- saved recipes
- machines owned
- mixture orders
- ingredient orders

**Reconciliation with masterplan §17:** `profiles` stays the personal record (`plan`, platform-wide `is_admin`). Company membership and **company-scoped roles** (`owner` / `staff` / `admin`) live in the new `staff_members` table (§8) — a platform admin (PINGÜINO staff) is a different concept from a company admin (customer's manager). **Open question:** whether subscriptions later attach to `companies` instead of users (see §10).

---

## 6. Customer dashboard

Logged-in users get one dashboard with:

| Area | Content |
|---|---|
| Recipes | saved recipes, variants, favorites (app) |
| Ingredients | personal/company ingredient database (app) |
| Labels | generated labels, batch history (app) |
| Machines | machines owned, serials, warranty |
| Orders | mixture + ingredient + machine orders, status |
| Shop profile | company + location data |
| Public map visibility | opt-in toggle, preview of the public profile |
| Subscription | plan, billing |
| Team / staff access | invite staff, set roles |
| Settings | account, locale, preferences |

### 6A. Hello PI — conversational recipe creation assistant

**Core feature (planned).** Hello PI is the conversational entry point into PINGÜINO Intelligence. The user can either **chat with PI by text** or **talk to PI by voice chat** (voice in a later phase).

**Purpose:** the user should not always need to start from forms and tables. They simply tell PI what they want to create:

- "Hello PI, I want to create a premium raspberry gelato with the maximum possible fruit, served at −11 °C."
- "Create a Jim Beam gelato that tastes strong but does not melt."
- "I want a vegan pistachio gelato, not too sweet, for a 2 liter machine."
- "Make an ECO chocolate recipe for a hotel buffet."
- "I accidentally added too much sugar, help me fix the batch."

**Follow-up questions** PI asks when information is missing:

- What product category? (milk gelato, sorbet, vegan, alcohol, nut, chocolate, fruit, custom)
- Which recipe mode? (ECO / CLASSIC / PREMIUM / SIGNATURE)
- What target serving temperature?
- What batch size or machine capacity?
- Maximum flavour, lowest cost, or balanced result?
- Which main ingredient should be preserved?
- Are any ingredients already physically added to the batch?

**Hard AI boundary (masterplan §9, §18 — restated):** Hello PI must connect to the deterministic recipe engine. **AI never invents the final math.** PI collects intent, clarifies goals, explains options and creates **structured recipe requests**; the deterministic engine calculates all recipe values, indicators and corrections.

**Structured output schema** (persisted as `ai_recipe_intents`, §8):

- detected product type
- selected recipe mode
- target temperature
- batch size
- main ingredient
- flavour priority
- dietary constraints
- suggested starting recipe
- missing information
- next recommended action

**Voice chat (later phase — architecture-ready now).** Hands-free interaction during production:

- "PI, I added 50 grams instead of 35 grams."
- "PI, what do I add now?"
- "PI, make this more premium."
- "PI, save this recipe."
- "PI, create the label."

The architecture must support voice from day one of Hello PI's design, even though voice ships later:

- conversation sessions
- transcript storage
- recipe context carried across turns
- voice input/output **provider abstraction** (no hard dependency on one vendor)
- future real-time assistant integration

**UI surfaces:**

- a prominent button on the dashboard
- an assistant panel inside the recipe builder
- an optional floating assistant during production
- a voice/chat toggle

**Access tiers:**

| Tier | Hello PI capability |
|---|---|
| **Demo** | Limited mode: PI understands the request, asks smart follow-up questions and previews what it would do. **Never reveals exact correction grams or full Pro recipes.** Upgrade prompts: *"Unlock Pro to let Hello PI calculate exact correction grams."* · *"Unlock Pro to turn this conversation into a production-ready recipe."* · *"Voice production assistant is available in Pro."* |
| **Pro** | Full text assistant · exact recipe generation · exact correction instructions · label text generation · recipe saving · production guidance |
| **Admin** | Inspect AI logs · improve prompts · manage system instructions · review ingredient extraction confidence |

**Phasing:** text assistant slots into the app's AI phase (masterplan §20 Phase 3, extending the `ai-assistant` Edge Function); voice mode is a later phase (Phase 5+ / ecosystem stages). **Not implemented by this revision.**

---

## 7. Website / app navigation

Route names are indicative; final naming at build time. "Planned (masterplan)" = already in the app blueprint; "new (ecosystem)" = added by this document.

### Public pages

| Page | Route (indicative) | Status |
|---|---|---|
| Home | `/` | **live** |
| Start PI Demo | `/demo` | **live** (placeholder studio) |
| PINGÜINO Intelligence | `/intelligence` | new (ecosystem) — product marketing page |
| PINGÜINO Machines | `/machines` | new (ecosystem) |
| PINGÜINO Ready Mixtures | `/ready-mixtures` | new (ecosystem) |
| PINGÜINO Ingredients | `/ingredient-packs` | new (ecosystem) — distinct from the app's `/ingredients` database |
| Partner Map | `/partners` | new (ecosystem) — "Find PINGÜINO Gelato Near You" |
| Pricing | `/pricing` | planned (masterplan §7) |
| Login | `/auth/login` | planned (masterplan §7) |
| Apply as Partner / Contact | `/partners/apply` | new (ecosystem) |

### Logged-in pages

| Page | Route (indicative) | Status |
|---|---|---|
| Dashboard | `/dashboard` | new (ecosystem) |
| Create Recipe | `/studio` | planned (masterplan §7) |
| Recipe Library | `/library` | planned (masterplan §7) |
| Ingredient Database | `/ingredients` | planned (masterplan §7) |
| Label Generator | `/labels/:recipeId` | planned (masterplan §7) |
| Actual Batch Mode | within `/studio` | planned (masterplan §7–§8) |
| Company Profile | `/account/company` | new (ecosystem) |
| My Machines | `/account/machines` | new (ecosystem) |
| My Orders | `/account/orders` | new (ecosystem) |
| My Shop Location | `/account/locations` | new (ecosystem) |
| Subscription | `/account/subscription` | planned (masterplan §5/§20 Phase 4) |
| Settings | `/settings` | planned (masterplan §7) |
| Admin | `/admin` | planned (masterplan §7) |

---

## 8. Database additions (planned)

> **Planned only — do not implement yet.** No migrations ship with this document. Tables arrive with their rollout stage (§9). Column lists are proposals to be finalized at implementation time. All tables follow the masterplan §17 RLS philosophy: company-scoped access via `staff_members` membership, own-rows for personal data, public read only for explicitly published records.

### Commerce & partner tables

| Table | Key columns (proposed) |
|---|---|
| `companies` | id, owner_user_id → profiles, name, legal_name, vat_id, country, billing_email, created_at, updated_at |
| `company_locations` | id, company_id, shop_name, address, city, country, lat, lng, opening_hours jsonb, phone, website, instagram, photos text[], is_public, is_verified, created_at, updated_at |
| `machines` *(catalog)* | id, model_code, name, type (production / display / mobile / all_in_one), capacity_liters, specs jsonb, status (draft / active / discontinued) |
| `customer_machines` | id, company_id, machine_id, location_id, serial_number, purchased_at, warranty_until, notes |
| `product_offers` | id, key (app_only / machine_app / machine_mixtures / ingredient_packs), name, description, components jsonb, is_active |
| `mixture_packs` | id, name, flavour, category (starter / standard / premium / signature / seasonal), description, contents jsonb, allergens text[], unit_size, status |
| `ingredient_packs` | id, name, target_mode (eco / classic / premium / signature / universal), description, contents jsonb, unit_size, status |
| `orders` | id, company_id, placed_by → profiles, order_type (machine / mixture / ingredient / mixed), status (draft / placed / confirmed / shipped / delivered / cancelled), currency, total_amount, created_at, updated_at |
| `order_items` | id, order_id, item_type (machine / mixture_pack / ingredient_pack), item_id, quantity, unit_price, line_total |
| `public_flavours` | id, name, slug, description, image_url, badge_id NULL → partner_badges, created_at — the global registry powering public flavour pages |
| `shop_flavours` | id, location_id, public_flavour_id, kind (standard / seasonal / signature), available_from, available_to, is_active |
| `partner_badges` | id, key (made_with_pi / verified_flavour / partner / signature_flavour / powered_by), name, criteria, artwork_url |
| `staff_members` | id, company_id, user_id → profiles, role (owner / staff / admin), status (invited / active / disabled), invited_at, joined_at |

### Hello PI tables (§6A)

| Table | Key columns (proposed) |
|---|---|
| `ai_conversations` | id, user_id → profiles, company_id NULL, recipe_id NULL → recipes, channel (text / voice), title, status (active / archived), created_at, updated_at |
| `ai_messages` | id, conversation_id, role (user / assistant / system), content, structured_json NULL, created_at |
| `ai_recipe_intents` | id, conversation_id, message_id, detected_product_type, recipe_mode, target_temperature, batch_grams, main_ingredient, flavour_priority, dietary jsonb, missing_information jsonb, suggested_recipe jsonb, next_action, engine_request jsonb, created_at — the §6A structured output, the bridge from conversation to the deterministic engine |
| `voice_sessions` | id, conversation_id, provider, started_at, ended_at, duration_seconds, metadata jsonb — provider-abstracted per §6A |
| `voice_transcripts` | id, voice_session_id, sequence, speaker (user / pi), text, started_at_ms, confidence |

Relations to the existing app schema (masterplan §17): `staff_members.user_id` and `ai_conversations.user_id` reference `profiles`; `ai_conversations.recipe_id` references `recipes`; `ai_messages`/`ai_recipe_intents` complement (not replace) the existing `ai_logs` audit table.

---

## 9. Relation to the current MVP

**The app build order (masterplan §20) is unchanged.** Step 4 — the deterministic engine — remains the next build step. Nothing in this document blocks or reorders app Phases 1–5.

| In the MVP now (app Phases 1–5) | Later (ecosystem stages) |
|---|---|
| App demo | Machine catalog |
| Recipe builder | Ready mixtures ordering |
| PI panel | Ingredient packs ordering |
| Label preview | Partner map |
| Subscription gating | Public flavour pages |
| | Customer shop profiles |

**Ecosystem rollout staging** (subordinate to the app build order; indicative):

- **E1 — Public marketing pages:** Machines / Ready Mixtures / Ingredients / Intelligence pages, Apply as Partner form. Static content, no new tables.
- **E2 — Accounts & partner map:** companies, locations, staff roles, dashboard shell, opt-in public map.
- **E3 — Commerce:** product offers, mixture/ingredient pack catalogs, orders.
- **E4 — Brand program:** badges, public flavour registry and per-shop flavour pages.
- **Hello PI:** text assistant with the app's AI phase (masterplan Phase 3); voice mode later (§6A phasing).

---

## 10. Risks & open questions

1. **Machine lineup & specs TBD** — models, capacities, suppliers and certifications pending; §2 carries placeholders.
2. **Pricing TBD** — all four offers need pricing and packaging decisions.
3. **Subscription owner** — user-level today (masterplan §17); may move to company-level when companies/staff arrive (E2). Decide before E2 schema work.
4. **Food-regulatory requirements** — selling ready mixtures and ingredient packs triggers food-business obligations (HACCP, labeling, traceability) separate from software; needs business-side ownership before E3.
5. **GDPR / public shop data** — partner map publishes business data and photos; opt-in consent and takedown flow required at E2.
6. **Map provider** — Google Maps vs Mapbox vs Leaflet+OSM; cost vs polish; decide at E2.
7. **Voice provider & cost** — §6A's provider abstraction exists precisely because real-time voice vendors/pricing change quickly; decide at voice phase.
8. **Route naming** — marketing pages vs app pages share words (ingredients); the §7 namespacing proposal resolves it but needs final naming at build time.
