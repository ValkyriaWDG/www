'use client';

import { type ComponentProps, useEffect, useRef, useState } from 'react';
import styles from './scroll-region.module.css';

/** Which edge of the region still hides content. */
type ScrollEdges = 'none' | 'start' | 'end' | 'both';

function edgesOf(element: HTMLElement): ScrollEdges {
  const after = element.scrollWidth - element.clientWidth - element.scrollLeft > 1;
  const before = element.scrollLeft > 1;
  return after && before ? 'both' : after ? 'end' : before ? 'start' : 'none';
}

type ScrollRegionProps = Omit<ComponentProps<'div'>, 'role' | 'tabIndex' | 'aria-label'> & {
  /** Accessible name of the region (already localized, e.g. "Statistiky hráčů – posuvná oblast"). */
  label: string;
  frameClassName?: string;
};

/**
 * Horizontally scrollable, focusable, labelled region for a wide table. Its frame fades
 * the trailing edge while more columns hide behind it, so phone readers see there is
 * more to scroll. The edge state is measured after hydration and on scroll/resize;
 * without JavaScript the region still scrolls, it only lacks the fade.
 */
export function ScrollRegion({ label, className, frameClassName, children, ...rest }: ScrollRegionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<ScrollEdges>('none');

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setEdges((current) => {
      const next = edgesOf(element);
      return current === next ? current : next;
    });
    const frame = requestAnimationFrame(update);
    element.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    if (element.firstElementChild) observer?.observe(element.firstElementChild);
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, []);

  return (
    <div className={[styles.frame, frameClassName].filter(Boolean).join(' ')} data-scroll-edges={edges}>
      <div ref={ref} className={className} role="region" aria-label={label} tabIndex={0} {...rest}>
        {children}
      </div>
    </div>
  );
}
