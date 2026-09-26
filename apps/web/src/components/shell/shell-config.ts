import 'server-only';
import { getSiteConfig } from '@/lib/site-config';
import { parseDiscordInvite, parseExternalHttpsUrl } from './external-links';

export type ShellLinks = { discordUrl: string | null; hllUrl: string | null; hllArchiveUrl: string | null };

/**
 * Validated external destinations for shell/home links (environment defaults plus admin
 * settings overrides). A missing or invalid value becomes `null` (explicit unavailable
 * state), never a substitute community link.
 */
export async function getShellLinks(): Promise<ShellLinks> {
  const config = await getSiteConfig();
  return {
    discordUrl: parseDiscordInvite(config?.discordInviteUrl),
    hllUrl: parseExternalHttpsUrl(config?.hllWebsiteUrl),
    hllArchiveUrl: parseExternalHttpsUrl(config?.hllMatchArchiveUrl),
  };
}
