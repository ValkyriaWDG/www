import 'server-only';
import { GAMES, type Game } from '@valkyria/db';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { canForGame } from '@/modules/access/policy';
import type { Principal } from '@/modules/access/types';
import { gameHasSection, gameRouteFromDb } from '@/modules/games/registry';
import type { ScopeOption } from './new-post-form';

/**
 * Publication scopes an actor may create editorial content in: community (platform-wide
 * grants only) and each permitted game; Field Manual articles only in games that have a
 * manual. Presentation convenience — `createDocument` re-checks the chosen scope.
 */
export async function creatableScopes(locale: AppLocale, actor: Principal, kind: 'news' | 'manual'): Promise<ScopeOption[]> {
  const t = await getTranslations({ locale, namespace: 'adminEditorial' });
  const games = GAMES.filter((game: Game) => canForGame(actor, 'content.edit', game) && (kind === 'news' || gameHasSection(gameRouteFromDb(game), 'field-manual')));
  const options: ScopeOption[] = games.map((game) => ({ value: game, label: t(`games.${game}`) }));
  if (kind === 'news' && canForGame(actor, 'content.edit', null)) options.unshift({ value: '', label: t('list.communityScope') });
  return options;
}
