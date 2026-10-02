'use client';
import { useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';
import { FeedbackNotice, FormActions, GameButton, PageHeader, Select, TextArea, TextField } from '@/components/ui';
import { loadLogiMatchAction, submitLogiMatchAction } from '@/modules/integrations/logi-command-actions';
import { logiEditableEventSchema, type LogiCommandInput, type LogiEventEditor } from '@/modules/integrations/logi-command-contract';
import type { GameRoute } from '@/modules/games/registry';
import { zonedLocalDateTime, zonedLocalToInstant } from '@/modules/matches/time';
import styles from './admin-community.module.css';

const TIMES = ['registrationEnd', 'meetingStart', 'gameStart', 'gameEnd'] as const;
const empty = () => ({ name: '', map: '', description: '', registrationEnd: '', meetingStart: '', gameStart: '', gameEnd: '' });
type Notice = 'saved' | 'pending' | 'conflict' | 'invalid' | 'failed' | 'cancelled' | 'locked' | null;
const subscribeHydration = () => () => {};

export function LogiMatchEditor({ games, events, pendingRequests }: { games: GameRoute[]; events: { id: string; game: GameRoute; title: string }[]; pendingRequests: LogiCommandInput[] }) {
  const t = useTranslations('logi');
  // Do not accept edits before React can handle them; SSR controls otherwise lose
  // a fast selection when hydration installs the controlled initial value.
  const ready = useSyncExternalStore(subscribeHydration, () => true, () => false);
  const [game, setGame] = useState<GameRoute>(games[0] ?? 'wardogs');
  const [values, setValues] = useState(empty);
  const [selected, setSelected] = useState('');
  const [editing, setEditing] = useState<LogiEventEditor | null>(null);
  const [occurrence, setOccurrence] = useState<'earlier' | 'later'>('earlier');
  const [request, setRequest] = useState<LogiCommandInput | null>(pendingRequests[0] ?? null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(pendingRequests.length ? 'pending' : null);
  const [loadFailed, setLoadFailed] = useState(false);
  const blocked = !ready || busy || Boolean(request);

  async function load() {
    if (!selected || blocked) return;
    setBusy(true); setNotice(null); setLoadFailed(false);
    try {
      const response = await loadLogiMatchAction({ game, id: selected });
      if (!response.ok) { setLoadFailed(true); setNotice('failed'); return; }
      const current = response.data;
      setEditing(current);
      setValues({ name: current.event.name, map: current.event.map ?? '', description: current.event.description ?? '',
        ...Object.fromEntries(TIMES.map((key) => [key, zonedLocalDateTime(new Date(current.event[key]), 'Europe/Prague')])) } as ReturnType<typeof empty>);
      if (!current.canEdit) setNotice('locked');
    } catch { setLoadFailed(true); setNotice('failed'); }
    finally { setBusy(false); }
  }
  async function submit(input: LogiCommandInput) {
    setRequest(input); setBusy(true); setNotice(null);
    try {
      const result = await submitLogiMatchAction(input);
      if (!result.ok) { setNotice(result.code === 'conflict' ? 'conflict' : 'failed'); return; }
      if (result.data.state === 'pending') { setNotice('pending'); return; }
      if (result.data.state === 'rejected') { setRequest(null); setNotice(result.data.code === 'revision_conflict' ? 'conflict' : 'failed'); return; }
      setRequest(null); setNotice(input.command.operation === 'cancel' ? 'cancelled' : 'saved');
      setSelected(result.data.receipt.eventId);
      // Reload authoritative editable facts and revision; never patch an assumed version.
      const current = await loadLogiMatchAction({ game: input.game, id: result.data.receipt.eventId });
      if (current.ok) {
        setGame(input.game); setEditing(current.data);
        setValues({ name: current.data.event.name, map: current.data.event.map ?? '', description: current.data.event.description ?? '', ...Object.fromEntries(TIMES.map((key) => [key, zonedLocalDateTime(new Date(current.data.event[key]), 'Europe/Prague')])) } as ReturnType<typeof empty>);
      }
      else { setEditing(null); setLoadFailed(true); }
    } catch { setNotice('pending'); }
    finally { setBusy(false); }
  }
  function save() {
    try {
      const event = logiEditableEventSchema.parse({ ...editing?.event, kind: 'match', name: values.name, map: values.map, description: values.description,
        ...Object.fromEntries(TIMES.map((key) => [key, editing && values[key] === zonedLocalDateTime(new Date(editing.event[key]), 'Europe/Prague') ? editing.event[key] : zonedLocalToInstant(values[key], 'Europe/Prague', occurrence).toISOString()])) });
      void submit({ game, requestId: crypto.randomUUID(), command: editing ? { operation: 'update', eventId: editing.eventId, expectedRevision: editing.revision, event } : { operation: 'create', event } });
    } catch { setNotice('invalid'); }
  }
  return <div className={styles.page} data-logi-match-editor="" aria-busy={!ready || busy}>
    <PageHeader title={t(editing ? 'edit' : 'new')} description={t('description')} />
    {!games.length ? <FeedbackNotice kind="warning">{t('disabled')}</FeedbackNotice> : <>
      {notice ? <FeedbackNotice kind={notice === 'saved' || notice === 'cancelled' ? 'success' : notice === 'pending' || notice === 'locked' ? 'warning' : 'error'}>{t(notice)}</FeedbackNotice> : null}
      {request ? <div><p>{t('resume')}</p><p>{'event' in request.command ? request.command.event.name : request.command.eventId}</p><GameButton disabled={busy} onClick={() => void submit(request)}>{t('retry')}</GameButton></div> : null}
      <Select name="connected-game" label={t('game')} value={game} disabled={blocked} onChange={(event) => { setGame(event.target.value as GameRoute); setSelected(''); setEditing(null); setValues(empty()); setLoadFailed(false); }} options={games.map((game) => ({ value: game, label: t(game) }))} />
      <Select name="connected-match" label={t('match')} value={selected} disabled={blocked} onChange={(event) => { setSelected(event.target.value); setEditing(null); setValues(empty()); setLoadFailed(Boolean(event.target.value)); }} options={[{ value: '', label: t('new') }, ...events.filter((event) => event.game === game).map((event) => ({ value: event.id, label: event.title })), ...(selected && !events.some((event) => event.id === selected) ? [{ value: selected, label: editing?.event.name ?? t('match') }] : [])]} />
      {selected ? <GameButton disabled={blocked} onClick={() => void load()}>{t('load')}</GameButton> : null}
      <form onSubmit={(event) => { event.preventDefault(); save(); }}>
        <fieldset disabled={blocked || loadFailed || Boolean(selected && !editing) || editing?.canEdit === false}>
          <TextField name="connected-name" label={t('name')} maxLength={160} required value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} />
          <TextField name="connected-map" label={t('map')} maxLength={200} value={values.map} onChange={(event) => setValues({ ...values, map: event.target.value })} />
          <TextArea name="connected-description" label={t('descriptionField')} maxLength={2000} value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} />
          <p>{t('zone')}</p>
          {TIMES.map((key) => <TextField key={key} name={`connected-${key}`} label={t(key)} type="datetime-local" required value={values[key]} onChange={(event) => setValues({ ...values, [key]: event.target.value })} />)}
          <Select name="connected-occurrence" label={t('occurrence')} value={occurrence} onChange={(event) => setOccurrence(event.target.value as 'earlier' | 'later')} options={(['earlier', 'later'] as const).map((value) => ({ value, label: t(value) }))} />
          <FormActions><GameButton type="submit" intent="primary" disabled={blocked}>{t(busy ? 'saving' : 'save')}</GameButton></FormActions>
        </fieldset>
      </form>
      {editing?.canCancel ? <GameButton disabled={blocked} onClick={() => { if (window.confirm(t('cancelConfirm'))) void submit({ game, requestId: crypto.randomUUID(), command: { operation: 'cancel', eventId: editing.eventId, expectedRevision: editing.revision } }); }}>{t('cancel')}</GameButton> : null}
    </>}
  </div>;
}
