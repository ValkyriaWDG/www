import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { CheckIcon, ChevronLeftIcon, DotIcon, ErrorIcon, InfoIcon, WarningIcon } from './icons';
import styles from './panels.module.css';

type HeadingLevel = 'h1' | 'h2' | 'h3';

/** Square dark surface with a slim title strip (optional `//` eyebrow), description and toolbar slot. */
export function SectionFrame({
  title,
  titleAs: Title = 'h2',
  titleId,
  eyebrow,
  description,
  toolbar,
  children,
  className,
}: {
  title: ReactNode;
  titleAs?: HeadingLevel;
  titleId?: string;
  eyebrow?: ReactNode;
  description?: ReactNode;
  toolbar?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={[styles.frame, className].filter(Boolean).join(' ')} aria-labelledby={titleId}>
      <div className={styles.frameStrip}>
        <div className={styles.frameHeading}>
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <Title id={titleId} className={styles.frameTitle}>
            {title}
          </Title>
        </div>
        {toolbar ? <div className={styles.frameToolbar}>{toolbar}</div> : null}
      </div>
      {description ? <div className={styles.frameDescription}>{description}</div> : null}
      {children ? <div className={styles.frameBody}>{children}</div> : null}
    </section>
  );
}

/** Small `// LABEL` caption; the slashes are decorative. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className={styles.eyebrow}>
      <span aria-hidden="true">{'// '}</span>
      {children}
    </p>
  );
}

/** Page title block: one h1, optional `//` eyebrow, back link or breadcrumb with a meaningful destination. */
export function PageHeader({
  title,
  titleId,
  eyebrow,
  description,
  back,
  breadcrumbs,
  actions,
}: {
  title: ReactNode;
  titleId?: string;
  eyebrow?: ReactNode;
  description?: ReactNode;
  /** Logical path + localized destination label, e.g. `{ href: '/news', label: 'Zpět na novinky' }`. */
  back?: { href: string; label: string };
  breadcrumbs?: { href?: string; label: string }[];
  actions?: ReactNode;
}) {
  const t = useTranslations('common.a11y');
  return (
    <header className={styles.pageHeader}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label={t('breadcrumb')}>
          <ol className={styles.breadcrumbs}>
            {breadcrumbs.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`}>
                {crumb.href && index < breadcrumbs.length - 1 ? <Link href={crumb.href}>{crumb.label}</Link> : <span aria-current="page">{crumb.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className={styles.pageTitleRow}>
        {back ? (
          <Link href={back.href} className={styles.back} data-back-link="">
            <ChevronLeftIcon size={22} />
            <span>{back.label}</span>
          </Link>
        ) : null}
        <div className={styles.pageTitleText}>
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <h1 id={titleId} className={styles.pageTitle}>
            {title}
          </h1>
        </div>
        {actions ? <div className={styles.pageActions}>{actions}</div> : null}
      </div>
      {description ? <div className={styles.pageDescription}>{description}</div> : null}
    </header>
  );
}

/** Contextual detail beside a list (desktop); the standalone detail route must exist independently. */
export function DetailPane({
  title,
  titleAs: Title = 'h2',
  titleId,
  eyebrow,
  media,
  metadata,
  children,
  actions,
}: {
  title: ReactNode;
  titleAs?: HeadingLevel;
  titleId: string;
  eyebrow?: ReactNode;
  media?: ReactNode;
  metadata?: { label: ReactNode; value: ReactNode; wide?: boolean }[];
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className={styles.detail} aria-labelledby={titleId}>
      {media ? <div className={styles.detailMedia}>{media}</div> : null}
      <div className={styles.detailBody}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <Title id={titleId} className={styles.detailTitle}>
          {title}
        </Title>
        {metadata && metadata.length > 0 ? (
          <dl className={styles.metadata}>
            {metadata.map((item, index) => (
              <div key={index} className={styles.metadataItem} data-wide={item.wide ? '' : undefined}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {children}
      </div>
      {actions ? <div className={styles.detailActions}>{actions}</div> : null}
    </section>
  );
}

export type StatusKind = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';

const STATUS_ICONS: Record<StatusKind, ReactNode> = {
  neutral: <DotIcon size={14} />,
  info: <InfoIcon size={14} />,
  success: <CheckIcon size={14} />,
  warning: <WarningIcon size={14} />,
  danger: <ErrorIcon size={14} />,
  accent: <DotIcon size={14} />,
};

/** Status label: text + icon + border; color is supplemental, never the only signal. */
export function StatusBadge({ kind = 'neutral', children, icon = true }: { kind?: StatusKind; children: ReactNode; icon?: boolean }) {
  return (
    <span className={styles.badge} data-kind={kind}>
      {icon ? STATUS_ICONS[kind] : null}
      <span>{children}</span>
    </span>
  );
}

export type FeedbackKind = 'info' | 'success' | 'warning' | 'error';

const FEEDBACK_ICONS: Record<FeedbackKind, ReactNode> = {
  info: <InfoIcon size={20} />,
  success: <CheckIcon size={20} />,
  warning: <WarningIcon size={20} />,
  error: <ErrorIcon size={20} />,
};

/**
 * Inline, stable feedback. Errors use `role="alert"`, other kinds `role="status"`; pass
 * `live={false}` for notices present on first render that need no announcement.
 */
export function FeedbackNotice({ kind = 'info', title, children, action, live = true }: { kind?: FeedbackKind; title?: ReactNode; children?: ReactNode; action?: ReactNode; live?: boolean }) {
  const role = live ? (kind === 'error' ? 'alert' : 'status') : undefined;
  return (
    <div className={styles.notice} data-kind={kind} role={role}>
      <span className={styles.noticeIcon}>{FEEDBACK_ICONS[kind]}</span>
      <div className={styles.noticeBody}>
        {title ? <p className={styles.noticeTitle}>{title}</p> : null}
        {children ? <div className={styles.noticeText}>{children}</div> : null}
      </div>
      {action ? <div className={styles.noticeAction}>{action}</div> : null}
    </div>
  );
}

/** Factual empty state with an optional recovery action (distinguish no data vs. no filter matches). */
export function EmptyState({ title, children, action, titleAs: Title = 'h2' }: { title: ReactNode; children?: ReactNode; action?: ReactNode; titleAs?: HeadingLevel }) {
  return (
    <div className={styles.empty}>
      <Title className={styles.emptyTitle}>{title}</Title>
      {children ? <div className={styles.emptyText}>{children}</div> : null}
      {action ? <div className={styles.emptyAction}>{action}</div> : null}
    </div>
  );
}

/** Low-motion placeholder blocks that preserve layout while content loads (decorative). */
export function Skeleton({ lines = 3, variant = 'text' }: { lines?: number; variant?: 'text' | 'block' | 'row' }) {
  return (
    <div className={styles.skeleton} data-variant={variant} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className={styles.skeletonLine} />
      ))}
    </div>
  );
}

/** Short textual loading status announced politely. */
export function LoadingText({ children }: { children?: ReactNode }) {
  const t = useTranslations('common.states');
  return (
    <p className={styles.loadingText} role="status">
      {children ?? t('loading')}
    </p>
  );
}
