import 'server-only';
import type { Executor } from '@valkyria/db';
import type { Locale } from '@valkyria/db/schema';
import { getDb } from '@/lib/db';
import { checkLinkHref } from '@/modules/content/rich-text/links';
import type { RichTextDocument } from '@/modules/content/rich-text/schema';
import { isLegacyHllUrl, resolveLegacyHllPath } from './hll';
import { resolvePublishedLegacyHllUrl } from './resolve-public-url';

/** Checked link targets in a stored document that point to the former HLL website. */
export function legacyLinkTargets(doc: RichTextDocument): string[] {
  const found = new Set<string>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const { marks, content } = node as { marks?: unknown; content?: unknown };
    if (Array.isArray(marks)) {
      for (const mark of marks as { type?: unknown; attrs?: { href?: unknown } }[]) {
        if (mark?.type !== 'link') continue;
        const checked = checkLinkHref(mark.attrs?.href);
        if (checked.ok && isLegacyHllUrl(checked.href)) found.add(checked.href);
      }
    }
    if (Array.isArray(content)) content.forEach(visit);
  };
  visit(doc);
  return [...found];
}

/**
 * On-site page of a former-website URL in the requested locale: a collection maps to its
 * section, a detail to its currently published import. English falls back to the Czech
 * page, which is all the former website had. `null` when nothing public corresponds.
 */
export async function onSiteLegacyTarget(db: Executor, href: string, locale: Locale): Promise<string | null> {
  const url = URL.parse(href);
  if (!url) return null;
  const resolution = resolveLegacyHllPath(url.pathname, url.searchParams);
  if (resolution?.kind === 'redirect') return resolution.target.replace(/^\/cs(?=[/?]|$)/, `/${locale}`);
  if (resolution?.kind !== 'lookup') return null;
  return (await resolvePublishedLegacyHllUrl(db, url.pathname, locale))
    ?? (locale === 'cs' ? null : resolvePublishedLegacyHllUrl(db, url.pathname, 'cs'));
}

/**
 * Link rewrite for public rich text: imported bodies still hold absolute links to the
 * former website, which public pages must not send visitors to. Each becomes its on-site
 * page, or plain text when none is public. Undefined (no database access) when the
 * document has no such link.
 */
export async function legacyLinkRewrite(doc: RichTextDocument, locale: Locale): Promise<((href: string) => string | null) | undefined> {
  const targets = legacyLinkTargets(doc);
  if (targets.length === 0) return undefined;
  const db = getDb();
  // A failed lookup must not break the page: that link keeps only its text.
  const resolved = new Map(await Promise.all(targets.map(async (href) => [href, await onSiteLegacyTarget(db, href, locale).catch(() => null)] as const)));
  return (href) => (resolved.has(href) ? resolved.get(href) ?? null : href);
}
