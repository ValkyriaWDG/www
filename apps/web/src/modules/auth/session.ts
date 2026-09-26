import 'server-only';
import { headers } from 'next/headers';
import { cache } from 'react';
import type { ActorSession, ActorUser } from '@/modules/access/resolve-actor';
import { getAuth } from './auth';

export type RequestSession = { session: ActorSession & { token: string }; user: ActorUser & { email: string } };

/**
 * The Better Auth session for the current request (DB lookup; no cookie cache),
 * memoized per request. Returns `null` when signed out or expired.
 */
export const getRequestSession = cache(async (): Promise<RequestSession | null> => {
  const result = await getAuth().api.getSession({ headers: await headers() });
  if (!result) return null;
  const { session, user } = result;
  return {
    session: {
      id: session.id,
      token: session.token,
      userId: session.userId,
      expiresAt: new Date(session.expiresAt),
      assurance: (session as { assurance?: string | null }).assurance ?? null,
    },
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      twoFactorEnabled: (user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled ?? false,
    },
  };
});
