'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type BackgroundSource, type FocalPoint, focalPointToObjectPosition, isVideoLayerVisible } from './background-policy';
import { getMediaStatus, registerBackgroundController, setMediaStatus, useBackgroundPlayback } from './background-store';
import styles from './background.module.css';

export type BackgroundMediaProps = {
  posterUrl: string | null;
  sources: BackgroundSource[];
  focalPoint?: FocalPoint;
};

/**
 * Persistent decorative scene media (lives in the locale layout, so route changes never
 * remount it). Poster (or the CSS/SVG fallback behind it) shows immediately; `<source>`
 * elements are attached only once motion is allowed, so poster-only states make zero
 * video requests. Failures keep the poster and never surface a blocking error.
 */
export function BackgroundMedia({ posterUrl, sources, focalPoint }: BackgroundMediaProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasSources = sources.length > 0;
  const { decision, state } = useBackgroundPlayback(hasSources);
  // Set once the element has presented a frame; keeps it visible through later rebuffering.
  const [hasPresentedFrame, setHasPresentedFrame] = useState(false);
  const objectPosition = focalPointToObjectPosition(focalPoint);

  const attachSources = useCallback(
    (video: HTMLVideoElement) => {
      if (video.dataset.attached === 'true') return;
      video.dataset.attached = 'true';
      const elements = sources.map(({ src, type }) => {
        const element = document.createElement('source');
        element.src = src;
        element.type = type;
        return element;
      });
      // The last <source> reports failure when no candidate could be played.
      elements.at(-1)?.addEventListener('error', () => setMediaStatus('error'));
      video.replaceChildren(...elements);
      video.load();
    },
    [sources],
  );

  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video || !hasSources || getMediaStatus() === 'error') return;
    attachSources(video);
    video.muted = true;
    if (getMediaStatus() !== 'playing') setMediaStatus('loading');
    video.play().catch((error: unknown) => {
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'AbortError') return; // superseded by pause()
      setMediaStatus(name === 'NotAllowedError' ? 'blocked' : 'error');
    });
  }, [attachSources, hasSources]);

  useEffect(() => registerBackgroundController({ play, pause: () => videoRef.current?.pause() }), [play]);

  // Follow the policy: start when allowed, pause otherwise (explicit pause, admin route, reduced motion…).
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hasSources) return;
    if (decision.play) {
      const status = getMediaStatus();
      if (video.paused && status !== 'blocked' && status !== 'error' && !document.hidden) play();
    } else if (!video.paused) {
      video.pause();
    }
  }, [decision.play, hasSources, play]);

  // Pause while hidden; resume only if the current preference still allows motion.
  useEffect(() => {
    if (!hasSources) return;
    const onVisibility = () => {
      const video = videoRef.current;
      if (!video) return;
      if (document.hidden) video.pause();
      else if (decision.play && getMediaStatus() !== 'blocked' && getMediaStatus() !== 'error') play();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [decision.play, hasSources, play]);

  return (
    <div
      className={styles.media}
      data-background-state={state}
      data-background-reason={decision.reason}
      data-video-visible={isVideoLayerVisible(state, hasPresentedFrame) ? '' : undefined}
    >
      {posterUrl ? (
        // Arbitrary approved poster origin; decorative, sized by CSS (object-fit: cover).
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.poster} src={posterUrl} alt="" aria-hidden="true" decoding="async" style={{ objectPosition }} />
      ) : null}
      {hasSources ? (
        <video
          ref={videoRef}
          className={styles.video}
          aria-hidden="true"
          tabIndex={-1}
          muted
          loop
          playsInline
          preload="none"
          disablePictureInPicture
          disableRemotePlayback
          style={{ objectPosition }}
          onPlaying={() => {
            setHasPresentedFrame(true);
            setMediaStatus('playing');
          }}
          onWaiting={() => {
            if (getMediaStatus() === 'playing') setMediaStatus('loading');
          }}
          onError={() => setMediaStatus('error')}
          data-background-video=""
        />
      ) : null}
    </div>
  );
}
