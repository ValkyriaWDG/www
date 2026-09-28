'use client';

import type { JSONContent } from '@tiptap/core';
import type { Game } from '@valkyria/db';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { RichTextEditor } from '@/components/editor/RichTextEditor';
import type { ImageAttributes } from '@/components/editor/extensions';
import { GuardedLink } from '@/components/shell/guarded-link';
import { useNavigationGuard, useUnsavedChangesGuard } from '@/components/shell/unsaved-changes';
import { Checkbox, FieldError, Select, TextArea, TextField } from '@/components/ui/form-fields';
import { GameButton } from '@/components/ui/game-button';
import { gameHasSection, gameRouteFromDb } from '@/modules/games/registry';
import { canonicalNewsPath, gamePath } from '@/modules/games/routes';
import { FeedbackNotice, StatusBadge } from '@/components/ui/panels';
import { formatDate } from '@/i18n/date-format';
import { useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { TaxonomyOptions } from '@/modules/content/admin-queries';
import {
  addTranslationAction,
  archiveDocumentAction,
  cancelScheduleAction,
  getEditorStateAction,
  listRevisionsAction,
  publishTranslationAction,
  reapproveScheduleAction,
  restoreRevisionAction,
  saveDraftAction,
  scheduleTranslationAction,
  unarchiveDocumentAction,
  unpublishTranslationAction,
} from '@/modules/content/actions';
import type { DueAtInput } from '@/modules/content/inputs';
import { slugify } from '@/modules/content/slug';
import type { DocumentEditorState, RevisionSummary, ScheduleDTO, TranslationEditorState } from '@/modules/content/types';
import styles from './admin.module.css';
import { canAutosave, AUTOSAVE_DELAY_MS, initialSaveMachine, isDirty, reduceSave, type SaveEvent, type SaveKind, type SaveMachine } from './autosave';
import { ConfirmDialog } from './dialogs';
import { fieldsFrom, localDraftErrors, sharedFrom, suggestedSlug, type EditorFields, type SharedFields } from './editor-model';
import { groupFieldErrors, type EditorField, type FieldMessageKey } from './field-errors';
import { MediaPicker, type MediaPickerSelection } from './media-picker';
import { RevisionHistory } from './revision-history';
import { SchedulePanel } from './schedule-panel';
import { isLive, publishIntent, translationStatus } from './state-labels';

type ContentLocale = 'cs' | 'en';
const LOCALES: ContentLocale[] = ['cs', 'en'];
const GAMES: Game[] = ['wardogs', 'hell-let-loose'];
/** Games whose section has a Field Manual (a manual article always belongs to one). */
const MANUAL_GAMES: Game[] = GAMES.filter((game) => gameHasSection(gameRouteFromDb(game), 'field-manual'));

export type NewsEditorProps = {
  /**
   * `news`: full post workflow; `manual`: the same workflow for a game's Field Manual
   * article (manual categories, a required game); `page`: core page (fixed slug, no
   * taxonomy/schedule/archive).
   */
  mode: 'news' | 'page' | 'manual';
  uiLocale: AppLocale;
  contentLocale: ContentLocale;
  initialState: DocumentEditorState;
  initialRevisions: RevisionSummary[];
  taxonomy: TaxonomyOptions;
  canPublish: boolean;
  publisherStalled: boolean;
};

type Notice = { kind: 'success' | 'error' | 'warning' | 'info'; title: string; body?: ReactNode; testId?: string };
type Busy = 'publish' | 'unpublish' | 'schedule' | 'cancel' | 'reapprove' | 'restore' | 'archive' | 'unarchive' | 'reload' | 'translation' | null;
type Confirm =
  | { kind: 'unpublish' }
  | { kind: 'cancelSchedule'; schedule: ScheduleDTO }
  | { kind: 'restore'; revision: RevisionSummary }
  | { kind: 'archive' }
  | { kind: 'overwrite' }
  | null;

type LatestValues = { fields: EditorFields; shared: SharedFields; sharedSeq: number; sharedSavedSeq: number; slugTouched: boolean };

const sharedPending = (values: LatestValues) => values.sharedSeq !== values.sharedSavedSeq;

/**
 * Tiptap's `getJSON()` attribute objects are not plain objects; React would send them to
 * a server action as opaque temporary references. Send a plain JSON copy instead.
 */
function plainJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Machine state mirrored in a ref so async save chains always read the latest status. */
function useSaveMachine(): [SaveMachine, (event: SaveEvent) => void, { current: SaveMachine }] {
  const [machine, setMachine] = useState(initialSaveMachine);
  const ref = useRef(machine);
  const dispatch = useCallback((event: SaveEvent) => {
    ref.current = reduceSave(ref.current, event);
    setMachine(ref.current);
  }, []);
  return [machine, dispatch, ref];
}

/**
 * WordPress-like editor for ONE translation of a news post or core page: title and wide
 * visual canvas, a document/publication side panel (stacked on small screens), explicit
 * content-language tabs, debounced server autosave (never publishes), manual save,
 * private preview, per-language publish/update/unpublish, scheduling with time zone,
 * revision history with restore-to-draft, and explicit conflict/failure recovery that
 * keeps unsent text in memory. Nothing is stored in browser storage.
 */
export function NewsEditor({ mode, uiLocale, contentLocale, initialState, initialRevisions, taxonomy, canPublish, publisherStalled }: NewsEditorProps) {
  const t = useTranslations('adminEditorial.editor');
  const tCommon = useTranslations('adminEditorial.common');
  const tLang = useTranslations('adminEditorial.common.languages');
  const tState = useTranslations('adminEditorial.states');
  const tWarn = useTranslations('adminEditorial.warnings');
  const tField = useTranslations('adminEditorial.fieldErrors');
  const tGames = useTranslations('adminEditorial.games');
  const tErrors = useTranslations('errors');
  const router = useRouter();
  const guard = useNavigationGuard();
  const bodyLabelId = useId();
  const documentId = initialState.document.id;
  const initialTranslation = initialState.translations[contentLocale]!;
  const basePath = mode === 'news' ? '/admin/news' : mode === 'manual' ? '/admin/manual' : '/admin/content';
  const pageKey = initialState.document.pageKey;
  const editorial = mode !== 'page';

  const [docState, setDocState] = useState(initialState);
  const translation = docState.translations[contentLocale] ?? initialTranslation;
  const [fields, setFields] = useState<EditorFields>(() => fieldsFrom(initialTranslation));
  const [shared, setShared] = useState<SharedFields>(() => sharedFrom(initialState.document));
  const [editorKey, setEditorKey] = useState(0);
  const [machine, dispatch, machineRef] = useSaveMachine();
  const [revisions, setRevisions] = useState(initialRevisions);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<EditorField, FieldMessageKey>>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [conflict, setConflict] = useState<{ translation: TranslationEditorState; documentVersion: number } | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [busyRevision, setBusyRevision] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [picker, setPicker] = useState<'cover' | 'inline' | null>(null);
  const imageResolver = useRef<((value: ImageAttributes | null) => void) | null>(null);

  // Source of truth for async work: latest local values and the versions we last wrote.
  const latest = useRef<LatestValues>({ fields, shared, sharedSeq: 0, sharedSavedSeq: 0, slugTouched: false });
  const versionRef = useRef(initialTranslation.version);
  const documentVersionRef = useRef(initialState.document.version);
  const saveChain = useRef<Promise<boolean>>(Promise.resolve(true));

  const archived = Boolean(docState.document.archivedAt);
  const readOnly = archived;
  const dirty = isDirty(machine) || machine.status === 'conflict';
  const live = isLive(translation.state);
  const everPublished = Boolean(translation.published) || Boolean(initialTranslation.published);
  // Canonical public URL of this document (game section for game posts and manual articles).
  const livePath = (slug: string) =>
    mode === 'page' && pageKey
      ? `/${contentLocale}/${pageKey}`
      : mode === 'manual' && docState.document.game
        ? `/${contentLocale}${gamePath(gameRouteFromDb(docState.document.game), 'field-manual', slug)}`
        : `/${contentLocale}${canonicalNewsPath(docState.document.game, slug)}`;
  const publicPath = mode === 'page' && pageKey ? livePath(pageKey) : translation.liveSlug ? livePath(translation.liveSlug) : null;
  const previewHref = (revisionId?: string) =>
    `/${uiLocale}${basePath}/${documentId}/preview?lang=${contentLocale}${revisionId ? `&revision=${revisionId}` : ''}`;

  /* ------------------------------------------------------------ editing */

  const change = (patch: Partial<EditorFields>) => {
    latest.current.fields = { ...latest.current.fields, ...patch };
    setFields(latest.current.fields);
    setFieldErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch)) delete next[key as EditorField];
      return next;
    });
    dispatch({ type: 'edit' });
  };

  const changeShared = (patch: Partial<SharedFields>) => {
    latest.current.shared = { ...latest.current.shared, ...patch };
    latest.current.sharedSeq += 1;
    setShared(latest.current.shared);
    setFieldErrors((current) => ({ ...current, taxonomy: undefined }));
    dispatch({ type: 'edit' });
  };

  const changeTitle = (title: string) => {
    const previous = latest.current.fields;
    const slug =
      editorial
        ? suggestedSlug({ previousTitle: previous.title, nextTitle: title, slug: previous.slug, everPublished, slugTouched: latest.current.slugTouched })
        : null;
    change(slug ? { title, slug } : { title });
  };

  /* ---------------------------------------------------------- server io */

  const refreshRevisions = useCallback(async () => {
    const result = await listRevisionsAction({ translationId: initialTranslation.id }).catch(() => null);
    if (result?.ok) setRevisions(result.data);
  }, [initialTranslation.id]);

  /** Refreshes displayed state only; never adopts versions (that could hide another editor's changes). */
  const refreshMeta = useCallback(async () => {
    const result = await getEditorStateAction({ documentId }).catch(() => null);
    if (result?.ok) setDocState(result.data);
    return result?.ok ? result.data : null;
  }, [documentId]);

  const loadConflict = useCallback(async () => {
    const state = await refreshMeta();
    const server = state?.translations[contentLocale];
    if (state && server) setConflict({ translation: server, documentVersion: state.document.version });
  }, [contentLocale, refreshMeta]);

  const performSave = useCallback(
    async (kind: SaveKind, options: { overwrite?: boolean } = {}): Promise<boolean> => {
      const current = machineRef.current;
      if (current.status === 'conflict' && !options.overwrite) return false;
      if (kind === 'autosave' && !canAutosave(current)) return !isDirty(current);
      if (!isDirty(current) && !options.overwrite && !sharedPending(latest.current)) return true;
      const snapshot = latest.current.fields;
      const local = localDraftErrors(snapshot);
      if (local) {
        dispatch({ type: 'invalid', error: { code: 'validation', fieldErrors: local } });
        setFieldErrors(groupFieldErrors(local));
        return false;
      }
      const includeShared = editorial && sharedPending(latest.current);
      const sharedSeqAtSend = latest.current.sharedSeq;
      dispatch({ type: 'start', kind });
      const result = await saveDraftAction({
        translationId: initialTranslation.id,
        expectedVersion: versionRef.current,
        kind,
        fields: {
          title: snapshot.title,
          slug: snapshot.slug,
          excerpt: snapshot.excerpt,
          body: plainJson(snapshot.body),
          cover: snapshot.cover,
          authorLabel: snapshot.authorLabel,
          seoTitle: snapshot.seoTitle,
          seoDescription: snapshot.seoDescription,
        },
        shared: includeShared
          ? {
              expectedDocumentVersion: documentVersionRef.current,
              categoryKey: latest.current.shared.categoryKey,
              tagKeys: latest.current.shared.tagKeys,
              game: latest.current.shared.game,
            }
          : undefined,
      }).catch(() => ({ ok: false as const, code: 'unavailable' as const, fieldErrors: undefined }));

      if (result.ok) {
        versionRef.current = result.data.version;
        if (includeShared) {
          documentVersionRef.current = result.data.documentVersion;
          latest.current.sharedSavedSeq = sharedSeqAtSend;
        }
        dispatch({ type: 'success', savedAt: new Date(result.data.savedAt).toISOString() });
        setFieldErrors({});
        setConflict(null);
        if (result.data.changed) {
          void refreshMeta();
          if (kind === 'save') void refreshRevisions();
        }
        return true;
      }
      if (result.code === 'conflict') {
        dispatch({ type: 'conflict' });
        void loadConflict();
        return false;
      }
      dispatch({ type: 'failure', error: { code: result.code, fieldErrors: result.fieldErrors } });
      setFieldErrors(groupFieldErrors(result.fieldErrors));
      return false;
    },
    [initialTranslation.id, editorial, dispatch, machineRef, refreshMeta, refreshRevisions, loadConflict],
  );

  /** Serializes saves so each one sends the version produced by the previous one. */
  const save = useCallback(
    (kind: SaveKind, options: { overwrite?: boolean } = {}) => {
      const next = saveChain.current.then(
        () => performSave(kind, options),
        () => performSave(kind, options),
      );
      saveChain.current = next.catch(() => false);
      return next;
    },
    [performSave],
  );

  // Debounced autosave: every edit restarts the idle timer; conflicts/failures pause it.
  useEffect(() => {
    if (readOnly || !canAutosave(machine)) return;
    const timer = setTimeout(() => void save('autosave'), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [machine, readOnly, save]);

  const onSaveRequest = useCallback(() => save('save'), [save]);
  useUnsavedChangesGuard(dirty, { onSaveRequest });

  /** Replaces local fields with the server's latest draft (discarding unsent edits). */
  const reloadLatest = async () => {
    setBusy('reload');
    const state = await refreshMeta();
    const server = state?.translations[contentLocale];
    setBusy(null);
    if (!state || !server) {
      setNotice({ kind: 'error', title: t('notices.reloadFailed') });
      return;
    }
    latest.current = { fields: fieldsFrom(server), shared: sharedFrom(state.document), sharedSeq: 0, sharedSavedSeq: 0, slugTouched: false };
    setFields(latest.current.fields);
    setShared(latest.current.shared);
    versionRef.current = server.version;
    documentVersionRef.current = state.document.version;
    setEditorKey((key) => key + 1);
    setConflict(null);
    setFieldErrors({});
    dispatch({ type: 'reset', savedAt: server.draft ? new Date(server.draft.createdAt).toISOString() : null });
    void refreshRevisions();
  };

  const overwrite = async () => {
    if (!conflict) return;
    versionRef.current = conflict.translation.version;
    if (sharedPending(latest.current)) documentVersionRef.current = conflict.documentVersion;
    setConfirm(null);
    const ok = await save('save', { overwrite: true });
    if (ok) setNotice({ kind: 'success', title: t('notices.overwritten', { locale: contentLocale }) });
  };

  /** Saves pending edits first so publication/scheduling always act on what the author sees. */
  const ensureSaved = async (): Promise<boolean> => {
    if (!isDirty(machineRef.current) && !sharedPending(latest.current) && machineRef.current.status !== 'conflict') return true;
    return save('save');
  };

  const failureNotice = (code: string, fieldErrorMap?: Record<string, string>, title?: string) => {
    if (fieldErrorMap) setFieldErrors(groupFieldErrors(fieldErrorMap));
    setNotice({ kind: 'error', title: title ?? t('notices.actionFailed'), body: tErrors(code as 'unexpected'), testId: 'editor-action-error' });
  };

  const publish = async () => {
    setNotice(null);
    setBusy('publish');
    try {
      if (!(await ensureSaved())) return;
      const result = await publishTranslationAction({ translationId: initialTranslation.id, expectedVersion: versionRef.current });
      if (result.ok) {
        versionRef.current = result.data.version;
        setFieldErrors({});
        const path = livePath(result.data.slug ?? '');
        setNotice({
          kind: 'success',
          title: t('notices.published', { locale: contentLocale }),
          body: (
            <a className={styles.textLink} href={path} target="_blank" rel="noopener" data-testid="published-link">
              {t('notices.openLive', { path })}
            </a>
          ),
          testId: 'editor-published',
        });
        await refreshMeta();
        void refreshRevisions();
      } else if (result.code === 'conflict') {
        dispatch({ type: 'conflict' });
        void loadConflict();
      } else {
        failureNotice(result.code, result.fieldErrors, t('notices.publishFailed', { locale: contentLocale }));
      }
    } finally {
      setBusy(null);
    }
  };

  const unpublish = async () => {
    setBusy('unpublish');
    const result = await unpublishTranslationAction({ translationId: initialTranslation.id, expectedVersion: versionRef.current }).catch(() => null);
    setBusy(null);
    setConfirm(null);
    if (result?.ok) {
      versionRef.current = result.data.version;
      setNotice({ kind: 'success', title: t('notices.unpublished', { locale: contentLocale }) });
      await refreshMeta();
    } else if (result?.code === 'conflict') {
      dispatch({ type: 'conflict' });
      void loadConflict();
    } else failureNotice(result?.code ?? 'unavailable');
  };

  const schedule = async (dueAt: DueAtInput) => {
    setNotice(null);
    setBusy('schedule');
    try {
      if (!(await ensureSaved())) return;
      const result = await scheduleTranslationAction({ translationId: initialTranslation.id, expectedVersion: versionRef.current, dueAt });
      if (result.ok) {
        setFieldErrors({});
        setNotice({
          kind: 'success',
          title: t('notices.scheduled', { locale: contentLocale }),
          body: formatDate(result.data.dueAt, uiLocale, 'dateTimeZone', result.data.timeZone),
          testId: 'editor-scheduled',
        });
        await refreshMeta();
        void refreshRevisions();
      } else if (result.code === 'conflict') {
        failureNotice('conflict');
        void refreshMeta();
      } else failureNotice(result.code, result.fieldErrors, t('notices.scheduleFailed', { locale: contentLocale }));
    } finally {
      setBusy(null);
    }
  };

  const cancelSchedule = async (target: ScheduleDTO) => {
    setBusy('cancel');
    const result = await cancelScheduleAction({ scheduleId: target.id }).catch(() => null);
    setBusy(null);
    setConfirm(null);
    if (result?.ok) {
      setNotice({ kind: 'success', title: t('notices.scheduleCancelled', { locale: contentLocale }), testId: 'editor-schedule-cancelled' });
      await refreshMeta();
      void refreshRevisions();
    } else failureNotice(result?.code ?? 'unavailable');
  };

  const reapprove = async (target: ScheduleDTO) => {
    setBusy('reapprove');
    const result = await reapproveScheduleAction({ scheduleId: target.id }).catch(() => null);
    setBusy(null);
    if (result?.ok) {
      setNotice({ kind: 'success', title: t('notices.reapproved', { locale: contentLocale }) });
      await refreshMeta();
    } else failureNotice(result?.code ?? 'unavailable', result?.fieldErrors);
  };

  const restore = async (revision: RevisionSummary) => {
    setBusy('restore');
    setBusyRevision(revision.id);
    const result = await restoreRevisionAction({ translationId: initialTranslation.id, expectedVersion: versionRef.current, revisionId: revision.id }).catch(() => null);
    setConfirm(null);
    setBusyRevision(null);
    setBusy(null);
    if (result?.ok) {
      await reloadLatest();
      setNotice({ kind: 'success', title: t('notices.restored', { locale: contentLocale }), testId: 'editor-restored' });
    } else if (result?.code === 'conflict') {
      dispatch({ type: 'conflict' });
      void loadConflict();
    } else failureNotice(result?.code ?? 'unavailable');
  };

  const archive = async () => {
    setBusy('archive');
    const result = await archiveDocumentAction({ documentId, expectedDocumentVersion: documentVersionRef.current }).catch(() => null);
    setBusy(null);
    setConfirm(null);
    if (result?.ok) {
      documentVersionRef.current = result.data.version;
      setNotice({ kind: 'success', title: t('notices.archived') });
      await refreshMeta();
    } else failureNotice(result?.code ?? 'unavailable');
  };

  const unarchive = async () => {
    setBusy('unarchive');
    const result = await unarchiveDocumentAction({ documentId, expectedDocumentVersion: documentVersionRef.current }).catch(() => null);
    setBusy(null);
    if (result?.ok) {
      documentVersionRef.current = result.data.version;
      setNotice({ kind: 'success', title: t('notices.unarchived') });
      await refreshMeta();
    } else failureNotice(result?.code ?? 'unavailable');
  };

  const addTranslation = (locale: ContentLocale) => {
    guard.confirmNavigation(() => {
      void (async () => {
        setBusy('translation');
        const result = await addTranslationAction({ documentId, locale, ...(mode === 'page' && pageKey ? { slug: pageKey } : {}) }).catch(() => null);
        setBusy(null);
        if (result?.ok || result?.code === 'conflict') {
          router.push(`${basePath}/${documentId}?lang=${locale}`);
          router.refresh();
        } else failureNotice(result?.code ?? 'unavailable');
      })();
    });
  };

  /* ------------------------------------------------------------- images */

  const requestImage = useCallback(
    () =>
      new Promise<ImageAttributes | null>((resolve) => {
        imageResolver.current = resolve;
        setPicker('inline');
      }),
    [],
  );

  const onPicked = (asset: MediaPickerSelection) => {
    if (picker === 'inline') {
      imageResolver.current?.({ assetId: asset.assetId, alt: asset.alt, caption: asset.caption, decorative: asset.decorative === true, align: 'center' });
      imageResolver.current = null;
    } else {
      change({ cover: { assetId: asset.assetId, alt: asset.alt, caption: asset.caption, decorative: asset.decorative === true } });
    }
    setPicker(null);
  };

  const closePicker = () => {
    imageResolver.current?.(null);
    imageResolver.current = null;
    setPicker(null);
  };

  /* ------------------------------------------------------------- render */

  const saveStatus = (() => {
    const time = machine.lastSavedAt ? formatDate(machine.lastSavedAt, uiLocale, 'time') : null;
    switch (machine.status) {
      case 'dirty':
        return t('save.dirty');
      case 'saving':
        return t('save.saving');
      case 'saved':
        return t('save.saved', { time: time ?? '' });
      case 'failed':
        return t('save.failed');
      case 'conflict':
        return t('save.conflict');
      case 'invalid':
        return t('save.invalid');
      default:
        return translation.draft ? t('save.clean', { time: formatDate(translation.draft.createdAt, uiLocale, 'dateTime') }) : t('save.cleanNew');
    }
  })();

  const status = translationStatus(translation);
  const errorFor = (field: EditorField) => (fieldErrors[field] ? tField(fieldErrors[field]!) : null);
  const coverAltMissing = fields.cover && !fields.cover.decorative && fields.cover.alt.trim() === '';
  const categoryOptions = [{ value: '', label: t('taxonomy.noCategory') }, ...taxonomy.categories.map((term) => ({ value: term.key, label: uiLocale === 'cs' ? term.labelCs : term.labelEn }))];

  const confirmDialog = (() => {
    if (!confirm) return null;
    switch (confirm.kind) {
      case 'unpublish':
        return (
          <ConfirmDialog open title={t('confirm.unpublishTitle', { locale: contentLocale })} description={t('confirm.unpublishBody', { locale: contentLocale })} confirmLabel={t('actions.unpublish', { locale: contentLocale })} pending={busy === 'unpublish'} onConfirm={() => void unpublish()} onCancel={() => setConfirm(null)} />
        );
      case 'cancelSchedule':
        return (
          <ConfirmDialog
            open
            title={t('confirm.cancelScheduleTitle', { locale: contentLocale })}
            description={t('confirm.cancelScheduleBody', { locale: contentLocale })}
            confirmLabel={t('confirm.cancelScheduleConfirm')}
            pending={busy === 'cancel'}
            onConfirm={() => void cancelSchedule(confirm.schedule)}
            onCancel={() => setConfirm(null)}
          />
        );
      case 'restore':
        return (
          <ConfirmDialog
            open
            intent="primary"
            title={t('confirm.restoreTitle', { locale: contentLocale })}
            description={t('confirm.restoreBody', { time: formatDate(confirm.revision.createdAt, uiLocale, 'dateTime'), author: confirm.revision.createdByLabel || '—' })}
            confirmLabel={t('confirm.restoreConfirm')}
            pending={busy === 'restore'}
            onConfirm={() => void restore(confirm.revision)}
            onCancel={() => setConfirm(null)}
          >
            {dirty ? <p style={{ margin: 0 }}>{t('confirm.restoreDiscards')}</p> : null}
          </ConfirmDialog>
        );
      case 'archive':
        return <ConfirmDialog open title={t('confirm.archiveTitle')} description={t('confirm.archiveBody')} confirmLabel={t('actions.archive')} pending={busy === 'archive'} onConfirm={() => void archive()} onCancel={() => setConfirm(null)} />;
      case 'overwrite':
        return (
          <ConfirmDialog open title={t('confirm.overwriteTitle', { locale: contentLocale })} description={t('confirm.overwriteBody')} confirmLabel={t('conflict.overwrite')} onConfirm={() => void overwrite()} onCancel={() => setConfirm(null)} />
        );
      default:
        return null;
    }
  })();

  return (
    <div className={styles.stack} data-testid="news-editor" data-content-locale={contentLocale} data-mode={mode}>
      <div className={styles.localeBar}>
        <span className={styles.localeFact} data-testid="ui-locale">
          {tCommon('uiLanguage')}: <strong>{tLang(uiLocale)}</strong>
        </span>
        <span className={styles.localeFact} data-emphasis="" data-testid="content-locale">
          {tCommon('contentLanguage')}:{' '}
          <strong lang={contentLocale}>
            {tLang(contentLocale)} ({contentLocale.toUpperCase()})
          </strong>
        </span>
      </div>

      <nav aria-label={t('tabs.label')}>
        <ul className={styles.contentTabs}>
          {LOCALES.map((locale) => {
            const entry = docState.translations[locale];
            const view = translationStatus(entry);
            return (
              <li key={locale}>
                {entry ? (
                  <GuardedLink className={styles.contentTab} href={`${basePath}/${documentId}?lang=${locale}`} aria-current={locale === contentLocale ? 'page' : undefined} data-testid={`content-tab-${locale}`}>
                    <span className={styles.contentTabName}>
                      {tLang(locale)} ({locale.toUpperCase()})
                    </span>
                    <span className={styles.row}>
                      <StatusBadge kind={view.kind}>{tState(view.key)}</StatusBadge>
                      {view.warning ? <span className={styles.warning}>{tWarn(view.warning)}</span> : null}
                    </span>
                  </GuardedLink>
                ) : (
                  <div className={styles.addTranslation}>
                    <GameButton intent="secondary" onClick={() => addTranslation(locale)} pending={busy === 'translation'} pendingLabel={tCommon('working')} data-testid={`add-translation-${locale}`}>
                      {t('tabs.add', { locale })}
                    </GameButton>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      {!docState.translations[contentLocale === 'cs' ? 'en' : 'cs'] ? (
        <p className={`${styles.small} ${styles.muted}`} style={{ margin: '-8px 0 0' }}>
          {t('tabs.addHint')}
        </p>
      ) : null}

      {archived ? (
        <FeedbackNotice
          kind="warning"
          title={t('archived.title')}
          live={false}
          action={
            canPublish ? (
              <GameButton size="sm" onClick={() => void unarchive()} pending={busy === 'unarchive'} pendingLabel={tCommon('working')} data-testid="editor-unarchive">
                {t('actions.unarchive')}
              </GameButton>
            ) : null
          }
        >
          {t('archived.body')}
        </FeedbackNotice>
      ) : null}

      {machine.status === 'conflict' ? (
        <div data-testid="conflict-notice">
          <FeedbackNotice kind="error" title={t('conflict.title', { locale: contentLocale })}>
            <p>{t('conflict.body')}</p>
            {conflict ? (
              <p data-testid="conflict-server">
                {t('conflict.server', {
                  author: conflict.translation.draft?.createdByLabel || '—',
                  time: conflict.translation.draft ? formatDate(conflict.translation.draft.createdAt, uiLocale, 'dateTime') : '—',
                  title: conflict.translation.draft?.title || '—',
                })}
              </p>
            ) : null}
            <div className={styles.buttonRow}>
              <GameButton size="sm" intent="secondary" onClick={() => void reloadLatest()} pending={busy === 'reload'} pendingLabel={tCommon('working')} data-testid="conflict-reload">
                {t('conflict.reload')}
              </GameButton>
              {conflict?.translation.draft ? (
                <a className={styles.inlineButton} href={previewHref(conflict.translation.draft.id)} target="_blank" rel="noopener">
                  {t('conflict.review')}
                </a>
              ) : null}
              <GameButton size="sm" intent="danger" onClick={() => setConfirm({ kind: 'overwrite' })} disabled={!conflict} data-testid="conflict-overwrite">
                {t('conflict.overwrite')}
              </GameButton>
            </div>
          </FeedbackNotice>
        </div>
      ) : null}

      {machine.status === 'failed' && machine.error ? (
        <div data-testid="save-failed-notice" data-error-code={machine.error.code}>
          <FeedbackNotice
            kind="error"
            title={t('save.failed')}
            action={
              <GameButton size="sm" onClick={() => void save('save')} data-testid="save-retry">
                {t('save.retry')}
              </GameButton>
            }
          >
            <p>{tErrors(machine.error.code as 'unexpected')}</p>
            <p>{t('save.keptInMemory')}</p>
          </FeedbackNotice>
        </div>
      ) : null}

      {notice ? (
        <div data-testid={notice.testId ?? 'editor-notice'}>
          <FeedbackNotice kind={notice.kind} title={notice.title}>
            {notice.body}
          </FeedbackNotice>
        </div>
      ) : null}

      <div className={styles.editorGrid}>
        <div className={styles.editorMain}>
          <div className={styles.titleField}>
            <label htmlFor="editor-title">
              {t('fields.title')} <span className={styles.muted}>({tLang(contentLocale)})</span>
            </label>
            <input
              id="editor-title"
              className={styles.titleInput}
              value={fields.title}
              lang={contentLocale}
              maxLength={200}
              placeholder={t('fields.titlePlaceholder')}
              disabled={readOnly}
              aria-invalid={fieldErrors.title ? true : undefined}
              aria-describedby={fieldErrors.title ? 'editor-title-error' : undefined}
              onChange={(event) => changeTitle(event.target.value)}
              data-testid="editor-title"
            />
            <FieldError id="editor-title-error">{errorFor('title')}</FieldError>
          </div>

          <div className={styles.canvasBlock} data-invalid={fieldErrors.body ? '' : undefined}>
            <span id={bodyLabelId} className={styles.canvasLabel}>
              {t('fields.body', { locale: contentLocale })}
            </span>
            <FieldError id="editor-body-error">{errorFor('body')}</FieldError>
            <RichTextEditor
              key={editorKey}
              initialContent={fields.body}
              contentLocale={contentLocale}
              labelledBy={bodyLabelId}
              readOnly={readOnly}
              onRequestImage={requestImage}
              onChange={(doc: JSONContent) => change({ body: doc })}
            />
          </div>

          <div className={styles.bottomBar} data-testid="editor-actions">
            <p className={styles.saveState} role="status" aria-live="polite" data-save-state={machine.status} data-testid="save-state">
              {saveStatus}
            </p>
            <div className={styles.buttonRow}>
              <GameButton intent="secondary" onClick={() => void save('save')} disabled={readOnly || busy !== null} pending={machine.inFlight?.kind === 'save'} pendingLabel={t('save.saving')} data-testid="editor-save">
                {t('actions.save', { locale: contentLocale })}
              </GameButton>
              <GameButton
                intent="secondary"
                href={`${basePath}/${documentId}/preview?lang=${contentLocale}`}
                target="_blank"
                rel="noopener"
                data-testid="editor-preview"
                onClick={(event) => {
                  if (!dirty) return;
                  // Preview shows the saved draft: save first, then open the prepared tab.
                  event.preventDefault();
                  const popup = window.open('about:blank', '_blank');
                  void save('save').then((ok) => {
                    if (ok && popup) popup.location.href = previewHref();
                    else popup?.close();
                  });
                }}
              >
                {t('actions.preview', { locale: contentLocale })}
              </GameButton>
              {canPublish ? (
                <GameButton intent="primary" onClick={() => void publish()} disabled={readOnly || (busy !== null && busy !== 'publish')} pending={busy === 'publish'} pendingLabel={tCommon('working')} data-testid="editor-publish">
                  {publishIntent(translation.state) === 'update' ? t('actions.update', { locale: contentLocale }) : t('actions.publish', { locale: contentLocale })}
                </GameButton>
              ) : null}
            </div>
          </div>
        </div>

        <aside className={styles.side} aria-label={t('panel.label')} data-testid="editor-panel">
          <details className={styles.section} open>
            <summary>{t('panel.publication')}</summary>
            <div className={styles.sectionBody}>
              <div className={styles.row}>
                <StatusBadge kind={status.kind}>
                  <span data-testid="translation-state" data-state={status.key}>
                    {tState(status.key)}
                  </span>
                </StatusBadge>
                <span className={`${styles.small} ${styles.muted}`}>{tLang(contentLocale)}</span>
              </div>
              {status.warning ? <p className={status.warning === 'overdue' ? styles.warning : styles.danger}>{tWarn(status.warning)}</p> : null}
              <dl className={styles.facts}>
                <dt>{t('panel.live')}</dt>
                <dd>
                  {translation.published && publicPath ? (
                    <a className={styles.textLink} href={publicPath} target="_blank" rel="noopener" data-testid="live-link">
                      {publicPath}
                    </a>
                  ) : (
                    t('panel.notLive')
                  )}
                </dd>
                {translation.published ? (
                  <>
                    <dt>{t('panel.publishedAt')}</dt>
                    <dd>{formatDate(translation.published.publishedAt, uiLocale, 'dateTime')}</dd>
                  </>
                ) : null}
                <dt>{t('panel.changes')}</dt>
                <dd>{translation.hasUnpublishedChanges ? t('panel.hasChanges') : translation.published ? t('panel.noChanges') : t('panel.neverPublished')}</dd>
              </dl>
              {canPublish && translation.published ? (
                <GameButton intent="danger" size="sm" onClick={() => setConfirm({ kind: 'unpublish' })} disabled={busy !== null} data-testid="editor-unpublish">
                  {t('actions.unpublish', { locale: contentLocale })}
                </GameButton>
              ) : null}
              <p className={`${styles.small} ${styles.muted}`} style={{ margin: 0 }}>
                {t('panel.autosaveNote')}
              </p>
            </div>
          </details>

          {canPublish && editorial && !archived ? (
            <details className={styles.section} open data-testid="schedule-section">
              <summary>{t('panel.schedule')}</summary>
              <div className={styles.sectionBody}>
                <SchedulePanel
                  uiLocale={uiLocale}
                  contentLocale={contentLocale}
                  schedule={translation.schedule}
                  live={live}
                  disabled={busy !== null && busy !== 'schedule' && busy !== 'cancel' && busy !== 'reapprove'}
                  busy={busy === 'schedule' || busy === 'cancel' || busy === 'reapprove' ? busy : null}
                  publisherStalled={publisherStalled}
                  serverError={fieldErrors.schedule ?? null}
                  onSchedule={(dueAt) => void schedule(dueAt)}
                  onCancel={(target) => setConfirm({ kind: 'cancelSchedule', schedule: target })}
                  onReapprove={(target) => void reapprove(target)}
                />
              </div>
            </details>
          ) : null}

          <details className={styles.section} open>
            <summary>{t('panel.document')}</summary>
            <div className={styles.sectionBody}>
              {editorial ? (
                <div>
                  <TextField
                    name="slug"
                    id="editor-slug"
                    label={t('fields.slug')}
                    hint={t('fields.slugHint', { path: livePath(fields.slug || '…') })}
                    value={fields.slug}
                    maxLength={120}
                    disabled={readOnly}
                    required
                    error={errorFor('slug')}
                    onChange={(event) => {
                      latest.current.slugTouched = true;
                      change({ slug: event.target.value.toLowerCase() });
                    }}
                    data-testid="editor-slug"
                  />
                  <div className={styles.buttonRow} style={{ marginTop: 6 }}>
                    <button type="button" className={styles.inlineButton} disabled={readOnly || !slugify(fields.title)} onClick={() => change({ slug: slugify(fields.title) })}>
                      {t('fields.slugFromTitle')}
                    </button>
                  </div>
                  {translation.liveSlug && fields.slug !== translation.liveSlug ? <p className={`${styles.small} ${styles.warning}`}>{t('fields.slugRedirect', { old: translation.liveSlug })}</p> : null}
                </div>
              ) : (
                <dl className={styles.facts}>
                  <dt>{t('fields.slug')}</dt>
                  <dd>
                    /{contentLocale}/{pageKey} <span className={styles.muted}>({t('fields.slugFixed')})</span>
                  </dd>
                </dl>
              )}
              <TextArea
                name="excerpt"
                id="editor-excerpt"
                label={t('fields.excerpt')}
                hint={editorial ? t('fields.excerptHint') : t('fields.excerptHintPage')}
                rows={3}
                maxLength={600}
                value={fields.excerpt}
                disabled={readOnly}
                lang={contentLocale}
                error={errorFor('excerpt')}
                onChange={(event) => change({ excerpt: event.target.value })}
                data-testid="editor-excerpt"
              />
              <TextField
                name="authorLabel"
                id="editor-author"
                label={t('fields.author')}
                hint={t('fields.authorHint')}
                markOptional
                maxLength={120}
                value={fields.authorLabel}
                disabled={readOnly}
                error={errorFor('authorLabel')}
                onChange={(event) => change({ authorLabel: event.target.value })}
                data-testid="editor-author"
              />
            </div>
          </details>

          <details className={styles.section} open data-testid="cover-section">
            <summary>{t('panel.cover')}</summary>
            <div className={styles.sectionBody}>
              <p className={`${styles.small} ${styles.muted}`} style={{ margin: 0 }}>
                {t('cover.hint')}
              </p>
              <div className={styles.coverPreview}>
                {fields.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element -- authorized private thumbnail
                  <img src={`/api/media/${fields.cover.assetId}/thumb`} alt="" data-testid="cover-thumb" />
                ) : (
                  <div className={styles.coverEmpty}>{t('cover.none')}</div>
                )}
              </div>
              <div className={styles.buttonRow}>
                <GameButton size="sm" intent="secondary" onClick={() => setPicker('cover')} disabled={readOnly} data-testid="cover-choose">
                  {fields.cover ? t('cover.change') : t('cover.choose')}
                </GameButton>
                {fields.cover ? (
                  <GameButton size="sm" intent="ghost" onClick={() => change({ cover: null })} disabled={readOnly} data-testid="cover-remove">
                    {t('cover.remove')}
                  </GameButton>
                ) : null}
              </div>
              {fields.cover ? (
                <>
                  <TextField
                    name="coverAlt"
                    id="editor-cover-alt"
                    label={t('cover.alt', { locale: contentLocale })}
                    value={fields.cover.alt}
                    disabled={readOnly || fields.cover.decorative}
                    maxLength={300}
                    lang={contentLocale}
                    required={!fields.cover.decorative}
                    error={errorFor('cover') ?? (coverAltMissing ? tField('coverAltRequired') : null)}
                    onChange={(event) => change({ cover: { ...fields.cover!, alt: event.target.value } })}
                    data-testid="cover-alt"
                  />
                  <Checkbox
                    name="coverDecorative"
                    id="editor-cover-decorative"
                    label={t('cover.decorative')}
                    checked={fields.cover.decorative}
                    disabled={readOnly}
                    onChange={(event) => change({ cover: { ...fields.cover!, decorative: event.target.checked, alt: event.target.checked ? '' : fields.cover!.alt } })}
                  />
                  <TextField
                    name="coverCaption"
                    id="editor-cover-caption"
                    label={t('cover.caption', { locale: contentLocale })}
                    markOptional
                    value={fields.cover.caption}
                    disabled={readOnly}
                    maxLength={500}
                    lang={contentLocale}
                    onChange={(event) => change({ cover: { ...fields.cover!, caption: event.target.value } })}
                  />
                </>
              ) : null}
            </div>
          </details>

          {editorial ? (
            <details className={styles.section} open data-testid="taxonomy-section">
              <summary>{t('panel.taxonomy')}</summary>
              <div className={styles.sectionBody}>
                <FeedbackNotice kind="info" live={false}>
                  {t('taxonomy.shared')}
                </FeedbackNotice>
                <Select
                  name="category"
                  id="editor-category"
                  label={t('taxonomy.category')}
                  value={shared.categoryKey ?? ''}
                  options={categoryOptions}
                  disabled={readOnly}
                  error={errorFor('taxonomy')}
                  onChange={(event) => changeShared({ categoryKey: event.target.value || null })}
                  data-testid="editor-category"
                />
                <fieldset className={styles.stack} style={{ border: 0, margin: 0, padding: 0, gap: 0 }}>
                  <legend style={{ fontWeight: 500, marginBottom: 6 }}>{t('taxonomy.tags')}</legend>
                  {taxonomy.tags.length === 0 ? <p className={`${styles.small} ${styles.muted}`}>{t('taxonomy.noTags')}</p> : null}
                  <div className={styles.tagGrid}>
                    {taxonomy.tags.map((term) => (
                      <Checkbox
                        key={term.key}
                        name="tags"
                        id={`editor-tag-${term.key}`}
                        label={uiLocale === 'cs' ? term.labelCs : term.labelEn}
                        checked={shared.tagKeys.includes(term.key)}
                        disabled={readOnly}
                        onChange={(event) =>
                          changeShared({ tagKeys: event.target.checked ? [...shared.tagKeys, term.key] : shared.tagKeys.filter((key) => key !== term.key) })
                        }
                      />
                    ))}
                  </div>
                </fieldset>
                <Select
                  name="game"
                  id="editor-game"
                  label={t('taxonomy.game')}
                  value={shared.game ?? ''}
                  options={
                    mode === 'manual'
                      ? MANUAL_GAMES.map((game) => ({ value: game, label: tGames(game) }))
                      : [{ value: '', label: t('taxonomy.noGame') }, ...GAMES.map((game) => ({ value: game, label: tGames(game) }))]
                  }
                  disabled={readOnly}
                  onChange={(event) => changeShared({ game: (event.target.value || null) as Game | null })}
                />
              </div>
            </details>
          ) : null}

          <details className={styles.section}>
            <summary>{t('panel.seo')}</summary>
            <div className={styles.sectionBody}>
              <TextField
                name="seoTitle"
                id="editor-seo-title"
                label={t('fields.seoTitle')}
                hint={t('fields.seoTitleHint')}
                markOptional
                maxLength={120}
                value={fields.seoTitle}
                disabled={readOnly}
                lang={contentLocale}
                error={errorFor('seoTitle')}
                onChange={(event) => change({ seoTitle: event.target.value })}
              />
              <span className={styles.counter}>{t('fields.counter', { count: fields.seoTitle.length, max: 120 })}</span>
              <TextArea
                name="seoDescription"
                id="editor-seo-description"
                label={t('fields.seoDescription')}
                markOptional
                rows={3}
                maxLength={320}
                value={fields.seoDescription}
                disabled={readOnly}
                lang={contentLocale}
                error={errorFor('seoDescription')}
                onChange={(event) => change({ seoDescription: event.target.value })}
              />
              <span className={styles.counter}>{t('fields.counter', { count: fields.seoDescription.length, max: 320 })}</span>
            </div>
          </details>

          <details
            className={styles.section}
            data-testid="revisions-section"
            onToggle={(event) => {
              if ((event.currentTarget as HTMLDetailsElement).open) void refreshRevisions();
            }}
          >
            <summary>{t('panel.revisions')}</summary>
            <div className={styles.sectionBody}>
              <RevisionHistory
                revisions={revisions}
                uiLocale={uiLocale}
                contentLocale={contentLocale}
                previewHref={(revisionId) => previewHref(revisionId)}
                disabled={readOnly || busy !== null}
                busyRevisionId={busyRevision}
                onRestore={(revision) => setConfirm({ kind: 'restore', revision })}
              />
            </div>
          </details>

          {editorial && canPublish && !archived ? (
            <details className={styles.section}>
              <summary>{t('panel.danger')}</summary>
              <div className={styles.sectionBody}>
                <p className={`${styles.small} ${styles.muted}`} style={{ margin: 0 }}>
                  {t('archive.hint')}
                </p>
                <GameButton intent="danger" size="sm" onClick={() => setConfirm({ kind: 'archive' })} disabled={busy !== null} data-testid="editor-archive">
                  {t('actions.archive')}
                </GameButton>
              </div>
            </details>
          ) : null}
        </aside>
      </div>

      <MediaPicker
        open={picker !== null}
        scope="editorial"
        locale={contentLocale}
        title={picker === 'cover' ? t('cover.pickerTitle') : t('images.pickerTitle')}
        onSelect={onPicked}
        onClose={closePicker}
      />
      {confirmDialog}
    </div>
  );
}
