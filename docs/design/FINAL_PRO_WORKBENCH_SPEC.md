# Final PINGÜINO Pro Workbench

## Product contract

The Pro recipe workflow is a single 100dvh workspace. The document does not scroll during normal desktop work. The ingredient list and expanded cockpit content are the only controlled vertical scroll regions.

Component hierarchy:

```text
AppShell
├─ header: canonical logo · change state · Przelicz z PI · score · PRO · hamburger
└─ StudioEngineSurface
   ├─ IngredientBuilder (62%)
   │  ├─ compact search/add
   │  ├─ recipe or production table
   │  └─ internal ingredient scroll
   ├─ RecipeProfilePanel (38%)
   │  ├─ Profil receptury
   │  ├─ Monitor
   │  ├─ Produkcja
   │  └─ Podsumowanie
   ├─ ProWorkbar: save · name · context · state · undo
   └─ mobile cockpit bottom sheet
```

## Visual tokens

- Base: white `#fff`, ink `#101113`, graphite `#25272b`, quiet stone greys.
- Primary actions: ink background with white text.
- Gold: exact optimum.
- Green: acceptable/safe.
- Red: attention/outside safe range and owner-decision labels.
- Pink: `--color-nonproduction-pink: #a8256b` only for incomplete/test/review/partial states.
- Borders: thin, precise, low-opacity ink; shadows restrained.
- No Pro navy background or dark laboratory surface.
- `.bracket-note` supplies the requested editorial measurement brackets for contextual explanations.

## Canonical logo lock

- Rendered asset: `public/brand/favicon.svg`.
- Intrinsic viewBox: 64 × 64; aspect ratio 1:1.
- SHA-256: `6a0738acafdfbcaf970f51384a14a8dd670bd68e0d7a6254017f4f2dda3bac58`.
- The file was not edited, recolored, cropped, stretched, or regenerated.
- Reference sheet retained unchanged: `public/brand/logo_reference.jpeg`, 1000 × 1000, SHA-256 `8d28d57b5eb0708881a3b11a291f3c3092dd7e4108da6ed36aeed2083ce67dd7`.

## Ingredient modes

Recipe columns are Ingredient, Percentage, disabled pink percentage lock, Grams, working gram lock, customer role, availability, Price/kg and actions. “Actual” grams are not shown in recipe mode.

Production removes search, add, locks, role, availability editing and delete controls. It shows Ingredient, Planned, Actual, Difference and Status. The whole mode is pink because production persistence and rescue logic are not connected.

## Cockpit behavior

- Profile: real technical score; four final-direction controls in pink UI-only state; Structure and Stability are read-only; compact machine/product/quality/batch/serving settings; nutrition and cost.
- Score click: replaces Profile locally with a six-axis educational cockpit. It never changes route and never displays fabricated impact deltas.
- Monitor: mounts the complete historical Monitor modules. Every calculated value remains available. Protected scales expose current value/position/text, not internal boundaries, in red–green–gold–green–red order.
- Production: final workflow location and physical-rule explanation, disabled/pink until repositories and solver contract are connected.
- Summary: current ingredients, nutrition/cost, label/allergen and export-ready locations with truthful sample/unconnected states.

## Navigation

The hamburger is the only global navigation. It contains all accepted destinations, including work-with-us, Create Ingredient, API, product import and all ten Pro routes. The four right-panel tabs are recipe-local controls, not routes.

## Responsive contract

- Desktop: 62/38 split, fixed header and recipe bar, internal scroll only.
- Mobile: ingredient cards remain primary; compact score trigger opens the same cockpit in a bottom sheet; no horizontal-scroll utility is used.

## Functional freeze

No file under `src/engine/**`, mapper data, scientific bands, solver behavior, Apply/Undo, entitlement, billing or persistence contract was changed by this design implementation.
