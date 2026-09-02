import type { ReactNode } from 'react';
import { ApplicationState } from '@/components/shared/ApplicationState';

interface EmptyStateProps {
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}

/** Minimal premium empty state — hairline frame, quiet typography. */
export function EmptyState({ title, body, action, className }: EmptyStateProps) {
  return (
    <ApplicationState
      kind="empty"
      title={title}
      body={body}
      action={action}
      className={className}
    />
  );
}
