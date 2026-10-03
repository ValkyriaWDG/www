import { plainText } from '@/modules/content/rich-text/schema';
import type { ArticleDTO } from '@/modules/content/types';

/**
 * The legacy import filled a missing excerpt with the beginning of the FAQ body.
 * Repeating questions and partial answers above the index is not an introduction.
 * Keep independent editorial summaries; use localized copy for an empty summary or
 * a verbatim body prefix. Stored revisions and the question/answer body stay intact.
 */
export function faqSummary(page: Pick<ArticleDTO, 'excerpt' | 'body'>, fallback: string): string {
  const excerpt = page.excerpt.trim();
  if (!excerpt) return fallback;
  const prefix = excerpt.replace(/(?:…|\.{3})$/, '').replace(/\s+/g, ' ').trim();
  const body = plainText(page.body, { includeTables: false });
  return !prefix || body.startsWith(prefix) ? fallback : excerpt;
}
