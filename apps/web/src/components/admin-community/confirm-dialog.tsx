'use client';

import { useTranslations } from 'next-intl';
import { type ReactNode, useRef } from 'react';
import { GameButton } from '@/components/ui/game-button';
import { ModalDialog } from '@/components/ui/modal-dialog';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  intent?: 'primary' | 'danger';
  pending?: boolean;
  /** Disables the confirm button (e.g. until a required checkbox is ticked). */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
  testId?: string;
};

/**
 * Short confirmation (reference 01 dialog proportions): Cancel receives focus first, the
 * dialog cannot be dismissed while the action is pending, focus returns to the opener.
 */
export function ConfirmDialog({ open, title, description, confirmLabel, intent = 'primary', pending, confirmDisabled, onConfirm, onClose, children, testId }: ConfirmDialogProps) {
  const t = useTranslations('adminCommunity.common');
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <ModalDialog
      open={open}
      onClose={() => {
        if (!pending) onClose();
      }}
      dismissible={!pending}
      role="alertdialog"
      title={title}
      description={description}
      initialFocusRef={cancelRef}
      size="md"
      actions={
        <>
          <GameButton ref={cancelRef} intent="secondary" onClick={onClose} disabled={pending} data-confirm="cancel">
            {t('cancel')}
          </GameButton>
          <GameButton intent={intent} onClick={onConfirm} pending={pending} pendingLabel={t('working')} disabled={confirmDisabled} data-confirm="confirm" data-testid={testId}>
            {confirmLabel}
          </GameButton>
        </>
      }
    >
      {children}
    </ModalDialog>
  );
}
