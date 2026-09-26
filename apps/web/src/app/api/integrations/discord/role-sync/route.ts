import { getDb } from '@/lib/db';
import { roleSyncConfig } from '@/modules/role-sync/config';
import { receiveRoleSync } from '@/modules/role-sync/receiver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const config = roleSyncConfig();
    if (!config.enabled) return Response.json({ code: 'DISABLED' }, { status: 503, headers: { 'cache-control': 'private, no-store' } });
    return await receiveRoleSync(request, { db: getDb(), config });
  } catch {
    return Response.json({ code: 'UNAVAILABLE' }, { status: 503, headers: { 'cache-control': 'private, no-store' } });
  }
}
