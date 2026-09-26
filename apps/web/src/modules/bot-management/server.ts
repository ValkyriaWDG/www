import 'server-only';
import { headers } from 'next/headers';
import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { resolveActor } from '@/modules/access/resolve-actor';
import { summarizeAccounts } from '@/modules/access/local-grant';
import { getAuth } from '@/modules/auth/auth';
import { recordAudit } from '@/modules/audit/audit';
import { BotError } from './contracts';
import { ManagementClient, readManagementConfig } from './client';
import type { BotDependencies } from './handler';

export function managementDependencies(): BotDependencies {
  const config = readManagementConfig();
  return {
    origin: new URL(getServerEnv().APP_URL).origin,
    client: config ? new ManagementClient(config) : null,
    audit: (event) => recordAudit(getDb(), event),
    async identity(intent) {
      // Do not reuse React's memoized actor when an audited write waits before dispatch.
      const current = await getAuth().api.getSession({ headers: await headers() });
      if (!current) throw new BotError('forbidden');
      const actor = await resolveActor(getDb(), { session: { ...current.session, assurance: (current.session as { assurance?: string }).assurance }, user: current.user, intent, env: getServerEnv(), forceRefresh: intent === 'write' });
      if (actor.kind !== 'principal') throw new BotError('forbidden');
      const accounts = await summarizeAccounts(getDb(), actor.userId);
      return { actor, discordUserId: accounts.discordAccountId };
    },
  };
}
