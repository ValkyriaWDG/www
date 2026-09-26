/**
 * Link policy for rich text (shared by the validator and the renderer). Only absolute
 * `http:`, `https:` and `mailto:` targets are accepted; credentials, protocol-relative
 * URLs, script-capable schemes and whitespace/control/invisible-character tricks are
 * rejected. Isomorphic: no Node or DOM APIs beyond WHATWG `URL`.
 */

export const MAX_LINK_LENGTH = 2048;

const ALLOWED_SCHEMES = ['http:', 'https:', 'mailto:'] as const;

// C0/C1 controls, space, DEL and invisible/bidirectional formatting characters.
const FORBIDDEN_CHARS = /[\u0000-\u0020\u007f-\u00a0\u1680\u180e\u2000-\u200f\u2028-\u202f\u205f-\u2064\u3000\ufeff]/u;

export type LinkCheck = { ok: true; href: string } | { ok: false; reason: string };

/**
 * Validates and normalizes a link target. The returned `href` keeps the author's URL
 * but lowercases the scheme so renderers never see mixed-case scheme tricks.
 */
export function checkLinkHref(input: unknown): LinkCheck {
  if (typeof input !== 'string') return { ok: false, reason: 'href must be a string' };
  const trimmed = input.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
  if (trimmed === '') return { ok: false, reason: 'href is empty' };
  if (trimmed.length > MAX_LINK_LENGTH) return { ok: false, reason: 'href is too long' };
  if (FORBIDDEN_CHARS.test(trimmed)) return { ok: false, reason: 'href contains whitespace or control characters' };
  if (trimmed.includes('\\')) return { ok: false, reason: 'href contains a backslash' };

  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
  if (!schemeMatch) return { ok: false, reason: 'href must be an absolute http(s) or mailto URL' };
  const scheme = `${schemeMatch[1]!.toLowerCase()}:`;
  if (!(ALLOWED_SCHEMES as readonly string[]).includes(scheme)) return { ok: false, reason: 'href scheme is not allowed' };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'href is not a valid URL' };
  }
  if (url.protocol !== scheme) return { ok: false, reason: 'href scheme is ambiguous' };

  const normalized = `${scheme}${trimmed.slice(schemeMatch[0].length)}`;
  if (scheme === 'mailto:') {
    const address = normalized.slice('mailto:'.length).split('?')[0] ?? '';
    if (!/^[^@\s/]+@[^@\s/]+$/.test(decodeSafe(address))) return { ok: false, reason: 'mailto address is invalid' };
    return { ok: true, href: normalized };
  }

  // http(s): require `scheme://host`, no userinfo (credentials or `user@` host spoofing).
  if (!/^https?:\/\/[^/]/i.test(normalized)) return { ok: false, reason: 'href must include a host' };
  if (url.username !== '' || url.password !== '') return { ok: false, reason: 'href must not contain credentials' };
  const authority = normalized.slice(scheme.length + 2).split(/[/?#]/)[0] ?? '';
  if (authority.includes('@')) return { ok: false, reason: 'href must not contain credentials' };
  if (url.hostname === '') return { ok: false, reason: 'href must include a host' };
  return { ok: true, href: normalized };
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * True when the link leaves the site. `mailto:` counts as external. The site origin is
 * supplied by the caller so this module stays free of server configuration.
 */
export function isExternalHref(href: string, siteOrigin: string | undefined): boolean {
  if (href.startsWith('mailto:')) return true;
  if (!siteOrigin) return true;
  try {
    return new URL(href).origin !== new URL(siteOrigin).origin;
  } catch {
    return true;
  }
}
