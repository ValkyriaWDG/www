import { isDeepStrictEqual } from 'node:util';
import { LEGACY_HLL_ORIGIN } from './hll';

type MatchRow = Record<string, unknown>;
type SourceMatch = { fileId: number; row: MatchRow };
export type LegacyIdentityRepair = { fileId: number; embeddedId: number; date: string; away: string; map: string };

/** Explicitly reviewed source typo: both public routes exist and show distinct opponents/dates. */
export const REVIEWED_MATCH_IDENTITY_REPAIRS: readonly LegacyIdentityRepair[] = [
  { fileId: 199, embeddedId: 198, date: '17/05/2026 19:30', away: '57TH', map: 'smdm' },
];

const SCOREBOARD_MAP_PREFIXES: Record<string, readonly string[]> = {
  kharkov: ['kharkov'], foy: ['foy'], omaha: ['omahabeach', 'omaha'], elalamein: ['elalamein'],
  utah: ['utahbeach', 'utah'], smdm: ['stmariedumont', 'smdm'], carentan: ['carentan', 'car'],
  sme: ['stmereeglise', 'sme'], phl: ['purpleheartlane', 'phl'], driel: ['driel'],
  hurtgen: ['hurtgenforest', 'hurtgen'], kursk: ['kursk'], tobruk: ['tobruk'],
  hill400: ['hill400'], stalingrad: ['stalingrad'],
};

/** Map identity is a necessary association check, not proof of the opponent or score. */
export function validateLegacyScoreboardMap(matchMap: unknown, snapshotMap: unknown): { ok: boolean; note: string | null } {
  if (typeof matchMap !== 'string' || typeof snapshotMap !== 'string') return { ok: false, note: 'Missing map identity.' };
  const family = matchMap.toLowerCase().replace(/-night$/, '');
  const raw = snapshotMap.toLowerCase();
  const prefixes = SCOREBOARD_MAP_PREFIXES[family];
  if (!prefixes?.some((prefix) => raw === prefix || raw.startsWith(`${prefix}_`))) return { ok: false, note: `Legacy map ${matchMap} does not match snapshot map ${snapshotMap}; association requires review.` };
  const variantDiffers = matchMap.endsWith('-night') !== raw.includes('_night');
  return { ok: true, note: variantDiffers ? `Map family agrees, but the time-of-day variant differs or is unspecified (${matchMap} / ${snapshotMap}); original values retained.` : null };
}

/** Public API response checked 2026-09-29: these four fields exactly matched the archived export. */
export function verifiedLegacyScoreboardUrl(matchId: number, ordinal: number, result: { id?: unknown; server_number?: unknown; start?: unknown; map_name?: unknown }): string | null {
  if (matchId === 211 && ordinal === 1 && result.id === 16551 && result.server_number === 6 && result.start === '2026-09-27T18:06:19+00:00' && result.map_name === 'carentan_warfare') {
    return 'https://event.valkyriahll.app/games/16551';
  }
  return null;
}

/** Reconcile literal public rows with their source filenames; never silently overwrite a duplicate. */
export function reconcileLegacyMatches(publicRows: MatchRow[], sourceMatches: SourceMatch[], repairs: readonly LegacyIdentityRepair[]) {
  const sources = sourceMatches.filter(({ row }) => row.hidden !== true);
  if (sources.length > 1000 || publicRows.length > 1000) throw new Error('Match inventory exceeds bounds');
  if (new Set(sources.map(({ fileId }) => fileId)).size !== sources.length) throw new Error('Duplicate source filename identity');
  const result = new Map<number, MatchRow>();
  const matchedFiles = new Set<number>();
  const warnings: string[] = [];
  const repairedIds = new Set<number>();
  for (const row of publicRows.filter((row) => row.hidden !== true)) {
    if (!Number.isInteger(row.id) || Number(row.id) <= 0) throw new Error('Invalid public match identifier');
    const candidates = sources.filter(({ row: source }) => isDeepStrictEqual(source, row));
    if (candidates.length !== 1) throw new Error(`Public match ${row.id} has no unique exact source record`);
    const source = candidates[0]!;
    const existing = result.get(source.fileId);
    if (existing) {
      // Equality was proved against the same unique source above, including every field.
      warnings.push(`Exact duplicate public API row excluded: source match ${source.fileId}.`);
      continue;
    }
    let reconciled = row;
    if (source.fileId !== row.id) {
      const away = (row.teams as { away?: { name?: unknown } } | undefined)?.away?.name;
      const repair = repairs.find((item) => item.fileId === source.fileId && item.embeddedId === row.id && item.date === row.date && item.away === away && item.map === row.map);
      if (!repair) throw new Error(`Unreviewed identity mismatch for source match ${source.fileId}`);
      const sourceUrl = `${LEGACY_HLL_ORIGIN}/matches/${source.fileId}`;
      reconciled = { ...row, id: source.fileId, _legacyIdentity: { originalEmbeddedId: row.id, sourceFile: `${source.fileId}.json`, sourceUrl } };
      repairedIds.add(source.fileId);
      warnings.push(`Reviewed identity repair: ${source.fileId}.json embeds id ${row.id}; exact public API row and distinct public route ${sourceUrl} confirm source match ${source.fileId}.`);
    }
    result.set(source.fileId, reconciled);
    matchedFiles.add(source.fileId);
  }
  if (matchedFiles.size !== sources.length) throw new Error('Public API does not cover every non-hidden source match; review capture/source drift');
  return { matches: [...result.values()], warnings, repairedIds };
}
