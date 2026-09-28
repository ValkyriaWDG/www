'use client';

import { useTranslations } from 'next-intl';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { GAME_ROUTES, type GameRoute } from '@/modules/games/registry';
import { gameOfPath, resolveGameSwitch } from '@/modules/games/routes';
import { GuardedLink } from './guarded-link';
import styles from './game-switch.module.css';

/**
 * Persistent game switch (Hell Let Loose / Wardogs) with full game names. Separate from
 * the language switch: it keeps the locale and, where the other game has one, the page
 * category (`resolveGameSwitch`). The active game carries `aria-current`; on shared
 * community routes neither option is current. Links are ordinary client navigations.
 */
export function GameSwitch({ variant = 'bar' }: { variant?: 'bar' | 'stack' }) {
  return (
    <Suspense fallback={<GameSwitchView search="" variant={variant} />}>
      <GameSwitchWithQuery variant={variant} />
    </Suspense>
  );
}

function GameSwitchWithQuery({ variant }: { variant: 'bar' | 'stack' }) {
  const searchParams = useSearchParams();
  return <GameSwitchView search={searchParams.toString()} variant={variant} />;
}

function GameSwitchView({ search, variant }: { search: string; variant: 'bar' | 'stack' }) {
  const t = useTranslations('common.gameSwitch');
  const pathname = usePathname() ?? '/';
  const current = gameOfPath(pathname);
  return (
    <div className={styles.switch} role="group" aria-label={t('label')} data-variant={variant} data-game-switch="">
      <ul className={styles.list}>
        {GAME_ROUTES.map((game: GameRoute) => (
          <li key={game} className={styles.item}>
            {game === current ? (
              <span className={styles.option} aria-current="true" data-game-option={game}>
                <span className={styles.name}>{t(`games.${game}`)}</span>
                <span className="visually-hidden"> {t('current')}</span>
              </span>
            ) : (
              <GuardedLink
                href={resolveGameSwitch(pathname, search, game)}
                className={styles.option}
                aria-label={t('switchTo', { game: t(`games.${game}`) })}
                data-game-option={game}
              >
                <span className={styles.name}>{t(`games.${game}`)}</span>
              </GuardedLink>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
