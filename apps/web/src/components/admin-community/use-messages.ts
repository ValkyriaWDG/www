'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import type { ErrorCode } from '@/lib/result';
import { fieldErrorCode } from './errors';

/** Localized message for a field-error code (undefined when there is no error). */
export function useFieldError() {
  const t = useTranslations('adminCommunity.fieldErrors');
  return useCallback(
    (code: string | null | undefined): string | undefined => {
      const known = fieldErrorCode(code);
      return known ? t(known) : undefined;
    },
    [t],
  );
}

/** Localized, safe message for an action failure code. */
export function useActionError() {
  const t = useTranslations('errors');
  return useCallback((code: ErrorCode) => t(code), [t]);
}
