'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

/** Submit button that prevents duplicate submissions and announces the pending state. */
export function SubmitButton({
  children,
  pendingLabel,
  className,
  disabled = false,
  testId,
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
  testId?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={disabled || pending} aria-disabled={disabled || pending} data-testid={testId}>
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
