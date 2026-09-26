import { createHash } from 'node:crypto';
import { MAPPABLE_ROLES, roleMappingVersion, type Executor, type MappableRole } from '@valkyria/db';
import { desc, eq } from 'drizzle-orm';
import { recordAudit } from '../audit/audit';
import { isSnowflake } from './snowflake';

/** Canonical guild-role-ID → application-role mapping (sorted keys, sorted unique roles). */
export type RoleMapping = Readonly<Record<string, readonly MappableRole[]>>;

export type ParsedRoleMapping =
  | { ok: true; mapping: RoleMapping; digest: string }
  | { ok: false; error: RoleMappingError; mapping: RoleMapping; digest: null };

export type RoleMappingError = 'invalid_json' | 'not_an_object' | 'invalid_role_id' | 'invalid_role' | 'empty_roles' | 'too_many_entries';

const MAX_ENTRIES = 200;
const EMPTY: RoleMapping = Object.freeze({});

function fail(error: RoleMappingError): ParsedRoleMapping {
  return { ok: false, error, mapping: EMPTY, digest: null };
}

function isMappableRole(value: unknown): value is MappableRole {
  return typeof value === 'string' && (MAPPABLE_ROLES as readonly string[]).includes(value);
}

/**
 * Parses operator configuration `DISCORD_ROLE_MAPPING_JSON`: `{"<roleId>": "editor"}` or
 * `{"<roleId>": ["editor", "match_manager"]}`. Keys must be Discord snowflakes and values
 * only `member`, `editor`, `match_manager` or `administrator`. `owner` and every other value
 * are rejected. Any problem invalidates the whole mapping (fail closed: no roles).
 * Discord role names, positions, colours and the Administrator bit are never consulted.
 */
export function parseRoleMapping(json: string | undefined | null): ParsedRoleMapping {
  const source = (json ?? '').trim() || '{}';
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    return fail('invalid_json');
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return fail('not_an_object');
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > MAX_ENTRIES) return fail('too_many_entries');

  const mapping: Record<string, MappableRole[]> = {};
  for (const [roleId, value] of entries) {
    if (!isSnowflake(roleId)) return fail('invalid_role_id');
    const list = Array.isArray(value) ? value : [value];
    if (list.length === 0) return fail('empty_roles');
    if (!list.every(isMappableRole)) return fail('invalid_role');
    mapping[roleId] = [...new Set(list)].sort();
  }
  const canonical: Record<string, MappableRole[]> = {};
  for (const key of Object.keys(mapping).sort()) canonical[key] = mapping[key]!;
  const digest = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  return { ok: true, mapping: Object.freeze(canonical), digest };
}

/** Application roles granted by the given authoritative Discord role IDs. */
export function rolesForRoleIds(mapping: RoleMapping, roleIds: readonly string[]): MappableRole[] {
  const roles = new Set<MappableRole>();
  for (const roleId of roleIds) for (const role of mapping[roleId] ?? []) roles.add(role);
  return [...roles].sort();
}

const loggedErrors = new Set<string>();

/** Parses the mapping and logs (once per distinct problem) when the configuration is invalid. */
export function loadRoleMapping(json: string | undefined | null): ParsedRoleMapping {
  const parsed = parseRoleMapping(json);
  if (!parsed.ok && !loggedErrors.has(parsed.error)) {
    loggedErrors.add(parsed.error);
    console.error(`[access] DISCORD_ROLE_MAPPING_JSON rejected (${parsed.error}); no Discord role grants any application role.`);
  }
  return parsed;
}

const recordedDigests = new Map<string, number>();

/**
 * Records the mapping in `role_mapping_version` by digest. A digest not seen before gets
 * `max(version) + 1` and an `access.role_mapping_changed` audit event in the same
 * transaction. Returns the version number, or `null` for an invalid mapping.
 */
export async function ensureRoleMappingVersion(
  db: Executor,
  parsed: ParsedRoleMapping,
  guildId: string | null | undefined,
): Promise<number | null> {
  if (!parsed.ok) return null;
  const cached = recordedDigests.get(parsed.digest);
  if (cached !== undefined) return cached;

  const existing = await db
    .select({ version: roleMappingVersion.version })
    .from(roleMappingVersion)
    .where(eq(roleMappingVersion.digest, parsed.digest))
    .limit(1);
  if (existing[0]) {
    recordedDigests.set(parsed.digest, existing[0].version);
    return existing[0].version;
  }

  const version = await db.transaction(async (tx) => {
    const [latest] = await tx
      .select({ version: roleMappingVersion.version })
      .from(roleMappingVersion)
      .orderBy(desc(roleMappingVersion.version))
      .limit(1);
    const next = (latest?.version ?? 0) + 1;
    const inserted = await tx
      .insert(roleMappingVersion)
      .values({ version: next, digest: parsed.digest, guildId: guildId ?? null, mapping: parsed.mapping as Record<string, MappableRole[]> })
      .onConflictDoNothing()
      .returning({ version: roleMappingVersion.version });
    if (!inserted[0]) return null;
    await recordAudit(tx, {
      actor: { kind: 'system', label: 'system:role-mapping', capabilities: new Set() },
      action: 'access.role_mapping_changed',
      outcome: 'success',
      entityType: 'role_mapping_version',
      entityId: String(next),
      summary: {
        version: next,
        previousVersion: latest?.version ?? null,
        mappedRoleIds: Object.keys(parsed.mapping).length,
        digest: parsed.digest.slice(0, 16),
      },
    });
    return next;
  });

  if (version !== null) {
    recordedDigests.set(parsed.digest, version);
    return version;
  }
  // A concurrent writer recorded the same digest (or took the version number); re-read.
  const [row] = await db
    .select({ version: roleMappingVersion.version })
    .from(roleMappingVersion)
    .where(eq(roleMappingVersion.digest, parsed.digest))
    .limit(1);
  if (row) recordedDigests.set(parsed.digest, row.version);
  return row?.version ?? null;
}

/** Test helper: forget the per-process digest cache. */
export function resetRoleMappingCacheForTests(): void {
  recordedDigests.clear();
  loggedErrors.clear();
}
