import { getDb } from '@/lib/db';
import { resolveLocaleSwitch } from '@/modules/content/locale-switch';
import { resolveNewsCounterpart } from '@/modules/content/public';
import { resolveManualCounterpart } from '@/modules/field-manual/public';
import { GAME_REGISTRY } from '@/modules/games/registry';

/**
 * Language switcher endpoint: `GET /api/locale-switch?to=<cs|en>&from=<localized path>`.
 * Responds 307 with a relative, validated `Location` and `Cache-Control: no-store`.
 * Article counterparts are resolved by entity identity from published translations.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const target = await resolveLocaleSwitch({ to: params.get('to'), from: params.get('from') }, async (from, slug, to, collection) => {
    try {
      if (collection.kind === 'manual') {
        return await resolveManualCounterpart(getDb(), { game: GAME_REGISTRY[collection.game].db, fromLocale: from, slug, toLocale: to });
      }
      return await resolveNewsCounterpart(from, slug, to, getDb());
    } catch {
      // Database unavailable: switch to the target collection without entity mapping.
      return null;
    }
  });
  return new Response(null, {
    status: 307,
    headers: { Location: target, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
