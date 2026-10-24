import 'server-only';
import { memberProfile, type Executor, type Game, type PublicRoleKey } from '@valkyria/db';
import { and, asc, eq, isNotNull } from 'drizzle-orm';
import type { PublicImage } from '@/modules/prose/assets';
import { loadPublicImages } from '@/modules/prose/assets';
import type { LogiIntegrationEnv } from '@/modules/integrations/logi-config';
import { readPublicLogiPlayerDirectory, type PublicLogiPlayer, type PublicPlayerRoster } from '@/modules/integrations/logi-public-players';
import { readPublicLogiRosterDirectory } from '@/modules/integrations/logi-people';
import type { PublicLogiRosterActivity } from '@/modules/integrations/logi-people-types';
import type { PublicMember } from './types';

export type PublicPlayerDirectoryRow = { key: string; href: string; profileSlug: string | null; displayName: string | null; avatar: PublicImage | null; games: Game[]; publicRoleKeys: PublicRoleKey[]; matches: PublicPlayerRoster[] };
type Filters = { game?: Game; role?: PublicRoleKey; q?: string; page: number; pageSize: number };
const fold = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Exact reviewed profile links are the only source/editorial deduplication key. */
export function composePublicPlayerDirectory(members: readonly PublicMember[], players: readonly PublicLogiPlayer[], editorialActivity: readonly PublicLogiRosterActivity[], filters: Filters) {
  const rows: PublicPlayerDirectoryRow[] = members.map((member) => {
    const linked = players.filter((player) => player.profileSlug === member.slug);
    const sourceGames = new Set(linked.flatMap((player) => player.activity.map((activity) => activity.game)));
    const matches = [...linked.flatMap((player) => player.activity.flatMap((activity) => activity.rosters)),
      ...editorialActivity.filter((activity) => activity.profileSlug === member.slug && !sourceGames.has(activity.game)).flatMap((activity) => activity.matches)];
    return { key: `profile:${member.slug}`, href: `/members/${member.slug}`, profileSlug: member.slug, displayName: member.displayName, avatar: member.avatar, games: [...new Set([...member.games, ...linked.flatMap((player) => player.games)])], publicRoleKeys: [...member.publicRoleKeys], matches: [...new Map(matches.map((match) => [match.href, match])).values()] };
  });
  const approved = new Set(members.map((member) => member.slug));
  for (const player of players) {
    if (player.profileSlug && approved.has(player.profileSlug)) continue;
    rows.push({ key: player.key, href: player.href, profileSlug: null, displayName: player.displayName, avatar: null, games: [...player.games], publicRoleKeys: [], matches: [...new Map(player.activity.flatMap((activity) => activity.rosters).map((match) => [match.href, match])).values()] });
  }
  const search = fold(filters.q?.trim() ?? '');
  const visible = rows.filter((row) => (!filters.game || row.games.includes(filters.game)) && (!filters.role || row.publicRoleKeys.includes(filters.role)) && (!search || fold(row.displayName ?? '').includes(search)))
    .sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? '', 'cs') || a.key.localeCompare(b.key));
  return { items: visible.slice((filters.page - 1) * filters.pageSize, filters.page * filters.pageSize), total: visible.length, page: filters.page, pageCount: Math.max(1, Math.ceil(visible.length / filters.pageSize)) };
}

/** Compose before searching/counting/paging; an empty editorial CMS never hides Logi players. */
export async function listPublicPlayerDirectory(db: Executor, env: LogiIntegrationEnv, filters: Filters) {
  const [members, directory, activity] = await Promise.all([
    db.select({ slug: memberProfile.slug, displayName: memberProfile.displayName, avatarAssetId: memberProfile.avatarAssetId, games: memberProfile.games, publicRoleKeys: memberProfile.publicRoleKeys }).from(memberProfile)
      .where(and(eq(memberProfile.state, 'published'), isNotNull(memberProfile.consentConfirmedAt))).orderBy(asc(memberProfile.slug)).limit(5001),
    readPublicLogiPlayerDirectory(db, env, { game: filters.game }),
    readPublicLogiRosterDirectory(db, env, { game: filters.game }),
  ]);
  if (members.length > 5000) throw new Error('Public directory capacity exceeded.');
  const images = await loadPublicImages(db, members.map((member) => member.avatarAssetId));
  return { ...composePublicPlayerDirectory(members.map(({ avatarAssetId, ...member }) => ({ ...member, avatar: avatarAssetId ? images.get(avatarAssetId) ?? null : null })), directory.players, activity, filters), availability: directory.availability };
}
