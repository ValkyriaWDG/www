import type { ComponentProps, ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import styles from './game-button.module.css';

export type GameButtonIntent = 'primary' | 'secondary' | 'ghost' | 'danger';
export type GameButtonSize = 'sm' | 'md' | 'lg';

type CommonProps = {
  intent?: GameButtonIntent;
  size?: GameButtonSize;
  /** Left-aligned label (menu actions) instead of centered. */
  align?: 'center' | 'start';
  fullWidth?: boolean;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
};

type ButtonVariant = CommonProps &
  Omit<ComponentProps<'button'>, 'children' | 'className'> & {
    href?: undefined;
    /** Blocks duplicate submission: aria-busy + disabled, dimensions preserved. */
    pending?: boolean;
    /** Screen-reader text announced while pending (e.g. "Ukládání…"). */
    pendingLabel?: string;
  };

type LinkVariant = CommonProps &
  Omit<ComponentProps<'a'>, 'children' | 'className' | 'href'> & {
    /** Internal logical path (`/clan`) → localized Link; external URLs need `external`. */
    href: string;
    external?: boolean;
    /** Localized "(external link)" suffix for assistive technology. */
    externalLabel?: string;
  };

export type GameButtonProps = ButtonVariant | LinkVariant;

function classes(props: CommonProps, extra?: string) {
  const { intent = 'secondary', size = 'md', align = 'center', fullWidth, className } = props;
  return [styles.button, styles[intent], styles[size], align === 'start' && styles.alignStart, fullWidth && styles.fullWidth, extra, className]
    .filter(Boolean)
    .join(' ');
}

/** Square game-menu control: an anchor when it navigates (`href`), otherwise a button. */
export function GameButton(props: GameButtonProps) {
  if (props.href !== undefined) {
    const { intent: _i, size: _s, align: _a, fullWidth: _f, icon, className: _c, children, href, external, externalLabel, ...rest } = props;
    const content = (
      <>
        {icon ? <span className={styles.icon}>{icon}</span> : null}
        <span className={styles.label}>{children}</span>
        {external && externalLabel ? <span className="visually-hidden"> {externalLabel}</span> : null}
      </>
    );
    return external ? (
      <a href={href} className={classes(props)} {...rest}>
        {content}
      </a>
    ) : (
      <Link href={href} className={classes(props)} {...rest}>
        {content}
      </Link>
    );
  }
  const { intent: _i, size: _s, align: _a, fullWidth: _f, icon, className: _c, children, pending, pendingLabel, disabled, type = 'button', ...rest } = props;
  return (
    <button type={type} className={classes(props, pending ? styles.pending : undefined)} disabled={disabled || pending} aria-busy={pending || undefined} {...rest}>
      {icon ? <span className={styles.icon}>{icon}</span> : null}
      <span className={styles.label}>{children}</span>
      {pending && pendingLabel ? <span className="visually-hidden"> {pendingLabel}</span> : null}
      {pending ? <span className={styles.progress} aria-hidden="true" /> : null}
    </button>
  );
}
