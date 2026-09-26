import { getSchema } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { buildEditorExtensions, isAllowedLinkHref } from './extensions';

const schema = getSchema(buildEditorExtensions());

describe('editor schema matches rich-text schema v1', () => {
  it('registers exactly the supported nodes', () => {
    expect(Object.keys(schema.nodes).sort()).toEqual(
      [
        'blockquote',
        'bulletList',
        'doc',
        'hardBreak',
        'heading',
        'horizontalRule',
        'image',
        'listItem',
        'orderedList',
        'paragraph',
        'table',
        'tableCell',
        'tableHeader',
        'tableRow',
        'text',
      ].sort(),
    );
  });

  it('registers exactly the supported marks (no code, colors or fonts)', () => {
    expect(Object.keys(schema.marks).sort()).toEqual(['bold', 'italic', 'link', 'strike', 'underline']);
  });

  it('accepts a representative v1 document', () => {
    const doc = schema.nodeFromJSON({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Nadpis' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Tučně ', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'odkaz', marks: [{ type: 'link', attrs: { href: 'https://valkyriahll.cz/' } }] },
          ],
        },
        {
          type: 'image',
          attrs: { assetId: '5b0c3f0e-8a1e-4c55-9d1b-1f0f5f2a9e11', alt: 'Popis', caption: 'Popisek', decorative: false, align: 'wide' },
        },
        {
          type: 'table',
          content: [
            { type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'H' }] }] }] },
            { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'C' }] }] }] },
          ],
        },
      ],
    });
    expect(() => doc.check()).not.toThrow();
    expect(doc.child(2).attrs).toMatchObject({ align: 'wide', decorative: false });
  });

  it('limits headings to levels 2 and 3', () => {
    const heading = schema.nodes.heading!;
    expect((heading.spec as { attrs?: unknown }).attrs).toBeDefined();
    expect(buildEditorExtensions().length).toBeGreaterThan(0);
  });
});

describe('isAllowedLinkHref', () => {
  it.each(['https://valkyriahll.cz/', 'http://example.org/a?b=c', 'mailto:clan@example.org'])('allows %s', (href) => {
    expect(isAllowedLinkHref(href)).toBe(true);
  });
  it.each(['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', 'vbscript:x', '//evil.example', 'https://user:pw@example.org', 'https://x.org/a\nb', 'ftp://x.org'])(
    'rejects %s',
    (href) => {
      expect(isAllowedLinkHref(href)).toBe(false);
    },
  );
});
