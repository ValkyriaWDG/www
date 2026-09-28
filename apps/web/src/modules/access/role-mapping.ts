import { createHash } from 'node:crypto';
import { GAMES, MAPPABLE_ROLES, roleMappingVersion, type Executor, type Game, type MappableRole, type StoredRoleMappingEntry } from '@valkyria/db';
import { desc, eq } from 'drizzle-orm';
import { recordAudit } from '../audit/audit';
import type { RoleGrant } from './capabilities';
import { isSnowflake } from './snowflake';

/**
 * Canonical guild-role-ID → application-role mapping (sorted keys, sorted unique roles).
 * A role list is a platform-wide grant; `{ roles, games }` limits the roles to games.
 */
export type RoleMappingEntry = readonly MappableRole[] | { readonly roles: readonly MappableRole[]; readonly games: readonly Game[] };
export type RoleMapping = Readonly<Record<string, RoleMappingEntry>>;

export type ParsedRoleMapping =
  | { ok: true; mapping: RoleMapping; digest: string }
  | { ok: false; error: RoleMappingError; mapping: RoleMapping; digest: null };

export type RoleMappingError = 'invalid_json' | 'not_an_object' | 'invalid_role_id' | 'invalid_role' | 'empty_roles' | 'invalid_games' | 'too_many_entries';

const MAX_ENTRIES = 200;
const EMPTY: RoleMapping = Object.freeze({});

function fail(error: RoleMappingError): ParsedRoleMapping {
  return { ok: false, error, mapping: EMPTY, digest: null };
}

function isMappableRole(value: unknown): value is MappableRole {
  return typeof value === 'string' && (MAPPABLE_ROLES as readonly string[]).includes(value);
}

function isGame(value: unknown): value is Game {
  return typeof value === 'string' && (GAMES as readonly string[]).includes(value);
}

/**
 * Parses operator configuration `DISCORD_ROLE_MAPPING_JSON`: `{"<roleId>": "editor"}`,
 * `{"<roleId>": ["editor", "match_manager"]}` (platform-wide) or
 * `{"<roleId>": {"roles": ["editor"], "games": ["hell-let-loose"]}}` (game-scoped). Keys
 * must be Discord snowflakes, roles only `member`, `editor`, `match_manager` or
 * `administrator`, games only database game IDs. `owner` and every other value are
 * rejected. Any problem invalidates the whole mapping (fail closed: no roles). Discord
 * role names, positions, colours and the Administrator bit are never consulted.
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

  const mapping: Record<string, StoredRoleMappingEntry> = {};
  for (const [roleId, value] of entries) {
    if (!isSnowflake(roleId)) return fail('invalid_role_id');
    const scoped = value !== null && typeof value === 'object' && !Array.isArray(value);
    const rawRoles: unknown = scoped ? (value as { roles?: unknown }).roles : value;
    const list = Array.isArray(rawRoles) ? rawRoles : [rawRoles];
    if (list.length === 0) return fail('empty_roles');
    if (!list.every(isMappableRole)) return fail('invalid_role');
    const roles = [...new Set(list)].sort();
    if (!scoped) {
      mapping[roleId] = roles;
      continue;
    }
    const keys = Object.keys(value as object).sort().join(',');
    const games: unknown = (value as { games?: unknown }).games;
    if (keys !== 'games,roles' || !Array.isArray(games) || games.length === 0 || !games.every(isGame)) return fail('invalid_games');
    mapping[roleId] = { roles, games: [...new Set(games)].sort() };
  }
  // Key order is canonical so unscoped v1 mappings keep their original digest.
  const canonical: Record<string, StoredRoleMappingEntry> = {};
  for (const key of Object.keys(mapping).sort()) {
    const entry = mapping[key]!;
    canonical[key] = Array.isArray(entry) ? entry : { roles: entry.roles, games: entry.games };
  }
  const digest = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  return { ok: true, mapping: Object.freeze(canonical), digest };
}

function entryRoles(entry: RoleMappingEntry | undefined): readonly MappableRole[] {
  if (!entry) return [];
  return 'roles' in entry ? entry.roles : entry;
}

/** Application roles granted (for any scope) by the given authoritative Discord role IDs. */
export function rolesForRoleIds(mapping: RoleMapping, roleIds: readonly string[]): MappableRole[] {
  const roles = new Set<MappableRole>();
  for (const roleId of roleIds) for (const role of entryRoles(mapping[roleId])) roles.add(role);
  return [...roles].sort();
}

/** Role grants with their game scope for the given authoritative Discord role IDs. */
export function grantsForRoleIds(mapping: RoleMapping, roleIds: readonly string[]): RoleGrant[] {
  const grants: RoleGrant[] = [];
  for (const roleId of roleIds) {
    const entry = mapping[roleId];
    if (!entry) continue;
    if ('roles' in entry) for (const role of entry.roles) grants.push({ role, games: entry.games });
    else for (const role of entry) grants.push({ role, games: 'all' });
  }
  return grants;
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
      .values({ version: next, digest: parsed.digest, guildId: guildId ?? null, mapping: parsed.mapping as Record<string, StoredRoleMappingEntry> })
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
