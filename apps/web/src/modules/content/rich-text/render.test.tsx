import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RichText } from './render';
import { parseRichTextDocument, type RichTextDocument } from './schema';

const ASSET = '0d2b8a9e-5a4c-4b7d-8f3e-1c2d3e4f5a61';
const MISSING = '0d2b8a9e-5a4c-4b7d-8f3e-1c2d3e4f5a62';
const labels = { tableRegion: 'Tabulka (posuňte vodorovně)', externalLink: 'externí odkaz' };

function render(input: unknown, assets = new Map([[ASSET, { width: 1600, height: 900 }]])) {
  const parsed = parseRichTextDocument(input);
  if (!parsed.ok) throw new Error(parsed.issues.join('\n'));
  return renderToStaticMarkup(<RichText doc={parsed.doc} assets={assets} labels={labels} siteOrigin="https://valkyriawdg.cz" />);
}

describe('RichText renderer', () => {
  it('escapes text that looks like markup instead of injecting HTML', () => {
    const html = render({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '<script>alert(1)</script><img src=x onerror=alert(1)>' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '"quoted" & <b>bold</b>' }] },
      ],
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('<h3>&quot;quoted&quot; &amp; &lt;b&gt;bold&lt;/b&gt;</h3>');
  });

  it('renders marks, headings, lists, quotes and separators semantically', () => {
    const html = render({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Hlavní' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'B', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'I', marks: [{ type: 'italic' }] },
            { type: 'text', text: 'U', marks: [{ type: 'underline' }] },
            { type: 'text', text: 'S', marks: [{ type: 'strike' }] },
            { type: 'hardBreak' },
            { type: 'text', text: 'end' },
          ],
        },
        { type: 'orderedList', attrs: { start: 4 }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'čtyři' }] }] }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'bod' }] }] }] },
        { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'citace' }] }] },
        { type: 'horizontalRule' },
      ],
    });
    expect(html).toContain('<h2>Hlavní</h2>');
    expect(html).toContain('<strong>B</strong><em>I</em><u>U</u><s>S</s><br/>end');
    expect(html).toContain('<ol start="4"><li><p>čtyři</p></li></ol>');
    expect(html).toContain('<ul><li><p>bod</p></li></ul>');
    expect(html).toContain('<blockquote><p>citace</p></blockquote>');
    expect(html).toContain('<hr/>');
    expect(html).not.toContain('dangerouslySetInnerHTML');
  });

  it('renders safe links with rel and an accessible external indicator', () => {
    const html = render({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'HLL ', marks: [{ type: 'link', attrs: { href: 'https://valkyriahll.cz/', target: '_blank' } }] },
            { type: 'text', text: 'web', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://valkyriahll.cz/' } }] },
            { type: 'text', text: ' a ' },
            { type: 'text', text: 'novinky', marks: [{ type: 'link', attrs: { href: 'https://valkyriawdg.cz/cs/news' } }] },
          ],
        },
      ],
    });
    // Consecutive runs with one target form a single anchor.
    expect(html.match(/href="https:\/\/valkyriahll\.cz\/"/g)).toHaveLength(1);
    expect(html).toContain('<a href="https://valkyriahll.cz/" rel="noopener noreferrer"');
    expect(html).toContain('HLL <strong>web</strong><span class="visually-hidden"> (externí odkaz)</span></a>');
    expect(html).not.toContain('target=');
    const internal = html.slice(html.indexOf('https://valkyriawdg.cz/cs/news'));
    expect(internal).not.toContain('externí odkaz');
  });

  it('never renders an unsafe href even if an unvalidated document reaches the renderer', () => {
    const unsafe = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'click', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }],
    } as unknown as RichTextDocument;
    const html = renderToStaticMarkup(<RichText doc={unsafe} assets={new Map()} labels={labels} />);
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<a');
    expect(html).toContain('click');
  });

  it('renders images through the media route and omits missing assets while keeping text', () => {
    const html = render({
      type: 'doc',
      content: [
        { type: 'image', attrs: { assetId: ASSET, alt: 'Tank v lese', caption: 'Foto: redakce', align: 'wide' } },
        { type: 'image', attrs: { assetId: MISSING, alt: 'Chybí' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'Text zůstává' }] },
        { type: 'image', attrs: { assetId: ASSET, alt: '', decorative: true } },
      ],
    });
    expect(html).toContain(
      `<img src="/api/media/${ASSET}/full" alt="Tank v lese" width="1600" height="900" loading="lazy" decoding="async"/>`,
    );
    expect(html).toContain('Foto: redakce</figcaption>');
    expect(html).not.toContain(MISSING);
    expect(html).not.toContain('Chybí');
    expect(html).toContain('Text zůstává');
    expect(html).toContain(`<img src="/api/media/${ASSET}/full" alt="" width="1600"`);
    expect(html.match(/<figure/g)).toHaveLength(2);
  });

  it('wraps tables in a labelled, focusable scroll region with header semantics', () => {
    const cell = (type: string, value: string, attrs: Record<string, unknown> = {}) => ({
      type,
      attrs: { colspan: 1, rowspan: 1, ...attrs },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
    });
    const html = render({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            { type: 'tableRow', content: [cell('tableHeader', 'Mapa'), cell('tableHeader', 'Skóre')] },
            { type: 'tableRow', content: [cell('tableCell', 'Foy'), cell('tableCell', '3:2')] },
            { type: 'tableRow', content: [cell('tableCell', 'Celkem', { colspan: 2 })] },
          ],
        },
      ],
    });
    expect(html).toMatch(/<div class="[^"]*" role="region" aria-label="Tabulka \(posuňte vodorovně\)" tabindex="0"><table/);
    expect(html).toContain('<thead><tr><th scope="col"><p>Mapa</p></th><th scope="col"><p>Skóre</p></th></tr></thead>');
    expect(html).toContain('<td colSpan="2"><p>Celkem</p></td>');
  });
});
