'use client';

import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import styles from './editor.module.css';

/**
 * In-editor presentation of a media-library image with its revision-local alternative
 * text, caption, decorative flag and width. Values are stored in the node attributes of
 * the edited translation only; the media library defaults are never mutated from here.
 */
export function ImageNodeView({ node, updateAttributes, deleteNode, selected }: ReactNodeViewProps) {
  const t = useTranslations('editor.image');
  const id = useId();
  const [failed, setFailed] = useState(false);
  const assetId = String(node.attrs.assetId ?? '');
  const alt = String(node.attrs.alt ?? '');
  const caption = String(node.attrs.caption ?? '');
  const decorative = Boolean(node.attrs.decorative);
  const align = node.attrs.align === 'wide' ? 'wide' : 'center';
  const missingAlt = !decorative && alt.trim() === '';

  return (
    <NodeViewWrapper
      as="figure"
      className={`${styles.figure} ${selected ? styles.figureSelected : ''} ${align === 'wide' ? styles.figureWide : ''}`}
      data-drag-handle=""
      aria-label={t('figureLabel')}
    >
      <div className={styles.figureMedia} contentEditable={false}>
        {failed ? (
          <p className={styles.figureUnavailable}>{t('unavailable')}</p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- authorized private preview via the media route
          <img src={`/api/media/${assetId}/thumb`} alt={decorative ? '' : alt} onError={() => setFailed(true)} />
        )}
      </div>
      <div className={styles.figureFields} contentEditable={false}>
        <label htmlFor={`${id}-alt`}>{t('altLabel')}</label>
        <input
          id={`${id}-alt`}
          type="text"
          value={alt}
          disabled={decorative}
          maxLength={300}
          aria-describedby={`${id}-alt-hint${missingAlt ? ` ${id}-alt-error` : ''}`}
          aria-invalid={missingAlt}
          onChange={(event) => updateAttributes({ alt: event.target.value })}
        />
        <p id={`${id}-alt-hint`} className={styles.hint}>
          {t('altHint')}
        </p>
        {missingAlt ? (
          <p id={`${id}-alt-error`} className={styles.fieldError} role="status">
            {t('missingAlt')}
          </p>
        ) : null}
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={decorative}
            onChange={(event) => updateAttributes({ decorative: event.target.checked, alt: event.target.checked ? '' : alt })}
          />
          {t('decorativeLabel')}
        </label>
        <label htmlFor={`${id}-caption`}>{t('captionLabel')}</label>
        <input
          id={`${id}-caption`}
          type="text"
          value={caption}
          maxLength={500}
          onChange={(event) => updateAttributes({ caption: event.target.value })}
        />
        <div className={styles.figureRow}>
          <label htmlFor={`${id}-align`}>{t('alignLabel')}</label>
          <select id={`${id}-align`} value={align} onChange={(event) => updateAttributes({ align: event.target.value })}>
            <option value="center">{t('alignCenter')}</option>
            <option value="wide">{t('alignWide')}</option>
          </select>
          <button type="button" className={styles.dangerButton} onClick={() => deleteNode()}>
            {t('remove')}
          </button>
        </div>
      </div>
    </NodeViewWrapper>
  );
}
