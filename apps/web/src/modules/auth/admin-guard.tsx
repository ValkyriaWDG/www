import 'server-only';
import type { Game } from '@valkyria/db';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import type { ReactElement } from 'react';
import { cache } from 'react';
import { getDb } from '@/lib/db';
import type { AppLocale } from '@/i18n/routing';
import type { Capability } from '@/modules/access/capabilities';
import { canForGame, denialCode } from '@/modules/access/policy';
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
  /** Optional fixed resource scope; null requires a platform-wide capability. */
  game?: Game | null;
  /** `write` for pages whose render performs privileged mutations (rare); default `read`. */
  intent?: AccessIntent;
};

/**
 * Page metadata of an admin page: its own title for an authorized actor, the localized
 * "access denied" title when `requireAdminPage` will render the denial instead (the actor
 * is resolved once per request, so this adds no second verification). Anonymous visitors
 * are redirected by the page itself and keep the page title.
 */
export async function adminPageMetadata(options: {
  locale: AppLocale;
  title: string;
  capability?: Capability;
  game?: Game | null;
}): Promise<Metadata> {
  const actor = await getActor('read');
  const capability = options.capability ?? 'admin.access';
  let denied = false;
  if (actor.kind !== 'anonymous') {
    // Same decision as requireAdminPage: platform access, the capability, then the game scope.
    const adminCode = denialCode(actor, 'admin.access');
    const capabilityCode = denialCode(actor, capability);
    const gameDenied = !adminCode && !capabilityCode && options.game !== undefined && !canForGame(actor, capability, options.game);
    denied = Boolean(adminCode ?? capabilityCode) || gameDenied || actor.kind !== 'principal';
  }
  const t = await getTranslations({ locale: options.locale, namespace: 'admin.denied' });
  return { title: denied ? t('metaTitle') : options.title, robots: { index: false, follow: false } };
}

/** Localized path of an admin page, validated as a safe post-login destination. */
export function adminReturnPath(locale: AppLocale, path: string): string {
  const logical = path.startsWith('/admin') ? path : '/admin';
  const localized = sanitizeReturnPath(`/${locale}${logical}`, locale);
  return localized.startsWith(`/${locale}/admin`) ? localized : `/${locale}/admin`;
}

/** One denied-access audit record per request, actor and capability. */
const auditDenied = cache(async (userId: string | null, label: string, source: string, capability: Capability, code: AccessDeniedCode, reason?: 'game_scope') => {
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
            gameScopes: new Map(),
            localGrant: null,
            verifiedAt: null,
          },
    action: 'access.denied',
    outcome: 'denied',
    capability,
    summary: { code, area: 'admin', ...(reason ? { reason } : {}) },
  });
});

export async function recordAdminDenial(actor: Actor, capability: Capability, code: AccessDeniedCode, reason?: 'game_scope'): Promise<void> {
  if (actor.kind === 'principal') await auditDenied(actor.userId, actor.label, actor.source, capability, code, reason);
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
  const capabilityCode = denialCode(actor, capability);
  const gameDenied = !adminCode && !capabilityCode && options.game !== undefined && !canForGame(actor, capability, options.game);
  const code = adminCode ?? capabilityCode ?? (gameDenied ? 'forbidden' : null);
  if (code || actor.kind !== 'principal') {
    const reason = code ?? 'forbidden';
    // Same (actor, capability) key as the layout check so one request yields one record.
    await recordAdminDenial(actor, adminCode ? 'admin.access' : capability, reason, gameDenied ? 'game_scope' : undefined);
    return { ok: false, code: reason, denied: <AccessDeniedPanel locale={locale} code={reason} as="section" /> };
  }
  return { ok: true, principal: actor };
}
