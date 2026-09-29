'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ExternalLink } from '@/components/public/external-link';
import { firstParam, type RawSearchParams } from '@/components/public/query';
import { PageMain } from '@/components/shell/page-main';
import { DetailPane, EmptyState, FeedbackNotice, GameButton, PageHeader, SelectionTable, StatusBadge, type SelectionColumn, type StatusKind } from '@/components/ui';
import { MapScene, MapThumb } from '@/components/hll/map-artwork';
import { formatDate, formatNumber } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import type { GameRoute } from '@/modules/games/registry';
import { hllMapArtwork } from '@/modules/games/hll-maps';
import { gamePath } from '@/modules/games/routes';
import type { Freshness, ServerSnapshot } from '@/modules/integrations/contract';
import type { ServerBrowserData } from '@/modules/integrations/servers/browser';
import { parseServerParam, populationParts, resolveSelection } from '@/modules/integrations/servers/view';
import { CopyAddress } from './copy-address';
import { LivePlayersTable } from './live-players-table';
import { useServerPolling } from './use-server-polling';
import styles from './servers.module.css';

const FRESHNESS_KIND: Record<Freshness, StatusKind> = { fresh: 'success', stale: 'warning', unavailable: 'neutral' };

/**
 * Observed server list/detail (references 12–13, 58:42). Only the configured Valkyria
 * set is shown, with observation time and freshness; unknown values stay an explicit
 * dash. `?server=<public-id>` selects a row and updates the detail panel. States are
 * distinct: source not configured, configured but empty, source unavailable (with last
 * known rows marked stale), no selection, a removed selection, and selected.
 */
export function ServerBrowser({ locale, game, query, initialData, switchNotice }: { locale: AppLocale; game: GameRoute; query: RawSearchParams | undefined; initialData: ServerBrowserData; switchNotice: ReactNode }) {
  const t = useTranslations('games.servers');
  const games = useTranslations('games');
  const common = useTranslations('common.external');
  const selectedParam = parseServerParam(firstParam(query, 'server'));
  const poll = useServerPolling(game, selectedParam, initialData);
  const { overview, livePlayers } = poll.data;
  const base = `${gamePath(game)}/servers`;
  const servers = overview.state === 'not_configured' ? [] : overview.servers;
  const selection = resolveSelection(servers, selectedParam);
  const selected = selection.kind === 'selected' ? selection.server : null;

  const dash = (
    <>
      <span aria-hidden="true">—</span>
      <span className="visually-hidden">{t('notAvailable')}</span>
    </>
  );
  const population = (server: ServerSnapshot): ReactNode => {
    const parts = populationParts(server);
    if (!parts) return dash;
    return (
      <span className={styles.population}>
        <span className={styles.players}>{parts.players === null ? dash : formatNumber(parts.players, locale)}</span>
        <span className={styles.capacity}>
          {' / '}
          {parts.capacity === null ? dash : formatNumber(parts.capacity, locale)}
        </span>
      </span>
    );
  };
  const remaining = (seconds: number | null): ReactNode => {
    if (seconds === null) return dash;
    const minutes = Math.round(seconds / 60);
    return minutes >= 60
      ? t('detail.timeValueHours', { hours: Math.floor(minutes / 60), minutes: minutes % 60 })
      : t('detail.timeValueMinutes', { minutes });
  };
  const observed = (server: ServerSnapshot) =>
    server.observedAt ? t('observed', { time: formatDate(server.observedAt, locale, 'dateTimeZone') }) : t('neverObserved');
  // Map pack artwork is HLL-only; an unknown map keeps the neutral placeholder.
  const artwork = (server: ServerSnapshot) => (game === 'hll' ? hllMapArtwork(server.map) : null);
  const freshness = (server: ServerSnapshot) => (
    <StatusBadge kind={FRESHNESS_KIND[server.freshness]}>{t(`freshness.${server.freshness}`)}</StatusBadge>
  );

  const columns: SelectionColumn<ServerSnapshot>[] = [
    {
      key: 'server',
      header: t('columns.server'),
      rowHeader: true,
      cell: (server) => {
        const map = artwork(server);
        return (
          <span className={styles.serverCell}>
            <span className={styles.thumb} aria-hidden="true">
              {map ? <MapThumb artwork={map} /> : null}
            </span>
            <span className={styles.serverText}>
              <span className={styles.serverName} data-server-name="">
                {server.name}
              </span>
              <span className={styles.serverMap}>{server.map ?? t('mapUnknown')}</span>
            </span>
          </span>
        );
      },
    },
    { key: 'players', header: t('columns.players'), numeric: true, align: 'end', cell: population },
    { key: 'mode', header: t('columns.mode'), cell: (server) => server.mode ?? dash },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (server) => (
        <span className={styles.statusCell}>
          {freshness(server)}
          <span className={styles.observedText}>{observed(server)}</span>
        </span>
      ),
    },
  ];

  let list: ReactNode;
  if (overview.state === 'not_configured') {
    list = (
      <EmptyState title={t('notConfigured.title')}>
        <p>{t('notConfigured.body')}</p>
      </EmptyState>
    );
  } else if (servers.length === 0 && overview.state === 'ok') {
    list = (
      <EmptyState title={t('empty.title')}>
        <p>{t('empty.body')}</p>
      </EmptyState>
    );
  } else if (servers.length === 0) {
    list = null;
  } else {
    list = (
      <div className={styles.table} data-server-table="">
        <SelectionTable
          caption={t('caption')}
          captionHidden
          columns={columns}
          rows={servers}
          getRowKey={(server) => server.publicId}
          getRowHref={(server) => `${base}?server=${server.publicId}`}
          linkColumn="server"
          selectedKey={selected?.publicId ?? null}
          linkScroll={false}
        />
      </div>
    );
  }

  let detail: ReactNode = null;
  if (overview.state !== 'not_configured' && servers.length > 0) {
    if (selected) {
      const map = artwork(selected);
      detail = (
        <DetailPane
          titleId="server-detail-title"
          eyebrow={t('detail.eyebrow')}
          title={<span className={styles.detailName}>{selected.name}</span>}
          media={
            map && selected.map ? (
              <MapScene
                key={map.slug}
                artwork={map}
                priority
                wide
                alt={t('detail.mapImageAlt', { map: selected.map })}
                tacticalLabel={t('detail.tacticalMap', { map: selected.map, size: formatNumber(Math.round(map.tactical.bytes / 1024), locale) })}
              />
            ) : undefined
          }
          metadata={[
            { label: t('detail.map'), value: selected.map ?? dash },
            { label: t('detail.mode'), value: selected.mode ?? dash },
            { label: t('detail.nextMap'), value: selected.nextMap ?? dash },
            { label: t('detail.timeRemaining'), value: remaining(selected.timeRemainingSeconds) },
            {
              label: t('detail.score'),
              value: selected.score ? <span data-server-score="">{t('detail.scoreValue', selected.score)}</span> : dash,
            },
            { label: t('detail.population'), value: population(selected) },
            { label: t('detail.teams'), value: selected.teams ? t('detail.teamsValue', selected.teams) : dash },
            { label: t('detail.reachability'), value: t(`reachability.${selected.reachability}`) },
            { label: t('detail.freshness'), value: freshness(selected) },
            {
              label: t('detail.observedAt'),
              value: selected.observedAt ? <time dateTime={selected.observedAt}>{formatDate(selected.observedAt, locale, 'dateTimeZone')}</time> : t('neverObserved'),
            },
          ]}
        >
          <section className={styles.connect} aria-labelledby="server-connect-title">
            <h3 id="server-connect-title" className={styles.connectTitle}>
              {t('detail.connect')}
            </h3>
            {selected.connect.kind === 'address' ? (
              <p className={styles.connectRow}>
                <span className={styles.connectLabel}>{t('detail.address')}</span>
                <code className={styles.address} data-server-address="">
                  {selected.connect.address}
                </code>
                <CopyAddress address={selected.connect.address} labels={{ copy: t('detail.copy'), copied: t('detail.copied'), failed: t('detail.copyFailed') }} />
              </p>
            ) : (
              <p className={styles.connectNone}>{t('detail.noConnect')}</p>
            )}
            <p className={styles.connectNote}>{t('detail.pingNote')}</p>
            {selected.statsUrl ? (
              <p className={styles.connectRow}>
                <ExternalLink href={selected.statsUrl} externalLabel={common('suffix')} variant="button" data-server-stats="">
                  {t('detail.liveStats')}
                </ExternalLink>
              </p>
            ) : null}
          </section>
        </DetailPane>
      );
    } else {
      detail = (
        <div className={styles.unselected} data-server-detail={selection.kind}>
          <p className={styles.unselectedTitle}>{selection.kind === 'missing' ? t('missingSelection') : t('selectPrompt')}</p>
          <p className={styles.unselectedBody}>{t('selectBody')}</p>
        </div>
      );
    }
  }

  return (
    <PageMain width="full" labelledBy="servers-title">
      <PageHeader
        breadcrumbs={[{ href: gamePath(game), label: games(`menuLabel.${game}`) }, { label: t('title') }]}
        eyebrow={games(`eyebrow.${game}`)}
        title={t('title')}
        titleId="servers-title"
        description={<p>{t('intro')}</p>}
      />
      {switchNotice}
      {overview.state !== 'not_configured' ? (
        <div className={styles.refresh} data-server-refresh="">
          <label><input type="checkbox" checked={poll.automatic} onChange={(event) => poll.setAutomatic(event.target.checked)} /> {t('refresh.auto', { seconds: poll.interval })}</label>
          <button type="button" className={styles.copyButton} disabled={poll.refreshing || poll.coolingDown} onClick={poll.refresh}>{t(poll.refreshing ? 'refresh.loading' : 'refresh.now')}</button>
          <span role="status">{t(poll.failed ? 'refresh.failed' : 'refresh.note')}</span>
        </div>
      ) : null}
      {overview.state === 'ok' && overview.synthetic ? (
        <p className={styles.synthetic} data-synthetic-data="">
          {t('synthetic')}
        </p>
      ) : null}
      {overview.state === 'ok' && overview.partial ? (
        <div className={styles.notice} data-server-source="partial">
          <FeedbackNotice kind="warning" title={t('partial.title')} live={false}>
            <p>{t('partial.body')}</p>
          </FeedbackNotice>
        </div>
      ) : null}
      {overview.state === 'unavailable' ? (
        <div className={styles.notice} data-server-source="unavailable">
          <FeedbackNotice
            kind="warning"
            title={t('unavailable.title')}
            live={false}
            action={
              <GameButton href={selected ? `${base}?server=${selected.publicId}` : base} intent="secondary" size="sm">
                {t('unavailable.retry')}
              </GameButton>
            }
          >
            <p>{t('unavailable.body')}</p>
            {servers.length > 0 ? <p>{t('unavailable.lastKnown')}</p> : null}
          </FeedbackNotice>
        </div>
      ) : null}
      <div className={styles.browser} data-selected={selected ? '' : undefined} data-server-state={overview.state}>
        <div className={styles.list}>{list}</div>
        {detail ? (
          <div className={styles.detail}>
            {selected ? (
              <p className={styles.back}>
                <GameButton href={base} intent="ghost" size="sm" data-server-back="">
                  {t('detail.back')}
                </GameButton>
              </p>
            ) : null}
            {detail}
          </div>
        ) : null}
      </div>
      {selected && livePlayers?.publicId === selected.publicId ? <LivePlayersTable snapshot={livePlayers} locale={locale} serverName={selected.name} connectedPlayers={selected.freshness === 'fresh' ? selected.players : null} /> : null}
    </PageMain>
  );
}
