'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { GameButton } from '@/components/ui/game-button';
import { RadioGroup, Select, TextField } from '@/components/ui/form-fields';
import { FeedbackNotice, StatusBadge } from '@/components/ui/panels';
import { formatDate } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import type { DueAtInput } from '@/modules/content/inputs';
import type { ScheduleDTO } from '@/modules/content/types';
import styles from './admin.module.css';
import { defaultScheduleValues, offsetLabel, resolveScheduleForm, SCHEDULE_TIME_ZONES, type ScheduleFormValues } from './schedule-form';
import type { FieldMessageKey } from './field-errors';

type Props = {
  uiLocale: AppLocale;
  contentLocale: 'cs' | 'en';
  schedule: ScheduleDTO | null;
  /** The translation is live: the schedule is an update and the live version stays visible. */
  live: boolean;
  disabled: boolean;
  busy: 'schedule' | 'cancel' | 'reapprove' | null;
  publisherStalled: boolean;
  serverError: FieldMessageKey | null;
  onSchedule: (dueAt: DueAtInput) => void;
  onCancel: (schedule: ScheduleDTO) => void;
  onReapprove: (schedule: ScheduleDTO) => void;
};

/**
 * Scheduled publication of the saved draft of ONE translation: explicit date, time and
 * IANA time zone (Europe/Prague by default), the resolved instant in words, and an
 * explicit choice when a local time occurs twice at the autumn DST change.
 */
export function SchedulePanel({ uiLocale, contentLocale, schedule, live, disabled, busy, publisherStalled, serverError, onSchedule, onCancel, onReapprove }: Props) {
  const t = useTranslations('adminEditorial.schedule');
  const tField = useTranslations('adminEditorial.fieldErrors');
  const [values, setValues] = useState<ScheduleFormValues>(() => defaultScheduleValues());
  const [touched, setTouched] = useState(false);
  // "Now" for the past-time check is captured on every input change (not during render).
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const resolution = resolveScheduleForm(values, new Date(checkedAt));
  const set = (patch: Partial<ScheduleFormValues>) => {
    setTouched(true);
    setCheckedAt(Date.now());
    setValues((current) => ({ ...current, ...patch }));
  };

  if (schedule) {
    const zone = schedule.timeZone;
    return (
      <div className={styles.stack} data-testid="schedule-active" data-schedule-state={schedule.state}>
        <div className={styles.row}>
          <StatusBadge kind={schedule.needsReapproval ? 'danger' : schedule.overdue ? 'warning' : 'info'}>{t(`states.${schedule.state}`)}</StatusBadge>
          {schedule.overdue ? <span className={styles.warning}>{t('overdue')}</span> : null}
        </div>
        <dl className={styles.facts}>
          <dt>{t('dueAt')}</dt>
          <dd data-testid="schedule-due">{formatDate(schedule.dueAt, uiLocale, 'dateTimeZone', zone)}</dd>
          <dt>{t('zone')}</dt>
          <dd>
            {zone} ({offsetLabel(new Date(schedule.dueAt), zone)})
          </dd>
          <dt>{t('issuer')}</dt>
          <dd>{schedule.issuerLabel}</dd>
        </dl>
        <p className={`${styles.small} ${styles.muted}`} style={{ margin: 0 }}>
          {live ? t('liveStays', { locale: contentLocale }) : t('privateUntilDue', { locale: contentLocale })}
        </p>
        {schedule.needsReapproval ? (
          <FeedbackNotice kind="error" title={t('blockedTitle')} live={false}>
            {t('blockedBody')}
          </FeedbackNotice>
        ) : null}
        {publisherStalled && schedule.overdue ? (
          <FeedbackNotice kind="warning" title={t('stalledTitle')} live={false}>
            {t('stalledBody')}
          </FeedbackNotice>
        ) : null}
        <div className={styles.buttonRow}>
          {schedule.needsReapproval ? (
            <GameButton intent="primary" onClick={() => onReapprove(schedule)} disabled={disabled} pending={busy === 'reapprove'} pendingLabel={t('working')} data-testid="schedule-reapprove">
              {t('reapprove', { locale: contentLocale })}
            </GameButton>
          ) : null}
          <GameButton intent="danger" onClick={() => onCancel(schedule)} disabled={disabled} pending={busy === 'cancel'} pendingLabel={t('working')} data-testid="schedule-cancel">
            {t('cancel', { locale: contentLocale })}
          </GameButton>
        </div>
      </div>
    );
  }

  const localError = touched && !resolution.ok ? resolution.error : null;
  const errorText = localError ? t(`errors.${localError}`) : serverError ? tField(serverError) : null;
  return (
    <form
      className={styles.stack}
      data-testid="schedule-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (resolution.ok) onSchedule(resolution.dueAt);
      }}
    >
      <p className={`${styles.small} ${styles.muted}`} style={{ margin: 0 }}>
        {live ? t('introUpdate', { locale: contentLocale }) : t('intro', { locale: contentLocale })}
      </p>
      <div className={styles.inlineFields}>
        <TextField name="schedule-date" id="schedule-date" type="date" label={t('date')} value={values.date} required onChange={(event) => set({ date: event.target.value })} disabled={disabled} />
        <TextField name="schedule-time" id="schedule-time" type="time" label={t('time')} value={values.time} required onChange={(event) => set({ time: event.target.value })} disabled={disabled} />
      </div>
      <Select
        name="schedule-zone"
        id="schedule-zone"
        label={t('zoneLabel')}
        value={values.timeZone}
        onChange={(event) => set({ timeZone: event.target.value, occurrence: 'earlier' })}
        options={SCHEDULE_TIME_ZONES.map((zone) => ({ value: zone, label: zone }))}
        disabled={disabled}
      />
      {resolution.ok && resolution.ambiguous ? (
        <RadioGroup
          name="schedule-occurrence"
          id="schedule-occurrence"
          label={t('ambiguousLabel')}
          hint={t('ambiguousHint')}
          value={values.occurrence}
          onChange={(event) => set({ occurrence: event.target.value === 'later' ? 'later' : 'earlier' })}
          options={[
            { value: 'earlier', label: t('occurrenceEarlier', { offset: offsetLabel(resolution.candidates[0]!, values.timeZone) }) },
            { value: 'later', label: t('occurrenceLater', { offset: offsetLabel(resolution.candidates[resolution.candidates.length - 1]!, values.timeZone) }) },
          ]}
        />
      ) : null}
      {resolution.ok ? (
        <p className={styles.scheduleResolved} data-testid="schedule-resolved" aria-live="polite">
          {t('resolved', {
            locale: contentLocale,
            when: formatDate(resolution.instant, uiLocale, 'dateTimeZone', values.timeZone),
            offset: offsetLabel(resolution.instant, values.timeZone),
            utc: formatDate(resolution.instant, uiLocale, 'dateTime', 'UTC'),
          })}
        </p>
      ) : null}
      {errorText ? (
        <p className={styles.danger} role="alert" style={{ margin: 0 }} data-testid="schedule-error">
          {errorText}
        </p>
      ) : null}
      {publisherStalled ? (
        <FeedbackNotice kind="warning" title={t('stalledTitle')} live={false}>
          {t('stalledBody')}
        </FeedbackNotice>
      ) : null}
      <GameButton type="submit" intent="secondary" disabled={disabled} pending={busy === 'schedule'} pendingLabel={t('working')} data-testid="schedule-submit">
        {live ? t('submitUpdate', { locale: contentLocale }) : t('submit', { locale: contentLocale })}
      </GameButton>
    </form>
  );
}
