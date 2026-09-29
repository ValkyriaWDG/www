import type { RichTextDocument } from '../content/rich-text/schema';

/** Private, local migration transport. Never commit a populated bundle or raw scoreboards. */
export type LegacyExtractMedia = {
  /** Stable placeholder UUID; the importer remaps it to the uploaded library asset ID. */
  id: string;
  sourceUrl: string;
  relativeFile?: string;
  sha256?: string;
  bytes?: number;
  alt: string;
  role: 'body' | 'cover' | 'logo';
  rightsStatus: 'legacy-published-owner-migration' | 'external-review-required';
};

export type LegacyExtractDocument = {
  kind: 'news' | 'manual' | 'tournament' | 'page';
  legacyId: string;
  slug: string;
  game: 'hell-let-loose' | 'wardogs' | null;
  locale: 'cs';
  sourceLanguage: 'cs' | 'sk';
  sourceUrl: string;
  sourcePublishedOn: string | null;
  sourceModifiedOn: string | null;
  title: string;
  excerpt: string;
  authorLabel: string;
  credits: string;
  body: RichTextDocument;
  coverAssetId: string | null;
  tags: string[];
  metadata: {
    categoryKey?: string;
    sortOrder?: number;
    pageKey?: 'faq' | 'clan';
    archive?: boolean;
    expiresOn?: string | null;
    name?: string;
    tag?: string;
    series?: string;
    season?: string;
    startsOn?: string | null;
    endsOn?: string | null;
    links?: Array<{ label: string; url: string }>;
    sourceNotes?: string[];
    logoAssetId?: string | null;
  };
  warnings: string[];
};

export type LegacyExtractScoreboardSource = {
  legacyMatchId: number;
  ordinal: number;
  providerGameId: number | null;
  /** Only present for an individually verified provider origin, never inferred from an ID. */
  sourceGameUrl?: string | null;
  valkyriaSide?: 'allies' | 'axis' | null;
  notes?: string[];
  /** Relative path within the local bundle directory, never an absolute machine path. */
  relativeFile: string;
  sha256: string;
  bytes: number;
};

export type LegacyExtractBundle = {
  schemaVersion: 1;
  sourceOrigin: string;
  observedAt: string;
  sourceRevision: string;
  documents: LegacyExtractDocument[];
  media: LegacyExtractMedia[];
  /** Untrusted rows from the public matches endpoint; importer validates every field. */
  matches: Record<string, unknown>[];
  matchMedia?: Array<{
    legacyMatchId: number;
    homeLogoAssetId: string | null;
    awayLogoAssetId: string | null;
    leagueLogoAssetId: string | null;
    mapAssetId: string | null;
    mapSourceUrl: string | null;
  }>;
  scoreboardSources: LegacyExtractScoreboardSource[];
  warnings: string[];
};
