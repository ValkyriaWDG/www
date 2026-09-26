import { describe, expect, it } from 'vitest';
import { checkLinkHref, isExternalHref } from './links';
import {
  RICH_TEXT_LIMITS,
  RICH_TEXT_SCHEMA_VERSION,
  emptyDocument,
  isRichTextEmpty,
  parseRichTextDocument,
  plainTextExcerpt,
  type RichTextDocument,
} from './schema';

const ASSET_A = '6f1c1c62-3f8e-4f4a-9a57-0d7a0c1f0a01';
const ASSET_B = '6f1c1c62-3f8e-4f4a-9a57-0d7a0c1f0a02';

const text = (value: string, marks?: unknown[]) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) });
const paragraph = (...content: unknown[]) => ({ type: 'paragraph', content });
const doc = (...content: unknown[]) => ({ type: 'doc', content });

/** A document shaped exactly like Tiptap 3 `editor.getJSON()` output, including editor-only attributes. */
function tiptapLikeDocument() {
  return doc(
    { type: 'heading', attrs: { level: 2, textAlign: null }, content: [text('Nadpis článku')] },
    paragraph(
      text('Tučně', [{ type: 'bold' }]),
      text(' a '),
      text('odkaz', [{ type: 'link', attrs: { href: 'https://example.org/a', target: '_blank', rel: 'noopener noreferrer nofollow', class: null, title: null } }]),
      { type: 'hardBreak' },
      text('další řádek', [{ type: 'italic' }, { type: 'underline' }, { type: 'strike' }]),
    ),
    { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph(text('jedna'))] }] },
    {
      type: 'orderedList',
      attrs: { start: 3, type: null },
      content: [
        { type: 'listItem', content: [paragraph(text('tři')), { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph(text('vnořené'))] }] }] },
      ],
    },
    { type: 'blockquote', content: [paragraph(text('Citace'))] },
    { type: 'horizontalRule' },
    {
      type: 'image',
      attrs: { assetId: ASSET_A, alt: 'Popis obrázku', caption: 'Titulek', decorative: false, align: 'wide', src: 'https://evil.example/x.png', title: 'x', width: 300, height: 200 },
    },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: [120], align: 'left' }, content: [paragraph(text('Mapa'))] },
            { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null }, content: [paragraph(text('Skóre'))] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', attrs: { colspan: 2, rowspan: 1, colwidth: null }, content: [paragraph(text('Foy')), { type: 'image', attrs: { assetId: ASSET_B, alt: '', decorative: true } }] },
          ],
        },
      ],
    },
    { type: 'paragraph' },
  );
}

describe('rich text schema v1', () => {
  it('exposes the schema version', () => {
    expect(RICH_TEXT_SCHEMA_VERSION).toBe(1);
  });

  it('accepts the allowed Tiptap structure and collects asset ids', () => {
    const result = parseRichTextDocument(tiptapLikeDocument());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.assetIds.sort()).toEqual([ASSET_A, ASSET_B].sort());
    expect(result.doc.content).toHaveLength(9);
  });

  it('drops unknown/unsafe attributes of allowed nodes and marks', () => {
    const result = parseRichTextDocument(tiptapLikeDocument());
    if (!result.ok) throw new Error(result.issues.join('\n'));
    const serialized = JSON.stringify(result.doc);
    for (const dropped of ['"src"', '"title"', '"width"', '"height"', '"target"', '"rel"', '"class"', '"colwidth"', '"textAlign"', '"align":"left"', 'evil.example']) {
      expect(serialized).not.toContain(dropped);
    }
    const image = result.doc.content[6];
    expect(image).toEqual({ type: 'image', attrs: { assetId: ASSET_A, alt: 'Popis obrázku', caption: 'Titulek', decorative: false, align: 'wide' } });
    const link = result.doc.content[1];
    expect(JSON.stringify(link)).toContain('{"type":"link","attrs":{"href":"https://example.org/a"}}');
    const list = result.doc.content[3];
    expect(list).toMatchObject({ type: 'orderedList', attrs: { start: 3 } });
    expect(JSON.stringify(list)).not.toContain('"type":null');
  });

  it('returns a new object and never the input', () => {
    const input = tiptapLikeDocument();
    const result = parseRichTextDocument(input);
    expect(result.ok && result.doc).not.toBe(input);
  });

  it('accepts a JSON string input', () => {
    expect(parseRichTextDocument(JSON.stringify(doc(paragraph(text('Ahoj'))))).ok).toBe(true);
    expect(parseRichTextDocument('{not json').ok).toBe(false);
  });

  it.each([
    ['raw HTML node', { type: 'html', attrs: { content: '<script>alert(1)</script>' } }],
    ['script node', { type: 'script', content: [text('alert(1)')] }],
    ['iframe embed', { type: 'iframe', attrs: { src: 'https://evil.example' } }],
    ['code block', { type: 'codeBlock', attrs: { language: 'js' }, content: [text('x')] }],
    ['details', { type: 'details', content: [paragraph(text('x'))] }],
    ['level-1 heading', { type: 'heading', attrs: { level: 1 }, content: [text('H1')] }],
    ['level-4 heading', { type: 'heading', attrs: { level: 4 }, content: [text('H4')] }],
    ['text at block level', text('loose')],
  ])('rejects %s', (_label, node) => {
    const result = parseRichTextDocument(doc(node));
    expect(result.ok).toBe(false);
  });

  it.each([
    ['textStyle color', { type: 'textStyle', attrs: { color: '#ff0000' } }],
    ['custom font family', { type: 'textStyle', attrs: { fontFamily: 'Comic Sans MS' } }],
    ['highlight', { type: 'highlight', attrs: { color: 'yellow' } }],
    ['inline code', { type: 'code' }],
    ['subscript', { type: 'subscript' }],
  ])('rejects unsupported mark: %s', (_label, mark) => {
    const result = parseRichTextDocument(doc(paragraph(text('styled', [mark]))));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join()).toMatch(/unsupported mark/);
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\u0000script:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox(1)',
    '//evil.example/path',
    '/relative/path',
    'https://user:secret@evil.example/',
    'https://user@evil.example/',
    'http:evil.example',
    'https://evil.example/\u202egnp.exe',
    'https://evil .example',
    'https:\\\\evil.example',
    'ftp://files.example/x',
    `https://example.org/${'a'.repeat(2100)}`,
    'mailto:',
  ])('rejects hostile link %j', (href) => {
    expect(checkLinkHref(href).ok).toBe(false);
    const result = parseRichTextDocument(doc(paragraph(text('x', [{ type: 'link', attrs: { href } }]))));
    expect(result.ok).toBe(false);
  });

  it.each([
    ['https://valkyriawdg.cz/cs/news', 'https://valkyriawdg.cz/cs/news'],
    ['HTTPS://Example.org/Path?q=1#x', 'https://Example.org/Path?q=1#x'],
    ['http://example.org', 'http://example.org'],
    ['mailto:info@example.org', 'mailto:info@example.org'],
    ['  https://example.org/trimmed  ', 'https://example.org/trimmed'],
  ])('accepts safe link %j', (href, normalized) => {
    expect(checkLinkHref(href)).toEqual({ ok: true, href: normalized });
  });

  it('classifies external links by origin', () => {
    expect(isExternalHref('https://valkyriawdg.cz/cs/news', 'https://valkyriawdg.cz')).toBe(false);
    expect(isExternalHref('https://valkyriahll.cz/', 'https://valkyriawdg.cz')).toBe(true);
    expect(isExternalHref('mailto:x@example.org', 'https://valkyriawdg.cz')).toBe(true);
  });

  it('enforces image alt rules and attribute values', () => {
    const image = (attrs: Record<string, unknown>) => parseRichTextDocument(doc({ type: 'image', attrs: { assetId: ASSET_A, ...attrs } }));
    expect(image({ alt: 'Popis' }).ok).toBe(true);
    expect(image({ alt: '', decorative: true }).ok).toBe(true);
    expect(image({ alt: '' }).ok).toBe(false);
    expect(image({ alt: 'Něco', decorative: true }).ok).toBe(false);
    expect(image({ alt: 'x'.repeat(301) }).ok).toBe(false);
    expect(image({ alt: 'ok', caption: 'x'.repeat(501) }).ok).toBe(false);
    expect(image({ alt: 'ok', align: 'left' }).ok).toBe(false);
    expect(image({ alt: 'ok', decorative: 'yes' }).ok).toBe(false);
    expect(parseRichTextDocument(doc({ type: 'image', attrs: { src: 'https://evil.example/a.png', alt: 'x' } })).ok).toBe(false);
    expect(parseRichTextDocument(doc({ type: 'image', attrs: { assetId: '../../etc/passwd', alt: 'x' } })).ok).toBe(false);
  });

  it('rejects invalid structure', () => {
    expect(parseRichTextDocument({ type: 'paragraph' }).ok).toBe(false);
    expect(parseRichTextDocument(doc()).ok).toBe(false);
    expect(parseRichTextDocument(null).ok).toBe(false);
    expect(parseRichTextDocument([]).ok).toBe(false);
    expect(parseRichTextDocument(doc({ type: 'bulletList', content: [paragraph(text('x'))] })).ok).toBe(false);
    expect(parseRichTextDocument(doc({ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'heading', attrs: { level: 2 } }] }] })).ok).toBe(false);
    expect(parseRichTextDocument(doc({ type: 'blockquote', content: [] })).ok).toBe(false);
    expect(parseRichTextDocument(doc({ type: 'table', content: [{ type: 'tableRow', content: [] }] })).ok).toBe(false);
    expect(parseRichTextDocument(doc(paragraph({ type: 'image', attrs: { assetId: ASSET_A, alt: 'x' } }))).ok).toBe(false);
    expect(parseRichTextDocument(doc({ type: 'paragraph', marks: [{ type: 'bold' }], content: [text('x')] })).ok).toBe(false);
    expect(parseRichTextDocument(doc(paragraph({ type: 'text', text: 42 }))).ok).toBe(false);
    expect(parseRichTextDocument(doc({ type: 'orderedList', attrs: { start: 0 }, content: [{ type: 'listItem', content: [paragraph()] }] })).ok).toBe(false);
  });

  it('bounds table spans and rejects nested tables', () => {
    const cell = (attrs: Record<string, unknown>, content: unknown[] = [paragraph(text('x'))]) => ({ type: 'tableCell', attrs, content });
    const table = (...cells: unknown[]) => ({ type: 'table', content: [{ type: 'tableRow', content: cells }] });
    expect(parseRichTextDocument(doc(table(cell({ colspan: 10, rowspan: 10 })))).ok).toBe(true);
    expect(parseRichTextDocument(doc(table(cell({ colspan: 11 })))).ok).toBe(false);
    expect(parseRichTextDocument(doc(table(cell({ rowspan: 0 })))).ok).toBe(false);
    expect(parseRichTextDocument(doc(table(cell({ colspan: 1.5 })))).ok).toBe(false);
    expect(parseRichTextDocument(doc(table(cell({}, [table(cell({}))])))).ok).toBe(false);
  });

  it('strips control characters from text and drops resulting empty text nodes', () => {
    const result = parseRichTextDocument(doc(paragraph(text('a\u0000b\u0007c')), paragraph(text('\u0001'))));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.content[0]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'abc' }] });
    expect(result.doc.content[1]).toEqual({ type: 'paragraph' });
  });

  it('enforces resource limits', () => {
    // Serialized size.
    const big = doc(...Array.from({ length: 40 }, () => paragraph(text('x'.repeat(15_000)))));
    const sized = parseRichTextDocument(big);
    expect(sized.ok).toBe(false);
    if (!sized.ok) expect(sized.issues[0]).toMatch(/bytes/);
    // Depth.
    let nested: unknown = paragraph(text('deep'));
    for (let i = 0; i < 8; i += 1) nested = { type: 'blockquote', content: [nested] };
    const deep = parseRichTextDocument(doc({ type: 'bulletList', content: [{ type: 'listItem', content: [paragraph(text('x')), nested] }] }));
    expect(deep.ok).toBe(false);
    if (!deep.ok) expect(deep.issues.join()).toMatch(/nested deeper/);
    // Node count.
    const many = doc(...Array.from({ length: RICH_TEXT_LIMITS.maxNodes }, () => ({ type: 'horizontalRule' })));
    const counted = parseRichTextDocument(many);
    expect(counted.ok).toBe(false);
    if (!counted.ok) expect(counted.issues.join()).toMatch(/nodes/);
    // Text length per node.
    expect(parseRichTextDocument(doc(paragraph(text('x'.repeat(RICH_TEXT_LIMITS.maxTextNodeLength + 1))))).ok).toBe(false);
  });

  it('caps the number of reported issues', () => {
    const bad = doc(...Array.from({ length: 200 }, () => ({ type: 'iframe' })));
    const result = parseRichTextDocument(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.length).toBeLessThanOrEqual(RICH_TEXT_LIMITS.maxIssues);
  });

  it('provides an empty document, emptiness check and plain-text excerpt', () => {
    const empty = emptyDocument();
    expect(parseRichTextDocument(empty).ok).toBe(true);
    expect(isRichTextEmpty(empty)).toBe(true);
    const imageOnly = parseRichTextDocument(doc({ type: 'image', attrs: { assetId: ASSET_A, alt: 'x' } }));
    expect(imageOnly.ok && isRichTextEmpty(imageOnly.doc)).toBe(false);
    const parsed = parseRichTextDocument(tiptapLikeDocument());
    if (!parsed.ok) throw new Error('invalid');
    const excerpt = plainTextExcerpt(parsed.doc, 30);
    expect(excerpt.length).toBeLessThanOrEqual(30);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt.startsWith('Nadpis článku Tučně a odkaz')).toBe(true);
    const short: RichTextDocument = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Krátký text' }] }] };
    expect(plainTextExcerpt(short, 100)).toBe('Krátký text');
  });
});
