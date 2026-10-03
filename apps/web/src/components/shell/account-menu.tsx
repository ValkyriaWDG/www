'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDownIcon, UserIcon } from '@/components/ui/icons';
import { GuardedLink } from './guarded-link';
import styles from './header.module.css';

type AccountMenuProps = {
  label: string;
  menuLabel: string;
  links: { href: string; label: string; key: string }[];
};

/** Signed-in account disclosure (button + link list, not an ARIA menu). */
export function AccountMenu({ label, menuLabel, links }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={styles.accountMenu} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.account}
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${menuLabel}: ${label}`}
        title={label}
        onClick={() => setOpen((value) => !value)}
      >
        <UserIcon size={20} />
        <span className={styles.accountLabel}>{label}</span>
        <ChevronDownIcon size={16} />
      </button>
      <ul id={listId} className={styles.accountList} hidden={!open}>
        {links.map((link) => (
          <li key={link.key}>
            <GuardedLink href={link.href} className={styles.accountLink} onClick={() => setOpen(false)}>
              {link.label}
            </GuardedLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
