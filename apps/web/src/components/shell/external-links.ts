/** Hosts that may serve a Valkyria Discord invitation; anything else is treated as unavailable. */
const DISCORD_HOSTS = new Set(['discord.gg', 'discord.com', 'www.discord.com']);
const INVITE_CODE = /^[A-Za-z0-9-]{2,64}$/;

/**
 * Validates a configured Discord invitation: HTTPS, discord.gg/<code> or
 * discord.com/invite/<code>, no credentials/port/query tricks. Returns the normalized
 * URL or `null` (the UI then renders an explicit unavailable state, never a guess).
 */
export function parseDiscordInvite(value: string | null | undefined): string | null {
  const url = parseHttps(value);
  if (!url || !DISCORD_HOSTS.has(url.hostname) || url.search || url.hash) return null;
  const segments = url.pathname.split('/').filter(Boolean);
  const code = url.hostname === 'discord.gg' ? (segments.length === 1 ? segments[0] : undefined) : segments.length === 2 && segments[0] === 'invite' ? segments[1] : undefined;
  if (!code || !INVITE_CODE.test(code)) return null;
  return url.toString();
}

/** Accepts only plain HTTPS URLs without embedded credentials or custom ports. */
export function parseExternalHttpsUrl(value: string | null | undefined): string | null {
  const url = parseHttps(value);
  return url ? url.toString() : null;
}

function parseHttps(value: string | null | undefined): URL | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  return url;
}
