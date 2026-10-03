import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { formatDate } from '@/components/admin-community/format';
import base from '@/components/admin-community/admin-community.module.css';
import { EmptyState, FeedbackNotice, StatusBadge, type StatusKind } from '@/components/ui/panels';
import type { AppLocale } from '@/i18n/routing';
import type { AdminIntegrationHealth, AdminLogiPurpose, AdminReaderState, ScopeState } from '@/modules/integrations/admin-health-types';
import styles from './admin-integrations.module.css';

/*
 * Read-only Logi and Discord facts (issue #22). Every value is website-side: pulled
 * projections, checkpoints, queues and configuration flags. Nothing here is a claim
 * about the hosted Logi runtime or its Discord connection.
 */

const STATE_KIND: Record<ScopeState, StatusKind> = { not_configured: 'neutral', configured: 'info', never_ran: 'warning', bootstrapping: 'warning', healthy: 'success', stale: 'warning', unavailable: 'danger' };
const READER_STATE_KIND: Record<AdminReaderState, StatusKind> = { unconfigured: 'neutral', configured: 'info', unsupported: 'danger' };
const KNOWN_CAPABILITIES = new Set(['server_snapshot', 'match_history']);
/** Bounded machine codes with localized labels; anything else falls back to the generic entry. */
const LOGI_ERROR_CODES = ['configuration', 'unauthorized', 'forbidden', 'not_found', 'reset_required', 'rate_limited', 'upstream', 'network', 'timeout', 'invalid_response', 'redirect', 'scope_mismatch', 'unknown_outcome', 'persistence', 'unavailable'] as const;
const HEALTH_ERROR_CATEGORIES = ['timeout', 'network', 'rate_limited', 'unauthorized', 'invalid_response', 'unsupported', 'configuration', 'not_listed'] as const;
const MAPPING_ERRORS = ['invalid_json', 'not_an_object', 'invalid_role_id', 'invalid_role', 'empty_roles', 'invalid_games', 'too_many_entries'] as const;
const known = <T extends string>(values: readonly T[], value: string): value is T => (values as readonly string[]).includes(value);

function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

export async function HealthSections({ locale, health }: { locale: AppLocale; health: AdminIntegrationHealth }) {
  const t = await getTranslations({ locale, namespace: 'adminIntegrations' });
  const tGames = await getTranslations({ locale, namespace: 'adminIntegrations.games' });
  const when = (value: string | null) => (value ? formatDate(value, locale, 'dateTimeZone') : t('logi.never'));
  const onOff = (value: boolean) => (value ? t('logi.source.on') : t('logi.source.off'));
  const errorCodeLabel = (code: string) => (known(LOGI_ERROR_CODES, code) ? t(`logi.errorCodes.${code}`) : t('logi.errorCodes.other', { code }));
  const errorCategoryLabel = (category: string) => (known(HEALTH_ERROR_CATEGORIES, category) ? t(`logi.health.errorCategories.${category}`) : t('logi.health.errorCategories.other', { category }));
  const mappingErrorLabel = (error: string) => (known(MAPPING_ERRORS, error) ? t(`discord.mapping.errors.${error}`) : t('discord.mapping.errors.other', { error }));
  const { logi, discord } = health;

  const purposeDetails = (purpose: AdminLogiPurpose) => {
    const scope = purpose.scope;
    const items: ReactNode[] = [];
    if (!purpose.enabled) items.push(<span key="switch">{t('logi.disabledBySwitch')}</span>);
    if (scope) {
      items.push(<span key="attempt">{t('logi.lastAttemptAt')}: {when(scope.lastAttemptAt)}</span>);
      items.push(<span key="success">{t('logi.lastSuccessAt')}: {when(scope.lastSuccessAt)}</span>);
      if (scope.nextAttemptAt) items.push(<span key="next">{t('logi.nextAttemptAt')}: {when(scope.nextAttemptAt)}</span>);
      if (scope.mode) items.push(<span key="mode">{t(`logi.mode.${scope.mode}`)}</span>);
      items.push(<span key="generation">{t('logi.generation')}: {scope.hasActiveGeneration ? t('logi.yes') : t('logi.no')}</span>);
    }
    return items;
  };

  return (
    <>
      <section className={base.panel} aria-labelledby="integrations-logi-title" data-integrations-logi="">
        <h2 id="integrations-logi-title" className={base.panelTitle}>
          {t('logi.title')}
        </h2>
        <p className={base.actionNote}>{t('logi.intro')}</p>
        {logi.configError ? (
          <FeedbackNotice kind="warning" live={false}>
            {t('logi.configError')}
          </FeedbackNotice>
        ) : null}
        <dl className={styles.facts}>
          <Fact label={t('logi.sso.label')}>
            <StatusBadge kind={logi.sso.enabled ? 'success' : 'neutral'}>{logi.sso.enabled ? t('logi.sso.enabled') : t('logi.sso.disabled')}</StatusBadge>
            <StatusBadge kind={logi.sso.configured ? 'success' : logi.sso.enabled ? 'danger' : 'neutral'}>{logi.sso.configured ? t('logi.sso.configured') : t('logi.sso.notConfigured')}</StatusBadge>
            {logi.sso.discordFallback ? <span className={styles.observed}>{t('logi.sso.fallback')}</span> : null}
          </Fact>
          <Fact label={t('logi.membership.label')}>
            <StatusBadge kind="info" icon={false}>
              {t(`logi.membership.${logi.membershipSource}`)}
            </StatusBadge>
          </Fact>
          <Fact label={t('logi.webhooks.label')}>
            <StatusBadge kind={logi.webhooks.enabled ? 'success' : 'neutral'}>{logi.webhooks.enabled ? t('logi.webhooks.enabled') : t('logi.webhooks.disabled')}</StatusBadge>
            <span className={styles.observed} data-webhooks-pending={logi.webhooks.pendingHints}>
              {logi.webhooks.lastReceivedAt
                ? `${t('logi.webhooks.pending', { count: logi.webhooks.pendingHints })} · ${t('logi.webhooks.lastReceived', { time: when(logi.webhooks.lastReceivedAt) })}${logi.webhooks.lastProcessedAt ? ` · ${t('logi.webhooks.lastProcessed', { time: when(logi.webhooks.lastProcessedAt) })}` : ''}`
                : t('logi.webhooks.none')}
            </span>
          </Fact>
          <Fact label={t('logi.commands.label')}>
            <StatusBadge kind={logi.commands.enabled ? 'success' : 'neutral'}>{logi.commands.enabled ? t('logi.commands.enabled') : t('logi.commands.disabled')}</StatusBadge>
            <span className={styles.observed} data-commands-pending={logi.commands.pending}>
              {logi.commands.lastReceiptAt || logi.commands.pending > 0
                ? `${t('logi.commands.pending', { count: logi.commands.pending })}${logi.commands.lastReceiptAt ? ` · ${t('logi.commands.lastReceipt', { time: when(logi.commands.lastReceiptAt) })}` : ''}`
                : t('logi.commands.none')}
            </span>
          </Fact>
        </dl>

        {logi.sources.length === 0 ? (
          <EmptyState title={t('logi.noSources.title')} titleAs="h3">
            <p>{t('logi.noSources.body')}</p>
          </EmptyState>
        ) : (
          logi.sources.map((source) => (
            <article key={`${source.sourceInstanceId}/${source.game}`} className={styles.sourceCard} data-logi-source={source.game}>
              <h3 className={styles.sourceTitle}>
                {tGames(source.game)} · {source.sourceInstanceId}
              </h3>
              <dl className={styles.facts}>
                <Fact label={t('logi.source.instance')}>
                  <span className={styles.code}>{source.sourceInstanceId}</span>
                </Fact>
                <Fact label={t('logi.source.guild')}>
                  <span className={styles.code}>{source.guildId}</span>
                </Fact>
                <Fact label={t('logi.source.publishMatches')}>{onOff(source.publishMatches)}</Fact>
                <Fact label={t('logi.source.syncPeople')}>{onOff(source.syncPeople)}</Fact>
                <Fact label={t('logi.source.publicServers')}>{t('logi.source.publicServersValue', { published: source.publishedServers, total: source.publicServers })}</Fact>
              </dl>
              <h4 className={styles.subTitle}>{t('logi.purposesTitle')}</h4>
              <ul className={styles.purposeList}>
                {source.purposes.map((purpose) => {
                  const details = purposeDetails(purpose);
                  return (
                  <li key={purpose.purpose} className={styles.purpose} data-purpose={purpose.purpose} data-state={purpose.state}>
                    <div className={styles.purposeHead}>
                      <span className={styles.purposeName}>{t(`logi.purposes.${purpose.purpose}`)}</span>
                      <span className={styles.badges}>
                        <StatusBadge kind={STATE_KIND[purpose.state]}>{t(`logi.state.${purpose.state}`)}</StatusBadge>
                        {purpose.scope?.errorCode ? (
                          <StatusBadge kind="danger" icon={false}>
                            {t('logi.errorCode', { label: errorCodeLabel(purpose.scope.errorCode) })}
                          </StatusBadge>
                        ) : null}
                        {purpose.scope?.leaseActive ? <StatusBadge kind="accent">{t('logi.leaseActive')}</StatusBadge> : null}
                      </span>
                    </div>
                    {details.length > 0 ? <p className={styles.detail}>{details}</p> : null}
                    {purpose.purpose === 'data' && purpose.configured ? (
                      <div className={base.stack} data-health={purpose.health === null ? 'unknown' : 'reported'}>
                        <span className={styles.subTitle}>{t('logi.health.title')}</span>
                        {purpose.health === null ? (
                          <p className={styles.detail}>
                            <span>{t('logi.health.unknown')}</span>
                          </p>
                        ) : purpose.health.length === 0 ? (
                          <p className={styles.detail}>
                            <span>{t('logi.health.none')}</span>
                          </p>
                        ) : (
                          <ul className={styles.healthList}>
                            {purpose.health.map((row) => (
                              <li key={row.connectionId} data-health-connection={row.connectionId}>
                                <span className={styles.code}>{row.provider}</span>
                                <StatusBadge kind={row.enabled ? 'success' : 'neutral'}>{row.enabled ? t('logi.health.enabled') : t('logi.health.disabled')}</StatusBadge>
                                <StatusBadge kind={row.freshness === 'fresh' ? 'success' : row.freshness === 'stale' ? 'warning' : 'neutral'}>{t(`servers.freshness.${row.freshness}`)}</StatusBadge>
                                <span className={styles.observed}>
                                  {row.capabilities.length === 0 ? t('logi.health.noCapabilities') : row.capabilities.map((capability) => (KNOWN_CAPABILITIES.has(capability) ? t(`logi.health.capabilities.${capability as 'server_snapshot' | 'match_history'}`) : capability)).join(', ')}
                                  {row.collectedSessions !== null ? ` · ${t('logi.health.sessions', { count: row.collectedSessions })}` : ''}
                                  {row.lastSuccessAt ? ` · ${t('logi.lastSuccessAt')}: ${when(row.lastSuccessAt)}` : ''}
                                  {row.errorCategory ? ` · ${t('logi.health.error', { label: errorCategoryLabel(row.errorCategory) })}` : ''}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : null}
                  </li>
                  );
                })}
              </ul>
            </article>
          ))
        )}

        <h3 className={styles.sourceTitle} id="integrations-readers-title">
          {t('logi.readers.title')}
        </h3>
        <p className={base.actionNote}>{t('logi.readers.intro')}</p>
        <ul className={styles.purposeList} aria-labelledby="integrations-readers-title" data-logi-readers="">
          {logi.readers.map((reader) => (
            <li key={reader.resource} className={styles.purpose} data-reader={reader.resource} data-state={reader.state}>
              <div className={styles.purposeHead}>
                <span className={styles.purposeName}>{t(`logi.purposes.${reader.purpose}`)}</span>
                <span className={styles.badges}>
                  <StatusBadge kind={READER_STATE_KIND[reader.state]}>{t(`logi.readers.state.${reader.state}`)}</StatusBadge>
                  {reader.lastOutcome && reader.lastOutcome !== 'ok' ? (
                    <StatusBadge kind="danger" icon={false}>
                      {t('logi.errorCode', { label: errorCodeLabel(reader.lastOutcome) })}
                    </StatusBadge>
                  ) : null}
                </span>
              </div>
              <p className={styles.detail}>
                {reader.resource === 'warcon-data' ? <span>{t('logi.readers.connections', { count: reader.approvedConnections })}</span> : null}
                <span>{t('logi.lastAttemptAt')}: {when(reader.lastAttemptAt)}{reader.lastOutcome === 'ok' ? ` · ${t('logi.readers.lastOk')}` : ''}</span>
                <span className={styles.code}>{reader.detail}</span>
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className={base.panel} aria-labelledby="integrations-discord-title" data-integrations-discord="">
        <h2 id="integrations-discord-title" className={base.panelTitle}>
          {t('discord.title')}
        </h2>
        <p className={base.actionNote}>{t('discord.intro')}</p>
        <dl className={styles.facts}>
          <Fact label={t('discord.guild.label')}>
            <StatusBadge kind={discord.guildConfigured ? 'success' : 'neutral'}>{discord.guildConfigured ? t('discord.guild.configured') : t('discord.guild.notConfigured')}</StatusBadge>
          </Fact>
          <Fact label={t('discord.mapping.label')}>
            {discord.roleMappingError ? (
              <StatusBadge kind="danger">{t('discord.mapping.error', { label: mappingErrorLabel(discord.roleMappingError) })}</StatusBadge>
            ) : discord.roleMappingConfigured ? (
              <StatusBadge kind="success">{t('discord.mapping.count', { count: discord.mappedRoles })}</StatusBadge>
            ) : (
              <StatusBadge kind="warning">{t('discord.mapping.none')}</StatusBadge>
            )}
          </Fact>
          <Fact label={t('discord.membership.label')}>
            <StatusBadge kind="info" icon={false}>
              {t(`discord.membership.${discord.membershipSource}`)}
            </StatusBadge>
          </Fact>
        </dl>
      </section>
    </>
  );
}
