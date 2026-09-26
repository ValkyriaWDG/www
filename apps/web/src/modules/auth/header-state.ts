import 'server-only';
import { getActor } from '@/modules/access/server';
import { can } from '@/modules/access/policy';

export type HeaderAccountState = { state: 'signed_out' } | { state: 'signed_in'; label: string; canAdmin: boolean };

/**
 * Account state for the shared header (read intent). Never throws: infrastructure or
 * Discord failures degrade to `signed_out` / `canAdmin: false`. The admin link is a
 * convenience only; admin routes authorize every request themselves.
 */
export async function getHeaderAccountState(): Promise<HeaderAccountState> {
  try {
    const actor = await getActor('read');
    if (actor.kind !== 'principal') return { state: 'signed_out' };
    return { state: 'signed_in', label: actor.label, canAdmin: can(actor, 'admin.access') };
  } catch {
    return { state: 'signed_out' };
  }
}
