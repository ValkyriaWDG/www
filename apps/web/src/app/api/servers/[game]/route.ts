import { gameHasSection, isGameRoute } from '@/modules/games/registry';
import { getServerBrowserData } from '@/modules/integrations/servers/browser';
import { parseServerParam } from '@/modules/integrations/servers/view';

export const dynamic = 'force-dynamic';

/** Public telemetry only; source configuration and credentials never enter this DTO. */
export async function GET(request: Request, context: { params: Promise<{ game: string }> }): Promise<Response> {
  const { game } = await context.params;
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (!isGameRoute(game) || !gameHasSection(game, 'servers')) return Response.json({ error: 'not_found' }, { status: 404, headers });
  const query = new URL(request.url).searchParams;
  const raw = query.get('server');
  const selected = parseServerParam(raw ?? undefined);
  if ((raw !== null && selected === null) || [...query.keys()].some((key) => key !== 'server') || query.getAll('server').length > 1) return Response.json({ error: 'invalid_selection' }, { status: 400, headers });
  return Response.json(await getServerBrowserData(game, selected), { headers });
}
