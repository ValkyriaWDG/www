import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { getSiteOrigin } from '@/lib/site';
import { resolveMediaRoot } from '@/modules/media/storage';
import { socialImageResponse } from '@/modules/social/handler';
import { renderSocialCard } from '@/modules/social/render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ locale: string; kind: string; slug?: string[] }> }) {
  return socialImageResponse(request, await context.params, {
    db: getDb, mediaRoot: resolveMediaRoot(getServerEnv().EDITORIAL_MEDIA_ROOT), siteOrigin: getSiteOrigin(), render: renderSocialCard,
  });
}
