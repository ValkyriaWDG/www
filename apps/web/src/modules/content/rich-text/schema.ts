import type { RichTextDocument } from '@valkyria/db';

/*
 * TEMPORARY STUB owned by the content slice. It validates the documented v1 rich-text
 * vocabulary strictly enough for the match/member slice to compile and test its seed
 * and fixture bodies. The integrator keeps the content slice's implementation.
 */

export const RICH_TEXT_SCHEMA_VERSION = 1;
export type { RichTextDocument };

export type RichTextParseResult =
  | { ok: true; doc: RichTextDocument; assetIds: string[] }
  | { ok: false; issues: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NODES = 20_000;
const MAX_DEPTH = 16;

type Node = { type?: unknown; attrs?: unknown; content?: unknown; text?: unknown; marks?: unknown };

const INLINE = new Set(['text', 'hardBreak']);
const BLOCK = new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'horizontalRule', 'image', 'table']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeHref(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:';
  } catch {
    return false;
  }
}

export function parseRichTextDocument(input: unknown): RichTextParseResult {
  const issues: string[] = [];
  const assetIds = new Set<string>();
  let count = 0;

  const attrsOnly = (node: Node, path: string, allowed: string[]) => {
    if (node.attrs === undefined) return {} as Record<string, unknown>;
    if (!isRecord(node.attrs)) {
      issues.push(`${path}: attrs must be an object`);
      return {} as Record<string, unknown>;
    }
    for (const key of Object.keys(node.attrs)) if (!allowed.includes(key)) issues.push(`${path}: unsupported attribute ${key}`);
    return node.attrs;
  };

  const children = (node: Node, path: string, allowed: Set<string>, required: boolean, depth: number) => {
    if (node.content === undefined) {
      if (required) issues.push(`${path}: content required`);
      return;
    }
    if (!Array.isArray(node.content)) {
      issues.push(`${path}: content must be an array`);
      return;
    }
    if (required && node.content.length === 0) issues.push(`${path}: content required`);
    node.content.forEach((child, index) => visit(child, `${path}.${index}`, allowed, depth + 1));
  };

  const visit = (value: unknown, path: string, allowed: Set<string>, depth: number): void => {
    count += 1;
    if (count > MAX_NODES) {
      if (count === MAX_NODES + 1) issues.push('document exceeds node limit');
      return;
    }
    if (depth > MAX_DEPTH) {
      issues.push(`${path}: nesting too deep`);
      return;
    }
    if (!isRecord(value)) {
      issues.push(`${path}: node must be an object`);
      return;
    }
    const node = value as Node;
    const type = typeof node.type === 'string' ? node.type : '';
    if (!allowed.has(type)) {
      issues.push(`${path}: unsupported node ${type || '(none)'}`);
      return;
    }
    for (const key of Object.keys(node)) {
      if (!['type', 'attrs', 'content', 'text', 'marks'].includes(key)) issues.push(`${path}: unsupported key ${key}`);
    }
    if (type !== 'text' && node.marks !== undefined) issues.push(`${path}: marks only allowed on text`);
    switch (type) {
      case 'text': {
        if (typeof node.text !== 'string' || node.text.length === 0) issues.push(`${path}: text must be non-empty`);
        if (node.marks !== undefined) {
          if (!Array.isArray(node.marks)) issues.push(`${path}: marks must be an array`);
          else
            node.marks.forEach((mark, index) => {
              if (!isRecord(mark)) return issues.push(`${path}.marks.${index}: invalid mark`);
              if (['bold', 'italic', 'underline', 'strike'].includes(String(mark.type))) {
                if (mark.attrs !== undefined && !(isRecord(mark.attrs) && Object.keys(mark.attrs).length === 0))
                  issues.push(`${path}.marks.${index}: unexpected attrs`);
              } else if (mark.type === 'link') {
                if (!isRecord(mark.attrs) || !safeHref(mark.attrs.href)) issues.push(`${path}.marks.${index}: unsafe link`);
                else for (const key of Object.keys(mark.attrs)) if (key !== 'href') issues.push(`${path}.marks.${index}: unsupported link attribute ${key}`);
              } else issues.push(`${path}.marks.${index}: unsupported mark`);
            });
        }
        return;
      }
      case 'hardBreak':
      case 'horizontalRule':
        attrsOnly(node, path, []);
        if (node.content !== undefined) issues.push(`${path}: no content allowed`);
        return;
      case 'paragraph':
        attrsOnly(node, path, []);
        return children(node, path, INLINE, false, depth);
      case 'heading': {
        const attrs = attrsOnly(node, path, ['level']);
        if (attrs.level !== 2 && attrs.level !== 3) issues.push(`${path}: heading level must be 2 or 3`);
        return children(node, path, INLINE, false, depth);
      }
      case 'bulletList':
        attrsOnly(node, path, []);
        return children(node, path, new Set(['listItem']), true, depth);
      case 'orderedList': {
        const attrs = attrsOnly(node, path, ['start']);
        if (attrs.start !== undefined && !(Number.isInteger(attrs.start) && (attrs.start as number) >= 1))
          issues.push(`${path}: invalid start`);
        return children(node, path, new Set(['listItem']), true, depth);
      }
      case 'listItem': {
        attrsOnly(node, path, []);
        const first = Array.isArray(node.content) ? (node.content[0] as Node | undefined) : undefined;
        if (!first || first.type !== 'paragraph') issues.push(`${path}: list item must start with a paragraph`);
        return children(node, path, new Set(['paragraph', 'bulletList', 'orderedList']), true, depth);
      }
      case 'blockquote':
        attrsOnly(node, path, []);
        return children(node, path, new Set(['paragraph', 'bulletList', 'orderedList']), true, depth);
      case 'image': {
        const attrs = attrsOnly(node, path, ['assetId', 'alt', 'caption', 'decorative', 'align']);
        if (typeof attrs.assetId !== 'string' || !UUID.test(attrs.assetId)) issues.push(`${path}: image requires assetId`);
        else assetIds.add(attrs.assetId.toLowerCase());
        if (attrs.alt !== undefined && typeof attrs.alt !== 'string') issues.push(`${path}: alt must be text`);
        if (attrs.caption !== undefined && typeof attrs.caption !== 'string') issues.push(`${path}: caption must be text`);
        if (attrs.decorative !== undefined && typeof attrs.decorative !== 'boolean') issues.push(`${path}: decorative must be boolean`);
        if (attrs.align !== undefined && attrs.align !== 'center' && attrs.align !== 'wide') issues.push(`${path}: invalid align`);
        if (node.content !== undefined) issues.push(`${path}: no content allowed`);
        return;
      }
      case 'table':
        attrsOnly(node, path, []);
        return children(node, path, new Set(['tableRow']), true, depth);
      case 'tableRow':
        attrsOnly(node, path, []);
        return children(node, path, new Set(['tableHeader', 'tableCell']), true, depth);
      case 'tableHeader':
      case 'tableCell': {
        const attrs = attrsOnly(node, path, ['colspan', 'rowspan']);
        for (const key of ['colspan', 'rowspan'] as const) {
          const span = attrs[key];
          if (span !== undefined && !(Number.isInteger(span) && (span as number) >= 1 && (span as number) <= 50)) issues.push(`${path}: invalid ${key}`);
        }
        return children(node, path, new Set(['paragraph']), true, depth);
      }
      default:
        issues.push(`${path}: unsupported node ${type}`);
    }
  };

  if (!isRecord(input) || input.type !== 'doc') return { ok: false, issues: ['root must be a doc node'] };
  for (const key of Object.keys(input)) if (key !== 'type' && key !== 'content') issues.push(`doc: unsupported key ${key}`);
  if (input.content !== undefined) {
    if (!Array.isArray(input.content)) issues.push('doc: content must be an array');
    else input.content.forEach((child, index) => visit(child, `doc.${index}`, BLOCK, 1));
  }
  if (issues.length > 0) return { ok: false, issues: issues.slice(0, 50) };
  return { ok: true, doc: input as RichTextDocument, assetIds: [...assetIds] };
}
