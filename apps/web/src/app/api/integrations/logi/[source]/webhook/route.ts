import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { receiveLogiWebhook } from '@/modules/integrations/logi-webhook';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ source: string }> }) {
  try {
    const { source } = await context.params;
    return receiveLogiWebhook(getDb, getServerEnv(), source, request);
  } catch {
    return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } });
  }
}
