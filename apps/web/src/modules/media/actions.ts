'use server';

import { z } from 'zod';
import { getDb } from '@/lib/db';
import { ok, toActionError, type ActionResult } from '@/lib/result';
import { denialCode } from '@/modules/access/policy';
import { getActor } from '@/modules/access/server';
import { AccessDeniedError, type AccessIntent, type Principal } from '@/modules/access/types';
import { parseInput, uuidSchema } from '@/modules/content/inputs';
import {
  deleteAsset,
  getAsset,
  listAssets,
  listAssetsSchema,
  updateAssetMetadata,
  updateAssetMetadataSchema,
  type AssetDetailDTO,
  type AssetDTO,
  type ListAssetsInput,
  type UpdateAssetMetadataInput,
} from './library';
import { importEditorialTemplate } from './templates';

/**
 * Server actions of the media library/picker. Media authority is per scope
 * (`media.editorial.manage` / `media.match.manage`): each action first requires a
 * principal holding at least one media capability with the needed intent, then the
 * use case enforces the specific asset's scope (a match manager can never read or
 * change editorial assets). Uploads go through `POST /api/media/upload`.
 */

async function requireMediaActor(intent: AccessIntent): Promise<Principal> {
  const actor = await getActor(intent);
  const editorial = denialCode(actor, 'media.editorial.manage');
  const match = denialCode(actor, 'media.match.manage');
  if (editorial !== null && match !== null) throw new AccessDeniedError(editorial, 'media.editorial.manage');
  if (actor.kind !== 'principal') throw new AccessDeniedError('forbidden', 'media.editorial.manage');
  return actor;
}

async function run<T>(context: string, intent: AccessIntent, body: (actor: Principal) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const actor = await requireMediaActor(intent);
    return ok(await body(actor));
  } catch (error) {
    return toActionError(error, context);
  }
}

const assetIdSchema = z.object({ assetId: uuidSchema });

export async function listAssetsAction(input: ListAssetsInput): Promise<ActionResult<{ items: AssetDTO[]; total: number; page: number; pageSize: number; pageCount: number }>> {
  return run('media.list', 'read', (actor) => listAssets(getDb(), actor, parseInput(listAssetsSchema, input)));
}

export async function getAssetAction(input: { assetId: string }): Promise<ActionResult<AssetDetailDTO>> {
  return run('media.read', 'read', (actor) => getAsset(getDb(), actor, parseInput(assetIdSchema, input)));
}

/** Updates library defaults (alt/caption per language), provenance and rights; published snapshots keep their own text. */
export async function updateAssetMetadataAction(input: UpdateAssetMetadataInput): Promise<ActionResult<AssetDTO>> {
  return run('media.update', 'write', (actor) => updateAssetMetadata(getDb(), actor, parseInput(updateAssetMetadataSchema, input)));
}

/** Deletes an unreferenced asset; referenced assets fail with `in_use`. */
export async function deleteAssetAction(input: { assetId: string }): Promise<ActionResult<{ assetId: string }>> {
  return run('media.delete', 'write', (actor) => deleteAsset(getDb(), actor, parseInput(assetIdSchema, input)));
}

/**
 * Adds a shipped editorial template background to the editorial library (or returns the
 * asset with identical bytes). `media.editorial.manage` is enforced by the use case.
 */
export async function importEditorialTemplateAction(input: { templateId: string }): Promise<ActionResult<{ assetId: string; created: boolean }>> {
  return run('media.template_import', 'write', async (actor) => {
    const result = await importEditorialTemplate(getDb(), actor, input);
    return { assetId: result.asset.id, created: result.created };
  });
}
