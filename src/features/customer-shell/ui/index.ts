/**
 * Customer-shell UI — a scoped, mobile-first, presentational component library.
 * White/light premium surface, large type, big touch targets. NO live data,
 * NO business logic, NO engine access. Import from here:
 *
 *   import { CustomerSurface, TouchButton, ReadyRecipeCard } from '@/features/customer-shell/ui';
 */

// Design tokens (class recipes + numeric specs)
export * from './tokens';

// Frame
export { CustomerSurface, CustomerSection } from './CustomerSurface';
export { CustomerMenu } from './CustomerMenu';

// Controls (the class recipe itself is exported from ./tokens above)
export { TouchButton } from './TouchButton';
export type { TouchButtonVariant, TouchButtonSize } from './TouchButton';
export { TextField } from './TextField';
export { MicrophoneButton } from './MicrophoneButton';
export type { MicState } from './MicrophoneButton';

// Selection
export { SelectableCard } from './SelectableCard';
export { FlavorChip } from './FlavorChip';
export { DeviceCard } from './DeviceCard';
export { BatchSelector } from './BatchSelector';
export type { BatchOption } from './BatchSelector';

// Recipe surfaces
export { RecipeImage } from './RecipeImage';
export { ReadyRecipeCard } from './ReadyRecipeCard';
export { IngredientRow, SubstituteAction } from './IngredientRow';
export { LockedGram } from './LockedGram';

// Overlays & disclosure
export { BottomSheet } from './BottomSheet';
export { SubstitutionSheet } from './SubstitutionSheet';
export type { SubstitutionOption } from './SubstitutionSheet';
export { TechnicalDetails } from './TechnicalDetails';
export { StickyCta } from './StickyCta';

// Feedback states
export { Skeleton, ReadyRecipeCardSkeleton, IngredientListSkeleton } from './Skeleton';
export { EmptyStateView, ErrorStateView, LoadingStateView } from './StateViews';
export { Toast } from './Toast';
export type { ToastTone } from './Toast';
