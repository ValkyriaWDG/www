import { describe, expect, it } from 'vitest';
import { editorFieldFor, fieldMessageKey, groupFieldErrors } from './field-errors';

describe('editor field error mapping', () => {
  it('maps server paths to editor fields', () => {
    expect(editorFieldFor('fields.slug')).toBe('slug');
    expect(editorFieldFor('cover.alt')).toBe('cover');
    expect(editorFieldFor('shared.tagKeys')).toBe('taxonomy');
    expect(editorFieldFor('dueAt.localDateTime')).toBe('schedule');
    expect(editorFieldFor('assets')).toBe('body');
    expect(editorFieldFor('expectedVersion')).toBe('form');
  });

  it('maps publication validation codes to specific messages', () => {
    expect(fieldMessageKey('title', 'required')).toBe('titleRequired');
    expect(fieldMessageKey('excerpt', 'required')).toBe('excerptRequired');
    expect(fieldMessageKey('slug', 'slug_taken')).toBe('slugTaken');
    expect(fieldMessageKey('fields.slug', 'slug must contain lowercase letters, digits and single hyphens')).toBe('slugInvalid');
    expect(fieldMessageKey('body', 'required')).toBe('bodyRequired');
    expect(fieldMessageKey('body', 'content[1].attrs.alt: alt text is required unless the image is decorative')).toBe('bodyImageAlt');
    expect(fieldMessageKey('body.images', 'missing_asset:abc')).toBe('bodyImagesMissing');
    expect(fieldMessageKey('cover.alt', 'required')).toBe('coverAltRequired');
    expect(fieldMessageKey('cover.alt', 'must_be_empty_when_decorative')).toBe('coverAltDecorative');
    expect(fieldMessageKey('cover.assetId', 'missing_asset')).toBe('coverMissing');
    expect(fieldMessageKey('dueAt', 'not_in_future')).toBe('scheduleNotInFuture');
    expect(fieldMessageKey('dueAt.localDateTime', 'nonexistent_local_time')).toBe('scheduleNonexistent');
    expect(fieldMessageKey('fields.title', 'Too big: expected string to have <=200 characters')).toBe('tooLong');
  });

  it('keeps the first message per field', () => {
    expect(groupFieldErrors({ title: 'required', excerpt: 'required', 'cover.alt': 'required', 'cover.assetId': 'missing_asset' })).toEqual({
      title: 'titleRequired',
      excerpt: 'excerptRequired',
      cover: 'coverAltRequired',
    });
    expect(groupFieldErrors(undefined)).toEqual({});
  });
});
