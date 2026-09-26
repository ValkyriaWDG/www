import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import type { AccessDeniedCode } from '@/modules/access/types';
import styles from './auth.module.css';
import { Notice } from './panels';

type Placement = 'main' | 'section';

/** Localized access-denied panel; renders the reason code, never protected data. */
export async function AccessDeniedPanel({ locale, code, as = 'main' }: { locale: AppLocale; code: AccessDeniedCode; as?: Placement }) {
  const t = await getTranslations({ locale, namespace: 'admin.denied' });
  const content = (
    <section aria-labelledby="access-denied-title" className={styles.panel} data-testid="access-denied" data-reason={code}>
      <p className={styles.eyebrow}>{t('eyebrow')}</p>
      <h1 id="access-denied-title" className={styles.title}>
        {t('title')}
      </h1>
      <Notice tone={code === 'stale_authorization' || code === 'verification_unavailable' ? 'warning' : 'danger'} role="alert">
        {t(`reasons.${code}`)}
      </Notice>
      <div className={styles.actions}>
        <a className={styles.primary} href={`/${locale}/account`}>
          {t('account')}
        </a>
        <a className={styles.secondary} href={`/${locale}`}>
          {t('home')}
        </a>
      </div>
    </section>
  );
  return as === 'main' ? (
    <main id="main-content" tabIndex={-1} className={styles.scene}>
      {content}
    </main>
  ) : (
    <div className={styles.section}>{content}</div>
  );
}
