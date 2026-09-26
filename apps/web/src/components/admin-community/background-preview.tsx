'use client';

import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { type BackgroundSource, focalPointToObjectPosition } from '@/components/shell/background-policy';
import { GameButton } from '@/components/ui/game-button';
import { PauseIcon, PlayIcon } from '@/components/ui/icons';
import styles from './admin-community.module.css';

type PreviewProps = {
  posterUrl: string | null;
  sources: BackgroundSource[];
  focal: { x: number; y: number };
  /** False while the proposed values fail validation: nothing is loaded then. */
  valid: boolean;
  /** The shell's original fallback scene (server-rendered), shown behind the media. */
  fallback: ReactNode;
};

type PosterState = 'none' | 'loading' | 'ready' | 'failed';
type VideoState = 'none' | 'idle' | 'loading' | 'playing' | 'paused' | 'failed';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
function subscribeMotion(listener: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

/**
 * Framed preview of PROPOSED background media (not the live site). It composes the
 * shell's fallback scene, poster and focal point (`object-position` via the shell policy
 * helper) and plays video only after an explicit Play (never autoplay in the admin, so
 * reduced-motion and data-saving preferences are respected). Media loads in the browser
 * from same-site paths or allowlisted origins only; the server never fetches it. Loading
 * failures are reported separately from validation errors.
 */
export function BackgroundPreview(props: PreviewProps) {
  // New proposed media (or validity) remounts the preview: loading state and playback restart cleanly.
  const key = `${props.valid}|${props.posterUrl ?? ''}|${props.sources.map((source) => source.src).join('|')}`;
  return <PreviewFrame key={key} {...props} />;
}

function PreviewFrame({ posterUrl, sources, focal, valid, fallback }: PreviewProps) {
  const t = useTranslations('adminCommunity.settings.preview');
  const videoRef = useRef<HTMLVideoElement>(null);
  const reducedMotion = useSyncExternalStore(subscribeMotion, () => window.matchMedia(REDUCED_MOTION).matches, () => false);
  const [poster, setPoster] = useState<PosterState>(valid && posterUrl ? 'loading' : 'none');
  const [video, setVideo] = useState<VideoState>(valid && sources.length > 0 ? 'idle' : 'none');
  const [active, setActive] = useState(false);
  const sourceKey = sources.map((source) => source.src).join('|');

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !active) return;
    element.muted = true;
    element.load();
    element.play().catch((error: unknown) => {
      const name = error instanceof DOMException ? error.name : '';
      if (name !== 'AbortError') setVideo('failed');
    });
  }, [active, sourceKey]);

  const objectPosition = focalPointToObjectPosition(focal);
  const showMedia = valid;
  const toggle = () => {
    if (video === 'playing' || video === 'loading') {
      videoRef.current?.pause();
      setVideo('paused');
      return;
    }
    if (!active) {
      setActive(true);
      setVideo('loading');
    } else {
      setVideo('loading');
      videoRef.current?.play().catch(() => setVideo('failed'));
    }
  };

  const status = (() => {
    if (!valid) return { kind: 'invalid', text: t('invalid') };
    if (poster === 'failed' || video === 'failed') return { kind: 'failed', text: t(poster === 'failed' && video === 'failed' ? 'failedBoth' : poster === 'failed' ? 'failedPoster' : 'failedVideo') };
    if (poster === 'loading' || video === 'loading') return { kind: 'loading', text: t('loading') };
    if (poster === 'none' && video === 'none') return { kind: 'fallback', text: t('fallbackOnly') };
    if (video === 'playing') return { kind: 'playing', text: t('playing') };
    return { kind: 'ready', text: sources.length > 0 ? t('readyWithVideo') : t('readyPoster') };
  })();

  return (
    <figure className={`${styles.stack} ${styles.previewFigure}`} data-background-preview="" data-preview-state={status.kind}>
      <div className={styles.previewFrame}>
        {fallback}
        {showMedia && posterUrl ? (
          // Proposed poster from an allowlisted origin, loaded by the browser only.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={posterUrl}
            alt=""
            decoding="async"
            style={{ objectPosition }}
            hidden={poster === 'failed'}
            onLoad={() => setPoster('ready')}
            onError={() => setPoster('failed')}
            data-preview-poster=""
          />
        ) : null}
        {showMedia && sources.length > 0 ? (
          <video
            ref={videoRef}
            muted
            loop
            playsInline
            preload="none"
            disablePictureInPicture
            aria-hidden="true"
            tabIndex={-1}
            style={{ objectPosition, opacity: video === 'playing' ? 1 : 0 }}
            onPlaying={() => setVideo('playing')}
            onError={() => setVideo('failed')}
            data-preview-video=""
          >
            {active
              ? sources.map((source, index) => (
                  <source key={source.src} src={source.src} type={source.type} onError={index === sources.length - 1 ? () => setVideo('failed') : undefined} />
                ))
              : null}
          </video>
        ) : null}
        <span className={styles.previewTag} aria-hidden="true">
          {t('tag')}
        </span>
        {showMedia && (posterUrl || sources.length > 0) ? <span className={styles.focalMarker} style={{ left: `${focal.x}%`, top: `${focal.y}%` }} aria-hidden="true" /> : null}
      </div>
      <figcaption className={styles.previewStatus}>
        <span role="status" data-preview-status={status.kind} className={status.kind === 'failed' || status.kind === 'invalid' ? styles.errorText : styles.actionNote}>
          {status.text}
        </span>
        {showMedia && sources.length > 0 ? (
          <GameButton size="sm" intent="secondary" onClick={toggle} disabled={video === 'failed'} icon={video === 'playing' || video === 'loading' ? <PauseIcon /> : <PlayIcon />} data-preview-toggle="">
            {video === 'playing' || video === 'loading' ? t('pause') : t('play')}
          </GameButton>
        ) : null}
      </figcaption>
      <p className={styles.actionNote}>{reducedMotion ? t('reducedMotion') : t('noAutoplay')}</p>
    </figure>
  );
}
