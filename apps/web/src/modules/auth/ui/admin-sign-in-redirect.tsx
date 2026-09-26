'use client';

import { redirect, useSelectedLayoutSegments } from 'next/navigation';
import type { AppLocale } from '@/i18n/routing';
import { sanitizeReturnPath } from '@/modules/access/return-path';

/**
 * Rendered by the admin layout for anonymous visitors: redirects to the localized login
 * with the exact admin path as `returnTo`. The layout does not know the child path, but
 * the selected segments below it do; `redirect()` during server rendering yields an HTTP
 * 307 before any admin content is produced (children are never rendered).
 */
export function AdminSignInRedirect({ locale }: { locale: AppLocale }): never {
  const segments = useSelectedLayoutSegments().filter((segment) => segment && !segment.startsWith('(') && !segment.startsWith('__'));
  const suffix = segments.length > 0 ? `/${segments.map((segment) => encodeURIComponent(segment)).join('/')}` : '';
  const target = sanitizeReturnPath(`/${locale}/admin${suffix}`, locale);
  const returnTo = target.startsWith(`/${locale}/admin`) ? target : `/${locale}/admin`;
  redirect(`/${locale}/login?returnTo=${encodeURIComponent(returnTo)}`);
}
