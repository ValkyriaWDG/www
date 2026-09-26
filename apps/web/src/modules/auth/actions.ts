'use server';

import { redirect } from 'next/navigation';
import { isAppLocale, routing, type AppLocale } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { summarizeAccounts } from '@/modules/access/local-grant';
import { loginErrorPath, sanitizeReturnPath } from '@/modules/access/return-path';
import { refreshActorMembership } from '@/modules/access/server';
import { authConfigFromEnv, isDiscordSignInConfigured } from './auth';
import { callAuthEndpoint } from './forward';
import { getRequestSession } from './session';

function localeFrom(formData: FormData): AppLocale {
  const value = formData.get('locale');
  return isAppLocale(value) ? value : routing.defaultLocale;
}

function textField(formData: FormData, name: string, max: number): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function withError(path: string, code: string): string {
  const url = new URL(path, 'https://placeholder.invalid');
  url.searchParams.set('error', code);
  return `${url.pathname}${url.search}`;
}

/** Starts Discord OAuth with a validated localized return path (rate-limited, CSRF-safe). */
export async function startDiscordSignIn(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  const returnTo = sanitizeReturnPath(textField(formData, 'returnTo', 600) || undefined, locale);
  const errorPath = loginErrorPath(locale, returnTo);
  if (!isDiscordSignInConfigured(authConfigFromEnv(getServerEnv()))) redirect(withError(errorPath, 'provider_unavailable'));

  let target: string | null = null;
  let failure = 'unavailable';
  try {
    const result = await callAuthEndpoint('/sign-in/social', {
      provider: 'discord',
      callbackURL: returnTo,
      errorCallbackURL: errorPath,
      disableRedirect: true,
    });
    const url = (result.body as { url?: unknown } | null)?.url;
    if (result.status === 200 && typeof url === 'string' && url.startsWith('https://discord.com/')) target = url;
    else if (result.status === 429) failure = 'rate_limited';
  } catch {
    failure = 'unavailable';
  }
  redirect(target ?? withError(errorPath, failure));
}

/** Ends the current session server-side and clears the cookie. */
export async function signOutAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  try {
    await callAuthEndpoint('/sign-out', {}, { withSession: true });
  } catch {
    // Signing out must never surface internals; the session cookie is cleared below if possible.
  }
  redirect(`/${locale}`);
}

/** User-requested membership re-verification against Discord (throttled per member). */
export async function refreshMembershipAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  const actor = await refreshActorMembership();
  if (actor.kind !== 'principal') redirect(`/${locale}/login?returnTo=${encodeURIComponent(`/${locale}/account`)}`);
  redirect(`/${locale}/account?refreshed=1`);
}

// --- Local administrator recovery -------------------------------------------------------

export type RecoveryState = {
  step: 'credentials' | 'second_factor';
  error: 'invalid' | 'invalidCode' | 'rateLimited' | 'expired' | 'generic' | null;
};

function localAdminEnabled(): boolean {
  return getServerEnv().LOCAL_ADMIN_LOGIN_ENABLED;
}

/**
 * Two-step recovery sign-in: `phase=credentials` (e-mail + password through the rate
 * limited credential endpoint) then `phase=second_factor` (TOTP or one-time recovery code
 * bound to the signed two-factor challenge cookie). Errors are generic.
 */
export async function recoveryAction(_previous: RecoveryState, formData: FormData): Promise<RecoveryState> {
  const locale = localeFrom(formData);
  if (!localAdminEnabled()) return { step: 'credentials', error: 'generic' };
  return formData.get('phase') === 'second_factor' ? verifySecondFactor(locale, formData) : signInWithPassword(locale, formData);
}

async function signInWithPassword(locale: AppLocale, formData: FormData): Promise<RecoveryState> {
  const email = textField(formData, 'email', 254).trim();
  const password = textField(formData, 'password', 256);
  if (!email || !password) return { step: 'credentials', error: 'invalid' };

  let result;
  try {
    result = await callAuthEndpoint('/sign-in/email', { email, password, rememberMe: false });
  } catch {
    return { step: 'credentials', error: 'generic' };
  }
  if (result.status === 429) return { step: 'credentials', error: 'rateLimited' };
  if (result.status !== 200) return { step: 'credentials', error: result.status === 401 || result.status === 400 ? 'invalid' : 'generic' };
  if ((result.body as { twoFactorRedirect?: unknown } | null)?.twoFactorRedirect === true) return { step: 'second_factor', error: null };
  // Second factor not enrolled yet: restricted setup session that can only enroll.
  redirect(`/${locale}/account/security`);
}

async function verifySecondFactor(locale: AppLocale, formData: FormData): Promise<RecoveryState> {
  const method = formData.get('method') === 'backup' ? 'backup' : 'totp';
  const code = textField(formData, 'code', 64).replace(/\s+/g, '');
  const returnTo = sanitizeReturnPath(textField(formData, 'returnTo', 600) || undefined, locale);
  if (!code) return { step: 'second_factor', error: 'invalidCode' };

  let result;
  try {
    result = await callAuthEndpoint(method === 'backup' ? '/two-factor/verify-backup-code' : '/two-factor/verify-totp', { code }, { withSession: true });
  } catch {
    return { step: 'second_factor', error: 'generic' };
  }
  if (result.status === 200) redirect(returnTo);
  if (result.code === 'INVALID_TWO_FACTOR_COOKIE') return { step: 'credentials', error: 'expired' };
  if (result.code === 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE') return { step: 'credentials', error: 'rateLimited' };
  if (result.status === 429 || result.code === 'ACCOUNT_TEMPORARILY_LOCKED') return { step: 'second_factor', error: 'rateLimited' };
  return { step: 'second_factor', error: result.status === 401 ? 'invalidCode' : 'generic' };
}

// --- TOTP enrollment for local accounts ---------------------------------------------------

export type EnrollmentState =
  | { step: 'password'; error: 'invalidPassword' | 'alreadyEnabled' | 'rateLimited' | 'notAllowed' | 'generic' | null }
  | { step: 'confirm'; totpURI: string; manualKey: string; backupCodes: string[]; error: null };

async function requireLocalAccountSession(): Promise<boolean> {
  const current = await getRequestSession();
  if (!current) return false;
  const accounts = await summarizeAccounts(getDb(), current.user.id);
  return accounts.hasCredential && accounts.socialProviders.length === 0;
}

export async function beginTotpEnrollmentAction(_previous: EnrollmentState, formData: FormData): Promise<EnrollmentState> {
  if (!localAdminEnabled() || !(await requireLocalAccountSession())) return { step: 'password', error: 'notAllowed' };
  const password = textField(formData, 'password', 256);
  if (!password) return { step: 'password', error: 'invalidPassword' };
  let result;
  try {
    result = await callAuthEndpoint('/two-factor/enable', { password }, { withSession: true });
  } catch {
    return { step: 'password', error: 'generic' };
  }
  if (result.status === 429) return { step: 'password', error: 'rateLimited' };
  if (result.code === 'TOTP_ALREADY_ENABLED') return { step: 'password', error: 'alreadyEnabled' };
  const body = result.body as { totpURI?: unknown; backupCodes?: unknown } | null;
  if (result.status !== 200 || typeof body?.totpURI !== 'string' || !Array.isArray(body.backupCodes)) {
    return { step: 'password', error: result.status === 400 || result.status === 401 ? 'invalidPassword' : 'generic' };
  }
  let manualKey = '';
  try {
    manualKey = new URL(body.totpURI).searchParams.get('secret') ?? '';
  } catch {
    return { step: 'password', error: 'generic' };
  }
  return {
    step: 'confirm',
    totpURI: body.totpURI,
    manualKey,
    backupCodes: body.backupCodes.filter((code): code is string => typeof code === 'string'),
    error: null,
  };
}

export type ConfirmState = { done: boolean; error: 'invalidCode' | 'rateLimited' | 'notAllowed' | 'generic' | null };

export async function confirmTotpEnrollmentAction(_previous: ConfirmState, formData: FormData): Promise<ConfirmState> {
  if (!localAdminEnabled() || !(await requireLocalAccountSession())) return { done: false, error: 'notAllowed' };
  const code = textField(formData, 'code', 16).replace(/\s+/g, '');
  if (!/^[0-9]{6}$/.test(code)) return { done: false, error: 'invalidCode' };
  let result;
  try {
    result = await callAuthEndpoint('/two-factor/verify-totp', { code }, { withSession: true });
  } catch {
    return { done: false, error: 'generic' };
  }
  if (result.status === 200) return { done: true, error: null };
  if (result.status === 429) return { done: false, error: 'rateLimited' };
  return { done: false, error: result.status === 401 ? 'invalidCode' : 'generic' };
}
