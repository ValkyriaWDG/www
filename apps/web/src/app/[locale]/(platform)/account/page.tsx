import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { getServerEnv } from '@/lib/env';
import { can, canForGame } from '@/modules/access/policy';
import { GAME_REGISTRY, GAME_ROUTES } from '@/modules/games/registry';
import { getActor } from '@/modules/access/server';
import type { Principal } from '@/modules/access/types';
import { refreshMembershipAction, signOutAction } from '@/modules/auth/actions';
import { permittedAdminModules } from '@/modules/auth/admin-modules';
import styles from '@/modules/auth/ui/auth.module.css';
import { AuthScene, Notice, Panel, PanelHeading, type NoticeTone } from '@/modules/auth/ui/panels';
import { SubmitButton } from '@/modules/auth/ui/submit-button';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/account'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'auth.meta' });
  return { title: t('account'), robots: { index: false, follow: false } };
}

type AccountStateKey = 'admin' | 'noAdmin' | 'notMember' | 'stale' | 'unavailable' | 'mfaRequired';

function accountState(actor: Principal): { key: AccountStateKey; tone: NoticeTone } {
  switch (actor.status) {
    case 'verified':
      return can(actor, 'admin.access') ? { key: 'admin', tone: 'success' } : { key: 'noAdmin', tone: 'info' };
    case 'not_member':
      return { key: 'notMember', tone: 'warning' };
    case 'stale':
      return { key: 'stale', tone: 'danger' };
    case 'mfa_required':
      return { key: 'mfaRequired', tone: 'warning' };
    default:
      return { key: 'unavailable', tone: 'danger' };
  }
}

export default async function AccountPage({ params, searchParams }: PageProps<'/[locale]/account'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const actor = await getActor('read');
  if (actor.kind !== 'principal') redirect(`/${locale}/login?returnTo=${encodeURIComponent(`/${locale}/account`)}`);

  const query = await searchParams;
  const t = await getTranslations({ locale, namespace: 'auth.account' });
  const tModules = await getTranslations({ locale, namespace: 'admin.overview.modules' });
  const tPeople = await getTranslations({ locale, namespace: 'logiPeople' });
  const state = accountState(actor);
  const modules = permittedAdminModules(actor);
  const refreshed = query.refreshed === '1';

  return (
    <AuthScene>
      <Panel labelledBy="account-title" wide>
        <PanelHeading id="account-title" eyebrow={t('eyebrow')} title={t('title')} />
        <dl className={styles.facts}>
          <dt>{t('displayName')}</dt>
          <dd data-testid="account-name">{actor.label}</dd>
          <dt>{t('method')}</dt>
          <dd data-testid="account-method">{t(`methods.${actor.assurance === 'logi' ? 'logi' : actor.source}`)}</dd>
        </dl>

        <h2 className={styles.subtitle}>{t('statusLabel')}</h2>
        {refreshed ? (
          <Notice tone="info" role="status">
            {t('refreshed')}
          </Notice>
        ) : null}
        <div data-testid="account-status" data-state={state.key}>
          <Notice tone={state.tone} title={t(`states.${state.key}.title`)} role={state.tone === 'danger' ? 'alert' : 'status'}>
            {state.key === 'stale'
              ? t('states.stale.body', { provider: getServerEnv().LOGI_MEMBERSHIP_SOURCE === 'logi' ? 'Logi' : 'Discord' })
              : t(`states.${state.key}.body`)}
          </Notice>
        </div>

        {modules.length > 0 ? (
          <>
            <h2 className={styles.subtitle}>{t('modulesTitle')}</h2>
            <ul className={styles.moduleList} data-testid="account-modules">
              {modules.map((module) => (
                <li key={module.key}>
                  <a href={`/${locale}${module.path}`}>
                    <span className={styles.moduleName}>{tModules(`${module.key}.title`)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <div className={styles.actions}>
          {GAME_ROUTES.filter((game) => canForGame(actor, 'team.read', GAME_REGISTRY[game].db)).map((game) => <a key={game} className={styles.secondary} href={`/${locale}/${game}/team`}>{tPeople('openTeam', { game: game === 'hll' ? 'Hell Let Loose' : 'Wardogs' })}</a>)}
          {can(actor, 'admin.access') ? (
            <a className={styles.primary} href={`/${locale}/admin`} data-testid="account-open-admin">
              {t('openAdmin')}
            </a>
          ) : null}
          {actor.source === 'discord' ? (
            <form action={refreshMembershipAction}>
              <input type="hidden" name="locale" value={locale} />
              <SubmitButton className={styles.secondary} testId="account-refresh">
                {t('refresh')}
              </SubmitButton>
            </form>
          ) : (
            <a className={styles.secondary} href={`/${locale}/account/security`}>
              {t('security')}
            </a>
          )}
          <form action={signOutAction}>
            <input type="hidden" name="locale" value={locale} />
            <SubmitButton className={styles.secondary} testId="account-sign-out">
              {t('signOut')}
            </SubmitButton>
          </form>
        </div>
      </Panel>
    </AuthScene>
  );
}
