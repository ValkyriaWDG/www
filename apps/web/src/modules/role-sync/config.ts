import { validReceiverConfig, type ReceiverConfig } from './protocol';

/** Strict opt-in, independently parsed so disabled public pages need no integration secrets. */
export function roleSyncConfig(source: Record<string, string | undefined> = process.env): ReceiverConfig {
  if (source.ROLE_SYNC_ENABLED !== 'true') return { enabled: false, producer: '', guildId: '', keys: {} };
  let keys: unknown;
  try { keys = JSON.parse(source.ROLE_SYNC_KEYS_JSON ?? '{}'); } catch { throw new Error('ROLE_SYNC_CONFIG_INVALID'); }
  if (!keys || typeof keys !== 'object' || Array.isArray(keys) || !Object.values(keys).every((key) => typeof key === 'string')) throw new Error('ROLE_SYNC_CONFIG_INVALID');
  const config: ReceiverConfig = { enabled: true, producer: source.ROLE_SYNC_PRODUCER_ID ?? '', guildId: source.DISCORD_GUILD_ID ?? '', keys: keys as Record<string, string> };
  if (!validReceiverConfig(config)) throw new Error('ROLE_SYNC_CONFIG_INVALID');
  const unrelatedSecrets = [source.BOT_MANAGEMENT_SECRET, source.BETTER_AUTH_SECRET, source.DISCORD_BOT_TOKEN, source.DISCORD_CLIENT_SECRET].filter(Boolean);
  if (Object.values(config.keys).some((key) => unrelatedSecrets.includes(key))) throw new Error('ROLE_SYNC_CONFIG_INVALID');
  return config;
}
