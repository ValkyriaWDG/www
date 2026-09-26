import type { JSONContent } from '@tiptap/core';
import type { CoverSnapshot, Game } from '@valkyria/db';
import { parseRichTextDocument } from '@/modules/content/rich-text/schema';
import { SLUG_PATTERN, slugify } from '@/modules/content/slug';
import type { DocumentSharedState, TranslationEditorState } from '@/modules/content/types';

/** Translation-local fields edited in the visual editor (one content language only). */
export type EditorFields = {
  title: string;
  slug: string;
  excerpt: string;
  body: JSONContent;
  cover: CoverSnapshot | null;
  authorLabel: string;
  seoTitle: string;
  seoDescription: string;
};

/** Document-wide fields shared by both languages (own optimistic version). */
export type SharedFields = { categoryKey: string | null; tagKeys: string[]; game: Game | null };

const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

export function fieldsFrom(translation: TranslationEditorState | undefined | null): EditorFields {
  const draft = translation?.draft;
  return {
    title: draft?.title ?? '',
    slug: draft?.slug ?? translation?.draftSlug ?? '',
    excerpt: draft?.excerpt ?? '',
    body: (draft?.body as JSONContent | undefined) ?? EMPTY_DOC,
    cover: draft?.cover ?? null,
    authorLabel: draft?.authorLabel ?? '',
    seoTitle: draft?.seoTitle ?? '',
    seoDescription: draft?.seoDescription ?? '',
  };
}

export function sharedFrom(document: DocumentSharedState): SharedFields {
  return { categoryKey: document.categoryKey, tagKeys: [...document.tagKeys], game: document.game };
}

/**
 * Local checks that would make any draft save fail (the server validates again): slug
 * syntax and the rich-text contract (e.g. an image without alternative text). Returns
 * server-shaped field errors so the same message mapping applies.
 */
export function localDraftErrors(fields: EditorFields): Record<string, string> | null {
  const errors: Record<string, string> = {};
  if (!SLUG_PATTERN.test(fields.slug) || fields.slug.length > 120) errors.slug = 'invalid';
  const parsed = parseRichTextDocument(fields.body);
  if (!parsed.ok) errors.body = parsed.issues.slice(0, 3).join('; ');
  return Object.keys(errors).length > 0 ? errors : null;
}

const GENERATED_SLUG = /^(draft|post)-[0-9a-f]{8}(-\d+)?$/;

/**
 * WordPress-like slug suggestion: while a translation has never been published and the
 * author has not edited the slug, it follows the title (Czech diacritics transliterated).
 */
export function suggestedSlug(params: { previousTitle: string; nextTitle: string; slug: string; everPublished: boolean; slugTouched: boolean }): string | null {
  if (params.everPublished || params.slugTouched) return null;
  const follows = params.slug === slugify(params.previousTitle) || GENERATED_SLUG.test(params.slug) || params.slug === '';
  if (!follows) return null;
  const next = slugify(params.nextTitle);
  return next && next !== params.slug ? next : null;
}
