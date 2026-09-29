import { GameSwitchNotice } from '@/components/games/switch-notice';
import { firstParam, type RawSearchParams } from '@/components/public/query';
import type { AppLocale } from '@/i18n/routing';
import type { GameRoute } from '@/modules/games/registry';
import { getServerBrowserData } from '@/modules/integrations/servers/browser';
import { parseServerParam } from '@/modules/integrations/servers/view';
import { ServerBrowser } from './server-browser';

/** Initial public data is rendered on the server; polling reuses those same cached providers. */
export async function ServersScreen({ locale, game, query }: { locale: AppLocale; game: GameRoute; query: RawSearchParams | undefined }) {
  const selected = parseServerParam(firstParam(query, 'server'));
  return <ServerBrowser key={[locale, game, selected ?? ''].join('/')} locale={locale} game={game} query={query} initialData={await getServerBrowserData(game, selected)} switchNotice={<GameSwitchNotice locale={locale} game={game} query={query} />} />;
}
