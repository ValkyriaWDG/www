import { getTranslations } from 'next-intl/server';
import { FeedbackNotice } from '@/components/ui/panels';
import type { AppLocale } from '@/i18n/routing';
import type { GameRoute } from '@/modules/games/registry';
import { GAME_SWITCH_PARAM, parseGameSwitchNotice } from '@/modules/games/routes';
import { firstParam, type RawSearchParams } from '@/components/public/query';
import styles from './games.module.css';

/**
 * Explains a game-switch destination that is not the same kind of page: the previous
 * detail had no counterpart (`?switch=detail` on a list) or the section does not exist in
 * this game (`?switch=section` on a landing). Rendered only for these two known values.
 */
export async function GameSwitchNotice({ locale, game, query }: { locale: AppLocale; game: GameRoute; query: RawSearchParams | undefined }) {
  const notice = parseGameSwitchNotice(firstParam(query, GAME_SWITCH_PARAM));
  if (!notice) return null;
  const t = await getTranslations({ locale, namespace: 'games' });
  const name = t(`names.${game}`);
  return (
    <div className={styles.switchNotice} data-game-switch-notice={notice}>
      <FeedbackNotice kind="info" title={t(`switchNotice.${notice}.title`, { game: name })} live={false}>
        <p>{t(`switchNotice.${notice}.body`, { game: name })}</p>
      </FeedbackNotice>
    </div>
  );
}
