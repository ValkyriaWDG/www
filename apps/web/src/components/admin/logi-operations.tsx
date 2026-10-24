import { getTranslations } from 'next-intl/server';
import { GameButton } from '@/components/ui/game-button';
import { getServerEnv } from '@/lib/env';
import type { AppLocale } from '@/i18n/routing';
import type { Actor } from '@/modules/access/types';
import { adminLogiLinks } from './admin-workflows';
import styles from './admin.module.css';

export async function LogiOperations({ locale, actor }: { locale: AppLocale; actor: Actor }) {
  const t = await getTranslations({ locale, namespace: 'admin.operations' });
  const links = adminLogiLinks(getServerEnv(), actor);
  return (
    <section className={styles.panel} aria-labelledby="logi-operations-title" data-testid="admin-logi-operations">
      <h2 className={styles.panelTitle} id="logi-operations-title">{t('title')}</h2>
      <div className={styles.panelBody}>
        <p>{t('description')}</p>
        {links.length ? (
          <div className={styles.row}>
            {links.map((link) => (
              <GameButton key={link.href} href={link.href} external externalLabel={t('external')} intent="primary">
                {t('open')} · {link.games.map((game) => t(`games.${game}`)).join(' / ')}
              </GameButton>
            ))}
          </div>
        ) : <p className={styles.muted}>{t('unavailable')}</p>}
      </div>
    </section>
  );
}
