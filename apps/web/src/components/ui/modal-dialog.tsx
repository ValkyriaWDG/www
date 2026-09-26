'use client';

import { type ReactNode, type RefObject, useEffect, useId, useRef } from 'react';
import styles from './modal-dialog.module.css';

export type ModalDialogProps = {
  open: boolean;
  /** Called for Escape, backdrop click (when allowed) and explicit close actions. */
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Paired actions row (reference 01 proportions). */
  actions?: ReactNode;
  /** Element focused on open; defaults to the first focusable control. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Escape/backdrop dismissal; disable while a mutation is pending. */
  dismissible?: boolean;
  size?: 'sm' | 'md';
  /** Dialog role; use `alertdialog` for confirmations that interrupt a task. */
  role?: 'dialog' | 'alertdialog';
};

/** Native modal `<dialog>`: labelled, focus contained, Escape closes, focus returns to the opener. */
export function ModalDialog({ open, onClose, title, description, children, actions, initialFocusRef, dismissible = true, size = 'sm', role = 'dialog' }: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<Element | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocusRef.current = document.activeElement;
      dialog.showModal();
      initialFocusRef?.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, initialFocusRef]);

  useEffect(() => {
    const dialog = dialogRef.current;
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={`${styles.dialog} ${styles[size]}`}
      role={role === 'alertdialog' ? 'alertdialog' : undefined}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClose={() => {
        const target = returnFocusRef.current;
        returnFocusRef.current = null;
        if (target instanceof HTMLElement && target.isConnected) target.focus();
        if (open) onClose();
      }}
      onClick={(event) => {
        // A click on the dialog element itself (not its panel) is a backdrop click.
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.panel}>
        <span className={styles.corner} data-corner="tl" aria-hidden="true" />
        <span className={styles.corner} data-corner="br" aria-hidden="true" />
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {description ? (
          <p id={descriptionId} className={styles.description}>
            {description}
          </p>
        ) : null}
        {children ? <div className={styles.body}>{children}</div> : null}
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
    </dialog>
  );
}
