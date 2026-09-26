import type { MatchStatus, ProfileState } from '@valkyria/db/schema';
import type { StatusKind } from '@/components/ui/panels';

/** Badge tone per match status; the label text always carries the meaning too. */
export const MATCH_STATUS_KIND: Record<MatchStatus, StatusKind> = {
  scheduled: 'info',
  live: 'accent',
  completed: 'success',
  postponed: 'warning',
  cancelled: 'danger',
};

export const PUBLICATION_KIND: Record<'draft' | 'published', StatusKind> = {
  draft: 'neutral',
  published: 'success',
};

export const PROFILE_STATE_KIND: Record<ProfileState, StatusKind> = {
  draft: 'neutral',
  published: 'success',
  hidden: 'warning',
};

export const OUTCOME_KIND: Record<'success' | 'denied' | 'failure', StatusKind> = {
  success: 'success',
  denied: 'danger',
  failure: 'warning',
};
