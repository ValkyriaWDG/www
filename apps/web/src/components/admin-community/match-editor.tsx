'use client';

import type { JSONContent } from '@tiptap/core';
import { COMPETITION_TYPES, GAMES, type Game, type MatchOutcome } from '@valkyria/db/schema';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { useUnsavedChangesGuard } from '@/components/shell/unsaved-changes';
import { FormActions, RadioGroup, Select, TextArea, TextField } from '@/components/ui/form-fields';
import { GameButton } from '@/components/ui/game-button';
import { ShieldIcon } from '@/components/ui/icons';
import { FeedbackNotice, PageHeader, StatusBadge } from '@/components/ui/panels';
import { Link, useRouter } from '@/i18n/navigation';
import type { ActionResult } from '@/lib/result';
import {
  cancelMatchAction,
  createMatchAction,
  deleteMatchAction,
  loadMatchAction,
  markMatchLiveAction,
  postponeMatchAction,
  publishMatchAction,
  publishMatchRecapAction,
  recordMatchResultAction,
  rescheduleMatchAction,
  saveMatchRecapAction,
  unpublishMatchAction,
  unpublishMatchRecapAction,
  updateMatchAction,
} from '@/modules/matches/actions';
import { canonicalMatchPath } from '@/modules/games/routes';
import { DEFAULT_MATCH_TIME_ZONE } from '@/modules/matches/time';
import type { AdminMatch } from '@/modules/matches/types';
import type { TournamentOption } from '@/modules/tournaments/types';
import { ConfirmDialog } from './confirm-dialog';
import { errorFor, type FieldErrors } from './errors';
import { formatDate, formatNumber } from './format';
import {
  allowedTransitions,
  buildCreateInput,
  buildResultInput,
  buildUpdatePatch,
  emptyFacts,
  emptySchedule,
  factsEqual,
  factsFrom,
  type FactsValues,
  MAX_VOD_ROWS,
  mergeFacts,
  mergeFlat,
  newVodKey,
  outcomeForScores,
  parseCount,
  resolveSchedule,
  RESULT_EARLY_WINDOW_MS,
  resultEqual,
  resultFrom,
  type ResultValues,
  roundsEqual,
  roundsFrom,
  roundsInput,
  type RoundValues,
  scheduleEqual,
  scheduleFrom,
  type ScheduleValues,
  TIME_ZONE_CHOICES,
  validateFacts,
  validateResult,
  validateRounds,
} from './match-form';
import { MediaField, type MediaRef } from './media-field';
import { ProseTabs, type ProseActions } from './prose-tabs';
import { MatchStatisticsPanel } from './match-statistics-panel';
import { RoundsEditor } from './rounds-editor';
import { MATCH_STATUS_KIND, PUBLICATION_KIND } from './status';
import { useActionError, useFieldError } from './use-messages';
import styles from './admin-community.module.css';

type UiLocale = 'cs' | 'en';

type MatchEditorProps = {
  uiLocale: UiLocale;
  /** `null` → create a new draft. */
  initial: AdminMatch | null;
  canPublish: boolean;
  /** Show the "draft created" confirmation after the redirect from /new. */
  created?: boolean;
  /** Configured CRCON servers offered for HLL statistics import (names only). */
  statisticsSources?: { publicId: string; name: string }[];
  /** Tournaments per game within the editor's scope (the select offers the match's game). */
  tournaments?: Partial<Record<Game, TournamentOption[]>>;
};

type Notice = { kind: 'success' | 'error' | 'warning' | 'info'; title?: string; text: string; conflict?: boolean } | null;
type Dialog = 'postpone' | 'cancel' | 'unpublish' | 'delete' | null;
type Group = 'facts' | 'schedule' | 'result';

/** Keeps a picked image's filename when the saved record only returns its asset ID. */
function keepMedia(next: MediaRef | null, previous: MediaRef | null): MediaRef | null {
  if (next && previous && next.assetId.toLowerCase() === previous.assetId.toLowerCase()) return previous;
  return next;
}

function focusFirstInvalid() {
  requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-match-editor] [aria-invalid="true"]')?.focus());
}

/**
 * Match create/edit form grouped as documented (identity, context, schedule, public
 * presentation incl. per-locale recaps, result with rounds, private administration).
 * Every mutation is a server action; the returned admin snapshot updates only the saved
 * group, so unsaved values elsewhere are never lost (also on conflicts).
 */
export function MatchEditor({ uiLocale, initial, canPublish, created, statisticsSources = [], tournaments = {} }: MatchEditorProps) {
  const t = useTranslations('adminCommunity.matches.editor');
  const tc = useTranslations('adminCommunity.common');
  const tGame = useTranslations('adminCommunity.common.game');
  const tCompetition = useTranslations('adminCommunity.common.competition');
  const tStatus = useTranslations('adminCommunity.common.matchStatus');
  const tPublication = useTranslations('adminCommunity.common.publication');
  const tOutcome = useTranslations('adminCommunity.common.outcome');
  const tVerification = useTranslations('adminCommunity.common.verification');
  const fieldError = useFieldError();
  const actionError = useActionError();
  const router = useRouter();

  const [server, setServer] = useState<AdminMatch | null>(initial);
  const [facts, setFacts] = useState<FactsValues>(() => (initial ? factsFrom(initial) : emptyFacts()));
  const [schedule, setSchedule] = useState<ScheduleValues>(() => (initial ? scheduleFrom(initial) : emptySchedule()));
  const [result, setResult] = useState<ResultValues>(() => resultFrom(initial));
  const [rounds, setRounds] = useState<RoundValues[]>(() => roundsFrom(initial));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<Notice>(() => (created ? { kind: 'success', text: t('createdNotice') } : null));
  const [pending, setPending] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [postponeTo, setPostponeTo] = useState({ date: '', time: '' });
  const [recapDirty, setRecapDirty] = useState({ cs: false, en: false });
  const [leaving, setLeaving] = useState(false);
  // Only drives an explanatory hint; the server enforces the one-hour result window.
  const [now] = useState(() => Date.now());

  const isCreate = server === null;
  const factsBase = useMemo(() => (server ? factsFrom(server) : emptyFacts()), [server]);
  const roundsBase = useMemo(() => roundsFrom(server), [server]);
  const scheduleBase = useMemo(() => (server ? scheduleFrom(server) : emptySchedule()), [server]);
  const resultBase = useMemo(() => resultFrom(server), [server]);

  const factsDirty = !factsEqual(facts, factsBase) || !roundsEqual(rounds, roundsBase);
  const scheduleDirty = !scheduleEqual(schedule, scheduleBase);
  const resultDirty = !isCreate && !resultEqual(result, resultBase);
  const anyDirty = factsDirty || scheduleDirty || resultDirty || recapDirty.cs || recapDirty.en;
  const formDirty = factsDirty || scheduleDirty || resultDirty;
  useUnsavedChangesGuard(anyDirty && !leaving);

  const onRecapDirty = useCallback((locale: UiLocale, dirty: boolean) => setRecapDirty((current) => (current[locale] === dirty ? current : { ...current, [locale]: dirty })), []);

  const resolved = resolveSchedule(schedule);
  const allowed = server ? allowedTransitions(server.status) : null;
  const startsInFuture = server ? new Date(server.startsAt).getTime() > now + RESULT_EARLY_WINDOW_MS : false;

  /** Applies a fresh server snapshot: saved groups and untouched groups follow the server; dirty groups keep their values. */
  const applySnapshot = (next: AdminMatch, saved: Group[]) => {
    setServer(next);
    const freshFacts = factsFrom(next);
    const fresh = { ...freshFacts, opponentLogo: keepMedia(freshFacts.opponentLogo, facts.opponentLogo), cover: keepMedia(freshFacts.cover, facts.cover) };
    // Saved groups follow the server; elsewhere untouched fields follow it and edited fields are kept.
    setFacts(saved.includes('facts') ? fresh : mergeFacts(facts, factsBase, fresh));
    const roundsSaved = saved.includes('facts') || saved.includes('result');
    setRounds(roundsSaved || roundsEqual(rounds, roundsBase) ? roundsFrom(next) : rounds);
    const freshSchedule = scheduleFrom(next);
    setSchedule(saved.includes('schedule') ? freshSchedule : mergeFlat(schedule, scheduleBase, freshSchedule));
    const freshResult = resultFrom(next);
    setResult(saved.includes('result') ? freshResult : mergeFlat(result, resultBase, freshResult));
    setErrors({});
  };

  const fail = (failure: Extract<ActionResult<unknown>, { ok: false }>) => {
    setErrors(failure.fieldErrors ?? {});
    if (failure.code === 'conflict') setNotice({ kind: 'warning', title: t('conflictTitle'), text: t('conflictBody'), conflict: true });
    else setNotice({ kind: 'error', text: actionError(failure.code) });
    if (failure.fieldErrors) focusFirstInvalid();
  };

  const runSnapshot = async (name: string, call: () => Promise<ActionResult<AdminMatch>>, saved: Group[], success: string) => {
    setPending(name);
    const outcome = await call();
    setPending(null);
    if (!outcome.ok) {
      fail(outcome);
      return false;
    }
    applySnapshot(outcome.data, saved);
    setNotice({ kind: 'success', text: success });
    return true;
  };

  // ---- Save (create draft / update facts + rounds) ----
  const save = async () => {
    const clientErrors: FieldErrors = { ...validateFacts(facts), ...(isCreate ? {} : validateRounds(rounds, facts.game)) };
    if (isCreate && !resolved.ok) clientErrors.startsAt = resolved.code;
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setNotice({ kind: 'error', text: actionError('validation') });
      focusFirstInvalid();
      return;
    }
    if (isCreate) {
      if (!resolved.ok) return;
      setPending('save');
      const outcome = await createMatchAction(buildCreateInput(facts, schedule, resolved.localDateTime));
      if (!outcome.ok) {
        setPending(null);
        fail(outcome);
        return;
      }
      setLeaving(true);
      router.push(`/admin/matches/${outcome.data.id}?created=1`);
      return;
    }
    const patch = { ...buildUpdatePatch(facts, factsBase), ...(roundsEqual(rounds, roundsBase) ? {} : { rounds: roundsInput(rounds) }) };
    await runSnapshot('save', () => updateMatchAction({ id: server.id, expectedVersion: server.version, ...patch }), ['facts'], t('savedNotice'));
  };

  const recordResult = async () => {
    if (!server) return;
    const clientErrors = { ...validateResult(result), ...validateRounds(rounds, server.game) };
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setNotice({ kind: 'error', text: actionError('validation') });
      focusFirstInvalid();
      return;
    }
    await runSnapshot(
      'result',
      () => recordMatchResultAction({ id: server.id, expectedVersion: server.version, ...buildResultInput(result), rounds: roundsInput(rounds) }),
      ['result'],
      t('resultSavedNotice'),
    );
  };

  const reschedule = async () => {
    if (!server) return;
    if (!resolved.ok) {
      setErrors({ startsAt: resolved.code });
      focusFirstInvalid();
      return;
    }
    await runSnapshot(
      'reschedule',
      () => rescheduleMatchAction({ id: server.id, expectedVersion: server.version, startsAt: { localDateTime: resolved.localDateTime, timeZone: schedule.timeZone }, timeZone: schedule.timeZone }),
      ['schedule'],
      t('rescheduledNotice'),
    );
  };

  const postpone = async () => {
    if (!server) return;
    let newStartsAt: { localDateTime: string; timeZone: string } | null = null;
    if (postponeTo.date || postponeTo.time) {
      const next = resolveSchedule({ date: postponeTo.date, time: postponeTo.time, timeZone: scheduleBase.timeZone });
      if (!next.ok) {
        setErrors({ newStartsAt: next.code });
        return;
      }
      newStartsAt = { localDateTime: next.localDateTime, timeZone: scheduleBase.timeZone };
    }
    const done = await runSnapshot('postpone', () => postponeMatchAction({ id: server.id, expectedVersion: server.version, newStartsAt }), ['schedule'], t('postponedNotice'));
    if (done) {
      setDialog(null);
      setPostponeTo({ date: '', time: '' });
    }
  };

  const simple = async (name: string, call: typeof publishMatchAction, success: string) => {
    if (!server) return;
    const done = await runSnapshot(name, () => call({ id: server.id, expectedVersion: server.version }), [], success);
    if (done) setDialog(null);
  };

  const remove = async () => {
    if (!server) return;
    setPending('delete');
    const outcome = await deleteMatchAction({ id: server.id, expectedVersion: server.version });
    if (!outcome.ok) {
      setPending(null);
      setDialog(null);
      fail(outcome);
      return;
    }
    setLeaving(true);
    router.push('/admin/matches?deleted=1');
  };

  const reloadLatest = async () => {
    if (!server) return;
    setPending('reload');
    const outcome = await loadMatchAction({ id: server.id });
    setPending(null);
    if (!outcome.ok) {
      fail(outcome);
      return;
    }
    // Keep every unsaved value; only the base version (and untouched groups) move forward.
    applySnapshot(outcome.data, []);
    setNotice({ kind: 'info', text: t('reloadedNotice') });
  };

  const discardAll = () => {
    setFacts(factsBase);
    setRounds(roundsBase);
    setSchedule(scheduleBase);
    setResult(resultBase);
    setErrors({});
    setNotice(null);
  };

  const recapActions = useMemo<ProseActions | null>(
    () =>
      server
        ? {
            save: (locale, expectedVersion, body: JSONContent, cover) => saveMatchRecapAction({ matchId: server.id, locale, expectedVersion, body, cover }),
            publish: (locale, expectedVersion) => publishMatchRecapAction({ matchId: server.id, locale, expectedVersion }),
            unpublish: (locale, expectedVersion) => unpublishMatchRecapAction({ matchId: server.id, locale, expectedVersion }),
          }
        : null,
    // Actions only depend on the match identity, not on its version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [server?.id],
  );

  const setFact = <K extends keyof FactsValues>(key: K, value: FactsValues[K]) => setFacts((current) => ({ ...current, [key]: value }));
  const err = (...keys: string[]) => fieldError(errorFor(errors, ...keys));
  const busy = pending !== null;
  const blockedByDirty = formDirty || recapDirty.cs || recapDirty.en;
  const zoneOptions = [...new Set([...TIME_ZONE_CHOICES, schedule.timeZone, scheduleBase.timeZone])].map((zone) => ({
    value: zone,
    label: zone === DEFAULT_MATCH_TIME_ZONE ? t('zoneDefault', { zone }) : zone,
  }));
  const knownScores = parseCount(result.scoreValkyria) !== null && parseCount(result.scoreOpponent) !== null && !Number.isNaN(parseCount(result.scoreValkyria)) && !Number.isNaN(parseCount(result.scoreOpponent));
  const derivedOutcome: MatchOutcome | null = knownScores ? outcomeForScores(parseCount(result.scoreValkyria)!, parseCount(result.scoreOpponent)!) : null;

  const statusText = pending === 'save' ? tc('saving') : anyDirty ? tc('unsaved') : isCreate ? t('createStatus') : tc('allSaved');
  const title = isCreate ? t('createTitle') : server.opponentName;
  // Canonical public URL in the match's own game section.
  const publicHref = server && server.publication === 'published' ? canonicalMatchPath(server.game, server.slug) : null;

  const resultSummary = (() => {
    if (!server?.result) return t('noResult');
    const r = server.result;
    const score = r.scoreValkyria !== null && r.scoreOpponent !== null ? `${formatNumber(r.scoreValkyria, uiLocale)} : ${formatNumber(r.scoreOpponent, uiLocale)}` : '—';
    return `${score} · ${tOutcome(r.outcome)} · ${tVerification(r.verification)}`;
  })();

  return (
    <div className={styles.page} data-match-editor="" data-mode={isCreate ? 'create' : 'edit'}>
      <PageHeader
        eyebrow={t('eyebrow')}
        title={title}
        back={{ href: '/admin/matches', label: t('backToList') }}
        description={isCreate ? t('createIntro') : undefined}
        actions={
          publicHref ? (
            <GameButton href={publicHref} intent="secondary" size="sm" data-public-link="">
              {t('viewPublic')}
            </GameButton>
          ) : null
        }
      />
      {notice ? (
        <FeedbackNotice
          kind={notice.kind}
          title={notice.title}
          action={
            notice.conflict ? (
              <div className={styles.inlineActionsTight}>
                <GameButton size="sm" intent="secondary" onClick={reloadLatest} pending={pending === 'reload'}>
                  {t('reloadLatest')}
                </GameButton>
                <GameButton size="sm" intent="ghost" onClick={discardAll} disabled={busy}>
                  {t('discardMine')}
                </GameButton>
              </div>
            ) : undefined
          }
        >
          {notice.text}
        </FeedbackNotice>
      ) : null}

      <div className={styles.editor}>
        <div className={styles.editorMain}>
          {/* ---- Identity ---- */}
          <fieldset className={styles.group} data-group="identity">
            <legend>{t('groups.identity')}</legend>
            <div className={styles.groupBody}>
              <div className={styles.grid}>
                <Select
                  name="game"
                  label={t('fields.game')}
                  required
                  value={facts.game}
                  onChange={(event) => {
                    const game = event.target.value as FactsValues['game'];
                    // A tournament belongs to one game; switching the game unlinks another game's tournament.
                    setFacts((current) => ({
                      ...current,
                      game,
                      tournamentId: (tournaments[game] ?? []).some((option) => option.id === current.tournamentId) ? current.tournamentId : '',
                    }));
                  }}
                  options={GAMES.map((game) => ({ value: game, label: tGame(game) }))}
                  error={err('game')}
                />
                <TextField name="opponentName" label={t('fields.opponentName')} required value={facts.opponentName} maxLength={120} autoComplete="off" onChange={(event) => setFact('opponentName', event.target.value)} error={err('opponentName')} />
                <TextField
                  name="opponentShortCode"
                  label={t('fields.opponentShortCode')}
                  markOptional
                  hint={t('hints.opponentShortCode')}
                  value={facts.opponentShortCode}
                  maxLength={12}
                  autoComplete="off"
                  onChange={(event) => setFact('opponentShortCode', event.target.value)}
                  error={err('opponentShortCode')}
                />
              </div>
              <MediaField
                label={t('fields.opponentLogo')}
                hint={t('hints.opponentLogo')}
                scope="match"
                locale={uiLocale}
                value={facts.opponentLogo}
                onChange={(value) => setFact('opponentLogo', value)}
                error={err('opponentLogoAssetId')}
                testId="opponent-logo"
              />
            </div>
          </fieldset>

          {/* ---- Context ---- */}
          <fieldset className={styles.group} data-group="context">
            <legend>{t('groups.context')}</legend>
            <div className={styles.groupBody}>
              <div className={styles.grid}>
                <Select
                  name="competitionType"
                  label={t('fields.competitionType')}
                  required
                  value={facts.competitionType}
                  onChange={(event) => setFact('competitionType', event.target.value as FactsValues['competitionType'])}
                  options={COMPETITION_TYPES.map((type) => ({ value: type, label: tCompetition(type) }))}
                  error={err('competitionType')}
                />
                <TextField name="competitionName" label={t('fields.competitionName')} markOptional value={facts.competitionName} maxLength={120} onChange={(event) => setFact('competitionName', event.target.value)} error={err('competitionName')} />
                <Select
                  name="tournamentId"
                  label={t('fields.tournament')}
                  hint={t('hints.tournament')}
                  value={facts.tournamentId}
                  onChange={(event) => setFact('tournamentId', event.target.value)}
                  options={[
                    { value: '', label: t('noTournament') },
                    ...(tournaments[facts.game] ?? []).map((option) => ({
                      value: option.id,
                      label: [option.name, option.season, option.publication === 'draft' ? t('tournamentDraft') : null].filter(Boolean).join(' · '),
                    })),
                  ]}
                  error={err('tournamentId')}
                />
                <TextField name="season" label={t('fields.season')} markOptional value={facts.season} maxLength={60} onChange={(event) => setFact('season', event.target.value)} error={err('season')} />
                <TextField name="format" label={t('fields.format')} markOptional hint={t('hints.format')} value={facts.format} maxLength={60} onChange={(event) => setFact('format', event.target.value)} error={err('format')} />
                <TextField name="bestOf" label={t('fields.bestOf')} markOptional inputMode="numeric" value={facts.bestOf} onChange={(event) => setFact('bestOf', event.target.value)} error={err('bestOf')} />
                <TextField name="teamSize" label={t('fields.teamSize')} markOptional inputMode="numeric" hint={t('hints.teamSize')} value={facts.teamSize} onChange={(event) => setFact('teamSize', event.target.value)} error={err('teamSize')} />
              </div>
            </div>
          </fieldset>

          {/* ---- Schedule ---- */}
          <fieldset className={styles.group} data-group="schedule">
            <legend>{t('groups.schedule')}</legend>
            <div className={styles.groupBody}>
              <p className={styles.groupIntro}>{t('scheduleIntro')}</p>
              {server ? (
                <dl className={`${styles.facts} ${styles.spaced}`}>
                  <div>
                    <dt>{t('currentStart')}</dt>
                    <dd data-current-start="">{formatDate(server.startsAt, uiLocale, 'dateTimeZone', server.timeZone)}</dd>
                  </div>
                  {server.originalStartsAt ? (
                    <div>
                      <dt>{t('originalStart')}</dt>
                      <dd data-original-start="">{formatDate(server.originalStartsAt, uiLocale, 'dateTimeZone', server.timeZone)}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
              <div className={styles.grid}>
                <TextField
                  name="startDate"
                  type="date"
                  label={t('fields.startDate')}
                  required
                  value={schedule.date}
                  disabled={!!server && !allowed?.reschedule}
                  onChange={(event) => setSchedule({ ...schedule, date: event.target.value })}
                  error={err('startsAt', 'startsAt.localDateTime')}
                />
                <TextField
                  name="startTime"
                  type="time"
                  label={t('fields.startTime')}
                  required
                  value={schedule.time}
                  disabled={!!server && !allowed?.reschedule}
                  onChange={(event) => setSchedule({ ...schedule, time: event.target.value })}
                />
                <Select
                  name="timeZone"
                  label={t('fields.timeZone')}
                  required
                  hint={t('hints.timeZone')}
                  value={schedule.timeZone}
                  disabled={!!server && !allowed?.reschedule}
                  onChange={(event) => setSchedule({ ...schedule, timeZone: event.target.value })}
                  options={zoneOptions}
                  error={err('timeZone', 'startsAt.timeZone')}
                />
              </div>
              <div className={styles.resolved} aria-live="polite" data-resolved-start="">
                <span className={styles.resolvedLabel}>{t('resolvedLabel')}</span>
                {resolved.ok ? (
                  <>
                    <span>{formatDate(resolved.instant, uiLocale, 'dateTimeZone', schedule.timeZone)}</span>
                    <span className={styles.cellMuted}>
                      {schedule.timeZone !== DEFAULT_MATCH_TIME_ZONE ? `${formatDate(resolved.instant, uiLocale, 'dateTimeZone', DEFAULT_MATCH_TIME_ZONE)} · ` : ''}
                      {formatDate(resolved.instant, uiLocale, 'dateTimeZone', 'UTC')}
                    </span>
                  </>
                ) : (
                  <span className={styles.cellMuted}>{resolved.code === 'required' ? t('resolvedMissing') : fieldError(resolved.code)}</span>
                )}
              </div>
              <p className={styles.actionNote}>{t('startNotPublication')}</p>
              {server ? (
                <div className={`${styles.inlineActions} ${styles.spacedTop}`}>
                  <GameButton intent="secondary" size="sm" onClick={reschedule} disabled={!allowed?.reschedule || !scheduleDirty || busy} pending={pending === 'reschedule'} pendingLabel={tc('working')} data-action="reschedule">
                    {t('actions.reschedule')}
                  </GameButton>
                  <span className={styles.actionNote}>{allowed?.reschedule ? (scheduleDirty ? t('rescheduleReady') : t('rescheduleHint')) : t('rescheduleUnavailable')}</span>
                </div>
              ) : null}
            </div>
          </fieldset>

          {/* ---- Public presentation ---- */}
          <fieldset className={styles.group} data-group="presentation">
            <legend>{t('groups.presentation')}</legend>
            <div className={styles.groupBody}>
              <div className={styles.grid}>
                {isCreate ? (
                  <TextField name="slug" label={t('fields.slug')} markOptional hint={t('hints.slug')} value={facts.slug} maxLength={120} autoComplete="off" onChange={(event) => setFact('slug', event.target.value)} error={err('slug')} />
                ) : (
                  <div className={styles.fieldBlock}>
                    <p className={styles.mediaLabel}>{t('fields.publicAddress')}</p>
                    <p className={`${styles.mediaMeta} ${styles.code}`} data-public-path="">
                      /{uiLocale}{canonicalMatchPath(server.game, server.slug)}
                    </p>
                  </div>
                )}
                <TextField name="eventUrl" type="url" label={t('fields.eventUrl')} markOptional hint={t('hints.httpsOnly')} value={facts.eventUrl} maxLength={2048} onChange={(event) => setFact('eventUrl', event.target.value)} error={err('eventUrl')} />
                {facts.game === 'wardogs' || facts.leagueMatchUrl !== '' ? (
                  <TextField name="leagueMatchUrl" type="url" label={t('fields.leagueMatchUrl')} markOptional hint={t('hints.leagueMatchUrl')} value={facts.leagueMatchUrl} maxLength={125} autoComplete="off" onChange={(event) => setFact('leagueMatchUrl', event.target.value)} error={err('leagueMatchUrl')} />
                ) : null}
              </div>
              <h2 className={styles.repeatHeading}>{t('vodTitle')}</h2>
              <p className={styles.groupIntro}>{t('vodIntro', { max: MAX_VOD_ROWS })}</p>
              <ul className={styles.repeatList} hidden={facts.vodLinks.length === 0}>
                {facts.vodLinks.map((link, index) => (
                  <li key={link.key} className={styles.repeatItem}>
                    <fieldset>
                      <legend className={styles.repeatHeading}>{t('vodItem', { number: index + 1 })}</legend>
                      <div className={styles.grid}>
                        <TextField
                          name={`vod-${link.key}-label`}
                          label={t('fields.vodLabel')}
                          required
                          value={link.label}
                          maxLength={80}
                          onChange={(event) => setFact('vodLinks', facts.vodLinks.map((item) => (item.key === link.key ? { ...item, label: event.target.value } : item)))}
                          error={err(`vodLinks.${index}.label`)}
                        />
                        <TextField
                          name={`vod-${link.key}-url`}
                          type="url"
                          label={t('fields.vodUrl')}
                          required
                          hint={t('hints.httpsOnly')}
                          value={link.url}
                          maxLength={2048}
                          onChange={(event) => setFact('vodLinks', facts.vodLinks.map((item) => (item.key === link.key ? { ...item, url: event.target.value } : item)))}
                          error={err(`vodLinks.${index}.url`)}
                        />
                      </div>
                      <div className={styles.repeatButtons}>
                        <GameButton size="sm" intent="danger" onClick={() => setFact('vodLinks', facts.vodLinks.filter((item) => item.key !== link.key))} aria-label={t('vodRemove', { number: index + 1 })}>
                          {t('removeShort')}
                        </GameButton>
                      </div>
                    </fieldset>
                  </li>
                ))}
              </ul>
              <div className={styles.inlineActions}>
                <GameButton size="sm" intent="secondary" disabled={facts.vodLinks.length >= MAX_VOD_ROWS} onClick={() => setFact('vodLinks', [...facts.vodLinks, { key: newVodKey(), label: '', url: '' }])}>
                  + {t('vodAdd')}
                </GameButton>
                {err('vodLinks') ? <span className={styles.errorText}>{err('vodLinks')}</span> : null}
              </div>
              <MediaField label={t('fields.cover')} hint={t('hints.cover')} scope="match" locale={uiLocale} value={facts.cover} onChange={(value) => setFact('cover', value)} error={err('coverAssetId')} testId="match-cover" />
              <h3 className={styles.repeatHeading}>{t('recapTitle')}</h3>
              {server && recapActions ? (
                <ProseTabs
                  kind="recap"
                  uiLocale={uiLocale}
                  details={server.recapDetail}
                  canPublish={canPublish}
                  coverAssetId={server.coverAssetId}
                  mediaScope="match"
                  actions={recapActions}
                  onDirtyChange={onRecapDirty}
                  ownerNotPublicNote={server.publication === 'published' ? null : t('recapPrivateUntilPublished')}
                />
              ) : (
                <p className={styles.groupIntro}>{t('recapAfterCreate')}</p>
              )}
            </div>
          </fieldset>

          {/* ---- Result (with game details / rounds) ---- */}
          {server ? (
            <fieldset className={styles.group} data-group="result">
              <legend>{t('groups.result')}</legend>
              <div className={styles.groupBody}>
                <dl className={`${styles.facts} ${styles.spaced}`}>
                  <div>
                    <dt>{t('recordedResult')}</dt>
                    <dd data-recorded-result="">{resultSummary}</dd>
                  </div>
                </dl>
                <p className={styles.groupIntro}>{t('resultIntro')}</p>
                <div className={styles.grid}>
                  <div className={styles.scorePair}>
                    <TextField name="scoreValkyria" label={t('fields.scoreValkyria')} markOptional inputMode="numeric" value={result.scoreValkyria} disabled={!allowed?.result} onChange={(event) => setResult({ ...result, scoreValkyria: event.target.value })} error={err('scoreValkyria')} />
                    <TextField name="scoreOpponent" label={t('fields.scoreOpponent')} markOptional inputMode="numeric" value={result.scoreOpponent} disabled={!allowed?.result} onChange={(event) => setResult({ ...result, scoreOpponent: event.target.value })} error={err('scoreOpponent')} />
                  </div>
                  <Select
                    name="outcome"
                    label={t('fields.outcome')}
                    hint={derivedOutcome ? t('hints.outcomeDerived', { outcome: tOutcome(derivedOutcome) }) : t('hints.outcomeUnknown')}
                    value={result.outcome}
                    disabled={!allowed?.result}
                    onChange={(event) => setResult({ ...result, outcome: event.target.value as ResultValues['outcome'] })}
                    options={[{ value: '', label: t('outcomeAuto') }, ...(['win', 'loss', 'draw', 'unknown'] as const).map((value) => ({ value, label: tOutcome(value) }))]}
                    error={err('outcome')}
                  />
                </div>
                <RadioGroup
                  name="verification"
                  label={t('fields.verification')}
                  value={result.verification}
                  disabled={!allowed?.result}
                  onChange={(event) => setResult({ ...result, verification: event.target.value as ResultValues['verification'] })}
                  options={[
                    { value: 'provisional', label: tVerification('provisional'), hint: t('hints.provisional') },
                    { value: 'verified', label: tVerification('verified'), hint: t('hints.verified') },
                  ]}
                  error={err('verification')}
                />
                <TextField name="source" label={t('fields.source')} markOptional hint={t('hints.source')} value={result.source} maxLength={300} disabled={!allowed?.result} onChange={(event) => setResult({ ...result, source: event.target.value })} error={err('source')} />
                <h3 className={styles.repeatHeading}>{t('roundsTitle')}</h3>
                <RoundsEditor rounds={rounds} onChange={setRounds} errors={errors} game={facts.game} />
                {errors.startsAt && !scheduleDirty ? <p className={styles.errorText}>{fieldError(errors.startsAt)}</p> : null}
                {errors.status ? <p className={styles.errorText}>{fieldError(errors.status)}</p> : null}
                <div className={styles.inlineActions}>
                  <GameButton intent="primary" size="sm" onClick={recordResult} disabled={!allowed?.result || busy} pending={pending === 'result'} pendingLabel={tc('working')} data-action="record-result">
                    {server.result ? t('actions.updateResult') : t('actions.recordResult')}
                  </GameButton>
                  <span className={styles.actionNote}>{!allowed?.result ? t('resultCancelled') : startsInFuture ? t('resultTooEarly') : t('resultHint')}</span>
                </div>
              </div>
            </fieldset>
          ) : null}

          {/* ---- HLL game statistics (CRCON) ---- */}
          {server && server.game === 'hell-let-loose' ? (
            <fieldset className={styles.group} data-group="statistics">
              <legend>{t('groups.statistics')}</legend>
              <div className={styles.groupBody}>
                <MatchStatisticsPanel
                  uiLocale={uiLocale}
                  matchId={server.id}
                  initial={server.statistics}
                  sources={statisticsSources}
                  suggestedSide={rounds[0]?.side === 'allies' || rounds[0]?.side === 'axis' ? rounds[0].side : null}
                />
              </div>
            </fieldset>
          ) : null}

          {/* ---- Private administration ---- */}
          <fieldset className={`${styles.group} ${styles.private}`} data-group="private">
            <legend>
              {t('groups.private')}
              <span className={styles.privateTag}>
                <ShieldIcon size={16} /> {t('privateTag')}
              </span>
            </legend>
            <div className={styles.groupBody}>
              <TextArea name="internalNotes" label={t('fields.internalNotes')} markOptional hint={t('hints.internalNotes')} value={facts.internalNotes} maxLength={5000} rows={4} onChange={(event) => setFact('internalNotes', event.target.value)} error={err('internalNotes')} />
            </div>
          </fieldset>

          <FormActions status={statusText}>
            {formDirty ? (
              <GameButton intent="ghost" onClick={discardAll} disabled={busy}>
                {tc('discard')}
              </GameButton>
            ) : null}
            <GameButton intent="primary" onClick={save} disabled={busy || (!isCreate && !factsDirty)} pending={pending === 'save'} pendingLabel={tc('saving')} data-action="save">
              {isCreate ? t('actions.createDraft') : t('actions.save')}
            </GameButton>
          </FormActions>
        </div>

        {/* ---- Status / publication aside ---- */}
        <aside className={styles.editorAside} aria-label={t('statusPanel')}>
          <section className={styles.panel} data-status-panel="">
            <h2 className={styles.panelTitle}>{t('statusPanel')}</h2>
            {server ? (
              <>
                <div className={styles.badges}>
                  <StatusBadge kind={MATCH_STATUS_KIND[server.status]}>
                    <span data-match-status={server.status}>{tStatus(server.status)}</span>
                  </StatusBadge>
                  <StatusBadge kind={PUBLICATION_KIND[server.publication]}>
                    <span data-match-publication={server.publication}>{tPublication(server.publication)}</span>
                  </StatusBadge>
                </div>
                <p className={styles.actionNote}>{t('statusExplainer')}</p>
                <dl className={styles.facts}>
                  <div>
                    <dt>{t('currentStart')}</dt>
                    <dd>{formatDate(server.startsAt, uiLocale, 'dateTimeZone', server.timeZone)}</dd>
                  </div>
                  {server.originalStartsAt ? (
                    <div>
                      <dt>{t('originalStart')}</dt>
                      <dd>{formatDate(server.originalStartsAt, uiLocale, 'dateTimeZone', server.timeZone)}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>{t('recordedResult')}</dt>
                    <dd>{resultSummary}</dd>
                  </div>
                  <div>
                    <dt>{t('publicPage')}</dt>
                    <dd>
                      {publicHref ? (
                        <Link href={publicHref} className={styles.textLink} data-public-link="">
                          /{uiLocale}
                          {publicHref}
                        </Link>
                      ) : (
                        t('notPublic')
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('updatedAt')}</dt>
                    <dd>{formatDate(server.updatedAt, uiLocale, 'dateTimeZone')}</dd>
                  </div>
                </dl>
                <div className={styles.actionStack}>
                  {canPublish ? (
                    server.publication === 'draft' ? (
                      <GameButton intent="primary" fullWidth onClick={() => simple('publish', publishMatchAction, t('publishedNotice'))} disabled={busy || blockedByDirty} pending={pending === 'publish'} pendingLabel={tc('working')} data-action="publish">
                        {t('actions.publish')}
                      </GameButton>
                    ) : (
                      <GameButton intent="secondary" fullWidth onClick={() => setDialog('unpublish')} disabled={busy || blockedByDirty} data-action="unpublish">
                        {t('actions.unpublish')}
                      </GameButton>
                    )
                  ) : null}
                  {allowed?.live ? (
                    <GameButton intent="secondary" fullWidth onClick={() => simple('live', markMatchLiveAction, t('liveNotice'))} disabled={busy || blockedByDirty} pending={pending === 'live'} pendingLabel={tc('working')} data-action="live">
                      {t('actions.markLive')}
                    </GameButton>
                  ) : null}
                  {allowed?.postpone ? (
                    <GameButton intent="secondary" fullWidth onClick={() => setDialog('postpone')} disabled={busy || blockedByDirty} data-action="postpone">
                      {t('actions.postpone')}
                    </GameButton>
                  ) : null}
                  {allowed?.cancel ? (
                    <GameButton intent="danger" fullWidth onClick={() => setDialog('cancel')} disabled={busy || blockedByDirty} data-action="cancel">
                      {t('actions.cancel')}
                    </GameButton>
                  ) : null}
                  {server.publication === 'draft' ? (
                    <GameButton intent="danger" fullWidth onClick={() => setDialog('delete')} disabled={busy || blockedByDirty} data-action="delete">
                      {t('actions.delete')}
                    </GameButton>
                  ) : null}
                </div>
                {blockedByDirty ? <p className={styles.actionNote}>{tc('dirtyBlocked')}</p> : null}
                {!canPublish ? <p className={styles.actionNote}>{t('noPublishPermission')}</p> : null}
              </>
            ) : (
              <p className={styles.actionNote}>{t('createAside')}</p>
            )}
          </section>
        </aside>
      </div>

      {server ? (
        <>
          <ConfirmDialog
            open={dialog === 'postpone'}
            title={t('dialogs.postponeTitle')}
            description={t('dialogs.postponeBody', { date: formatDate(server.originalStartsAt ?? server.startsAt, uiLocale, 'dateTimeZone', server.timeZone) })}
            confirmLabel={t('actions.postpone')}
            pending={pending === 'postpone'}
            onConfirm={postpone}
            onClose={() => setDialog(null)}
            testId="confirm-postpone"
          >
            <div className={styles.grid}>
              <TextField name="postponeDate" type="date" label={t('fields.newDate')} markOptional value={postponeTo.date} onChange={(event) => setPostponeTo({ ...postponeTo, date: event.target.value })} error={err('newStartsAt')} />
              <TextField name="postponeTime" type="time" label={t('fields.newTime')} markOptional value={postponeTo.time} onChange={(event) => setPostponeTo({ ...postponeTo, time: event.target.value })} />
            </div>
            <p className={styles.actionNote}>{t('dialogs.postponeZone', { zone: scheduleBase.timeZone })}</p>
          </ConfirmDialog>
          <ConfirmDialog
            open={dialog === 'cancel'}
            title={t('dialogs.cancelTitle')}
            description={t('dialogs.cancelBody')}
            confirmLabel={t('actions.cancel')}
            intent="danger"
            pending={pending === 'cancel'}
            onConfirm={() => simple('cancel', cancelMatchAction, t('cancelledNotice'))}
            onClose={() => setDialog(null)}
            testId="confirm-cancel"
          />
          <ConfirmDialog
            open={dialog === 'unpublish'}
            title={t('dialogs.unpublishTitle')}
            description={t('dialogs.unpublishBody')}
            confirmLabel={t('actions.unpublish')}
            pending={pending === 'unpublish'}
            onConfirm={() => simple('unpublish', unpublishMatchAction, t('unpublishedNotice'))}
            onClose={() => setDialog(null)}
            testId="confirm-unpublish"
          />
          <ConfirmDialog
            open={dialog === 'delete'}
            title={t('dialogs.deleteTitle')}
            description={t('dialogs.deleteBody', { opponent: server.opponentName })}
            confirmLabel={t('actions.delete')}
            intent="danger"
            pending={pending === 'delete'}
            onConfirm={remove}
            onClose={() => setDialog(null)}
            testId="confirm-delete"
          />
        </>
      ) : null}
    </div>
  );
}
