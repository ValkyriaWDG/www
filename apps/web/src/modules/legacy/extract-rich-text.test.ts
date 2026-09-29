import { describe, expect, it } from 'vitest';
import { convertLegacyDom, legacyImageUrl, safeLegacyUrl, type LegacyDomNode } from './extract-rich-text';

const ASSET = '01234567-89ab-5cde-8123-456789abcdef';
const text = (value: string): LegacyDomNode => ({ tag: '#text', text: value });
const node = (tag: string, children: LegacyDomNode[] = [], attrs: Record<string, string> = {}): LegacyDomNode => ({ tag, children, attrs });
const convert = (root: LegacyDomNode) => convertLegacyDom(root, { pageUrl: 'https://legacy.example/guide/spawns', resolveImage: (url) => url.startsWith('https://legacy.example/') ? ASSET : null });

describe('legacy published DOM conversion', () => {
  it('preserves headings, emphasis, nested lists and explicit ordering', () => {
    const result = convert(node('div', [node('h1', [text('Spawn guide')]), node('p', [text('Use '), node('strong', [text('cover')])]), node('ol', [node('li', [text('Build'), node('ul', [node('li', [text('Supply')])])])], { start: '3' })]));
    expect(result.body.content[0]).toMatchObject({ type: 'heading', attrs: { level: 2 } });
    expect(result.body.content[1]).toMatchObject({ type: 'paragraph', content: [{ text: 'Use ' }, { text: 'cover', marks: [{ type: 'bold' }] }] });
    expect(result.body.content[2]).toMatchObject({ type: 'orderedList', attrs: { start: 3 }, content: [{ content: [{ type: 'paragraph' }, { type: 'bulletList' }] }] });
  });

  it('retains table values, spans and empty cells', () => {
    const result = convert(node('table', [node('thead', [node('tr', [node('th', [text('Cost')], { colspan: '2' })])]), node('tbody', [node('tr', [node('td', [text('50')]), node('td')])])]));
    expect(result.body.content[0]).toMatchObject({ type: 'table', content: [{ content: [{ type: 'tableHeader', attrs: { colspan: 2 } }] }, { content: [{ content: [{ content: [{ text: '50' }] }] }, { content: [{ type: 'paragraph' }] }] }] });
  });

  it('maps a local Next image and figure caption, external images become usable links', () => {
    const result = convert(node('div', [node('figure', [node('img', [], { src: '/_next/image?url=%2Fuploads%2Fspawn.png&w=1200&q=75', alt: 'HQ' }), node('figcaption', [text('Legacy diagram')])]), node('img', [], { src: 'https://third.example/tank.png', alt: 'Tank diagram' })]));
    expect(result.body.content[0]).toEqual({ type: 'image', attrs: { assetId: ASSET, alt: 'HQ', caption: 'Legacy diagram', decorative: false, align: 'wide' } });
    expect(result.body.content[1]).toMatchObject({ type: 'paragraph', content: [{ text: 'Obrázek: Tank diagram', marks: [{ type: 'link', attrs: { href: 'https://third.example/tank.png' } }] }] });
  });

  it('does not retain script, unsafe URLs, or event handlers', () => {
    const result = convert(node('div', [node('script', [text('steal()')]), node('p', [node('a', [text('safe text')], { href: 'javascript:alert(1)', onclick: 'steal()' })]), node('img', [], { src: 'data:text/html,evil' })]));
    expect(JSON.stringify(result.body)).not.toMatch(/steal|javascript:|data:text/);
    expect(result.body.content).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: 'safe text' }] }]);
  });

  it('preserves a video destination without embedding remote code', () => {
    const result = convert(node('iframe', [], { src: 'https://www.youtube.com/embed/example', title: 'Match replay' }));
    expect(result.body.content[0]).toMatchObject({ content: [{ text: 'Match replay', marks: [{ attrs: { href: 'https://www.youtube.com/embed/example' } }] }] });
  });

  it('keeps inline text on both sides of an image in source order', () => {
    const result = convert(node('p', [text('Before'), node('img', [], { src: '/uploads/test.png', alt: 'test' }), text('After')]));
    expect(result.body.content.map((item) => item.type)).toEqual(['paragraph', 'image', 'paragraph']);
  });

  it('normalizes only safe local links and Next image URLs', () => {
    expect(safeLegacyUrl('/matches/211', 'https://legacy.example/guide/x')).toBe('https://legacy.example/matches/211');
    expect(safeLegacyUrl('//attacker.example/x', 'https://legacy.example')).toBeNull();
    expect(safeLegacyUrl('https://user:pass@legacy.example', 'https://legacy.example')).toBeNull();
    expect(legacyImageUrl('/_next/image?url=javascript%3Aalert(1)', 'https://legacy.example')).toBeNull();
  });
});
