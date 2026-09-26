import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { requireCapability } from '@/modules/access/server';
import { resolveMediaRoot } from '@/modules/media/storage';
import { handleUploadRequest } from '@/modules/media/upload-handler';

/** Authorized, same-origin image upload into the scoped media library (see upload-handler.ts). */
export async function POST(request: Request) {
  const env = getServerEnv();
  return handleUploadRequest(request, {
    db: getDb(),
    requireActor: (capability) => requireCapability(capability, 'write'),
    mediaRoot: resolveMediaRoot(env.EDITORIAL_MEDIA_ROOT),
    allowedOrigins: [new URL(env.APP_URL).origin],
  });
}
