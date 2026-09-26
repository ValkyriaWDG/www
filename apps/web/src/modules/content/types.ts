import type {
  CoverSnapshot,
  DocumentKind,
  Game,
  Locale,
  PageKey,
  RevisionKind,
  ScheduleState,
  TaxonomySnapshot,
} from '@valkyria/db';
import type { RichTextDocument } from './rich-text/schema';

/**
 * Explicit DTOs returned by the content module. Public DTOs contain only published
 * snapshot data; editor DTOs require `content.read_private`.
 */

export type TaxonomyLabel = { key: string; label: string };

/** Editable per-translation fields stored in each immutable revision. */
export type RevisionFields = {
  title: string;
  slug: string;
  excerpt: string;
  body: RichTextDocument;
  cover: CoverSnapshot | null;
  authorLabel: string;
  seoTitle: string;
  seoDescription: string;
};

export type RevisionDTO = RevisionFields & {
  id: string;
  translationId: string;
  locale: Locale;
  kind: RevisionKind;
  schemaVersion: number;
  taxonomy: TaxonomySnapshot;
  restoredFromRevisionId: string | null;
  createdByLabel: string;
  createdAt: Date;
};

export type RevisionSummary = {
  id: string;
  kind: RevisionKind;
  title: string;
  slug: string;
  createdByLabel: string;
  createdAt: Date;
  restoredFromRevisionId: string | null;
  isDraft: boolean;
  isPublished: boolean;
  isScheduled: boolean;
};

/**
 * Composite admin state of one translation. A scheduled update of a published
 * translation stays visibly published (`published_update_scheduled`).
 */
export type TranslationAdminState =
  | 'draft'
  | 'published'
  | 'published_with_changes'
  | 'scheduled'
  | 'published_update_scheduled'
  | 'archived';

export type ScheduleDTO = {
  id: string;
  translationId: string;
  locale: Locale;
  revisionId: string;
  dueAt: Date;
  timeZone: string;
  state: ScheduleState;
  issuerKind: 'discord' | 'local_admin';
  issuerLabel: string;
  attempts: number;
  /** Sanitized machine code of the last failure/block reason. */
  lastError: string | null;
  previousScheduleId: string | null;
  createdAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
  /** Due but not executed within the grace period (stalled runner or retrying). */
  overdue: boolean;
  /** Blocked or permanently failed: only a fresh approval can reactivate it. */
  needsReapproval: boolean;
};

export type PublishedSummary = {
  revisionId: string;
  title: string;
  slug: string;
  publishedAt: Date;
  firstPublishedAt: Date | null;
};

export type TranslationEditorState = {
  id: string;
  locale: Locale;
  version: number;
  draftSlug: string;
  liveSlug: string | null;
  draft: RevisionDTO | null;
  published: PublishedSummary | null;
  hasUnpublishedChanges: boolean;
  schedule: ScheduleDTO | null;
  state: TranslationAdminState;
  updatedAt: Date;
};

export type DocumentSharedState = {
  id: string;
  kind: DocumentKind;
  pageKey: PageKey | null;
  game: Game | null;
  categoryKey: string | null;
  tagKeys: string[];
  version: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DocumentEditorState = {
  document: DocumentSharedState;
  translations: Partial<Record<Locale, TranslationEditorState>>;
};

export type AdminTranslationRow = {
  translationId: string;
  locale: Locale;
  title: string;
  draftSlug: string;
  liveSlug: string | null;
  authorLabel: string;
  state: TranslationAdminState;
  schedule: { id: string; dueAt: Date; state: ScheduleState; overdue: boolean } | null;
  updatedAt: Date;
};

export type AdminDocumentRow = {
  documentId: string;
  kind: DocumentKind;
  pageKey: PageKey | null;
  categoryKey: string | null;
  game: Game | null;
  archived: boolean;
  updatedAt: Date;
  translations: Partial<Record<Locale, AdminTranslationRow>>;
};

export type Paginated<T> = { items: T[]; total: number; page: number; pageCount: number; pageSize: number };

/** Result of a successful mutation affecting one translation. */
export type TranslationMutationResult = {
  documentId: string;
  translationId: string;
  locale: Locale;
  version: number;
  revisionId: string | null;
};

export type PublishResult = TranslationMutationResult & {
  slug: string | null;
  previousSlug: string | null;
  publishedAt: Date | null;
  /** Locale-prefixed public paths whose rendering/metadata depend on this change. */
  affectedPaths: string[];
};

/* ---------------------------------- public ---------------------------------- */

export type PublicCover = {
  assetId: string;
  alt: string;
  caption: string;
  decorative: boolean;
  width: number;
  height: number;
};

export type NewsSummary = {
  documentId: string;
  translationId: string;
  locale: Locale;
  slug: string;
  title: string;
  excerpt: string;
  cover: { assetId: string; alt: string; width: number; height: number } | null;
  /** First publication of this translation. */
  publishedAt: Date;
  /** Latest publication (update) of this translation. */
  updatedAt: Date;
  authorLabel: string;
  category: TaxonomyLabel | null;
  tags: TaxonomyLabel[];
  game: Game | null;
};

/** Published slugs of each locale variant (including the current one); only published. */
export type CounterpartSlugs = Partial<Record<Locale, string>>;

export type ArticleDTO = {
  documentId: string;
  translationId: string;
  revisionId: string;
  kind: DocumentKind;
  pageKey: PageKey | null;
  locale: Locale;
  slug: string;
  title: string;
  excerpt: string;
  body: RichTextDocument;
  cover: PublicCover | null;
  authorLabel: string;
  seoTitle: string;
  seoDescription: string;
  /** Preview of an unpublished revision: `null` when never published. */
  publishedAt: Date | null;
  updatedAt: Date | null;
  category: TaxonomyLabel | null;
  tags: TaxonomyLabel[];
  game: Game | null;
  /** Dimensions of resolvable body/cover images for the renderer. */
  assets: Map<string, { width: number; height: number }>;
  counterparts: CounterpartSlugs;
  isPreview: boolean;
};

export type NewsLookup = { kind: 'article'; article: ArticleDTO } | { kind: 'redirect'; slug: string } | null;

export type CounterpartResolution = { kind: 'published'; slug: string } | { kind: 'missing'; sourceSlug: string } | null;

export type TaxonomyFacet = { key: string; label: string; count: number };

export type AvailableTaxonomy = {
  categories: TaxonomyFacet[];
  tags: TaxonomyFacet[];
  games: { key: Game; count: number }[];
};

export type SitemapEntry = {
  locale: Locale;
  path: string;
  lastModified: Date;
  /** Published alternates (hreflang) including this entry, keyed by locale → path. */
  alternates: Partial<Record<Locale, string>>;
};
