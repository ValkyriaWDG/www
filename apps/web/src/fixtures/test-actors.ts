import { authUser, type AppRole, type Executor } from '@valkyria/db';
import { testPrincipal } from '../modules/access/testing';
import type { Actor, Principal } from '../modules/access/types';

/*
 * Synthetic principals for integration tests. Their auth users are inserted so audit and
 * creator foreign keys resolve. Never used by application code paths.
 */

export const TEST_ACTOR_IDS = {
  administrator: '0f000000-0000-4000-8000-000000000001',
  editor: '0f000000-0000-4000-8000-000000000002',
  matchManager: '0f000000-0000-4000-8000-000000000003',
  member: '0f000000-0000-4000-8000-000000000004',
} as const;

const ROLES: Record<keyof typeof TEST_ACTOR_IDS, AppRole[]> = {
  administrator: ['administrator'],
  editor: ['editor'],
  matchManager: ['match_manager'],
  member: ['member'],
};

export type TestActors = Record<keyof typeof TEST_ACTOR_IDS, Principal> & { anonymous: Actor };

export async function ensureTestActors(db: Executor): Promise<TestActors> {
  const entries = Object.entries(TEST_ACTOR_IDS) as [keyof typeof TEST_ACTOR_IDS, string][];
  await db
    .insert(authUser)
    .values(entries.map(([key, id]) => ({ id, name: `Synthetic ${key}`, email: `synthetic-${key.toLowerCase()}@accounts.invalid` })))
    .onConflictDoNothing();
  const actors = Object.fromEntries(
    entries.map(([key, id]) => [key, testPrincipal(ROLES[key], { userId: id, label: `Synthetic ${key}` })]),
  ) as Record<keyof typeof TEST_ACTOR_IDS, Principal>;
  return { ...actors, anonymous: { kind: 'anonymous' } };
}
