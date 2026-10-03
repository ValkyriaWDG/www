'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';
import { errorFor, type FieldErrors } from '@/components/admin-community/errors';
import { formatDate } from '@/components/admin-community/format';
import { useActionError, useFieldError } from '@/components/admin-community/use-messages';
import base from '@/components/admin-community/admin-community.module.css';
import { useUnsavedChangesGuard } from '@/components/shell/unsaved-changes';
import { Checkbox, FormActions, TextField } from '@/components/ui/form-fields';
import { GameButton } from '@/components/ui/game-button';
import { EmptyState, FeedbackNotice, StatusBadge, type StatusKind } from '@/components/ui/panels';
import type { AppLocale } from '@/i18n/routing';
import type { ActionResult } from '@/lib/result';
import type { AdminGameServers, AdminServerObservation } from '@/modules/integrations/admin-health-types';
import { loadSettingsAction, saveSettingsAction } from '@/modules/settings/actions';
import { serverPresentationSchema, type ServerPresentation, type ServerPresentationRow, type SettingKey } from '@/modules/settings/schemas';
import type { AdminSetting } from '@/modules/settings/service';
import styles from './admin-integrations.module.css';

/*
 * Website presentation of the configured public servers (`servers.presentation`): an
 * administrator renames, hides or reorders servers the operator configuration exposes.
 * One save writes the whole setting with its optimistic version; a failed or conflicting
 * save keeps the entered values. Server identities and telemetry are read-only here.
 */

const KEY: SettingKey = 'servers.presentation';
const FRESHNESS_KIND: Record<AdminServerObservation['freshness'], StatusKind> = { fresh: 'success', stale: 'warning', unavailable: 'neutral' };
const SOURCE_KIND: Record<AdminGameServers['source'], StatusKind> = { none: 'neutral', crcon: 'info', logi: 'info', 'synthetic-fixture': 'warning' };

type RowValues = { name: string; published: boolean; sortOrder: string };
type Values = Record<string, RowValues>;
type Notice = { kind: 'success' | 'error' | 'warning' | 'info'; title?: string; text: string; conflict?: boolean } | null;

const rowKey = (game: string, publicId: string) => `${game}/${publicId}`;
const storedRows = (setting: AdminSetting): ServerPresentation => (setting.value as ServerPresentation | null) ?? [];

function valuesFrom(games: AdminGameServers[], setting: AdminSetting): Values {
  const rows = storedRows(setting);
  const values: Values = {};
  for (const entry of games) {
    for (const server of entry.configured) {
      const row = rows.find((candidate) => candidate.game === entry.game && candidate.publicId === server.publicId);
      values[rowKey(entry.game, server.publicId)] = { name: row?.name ?? '', published: row?.published !== false, sortOrder: row?.sortOrder === undefined ? '' : String(row.sortOrder) };
    }
  }
  return values;
}

/** Override rows in configured order (only servers with a changed name, visibility or order) and their form keys. */
function payloadFrom(games: AdminGameServers[], values: Values): { rows: ServerPresentationRow[] | null; keys: string[] } {
  const rows: ServerPresentationRow[] = [];
  const keys: string[] = [];
  for (const entry of games) {
    for (const server of entry.configured) {
      const key = rowKey(entry.game, server.publicId);
      const value = values[key];
      if (!value) continue;
      const name = value.name.trim();
      const order = value.sortOrder.trim();
      if (!name && value.published && !order) continue;
      rows.push({ game: entry.game, publicId: server.publicId, ...(name ? { name } : {}), ...(value.published ? {} : { published: false }), ...(order ? { sortOrder: Number(order) } : {}) });
      keys.push(key);
    }
  }
  return { rows: rows.length > 0 ? rows : null, keys };
}

/** Server/zod field paths (`servers.presentation.0.name`) → form row paths (`servers.presentation.hll/alpha.name`). */
function mapErrors(input: Record<string, string>, keys: string[]): FieldErrors {
  const result: FieldErrors = {};
  for (const [path, code] of Object.entries(input)) {
    const match = path.match(/^servers\.presentation\.(\d+)(?:\.(.+))?$/);
    if (!match) {
      result[path] = code;
      continue;
    }
    const key = keys[Number(match[1])];
    result[key ? `${KEY}.${key}${match[2] ? `.${match[2]}` : ''}` : KEY] = code;
  }
  return result;
}

function validate(games: AdminGameServers[], values: Values): FieldErrors {
  const errors: FieldErrors = {};
  for (const [key, value] of Object.entries(values)) {
    const order = value.sortOrder.trim();
    if (order && !/^\d{1,4}$/.test(order)) errors[`${KEY}.${key}.sortOrder`] = 'invalid_number';
  }
  const { rows, keys } = payloadFrom(games, values);
  if (rows) {
    const parsed = serverPresentationSchema.safeParse(rows);
    if (!parsed.success) {
      const issues: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = [KEY, ...issue.path.map(String)].join('.');
        if (!(path in issues)) issues[path] = /^[a-z][a-z_]*$/.test(issue.message) ? issue.message : issue.code;
      }
      for (const [path, code] of Object.entries(mapErrors(issues, keys))) if (!(path in errors)) errors[path] = code;
    }
  }
  return errors;
}

export function ServerPresentationForm({ uiLocale, games, initial }: { uiLocale: AppLocale; games: AdminGameServers[]; initial: AdminSetting }) {
  const t = useTranslations('adminIntegrations.servers');
  const tGames = useTranslations('adminIntegrations.games');
  const tc = useTranslations('adminCommunity.common');
  const fieldError = useFieldError();
  const actionError = useActionError();
  const [stored, setStored] = useState<AdminSetting>(initial);
  const [values, setValues] = useState<Values>(() => valuesFrom(games, initial));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState<'save' | 'reload' | null>(null);
  const submittedKeys = useRef<string[]>([]);

  const baseline = useMemo(() => valuesFrom(games, stored), [games, stored]);
  const baselinePayload = useMemo(() => JSON.stringify(payloadFrom(games, baseline).rows), [games, baseline]);
  const payload = payloadFrom(games, values);
  const dirty = JSON.stringify(payload.rows) !== baselinePayload;
  const changedCount = Object.keys(values).filter((key) => JSON.stringify(values[key]) !== JSON.stringify(baseline[key])).length;
  useUnsavedChangesGuard(dirty);
  const liveErrors = useMemo(() => validate(games, values), [games, values]);
  const err = (...keys: string[]) => fieldError(errorFor(errors, ...keys));
  const configuredKeys = new Set(games.flatMap((entry) => entry.configured.map((server) => rowKey(entry.game, server.publicId))));
  const staleRows = storedRows(stored).filter((row) => !configuredKeys.has(rowKey(row.game, row.publicId))).length;

  const update = (key: string, patch: Partial<RowValues>) => setValues((previous) => ({ ...previous, [key]: { ...previous[key]!, ...patch } }));

  const fail = (failure: Extract<ActionResult<unknown>, { ok: false }>) => {
    setErrors(mapErrors(failure.fieldErrors ?? {}, submittedKeys.current));
    if (failure.code === 'conflict') setNotice({ kind: 'warning', title: t('conflictTitle'), text: t('conflictBody'), conflict: true });
    else setNotice({ kind: 'error', text: actionError(failure.code) });
  };

  const save = async () => {
    if (Object.keys(liveErrors).length > 0) {
      setErrors(liveErrors);
      setNotice({ kind: 'error', text: actionError('validation') });
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-server-presentation-form] [aria-invalid="true"]')?.focus());
      return;
    }
    if (!dirty) return;
    submittedKeys.current = payload.keys;
    setPending('save');
    let result: ActionResult<AdminSetting[]>;
    try {
      result = await saveSettingsAction({ changes: [{ key: KEY, expectedVersion: stored.version, value: payload.rows }] });
    } catch {
      // Network failure or aborted request: nothing is known to be saved; keep the entered values.
      result = { ok: false, code: 'unexpected' };
    }
    setPending(null);
    if (!result.ok) {
      fail(result);
      return;
    }
    const next = result.data.find((item) => item.key === KEY) ?? { key: KEY, value: null, version: 0, updatedAt: null, invalid: false };
    setStored(next);
    setValues(valuesFrom(games, next));
    setErrors({});
    setNotice({ kind: 'success', title: t('savedTitle'), text: t('savedBody') });
  };

  const reload = async () => {
    setPending('reload');
    let result: ActionResult<AdminSetting[]>;
    try {
      result = await loadSettingsAction();
    } catch {
      result = { ok: false, code: 'unexpected' };
    }
    setPending(null);
    if (!result.ok) return fail(result);
    const next = result.data.find((item) => item.key === KEY) ?? { key: KEY, value: null, version: 0, updatedAt: null, invalid: false };
    const fresh = valuesFrom(games, next);
    // Rows the administrator edited keep their values; untouched rows follow the newly saved state.
    setValues((current) => Object.fromEntries(Object.keys(fresh).map((key) => [key, JSON.stringify(current[key]) === JSON.stringify(baseline[key]) ? fresh[key]! : current[key]!])));
    setStored(next);
    setNotice({ kind: 'info', text: t('reloadedNotice') });
  };

  const overviewLine = (entry: AdminGameServers) => {
    const overview = entry.overview;
    if (overview.state === 'not_configured') return t('overview.not_configured');
    const time = formatDate(overview.attemptedAt, uiLocale, 'dateTimeZone');
    if (overview.state === 'unavailable') return t('overview.unavailable', { time });
    return overview.partial ? t('overview.partial', { time }) : t('overview.ok', { time });
  };

  return (
    <div className={base.stack} data-server-presentation-form="">
      {notice ? (
        <FeedbackNotice
          kind={notice.kind}
          title={notice.title}
          action={
            notice.conflict ? (
              <GameButton size="sm" intent="secondary" onClick={reload} pending={pending === 'reload'}>
                {t('reloadLatest')}
              </GameButton>
            ) : undefined
          }
        >
          {notice.text}
        </FeedbackNotice>
      ) : null}
      {stored.invalid ? (
        <FeedbackNotice kind="warning" live={false}>
          {t('storedInvalid')}
        </FeedbackNotice>
      ) : null}
      {staleRows > 0 ? (
        <FeedbackNotice kind="info" live={false}>
          {t('staleRows', { count: staleRows })}
        </FeedbackNotice>
      ) : null}
      {err(KEY) ? <p className={base.errorText}>{err(KEY)}</p> : null}

      {games.map((entry) => {
        const observations = entry.overview.state === 'not_configured' ? [] : entry.overview.servers;
        return (
          <fieldset key={entry.game} className={base.group} data-game-servers={entry.game} data-server-source={entry.source}>
            <legend>{tGames(entry.game)}</legend>
            <div className={base.groupBody}>
              <div className={styles.gameHead}>
                <span className={styles.observed}>{t('sourceLabel')}:</span>
                <StatusBadge kind={SOURCE_KIND[entry.source]}>{t(`source.${entry.source}`)}</StatusBadge>
                <span className={styles.observed} data-overview-state={entry.overview.state}>
                  {overviewLine(entry)}
                </span>
                {entry.overview.state === 'ok' && entry.overview.synthetic ? <StatusBadge kind="warning">{t('overview.synthetic')}</StatusBadge> : null}
              </div>
              {entry.configError ? (
                <FeedbackNotice kind="warning" live={false}>
                  {t(`configError.${entry.configError}`)}
                </FeedbackNotice>
              ) : null}
              {entry.configured.length === 0 ? (
                <EmptyState title={t('empty')} titleAs="h3" />
              ) : (
                <ul className={styles.serverList}>
                  {entry.configured.map((server) => {
                    const key = rowKey(entry.game, server.publicId);
                    const value = values[key]!;
                    const observation = observations.find((row) => row.publicId === server.publicId);
                    const field = (name: string) => `server-${entry.game}-${server.publicId}-${name}`;
                    return (
                      <li key={key} className={styles.serverRow} data-server-row={key} data-hidden={value.published ? undefined : ''}>
                        <div className={styles.serverHead}>
                          <span className={styles.serverName}>{server.name}</span>
                          <span className={styles.serverId}>
                            {t('publicId')}: {server.publicId}
                          </span>
                          <div className={styles.badges}>
                            <StatusBadge kind="neutral" icon={false}>
                              {t(`origin.${server.origin}`)}
                            </StatusBadge>
                            {server.origin === 'logi' ? (
                              <StatusBadge kind={server.published ? 'success' : 'warning'}>{server.published ? t('configuredPublished') : t('configuredUnpublished')}</StatusBadge>
                            ) : null}
                            <StatusBadge kind="neutral" icon={false}>
                              {server.hasAddress ? t('hasAddress') : t('noAddress')}
                            </StatusBadge>
                            {server.hasStatsUrl ? (
                              <StatusBadge kind="neutral" icon={false}>
                                {t('hasStats')}
                              </StatusBadge>
                            ) : null}
                            {observation ? (
                              <>
                                <StatusBadge kind={FRESHNESS_KIND[observation.freshness]}>{t(`freshness.${observation.freshness}`)}</StatusBadge>
                                <StatusBadge kind={observation.reachability === 'online' ? 'success' : observation.reachability === 'offline' ? 'danger' : 'neutral'}>{t(`reachability.${observation.reachability}`)}</StatusBadge>
                              </>
                            ) : (
                              <StatusBadge kind="neutral">{t('notInOverview')}</StatusBadge>
                            )}
                          </div>
                          {observation ? (
                            <span className={styles.observed}>{observation.observedAt ? t('observed', { time: formatDate(observation.observedAt, uiLocale, 'dateTimeZone') }) : t('neverObserved')}</span>
                          ) : null}
                        </div>
                        <div className={styles.serverFields}>
                          <TextField name={field('name')} label={t('fields.name')} markOptional hint={t('fields.nameHint')} value={value.name} maxLength={120} onChange={(event) => update(key, { name: event.target.value })} error={err(`${KEY}.${key}.name`)} />
                          <TextField name={field('order')} label={t('fields.sortOrder')} markOptional inputMode="numeric" hint={t('fields.sortOrderHint')} value={value.sortOrder} maxLength={4} onChange={(event) => update(key, { sortOrder: event.target.value })} error={err(`${KEY}.${key}.sortOrder`)} />
                          <Checkbox name={field('published')} label={t('fields.published')} checked={value.published} onChange={(event) => update(key, { published: event.target.checked })} error={err(`${KEY}.${key}.published`)} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </fieldset>
        );
      })}

      <p className={base.actionNote}>{t('hiddenNote')}</p>
      <p className={base.actionNote}>{stored.updatedAt ? t('lastSaved', { date: formatDate(stored.updatedAt, uiLocale, 'dateTimeZone') }) : t('neverSaved')}</p>
      <p className={base.actionNote} id="server-presentation-live-note">
        {t('saveGoesLive')}
      </p>
      <FormActions status={pending === 'save' ? tc('saving') : dirty ? t('dirtyStatus', { count: changedCount }) : tc('allSaved')}>
        {dirty ? (
          <GameButton intent="ghost" onClick={() => setValues(baseline)} disabled={pending !== null}>
            {tc('discard')}
          </GameButton>
        ) : null}
        <GameButton intent="primary" onClick={save} disabled={!dirty || pending !== null} pending={pending === 'save'} pendingLabel={tc('saving')} aria-describedby="server-presentation-live-note" data-action="save-server-presentation">
          {t('save')}
        </GameButton>
      </FormActions>
    </div>
  );
}
