import type { ComponentProps, ReactNode } from 'react';
import { ExternalIcon } from '@/components/ui/icons';
import styles from './public.module.css';

type ExternalLinkProps = Omit<ComponentProps<'a'>, 'href' | 'children'> & {
  /** Validated absolute HTTPS URL. */
  href: string;
  /** Localized "(external link)" suffix announced to assistive technology. */
  externalLabel: string;
  children: ReactNode;
  variant?: 'inline' | 'button';
};

/**
 * Same-tab link to another site with a visible arrow icon and an accessible
 * "(externí odkaz)" suffix. No `target`, so no new-tab announcement is needed.
 */
export function ExternalLink({ href, externalLabel, children, variant = 'inline', className, ...rest }: ExternalLinkProps) {
  const base = variant === 'button' ? styles.externalButton : styles.external;
  return (
    <a href={href} className={[base, className].filter(Boolean).join(' ')} {...rest}>
      <span>{children}</span>
      <ExternalIcon size={16} className={styles.externalIcon} />
      <span className="visually-hidden"> {externalLabel}</span>
    </a>
  );
}
