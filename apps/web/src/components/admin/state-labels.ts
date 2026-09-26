import type { StatusKind } from '@/components/ui/panels';
import type { ScheduleState } from '@valkyria/db';
import type { TranslationAdminState } from '@/modules/content/types';

/**
 * Pure mapping of a translation's composite admin state to a status label key
 * (`adminEditorial.states.<key>`), badge kind and schedule warning. Labels are rendered
 * in the UI locale; the content locale is shown separately next to the badge.
 */

export type TranslationStateKey = TranslationAdminState | 'missing';
export type ScheduleWarning = 'overdue' | 'blocked' | 'failed' | null;

export type TranslationStateInput = {
  state: TranslationAdminState;
  schedule?: { state: ScheduleState; overdue: boolean } | null;
} | null | undefined;

export type TranslationStatusView = { key: TranslationStateKey; kind: StatusKind; warning: ScheduleWarning };

const KIND: Record<TranslationStateKey, StatusKind> = {
  missing: 'neutral',
  draft: 'neutral',
  published: 'success',
  published_with_changes: 'warning',
  scheduled: 'info',
  published_update_scheduled: 'info',
  archived: 'neutral',
};

export function scheduleWarning(schedule: { state: ScheduleState; overdue: boolean } | null | undefined): ScheduleWarning {
  if (!schedule) return null;
  if (schedule.state === 'blocked') return 'blocked';
  if (schedule.state === 'failed') return 'failed';
  if (schedule.overdue) return 'overdue';
  return null;
}

export function translationStatus(translation: TranslationStateInput): TranslationStatusView {
  if (!translation) return { key: 'missing', kind: KIND.missing, warning: null };
  const warning = translation.state === 'archived' ? null : scheduleWarning(translation.schedule);
  return { key: translation.state, kind: warning === 'blocked' || warning === 'failed' ? 'danger' : KIND[translation.state], warning };
}

/** Whether the translation currently has a live published revision. */
export function isLive(state: TranslationAdminState | undefined): boolean {
  return state === 'published' || state === 'published_with_changes' || state === 'published_update_scheduled';
}

/** Publish button wording: `Publish` for a first publication, `Update` for a live translation. */
export function publishIntent(state: TranslationAdminState | undefined): 'publish' | 'update' {
  return isLive(state) ? 'update' : 'publish';
}
