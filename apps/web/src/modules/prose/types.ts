import type { CoverSnapshot, Locale, RevisionKind, RichTextDocument } from '@valkyria/db';
import type { PublicImage } from './assets';

/** The single owner of a localized prose record (member biography or match recap). */
export type ProseOwner = { kind: 'member'; id: string } | { kind: 'match'; id: string };
export type ProseOwnerKind = ProseOwner['kind'];

/**
 * Public localized prose for one requested locale: the published revision of exactly that
 * locale, or an explicit absence listing locales that do have a published version. Never
 * a draft and never another locale's text presented as this one.
 */
export type LocalizedProse =
  | {
      state: 'published';
      locale: Locale;
      body: RichTextDocument;
      cover: CoverSnapshot | null;
      /** Delivery metadata for every ready asset referenced by body/cover. */
      assets: PublicImage[];
      publishedAt: string;
    }
  | { state: 'missing'; availableIn: Locale[] };

/** Compact per-locale state for admin lists. */
export type ProseStatus = 'none' | 'draft' | 'published' | 'published_with_changes';

export type ProseRevisionSummary = {
  id: string;
  kind: RevisionKind;
  createdAt: string;
  createdByLabel: string;
  isDraft: boolean;
  isPublished: boolean;
};

/** Admin view of one locale: independent draft and live revisions plus the edit version. */
export type ProseAdminDetail = {
  locale: Locale;
  status: ProseStatus;
  /** `0` when no translation exists yet (pass as `expectedVersion` for the first save). */
  version: number;
  translationId: string | null;
  draft: { revisionId: string; body: RichTextDocument; cover: CoverSnapshot | null; createdAt: string; createdByLabel: string } | null;
  published: { revisionId: string; publishedAt: string } | null;
};

export type ProseMutationResult = { translationId: string; locale: Locale; version: number; revisionId: string | null };
