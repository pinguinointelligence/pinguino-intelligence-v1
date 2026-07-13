# customer-shell/ui — mobile-first customer design system

A **scoped, presentational** component library for the customer-facing experience.
Apple-flavoured: white/light premium surface, large type, generous whitespace,
large touch targets, clear selected states, bottom sheets, restrained motion.

- **No live data, no business logic, no engine access.** Every component takes
  static props; all interactivity is controlled by the caller.
- **No global CSS touched.** These components _compose_ the existing brand
  utilities (`ink`, `paper`, `stone`, `ivory`, `status-*` from `src/styles/tokens.css`)
  into scoped class recipes in [`tokens.ts`](./tokens.ts). The global Tailwind
  theme and `index.css` are unchanged.

## Import

```ts
import {
  CustomerSurface,
  CustomerSection,
  TouchButton,
  TextField,
  ReadyRecipeCard,
} from '@/features/customer-shell/ui';
```

Wrap any customer screen in `<CustomerSurface>` (single readable column, safe-area
insets, light surface). Pass `hasStickyCta` when a `<StickyCta>` is on the screen
so a spacer reserves its height.

## Components & states

| Component | States / variants |
| --- | --- |
| `CustomerSurface` / `CustomerSection` | default, `hasStickyCta` (reserves CTA height) |
| `TouchButton` | `primary` / `secondary` / `quiet`; `md` (52px) / `lg` (56px); `block`; `disabled` |
| `TextField` | default, `hint`, `error`, `disabled`, `trailing` adornment |
| `MicrophoneButton` | `idle` / `listening` / `unavailable` / `permission-denied` (visual only) |
| `SelectableCard` | unselected / selected / disabled; `radio` or `checkbox` semantics |
| `FlavorChip` | static, `selected`, removable (labelled ×) |
| `DeviceCard` | label + secondary temperature; selected / disabled |
| `BatchSelector` | wrapping segmented control; selected / disabled options |
| `RecipeImage` | photo (lazy, aspect-locked) / missing-photo fallback / load-error fallback |
| `ReadyRecipeCard` | with photo / without photo / optional badge slot |
| `IngredientRow` + `SubstituteAction` | value row / locked row / with trailing action |
| `LockedGram` | 🔒 stand-in for a redacted exact gram value |
| `BottomSheet` | controlled open/close; backdrop + Escape; optional pinned footer |
| `SubstitutionSheet` | option list with selected state + confirm footer |
| `TechnicalDetails` | collapsed (default) / expanded — native `<details>` (“Dane techniczne”) |
| `StickyCta` | fixed above safe-area; optional caption |
| `Skeleton` + `ReadyRecipeCardSkeleton` + `IngredientListSkeleton` | shimmer placeholders (no layout shift) |
| `EmptyStateView` / `LoadingStateView` / `ErrorStateView` | empty / loading / error |
| `Toast` | `neutral` / `success` / `error`; optional action + dismiss |

## Design decisions

- **Type / contrast.** Primary body is **17px** `ink` on `paper` (~19:1). Secondary
  copy never goes lighter than `stone-500` (~4.6:1 on white — AA). `stone-400` is
  reserved for placeholders and decorative glyphs. No low-contrast grey-on-white text.
- **Touch targets.** Primary controls are **52px** (`md`) or **56px** (`lg`) tall;
  icon-only controls are ≥44px square. See `customerSpec` in `tokens.ts`.
- **Focus.** Every interactive element carries a visible `focus-visible` ring
  (2px `ink` + offset) — keyboard users always see focus.
- **Safe area.** Bottom-anchored surfaces (`StickyCta`, `BottomSheet` footer,
  `CustomerSurface` tail) use `env(safe-area-inset-bottom)` so nothing hides under
  the iPhone home indicator. The sticky CTA reserves its own height and never
  covers content.
- **No horizontal scroll.** One column, `overflow-x-hidden` root, `min-w-0`/`truncate`
  on flex children, wrapping chip rows, and a grid batch selector — clean at 390px & 430px.
- **Motion.** Transitions are short and all gated behind `motion-safe` /
  `motion-reduce` so reduced-motion users get a still UI.
- **Redaction.** `LockedGram` never carries a real value in the DOM (visual 🔒 only).

## Preview the gallery

The gallery lives at
[`gallery/CustomerUiGallery.tsx`](./gallery/CustomerUiGallery.tsx) and renders every
component and state with mock props.

> The app router (`src/app/router.tsx`) is owned by other in-flight work, so this
> feature does **not** wire itself in. The orchestrator mounts the gallery during
> integration, e.g.:

```tsx
// in src/app/router.tsx (added by the orchestrator, DEV-only)
import { CustomerUiGallery } from '@/features/customer-shell/ui/gallery/CustomerUiGallery';

// ...inside the dev route group:
{ path: '/dev/customer-ui', element: <CustomerUiGallery /> }
```

Then run the dev server and open `/dev/customer-ui`. To sanity-check responsiveness,
use device emulation at 390px and 430px widths — there should be no horizontal scroll.

The gallery component is self-contained (only static/mock props), so it can also be
dropped into any existing page or story harness without additional setup.
