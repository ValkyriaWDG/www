import 'server-only';
import { siteSetting, type Executor } from '@valkyria/db';
import { inArray } from 'drizzle-orm';
import { getServerEnv } from '@/lib/env';
import { backgroundMediaSchema, communityLinksSchema, discordInviteUrlSchema, type BackgroundMedia, type CommunityLink } from './schemas';

export type BackgroundSource = { src: string; type: 'video/webm' | 'video/mp4' };

/** Public site configuration consumed by the shell, community page and background. */
export type PublicSiteConfig = {
  discordInviteUrl: string | null;
  communityLinks: CommunityLink[];
  hllWebsiteUrl: string;
  hllMatchArchiveUrl: string;
  background: {
    posterUrl: string | null;
    /** Preferred order: WebM first, then MP4. Empty → static fallback. */
    sources: BackgroundSource[];
    /** Object-position focal point in percent. */
    focalPoint: { x: number; y: number };
  };
};

export type SiteConfigDefaults = {
  discordInviteUrl: string | null;
  hllWebsiteUrl: string;
  hllMatchArchiveUrl: string;
  background: { posterUrl: string | null; mp4Url: string | null; webmUrl: string | null };
};

/** Operator-configured defaults from the validated runtime environment. */
export function siteConfigDefaultsFromEnv(): SiteConfigDefaults {
  const env = getServerEnv();
  return {
    discordInviteUrl: env.DISCORD_INVITE_URL ?? null,
    hllWebsiteUrl: env.HLL_WEBSITE_URL,
    hllMatchArchiveUrl: env.HLL_MATCH_ARCHIVE_URL,
    background: {
      posterUrl: env.BACKGROUND_POSTER_URL ?? null,
      mp4Url: env.BACKGROUND_VIDEO_MP4_URL ?? null,
      webmUrl: env.BACKGROUND_VIDEO_WEBM_URL ?? null,
    },
  };
}

function sources(media: { mp4Url: string | null; webmUrl: string | null }): BackgroundSource[] {
  const list: BackgroundSource[] = [];
  if (media.webmUrl) list.push({ src: media.webmUrl, type: 'video/webm' });
  if (media.mp4Url) list.push({ src: media.mp4Url, type: 'video/mp4' });
  return list;
}

/**
 * Environment defaults merged with validated database overrides. Stored values are
 * re-validated on read (an override that no longer passes, e.g. after an origin was
 * removed from the allowlist, is ignored). If the database is unavailable the public
 * site still renders with the environment defaults. A `background.media` override
 * replaces the whole background configuration.
 */
export async function getPublicSiteConfig(db: Executor, defaults: SiteConfigDefaults = siteConfigDefaultsFromEnv()): Promise<PublicSiteConfig> {
  const config: PublicSiteConfig = {
    discordInviteUrl: defaults.discordInviteUrl,
    communityLinks: [],
    hllWebsiteUrl: defaults.hllWebsiteUrl,
    hllMatchArchiveUrl: defaults.hllMatchArchiveUrl,
    background: { posterUrl: defaults.background.posterUrl, sources: sources(defaults.background), focalPoint: { x: 50, y: 50 } },
  };
  let rows: { key: string; value: unknown }[] = [];
  try {
    rows = await db
      .select({ key: siteSetting.key, value: siteSetting.value })
      .from(siteSetting)
      .where(inArray(siteSetting.key, ['community.discordInviteUrl', 'community.links', 'background.media']));
  } catch {
    console.warn('[settings] database unavailable; using environment defaults');
    return config;
  }
  for (const row of rows) {
    if (row.key === 'community.discordInviteUrl') {
      const parsed = discordInviteUrlSchema.safeParse(row.value);
      if (parsed.success) config.discordInviteUrl = parsed.data;
      else console.warn('[settings] ignoring invalid stored override: community.discordInviteUrl');
    } else if (row.key === 'community.links') {
      const parsed = communityLinksSchema.safeParse(row.value);
      if (parsed.success) config.communityLinks = parsed.data;
      else console.warn('[settings] ignoring invalid stored override: community.links');
    } else if (row.key === 'background.media') {
      const parsed = backgroundMediaSchema().safeParse(row.value);
      if (parsed.success) {
        const media: BackgroundMedia = parsed.data;
        config.background = {
          posterUrl: media.posterUrl,
          sources: sources(media),
          focalPoint: { x: media.focalX, y: media.focalY },
        };
      } else console.warn('[settings] ignoring invalid stored override: background.media');
    }
  }
  return config;
}
