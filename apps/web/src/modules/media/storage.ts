import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Private media storage layout (shared contract with fixture writers):
 *   <EDITORIAL_MEDIA_ROOT>/<assetId>/full.webp   longest edge ≤ 2400 px
 *   <EDITORIAL_MEDIA_ROOT>/<assetId>/thumb.webp  longest edge ≤ 480 px
 * The root is resolved from process.cwd() (default `.local/editorial-media`, ignored by
 * Git). Names are server-generated from a validated UUID and a fixed variant allowlist;
 * resolved paths are verified to stay inside the root. Originals are never retained.
 */

export const MEDIA_VARIANTS = ['full', 'thumb'] as const;
export type MediaVariant = (typeof MEDIA_VARIANTS)[number];

export const DEFAULT_MEDIA_ROOT = '.local/editorial-media';

const ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isAssetId(value: unknown): value is string {
  return typeof value === 'string' && ASSET_ID.test(value);
}

export function isMediaVariant(value: unknown): value is MediaVariant {
  return typeof value === 'string' && (MEDIA_VARIANTS as readonly string[]).includes(value);
}

export function resolveMediaRoot(configured: string | undefined = process.env.EDITORIAL_MEDIA_ROOT): string {
  const value = configured?.trim() ? configured.trim() : DEFAULT_MEDIA_ROOT;
  // Runtime-configured private volume; not part of the traced build output.
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), value);
}

/** Storage key recorded in `asset.variants` (relative to the media root). */
export function variantKey(assetId: string, variant: MediaVariant): string {
  if (!isAssetId(assetId) || !isMediaVariant(variant)) throw new Error('Invalid media key.');
  return `${assetId}/${variant}.webp`;
}

function assertInside(root: string, target: string): string {
  const base = path.resolve(root);
  const resolved = path.resolve(base, target);
  if (!resolved.startsWith(base + path.sep)) throw new Error('Media path escapes the storage root.');
  return resolved;
}

export function assetDirectory(root: string, assetId: string): string {
  if (!isAssetId(assetId)) throw new Error('Invalid asset id.');
  return assertInside(root, assetId);
}

export function variantPath(root: string, assetId: string, variant: MediaVariant): string {
  return assertInside(root, variantKey(assetId, variant));
}

/** Writes both variants atomically (temp file + rename) into a fresh asset directory. */
export async function writeVariants(root: string, assetId: string, files: Record<MediaVariant, Uint8Array>): Promise<void> {
  const directory = assetDirectory(root, assetId);
  await mkdir(/*turbopackIgnore: true*/ directory, { recursive: true, mode: 0o750 });
  for (const variant of MEDIA_VARIANTS) {
    const target = variantPath(root, assetId, variant);
    const temp = path.join(directory, `.${variant}.${randomBytes(6).toString('hex')}.tmp`);
    await writeFile(/*turbopackIgnore: true*/ temp, files[variant], { mode: 0o640, flag: 'wx' });
    await rename(/*turbopackIgnore: true*/ temp, target);
  }
}

/** Reads a stored variant without following symlinks; `null` when absent. */
export async function readVariant(root: string, assetId: string, variant: MediaVariant): Promise<Buffer | null> {
  let target: string;
  try {
    target = variantPath(root, assetId, variant);
  } catch {
    return null;
  }
  try {
    const handle = await open(/*turbopackIgnore: true*/ target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const info = await handle.stat();
      if (!info.isFile()) return null;
      return await handle.readFile();
    } finally {
      await handle.close();
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ELOOP' || code === 'ENOTDIR' || code === 'EISDIR') return null;
    throw error;
  }
}

export async function removeAssetFiles(root: string, assetId: string): Promise<void> {
  await rm(/*turbopackIgnore: true*/ assetDirectory(root, assetId), { recursive: true, force: true });
}
