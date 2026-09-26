import { z } from 'zod';
import { hasControlCharacters } from '@/modules/prose/text';

/*
 * Allowlisted site settings. Each key has a schema; nothing else is readable or writable
 * through the settings module. `system.*` keys are internal (e.g. the publisher heartbeat)
 * and never part of this allowlist.
 */

export const SETTING_KEYS = ['community.discordInviteUrl', 'community.links', 'background.media'] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export function isSettingKey(key: unknown): key is SettingKey {
  return typeof key === 'string' && !key.startsWith('system.') && (SETTING_KEYS as readonly string[]).includes(key);
}

export const COMMUNITY_LINK_KINDS = ['youtube', 'steam', 'instagram', 'facebook', 'website', 'other'] as const;
export type CommunityLinkKind = (typeof COMMUNITY_LINK_KINDS)[number];
export const MAX_COMMUNITY_LINKS = 8;

const label = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .refine((value) => !hasControlCharacters(value), 'control_characters');

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** HTTPS URL without credentials. */
const httpsUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    const url = parseUrl(value);
    return url !== null && url.protocol === 'https:' && !url.username && !url.password && url.hostname.length > 0;
  }, 'https_required');

/** `https://discord.gg/<code>` or `https://discord.com/invite/<code>`. */
export const discordInviteUrlSchema = httpsUrl.refine((value) => {
  const url = parseUrl(value)!;
  if (url.port) return false;
  if (url.hostname === 'discord.gg') return /^\/[A-Za-z0-9-]{2,64}\/?$/.test(url.pathname);
  if (url.hostname === 'discord.com' || url.hostname === 'www.discord.com') return /^\/invite\/[A-Za-z0-9-]{2,64}\/?$/.test(url.pathname);
  return false;
}, 'discord_invite_required');

export const communityLinkSchema = z.object({
  kind: z.enum(COMMUNITY_LINK_KINDS),
  url: httpsUrl,
  label,
});
export type CommunityLink = z.output<typeof communityLinkSchema>;

export const communityLinksSchema = z
  .array(communityLinkSchema)
  .max(MAX_COMMUNITY_LINKS)
  .refine((links) => new Set(links.map((link) => link.url)).size === links.length, 'duplicate_url');

/** Comma-separated `BACKGROUND_MEDIA_ALLOWED_ORIGINS` (e.g. `https://media.example.org`). */
export function backgroundAllowedOrigins(env: Record<string, string | undefined> = process.env): string[] {
  return (env.BACKGROUND_MEDIA_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => parseUrl(value))
    .filter((url): url is URL => url !== null && url.protocol === 'https:')
    .map((url) => url.origin);
}

const SAME_ORIGIN_PATH = /^\/(?!\/)[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/;

/**
 * A background media reference is either a same-origin absolute path (`/media/loop.mp4`)
 * or an HTTPS URL whose origin is explicitly allowlisted. The server never fetches it.
 */
export function isAllowedBackgroundUrl(value: string, allowedOrigins: readonly string[]): boolean {
  if (value.startsWith('/')) return SAME_ORIGIN_PATH.test(value) && !value.split('/').includes('..') && !value.includes('\\');
  const url = parseUrl(value);
  if (!url || url.protocol !== 'https:' || url.username || url.password) return false;
  return allowedOrigins.includes(url.origin);
}

export function backgroundMediaSchema(allowedOrigins: readonly string[] = backgroundAllowedOrigins()) {
  const mediaUrl = z
    .string()
    .trim()
    .max(2048)
    .refine((value) => isAllowedBackgroundUrl(value, allowedOrigins), 'origin_not_allowed')
    .nullable()
    .optional()
    .transform((value) => value || null);
  const focal = z.number().min(0).max(100).default(50);
  return z
    .object({
      posterUrl: mediaUrl,
      mp4Url: mediaUrl,
      webmUrl: mediaUrl,
      focalX: focal,
      focalY: focal,
      provenance: z
        .string()
        .trim()
        .max(500)
        .refine((value) => !hasControlCharacters(value), 'control_characters')
        .default(''),
    })
    .superRefine((value, ctx) => {
      if ((value.posterUrl || value.mp4Url || value.webmUrl) && value.provenance.length === 0) {
        ctx.addIssue({ code: 'custom', message: 'provenance_required', path: ['provenance'] });
      }
    });
}
export type BackgroundMedia = z.output<ReturnType<typeof backgroundMediaSchema>>;

export type SettingValue<K extends SettingKey> = K extends 'community.discordInviteUrl'
  ? string
  : K extends 'community.links'
    ? CommunityLink[]
    : K extends 'background.media'
      ? BackgroundMedia
      : never;

/** Schema of an allowlisted key, built at call time (background origins come from the environment). */
export function settingSchema(key: SettingKey): z.ZodType<SettingValue<SettingKey>> {
  switch (key) {
    case 'community.discordInviteUrl':
      return discordInviteUrlSchema as z.ZodType<SettingValue<SettingKey>>;
    case 'community.links':
      return communityLinksSchema as z.ZodType<SettingValue<SettingKey>>;
    case 'background.media':
      return backgroundMediaSchema() as unknown as z.ZodType<SettingValue<SettingKey>>;
  }
}
