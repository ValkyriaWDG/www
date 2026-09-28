'use client';

import Image from 'next/image';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { PauseIcon, PlayIcon, VideoOffIcon } from '@/components/ui/icons';
import {
  decideBackgroundPlayback,
  deriveBackgroundState,
  focalPointToObjectPosition,
  isVideoLayerVisible,
  type MediaStatus,
  type PlaybackDecision,
} from '@/components/shell/background-policy';
import { setBackgroundPreference, useMotionInputs } from '@/components/shell/background-store';
import { getRouteMode } from '@/components/shell/route-mode';
import { usePathname } from '@/i18n/navigation';
import { chooseRendition, type HllClip, type HllClipType } from '@/modules/hll/media';
import emblem from '../../../public/brand/valkyria-emblem-733.webp';
import { getSavedTime, getStageSelection, setSavedTime } from './stage-store';
import styles from './hll.module.css';

export type StageLabels = { play: string; pause: string; unavailable: string; posterOnly: string };

const subscribeNever = () => () => {};

/** At most one alternate rendition of the same clip is tried after a failure. */
const MAX_FAILED_RENDITIONS = 1;

type StageControl = { running: boolean; unavailable: boolean; contentPage: boolean; labels: StageLabels; onToggle: () => void };
const StageContext = createContext<StageControl | null>(null);

/**
 * Persistent fullscreen HLL background (spec §9). Server HTML is deterministic: the static fallback (and
 * the selected clip's poster only after hydration). One clip is selected per document
 * after hydration and kept for the browser lifetime; its source is attached only when
 * the shared motion policy allows playback (no video request under reduced motion,
 * Save-Data, slow connections, a narrow touch default or an explicit pause). One muted
 * inline element loops the same clip; failures fall back to the poster with a hint.
 */
export function CinematicStage({ clips, labels, children }: { clips: HllClip[]; labels: StageLabels; children: ReactNode }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const idsKey = clips.map((clip) => clip.id).join('|');
  // Chosen once per document after hydration (the server snapshot is always `null`).
  const picked = useSyncExternalStore(
    subscribeNever,
    () => getStageSelection(idsKey ? idsKey.split('|') : []),
    () => null,
  );
  const [media, setMedia] = useState<MediaStatus>('idle');
  const [failed, setFailed] = useState<string[]>([]);
  const [failedPosterUrl, setFailedPosterUrl] = useState<string | null>(null);
  const [presented, setPresented] = useState(false);
  const { preference, environment } = useMotionInputs();
  const routeMode = getRouteMode(usePathname());
  const contentPage = routeMode !== 'home';

  const clip = picked?.id ? (clips.find((candidate) => candidate.id === picked.id) ?? null) : null;
  const rendition = useMemo(() => {
    if (!clip || !picked) return null;
    const probe = document.createElement('video');
    const canPlay = (type: HllClipType) => probe.canPlayType(type) !== '';
    return chooseRendition(clip, picked.compact, canPlay, failed);
  }, [clip, picked, failed]);

  const hasSources = Boolean(clip && rendition);
  const motionDecision = decideBackgroundPlayback({ preference, environment, routeMode, hasSources });
  // HLL reading screens deliberately stay calm, even after an explicit landing opt-in.
  const decision: PlaybackDecision = contentPage && hasSources ? { play: false, reason: 'route' } : motionDecision;
  const mediaStatus: MediaStatus = clip && !rendition && failed.length > 0 ? 'error' : media;
  const state = picked === null ? 'pending' : !clip ? 'fallback' : deriveBackgroundState(decision, mediaStatus);

  const fail = useCallback(
    (src: string) => {
      setPresented(false);
      if (failed.length >= MAX_FAILED_RENDITIONS) setMedia('error');
      else {
        setFailed((list) => (list.includes(src) ? list : [...list, src]));
        setMedia('loading');
      }
    },
    [failed.length],
  );

  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video || !rendition) return;
    if (video.getAttribute('src') !== rendition.src) {
      video.src = rendition.src;
      const resumeAt = getSavedTime();
      if (resumeAt > 0) {
        video.addEventListener(
          'loadedmetadata',
          () => {
            if (Number.isFinite(video.duration) && resumeAt < video.duration) video.currentTime = resumeAt;
          },
          { once: true },
        );
      }
    }
    video.muted = true;
    setMedia((status) => (status === 'playing' ? status : 'loading'));
    video.play().catch((error: unknown) => {
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'AbortError') return;
      if (name === 'NotAllowedError') setMedia('blocked');
      else fail(rendition.src);
    });
  }, [rendition, fail]);

  // Follow the policy: attach and start only when allowed; pause otherwise.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hasSources) return;
    if (decision.play && mediaStatus !== 'blocked' && mediaStatus !== 'error' && !document.hidden) {
      if (video.paused) play();
    } else if (!video.paused) {
      video.pause();
    }
  }, [decision.play, hasSources, mediaStatus, play]);

  // Pause while the document is hidden; resume only if still allowed.
  useEffect(() => {
    if (!hasSources) return;
    const onVisibility = () => {
      const video = videoRef.current;
      if (!video) return;
      if (document.hidden) video.pause();
      else if (decision.play && mediaStatus !== 'blocked' && mediaStatus !== 'error') play();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [decision.play, hasSources, mediaStatus, play]);

  // Switching game/layout releases the decoder; HLL content routes retain this element.
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (video && video.currentTime > 0) setSavedTime(video.currentTime);
    };
  }, [clip?.id]);

  const running = state === 'playing' || state === 'loading';
  const onToggle = () => {
    if (state === 'unavailable' || contentPage) return;
    if (running) {
      setBackgroundPreference('paused');
      videoRef.current?.pause();
    } else {
      setBackgroundPreference('playing');
      play();
    }
  };
  const objectPosition = focalPointToObjectPosition(clip?.focalPoint);

  return (
    <StageContext.Provider value={clip ? { running, unavailable: state === 'unavailable', contentPage, labels, onToggle } : null}>
      <div
        className={`${styles.scene} ${styles.stage}`}
        aria-hidden="true"
        data-hll-scene=""
        data-hll-stage-state={state}
        data-hll-stage-reason={clip ? decision.reason : 'no-clip'}
        data-hll-clip={clip?.id ?? ''}
        data-hll-clip-count={clips.length}
        data-video-visible={clip && isVideoLayerVisible(deriveBackgroundState(decision, mediaStatus), presented) ? '' : undefined}
      >
        <div className={styles.stageMedia}>
          <div className={styles.sceneBase} />
          {/* The default poster is real HLL scenery; it does not imply clan footage exists. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.stagePoster} src="/images/hll/scene-poster.webp" alt="" fetchPriority="high" decoding="async" data-hll-default-poster="" />
          {clip?.posterUrl && clip.posterUrl !== failedPosterUrl ? (
            // Approved poster of the selected clip; decorative and sized by the viewport.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.stagePoster}
              src={clip.posterUrl}
              alt=""
              decoding="async"
              style={{ objectPosition }}
              onError={() => setFailedPosterUrl(clip.posterUrl)}
              data-hll-stage-poster=""
            />
          ) : null}
          {clip ? (
            <video
              ref={videoRef}
              className={styles.stageVideo}
              tabIndex={-1}
              muted
              loop
              playsInline
              preload="none"
              disablePictureInPicture
              disableRemotePlayback
              style={{ objectPosition }}
              onPlaying={() => {
                setPresented(true);
                setMedia('playing');
              }}
              onWaiting={() => setMedia((status) => (status === 'playing' ? 'loading' : status))}
              onError={() => {
                if (rendition) fail(rendition.src);
              }}
              data-hll-stage-video=""
            />
          ) : null}
          <div className={styles.stageFallback}>
            <Image src={emblem} alt="" className={styles.stageCrest} sizes="(max-width: 767px) 40vw, 18vw" />
          </div>
          <div className={styles.sceneVeil} />
        </div>
      </div>
      {children}
    </StageContext.Provider>
  );
}

/** Kept in the utility footer, outside the decorative aria-hidden scene. */
export function CinematicStageControls() {
  const control = useContext(StageContext);
  if (!control) return null;
  const { running, unavailable, contentPage, labels, onToggle } = control;
  return (
    <div className={styles.stageControls}>
      <button
        type="button"
        className={styles.stageButton}
        onClick={onToggle}
        disabled={unavailable || contentPage}
        aria-pressed={running}
        data-hll-stage-toggle=""
      >
        {unavailable || contentPage ? <VideoOffIcon /> : running ? <PauseIcon /> : <PlayIcon />}
        <span>{unavailable ? labels.unavailable : contentPage ? labels.posterOnly : running ? labels.pause : labels.play}</span>
      </button>
      {!unavailable && !running && !contentPage ? <span className={styles.stageHint}>{labels.posterOnly}</span> : null}
    </div>
  );
}
