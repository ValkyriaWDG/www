'use client';

import type { ComponentProps } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useNavigationGuard } from './unsaved-changes';

type RouterHref = Parameters<ReturnType<typeof useRouter>['push']>[0];
type GuardedLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & { href: RouterHref };

/** Localized `Link` that asks before leaving a dirty form (client-side navigations only). */
export function GuardedLink({ onNavigate, href, locale, ...props }: GuardedLinkProps) {
  const guard = useNavigationGuard();
  const router = useRouter();
  return (
    <Link
      href={href}
      locale={locale}
      {...props}
      onNavigate={(event) => {
        onNavigate?.(event);
        if (!guard.isDirty()) return;
        event.preventDefault();
        guard.confirmNavigation(() => router.push(href, locale ? { locale } : undefined));
      }}
    />
  );
}
