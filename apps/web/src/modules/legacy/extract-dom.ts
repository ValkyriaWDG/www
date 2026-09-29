import type { Page } from '@playwright/test';
import type { LegacyDomNode } from './extract-rich-text';

/** DOMParser creates an inert document. The browser page stays blank and all requests are blocked. */
export async function readLegacyPublicDom(page: Page, html: string, selector: 'mdx' | 'about'): Promise<LegacyDomNode> {
  if (Buffer.byteLength(html) > 8_000_000) throw new Error('Legacy HTML exceeds 8 MB');
  return page.evaluate(({ html, selector }) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const candidates: Element[] = [];
    for (const element of doc.querySelectorAll(selector === 'mdx' ? '.mdx' : 'main')) {
      if (selector === 'mdx' || element.querySelector('#about')) candidates.push(element);
    }
    const selected = selector === 'about' ? candidates.at(-1) : candidates[0];
    if (!selected || (selector === 'mdx' && candidates.length !== 1)) throw new Error('Expected one public content container');
    let count = 0;
    const root: LegacyDomNode = { tag: 'root' };
    const pending = [{ node: selected as Node, target: root, depth: 0 }];
    while (pending.length) {
      const { node, target, depth } = pending.pop()!;
      if (++count > 30_000 || depth > 60) throw new Error('Legacy HTML exceeds node limits');
      if (node.nodeType === Node.TEXT_NODE) { target.tag = '#text'; target.text = node.textContent ?? ''; continue; }
      if (!(node instanceof Element)) continue;
      const attrs: Record<string, string> = {};
      for (const name of ['src', 'alt', 'href', 'title', 'colspan', 'rowspan', 'start']) {
        const value = node.getAttribute(name);
        if (value !== null) attrs[name] = value;
      }
      target.tag = node.tagName.toLowerCase(); target.attrs = attrs; target.children = [];
      for (const child of node.childNodes) {
        const childTarget: LegacyDomNode = { tag: 'root' };
        target.children.push(childTarget);
        pending.push({ node: child, target: childTarget, depth: depth + 1 });
      }
    }
    return root;
  }, { html, selector });
}
