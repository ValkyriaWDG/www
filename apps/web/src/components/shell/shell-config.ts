import 'server-only';
import { getSiteConfig } from '@/lib/site-config';
import { parseDiscordInvite } from './external-links';

export type ShellLinks = { discordUrl: string | null };

/**
 * Validated external destinations for shell/home links (environment defaults plus admin
 * settings overrides). A missing or invalid value becomes `null` (explicit unavailable
 * state), never a substitute community link. The former HLL website is not linked.
 */
export async function getShellLinks(): Promise<ShellLinks> {
  const config = await getSiteConfig();
  return {
    discordUrl: parseDiscordInvite(config?.discordInviteUrl),
  };
}
