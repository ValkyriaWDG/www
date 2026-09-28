'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useSearchParams } from 'next/navigation';
import { type MouseEvent, Suspense } from 'react';
import type { AppLocale } from '@/i18n/routing';
import { CzechFlag, UnitedKingdomFlag } from './flags';
import { buildLocaleSwitchHref } from './locale-switch';
import { runNavigationHandoffs } from './navigation-handoff';
import { useNavigationGuard } from './unsaved-changes';
import styles from './header.module.css';

const OPTIONS: readonly { locale: AppLocale; Flag: typeof CzechFlag }[] = [
  { locale: 'cs', Flag: CzechFlag },
  { locale: 'en', Flag: UnitedKingdomFlag },
];

/**
 * Czech/UK flag + CS/EN + full language name. Non-current options are plain links to the
 * locale-switch endpoint, which resolves entity counterparts server-side; the current
 * option carries `aria-current`. Dirty forms are guarded before leaving.
 */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  return (
    <Suspense fallback={<LanguageSwitcherView search={null} compact={compact} />}>
      <LanguageSwitcherWithQuery compact={compact} />
    </Suspense>
  );
}

function LanguageSwitcherWithQuery({ compact }: { compact: boolean }) {
  const searchParams = useSearchParams();
  return <LanguageSwitcherView search={searchParams.toString()} compact={compact} />;
}

function LanguageSwitcherView({ search, compact }: { search: string | null; compact: boolean }) {
  const t = useTranslations('common.language');
  const current = useLocale();
  const pathname = usePathname() ?? `/${current}`;
  const guard = useNavigationGuard();

  const onSwitch = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!guard.isDirty()) {
      runNavigationHandoffs();
      return;
    }
    event.preventDefault();
    const target = new URL(event.currentTarget.href, window.location.href).toString();
    guard.confirmNavigation(
      () => {
        runNavigationHandoffs();
        window.location.assign(target);
      },
      { fullPage: true },
    );
  };

  return (
    <div className={styles.language} role="group" aria-label={t('groupLabel')} aria-busy={search === null || undefined} data-compact={compact || undefined}>
      {OPTIONS.map(({ locale, Flag }) => {
        const content = (
          <>
            <Flag className={styles.flag} />
            <span className={styles.languageCode} aria-hidden="true">
              {t(`${locale}.code`)}
            </span>
            <span className={styles.languageName} aria-hidden="true" lang={locale}>
              {t(`${locale}.name`)}
            </span>
          </>
        );
        if (locale === current) {
          return (
            <span key={locale} className={styles.languageOption} aria-current="true" data-locale={locale}>
              {content}
              <span className="visually-hidden">{t(`${locale}.current`)}</span>
            </span>
          );
        }
        if (search === null) {
          return (
            <span
              key={locale}
              className={styles.languageOption}
              role="link"
              aria-disabled="true"
              aria-label={t(`${locale}.switchTo`)}
              data-locale={locale}
            >
              {content}
            </span>
          );
        }
        return (
          <a
            key={locale}
            className={styles.languageOption}
            href={buildLocaleSwitchHref(locale, pathname, search, current)}
            hrefLang={locale}
            aria-label={t(`${locale}.switchTo`)}
            data-locale={locale}
            onClick={onSwitch}
          >
            {content}
          </a>
        );
      })}
    </div>
  );
}
