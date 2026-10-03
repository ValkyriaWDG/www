/**
 * Maps server field errors (stable English paths/codes from the content use cases and
 * zod) to editor fields and localized message keys (`adminEditorial.fieldErrors.<key>`).
 * Raw server strings are never shown to the author. Pure; unit tested.
 */

export type EditorField =
  | 'title'
  | 'slug'
  | 'excerpt'
  | 'body'
  | 'cover'
  | 'authorLabel'
  | 'seoTitle'
  | 'seoDescription'
  | 'taxonomy'
  | 'schedule'
  | 'form';

export type FieldMessageKey =
  | 'titleRequired'
  | 'slugInvalid'
  | 'slugTaken'
  | 'excerptRequired'
  | 'bodyRequired'
  | 'bodyInvalid'
  | 'bodyImageAlt'
  | 'bodyImagesMissing'
  | 'coverAltRequired'
  | 'coverAltDecorative'
  | 'coverMissing'
  | 'taxonomyUnknown'
  | 'taxonomyArchived'
  | 'scheduleNotInFuture'
  | 'scheduleNonexistent'
  | 'tooLong'
  | 'invalid';

/** Server field path (e.g. `fields.cover.alt`, `cover.alt`, `shared.tagKeys`) → editor field. */
export function editorFieldFor(path: string): EditorField {
  const clean = path.replace(/^(fields|shared)\./, '');
  const head = clean.split('.')[0] ?? '';
  switch (head) {
    case 'title':
    case 'slug':
    case 'excerpt':
    case 'body':
    case 'cover':
    case 'authorLabel':
    case 'seoTitle':
    case 'seoDescription':
      return head;
    case 'assets':
      return 'body';
    case 'categoryKey':
    case 'tagKeys':
    case 'game':
      return 'taxonomy';
    case 'dueAt':
    case 'revisionId':
      return 'schedule';
    default:
      return 'form';
  }
}

export function fieldMessageKey(path: string, value: string): FieldMessageKey {
  const field = editorFieldFor(path);
  const clean = path.replace(/^(fields|shared)\./, '');
  const code = value.trim();
  const tooLong = /too big|<=|max/i.test(code);
  switch (field) {
    case 'title':
      return code === 'required' ? 'titleRequired' : tooLong ? 'tooLong' : 'invalid';
    case 'slug':
      return code === 'slug_taken' ? 'slugTaken' : 'slugInvalid';
    case 'excerpt':
      return code === 'required' ? 'excerptRequired' : tooLong ? 'tooLong' : 'invalid';
    case 'body':
      if (clean === 'body.images' || clean === 'assets' || code.startsWith('missing_asset') || code.startsWith('unknown_asset')) return 'bodyImagesMissing';
      if (code === 'required') return 'bodyRequired';
      if (/alt text|attrs\.alt/i.test(code)) return 'bodyImageAlt';
      return 'bodyInvalid';
    case 'cover':
      if (clean === 'cover.assetId' || code.startsWith('missing_asset') || code.startsWith('unknown_asset')) return 'coverMissing';
      if (code === 'must_be_empty_when_decorative') return 'coverAltDecorative';
      if (clean === 'cover.alt') return code === 'required' ? 'coverAltRequired' : tooLong ? 'tooLong' : 'invalid';
      return 'invalid';
    case 'taxonomy':
      return code.startsWith('archived_') ? 'taxonomyArchived' : 'taxonomyUnknown';
    case 'schedule':
      if (code === 'not_in_future') return 'scheduleNotInFuture';
      if (code === 'nonexistent_local_time') return 'scheduleNonexistent';
      return 'invalid';
    default:
      return tooLong ? 'tooLong' : 'invalid';
  }
}

/** First message per editor field. */
export function groupFieldErrors(fieldErrors: Record<string, string> | undefined | null): Partial<Record<EditorField, FieldMessageKey>> {
  const result: Partial<Record<EditorField, FieldMessageKey>> = {};
  for (const [path, value] of Object.entries(fieldErrors ?? {})) {
    const field = editorFieldFor(path);
    result[field] ??= fieldMessageKey(path, value);
  }
  return result;
}
