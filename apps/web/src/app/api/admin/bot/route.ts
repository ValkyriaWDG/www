import { botResponse, handleBotRequest } from '@/modules/bot-management/handler';
import { managementDependencies } from '@/modules/bot-management/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
async function handle(request: Request) {
  try { return await handleBotRequest(request, managementDependencies()); }
  catch { return botResponse({ ok: false, code: 'unavailable' }, 503); }
}
export const GET = handle;
export const PATCH = handle;
