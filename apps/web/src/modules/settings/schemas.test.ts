import { describe, expect, it } from 'vitest';
import {
  backgroundAllowedOrigins,
  backgroundMediaSchema,
  communityLinksSchema,
  discordInviteUrlSchema,
  isAllowedBackgroundUrl,
  isSettingKey,
} from './schemas';

describe('settings allowlist', () => {
  it('accepts only allowlisted keys and never system keys', () => {
    expect(isSettingKey('community.discordInviteUrl')).toBe(true);
    expect(isSettingKey('background.media')).toBe(true);
    expect(isSettingKey('system.publisher_heartbeat')).toBe(false);
    expect(isSettingKey('arbitrary.key')).toBe(false);
    expect(isSettingKey(42)).toBe(false);
  });
});

describe('Discord invite', () => {
  it('accepts discord.gg and discord.com/invite over HTTPS only', () => {
    expect(discordInviteUrlSchema.safeParse('https://discord.gg/synthetic').success).toBe(true);
    expect(discordInviteUrlSchema.safeParse('https://discord.com/invite/synthetic').success).toBe(true);
    for (const value of [
      'http://discord.gg/synthetic',
      'https://discord.com/channels/1/2',
      'https://discord.gg.example.org/synthetic',
      'https://evil.example/discord.gg/x',
      'https://discord.gg/',
      'javascript:alert(1)',
    ]) {
      expect(discordInviteUrlSchema.safeParse(value).success, value).toBe(false);
    }
  });
});

describe('community links', () => {
  it('limits count, requires HTTPS and labels', () => {
    const link = (n: number) => ({ kind: 'website', url: `https://example.org/${n}`, label: `Link ${n}` });
    expect(communityLinksSchema.safeParse(Array.from({ length: 8 }, (_, i) => link(i))).success).toBe(true);
    expect(communityLinksSchema.safeParse(Array.from({ length: 9 }, (_, i) => link(i))).success).toBe(false);
    expect(communityLinksSchema.safeParse([{ kind: 'website', url: 'http://example.org', label: 'x' }]).success).toBe(false);
    expect(communityLinksSchema.safeParse([{ kind: 'tiktok', url: 'https://example.org', label: 'x' }]).success).toBe(false);
    expect(communityLinksSchema.safeParse([link(1), link(1)]).success).toBe(false);
  });
});

describe('background media', () => {
  const origins = ['https://media.example.org'];

  it('reads HTTPS origins from BACKGROUND_MEDIA_ALLOWED_ORIGINS', () => {
    expect(backgroundAllowedOrigins({ BACKGROUND_MEDIA_ALLOWED_ORIGINS: 'https://media.example.org, http://insecure.example.org ,bogus' })).toEqual([
      'https://media.example.org',
    ]);
    expect(backgroundAllowedOrigins({})).toEqual([]);
  });

  it('allows same-origin paths and allowlisted HTTPS origins only', () => {
    expect(isAllowedBackgroundUrl('/media/loop.mp4', [])).toBe(true);
    expect(isAllowedBackgroundUrl('//evil.example/loop.mp4', [])).toBe(false);
    expect(isAllowedBackgroundUrl('/media/../secret', [])).toBe(false);
    expect(isAllowedBackgroundUrl('https://media.example.org/loop.mp4', [])).toBe(false);
    expect(isAllowedBackgroundUrl('https://media.example.org/loop.mp4', origins)).toBe(true);
    expect(isAllowedBackgroundUrl('https://other.example.org/loop.mp4', origins)).toBe(false);
    expect(isAllowedBackgroundUrl('http://media.example.org/loop.mp4', origins)).toBe(false);
  });

  it('requires provenance when any media URL is set and bounds the focal point', () => {
    const schema = backgroundMediaSchema(origins);
    expect(schema.safeParse({ posterUrl: '/poster.webp', focalX: 50, focalY: 50, provenance: '' }).success).toBe(false);
    expect(schema.safeParse({ posterUrl: '/poster.webp', focalX: 50, focalY: 50, provenance: 'Owner-supplied capture, approved 2026-09' }).success).toBe(true);
    expect(schema.safeParse({ focalX: 101, focalY: 50 }).success).toBe(false);
    expect(schema.parse({})).toMatchObject({ posterUrl: null, mp4Url: null, webmUrl: null, focalX: 50, focalY: 50 });
  });
});
