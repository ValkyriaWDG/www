'use client';

import { useTranslations } from 'next-intl';
import { GameButton } from '@/components/ui/game-button';
import { ModalDialog } from '@/components/ui/modal-dialog';

/**
 * TEMPORARY stub so the community administration compiles on its own. The editorial
 * slice owns and replaces this file with the real media library picker (same props).
 */
export type MediaPickerSelection = {
  assetId: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  filename: string;
};

export type MediaPickerProps = {
  open: boolean;
  scope: 'editorial' | 'match';
  locale: 'cs' | 'en';
  onSelect: (asset: MediaPickerSelection) => void;
  onClose: () => void;
  allowUpload?: boolean;
};

export function MediaPicker({ open, onClose }: MediaPickerProps) {
  const t = useTranslations('common');
  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={t('states.loadError')}
      description={t('states.empty')}
      actions={
        <GameButton intent="secondary" onClick={onClose}>
          {t('actions.close')}
        </GameButton>
      }
    />
  );
}
