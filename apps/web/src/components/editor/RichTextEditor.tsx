'use client';

import type { JSONContent } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { EditorContent, ReactNodeViewRenderer, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { buildEditorExtensions, isAllowedLinkHref, type ImageAttributes } from './extensions';
import { ImageNodeView } from './ImageNodeView';
import { ToolIcon } from './icons';
import styles from './editor.module.css';

export type RichTextEditorProps = {
  /** Initial schema-v1 document. Changing it after mount does not reset the editor; remount with a key instead. */
  initialContent: JSONContent;
  onChange: (doc: JSONContent) => void;
  /** Content translation being edited (`cs`/`en`); sets the editable region's language. */
  contentLocale: 'cs' | 'en';
  /** Opens the media picker and resolves with the chosen image, or null when cancelled. */
  onRequestImage?: () => Promise<ImageAttributes | null>;
  readOnly?: boolean;
  /** Element ID of the visible label for the writing canvas. */
  labelledBy?: string;
};

type ToolbarState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  link: boolean;
  bulletList: boolean;
  orderedList: boolean;
  blockquote: boolean;
  table: boolean;
  block: 'paragraph' | 'heading2' | 'heading3';
  canUndo: boolean;
  canRedo: boolean;
  characters: number;
  words: number;
};

function readToolbarState(editor: Editor | null): ToolbarState {
  const storage = editor?.storage as { characterCount?: { characters: () => number; words: () => number } } | undefined;
  return {
    bold: Boolean(editor?.isActive('bold')),
    italic: Boolean(editor?.isActive('italic')),
    underline: Boolean(editor?.isActive('underline')),
    strike: Boolean(editor?.isActive('strike')),
    link: Boolean(editor?.isActive('link')),
    bulletList: Boolean(editor?.isActive('bulletList')),
    orderedList: Boolean(editor?.isActive('orderedList')),
    blockquote: Boolean(editor?.isActive('blockquote')),
    table: Boolean(editor?.isActive('table')),
    block: editor?.isActive('heading', { level: 2 })
      ? 'heading2'
      : editor?.isActive('heading', { level: 3 })
        ? 'heading3'
        : 'paragraph',
    canUndo: Boolean(editor?.can().undo()),
    canRedo: Boolean(editor?.can().redo()),
    characters: storage?.characterCount?.characters() ?? 0,
    words: storage?.characterCount?.words() ?? 0,
  };
}

/**
 * WordPress-like visual editor (Tiptap/ProseMirror) producing schema-v1 JSON. Toolbar is
 * a labelled `role="toolbar"` with roving focus (arrow keys), pressed states and native
 * keyboard shortcuts (Ctrl/⌘+B/I/U, Ctrl/⌘+Shift+S/7/8/B, Ctrl/⌘+K for links, Ctrl/⌘+Z/Y).
 * Unsupported pasted markup is dropped by the schema; the server validates again.
 */
export function RichTextEditor({ initialContent, onChange, contentLocale, onRequestImage, readOnly = false, labelledBy }: RichTextEditorProps) {
  const t = useTranslations('editor');
  const canvasId = useId();
  const onChangeRef = useRef(onChange);
  const openLinkRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const extensions = useMemo(
    () =>
      buildEditorExtensions({
        placeholder: t('canvas.placeholder'),
        imageNodeView: () =>
          ReactNodeViewRenderer(ImageNodeView, {
            stopEvent: ({ event }) => {
              const target = event.target as HTMLElement | null;
              return Boolean(target?.closest('input, textarea, select, button, label'));
            },
          }),
      }),
    [t],
  );

  const editor = useEditor({
    extensions,
    content: initialContent,
    editable: !readOnly,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        id: canvasId,
        lang: contentLocale,
        role: 'textbox',
        'aria-multiline': 'true',
        ...(labelledBy ? { 'aria-labelledby': labelledBy } : { 'aria-label': t('canvas.label') }),
        class: styles.canvas ?? '',
        spellcheck: 'true',
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          openLinkRef.current();
          return true;
        }
        return false;
      },
    },
    // `useEditorState` only recomputes on transactions; an empty, history-free transaction
    // after creation makes the toolbar/word count reflect the initial content immediately.
    onCreate: ({ editor: created }) => created.view.dispatch(created.state.tr.setMeta('addToHistory', false)),
    onUpdate: ({ editor: current }) => onChangeRef.current(current.getJSON()),
  });

  const state = useEditorState({ editor, selector: ({ editor: current }) => readToolbarState(current) });
  const [linkOpen, setLinkOpen] = useState(false);
  useEffect(() => {
    openLinkRef.current = () => setLinkOpen(true);
  }, []);

  return (
    <div className={styles.editor} data-readonly={readOnly || undefined}>
      <Toolbar
        editor={editor}
        state={state ?? readToolbarState(null)}
        disabled={readOnly || !editor}
        onOpenLink={() => setLinkOpen(true)}
        onRequestImage={onRequestImage}
      />
      {linkOpen && editor ? <LinkPanel editor={editor} onClose={() => setLinkOpen(false)} /> : null}
      {state?.table && editor && !readOnly ? <TableToolbar editor={editor} /> : null}
      <EditorContent editor={editor} className={styles.canvasWrapper} />
      <p className={styles.counts} aria-live="off">
        {t('count.words', { count: state?.words ?? 0 })} · {t('count.characters', { count: state?.characters ?? 0 })}
      </p>
    </div>
  );
}

type ToolbarProps = {
  editor: Editor | null;
  state: ToolbarState;
  disabled: boolean;
  onOpenLink: () => void;
  onRequestImage?: () => Promise<ImageAttributes | null>;
};

function Toolbar({ editor, state, disabled, onOpenLink, onRequestImage }: ToolbarProps) {
  const t = useTranslations('editor.toolbar');
  const ref = useRef<HTMLDivElement>(null);
  // Per-instance id: several editors (e.g. Czech and English) can share one page.
  const blockTypeId = useId();
  const run = (command: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => {
    if (!editor) return;
    command(editor.chain().focus()).run();
  };

  // Roving tabindex: one tab stop for the whole toolbar, arrow keys move between controls.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key) || !ref.current) return;
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>('[data-toolbar-item]:not([disabled])'));
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (index < 0) return;
    event.preventDefault();
    const next =
      event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    items.forEach((item, position) => item.setAttribute('tabindex', position === next ? '0' : '-1'));
    items[next]?.focus();
  };

  const button = (name: string, label: string, pressed: boolean | undefined, onClick: () => void, shortcut?: string, isDisabled = false) => (
    <button
      key={name}
      type="button"
      data-toolbar-item=""
      tabIndex={name === 'undo' ? 0 : -1}
      className={styles.toolButton}
      aria-pressed={pressed}
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={disabled || isDisabled}
      onClick={onClick}
    >
      <ToolIcon name={name} />
    </button>
  );

  return (
    <div ref={ref} role="toolbar" aria-label={t('label')} className={styles.toolbar} onKeyDown={onKeyDown}>
      <div className={styles.toolGroup}>
        {button('undo', t('undo'), undefined, () => run((c) => c.undo()), 'Ctrl+Z', !state.canUndo)}
        {button('redo', t('redo'), undefined, () => run((c) => c.redo()), 'Ctrl+Y', !state.canRedo)}
      </div>
      <div className={styles.toolGroup}>
        <label className="visually-hidden" htmlFor={blockTypeId}>
          {t('blockType')}
        </label>
        <select
          id={blockTypeId}
          data-toolbar-item=""
          tabIndex={-1}
          className={styles.blockSelect}
          value={state.block}
          disabled={disabled}
          onChange={(event) => {
            const value = event.target.value;
            if (value === 'paragraph') run((c) => c.setParagraph());
            if (value === 'heading2') run((c) => c.setHeading({ level: 2 }));
            if (value === 'heading3') run((c) => c.setHeading({ level: 3 }));
          }}
        >
          <option value="paragraph">{t('paragraph')}</option>
          <option value="heading2">{t('heading2')}</option>
          <option value="heading3">{t('heading3')}</option>
        </select>
      </div>
      <div className={styles.toolGroup}>
        {button('bold', t('bold'), state.bold, () => run((c) => c.toggleBold()), 'Ctrl+B')}
        {button('italic', t('italic'), state.italic, () => run((c) => c.toggleItalic()), 'Ctrl+I')}
        {button('underline', t('underline'), state.underline, () => run((c) => c.toggleUnderline()), 'Ctrl+U')}
        {button('strike', t('strike'), state.strike, () => run((c) => c.toggleStrike()), 'Ctrl+Shift+S')}
        {button('clear', t('clearFormatting'), undefined, () => run((c) => c.unsetAllMarks().clearNodes()))}
      </div>
      <div className={styles.toolGroup}>
        {button('bulletList', t('bulletList'), state.bulletList, () => run((c) => c.toggleBulletList()), 'Ctrl+Shift+8')}
        {button('orderedList', t('orderedList'), state.orderedList, () => run((c) => c.toggleOrderedList()), 'Ctrl+Shift+7')}
        {button('blockquote', t('blockquote'), state.blockquote, () => run((c) => c.toggleBlockquote()), 'Ctrl+Shift+B')}
        {button('horizontalRule', t('horizontalRule'), undefined, () => run((c) => c.setHorizontalRule()))}
      </div>
      <div className={styles.toolGroup}>
        {button('link', t('link'), state.link, onOpenLink, 'Ctrl+K')}
        {button('unlink', t('unlink'), undefined, () => run((c) => c.extendMarkRange('link').unsetLink()), undefined, !state.link)}
        {button(
          'image',
          t('image'),
          undefined,
          async () => {
            if (!editor || !onRequestImage) return;
            const selection = await onRequestImage();
            if (selection) editor.chain().focus().insertLibraryImage(selection).run();
          },
          undefined,
          !onRequestImage,
        )}
        {button('table', t('table'), state.table, () => run((c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true })), undefined, state.table)}
      </div>
    </div>
  );
}

function LinkPanel({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const t = useTranslations('editor.link');
  const id = useId();
  const current = String(editor.getAttributes('link').href ?? '');
  const [href, setHref] = useState(current);
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const close = () => {
    onClose();
    editor.commands.focus();
  };
  const apply = () => {
    const value = href.trim();
    if (!isAllowedLinkHref(value)) {
      setInvalid(true);
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: value })
      // Continue after the link, not inside it: the next keystroke must neither replace the
      // still-selected linked text nor extend the (inclusive) link mark.
      .command(({ tr }) => {
        tr.setSelection(TextSelection.create(tr.doc, tr.selection.to));
        return true;
      })
      .unsetMark('link')
      .run();
    onClose();
  };

  return (
    <div
      className={styles.linkPanel}
      role="group"
      aria-labelledby={`${id}-title`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          apply();
        }
      }}
    >
      <p id={`${id}-title`} className={styles.linkTitle}>
        {t('dialogTitle')}
      </p>
      <label htmlFor={`${id}-url`}>{t('urlLabel')}</label>
      <input
        ref={inputRef}
        id={`${id}-url`}
        type="url"
        inputMode="url"
        value={href}
        aria-invalid={invalid}
        aria-describedby={`${id}-hint${invalid ? ` ${id}-error` : ''}`}
        onChange={(event) => {
          setHref(event.target.value);
          setInvalid(false);
        }}
      />
      <p id={`${id}-hint`} className={styles.hint}>
        {t('urlHint')}
      </p>
      {invalid ? (
        <p id={`${id}-error`} className={styles.fieldError} role="alert">
          {t('invalid')}
        </p>
      ) : null}
      <div className={styles.linkActions}>
        <button type="button" className={styles.primaryButton} onClick={apply}>
          {t('apply')}
        </button>
        {current ? (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => {
              editor.chain().focus().extendMarkRange('link').unsetLink().run();
              onClose();
            }}
          >
            {t('remove')}
          </button>
        ) : null}
        <button type="button" className={styles.secondaryButton} onClick={close}>
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}

function TableToolbar({ editor }: { editor: Editor }) {
  const t = useTranslations('editor.table');
  const action = (label: string, command: () => boolean) => (
    <button type="button" className={styles.tableButton} onClick={() => command()}>
      {label}
    </button>
  );
  const chain = () => editor.chain().focus();
  return (
    <div role="group" aria-label={t('menuLabel')} className={styles.tableToolbar}>
      {action(t('addRowBefore'), () => chain().addRowBefore().run())}
      {action(t('addRowAfter'), () => chain().addRowAfter().run())}
      {action(t('deleteRow'), () => chain().deleteRow().run())}
      {action(t('addColumnBefore'), () => chain().addColumnBefore().run())}
      {action(t('addColumnAfter'), () => chain().addColumnAfter().run())}
      {action(t('deleteColumn'), () => chain().deleteColumn().run())}
      {action(t('toggleHeaderRow'), () => chain().toggleHeaderRow().run())}
      {action(t('deleteTable'), () => chain().deleteTable().run())}
    </div>
  );
}
