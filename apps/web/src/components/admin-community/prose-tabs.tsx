'use client';

import type { JSONContent } from '@tiptap/core';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { MediaPicker } from '@/components/admin/media-picker';
import { RichTextEditor } from '@/components/editor/RichTextEditor';
import type { ImageAttributes } from '@/components/editor/extensions';
import { Checkbox, TextField } from '@/components/ui/form-fields';
import { GameButton } from '@/components/ui/game-button';
import { FeedbackNotice, StatusBadge, type StatusKind } from '@/components/ui/panels';
import { Tabs } from '@/components/ui/tabs';
import type { ActionResult } from '@/lib/result';
import type { ProseAdminDetail, ProseStatus } from '@/modules/prose/types';
import { errorFor, type FieldErrors } from './errors';
import { formatDate } from './format';
import { useActionError, useFieldError } from './use-messages';
import styles from './admin-community.module.css';

type ContentLocale = 'cs' | 'en';
const CONTENT_LOCALES: ContentLocale[] = ['cs', 'en'];

export type ProseCover = { assetId: string; alt: string; caption: string; decorative: boolean } | null;

export type ProseActions = {
  save: (locale: ContentLocale, expectedVersion: number, body: JSONContent, cover: ProseCover) => Promise<ActionResult<ProseAdminDetail>>;
  publish: (locale: ContentLocale, expectedVersion: number) => Promise<ActionResult<ProseAdminDetail>>;
  unpublish: (locale: ContentLocale, expectedVersion: number) => Promise<ActionResult<ProseAdminDetail>>;
};

type ProseTabsProps = {
  kind: ProseKind;
  uiLocale: ContentLocale;
  details: Record<ContentLocale, ProseAdminDetail>;
  canPublish: boolean;
  /** Shared cover image of the owner (match); enables per-locale alt/caption fields. */
  coverAssetId?: string | null;
  mediaScope: 'editorial' | 'match';
  actions: ProseActions;
  onDirtyChange: (locale: ContentLocale, dirty: boolean) => void;
  /** Explains why the owner itself is not public (e.g. unpublished match) — prose then stays private too. */
  ownerNotPublicNote?: string | null;
};

/** Match recap, member biography or tournament description; selects the editor's labels. */
export type ProseKind = 'recap' | 'biography' | 'description';

const LABEL_SUFFIX: Record<ProseKind, 'Recap' | 'Biography' | 'Description'> = { recap: 'Recap', biography: 'Biography', description: 'Description' };

const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

export const STATUS_KIND: Record<ProseStatus, StatusKind> = {
  none: 'neutral',
  draft: 'info',
  published: 'success',
  published_with_changes: 'warning',
};

/**
 * Czech/English prose tabs (match recap, member biography or tournament description). Each locale has its own
 * editor, dirty state, draft revision, live revision and version: saving or publishing
 * one locale never changes the other, and absence is an explicit, honest state.
 */
export function ProseTabs({ kind, uiLocale, details, canPublish, coverAssetId, mediaScope, actions, onDirtyChange, ownerNotPublicNote }: ProseTabsProps) {
  const t = useTranslations('adminCommunity.prose');
  const tStatus = useTranslations('adminCommunity.common.proseStatus');
  const tLang = useTranslations('adminCommunity.common.language');
  const [statuses, setStatuses] = useState<Record<ContentLocale, ProseStatus>>({ cs: details.cs.status, en: details.en.status });
  const [dirty, setDirty] = useState<Record<ContentLocale, boolean>>({ cs: false, en: false });

  const onLocaleDirty = useCallback(
    (locale: ContentLocale, value: boolean) => {
      setDirty((current) => (current[locale] === value ? current : { ...current, [locale]: value }));
      onDirtyChange(locale, value);
    },
    [onDirtyChange],
  );
  const onLocaleStatus = useCallback((locale: ContentLocale, status: ProseStatus) => {
    setStatuses((current) => (current[locale] === status ? current : { ...current, [locale]: status }));
  }, []);

  const tabs = CONTENT_LOCALES.map((locale) => ({
    id: locale,
    label: (
      <span className={styles.tabLabel} data-prose-tab={locale}>
        <span>
          {tLang(`${locale}.name`)} · {locale.toUpperCase()}
        </span>{' '}
        <span className={styles.tabState}>
          {tStatus(statuses[locale])}
          {dirty[locale] ? ` · ${t('unsavedShort')}` : ''}
        </span>
      </span>
    ),
    content: (
      <ProseLocaleEditor
        kind={kind}
        uiLocale={uiLocale}
        locale={locale}
        initial={details[locale]}
        otherStatus={statuses[locale === 'cs' ? 'en' : 'cs']}
        canPublish={canPublish}
        coverAssetId={coverAssetId ?? null}
        mediaScope={mediaScope}
        actions={actions}
        onDirty={onLocaleDirty}
        onStatus={onLocaleStatus}
      />
    ),
  }));

  return (
    <div className={styles.stack} data-prose={kind}>
      {ownerNotPublicNote ? (
        <FeedbackNotice kind="info" live={false}>
          {ownerNotPublicNote}
        </FeedbackNotice>
      ) : null}
      <Tabs label={t(`tabsLabel${LABEL_SUFFIX[kind]}`)} tabs={tabs} defaultTab={uiLocale} />
    </div>
  );
}

type LocaleEditorProps = {
  kind: ProseKind;
  uiLocale: ContentLocale;
  locale: ContentLocale;
  initial: ProseAdminDetail;
  otherStatus: ProseStatus;
  canPublish: boolean;
  coverAssetId: string | null;
  mediaScope: 'editorial' | 'match';
  actions: ProseActions;
  onDirty: (locale: ContentLocale, dirty: boolean) => void;
  onStatus: (locale: ContentLocale, status: ProseStatus) => void;
};

type Notice = { kind: 'success' | 'error' | 'warning'; text: string } | null;

function coverFrom(detail: ProseAdminDetail, coverAssetId: string | null) {
  const cover = detail.draft?.cover;
  if (coverAssetId && cover && cover.assetId.toLowerCase() === coverAssetId.toLowerCase()) {
    return { alt: cover.alt, caption: cover.caption, decorative: cover.decorative };
  }
  return { alt: '', caption: '', decorative: false };
}

function ProseLocaleEditor({ kind, uiLocale, locale, initial, otherStatus, canPublish, coverAssetId, mediaScope, actions, onDirty, onStatus }: LocaleEditorProps) {
  const t = useTranslations('adminCommunity.prose');
  const tStatus = useTranslations('adminCommunity.common.proseStatus');
  const fieldError = useFieldError();
  const actionError = useActionError();
  const headingId = useId();
  const [detail, setDetail] = useState(initial);
  const initialDoc = useMemo<JSONContent>(() => (initial.draft?.body as JSONContent | undefined) ?? EMPTY_DOC, [initial.draft?.body]);
  const [body, setBody] = useState<JSONContent>(initialDoc);
  const [bodyEdited, setBodyEdited] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [cover, setCover] = useState(() => coverFrom(initial, coverAssetId));
  const [coverBaseline, setCoverBaseline] = useState(() => coverFrom(initial, coverAssetId));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState<'save' | 'publish' | 'unpublish' | null>(null);
  const [picker, setPicker] = useState(false);
  const pickerResolve = useRef<((value: ImageAttributes | null) => void) | null>(null);

  const coverDirty = coverAssetId !== null && (cover.alt !== coverBaseline.alt || cover.caption !== coverBaseline.caption || cover.decorative !== coverBaseline.decorative);
  const dirty = bodyEdited || coverDirty;
  useEffect(() => onDirty(locale, dirty), [dirty, locale, onDirty]);
  useEffect(() => onStatus(locale, detail.status), [detail.status, locale, onStatus]);

  const hasDraft = Boolean(detail.draft);
  const isLive = Boolean(detail.published);
  const canPublishNow = canPublish && hasDraft && !dirty && (detail.status === 'draft' || detail.status === 'published_with_changes');

  const handleResult = (result: ActionResult<ProseAdminDetail>, success: string) => {
    if (result.ok) {
      setDetail(result.data);
      setErrors({});
      setNotice({ kind: 'success', text: success });
      return true;
    }
    setErrors(result.fieldErrors ?? {});
    setNotice({ kind: result.code === 'conflict' ? 'warning' : 'error', text: actionError(result.code) });
    return false;
  };

  const save = async () => {
    setPending('save');
    const coverValue: ProseCover = coverAssetId ? { assetId: coverAssetId, alt: cover.decorative ? '' : cover.alt.trim(), caption: cover.caption.trim(), decorative: cover.decorative } : null;
    const result = await actions.save(locale, detail.version, body, coverValue);
    setPending(null);
    if (handleResult(result, t('savedNotice', { lang: locale }))) {
      setBodyEdited(false);
      setCoverBaseline(cover);
    }
  };

  const publish = async () => {
    setPending('publish');
    const result = await actions.publish(locale, detail.version);
    setPending(null);
    handleResult(result, t('publishedNotice', { lang: locale }));
  };

  const unpublish = async () => {
    setPending('unpublish');
    const result = await actions.unpublish(locale, detail.version);
    setPending(null);
    handleResult(result, t('unpublishedNotice', { lang: locale }));
  };

  const discard = () => {
    setBody(initialDocFor(detail));
    setBodyEdited(false);
    setCover(coverBaseline);
    setEditorKey((value) => value + 1);
    setErrors({});
    setNotice(null);
  };

  const requestImage = () =>
    new Promise<ImageAttributes | null>((resolve) => {
      pickerResolve.current = resolve;
      setPicker(true);
    });

  const absence =
    detail.status === 'none' || detail.status === 'draft'
      ? t(otherStatus === 'published' || otherStatus === 'published_with_changes' ? 'absentWithOther' : 'absent', { lang: locale })
      : null;

  return (
    <section aria-labelledby={headingId} data-prose-locale={locale} data-prose-status={detail.status} data-prose-dirty={dirty || undefined}>
      <div className={styles.proseHeader}>
        <h3 id={headingId} className={styles.proseTitle}>
          {t(`editing${LABEL_SUFFIX[kind]}`, { lang: locale, code: locale.toUpperCase() })}
        </h3>
        <div className={styles.badges}>
          <StatusBadge kind={STATUS_KIND[detail.status]}>{tStatus(detail.status)}</StatusBadge>
          {dirty ? <StatusBadge kind="warning">{t('unsaved')}</StatusBadge> : null}
        </div>
      </div>
      <dl className={styles.facts}>
        <div>
          <dt>{t('liveLabel')}</dt>
          <dd>{detail.published ? t('liveSince', { date: formatDate(detail.published.publishedAt, uiLocale, 'dateTimeZone') }) : t('notLive', { lang: locale })}</dd>
        </div>
        {detail.draft ? (
          <div>
            <dt>{t('draftLabel')}</dt>
            <dd>{t('draftSaved', { date: formatDate(detail.draft.createdAt, uiLocale, 'dateTimeZone'), author: detail.draft.createdByLabel })}</dd>
          </div>
        ) : null}
      </dl>
      {absence ? (
        <div className={styles.spaced}>
          <FeedbackNotice kind="info" live={false} title={t('absenceTitle', { lang: locale })}>
            {absence}
          </FeedbackNotice>
        </div>
      ) : null}
      <p id={`${headingId}-canvas`} className="visually-hidden">
        {t(`canvas${LABEL_SUFFIX[kind]}`, { lang: locale })}
      </p>
      <RichTextEditor
        key={editorKey}
        initialContent={editorKey === 0 ? initialDoc : initialDocFor(detail)}
        contentLocale={locale}
        labelledBy={`${headingId}-canvas`}
        onChange={(doc) => {
          setBody(doc);
          setBodyEdited(true);
        }}
        onRequestImage={requestImage}
      />
      {errors.body ? (
        <p role="alert" className={styles.errorText}>
          {/* Rich-text parser issues are English diagnostics; show one localized message instead. */}
          {fieldError('invalid_content')}
        </p>
      ) : null}
      {coverAssetId ? (
        <div className={`${styles.grid} ${styles.spacedTop}`}>
          <TextField
            name={`cover-alt-${locale}`}
            id={`cover-alt-${locale}-${headingId}`}
            label={t('coverAlt', { lang: locale })}
            hint={t('coverAltHint')}
            value={cover.alt}
            disabled={cover.decorative}
            lang={locale}
            onChange={(event) => setCover({ ...cover, alt: event.target.value })}
            error={fieldError(errorFor(errors, 'cover.alt', 'cover'))}
            maxLength={300}
          />
          <TextField
            name={`cover-caption-${locale}`}
            id={`cover-caption-${locale}-${headingId}`}
            label={t('coverCaption', { lang: locale })}
            markOptional
            value={cover.caption}
            lang={locale}
            onChange={(event) => setCover({ ...cover, caption: event.target.value })}
            error={fieldError(errors['cover.caption'])}
            maxLength={500}
          />
          <Checkbox
            name={`cover-decorative-${locale}`}
            id={`cover-decorative-${locale}-${headingId}`}
            label={t('coverDecorative')}
            checked={cover.decorative}
            onChange={(event) => setCover({ ...cover, decorative: event.target.checked })}
          />
        </div>
      ) : null}
      {notice ? (
        <FeedbackNotice kind={notice.kind === 'error' ? 'error' : notice.kind}>
          {notice.text}
        </FeedbackNotice>
      ) : null}
      <div className={styles.proseActions}>
        <GameButton intent="primary" size="sm" onClick={save} disabled={!dirty || pending !== null} pending={pending === 'save'} pendingLabel={t('saving')} data-prose-action="save">
          {t('saveDraft', { lang: locale })}
        </GameButton>
        {dirty ? (
          <GameButton intent="ghost" size="sm" onClick={discard} disabled={pending !== null}>
            {t('discard')}
          </GameButton>
        ) : null}
        {canPublish ? (
          <GameButton intent="secondary" size="sm" onClick={publish} disabled={!canPublishNow || pending !== null} pending={pending === 'publish'} pendingLabel={t('saving')} data-prose-action="publish">
            {detail.status === 'published_with_changes' ? t('publishChanges', { lang: locale }) : t('publish', { lang: locale })}
          </GameButton>
        ) : null}
        {canPublish && isLive ? (
          <GameButton intent="ghost" size="sm" onClick={unpublish} disabled={pending !== null} pending={pending === 'unpublish'} pendingLabel={t('saving')} data-prose-action="unpublish">
            {t('unpublish', { lang: locale })}
          </GameButton>
        ) : null}
      </div>
      {dirty && hasDraft ? <p className={styles.actionNote}>{t('saveBeforePublish')}</p> : null}
      {!canPublish ? <p className={styles.actionNote}>{t('noPublishPermission')}</p> : null}
      <MediaPicker
        open={picker}
        scope={mediaScope}
        locale={uiLocale}
        allowUpload
        onClose={() => {
          setPicker(false);
          pickerResolve.current?.(null);
          pickerResolve.current = null;
        }}
        onSelect={(asset) => {
          setPicker(false);
          pickerResolve.current?.({ assetId: asset.assetId, alt: asset.alt, caption: asset.caption, decorative: asset.alt.trim() === '', align: 'center' });
          pickerResolve.current = null;
        }}
      />
    </section>
  );
}

function initialDocFor(detail: ProseAdminDetail): JSONContent {
  return (detail.draft?.body as JSONContent | undefined) ?? EMPTY_DOC;
}
