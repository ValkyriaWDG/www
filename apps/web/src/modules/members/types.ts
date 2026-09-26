import type { Game, Locale, ProfileState, PublicRoleKey } from '@valkyria/db';
import type { PublicImage } from '@/modules/prose/assets';
import type { LocalizedProse, ProseAdminDetail, ProseStatus } from '@/modules/prose/types';

/**
 * Public member projection. Contains no user/account link, e-mail, Discord identifiers,
 * consent timestamps, sort order or internal state.
 */
export type PublicMember = {
  slug: string;
  /** Approved display name, byte-for-byte as stored (diacritics/emoji preserved). */
  displayName: string;
  avatar: PublicImage | null;
  games: Game[];
  /** Stable keys; the UI localizes their labels. */
  publicRoleKeys: PublicRoleKey[];
};

export type PublicMemberDetail = PublicMember & {
  /** Requested locale's published biography or explicit absence with source locales. */
  biography: LocalizedProse;
};

export type PublicMemberPage = { items: PublicMember[]; total: number; page: number; pageCount: number };

export type AdminMemberListItem = {
  id: string;
  slug: string;
  displayName: string;
  state: ProfileState;
  consentConfirmedAt: string | null;
  publishedAt: string | null;
  games: Game[];
  publicRoleKeys: PublicRoleKey[];
  avatarAssetId: string | null;
  sortOrder: number;
  version: number;
  biography: Record<Locale, ProseStatus>;
  isFixture: boolean;
  updatedAt: string;
};

export type AdminMember = AdminMemberListItem & {
  /** Linked auth user, when any (admin-only). */
  userId: string | null;
  biographyDetail: Record<Locale, ProseAdminDetail>;
  createdAt: string;
};

export type AdminMemberPage = { items: AdminMemberListItem[]; total: number; page: number; pageCount: number };

export type MemberMutationResult = { id: string; slug: string; version: number; state: ProfileState };
