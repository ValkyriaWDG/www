import { z } from 'zod';
import { isSnowflake } from './snowflake';

/**
 * Server-only Discord REST adapter for authoritative guild membership lookups with the
 * bot token. The browser never supplies role data. Failures are never interpreted as
 * "zero roles": only an explicit Discord "unknown member/user" answer means not a member.
 */

export type GuildMemberFailureCode = 'not_configured' | 'rate_limited' | 'unavailable' | 'forbidden' | 'timeout' | 'invalid_response';

export type GuildMemberLookup =
  | { kind: 'member'; roleIds: string[]; observedAt: Date }
  | { kind: 'not_member'; observedAt: Date }
  | { kind: 'failure'; code: GuildMemberFailureCode };

export type DiscordClientConfig = {
  apiBaseUrl: string;
  botToken: string | undefined;
  guildId: string | undefined;
};

export type DiscordClientDeps = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  /** Timeout for a single HTTP attempt. */
  attemptTimeoutMs?: number;
  /** Upper bound for the whole lookup including Retry-After waits. */
  totalBudgetMs?: number;
  maxAttempts?: number;
};

const DEFAULT_ATTEMPT_TIMEOUT_MS = 2_500;
const DEFAULT_TOTAL_BUDGET_MS = 5_000;
const DEFAULT_MAX_ATTEMPTS = 3;
/** Discord JSON error codes: https://docs.discord.com/developers/topics/opcodes-and-status-codes */
const UNKNOWN_GUILD = 10004;
const UNKNOWN_MEMBER = 10007;
const UNKNOWN_USER = 10013;

const memberSchema = z.object({
  roles: z.array(z.string().regex(/^[0-9]{5,25}$/)).max(250),
  user: z.object({ id: z.string() }).optional(),
});

const errorSchema = z.object({ code: z.number().optional(), retry_after: z.number().optional() }).loose();

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function parseRetryAfterMs(response: Response, body: unknown): number | null {
  const header = response.headers.get('retry-after');
  if (header !== null && header.trim() !== '') {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  }
  const parsed = errorSchema.safeParse(body);
  if (parsed.success && typeof parsed.data.retry_after === 'number' && parsed.data.retry_after >= 0) {
    return Math.ceil(parsed.data.retry_after * 1000);
  }
  return null;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    if (text.length > 64_000) return null;
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/**
 * `GET {apiBaseUrl}/guilds/{guildId}/members/{userId}` with `Authorization: Bot <token>`.
 * 404 Unknown Member/User → `not_member`; 404 Unknown Guild, 401/403, 5xx, timeouts and
 * malformed bodies → `failure`. 429 honours Retry-After (header or body) with bounded
 * retries inside `totalBudgetMs`; if the wait does not fit the budget it fails fast.
 */
export async function fetchGuildMember(
  config: DiscordClientConfig,
  discordUserId: string,
  deps: DiscordClientDeps = {},
): Promise<GuildMemberLookup> {
  const { guildId, botToken } = config;
  if (!guildId || !botToken || !isSnowflake(guildId)) return { kind: 'failure', code: 'not_configured' };
  if (!isSnowflake(discordUserId)) return { kind: 'failure', code: 'invalid_response' };

  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? defaultSleep;
  const attemptTimeoutMs = deps.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
  const totalBudgetMs = deps.totalBudgetMs ?? DEFAULT_TOTAL_BUDGET_MS;
  const maxAttempts = deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const startedAt = now().getTime();
  const remaining = () => totalBudgetMs - (now().getTime() - startedAt);

  const base = config.apiBaseUrl.replace(/\/+$/, '');
  const url = `${base}/guilds/${guildId}/members/${discordUserId}`;
  let lastFailure: GuildMemberFailureCode = 'unavailable';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const budget = remaining();
    if (budget <= 0) return { kind: 'failure', code: lastFailure === 'rate_limited' ? 'rate_limited' : 'timeout' };

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: {
          Authorization: `Bot ${botToken}`,
          Accept: 'application/json',
          'User-Agent': 'DiscordBot (https://valkyriawdg.cz, 1.0)',
        },
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(Math.max(1, Math.min(attemptTimeoutMs, budget))),
      });
    } catch (error) {
      lastFailure = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError') ? 'timeout' : 'unavailable';
      if (attempt < maxAttempts && (await backoff(attempt, remaining, sleep))) continue;
      return { kind: 'failure', code: lastFailure };
    }

    const observedAt = now();
    if (response.status === 200) {
      const parsed = memberSchema.safeParse(await readJson(response));
      if (!parsed.success) return { kind: 'failure', code: 'invalid_response' };
      if (parsed.data.user && parsed.data.user.id !== discordUserId) return { kind: 'failure', code: 'invalid_response' };
      return { kind: 'member', roleIds: [...new Set(parsed.data.roles)], observedAt };
    }

    const body = await readJson(response);
    if (response.status === 404) {
      const code = errorSchema.safeParse(body).data?.code;
      // An unknown guild is a configuration/bot problem, never evidence that the user left.
      if (code === UNKNOWN_GUILD) return { kind: 'failure', code: 'unavailable' };
      if (code === undefined || code === UNKNOWN_MEMBER || code === UNKNOWN_USER) return { kind: 'not_member', observedAt };
      return { kind: 'failure', code: 'unavailable' };
    }
    if (response.status === 429) {
      lastFailure = 'rate_limited';
      const waitMs = parseRetryAfterMs(response, body);
      if (attempt >= maxAttempts || waitMs === null || waitMs > remaining() - 1) return { kind: 'failure', code: 'rate_limited' };
      await sleep(waitMs);
      continue;
    }
    if (response.status === 401 || response.status === 403) return { kind: 'failure', code: 'forbidden' };
    if (response.status >= 500) {
      lastFailure = 'unavailable';
      if (attempt < maxAttempts && (await backoff(attempt, remaining, sleep))) continue;
      return { kind: 'failure', code: 'unavailable' };
    }
    return { kind: 'failure', code: 'unavailable' };
  }
  return { kind: 'failure', code: lastFailure };
}

/** Exponential backoff (200 ms, 400 ms, …) only when it fits the remaining budget. */
async function backoff(attempt: number, remaining: () => number, sleep: (ms: number) => Promise<void>): Promise<boolean> {
  const waitMs = 200 * 2 ** (attempt - 1);
  if (waitMs >= remaining() - 1) return false;
  await sleep(waitMs);
  return true;
}
