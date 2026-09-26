import { Fragment, type ReactNode } from 'react';
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
};

/** Public URL of a delivered media variant (publication-aware route). */
export function mediaUrl(assetId: string, variant: 'full' | 'thumb' = 'full'): string {
  return `/api/media/${encodeURIComponent(assetId)}/${variant}`;
}

type RenderContext = Pick<RichTextProps, 'assets' | 'labels' | 'siteOrigin'>;

export function RichText({ doc, assets, labels, siteOrigin, className }: RichTextProps) {
  const ctx: RenderContext = { assets, labels, siteOrigin };
  const content = Array.isArray(doc?.content) ? doc.content : [];
  return <div className={className ? `${styles.root} ${className}` : styles.root}>{renderBlocks(content, ctx)}</div>;
}

function renderBlocks(nodes: readonly BlockNode[], ctx: RenderContext): ReactNode[] {
  return nodes.map((node, index) => renderBlock(node, index, ctx));
}

function renderBlock(node: BlockNode, key: number, ctx: RenderContext): ReactNode {
  switch (node?.type) {
    case 'paragraph': {
      const inline = renderInline(node.content ?? [], ctx);
      return inline.length > 0 ? <p key={key}>{inline}</p> : null;
    }
    case 'heading': {
      const inline = renderInline(node.content ?? [], ctx);
      if (inline.length === 0) return null;
      return node.attrs?.level === 3 ? <h3 key={key}>{inline}</h3> : <h2 key={key}>{inline}</h2>;
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
      return (
        <figure key={key} className={attrs.align === 'wide' ? styles.figureWide : styles.figure}>
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
  return (
    <div key={key} className={styles.tableScroll} role="region" aria-label={ctx.labels.tableRegion} tabIndex={0}>
      <table className={styles.table}>
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

function linkOf(node: InlineNode): string | null {
  if (node.type !== 'text' || !node.marks) return null;
  const link = node.marks.find((mark): mark is Extract<RichTextMark, { type: 'link' }> => mark.type === 'link');
  if (!link) return null;
  const checked = checkLinkHref(link.attrs?.href);
  return checked.ok ? checked.href : null;
}

/** Groups consecutive text nodes sharing one link target into a single anchor. */
function renderInline(nodes: readonly InlineNode[], ctx: RenderContext): ReactNode[] {
  const result: ReactNode[] = [];
  let index = 0;
  while (index < nodes.length) {
    const node = nodes[index]!;
    const href = linkOf(node);
    if (href) {
      const group: TextNode[] = [];
      while (index < nodes.length && linkOf(nodes[index]!) === href) {
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
