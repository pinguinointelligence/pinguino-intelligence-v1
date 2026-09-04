import { GellattiNotice } from '@/components/ui/GellattiNotice';

export function NewRecipeConfirmationDialog({
  open,
  onConfirm,
  onCancel,
  title = 'Rozpocząć nową recepturę?',
  description = 'Niezapisane zmiany w bieżącej recepturze zostaną usunięte.',
  confirmLabel = 'Nowa receptura',
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  description?: string | null;
  confirmLabel?: string;
}) {
  if (!open) return null;
  return (
    <GellattiNotice
      testId="new-recipe-confirmation"
      title={title}
      body={description}
      tone="attention"
      primaryLabel={confirmLabel}
      primaryTestId="confirm-new-recipe"
      onPrimary={onConfirm}
      secondaryLabel="Anuluj"
      onSecondary={onCancel}
      onClose={onCancel}
    />
  );
}
