import 'server-only';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { asset, type Executor } from '@valkyria/db';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Actor } from '@/modules/access/types';
import { authorize } from '@/modules/content/guard';
import { parseInput } from '@/modules/content/inputs';
import { getAsset, uploadImage, type AssetDTO, type MediaDeps } from './library';

/**
 * Editorial template backgrounds: the eight text-free scenes of the owner graphics pack
 * (docs/assets/graphics-pack-2026-09-29.md), shipped as byte-identical copies under
 * `public/images/editorial/`. An authorized editor imports one into the ordinary media
 * library, where alt text, captions, provenance and rights stay editable and the usual
 * draft/publish lifecycle applies. Nothing is imported automatically. Headlines are
 * written in the CMS, never baked into these images.
 */
export const EDITORIAL_TEMPLATE_IDS = ['hll-infantry', 'hll-assault', 'hll-tactical', 'hll-veteran', 'wdg-blue', 'wdg-combat', 'wdg-operator', 'hub'] as const;
export type EditorialTemplateId = (typeof EDITORIAL_TEMPLATE_IDS)[number];
export type EditorialTemplateGame = 'hll' | 'wardogs' | 'community';

type Template = { game: EditorialTemplateGame; altCs: string; altEn: string };

const TEMPLATES: Readonly<Record<EditorialTemplateId, Template>> = {
  'hll-infantry': {
    game: 'hll',
    altCs: 'Ilustrace: americký pěšák s puškou v rozbitém městě s kostelní věží',
    altEn: 'Illustration: US infantryman with a rifle in a ruined town with a church spire',
  },
  'hll-assault': {
    game: 'hll',
    altCs: 'Ilustrace: německý voják v zákopu při západu slunce, v pozadí hořící bojiště',
    altEn: 'Illustration: German soldier in a trench at sunset with a burning battlefield behind',
  },
  'hll-tactical': {
    game: 'hll',
    altCs: 'Ilustrace: voják v plášti s puškou v šedém zničeném městě',
    altEn: 'Illustration: soldier in a greatcoat with a rifle in a grey, ruined town',
  },
  'hll-veteran': {
    game: 'hll',
    altCs: 'Ilustrace: voják s puškou před rozbořeným městem, za ním postupující pěchota',
    altEn: 'Illustration: soldier with a rifle before a destroyed town, infantry advancing behind',
  },
  'wdg-blue': {
    game: 'wardogs',
    altCs: 'Ilustrace: moderní operátor s modrou páskou nad zalesněným údolím s vrtulníkem',
    altEn: 'Illustration: modern operator with a blue armband above a forested valley with a helicopter',
  },
  'wdg-combat': {
    game: 'wardogs',
    altCs: 'Ilustrace: moderní operátor se zbraní v hořícím městě, nad ním vrtulníky',
    altEn: 'Illustration: modern operator with a rifle in a burning city under helicopters',
  },
  'wdg-operator': {
    game: 'wardogs',
    altCs: 'Ilustrace: vousatý operátor v brýlích se zbraní u lesa se strážní věží',
    altEn: 'Illustration: bearded operator in sunglasses with a rifle by a forest and a watchtower',
  },
  hub: {
    game: 'community',
    altCs: 'Ilustrace: voják z druhé světové války a moderní operátor na obou stranách zakouřeného údolí',
    altEn: 'Illustration: a Second World War soldier and a modern operator on either side of a smoky valley',
  },
};

const PROVENANCE = (id: EditorialTemplateId, sha: string) =>
  `Valkyria graphics pack 2026-09-29 (owner-supplied VALKYRIA-GRAFIKA-KOMPLET.zip), 02-predchozi-bannery/assets/${id}.webp, SHA-256 ${sha}`;
const RIGHTS =
  'AI-created game-inspired illustration supplied by the Valkyria owner for this website; not a game screenshot, official key art or evidence of a clan event. No downstream reuse licence is granted.';

export type EditorialTemplate = { id: EditorialTemplateId; game: EditorialTemplateGame; alt: { cs: string; en: string }; preview: string };

export function listEditorialTemplates(): EditorialTemplate[] {
  return EDITORIAL_TEMPLATE_IDS.map((id) => ({
    id,
    game: TEMPLATES[id].game,
    alt: { cs: TEMPLATES[id].altCs, en: TEMPLATES[id].altEn },
    preview: `/images/editorial/${id}-480x270.webp`,
  }));
}

const templateFile = (id: EditorialTemplateId) => path.join(process.cwd(), 'public/images/editorial', `${id}-1920x1080.webp`);
const digests = new Map<EditorialTemplateId, Promise<{ bytes: Buffer; sha256: string }>>();

/** Shipped bytes and their digest (the media library stores the SHA-256 of the uploaded bytes). */
function templateBytes(id: EditorialTemplateId) {
  let entry = digests.get(id);
  if (!entry) {
    entry = readFile(templateFile(id)).then((bytes) => ({ bytes, sha256: createHash('sha256').update(bytes).digest('hex') }));
    entry.catch(() => digests.delete(id));
    digests.set(id, entry);
  }
  return entry;
}

const importSchema = z.object({ templateId: z.enum(EDITORIAL_TEMPLATE_IDS) });

/** Template IDs already present as live editorial assets (same bytes), with their asset IDs. */
export async function importedEditorialTemplates(db: Executor, actor: Actor): Promise<Partial<Record<EditorialTemplateId, string>>> {
  await authorize(db, actor, 'media.editorial.manage', 'read', { action: 'media.list', entityType: 'asset' });
  const shipped = await Promise.all(EDITORIAL_TEMPLATE_IDS.map(async (id) => ({ id, sha256: (await templateBytes(id)).sha256 })));
  const rows = await db
    .select({ id: asset.id, sha256: asset.sha256 })
    .from(asset)
    .where(and(eq(asset.scope, 'editorial'), isNull(asset.deletedAt), inArray(asset.sha256, shipped.map((entry) => entry.sha256))));
  const result: Partial<Record<EditorialTemplateId, string>> = {};
  for (const { id, sha256 } of shipped) {
    const row = rows.find((candidate) => candidate.sha256 === sha256);
    if (row) result[id] = row.id;
  }
  return result;
}

/**
 * Adds one template background to the editorial media library, or returns the existing
 * asset with the same bytes. Requires `media.editorial.manage` (platform-wide only).
 */
export async function importEditorialTemplate(db: Executor, actor: Actor, rawInput: { templateId: string }, deps: MediaDeps = {}): Promise<{ asset: AssetDTO; created: boolean }> {
  await authorize(db, actor, 'media.editorial.manage', 'write', { action: 'media.template_import', entityType: 'asset' });
  const { templateId } = parseInput(importSchema, rawInput);
  const existing = (await importedEditorialTemplates(db, actor))[templateId];
  if (existing) return { asset: await getAsset(db, actor, { assetId: existing }), created: false };
  const { bytes, sha256 } = await templateBytes(templateId);
  const template = TEMPLATES[templateId];
  const created = await uploadImage(
    db,
    actor,
    {
      bytes,
      filename: `valkyria-${templateId}.webp`,
      scope: 'editorial',
      provenance: PROVENANCE(templateId, sha256),
      rights: RIGHTS,
      defaultAltCs: template.altCs,
      defaultAltEn: template.altEn,
    },
    deps,
  );
  return { asset: created, created: true };
}
