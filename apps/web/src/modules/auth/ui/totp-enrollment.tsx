'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  beginTotpEnrollmentAction,
  confirmTotpEnrollmentAction,
  signOutAction,
  type ConfirmState,
  type EnrollmentState,
} from '../actions';
import styles from './auth.module.css';
import { SubmitButton } from './submit-button';

const INITIAL_ENROLLMENT: EnrollmentState = { step: 'password', error: null };
const INITIAL_CONFIRM: ConfirmState = { done: false, error: null };

/**
 * TOTP enrollment for a local recovery account inside its restricted setup session. The
 * setup key and one-time recovery codes exist only in this component's state and are
 * shown once; the session stays restricted until a fresh sign-in with the second factor.
 */
export function TotpEnrollment({ locale }: { locale: string }) {
  const t = useTranslations('auth.security');
  const [enrollment, begin] = useActionState(beginTotpEnrollmentAction, INITIAL_ENROLLMENT);
  const [confirmation, confirm] = useActionState(confirmTotpEnrollmentAction, INITIAL_CONFIRM);

  if (confirmation.done) {
    return (
      <div>
        <div className={`${styles.notice} ${styles.success}`} role="status">
          <strong>{t('done')}</strong>
          <p>{t('reSignIn')}</p>
        </div>
        <form action={signOutAction} className={styles.actions}>
          <input type="hidden" name="locale" value={locale} />
          <SubmitButton className={styles.primary}>{t('signOut')}</SubmitButton>
        </form>
      </div>
    );
  }

  if (enrollment.step === 'confirm') {
    return (
      <div>
        <h2 className={styles.subtitle}>{t('setupTitle')}</h2>
        <p className={styles.muted}>{t('setupIntro')}</p>
        <dl className={styles.facts}>
          <dt>{t('manualKey')}</dt>
          <dd className={styles.code} data-testid="totp-manual-key">
            {enrollment.manualKey}
          </dd>
        </dl>
        <p>
          <a className={styles.textLink} href={enrollment.totpURI}>
            {t('setupLink')}
          </a>
        </p>
        <h2 className={styles.subtitle}>{t('backupTitle')}</h2>
        <p className={styles.muted}>{t('backupIntro')}</p>
        <ul className={`${styles.codes} ${styles.code}`} data-testid="backup-codes">
          {enrollment.backupCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <form action={confirm} className={styles.form} noValidate>
          <p className={styles.muted}>{t('confirmIntro')}</p>
          {confirmation.error ? (
            <div className={`${styles.notice} ${styles.danger}`} role="alert">
              <p>{t(`errors.${confirmation.error}`)}</p>
            </div>
          ) : null}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="enroll-code">
              {t('code')}
            </label>
            <input
              id="enroll-code"
              name="code"
              className={styles.input}
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
            />
          </div>
          <div className={styles.actions}>
            <SubmitButton className={styles.primary}>{t('confirm')}</SubmitButton>
          </div>
        </form>
      </div>
    );
  }

  return (
    <form action={begin} className={styles.form} noValidate>
      <p className={styles.lead}>{t('enrollIntro')}</p>
      {enrollment.error ? (
        <div className={`${styles.notice} ${styles.danger}`} role="alert">
          <p>{t(`errors.${enrollment.error}`)}</p>
        </div>
      ) : null}
      <div className={styles.field}>
        <label className={styles.label} htmlFor="enroll-password">
          {t('password')}
        </label>
        <input id="enroll-password" name="password" type="password" className={styles.input} autoComplete="current-password" maxLength={256} required />
      </div>
      <div className={styles.actions}>
        <SubmitButton className={styles.primary}>{t('begin')}</SubmitButton>
      </div>
    </form>
  );
}
