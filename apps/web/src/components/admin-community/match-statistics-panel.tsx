'use client';

import type { StatisticsSide } from '@valkyria/db/schema';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, useState } from 'react';
import { Checkbox, RadioGroup, Select, TextField } from '@/components/ui/form-fields';
import { GameButton } from '@/components/ui/game-button';
import { FeedbackNotice } from '@/components/ui/panels';
import { formatDate, formatNumber } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import type { ActionResult } from '@/lib/result';
import { importMatchStatisticsAction, removeMatchStatisticsAction, updateMatchStatisticsSettingsAction } from '@/modules/matches/actions';
import type { MatchStatisticsView } from '@/modules/matches/types';
import type { FieldErrors } from './errors';
import { useActionError, useFieldError } from './use-messages';
import styles from './admin-community.module.css';

/** Upload limit after per-kill encounters are removed (server actions accept about 1 MB). */
const MAX_UPLOAD_CHARS = 900_000;
const TEAM_METRICS = ['players', 'kills', 'deaths', 'teamkills', 'combat', 'offense', 'defense', 'support'] as const;

type Props = {
  uiLocale: AppLocale;
  matchId: string;
  initial: MatchStatisticsView | null;
  sources: { publicId: string; name: string }[];
  /** Side of the first round, if set: the likely Valkyria side of the imported game. */
  suggestedSide: StatisticsSide | null;
  onChanged?: () => void;
};

/**
 * Imports CRCON game statistics for an HLL match: from a configured server by CRCON game
 * ID, or from an uploaded scoreboard JSON (per-kill encounters are removed in the browser
 * to fit the request limit; the server parses and validates everything again). Editors
 * choose Valkyria's side and whether player rows are public (off by default).
 */
export function MatchStatisticsPanel({ uiLocale, matchId, initial, sources, suggestedSide, onChanged }: Props) {
  const t = useTranslations('adminCommunity.statistics');
  const fieldError = useFieldError();
  const actionError = useActionError();
  const [current, setCurrent] = useState<MatchStatisticsView | null>(initial);
  const [source, setSource] = useState<'crcon' | 'upload'>(sources.length > 0 ? 'crcon' : 'upload');
  const [serverId, setServerId] = useState(sources[0]?.publicId ?? '');
  const [gameId, setGameId] = useState('');
  const [file, setFile] = useState<{ name: string; content: string } | null>(null);
  const [side, setSide] = useState<StatisticsSide>(initial?.valkyriaSide ?? suggestedSide ?? 'allies');
  const [publishPlayers, setPublishPlayers] = useState(initial?.publishPlayers ?? false);
  const [settings, setSettings] = useState({ side: initial?.valkyriaSide ?? 'allies', publishPlayers: initial?.publishPlayers ?? false });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const sideLabel = (value: StatisticsSide) => t(`sides.${value}`);

  const finish = <T,>(result: ActionResult<T>, success: string, apply: (data: T) => void) => {
    setPending(null);
    if (result.ok) {
      apply(result.data);
      setErrors({});
      setNotice({ kind: 'success', text: success });
      onChanged?.();
    } else {
      setErrors(result.fieldErrors ?? {});
      setNotice({ kind: 'error', text: actionError(result.code) });
    }
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    setErrors({});
    if (!selected) return setFile(null);
    try {
      const parsed = JSON.parse(await selected.text()) as Record<string, unknown>;
      const game = (parsed.result && typeof parsed.result === 'object' ? parsed.result : parsed) as Record<string, unknown>;
      if (Array.isArray(game.player_stats)) {
        game.player_stats = game.player_stats.map((row: unknown) => {
          if (!row || typeof row !== 'object') return row;
          const { encounters: _encounters, steaminfo: _steaminfo, most_killed: _mostKilled, death_by: _deathBy, units: _units, ...rest } = row as Record<string, unknown>;
          return rest;
        });
      }
      const content = JSON.stringify(parsed);
      if (content.length > MAX_UPLOAD_CHARS) {
        setFile(null);
        setErrors({ file: 'too_big' });
        return;
      }
      setFile({ name: selected.name.slice(0, 120), content });
    } catch {
      setFile(null);
      setErrors({ file: 'invalid_scoreboard' });
    }
  };

  const runImport = async () => {
    setNotice(null);
    if (source === 'crcon') {
      const id = Number(gameId.trim());
      if (!/^\d{1,10}$/.test(gameId.trim()) || !Number.isSafeInteger(id) || id <= 0) return setErrors({ gameId: 'invalid_number' });
      setPending('import');
      const result = await importMatchStatisticsAction({ source: 'crcon', matchId, serverPublicId: serverId, gameId: id, valkyriaSide: side, publishPlayers });
      finish(result, t('imported'), (data) => {
        setCurrent(data);
        setSettings({ side: data.valkyriaSide, publishPlayers: data.publishPlayers });
      });
      return;
    }
    if (!file) return setErrors({ file: 'required' });
    setPending('import');
    const result = await importMatchStatisticsAction({ source: 'upload', matchId, fileName: file.name, content: file.content, valkyriaSide: side, publishPlayers });
    finish(result, t('imported'), (data) => {
      setCurrent(data);
      setSettings({ side: data.valkyriaSide, publishPlayers: data.publishPlayers });
    });
  };

  const saveSettings = async () => {
    setNotice(null);
    setPending('settings');
    const result = await updateMatchStatisticsSettingsAction({ matchId, valkyriaSide: settings.side, publishPlayers: settings.publishPlayers });
    finish(result, t('settingsSaved'), setCurrent);
  };

  const remove = async () => {
    setNotice(null);
    setPending('remove');
    const result = await removeMatchStatisticsAction({ matchId });
    setConfirmRemove(false);
    finish(result, t('removed'), () => setCurrent(null));
  };

  const valkyria = current?.valkyriaSide ?? 'allies';
  const opponent: StatisticsSide = valkyria === 'allies' ? 'axis' : 'allies';
  const busy = pending !== null;

  return (
    <div data-statistics-panel="" data-statistics-state={current ? 'imported' : 'none'}>
      <p className={styles.groupIntro}>{t('intro')}</p>
      {notice ? <FeedbackNotice kind={notice.kind}>{notice.text}</FeedbackNotice> : null}
      {current ? (
        <section aria-labelledby="statistics-current-title" data-statistics-current="">
          <h3 id="statistics-current-title" className={styles.repeatHeading}>
            {t('currentTitle')}
          </h3>
          <dl className={styles.summaryList}>
            <div className={styles.summaryRow}>
              <dt>{t('source')}</dt>
              <dd>
                {current.source === 'crcon'
                  ? t('sourceCrcon', { server: current.sourceLabel, game: current.externalGameId ?? '—' })
                  : t('sourceUpload', { file: current.sourceLabel || '—' })}
              </dd>
            </div>
            <div className={styles.summaryRow}>
              <dt>{t('game')}</dt>
              <dd>{[current.mapName, current.mode].filter(Boolean).join(' · ') || '—'}</dd>
            </div>
            <div className={styles.summaryRow}>
              <dt>{t('gameTime')}</dt>
              <dd>{current.gameStartedAt ? formatDate(current.gameStartedAt, uiLocale, 'dateTimeZone') : '—'}</dd>
            </div>
            <div className={styles.summaryRow}>
              <dt>{t('importedAt')}</dt>
              <dd>{formatDate(current.observedAt, uiLocale, 'dateTimeZone')}</dd>
            </div>
            <div className={styles.summaryRow}>
              <dt>{t('players')}</dt>
              <dd data-statistics-player-count="">
                {formatNumber(current.playerCount, uiLocale)} · {current.publishPlayers ? t('playersPublic') : t('playersPrivate')}
              </dd>
            </div>
          </dl>
          <table className={styles.statTable} data-statistics-teams="">
            <caption className="visually-hidden">{t('teamsCaption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('metric')}</th>
                <th scope="col">{t('valkyriaColumn', { side: sideLabel(valkyria) })}</th>
                <th scope="col">{t('opponentColumn', { side: sideLabel(opponent) })}</th>
              </tr>
            </thead>
            <tbody>
              {TEAM_METRICS.map((metric) => (
                <tr key={metric}>
                  <th scope="row">{t(`metrics.${metric}`)}</th>
                  <td data-numeric="">{formatNumber(current.teams[valkyria][metric], uiLocale)}</td>
                  <td data-numeric="">{formatNumber(current.teams[opponent][metric], uiLocale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={styles.grid}>
            <Select
              name="statistics-settings-side"
              label={t('side')}
              value={settings.side}
              disabled={busy}
              onChange={(event) => setSettings({ ...settings, side: event.target.value as StatisticsSide })}
              options={(['allies', 'axis'] as const).map((value) => ({ value, label: sideLabel(value) }))}
            />
            <Checkbox
              name="statistics-settings-publish"
              label={t('publishPlayers')}
              hint={t('publishPlayersHint')}
              checked={settings.publishPlayers}
              disabled={busy}
              onChange={(event) => setSettings({ ...settings, publishPlayers: event.target.checked })}
            />
          </div>
          <div className={styles.inlineActions}>
            <GameButton
              size="sm"
              intent="secondary"
              onClick={saveSettings}
              disabled={busy || (settings.side === current.valkyriaSide && settings.publishPlayers === current.publishPlayers)}
              pending={pending === 'settings'}
              pendingLabel={t('working')}
              data-statistics-action="settings"
            >
              {t('saveSettings')}
            </GameButton>
            {confirmRemove ? (
              <>
                <span className={styles.actionNote}>{t('removeConfirm')}</span>
                <GameButton size="sm" intent="danger" onClick={remove} disabled={busy} pending={pending === 'remove'} pendingLabel={t('working')} data-statistics-action="remove-confirm">
                  {t('remove')}
                </GameButton>
                <GameButton size="sm" intent="ghost" onClick={() => setConfirmRemove(false)} disabled={busy}>
                  {t('cancel')}
                </GameButton>
              </>
            ) : (
              <GameButton size="sm" intent="ghost" onClick={() => setConfirmRemove(true)} disabled={busy} data-statistics-action="remove">
                {t('remove')}
              </GameButton>
            )}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="statistics-import-title" data-statistics-import="">
        <h3 id="statistics-import-title" className={styles.repeatHeading}>
          {current ? t('replaceTitle') : t('importTitle')}
        </h3>
        <RadioGroup
          name="statistics-source"
          label={t('sourceLabel')}
          value={source}
          disabled={busy}
          onChange={(event) => setSource(event.target.value as 'crcon' | 'upload')}
          options={[
            { value: 'crcon', label: t('sourceOptionCrcon'), hint: sources.length > 0 ? t('sourceOptionCrconHint') : t('noSources') },
            { value: 'upload', label: t('sourceOptionUpload'), hint: t('sourceOptionUploadHint') },
          ]}
        />
        {source === 'crcon' ? (
          <div className={styles.grid}>
            <Select
              name="statistics-server"
              label={t('server')}
              value={serverId}
              disabled={busy || sources.length === 0}
              onChange={(event) => setServerId(event.target.value)}
              options={sources.length > 0 ? sources.map((entry) => ({ value: entry.publicId, label: entry.name })) : [{ value: '', label: t('noSourcesShort') }]}
              error={fieldError(errors.serverPublicId)}
            />
            <TextField
              name="statistics-game-id"
              label={t('gameId')}
              hint={t('gameIdHint')}
              inputMode="numeric"
              value={gameId}
              disabled={busy || sources.length === 0}
              onChange={(event) => setGameId(event.target.value)}
              error={fieldError(errors.gameId)}
            />
          </div>
        ) : (
          <TextField name="statistics-file" type="file" accept="application/json,.json" label={t('file')} hint={t('fileHint')} disabled={busy} onChange={onFile} error={fieldError(errors.file)} />
        )}
        <div className={styles.grid}>
          <Select
            name="statistics-side"
            label={t('side')}
            hint={t('sideHint')}
            value={side}
            disabled={busy}
            onChange={(event) => setSide(event.target.value as StatisticsSide)}
            options={(['allies', 'axis'] as const).map((value) => ({ value, label: sideLabel(value) }))}
          />
          <Checkbox
            name="statistics-publish"
            label={t('publishPlayers')}
            hint={t('publishPlayersHint')}
            checked={publishPlayers}
            disabled={busy}
            onChange={(event) => setPublishPlayers(event.target.checked)}
          />
        </div>
        {errors.source ? <p className={styles.errorText}>{fieldError(errors.source)}</p> : null}
        <div className={styles.inlineActions}>
          <GameButton
            size="sm"
            intent="primary"
            onClick={runImport}
            disabled={busy || (source === 'crcon' && sources.length === 0)}
            pending={pending === 'import'}
            pendingLabel={t('working')}
            data-statistics-action="import"
          >
            {current ? t('replace') : t('import')}
          </GameButton>
          <span className={styles.actionNote}>{t('importNote')}</span>
        </div>
      </section>
    </div>
  );
}
