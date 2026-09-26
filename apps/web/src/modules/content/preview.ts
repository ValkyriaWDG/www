import 'server-only';
import type { Executor } from '@valkyria/db';
import { z } from 'zod';
import { DomainError } from '@/lib/result';
import type { Actor } from '@/modules/access/types';
import { buildArticle } from './article';
import { authorize } from './guard';
import { parseInput, uuidSchema } from './inputs';
import { readDocument, readRevision, readTranslation } from './store';
import type { ArticleDTO } from './types';

export const previewSchema = z.object({ translationId: uuidSchema, revisionId: uuidSchema.optional() });
export type PreviewInput = z.input<typeof previewSchema>;

/**
 * Private preview of a translation's draft (or a given revision of the SAME translation)
 * in the public article DTO shape, marked `isPreview`. Requires `content.read_private`;
 * the calling route must respond `Cache-Control: private, no-store` and `noindex`.
 */
export async function getPreview(db: Executor, actor: Actor, rawInput: PreviewInput): Promise<ArticleDTO> {
  await authorize(db, actor, 'content.read_private', 'read', { action: 'content.preview', entityType: 'content_translation' });
  const input = parseInput(previewSchema, rawInput);
  const translation = await readTranslation(db, input.translationId);
  const revisionId = input.revisionId ?? translation.draftRevisionId ?? translation.publishedRevisionId;
  if (!revisionId) throw new DomainError('not_found', 'Nothing to preview.');
  const revision = await readRevision(db, translation.id, revisionId);
  const document = await readDocument(db, translation.documentId);
  return buildArticle(db, { document, translation, revision, isPreview: true });
}
