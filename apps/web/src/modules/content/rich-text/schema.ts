import { checkLinkHref } from './links';

/**
 * Rich-text contract v1: canonical Tiptap/ProseMirror JSON validated on the server,
 * independently of the editor. Unknown node/mark types, invalid structure and invalid
 * attribute values are rejected; unknown or unsafe *attributes* of allowed nodes/marks
 * (e.g. Tiptap image `src`/`title`/`width`, link `target`/`rel`/`class`, table
 * `colwidth`/`align`) are dropped. The parser returns a newly built document, never the
 * input object, so nothing unvalidated survives normalization.
 *
 * Isomorphic module: safe to import from server actions, route handlers and (for the
 * constants/types) client editor code.
 */
export const RICH_TEXT_SCHEMA_VERSION = 1 as const;

export const RICH_TEXT_LIMITS = {
  maxSerializedBytes: 512 * 1024,
  maxDepth: 12,
  maxNodes: 10_000,
  maxTextNodeLength: 20_000,
  maxTotalTextLength: 200_000,
  maxMarksPerText: 5,
  maxTableRows: 200,
  maxTableColumns: 20,
  maxSpan: 10,
  maxListStart: 100_000,
  maxAltLength: 300,
  maxCaptionLength: 500,
  maxIssues: 50,
} as const;

export const IMAGE_ALIGNMENTS = ['center', 'wide'] as const;
export type ImageAlign = (typeof IMAGE_ALIGNMENTS)[number];

export type BoldMark = { type: 'bold' };
export type ItalicMark = { type: 'italic' };
export type UnderlineMark = { type: 'underline' };
export type StrikeMark = { type: 'strike' };
export type LinkMark = { type: 'link'; attrs: { href: string } };
export type RichTextMark = BoldMark | ItalicMark | UnderlineMark | StrikeMark | LinkMark;
export type RichTextMarkType = RichTextMark['type'];

export type TextNode = { type: 'text'; text: string; marks?: RichTextMark[] };
export type HardBreakNode = { type: 'hardBreak' };
export type InlineNode = TextNode | HardBreakNode;

export type ParagraphNode = { type: 'paragraph'; content?: InlineNode[] };
export type HeadingNode = { type: 'heading'; attrs: { level: 2 | 3 }; content?: InlineNode[] };
/** First child is always a paragraph (Tiptap `paragraph block*`). */
export type ListItemNode = { type: 'listItem'; content: BlockNode[] };
export type BulletListNode = { type: 'bulletList'; content: ListItemNode[] };
export type OrderedListNode = { type: 'orderedList'; attrs: { start: number }; content: ListItemNode[] };
export type BlockquoteNode = { type: 'blockquote'; content: BlockNode[] };
export type HorizontalRuleNode = { type: 'horizontalRule' };
export type ImageAttrs = { assetId: string; alt: string; caption: string; decorative: boolean; align: ImageAlign };
export type ImageNode = { type: 'image'; attrs: ImageAttrs };
export type TableCellNode = {
  type: 'tableCell' | 'tableHeader';
  attrs: { colspan: number; rowspan: number };
  content: BlockNode[];
};
export type TableRowNode = { type: 'tableRow'; content: TableCellNode[] };
export type TableNode = { type: 'table'; content: TableRowNode[] };

export type BlockNode =
  | ParagraphNode
  | HeadingNode
  | BulletListNode
  | OrderedListNode
  | BlockquoteNode
  | HorizontalRuleNode
  | ImageNode
  | TableNode;

export type RichTextDocument = { type: 'doc'; content: BlockNode[] };

export type ParseRichTextResult =
  | { ok: true; doc: RichTextDocument; assetIds: string[] }
  | { ok: false; issues: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Control characters other than tab/newline are stripped from text.
const TEXT_CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'blockquote',
  'horizontalRule',
  'image',
  'table',
]);

type Context = {
  issues: string[];
  nodes: number;
  textLength: number;
  assetIds: Set<string>;
  inTable: boolean;
};

type RawNode = { type: string; attrs: Record<string, unknown>; content: unknown[] | undefined; marks: unknown; text: unknown };

class AbortParse extends Error {}

function issue(ctx: Context, path: string, message: string) {
  ctx.issues.push(`${path || 'doc'}: ${message}`);
  if (ctx.issues.length >= RICH_TEXT_LIMITS.maxIssues) throw new AbortParse();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads the common node envelope; reports and returns null on malformed input. */
function readNode(ctx: Context, value: unknown, path: string, depth: number): RawNode | null {
  if (!isRecord(value)) {
    issue(ctx, path, 'node must be an object');
    return null;
  }
  if (typeof value.type !== 'string') {
    issue(ctx, path, 'node type is missing');
    return null;
  }
  ctx.nodes += 1;
  if (ctx.nodes > RICH_TEXT_LIMITS.maxNodes) {
    issue(ctx, path, `document exceeds ${RICH_TEXT_LIMITS.maxNodes} nodes`);
    throw new AbortParse();
  }
  if (depth > RICH_TEXT_LIMITS.maxDepth) {
    issue(ctx, path, `document is nested deeper than ${RICH_TEXT_LIMITS.maxDepth} levels`);
    throw new AbortParse();
  }
  const attrs = value.attrs;
  if (attrs !== undefined && attrs !== null && !isRecord(attrs)) {
    issue(ctx, `${path}.attrs`, 'attrs must be an object');
    return null;
  }
  const content = value.content;
  if (content !== undefined && content !== null && !Array.isArray(content)) {
    issue(ctx, `${path}.content`, 'content must be an array');
    return null;
  }
  return {
    type: value.type,
    attrs: (attrs as Record<string, unknown> | null | undefined) ?? {},
    content: (content as unknown[] | null | undefined) ?? undefined,
    marks: value.marks,
    text: value.text,
  };
}

function rejectMarks(ctx: Context, node: RawNode, path: string) {
  if (node.marks !== undefined && node.marks !== null && !(Array.isArray(node.marks) && node.marks.length === 0)) {
    issue(ctx, `${path}.marks`, `marks are not allowed on ${node.type}`);
  }
}

function rejectContent(ctx: Context, node: RawNode, path: string) {
  if (node.content && node.content.length > 0) issue(ctx, `${path}.content`, `${node.type} cannot have content`);
}

function parseMarks(ctx: Context, value: unknown, path: string): RichTextMark[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    issue(ctx, path, 'marks must be an array');
    return [];
  }
  if (value.length > RICH_TEXT_LIMITS.maxMarksPerText) {
    issue(ctx, path, `at most ${RICH_TEXT_LIMITS.maxMarksPerText} marks are allowed`);
    return [];
  }
  const result: RichTextMark[] = [];
  const seen = new Set<string>();
  value.forEach((raw, index) => {
    const markPath = `${path}[${index}]`;
    if (!isRecord(raw) || typeof raw.type !== 'string') {
      issue(ctx, markPath, 'mark must be an object with a type');
      return;
    }
    const attrs = raw.attrs;
    if (attrs !== undefined && attrs !== null && !isRecord(attrs)) {
      issue(ctx, `${markPath}.attrs`, 'attrs must be an object');
      return;
    }
    switch (raw.type) {
      case 'bold':
      case 'italic':
      case 'underline':
      case 'strike':
        if (!seen.has(raw.type)) result.push({ type: raw.type });
        seen.add(raw.type);
        return;
      case 'link': {
        const checked = checkLinkHref(isRecord(attrs) ? attrs.href : undefined);
        if (!checked.ok) {
          issue(ctx, `${markPath}.attrs.href`, `unsafe link (${checked.reason})`);
          return;
        }
        if (seen.has('link')) {
          issue(ctx, markPath, 'duplicate link mark');
          return;
        }
        seen.add('link');
        result.push({ type: 'link', attrs: { href: checked.href } });
        return;
      }
      default:
        issue(ctx, `${markPath}.type`, `unsupported mark '${truncate(raw.type)}'`);
    }
  });
  return result;
}

function parseInlineContent(ctx: Context, content: unknown[] | undefined, path: string, depth: number): InlineNode[] {
  const result: InlineNode[] = [];
  (content ?? []).forEach((value, index) => {
    const childPath = `${path}.content[${index}]`;
    const node = readNode(ctx, value, childPath, depth);
    if (!node) return;
    if (node.type === 'text') {
      if (typeof node.text !== 'string') {
        issue(ctx, `${childPath}.text`, 'text must be a string');
        return;
      }
      if (node.text.length > RICH_TEXT_LIMITS.maxTextNodeLength) {
        issue(ctx, `${childPath}.text`, `text node exceeds ${RICH_TEXT_LIMITS.maxTextNodeLength} characters`);
        return;
      }
      rejectContent(ctx, node, childPath);
      const text = node.text.replace(TEXT_CONTROL_CHARS, '');
      ctx.textLength += text.length;
      if (ctx.textLength > RICH_TEXT_LIMITS.maxTotalTextLength) {
        issue(ctx, childPath, `document text exceeds ${RICH_TEXT_LIMITS.maxTotalTextLength} characters`);
        throw new AbortParse();
      }
      const marks = parseMarks(ctx, node.marks, `${childPath}.marks`);
      if (text === '') return; // ProseMirror forbids empty text nodes; drop after stripping.
      result.push(marks.length > 0 ? { type: 'text', text, marks } : { type: 'text', text });
      return;
    }
    if (node.type === 'hardBreak') {
      rejectContent(ctx, node, childPath);
      // Tiptap may keep formatting marks on a hard break; validate, then drop them.
      parseMarks(ctx, node.marks, `${childPath}.marks`);
      result.push({ type: 'hardBreak' });
      return;
    }
    if (BLOCK_TYPES.has(node.type) || node.type === 'doc') {
      issue(ctx, `${childPath}.type`, `${node.type} is not allowed inline`);
      return;
    }
    issue(ctx, `${childPath}.type`, `unsupported node '${truncate(node.type)}'`);
  });
  return result;
}

function parseBlockContent(
  ctx: Context,
  content: unknown[] | undefined,
  path: string,
  depth: number,
  options: { requireOne: boolean },
): BlockNode[] {
  const list = content ?? [];
  if (options.requireOne && list.length === 0) issue(ctx, `${path}.content`, 'at least one block is required');
  const result: BlockNode[] = [];
  list.forEach((value, index) => {
    const block = parseBlock(ctx, value, `${path}.content[${index}]`, depth);
    if (block) result.push(block);
  });
  return result;
}

function parseListItems(ctx: Context, node: RawNode, path: string, depth: number): ListItemNode[] {
  const list = node.content ?? [];
  if (list.length === 0) issue(ctx, `${path}.content`, `${node.type} needs at least one list item`);
  const items: ListItemNode[] = [];
  list.forEach((value, index) => {
    const itemPath = `${path}.content[${index}]`;
    const item = readNode(ctx, value, itemPath, depth + 1);
    if (!item) return;
    if (item.type !== 'listItem') {
      issue(ctx, `${itemPath}.type`, `${node.type} may only contain listItem nodes`);
      return;
    }
    rejectMarks(ctx, item, itemPath);
    const children = item.content ?? [];
    const first = children[0];
    if (!isRecord(first) || first.type !== 'paragraph') {
      issue(ctx, `${itemPath}.content`, 'a list item must start with a paragraph');
      return;
    }
    items.push({ type: 'listItem', content: parseBlockContent(ctx, children, itemPath, depth + 2, { requireOne: true }) });
  });
  return items;
}

function readSpan(ctx: Context, value: unknown, path: string): number {
  if (value === undefined || value === null) return 1;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > RICH_TEXT_LIMITS.maxSpan) {
    issue(ctx, path, `must be an integer between 1 and ${RICH_TEXT_LIMITS.maxSpan}`);
    return 1;
  }
  return value;
}

function parseTable(ctx: Context, node: RawNode, path: string, depth: number): TableNode | null {
  if (ctx.inTable) {
    issue(ctx, path, 'tables cannot be nested');
    return null;
  }
  const rows = node.content ?? [];
  if (rows.length === 0) issue(ctx, `${path}.content`, 'a table needs at least one row');
  if (rows.length > RICH_TEXT_LIMITS.maxTableRows) {
    issue(ctx, `${path}.content`, `a table may have at most ${RICH_TEXT_LIMITS.maxTableRows} rows`);
    return null;
  }
  ctx.inTable = true;
  try {
    const parsedRows: TableRowNode[] = [];
    rows.forEach((rowValue, rowIndex) => {
      const rowPath = `${path}.content[${rowIndex}]`;
      const row = readNode(ctx, rowValue, rowPath, depth + 1);
      if (!row) return;
      if (row.type !== 'tableRow') {
        issue(ctx, `${rowPath}.type`, 'a table may only contain tableRow nodes');
        return;
      }
      rejectMarks(ctx, row, rowPath);
      const cells = row.content ?? [];
      if (cells.length === 0) issue(ctx, `${rowPath}.content`, 'a table row needs at least one cell');
      if (cells.length > RICH_TEXT_LIMITS.maxTableColumns) {
        issue(ctx, `${rowPath}.content`, `a table row may have at most ${RICH_TEXT_LIMITS.maxTableColumns} cells`);
        return;
      }
      const parsedCells: TableCellNode[] = [];
      cells.forEach((cellValue, cellIndex) => {
        const cellPath = `${rowPath}.content[${cellIndex}]`;
        const cell = readNode(ctx, cellValue, cellPath, depth + 2);
        if (!cell) return;
        if (cell.type !== 'tableCell' && cell.type !== 'tableHeader') {
          issue(ctx, `${cellPath}.type`, 'a table row may only contain tableCell or tableHeader nodes');
          return;
        }
        rejectMarks(ctx, cell, cellPath);
        parsedCells.push({
          type: cell.type,
          attrs: {
            colspan: readSpan(ctx, cell.attrs.colspan, `${cellPath}.attrs.colspan`),
            rowspan: readSpan(ctx, cell.attrs.rowspan, `${cellPath}.attrs.rowspan`),
          },
          content: parseBlockContent(ctx, cell.content, cellPath, depth + 3, { requireOne: true }),
        });
      });
      parsedRows.push({ type: 'tableRow', content: parsedCells });
    });
    return { type: 'table', content: parsedRows };
  } finally {
    ctx.inTable = false;
  }
}

function readOptionalText(ctx: Context, value: unknown, path: string, max: number): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    issue(ctx, path, 'must be a string');
    return '';
  }
  const text = value.replace(TEXT_CONTROL_CHARS, '').trim();
  if (text.length > max) issue(ctx, path, `must be at most ${max} characters`);
  return text;
}

function parseImage(ctx: Context, node: RawNode, path: string): ImageNode | null {
  const { attrs } = node;
  const assetId = attrs.assetId;
  if (typeof assetId !== 'string' || !UUID.test(assetId)) {
    issue(ctx, `${path}.attrs.assetId`, 'image requires a media library asset id');
    return null;
  }
  const alt = readOptionalText(ctx, attrs.alt, `${path}.attrs.alt`, RICH_TEXT_LIMITS.maxAltLength);
  const caption = readOptionalText(ctx, attrs.caption, `${path}.attrs.caption`, RICH_TEXT_LIMITS.maxCaptionLength);
  let decorative = false;
  if (attrs.decorative !== undefined && attrs.decorative !== null) {
    if (typeof attrs.decorative !== 'boolean') issue(ctx, `${path}.attrs.decorative`, 'must be a boolean');
    else decorative = attrs.decorative;
  }
  let align: ImageAlign = 'center';
  if (attrs.align !== undefined && attrs.align !== null) {
    if (!(IMAGE_ALIGNMENTS as readonly unknown[]).includes(attrs.align)) {
      issue(ctx, `${path}.attrs.align`, `must be one of ${IMAGE_ALIGNMENTS.join(', ')}`);
    } else {
      align = attrs.align as ImageAlign;
    }
  }
  if (decorative && alt !== '') issue(ctx, `${path}.attrs.alt`, 'a decorative image must have empty alt text');
  if (!decorative && alt === '') issue(ctx, `${path}.attrs.alt`, 'alt text is required unless the image is decorative');
  const normalizedId = assetId.toLowerCase();
  ctx.assetIds.add(normalizedId);
  return { type: 'image', attrs: { assetId: normalizedId, alt, caption, decorative, align } };
}

function parseBlock(ctx: Context, value: unknown, path: string, depth: number): BlockNode | null {
  const node = readNode(ctx, value, path, depth);
  if (!node) return null;
  if (node.type !== 'text') rejectMarks(ctx, node, path);
  switch (node.type) {
    case 'paragraph': {
      const content = parseInlineContent(ctx, node.content, path, depth + 1);
      return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' };
    }
    case 'heading': {
      const level = node.attrs.level;
      if (level !== 2 && level !== 3) {
        issue(ctx, `${path}.attrs.level`, 'heading level must be 2 or 3');
        return null;
      }
      const content = parseInlineContent(ctx, node.content, path, depth + 1);
      return content.length > 0 ? { type: 'heading', attrs: { level }, content } : { type: 'heading', attrs: { level } };
    }
    case 'bulletList':
      return { type: 'bulletList', content: parseListItems(ctx, node, path, depth) };
    case 'orderedList': {
      let start = 1;
      const raw = node.attrs.start;
      if (raw !== undefined && raw !== null) {
        if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > RICH_TEXT_LIMITS.maxListStart) {
          issue(ctx, `${path}.attrs.start`, 'must be a positive integer');
        } else {
          start = raw;
        }
      }
      return { type: 'orderedList', attrs: { start }, content: parseListItems(ctx, node, path, depth) };
    }
    case 'blockquote':
      return { type: 'blockquote', content: parseBlockContent(ctx, node.content, path, depth + 1, { requireOne: true }) };
    case 'horizontalRule':
      rejectContent(ctx, node, path);
      return { type: 'horizontalRule' };
    case 'image':
      rejectContent(ctx, node, path);
      return parseImage(ctx, node, path);
    case 'table':
      return parseTable(ctx, node, path, depth);
    case 'text':
    case 'hardBreak':
      issue(ctx, `${path}.type`, `${node.type} must be inside a paragraph or heading`);
      return null;
    default:
      issue(ctx, `${path}.type`, `unsupported node '${truncate(node.type)}'`);
      return null;
  }
}

function truncate(value: string): string {
  return value.length > 40 ? `${value.slice(0, 40)}…` : value;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Validates and normalizes untrusted rich-text JSON (object or JSON string). Returns the
 * normalized document plus the referenced media asset IDs (body images, lowercase).
 */
export function parseRichTextDocument(input: unknown): ParseRichTextResult {
  let value = input;
  if (typeof value === 'string') {
    if (byteLength(value) > RICH_TEXT_LIMITS.maxSerializedBytes) {
      return { ok: false, issues: [`doc: serialized document exceeds ${RICH_TEXT_LIMITS.maxSerializedBytes} bytes`] };
    }
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return { ok: false, issues: ['doc: document is not valid JSON'] };
    }
  } else {
    let serialized: string | undefined;
    try {
      serialized = JSON.stringify(value);
    } catch {
      return { ok: false, issues: ['doc: document is not serializable'] };
    }
    if (serialized === undefined) return { ok: false, issues: ['doc: document is missing'] };
    if (byteLength(serialized) > RICH_TEXT_LIMITS.maxSerializedBytes) {
      return { ok: false, issues: [`doc: serialized document exceeds ${RICH_TEXT_LIMITS.maxSerializedBytes} bytes`] };
    }
  }

  const ctx: Context = { issues: [], nodes: 0, textLength: 0, assetIds: new Set(), inTable: false };
  let doc: RichTextDocument | null = null;
  try {
    const root = readNode(ctx, value, '', 1);
    if (root) {
      if (root.type !== 'doc') {
        issue(ctx, 'doc', 'root node must be of type doc');
      } else {
        rejectMarks(ctx, root, 'doc');
        doc = { type: 'doc', content: parseBlockContent(ctx, root.content, 'doc', 2, { requireOne: true }) };
      }
    }
  } catch (error) {
    if (!(error instanceof AbortParse)) throw error;
  }
  if (ctx.issues.length > 0 || !doc) return { ok: false, issues: ctx.issues.length > 0 ? ctx.issues : ['doc: invalid document'] };
  return { ok: true, doc, assetIds: [...ctx.assetIds] };
}

/** Minimal valid document: one empty paragraph (what an empty Tiptap editor emits). */
export function emptyDocument(): RichTextDocument {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

function collectText(nodes: readonly BlockNode[], parts: string[], options: { includeTables: boolean }) {
  for (const node of nodes) {
    switch (node.type) {
      case 'paragraph':
      case 'heading':
        parts.push(
          (node.content ?? [])
            .map((inline) => (inline.type === 'text' ? inline.text : ' '))
            .join(''),
        );
        break;
      case 'bulletList':
      case 'orderedList':
        for (const item of node.content) collectText(item.content, parts, options);
        break;
      case 'blockquote':
        collectText(node.content, parts, options);
        break;
      case 'table':
        if (options.includeTables) {
          for (const row of node.content) for (const cell of row.content) collectText(cell.content, parts, options);
        }
        break;
      default:
        break;
    }
  }
}

/** Plain text of a validated document (paragraphs, headings, lists, quotes; tables optional). */
export function plainText(doc: RichTextDocument, options: { includeTables?: boolean } = {}): string {
  const parts: string[] = [];
  collectText(doc.content, parts, { includeTables: options.includeTables ?? true });
  return parts
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Plain-text excerpt (e.g. for a default summary or meta description) cut at a word
 * boundary with an ellipsis. Tables and image captions are excluded.
 */
export function plainTextExcerpt(doc: RichTextDocument, maxChars: number): string {
  const text = plainText(doc, { includeTables: false });
  if (text.length <= maxChars) return text;
  const limit = Math.max(1, maxChars - 1);
  const cut = text.slice(0, limit);
  const boundary = cut.lastIndexOf(' ');
  return `${(boundary > limit * 0.6 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
}

/** True when the document has no visible text and no image (publishing requires content). */
export function isRichTextEmpty(doc: RichTextDocument): boolean {
  if (plainText(doc).trim() !== '') return false;
  let hasImage = false;
  const visit = (nodes: readonly BlockNode[]) => {
    for (const node of nodes) {
      if (hasImage) return;
      if (node.type === 'image') hasImage = true;
      else if (node.type === 'bulletList' || node.type === 'orderedList') node.content.forEach((item) => visit(item.content));
      else if (node.type === 'blockquote') visit(node.content);
      else if (node.type === 'table') node.content.forEach((row) => row.content.forEach((cell) => visit(cell.content)));
    }
  };
  visit(doc.content);
  return !hasImage;
}
