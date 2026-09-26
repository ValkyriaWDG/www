'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useUnsavedChangesGuard } from '@/components/shell/unsaved-changes';
import { PageHeader, GameButton, TextField, TextArea, Select } from '@/components/ui';
import { updateSchema, type BotView, type BotErrorCode, type BotSettings, type SettingsUpdate } from '@/modules/bot-management/contracts';
import styles from './dashboard.module.css';

const codes: BotErrorCode[] = ['disabled', 'unavailable', 'forbidden', 'discord_required', 'conflict', 'invalid', 'rate_limited', 'unknown_outcome'];
const safeCode = (value: unknown, fallback: BotErrorCode) => codes.includes(value as BotErrorCode) ? value as BotErrorCode : fallback;
type Draft = SettingsUpdate;

/** Polls only the web backend; the browser never receives the management origin or key. */
export function BotDashboard({ locale }: { locale: 'cs' | 'en' }) {
  const t = useTranslations('adminBot');
  const [view, setView] = useState<BotView | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<BotErrorCode | null>(null);
  const [readUnavailable, setReadUnavailable] = useState(false);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [saved, setSaved] = useState(false);
  const [needsReview, setNeedsReview] = useState(false), [reconciled, setReconciled] = useState(false);
  const [now, setNow] = useState(0);
  const readController = useRef<AbortController | null>(null), writing = useRef(false), dirtyRef = useRef(false);
  const [baseline, setBaseline] = useState<string | null>(null);
  const dirty = draft !== null && JSON.stringify({ settings: draft.settings, reason: draft.reason }) !== baseline;
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useUnsavedChangesGuard(dirty);

  const load = useCallback(async () => {
    if (document.visibilityState !== 'visible' || readController.current || writing.current) return;
    const controller = new AbortController(); readController.current = controller;
    const timer = setTimeout(() => controller.abort('timeout'), 8000);
    try {
      const response = await fetch('/api/admin/bot', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok || !result.ok) {
        const code = safeCode(result.code, 'unavailable'); setError(code); setReadUnavailable(true);
        if (code === 'forbidden' || code === 'discord_required') setView(null);
        return;
      }
      const next = result.view as BotView;
      setView(next); setNow(Date.now()); setError(null); setReadUnavailable(false); setReconciled(true);
      if (next.settings && !dirtyRef.current) {
        const value = { expectedRevision: next.settings.desired.revision, settings: next.settings.desired.settings, reason: '' };
        setBaseline(JSON.stringify({ settings: value.settings, reason: '' })); setDraft(value);
      }
    } catch {
      if (!controller.signal.aborted || controller.signal.reason === 'timeout') { setError('unavailable'); setReadUnavailable(true); }
    } finally { clearTimeout(timer); if (readController.current === controller) readController.current = null; setLoading(false); }
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => { void load(); }, 0);
    const poll = setInterval(() => { void load(); }, 30_000);
    const clock = setInterval(() => setNow(Date.now()), 5000);
    const visibility = () => { if (document.visibilityState === 'hidden') readController.current?.abort('hidden'); else void load(); };
    document.addEventListener('visibilitychange', visibility);
    return () => { clearTimeout(initial); clearInterval(poll); clearInterval(clock); document.removeEventListener('visibilitychange', visibility); readController.current?.abort('unmounted'); };
  }, [load]);

  const date = (value: string | null | undefined) => value ? new Intl.DateTimeFormat(locale === 'cs' ? 'cs-CZ' : 'en-GB', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Europe/Prague' }).format(new Date(value)) : '—';
  const status = view?.status;
  const stale = Boolean(status && (now - Date.parse(status.runtime.observedAt) > 30_000 || Date.parse(status.runtime.observedAt) - now > 5000));
  const state = readUnavailable ? 'unavailable' : stale ? 'stale' : status?.runtime.state ?? 'unknown';
  const settings = view?.settings;
  const enabled = Boolean(view?.enabled && view.canConfigure && !error && !stale && state === 'healthy');
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!enabled || saving || needsReview || !draft || writing.current) return;
    const parsed = updateSchema.safeParse(draft);
    if (!parsed.success) { setError('invalid'); return; }
    writing.current = true; readController.current?.abort('saving'); setSaving(true); setSaved(false); setError(null); setReconciled(false);
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch('/api/admin/bot', { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed.data), signal: controller.signal });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        const code = safeCode(result.code, 'unknown_outcome'); setError(code);
        if (code === 'conflict' || code === 'unknown_outcome') setNeedsReview(true);
        if (code === 'forbidden' || code === 'discord_required') setView(null);
        return;
      }
      const current = result.settings as BotSettings;
      setView((previous) => previous ? { ...previous, settings: current } : previous);
      const value = { expectedRevision: current.desired.revision, settings: current.desired.settings, reason: '' };
      setBaseline(JSON.stringify({ settings: value.settings, reason: '' })); dirtyRef.current = false; setDraft(value); setSaved(true);
    } catch { setError('unknown_outcome'); setNeedsReview(true); }
    finally { clearTimeout(timer); writing.current = false; setSaving(false); }
  }
  const line = (label: string, value: React.ReactNode) => <div className={styles.line}><dt>{label}</dt><dd>{value}</dd></div>;
  return (
    <div className={styles.page} data-admin-bot="">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('intro')} />
      <div className={styles.toolbar}><GameButton onClick={() => void load()} disabled={saving}>{t('refresh')}</GameButton><p>{t('polling')}</p></div>
      <div aria-live="polite" aria-atomic="true" className={styles.notices}>
        {loading && <p>{t('loading')}</p>}
        {error && <p role="alert" className={styles.warning} data-bot-error={error}>{t(`errors.${error}`)}</p>}
        {saved && <p className={styles.notice}>{t('saved')}</p>}
        {needsReview && <p>{t('reviewHelp')}</p>}
        {view && !view.enabled && <p className={styles.notice} data-bot-disabled="">{t('disabled')}</p>}
      </div>
      {status && <div className={styles.grid}>
        <section className={styles.panel} aria-labelledby="bot-runtime"><h2 id="bot-runtime">{t('runtime')} <span className={styles.badge} data-bot-runtime={state}>{t(`states.${state}`)}</span></h2><dl>
          {line(t('discord'), t(`states.${status.runtime.discord}`))}{line(t('database'), t(`states.${status.runtime.database}`))}{line(t('lease'), t(`states.${status.runtime.lease}`))}
          {line(t('version'), status.runtime.build.version)}{line(t('revision'), <code>{status.runtime.build.revision}</code>)}{line(t('startedAt'), date(status.runtime.startedAt))}{line(t('observedAt'), date(status.runtime.observedAt))}{line(t('lastRead'), date(view?.receivedAt))}
        </dl></section>
        <section className={styles.panel} aria-labelledby="bot-roles"><h2 id="bot-roles">{t('roleSync')} <span className={styles.badge} data-bot-role-sync="">{t(`states.${readUnavailable ? 'unavailable' : stale && status.roleSync.enabled ? 'stale' : status.roleSync.state}`)}</span></h2><dl>
          {line(t('pending'), status.roleSync.pending)}{line(t('failed'), status.roleSync.failed)}{line(t('oldestPending'), date(status.roleSync.oldestPendingAt))}{line(t('lastDelivered'), date(status.roleSync.lastDeliveredAt))}{line(t('observedAt'), date(status.observedAt))}
        </dl><p className={styles.muted}>{t('roleLimit')}</p></section>
      </div>}
      {settings && draft && <section className={styles.panel} aria-labelledby="bot-settings"><h2 id="bot-settings">{t('configuration')}</h2><dl className={styles.revisions}>
        {line(t('desired'), settings.desired.revision)}{line(t('effective'), settings.effective?.revision ?? '—')}{line(t('applyState'), t(`states.${settings.applyState}`))}
      </dl>{!view?.canConfigure && <p>{t('readonly')}</p>}
        <form onSubmit={(event) => void save(event)} aria-busy={saving}>
          <fieldset disabled={saving || !view?.canConfigure} className={styles.fields}>
            <Select options={[{value: 'cs', label: 'Čeština (CS)'}, {value: 'en', label: 'English (EN)'}]} name="bot-default-locale" label={t('defaultLocale')} value={draft.settings.defaultLocale} onChange={(event) => { setDraft({ ...draft, settings: { ...draft.settings, defaultLocale: event.target.value as 'cs' | 'en' } }); setSaved(false); if (error === 'invalid') setError(null); }} hint={`${t('requestedValue', { value: settings.desired.settings.defaultLocale.toUpperCase() })} · ${t('effectiveValue', { value: settings.effective?.settings.defaultLocale.toUpperCase() ?? '—' })}`} />
            {Object.entries(draft.settings.serverLabels).map(([id, label]) => <TextField key={id} name={`bot-label-${id}`} label={t('serverLabel', { id })} maxLength={60} required value={label} hint={`${t('requestedValue', { value: settings.desired.settings.serverLabels[id] ?? '—' })} · ${t('effectiveValue', { value: settings.effective?.settings.serverLabels[id] ?? '—' })}`} onChange={(event) => { setDraft({ ...draft, settings: { ...draft.settings, serverLabels: { ...draft.settings.serverLabels, [id]: event.target.value } } }); setSaved(false); if (error === 'invalid') setError(null); }} />)}
            <TextArea name="bot-reason" label={t('reason')} maxLength={200} required rows={2} value={draft.reason} onChange={(event) => { setDraft({ ...draft, reason: event.target.value }); if (error === 'invalid') setError(null); }} />
          </fieldset>
          <div className={styles.actions}><GameButton type="submit" intent="primary" disabled={!enabled || saving || needsReview || !dirty}>{saving ? t('saving') : t('save')}</GameButton>
            {needsReview && <GameButton disabled={!reconciled || Boolean(error) || saving} onClick={() => { setDraft({ ...draft, expectedRevision: settings.desired.revision }); setNeedsReview(false); }}>{t('review')}</GameButton>}
          </div>
        </form><p className={styles.muted}>{t('unsupported')}</p>
      </section>}
    </div>
  );
}
