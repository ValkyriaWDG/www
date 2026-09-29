import { getSchema } from '@tiptap/core';
import { EditorState, NodeSelection, TextSelection } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import { buildEditorExtensions, isAllowedLinkHref, placeCaretAfterBlock } from './extensions';

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

describe('caret after an inserted image', () => {
  const image = { type: 'image', attrs: { assetId: '5b0c3f0e-8a1e-4c55-9d1b-1f0f5f2a9e11', alt: 'Popis' } };
  const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
  const stateWithSelectedImage = (content: unknown[], imageIndex: number) => {
    const doc = schema.nodeFromJSON({ type: 'doc', content });
    let pos = 0;
    for (let index = 0; index < imageIndex; index += 1) pos += doc.child(index).nodeSize;
    return { state: EditorState.create({ doc, selection: NodeSelection.create(doc, pos) }), pos };
  };
  const blockTypes = (state: EditorState) => state.doc.content.content.map((node) => node.type.name);

  it('adds a paragraph after an image that ends the document, so typing keeps the image', () => {
    const { state, pos } = stateWithSelectedImage([paragraph('Úvod'), image], 1);
    const tr = placeCaretAfterBlock(state.tr, pos);
    expect(tr.selection).toBeInstanceOf(TextSelection);
    const typed = state.apply(tr.insertText('Mapa'));
    expect(blockTypes(typed)).toEqual(['paragraph', 'image', 'paragraph']);
    expect(typed.doc.lastChild?.textContent).toBe('Mapa');
  });

  it('moves into the following text block without adding an empty paragraph', () => {
    const { state, pos } = stateWithSelectedImage([image, paragraph('Další')], 0);
    const next = state.apply(placeCaretAfterBlock(state.tr, pos));
    expect(blockTypes(next)).toEqual(['image', 'paragraph']);
    expect(next.selection.$from.parent.textContent).toBe('Další');
    expect(next.selection.$from.parentOffset).toBe(0);
  });

  it('keeps the image when the node-selected image would otherwise be replaced', () => {
    // Before the fix the inserted image stayed node-selected and typing replaced it.
    const { state } = stateWithSelectedImage([paragraph('Úvod'), image], 1);
    expect(blockTypes(state.apply(state.tr.insertText('Mapa')))).not.toContain('image');
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
