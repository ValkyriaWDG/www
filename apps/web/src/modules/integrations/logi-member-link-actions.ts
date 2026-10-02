'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { ok, toActionError, type ActionResult } from '@/lib/result';
import { auditEntityId, guardServerAction } from '@/modules/audit/action-guard';
import type { LogiMemberLinkInput, LogiMemberLinkTarget } from './logi-member-link-schemas';
import { removeLogiMemberLink, saveLogiMemberLink } from './logi-member-links';

async function run(input: LogiMemberLinkInput | LogiMemberLinkTarget, remove: boolean): Promise<ActionResult<null>> {
  const action = remove ? 'logi.member.unlink' : 'logi.member.link';
  try {
    const actor = await guardServerAction('members.publish', 'write', {
      action,
      entityType: 'member_profile',
      entityId: auditEntityId(input?.profileId),
    });
    const env = getServerEnv();
    if (remove) await removeLogiMemberLink(getDb(), env, actor, input, { env });
    else await saveLogiMemberLink(getDb(), env, actor, input as LogiMemberLinkInput, { env });
    revalidatePath('/[locale]/admin/members/logi', 'page');
    revalidatePath('/[locale]/members/[slug]', 'page');
    revalidatePath('/[locale]/[game]/members/[slug]', 'page');
    revalidatePath('/[locale]/[game]/matches/logi/[id]', 'page');
    return ok(null);
  } catch (error) {
    return toActionError(error, action);
  }
}
export async function saveLogiMemberLinkAction(input: LogiMemberLinkInput): Promise<ActionResult<null>> {
  return run(input, false);
}
export async function removeLogiMemberLinkAction(input: LogiMemberLinkTarget): Promise<ActionResult<null>> {
  return run(input, true);
}
