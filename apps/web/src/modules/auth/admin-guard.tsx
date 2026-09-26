import 'server-only';
import { redirect } from 'next/navigation';
import type { ReactElement } from 'react';
import { cache } from 'react';
import { getDb } from '@/lib/db';
import type { AppLocale } from '@/i18n/routing';
import type { Capability } from '@/modules/access/capabilities';
import { denialCode } from '@/modules/access/policy';
import { sanitizeReturnPath } from '@/modules/access/return-path';
import { getActor } from '@/modules/access/server';
import type { AccessDeniedCode, AccessIntent, Actor, Principal } from '@/modules/access/types';
import { auditAuthEvent } from './auth-audit';
import { AccessDeniedPanel } from './ui/access-denied';

export type AdminPageAccess = { ok: true; principal: Principal } | { ok: false; code: AccessDeniedCode; denied: ReactElement };

export type AdminPageOptions = {
  locale: AppLocale;
  /** Logical admin path of the page without locale, e.g. `/admin/news` (used for returnTo). */
  path: string;
  /** Capability required by the page; defaults to `admin.access`. */
  capability?: Capability;
  /** `write` for pages whose render performs privileged mutations (rare); default `read`. */
  intent?: AccessIntent;
};

/** Localized path of an admin page, validated as a safe post-login destination. */
export function adminReturnPath(locale: AppLocale, path: string): string {
  const logical = path.startsWith('/admin') ? path : '/admin';
  const localized = sanitizeReturnPath(`/${locale}${logical}`, locale);
  return localized.startsWith(`/${locale}/admin`) ? localized : `/${locale}/admin`;
}

/** One denied-access audit record per request, actor and capability. */
const auditDenied = cache(async (userId: string | null, label: string, source: string, capability: Capability, code: AccessDeniedCode) => {
  await auditAuthEvent(getDb(), {
    actor:
      userId === null
        ? { kind: 'anonymous' }
        : {
            kind: 'principal',
            userId,
            label,
            source: source === 'local_admin' ? 'local_admin' : 'discord',
            sessionId: '',
            assurance: 'unknown',
            intent: 'read',
            status: 'unavailable',
            roles: [],
            capabilities: new Set(),
            localGrant: null,
            verifiedAt: null,
          },
    action: 'access.denied',
    outcome: 'denied',
    capability,
    summary: { code, area: 'admin' },
  });
});

export async function recordAdminDenial(actor: Actor, capability: Capability, code: AccessDeniedCode): Promise<void> {
  if (actor.kind === 'principal') await auditDenied(actor.userId, actor.label, actor.source, capability, code);
}

/**
 * Server-side guard for every admin page (the layout check alone is not sufficient:
 * pages render independently of their layout). Anonymous visitors are redirected to the
 * localized login with a validated `returnTo`; authenticated actors without the
 * capability (or with stale/unverified status) get a localized denial element to render
 * instead of any data, and the denial is audited.
 *
 * ```tsx
 * const access = await requireAdminPage({ locale, path: '/admin/settings', capability: 'settings.manage' });
 * if (!access.ok) return access.denied;
 * // access.principal is authorized for `settings.manage` (read intent)
 * ```
 * Mutations must still call `requireCapability(capability, 'write')` in the server action.
 */
export async function requireAdminPage(options: AdminPageOptions): Promise<AdminPageAccess> {
  const { locale } = options;
  const capability = options.capability ?? 'admin.access';
  const actor = await getActor(options.intent ?? 'read');
  if (actor.kind === 'anonymous') {
    redirect(`/${locale}/login?returnTo=${encodeURIComponent(adminReturnPath(locale, options.path))}`);
  }
  const adminCode = denialCode(actor, 'admin.access');
  const code = adminCode ?? denialCode(actor, capability);
  if (code || actor.kind !== 'principal') {
    const reason = code ?? 'forbidden';
    // Same (actor, capability) key as the layout check so one request yields one record.
    await recordAdminDenial(actor, adminCode ? 'admin.access' : capability, reason);
    return { ok: false, code: reason, denied: <AccessDeniedPanel locale={locale} code={reason} as="section" /> };
  }
  return { ok: true, principal: actor };
}
