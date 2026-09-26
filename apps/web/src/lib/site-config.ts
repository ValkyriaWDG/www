import 'server-only';
import { cache } from 'react';
import { getPublicSiteConfig, siteConfigDefaultsFromEnv, siteConfigFromDefaults, type PublicSiteConfig } from '@/modules/settings/public';
import { getDb } from './db';
import { getServerEnv } from './env';

/**
 * Effective public site configuration for the current request: validated environment
 * defaults merged with allowlisted database overrides (Discord invite, community links,
 * background media). Never throws; decorative/optional links degrade to explicit
 * unavailable states rather than breaking a page.
 */
export const getSiteConfig = cache(async (): Promise<PublicSiteConfig | null> => {
  try {
    const env = getServerEnv();
    const defaults = siteConfigDefaultsFromEnv();
    if (!env.DATABASE_URL) return siteConfigFromDefaults(defaults);
    return await getPublicSiteConfig(getDb(), defaults);
  } catch {
    return null;
  }
});
