import { getTranslations } from 'next-intl/server';
import { UserIcon } from '@/components/ui/icons';
import { AccountMenu } from './account-menu';
import { GuardedLink } from './guarded-link';
import styles from './header.module.css';

/**
 * Account projection supplied by the auth slice. Visibility is a convenience only; every
 * account/admin route authorizes on the server.
 */
export type ShellAccount = { state: 'signed_out' } | { state: 'signed_in'; label: string; canAdmin: boolean };

export function accountLinks(account: ShellAccount, t: (key: 'account' | 'admin' | 'signIn') => string) {
  if (account.state === 'signed_out') return [{ key: 'signIn', href: '/login', label: t('signIn') }];
  return [
    { key: 'account', href: '/account', label: t('account') },
    ...(account.canAdmin ? [{ key: 'admin', href: '/admin', label: t('admin') }] : []),
  ];
}

/** Desktop header account action: sign-in link or a compact signed-in disclosure. */
export async function AccountSlot({ account }: { account: ShellAccount }) {
  const t = await getTranslations('common.nav');
  if (account.state === 'signed_out') {
    return (
      <GuardedLink href="/login" className={styles.account} title={t('signIn')} data-account="signed_out">
        <UserIcon size={20} />
        <span className={styles.accountLabel}>{t('signIn')}</span>
        <span className={styles.accountTooltip} aria-hidden="true">
          {t('signIn')}
        </span>
      </GuardedLink>
    );
  }
  return <AccountMenu label={account.label} menuLabel={t('accountMenu')} links={accountLinks(account, (key) => t(key))} />;
}
