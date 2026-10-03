import { getTranslations } from 'next-intl/server';
import styles from '@/components/admin/admin.module.css';
import { TaxonomyTermForm } from '@/components/admin/taxonomy-term-form';
import { GuardedLink } from '@/components/shell/guarded-link';
import { GameButton } from '@/components/ui/game-button';
import { EmptyState } from '@/components/ui/panels';
import type { AppLocale } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import type { Principal } from '@/modules/access/types';
import { getTaxonomyTermForAdmin, type TaxonomyTermDTO } from '@/modules/taxonomy/admin';
import { taxonomySectionId, type TaxonomyScope } from '@/modules/taxonomy/scope';

/**
 * Create (`id === 'new'`) or edit page of one term. The route page has already enforced
 * `content.edit` for the scope's game (manual) or platform-wide (news); the domain read
 * re-checks the private-read scope and returns only a term of this exact scope.
 */
export async function TaxonomyTermScreen({ locale, actor, scope, id }: { locale: AppLocale; actor: Principal; scope: TaxonomyScope; id: string }) {
  const t = await getTranslations({ locale, namespace: 'adminTaxonomy' });
  const tGames = await getTranslations({ locale, namespace: 'adminEditorial.games' });
  const gameLabel = scope.scope === 'manual-category' ? tGames(scope.game) : '';
  const listHref = `/admin/taxonomy#${taxonomySectionId(scope)}`;
  let term: TaxonomyTermDTO | null = null;
  if (id !== 'new') {
    term = await getTaxonomyTermForAdmin(getDb(), actor, { scope, id });
    if (!term) {
      return (
        <section aria-labelledby="taxonomy-term-heading" className={styles.stack} data-testid="taxonomy-not-found">
          <div className={styles.pageHead}>
            <div>
              <p className={styles.eyebrow}>
                <GuardedLink href={listHref} className={styles.textLink}>
                  {t('form.backToList')}
                </GuardedLink>
              </p>
              <h1 id="taxonomy-term-heading">{t(`form.titles.${scope.scope}`)}</h1>
            </div>
          </div>
          <EmptyState title={t('form.notFoundTitle')} action={<GameButton href="/admin/taxonomy">{t('form.backToList')}</GameButton>}>
            {t('form.notFoundBody')}
          </EmptyState>
        </section>
      );
    }
  }
  const heading = term ? (locale === 'cs' ? term.labelCs : term.labelEn) : t(`form.newTitles.${scope.scope}`);
  return (
    <section aria-labelledby="taxonomy-term-heading" className={styles.stack} data-testid="taxonomy-term" data-scope={scope.scope}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>
            <GuardedLink href={listHref} className={styles.textLink}>
              {t('form.backToList')}
            </GuardedLink>
            {' · '}
            {t(`form.scope.${scope.scope}`, { game: gameLabel })}
          </p>
          <h1 id="taxonomy-term-heading" lang={term ? locale : undefined}>
            {heading}
          </h1>
          {term ? <p className={`${styles.lead} ${styles.small}`}>{t(`form.titles.${scope.scope}`)}</p> : null}
        </div>
      </div>
      <TaxonomyTermForm key={term?.id ?? 'new'} uiLocale={locale} scope={scope} term={term} gameLabel={gameLabel} />
    </section>
  );
}
