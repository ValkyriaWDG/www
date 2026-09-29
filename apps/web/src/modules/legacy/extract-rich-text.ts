import { checkLinkHref } from '../content/rich-text/links';
import { parseRichTextDocument, type BlockNode, type InlineNode, type RichTextDocument, type RichTextMark, type TableCellNode, type TableRowNode } from '../content/rich-text/schema';

/** Inert DOM data, never executable MDX/HTML. Attributes are an explicit allowlist. */
export type LegacyDomNode = { tag: string; text?: string; attrs?: Record<string, string>; children?: LegacyDomNode[] };
export type LegacyImageResolver = (url: string, alt: string) => string | null;
type Fragment = BlockNode | InlineNode;
const ignored = new Set(['script', 'style', 'noscript', 'svg', 'button', 'input', 'textarea', 'select', 'template']);
const marksByTag: Readonly<Record<string, RichTextMark['type']>> = { strong: 'bold', b: 'bold', em: 'italic', i: 'italic', u: 'underline', del: 'strike', s: 'strike' };

export function safeLegacyUrl(value: string, pageUrl: string): string | null {
  if (!value || /^[\u0000-\u0020]|[\u0000-\u001f\u007f\\]/.test(value) || value.startsWith('//')) return null;
  try {
    const url = new URL(value, pageUrl).href;
    return checkLinkHref(url).ok ? url : null;
  } catch { return null; }
}

export function legacyImageUrl(value: string, pageUrl: string): string | null {
  let result = safeLegacyUrl(value, pageUrl);
  if (!result) return null;
  const parsed = new URL(result);
  if (parsed.origin === new URL(pageUrl).origin && parsed.pathname === '/_next/image') {
    result = safeLegacyUrl(parsed.searchParams.get('url') ?? '', pageUrl);
  }
  return result && /^https?:/.test(result) ? result : null;
}

function textOf(node: LegacyDomNode): string {
  return node.tag === '#text' ? node.text ?? '' : (node.children ?? []).map(textOf).join('');
}

function isInline(node: Fragment): node is InlineNode { return node.type === 'text' || node.type === 'hardBreak'; }

function group(fragments: Fragment[]): BlockNode[] {
  const blocks: BlockNode[] = [];
  let inline: InlineNode[] = [];
  const flush = () => {
    while (inline[0]?.type === 'text' && !inline[0].text.trim()) inline.shift();
    while (inline.at(-1)?.type === 'text' && !(inline.at(-1) as { text: string }).text.trim()) inline.pop();
    if (inline.length) blocks.push({ type: 'paragraph', content: inline });
    inline = [];
  };
  for (const item of fragments) {
    if (isInline(item)) inline.push(item);
    else { flush(); blocks.push(item); }
  }
  flush();
  return blocks;
}

/** Preserve meaningful rendered content; discard executable markup, keep unsafe link text. */
export function convertLegacyDom(root: LegacyDomNode, options: { pageUrl: string; resolveImage: LegacyImageResolver }): { body: RichTextDocument; warnings: string[] } {
  const warnings = new Set<string>();
  let visited = 0;
  const walk = (node: LegacyDomNode, marks: RichTextMark[] = [], depth = 0): Fragment[] => {
    if (++visited > 30_000 || depth > 60) throw new Error('Legacy DOM exceeds extraction limits');
    const tag = node.tag.toLowerCase();
    const attrs = node.attrs ?? {};
    const children = node.children ?? [];
    const contents = (nextMarks = marks) => children.flatMap((child) => walk(child, nextMarks, depth + 1));
    if (tag === '#text') {
      const text = (node.text ?? '').replace(/\s+/g, ' ');
      return text ? [{ type: 'text', text, ...(marks.length ? { marks } : {}) }] : [];
    }
    if (ignored.has(tag)) return [];
    if (tag === 'br') return [{ type: 'hardBreak' }];
    if (tag === 'hr') return [{ type: 'horizontalRule' }];
    const markType = marksByTag[tag];
    if (markType && markType !== 'link') return contents([...marks.filter((mark) => mark.type !== markType), { type: markType }]);
    if (tag === 'a') {
      const href = safeLegacyUrl(attrs.href ?? '', options.pageUrl);
      if (!href) { warnings.add('Unsafe link omitted; its readable text was retained.'); return contents(marks.filter((mark) => mark.type !== 'link')); }
      return contents([...marks.filter((mark) => mark.type !== 'link'), { type: 'link', attrs: { href } }]);
    }
    if (tag === 'img') {
      const src = legacyImageUrl(attrs.src ?? '', options.pageUrl);
      const alt = (attrs.alt ?? '').slice(0, 300);
      if (!src) { warnings.add('Image with unsafe or missing source omitted.'); return []; }
      const assetId = options.resolveImage(src, alt);
      if (assetId) return [{ type: 'image', attrs: { assetId, alt, caption: (attrs.caption ?? '').slice(0, 500), decorative: !alt, align: 'wide' } }];
      warnings.add('External or unsupported image retained as a source link, pending media review.');
      return [{ type: 'paragraph', content: [{ type: 'text', text: alt ? `Obrázek: ${alt}` : 'Zdrojový obrázek', marks: [{ type: 'link', attrs: { href: src } }] }] }];
    }
    if (tag === 'iframe' || tag === 'video' || tag === 'audio') {
      const src = safeLegacyUrl(attrs.src ?? children.find((child) => child.tag === 'source')?.attrs?.src ?? '', options.pageUrl);
      if (src) {
        warnings.add('Embedded media retained as a source link.');
        return [{ type: 'paragraph', content: [{ type: 'text', text: attrs.title || 'Záznam / původní média', marks: [{ type: 'link', attrs: { href: src } }] }] }];
      }
      warnings.add('Embedded media without a safe URL requires editorial review.');
      return contents();
    }
    if (tag === 'figure') {
      const caption = children.filter((child) => child.tag === 'figcaption').map(textOf).join(' ').trim();
      const result = children.filter((child) => child.tag !== 'figcaption').flatMap((child) => walk(child, marks, depth + 1));
      const first = result.find((item) => item.type === 'image');
      if (first?.type === 'image' && caption) first.attrs.caption = caption.slice(0, 500);
      else if (caption) result.push({ type: 'paragraph', content: [{ type: 'text', text: caption }] });
      return result;
    }
    if (/^h[1-6]$/.test(tag)) {
      if (!['h2', 'h3'].includes(tag)) warnings.add('Heading levels normalized to the supported h2/h3 hierarchy.');
      const fragments = contents();
      const inline = fragments.filter(isInline);
      return [...fragments.filter((item): item is BlockNode => !isInline(item)), ...(inline.length ? [{ type: 'heading' as const, attrs: { level: (tag === 'h1' || tag === 'h2' ? 2 : 3) as 2 | 3 }, content: inline }] : [])];
    }
    if (tag === 'ul' || tag === 'ol') {
      const items = children.filter((child) => child.tag === 'li').map((child) => {
        const content = group((child.children ?? []).flatMap((nested) => walk(nested, marks, depth + 1)));
        if (content[0]?.type !== 'paragraph') content.unshift({ type: 'paragraph' });
        return { type: 'listItem' as const, content };
      });
      if (!items.length) return [];
      return tag === 'ul' ? [{ type: 'bulletList', content: items }] : [{ type: 'orderedList', attrs: { start: Math.max(1, Math.min(100_000, Number(attrs.start) || 1)) }, content: items }];
    }
    if (tag === 'table') {
      const collectRows = (nodes: LegacyDomNode[]): LegacyDomNode[] => nodes.flatMap((n) => n.tag === 'tr' ? [n] : ['thead', 'tbody', 'tfoot'].includes(n.tag) ? collectRows(n.children ?? []) : []);
      const rows: TableRowNode[] = collectRows(children).map((row) => ({
        type: 'tableRow',
        content: (row.children ?? []).filter((cell) => ['th', 'td'].includes(cell.tag)).map((cell): TableCellNode => ({
          type: cell.tag === 'th' ? 'tableHeader' : 'tableCell',
          attrs: { colspan: Math.max(1, Number(cell.attrs?.colspan) || 1), rowspan: Math.max(1, Number(cell.attrs?.rowspan) || 1) },
          content: group((cell.children ?? []).flatMap((child) => walk(child, marks, depth + 1))),
        })),
      }));
      for (const row of rows) for (const cell of row.content) if (!cell.content.length) cell.content.push({ type: 'paragraph' });
      return rows.length ? [{ type: 'table', content: rows }] : [];
    }
    if (tag === 'blockquote') return [{ type: 'blockquote', content: group(contents()) }];
    if (tag === 'pre') {
      warnings.add('Code block retained as plain readable text; executable formatting was removed.');
      return [{ type: 'paragraph', content: textOf(node).split('\n').flatMap((text, index): InlineNode[] => [...(index ? [{ type: 'hardBreak' as const }] : []), ...(text ? [{ type: 'text' as const, text }] : [])]) }];
    }
    if (['p', 'div', 'section', 'article', 'aside', 'main', 'figcaption', 'dt', 'dd', 'details', 'summary', 'header', 'footer'].includes(tag)) return group(contents());
    if (!['span', 'small', 'time', 'code', 'label', 'sup', 'sub', 'source', 'root'].includes(tag)) warnings.add(`Unknown presentation element <${tag}> unwrapped; readable children retained.`);
    return contents();
  };
  const body: RichTextDocument = { type: 'doc', content: group(walk(root)) };
  const parsed = parseRichTextDocument(body);
  if (!parsed.ok) throw new Error(`Legacy rich text is not publishable: ${parsed.issues.join('; ')}`);
  return { body: parsed.doc, warnings: [...warnings] };
}
