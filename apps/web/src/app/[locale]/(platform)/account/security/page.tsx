import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { summarizeAccounts } from '@/modules/access/local-grant';
import { signOutAction } from '@/modules/auth/actions';
import { getRequestSession } from '@/modules/auth/session';
import styles from '@/modules/auth/ui/auth.module.css';
import { AuthScene, Notice, Panel, PanelHeading } from '@/modules/auth/ui/panels';
import { SubmitButton } from '@/modules/auth/ui/submit-button';
import { TotpEnrollment } from '@/modules/auth/ui/totp-enrollment';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/account/security'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'auth.meta' });
  return { title: t('security'), robots: { index: false, follow: false } };
}

/**
 * Second-factor enrollment for local recovery accounts. The page is reachable from the
 * restricted password-only setup session; it exposes no administrative capability.
 * Discord accounts never see password or 2FA controls.
 */
export default async function SecurityPage({ params }: PageProps<'/[locale]/account/security'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const current = await getRequestSession();
  if (!current) redirect(`/${locale}/login?returnTo=${encodeURIComponent(`/${locale}/account/security`)}`);

  const t = await getTranslations({ locale, namespace: 'auth.security' });
  const accounts = await summarizeAccounts(getDb(), current.user.id);
  const isLocal = accounts.hasCredential && accounts.socialProviders.length === 0;

  let body;
  if (!isLocal) {
    body = (
      <Notice tone="info" role="status" testId="security-discord-managed">
        {t('discordManaged')}
      </Notice>
    );
  } else if (current.user.twoFactorEnabled) {
    body = (
      <>
        <Notice tone="success" role="status" title={t('enabled')}>
          {current.session.assurance === 'mfa' ? null : t('reSignIn')}
        </Notice>
        {current.session.assurance === 'mfa' ? null : (
          <form action={signOutAction} className={styles.actions}>
            <input type="hidden" name="locale" value={locale} />
            <SubmitButton className={styles.primary}>{t('signOut')}</SubmitButton>
          </form>
        )}
      </>
    );
  } else if (!getServerEnv().LOCAL_ADMIN_LOGIN_ENABLED) {
    body = (
      <Notice tone="warning" role="status">
        {t('errors.notAllowed')}
      </Notice>
    );
  } else {
    body = <TotpEnrollment locale={locale} />;
  }

  return (
    <AuthScene>
      <Panel labelledBy="security-title" wide>
        <PanelHeading id="security-title" eyebrow={t('eyebrow')} title={t('title')} />
        {body}
        <hr className={styles.divider} />
        <a className={styles.textLink} href={`/${locale}/account`}>
          {t('backToAccount')}
        </a>
      </Panel>
    </AuthScene>
  );
}
