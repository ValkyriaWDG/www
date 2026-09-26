import { getDb } from '@/lib/db';
import { resolveLocaleSwitch } from '@/modules/content/locale-switch';
import { resolveNewsCounterpart } from '@/modules/content/public';

/**
 * Language switcher endpoint: `GET /api/locale-switch?to=<cs|en>&from=<localized path>`.
 * Responds 307 with a relative, validated `Location` and `Cache-Control: no-store`.
 * Article counterparts are resolved by entity identity from published translations.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const target = await resolveLocaleSwitch({ to: params.get('to'), from: params.get('from') }, async (from, slug, to) => {
    try {
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
