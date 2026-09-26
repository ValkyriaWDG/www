import type { RichTextDocument } from '@valkyria/db';

/*
 * Minimal builders for the v1 rich-text vocabulary (Tiptap/ProseMirror JSON) used by the
 * production seed and the synthetic fixtures. They emit only documented nodes, marks and
 * attributes; tests validate every produced document with `parseRichTextDocument`.
 */

/** Editor JSON schema version these builders produce (must equal RICH_TEXT_SCHEMA_VERSION). */
export const SEED_RICH_TEXT_SCHEMA_VERSION = 1;

export type Mark = { type: 'bold' | 'italic' | 'underline' | 'strike' } | { type: 'link'; attrs: { href: string } };
export type TextNode = { type: 'text'; text: string; marks?: Mark[] };
export type InlineNode = TextNode | { type: 'hardBreak' };
export type Inline = InlineNode | string;
export type BlockNode = Record<string, unknown> & { type: string };

const inline = (items: Inline[]): InlineNode[] => items.map((item) => (typeof item === 'string' ? { type: 'text', text: item } : item));

export const text = (value: string, marks: Mark[] = []): TextNode => (marks.length > 0 ? { type: 'text', text: value, marks } : { type: 'text', text: value });
export const bold = (value: string): TextNode => text(value, [{ type: 'bold' }]);
export const italic = (value: string): TextNode => text(value, [{ type: 'italic' }]);
export const underline = (value: string): TextNode => text(value, [{ type: 'underline' }]);
export const strike = (value: string): TextNode => text(value, [{ type: 'strike' }]);
export const link = (value: string, href: string): TextNode => text(value, [{ type: 'link', attrs: { href } }]);
export const hardBreak = (): InlineNode => ({ type: 'hardBreak' });

export const p = (...content: Inline[]): BlockNode => (content.length > 0 ? { type: 'paragraph', content: inline(content) } : { type: 'paragraph' });
export const h2 = (value: string): BlockNode => ({ type: 'heading', attrs: { level: 2 }, content: [text(value)] });
export const h3 = (value: string): BlockNode => ({ type: 'heading', attrs: { level: 3 }, content: [text(value)] });

const listItem = (content: Inline[] | Inline) => ({
  type: 'listItem',
  content: [p(...(Array.isArray(content) ? content : [content]))],
});
export const ul = (...items: (Inline[] | Inline)[]): BlockNode => ({ type: 'bulletList', content: items.map(listItem) });
export const ol = (...items: (Inline[] | Inline)[]): BlockNode => ({ type: 'orderedList', attrs: { start: 1 }, content: items.map(listItem) });
export const quote = (...paragraphs: Inline[][]): BlockNode => ({ type: 'blockquote', content: paragraphs.map((content) => p(...content)) });
export const hr = (): BlockNode => ({ type: 'horizontalRule' });

export const image = (assetId: string, alt: string, caption = '', align: 'center' | 'wide' = 'center', decorative = false): BlockNode => ({
  type: 'image',
  attrs: { assetId, alt, caption, decorative, align },
});

const cell = (type: 'tableHeader' | 'tableCell', content: Inline) => ({
  type,
  attrs: { colspan: 1, rowspan: 1 },
  content: [p(content)],
});
/** Table with one header row followed by body rows. */
export const table = (header: Inline[], rows: Inline[][]): BlockNode => ({
  type: 'table',
  content: [
    { type: 'tableRow', content: header.map((value) => cell('tableHeader', value)) },
    ...rows.map((row) => ({ type: 'tableRow', content: row.map((value) => cell('tableCell', value)) })),
  ],
});

export const doc = (...content: BlockNode[]): RichTextDocument => ({ type: 'doc', content });

/** Asset IDs referenced by image nodes (mirrors the validator's extraction). */
export function imageAssetIds(document: RichTextDocument): string[] {
  const ids = new Set<string>();
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const value = node as { type?: string; attrs?: { assetId?: string }; content?: unknown[] };
    if (value.type === 'image' && value.attrs?.assetId) ids.add(value.attrs.assetId);
    for (const child of value.content ?? []) visit(child);
  };
  visit(document);
  return [...ids];
}
