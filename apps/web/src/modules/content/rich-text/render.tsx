import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { checkLinkHref, isExternalHref } from './links';
import type { BlockNode, InlineNode, RichTextDocument, RichTextMark, TableCellNode, TableRowNode, TextNode } from './schema';
import styles from './rich-text.module.css';

/**
 * Server-rendered rich text. Produces React elements only (React escapes all text and
 * attribute values; no `dangerouslySetInnerHTML`). It never imports editor code, so
 * public routes do not download the Tiptap bundle. The same component renders public
 * articles, admin previews, match recaps and member biographies.
 *
 * The renderer is defensive even though stored documents are validated on save:
 * unknown nodes are skipped, links are re-checked and images render only when the
 * caller resolved the asset (missing/deleted assets are omitted, text is kept).
 */

export type RichTextAssetInfo = { width: number; height: number };
export type RichTextAssets = ReadonlyMap<string, RichTextAssetInfo>;

export type RichTextLabels = {
  /** Accessible name of the horizontally scrollable table region. */
  tableRegion: string;
  /** Visually hidden suffix announced for links that leave the site. */
  externalLink: string;
};

export type RichTextProps = {
  doc: RichTextDocument;
  assets: RichTextAssets;
  labels: RichTextLabels;
  /** Site origin; links to other origins (and mailto:) get the external indicator. */
  siteOrigin?: string;
  className?: string;
  /** Fragment ids of top-level headings by block index (see {@link headingOutline}). */
  anchors?: ReadonlyMap<number, string>;
  /** Replaces a checked link target; `null` keeps the text without a link. */
  rewriteLink?: (href: string) => string | null;
};

/** Public URL of a delivered media variant (publication-aware route). */
export function mediaUrl(assetId: string, variant: 'full' | 'thumb' = 'full'): string {
  return `/api/media/${encodeURIComponent(assetId)}/${variant}`;
}

type RenderContext = Pick<RichTextProps, 'assets' | 'labels' | 'siteOrigin' | 'rewriteLink'>;

export type OutlineEntry = { id: string; level: 2 | 3; text: string; index: number };

function inlineText(nodes: readonly InlineNode[] | undefined): string {
  return (nodes ?? [])
    .map((node) => (node?.type === 'text' && typeof node.text === 'string' ? node.text : ' '))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Table of contents of the top-level headings with stable, unique fragment ids derived
 * from the heading text (ASCII-folded; `section-N` when nothing remains). Pass
 * `anchors` from {@link outlineAnchors} to {@link RichText} so the ids match.
 */
export function headingOutline(doc: RichTextDocument): OutlineEntry[] {
  const content = Array.isArray(doc?.content) ? doc.content : [];
  const used = new Set<string>();
  const outline: OutlineEntry[] = [];
  content.forEach((node, index) => {
    if (node?.type !== 'heading') return;
    const text = inlineText(node.content);
    if (!text) return;
    const base =
      text
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
        .replace(/-+$/g, '') || `section-${outline.length + 1}`;
    let id = base;
    for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
    used.add(id);
    outline.push({ id, level: node.attrs?.level === 3 ? 3 : 2, text, index });
  });
  return outline;
}

export function outlineAnchors(outline: readonly OutlineEntry[]): ReadonlyMap<number, string> {
  return new Map(outline.map((entry) => [entry.index, entry.id]));
}

export function RichText({ doc, assets, labels, siteOrigin, className, anchors, rewriteLink }: RichTextProps) {
  const ctx: RenderContext = { assets, labels, siteOrigin, rewriteLink };
  const content = Array.isArray(doc?.content) ? doc.content : [];
  return <div className={className ? `${styles.root} ${className}` : styles.root}>{renderBlocks(content, ctx, anchors)}</div>;
}

function renderBlocks(nodes: readonly BlockNode[], ctx: RenderContext, anchors?: ReadonlyMap<number, string>): ReactNode[] {
  return nodes.map((node, index) => renderBlock(node, index, ctx, anchors?.get(index)));
}

function renderBlock(node: BlockNode, key: number, ctx: RenderContext, anchor?: string): ReactNode {
  switch (node?.type) {
    case 'paragraph': {
      const inline = renderInline(node.content ?? [], ctx);
      return inline.length > 0 ? <p key={key}>{inline}</p> : null;
    }
    case 'heading': {
      const inline = renderInline(node.content ?? [], ctx);
      if (inline.length === 0) return null;
      return node.attrs?.level === 3 ? (
        <h3 key={key} id={anchor}>
          {inline}
        </h3>
      ) : (
        <h2 key={key} id={anchor}>
          {inline}
        </h2>
      );
    }
    case 'bulletList':
      return <ul key={key}>{node.content.map((item, i) => <li key={i}>{renderBlocks(item.content ?? [], ctx)}</li>)}</ul>;
    case 'orderedList': {
      const start = Number.isInteger(node.attrs?.start) && node.attrs.start > 1 ? node.attrs.start : undefined;
      return (
        <ol key={key} start={start}>
          {node.content.map((item, i) => (
            <li key={i}>{renderBlocks(item.content ?? [], ctx)}</li>
          ))}
        </ol>
      );
    }
    case 'blockquote':
      return <blockquote key={key}>{renderBlocks(node.content ?? [], ctx)}</blockquote>;
    case 'horizontalRule':
      return <hr key={key} />;
    case 'image': {
      const attrs = node.attrs;
      const asset = attrs && typeof attrs.assetId === 'string' ? ctx.assets.get(attrs.assetId) : undefined;
      if (!asset) return null;
      const caption = typeof attrs.caption === 'string' ? attrs.caption.trim() : '';
      // The stored size bounds the figure: no upscaling, and tall images stay within the viewport.
      const size = { '--image-width': `${asset.width}px`, '--image-ratio': (asset.width / asset.height).toFixed(4) } as CSSProperties;
      return (
        <figure key={key} className={attrs.align === 'wide' ? styles.figureWide : styles.figure} style={size}>
          {/* eslint-disable-next-line @next/next/no-img-element -- publication-aware media route, not the optimizer */}
          <img
            src={mediaUrl(attrs.assetId)}
            alt={attrs.decorative ? '' : (attrs.alt ?? '')}
            width={asset.width}
            height={asset.height}
            loading="lazy"
            decoding="async"
          />
          {caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null}
        </figure>
      );
    }
    case 'table':
      return renderTable(node.content ?? [], key, ctx);
    default:
      return null;
  }
}

function renderTable(rows: readonly TableRowNode[], key: number, ctx: RenderContext): ReactNode {
  if (rows.length === 0) return null;
  const [first, ...rest] = rows;
  const headerRow = first && first.content.length > 0 && first.content.every((cell) => cell.type === 'tableHeader');
  const bodyRows = headerRow ? rest : rows;
  const columns = Math.max(...rows.map((row) => row.content.reduce((sum, cell) => sum + (cell.attrs?.colspan > 1 ? cell.attrs.colspan : 1), 0)));
  return (
    <div key={key} className={styles.tableScroll} role="region" aria-label={ctx.labels.tableRegion} tabIndex={0}>
      <table className={styles.table} data-narrow={columns <= 3 ? '' : undefined}>
        {headerRow ? (
          <thead>
            <tr>{first.content.map((cell, i) => renderCell(cell, i, 'col', ctx))}</tr>
          </thead>
        ) : null}
        {bodyRows.length > 0 ? (
          <tbody>
            {bodyRows.map((row, r) => (
              <tr key={r}>{row.content.map((cell, i) => renderCell(cell, i, 'row', ctx))}</tr>
            ))}
          </tbody>
        ) : null}
      </table>
    </div>
  );
}

function renderCell(cell: TableCellNode, key: number, headerScope: 'col' | 'row', ctx: RenderContext): ReactNode {
  const colSpan = cell.attrs?.colspan > 1 ? cell.attrs.colspan : undefined;
  const rowSpan = cell.attrs?.rowspan > 1 ? cell.attrs.rowspan : undefined;
  const children = renderBlocks(cell.content ?? [], ctx);
  if (cell.type === 'tableHeader') {
    return (
      <th key={key} scope={headerScope} colSpan={colSpan} rowSpan={rowSpan}>
        {children}
      </th>
    );
  }
  return (
    <td key={key} colSpan={colSpan} rowSpan={rowSpan}>
      {children}
    </td>
  );
}

function linkOf(node: InlineNode, ctx: RenderContext): string | null {
  if (node.type !== 'text' || !node.marks) return null;
  const link = node.marks.find((mark): mark is Extract<RichTextMark, { type: 'link' }> => mark.type === 'link');
  if (!link) return null;
  const checked = checkLinkHref(link.attrs?.href);
  if (!checked.ok) return null;
  return ctx.rewriteLink ? ctx.rewriteLink(checked.href) : checked.href;
}

/** Groups consecutive text nodes sharing one link target into a single anchor. */
function renderInline(nodes: readonly InlineNode[], ctx: RenderContext): ReactNode[] {
  const result: ReactNode[] = [];
  let index = 0;
  while (index < nodes.length) {
    const node = nodes[index]!;
    const href = linkOf(node, ctx);
    if (href) {
      const group: TextNode[] = [];
      while (index < nodes.length && linkOf(nodes[index]!, ctx) === href) {
        group.push(nodes[index] as TextNode);
        index += 1;
      }
      const external = isExternalHref(href, ctx.siteOrigin);
      result.push(
        <a
          key={`a${index}`}
          href={href}
          rel="noopener noreferrer"
          className={external ? styles.externalLink : undefined}
          data-external={external ? 'true' : undefined}
        >
          {group.map((text, i) => renderText(text, i))}
          {external ? <span className="visually-hidden"> ({ctx.labels.externalLink})</span> : null}
        </a>,
      );
      continue;
    }
    if (node.type === 'hardBreak') result.push(<br key={`b${index}`} />);
    else if (node.type === 'text' && typeof node.text === 'string') result.push(renderText(node, `t${index}`));
    index += 1;
  }
  return result;
}

const MARK_ORDER = ['bold', 'italic', 'underline', 'strike'] as const;

function renderText(node: TextNode, key: string | number): ReactNode {
  let element: ReactNode = node.text;
  const types = new Set((node.marks ?? []).map((mark) => mark.type));
  for (const type of [...MARK_ORDER].reverse()) {
    if (!types.has(type)) continue;
    if (type === 'bold') element = <strong>{element}</strong>;
    else if (type === 'italic') element = <em>{element}</em>;
    else if (type === 'underline') element = <u>{element}</u>;
    else element = <s>{element}</s>;
  }
  return <Fragment key={key}>{element}</Fragment>;
}
