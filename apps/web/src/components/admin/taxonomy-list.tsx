import { getTranslations } from 'next-intl/server';
import styles from '@/components/admin/admin.module.css';
import { GameButton } from '@/components/ui/game-button';
import { EmptyState, FeedbackNotice, StatusBadge } from '@/components/ui/panels';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import type { Principal } from '@/modules/access/types';
import { listTaxonomyForAdmin, type TaxonomyAdminOverview, type TaxonomyTermDTO } from '@/modules/taxonomy/admin';
import { taxonomyScopePath, taxonomySectionId, type TaxonomyScope } from '@/modules/taxonomy/scope';
import local from './taxonomy.module.css';

type SectionCopy = 'manual' | 'newsCategories' | 'newsTags';

/**
 * Categories and tags workspace: one section per Field Manual game in the actor's scope
 * plus the shared news categories and tags for platform-wide editors. Rows link to the
 * edit page; a phone stacks each row with its column names. The server re-checks every
 * term's scope when the edit page loads and on every action.
 */
export async function TaxonomyListScreen({ locale, actor }: { locale: AppLocale; actor: Principal }) {
  const t = await getTranslations({ locale, namespace: 'adminTaxonomy' });
  const tGames = await getTranslations({ locale, namespace: 'adminEditorial.games' });
  let overview: TaxonomyAdminOverview | null = null;
  try {
    overview = await listTaxonomyForAdmin(getDb(), actor);
  } catch (error) {
    console.error(`[admin.taxonomy] load failed: ${error instanceof Error ? error.name : 'unknown'}`);
  }

  const section = (scope: TaxonomyScope, copy: SectionCopy, rows: TaxonomyTermDTO[]) => {
    const id = taxonomySectionId(scope);
    const game = scope.scope === 'manual-category' ? tGames(scope.game) : '';
    const columns = {
      order: t('columns.order'),
      key: t('columns.key'),
      labelCs: t('columns.labelCs'),
      labelEn: t('columns.labelEn'),
      references: t('columns.references'),
      state: t('columns.state'),
      actions: t('columns.actions'),
    };
    const cellLabel = (text: string) => <span className={local.cellLabel}>{text}</span>;
    return (
      <section key={id} id={id} className={local.section} aria-labelledby={`${id}-title`} data-testid={`taxonomy-section-${id}`}>
        <div className={local.sectionHead}>
          <div>
            <h2 id={`${id}-title`}>{t(`sections.${copy}.title`, { game })}</h2>
            <p className={local.sectionLead}>{t(`sections.${copy}.lead`)}</p>
          </div>
          <GameButton href={taxonomyScopePath(scope, 'new')} intent="primary" data-testid={`taxonomy-new-${id}`}>
            {t(`sections.${copy}.new`)}
          </GameButton>
        </div>
        <div className={local.sectionBody}>
          {rows.length === 0 ? (
            <EmptyState title={t(`sections.${copy}.emptyTitle`)} titleAs="h3">
              {t(`sections.${copy}.emptyBody`)}
            </EmptyState>
          ) : (
            <div className={local.scroll} role="region" aria-label={t(`sections.${copy}.caption`, { game })} tabIndex={0}>
              <table className={local.table} role="table">
                <caption className="visually-hidden">{t(`sections.${copy}.caption`, { game })}</caption>
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader" scope="col">{columns.order}</th>
                    <th role="columnheader" scope="col">{columns.key}</th>
                    <th role="columnheader" scope="col">{columns.labelCs}</th>
                    <th role="columnheader" scope="col">{columns.labelEn}</th>
                    <th role="columnheader" scope="col">{columns.references}</th>
                    <th role="columnheader" scope="col">{columns.state}</th>
                    <th role="columnheader" scope="col">{columns.actions}</th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {rows.map((row) => (
                    <tr key={row.id} role="row" data-archived={row.archived || undefined} data-testid={`taxonomy-row-${id}-${row.key}`} data-key={row.key}>
                      <td role="cell" data-numeric="">
                        {cellLabel(columns.order)}
                        <span>{row.sortOrder}</span>
                      </td>
                      <th role="rowheader" scope="row">
                        {cellLabel(columns.key)}
                        <span className={local.key}>{row.key}</span>
                      </th>
                      <td role="cell">
                        {cellLabel(columns.labelCs)}
                        <span lang="cs">{row.labelCs}</span>
                      </td>
                      <td role="cell">
                        {cellLabel(columns.labelEn)}
                        <span lang="en">{row.labelEn}</span>
                      </td>
                      <td role="cell" data-numeric="">
                        {cellLabel(columns.references)}
                        <span data-references="">{row.referenceCount}</span>
                      </td>
                      <td role="cell">
                        {cellLabel(columns.state)}
                        <StatusBadge kind={row.archived ? 'warning' : 'success'}>{row.archived ? t('states.archived') : t('states.active')}</StatusBadge>
                      </td>
                      <td role="cell">
                        {cellLabel(columns.actions)}
                        <Link href={taxonomyScopePath(scope, row.id)} className={local.editLink} aria-label={t('editLabel', { label: locale === 'cs' ? row.labelCs : row.labelEn })} data-testid="taxonomy-edit">
                          {t('edit')}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    );
  };

  return (
    <section aria-labelledby="admin-taxonomy-title" className={styles.stack} data-testid="admin-taxonomy">
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>{t('eyebrow')}</p>
          <h1 id="admin-taxonomy-title">{t('title')}</h1>
          <p className={styles.lead}>{t('lead')}</p>
        </div>
      </div>
      {overview === null ? (
        <FeedbackNotice kind="error" live={false}>
          {t('loadFailed')}
        </FeedbackNotice>
      ) : (
        <>
          {overview.manual.length === 0 ? (
            <EmptyState title={t('manualDenied.title')}>{t('manualDenied.body')}</EmptyState>
          ) : (
            overview.manual.map((entry) => section({ scope: 'manual-category', game: entry.game }, 'manual', entry.categories))
          )}
          {overview.news === null ? (
            <div data-testid="taxonomy-news-denied">
              <EmptyState title={t('newsDenied.title')}>{t('newsDenied.body')}</EmptyState>
            </div>
          ) : (
            <>
              {section({ scope: 'news-category' }, 'newsCategories', overview.news.categories)}
              {section({ scope: 'news-tag' }, 'newsTags', overview.news.tags)}
            </>
          )}
        </>
      )}
    </section>
  );
}
