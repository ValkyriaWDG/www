import 'server-only';
import { getServerEnv } from '@/lib/env';
import { parseDiscordInvite, parseExternalHttpsUrl } from './external-links';

export type ShellLinks = { discordUrl: string | null; hllUrl: string | null };

/**
 * Validated external destinations for shell/home links. A missing or invalid value
 * becomes `null` (explicit unavailable state), never a substitute community link.
 */
export function getShellLinks(): ShellLinks {
  try {
    const env = getServerEnv();
    return { discordUrl: parseDiscordInvite(env.DISCORD_INVITE_URL), hllUrl: parseExternalHttpsUrl(env.HLL_WEBSITE_URL) };
  } catch {
    return { discordUrl: null, hllUrl: null };
  }
}
