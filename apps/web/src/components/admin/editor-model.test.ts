import { describe, expect, it } from 'vitest';
import { fieldsFrom, localDraftErrors, suggestedSlug } from './editor-model';

describe('editor model', () => {
  it('builds empty fields for a missing draft', () => {
    const fields = fieldsFrom(null);
    expect(fields.title).toBe('');
    expect(fields.body).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(fields.cover).toBeNull();
  });

  it('reports slug and image alt problems before a save is attempted', () => {
    const ok = { ...fieldsFrom(null), slug: 'prilis-zlutoucky-kun' };
    expect(localDraftErrors(ok)).toBeNull();
    expect(localDraftErrors({ ...ok, slug: 'Špatný slug' })).toEqual({ slug: 'invalid' });
    const withImage = {
      ...ok,
      body: {
        type: 'doc',
        content: [{ type: 'image', attrs: { assetId: '0b7c7f38-6bb2-4a53-9d4d-2f3b29f0c9a1', alt: '', caption: '', decorative: false, align: 'center' } }],
      },
    };
    expect(localDraftErrors(withImage)?.body).toMatch(/alt/);
    const decorative = { ...withImage, body: { type: 'doc', content: [{ type: 'image', attrs: { ...withImage.body.content[0]!.attrs, decorative: true } }] } };
    expect(localDraftErrors(decorative)).toBeNull();
  });

  it('follows the title only for never-published, untouched slugs', () => {
    const base = { previousTitle: 'Nový příspěvek', nextTitle: 'Příliš žluťoučký kůň', slug: 'novy-prispevek', everPublished: false, slugTouched: false };
    expect(suggestedSlug(base)).toBe('prilis-zlutoucky-kun');
    expect(suggestedSlug({ ...base, slug: 'draft-1a2b3c4d' })).toBe('prilis-zlutoucky-kun');
    expect(suggestedSlug({ ...base, slug: 'vlastni-adresa' })).toBeNull();
    expect(suggestedSlug({ ...base, everPublished: true })).toBeNull();
    expect(suggestedSlug({ ...base, slugTouched: true })).toBeNull();
    expect(suggestedSlug({ ...base, nextTitle: '!!!' })).toBeNull();
  });
});
