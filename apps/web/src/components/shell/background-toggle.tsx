'use client';

import { useTranslations } from 'next-intl';
import { PauseIcon, PlayIcon, VideoOffIcon } from '@/components/ui/icons';
import { UtilityButton } from '@/components/ui/utility-button';
import { toggleBackground, useBackgroundPlayback } from './background-store';

/**
 * Visible Pause/Play background control. The label states the action ("Pause background"
 * / "Play background"); the choice persists in localStorage across routes and visits.
 * Hidden when no video is configured and on admin routes (static backdrop only).
 */
export function BackgroundToggle({ hasSources, tooltipAlign = 'center' }: { hasSources: boolean; tooltipAlign?: 'center' | 'start' | 'end' }) {
  const t = useTranslations('common.background');
  const { state, routeMode } = useBackgroundPlayback(hasSources);
  if (!hasSources || routeMode === 'admin') return null;
  const unavailable = state === 'unavailable';
  const running = state === 'playing' || state === 'loading';
  const label = unavailable ? t('unavailable') : running ? t('pause') : t('play');
  const icon = unavailable ? <VideoOffIcon /> : running ? <PauseIcon /> : <PlayIcon />;
  return (
    <UtilityButton
      label={label}
      icon={icon}
      disabled={unavailable}
      tooltipAlign={tooltipAlign}
      onClick={() => toggleBackground(state)}
      data-background-toggle=""
      data-state={state}
    />
  );
}
