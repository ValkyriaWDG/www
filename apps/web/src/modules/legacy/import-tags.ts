import { taxonomyTerm, type Executor } from '@valkyria/db';
import { and, eq } from 'drizzle-orm';
import { DomainError } from '@/lib/result';
import { slugify } from '@/modules/content/slug';
import { sourceHash } from './import-contract';

/** Preserve source labels verbatim; stable namespaced keys never overwrite an editor's taxonomy. */
export async function importTagKeys(tx: Executor, tags: readonly string[], apply: boolean): Promise<string[]> {
  const labels = [...new Set(tags.map((label) => label.trim()).filter(Boolean))];
  if (labels.length > 10) throw new DomainError('validation', 'Review source tags before importing more than ten labels.', { tags: 'legacy_tag_limit' });
  const keys: string[] = [];
  for (const label of labels) {
    const key = `legacy-hll-${slugify(label, 36) || 'tag'}-${sourceHash(label).slice(0, 8)}`;
    const [existing] = await tx.select().from(taxonomyTerm).where(and(eq(taxonomyTerm.kind, 'tag'), eq(taxonomyTerm.key, key)));
    if (!existing && apply) await tx.insert(taxonomyTerm).values({ kind: 'tag', key, labelCs: label, labelEn: label }).onConflictDoNothing();
    keys.push(key);
  }
  return keys;
}
