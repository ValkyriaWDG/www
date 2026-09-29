import Image from 'next/image';
import type { ReactNode } from 'react';
import emblem from '../../../../public/brand/valkyria-emblem-733.webp';
import styles from './auth.module.css';

/** Page landmark for sign-in/account screens (target of the skip link). */
export function AuthScene({ children }: { children: ReactNode }) {
  return (
    <main id="main-content" tabIndex={-1} className={styles.scene}>
      {children}
    </main>
  );
}

export function Panel({ labelledBy, wide = false, children }: { labelledBy: string; wide?: boolean; children: ReactNode }) {
  return (
    <section aria-labelledby={labelledBy} className={wide ? `${styles.panel} ${styles.wide}` : styles.panel}>
      {children}
    </section>
  );
}

/** `crest` shows the clan emblem above the heading (decorative; the eyebrow names the account). */
export function PanelHeading({ id, eyebrow, title, crest = false }: { id: string; eyebrow?: string; title: string; crest?: boolean }) {
  return (
    <header className={crest ? styles.crestHeader : undefined}>
      {crest ? <Image src={emblem} alt="" className={styles.crest} sizes="72px" priority /> : null}
      {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
      <h1 id={id} className={styles.title}>
        {title}
      </h1>
    </header>
  );
}

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

export function Notice({
  tone,
  title,
  children,
  role,
  testId,
}: {
  tone: NoticeTone;
  title?: string;
  children?: ReactNode;
  role?: 'status' | 'alert';
  testId?: string;
}) {
  return (
    <div className={`${styles.notice} ${styles[tone]}`} role={role} data-testid={testId}>
      {title ? <strong>{title}</strong> : null}
      {children ? <p>{children}</p> : null}
    </div>
  );
}
