import type { ComponentProps, ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import styles from './utility-button.module.css';

type CommonProps = {
  /** Required accessible name; also shown as the hover/focus tooltip. */
  label: string;
  icon: ReactNode;
  /** Tooltip alignment; use `start`/`end` at viewport edges so it never overflows. */
  tooltipAlign?: 'center' | 'start' | 'end';
  tooltipSide?: 'top' | 'bottom';
  className?: string;
};

type ButtonVariant = CommonProps &
  Omit<ComponentProps<'button'>, 'children' | 'className' | 'aria-label'> & {
    href?: undefined;
    /** Toggle state for two-state controls. */
    pressed?: boolean;
  };

type LinkVariant = CommonProps &
  Omit<ComponentProps<'a'>, 'children' | 'className' | 'href' | 'aria-label'> & {
    href: string;
    external?: boolean;
    /** Localized "(external link)" suffix appended to the accessible name. */
    externalLabel?: string;
  };

export type UtilityButtonProps = ButtonVariant | LinkVariant;

/** 44×44 minimum icon control with a required label and a tooltip on hover and focus. */
export function UtilityButton(props: UtilityButtonProps) {
  const { label, icon, tooltipAlign = 'center', tooltipSide = 'top', className } = props;
  const classNames = [styles.utility, className].filter(Boolean).join(' ');
  const tooltip = (
    <span className={styles.tooltip} data-align={tooltipAlign} data-side={tooltipSide} aria-hidden="true">
      {label}
    </span>
  );
  const iconNode = <span className={styles.icon}>{icon}</span>;

  if (props.href !== undefined) {
    const { label: _l, icon: _i, tooltipAlign: _a, tooltipSide: _s, className: _c, href, external, externalLabel, ...rest } = props;
    const name = external && externalLabel ? `${label} ${externalLabel}` : label;
    return external ? (
      <a href={href} className={classNames} aria-label={name} {...rest}>
        {iconNode}
        {tooltip}
      </a>
    ) : (
      <Link href={href} className={classNames} aria-label={name} {...rest}>
        {iconNode}
        {tooltip}
      </Link>
    );
  }
  const { label: _l, icon: _i, tooltipAlign: _a, tooltipSide: _s, className: _c, pressed, type = 'button', ...rest } = props;
  return (
    <button type={type} className={classNames} aria-label={label} aria-pressed={pressed} {...rest}>
      {iconNode}
      {tooltip}
    </button>
  );
}
