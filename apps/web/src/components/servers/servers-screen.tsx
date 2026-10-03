import { GameSwitchNotice } from '@/components/games/switch-notice';
import { firstParam, type RawSearchParams } from '@/components/public/query';
import type { AppLocale } from '@/i18n/routing';
import type { GameRoute } from '@/modules/games/registry';
import { getServerBrowserData } from '@/modules/integrations/servers/browser';
import { parseServerParam } from '@/modules/integrations/servers/view';
import { ServerBrowser } from './server-browser';
import { ServerHistorySummary } from './server-history-summary';

/** Initial public data is rendered on the server; polling reuses those same cached providers. */
export async function ServersScreen({ locale, game, query }: { locale: AppLocale; game: GameRoute; query: RawSearchParams | undefined }) {
  const selected = parseServerParam(firstParam(query, 'server'));
  const initialData = await getServerBrowserData(game, selected);
  // Retained game history follows the listed Wardogs server only (its reader answers `null` for anything unapproved).
  const listed = initialData.overview.state === 'not_configured' ? null : initialData.overview.servers.find((server) => server.publicId === selected) ?? null;
  const historySummary = game === 'wardogs' && listed ? <ServerHistorySummary publicId={listed.publicId} serverName={listed.name} locale={locale} /> : null;
  return <ServerBrowser key={[locale, game, selected ?? ''].join('/')} locale={locale} game={game} query={query} initialData={initialData} switchNotice={<GameSwitchNotice locale={locale} game={game} query={query} />} historySummary={historySummary} />;
}
