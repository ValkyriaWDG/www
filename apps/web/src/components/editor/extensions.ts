import { Node, type AnyExtension, type NodeConfig } from '@tiptap/core';
import type { DOMOutputSpec } from '@tiptap/pm/model';
import { TableKit } from '@tiptap/extension-table';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';

/** Protocols allowed for links; mirrors the server-side rich-text validator. */
export const LINK_PROTOCOLS = ['http', 'https', 'mailto'] as const;

export function isAllowedLinkHref(href: string): boolean {
  const value = href.trim();
  if (!value || value.length > 2048 || /[\u0000-\u001f\s]/.test(value)) return false;
  try {
    const url = new URL(value);
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return false;
    if (url.username || url.password) return false;
    return true;
  } catch {
    return false;
  }
}

export type ImageAttributes = {
  assetId: string;
  alt: string;
  caption: string;
  decorative: boolean;
  align: 'center' | 'wide';
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    valkyriaImage: {
      /** Inserts a media-library image block (no remote URLs are ever inserted). */
      insertLibraryImage: (attributes: ImageAttributes) => ReturnType;
    };
  }
}

/**
 * Block image referencing a media-library asset by ID. Only elements carrying
 * `data-asset-id` are parsed, so pasted foreign images are dropped instead of hotlinked.
 * The optional `nodeView` is supplied by the React editor.
 */
export function createImageNode(nodeView?: NodeConfig['addNodeView']) {
  return Node.create({
    name: 'image',
    group: 'block',
    atom: true,
    draggable: true,
    selectable: true,
    addAttributes() {
      return {
        assetId: { default: null, parseHTML: (el) => el.getAttribute('data-asset-id') },
        alt: { default: '', parseHTML: (el) => el.querySelector('img')?.getAttribute('alt') ?? '' },
        caption: { default: '', parseHTML: (el) => el.querySelector('figcaption')?.textContent ?? '' },
        decorative: { default: false, parseHTML: (el) => el.getAttribute('data-decorative') === 'true' },
        align: { default: 'center', parseHTML: (el) => (el.getAttribute('data-align') === 'wide' ? 'wide' : 'center') },
      };
    },
    parseHTML() {
      return [{ tag: 'figure[data-asset-id]' }];
    },
    renderHTML({ node }): DOMOutputSpec {
      const assetId = String(node.attrs.assetId ?? '');
      return [
        'figure',
        { 'data-asset-id': assetId, 'data-align': node.attrs.align, 'data-decorative': String(node.attrs.decorative) },
        ['img', { src: `/api/media/${assetId}/full`, alt: node.attrs.decorative ? '' : node.attrs.alt }],
        ['figcaption', {}, String(node.attrs.caption ?? '')],
      ];
    },
    addCommands() {
      return {
        insertLibraryImage:
          (attributes) =>
          ({ commands }) =>
            commands.insertContent({ type: this.name, attrs: attributes }),
      };
    },
    ...(nodeView ? { addNodeView: nodeView } : {}),
  });
}

export type EditorExtensionOptions = {
  placeholder?: string;
  imageNodeView?: NodeConfig['addNodeView'];
};

/**
 * Tiptap extensions implementing rich-text schema v1 exactly: paragraphs, H2/H3,
 * bold/italic/underline/strike, safe links, lists, blockquote, separator, hard break,
 * media-library images and basic tables. Code, code blocks, colors and fonts are not
 * registered, so pasted markup using them is normalized away by the schema.
 */
export function buildEditorExtensions(options: EditorExtensionOptions = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      code: false,
      codeBlock: false,
      heading: { levels: [2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        protocols: [...LINK_PROTOCOLS],
        isAllowedUri: (url) => isAllowedLinkHref(url),
        shouldAutoLink: (url) => isAllowedLinkHref(url),
        HTMLAttributes: { rel: 'noopener noreferrer', target: null },
      },
    }),
    TableKit.configure({ table: { resizable: false } }),
    createImageNode(options.imageNodeView),
    Placeholder.configure({ placeholder: options.placeholder ?? '' }),
    CharacterCount,
  ];
}
