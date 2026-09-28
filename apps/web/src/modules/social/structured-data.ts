import type { ArticleDTO } from '@/modules/content/types';
import { canonicalNewsPath } from '@/modules/games/routes';
import { socialImagePath } from './model';

/** JSON-LD is data, never executable article HTML (including a literal </script>). */
export function serializeStructuredData(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export function articleStructuredData(article: ArticleDTO, origin: string) {
  if (article.isPreview || !article.publishedAt) return null;
  // Canonical section: community posts at /news/<slug>, game posts under their game.
  const url = new URL(`/${article.locale}${canonicalNewsPath(article.game, article.slug)}`, origin).href;
  return {
    '@context': 'https://schema.org', '@type': 'BlogPosting', '@id': `${url}#article`,
    mainEntityOfPage: url, url, headline: article.title, description: article.excerpt,
    inLanguage: article.locale === 'cs' ? 'cs-CZ' : 'en-GB',
    datePublished: article.publishedAt.toISOString(),
    ...(article.updatedAt ? { dateModified: article.updatedAt.toISOString() } : {}),
    image: new URL(socialImagePath(article.locale, 'news', article.slug, article.revisionId), origin).href,
    // A public label may name a person or a team. Keep it in the visible article/OG
    // metadata; do not invent a Person/Organization identity for structured authors.
    publisher: { '@type': 'Organization', name: 'Valkyria', url: new URL(`/${article.locale}`, origin).href },
  };
}
