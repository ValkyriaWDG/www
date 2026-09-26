import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { getActor } from '@/modules/access/server';
import { deliverMedia } from '@/modules/media/delivery';
import { resolveMediaRoot } from '@/modules/media/storage';

/** Publication-aware media delivery (see src/modules/media/delivery.ts). */
export async function GET(request: Request, ctx: RouteContext<'/api/media/[assetId]/[variant]'>) {
  const { assetId, variant } = await ctx.params;
  return deliverMedia(request, { assetId, variant }, {
    db: getDb(),
    mediaRoot: resolveMediaRoot(getServerEnv().EDITORIAL_MEDIA_ROOT),
    resolveActor: () => getActor('read'),
  });
}
