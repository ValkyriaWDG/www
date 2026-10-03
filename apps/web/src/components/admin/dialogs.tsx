'use client';

import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { GameButton } from '@/components/ui/game-button';
import { CloseIcon } from '@/components/ui/icons';
import { ModalDialog } from '@/components/ui/modal-dialog';
import styles from './admin.module.css';

/**
 * Short confirmation (game-style dialog, reference 01): focus starts on the safe choice,
 * Escape/backdrop cancel unless the action is pending, the confirm label names the
 * affected language/object explicitly.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  intent = 'danger',
  pending = false,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  /** Safe choice label when the generic "Cancel" would read like the destructive action (e.g. cancelling a schedule). */
  cancelLabel?: string;
  intent?: 'danger' | 'primary';
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const t = useTranslations('adminEditorial.common');
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <ModalDialog
      open={open}
      onClose={() => {
        if (!pending) onCancel();
      }}
      dismissible={!pending}
      role="alertdialog"
      title={title}
      description={description}
      initialFocusRef={cancelRef}
      actions={
        <>
          <GameButton ref={cancelRef} intent="secondary" onClick={onCancel} disabled={pending} data-confirm="cancel">
            {cancelLabel ?? t('cancel')}
          </GameButton>
          <GameButton intent={intent} onClick={onConfirm} pending={pending} pendingLabel={t('working')} data-confirm="confirm">
            {confirmLabel}
          </GameButton>
        </>
      }
    >
      {children}
    </ModalDialog>
  );
}

/**
 * Large modal workspace (media picker): native `<dialog>` with a labelled heading, a
 * visible close button, Escape to close, contained focus and focus return to the opener.
 */
export function WideDialog({
  open,
  onClose,
  title,
  children,
  footer,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
}) {
  const t = useTranslations('adminEditorial.common');
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.wideDialog}
      aria-labelledby={titleId}
      aria-modal="true"
      data-testid={testId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        const target = returnFocus.current;
        returnFocus.current = null;
        if (target instanceof HTMLElement && target.isConnected) target.focus();
        if (open) onClose();
      }}
    >
      {open ? (
        <div className={styles.dialogFrame}>
          <div className={styles.dialogHead}>
            <h2 id={titleId}>{title}</h2>
            <GameButton intent="ghost" size="sm" onClick={onClose} icon={<CloseIcon size={18} />} aria-label={t('close')}>
              <span aria-hidden="true">{t('close')}</span>
            </GameButton>
          </div>
          <div className={styles.dialogBody}>{children}</div>
          {footer ? <div className={styles.dialogFoot}>{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}
