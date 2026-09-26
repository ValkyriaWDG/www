'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { recoveryAction, type RecoveryState } from '../actions';
import styles from './auth.module.css';
import { SubmitButton } from './submit-button';

const INITIAL: RecoveryState = { step: 'credentials', error: null };

/** Local administrator recovery: password step, then TOTP or one-time recovery code. */
export function RecoveryForm({ locale, returnTo }: { locale: string; returnTo: string }) {
  const t = useTranslations('auth.recovery');
  const [state, action] = useActionState(recoveryAction, INITIAL);
  const [method, setMethod] = useState<'totp' | 'backup'>('totp');

  const error = state.error ? (
    <div className={`${styles.notice} ${styles.danger}`} role="alert">
      <p>{t(`errors.${state.error}`)}</p>
    </div>
  ) : null;

  if (state.step === 'second_factor') {
    return (
      <form action={action} className={styles.form} noValidate>
        <h2 className={styles.subtitle}>{t('secondFactorTitle')}</h2>
        <p className={styles.muted}>{method === 'totp' ? t('totpIntro') : t('backupIntro')}</p>
        {error}
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="phase" value="second_factor" />
        <input type="hidden" name="method" value={method} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <div className={styles.field}>
          <label className={styles.label} htmlFor="recovery-code">
            {method === 'totp' ? t('code') : t('backupCode')}
          </label>
          <input
            key={method}
            id="recovery-code"
            name="code"
            className={styles.input}
            autoComplete="one-time-code"
            inputMode={method === 'totp' ? 'numeric' : 'text'}
            pattern={method === 'totp' ? '[0-9]{6}' : undefined}
            maxLength={method === 'totp' ? 6 : 32}
            required
            autoFocus
          />
        </div>
        <div className={styles.actions}>
          <SubmitButton className={styles.primary} pendingLabel={t('working')}>
            {t('verify')}
          </SubmitButton>
          <button type="button" className={styles.secondary} onClick={() => setMethod(method === 'totp' ? 'backup' : 'totp')}>
            {method === 'totp' ? t('useBackup') : t('useTotp')}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form action={action} className={styles.form} noValidate>
      {error}
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="phase" value="credentials" />
      <div className={styles.field}>
        <label className={styles.label} htmlFor="recovery-email">
          {t('email')}
        </label>
        <input id="recovery-email" name="email" type="email" className={styles.input} autoComplete="username" maxLength={254} required />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="recovery-password">
          {t('password')}
        </label>
        <input id="recovery-password" name="password" type="password" className={styles.input} autoComplete="current-password" maxLength={256} required />
      </div>
      <div className={styles.actions}>
        <SubmitButton className={styles.primary} pendingLabel={t('working')}>
          {t('submit')}
        </SubmitButton>
      </div>
    </form>
  );
}
