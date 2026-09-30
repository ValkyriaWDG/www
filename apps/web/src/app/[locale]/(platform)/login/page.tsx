import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { DiscordIcon } from '@/components/ui/icons';
import { routing } from '@/i18n/routing';
import { getServerEnv } from '@/lib/env';
import { defaultReturnPath, sanitizeReturnPath } from '@/modules/access/return-path';
import { startDiscordSignIn } from '@/modules/auth/actions';
import { authConfigFromEnv, isDiscordSignInConfigured } from '@/modules/auth/auth';
import { loginErrorKey } from '@/modules/auth/login-errors';
import { getRequestSession } from '@/modules/auth/session';
import styles from '@/modules/auth/ui/auth.module.css';
import { AuthScene, Notice, Panel, PanelHeading } from '@/modules/auth/ui/panels';
import { SubmitButton } from '@/modules/auth/ui/submit-button';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/login'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'auth.meta' });
  return { title: t('login'), robots: { index: false, follow: false } };
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ params, searchParams }: PageProps<'/[locale]/login'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const query = await searchParams;
  const returnTo = sanitizeReturnPath(firstValue(query.returnTo), locale);
  const errorKey = loginErrorKey(query.error);
  const env = getServerEnv();
  const discordReady = isDiscordSignInConfigured(authConfigFromEnv(env));
  const current = await getRequestSession().catch(() => null);
  const t = await getTranslations({ locale, namespace: 'auth.login' });
  const recoveryHref = `/${locale}/login/recovery${returnTo !== defaultReturnPath(locale) ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`;

  return (
    <AuthScene>
      <Panel labelledBy="login-title">
        <PanelHeading id="login-title" eyebrow={t('eyebrow')} title={t('title')} crest />
        {current ? (
          <>
            <Notice tone="info" role="status" testId="login-signed-in">
              {t('alreadySignedIn', { name: current.user.name })}
            </Notice>
            <div className={styles.actions}>
              <a className={styles.primary} href={returnTo}>
                {returnTo === defaultReturnPath(locale) ? t('goToAccount') : t('continue')}
              </a>
            </div>
          </>
        ) : (
          <>
            <p className={styles.lead}>{t('purpose')}</p>
            {errorKey ? (
              <Notice tone="danger" role="alert" testId="login-error">
                {t(`errors.${errorKey}`)}
              </Notice>
            ) : null}
            {!discordReady ? (
              <Notice tone="warning" role="status" testId="login-provider-unavailable">
                {t('providerUnavailable')}
              </Notice>
            ) : null}
            <form action={startDiscordSignIn}>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <SubmitButton className={styles.primary} pendingLabel={t('redirecting')} disabled={!discordReady} testId="login-discord">
                <DiscordIcon size={22} />
                {t('continueDiscord')}
              </SubmitButton>
            </form>
            <p className={styles.note}>{t('separate')}</p>
          </>
        )}
        <hr className={styles.divider} />
        <div className={styles.linkRow}>
          <a className={styles.textLink} href={`/${locale}/privacy`}>
            {t('privacy')}
          </a>
          <a className={styles.textLink} href={`/${locale}`}>
            {t('backHome')}
          </a>
          {env.LOCAL_ADMIN_LOGIN_ENABLED && !current ? (
            <a className={styles.textLink} href={recoveryHref}>
              {t('recoveryLink')}
            </a>
          ) : null}
        </div>
      </Panel>
    </AuthScene>
  );
}
