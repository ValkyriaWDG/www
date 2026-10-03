import 'server-only';

/**
 * Bounded HTTPS transport shared by the Logi collection client and the on-demand
 * readers: fixed origin and `/api/v1/clan/<path>` path, explicit `game` query, bearer
 * key, no redirects, no store, abortable timeout and a size-limited JSON body. Errors
 * carry a stable category only; a response body, URL, key or fetch error is never kept.
 */

export type LogiErrorCode = 'configuration' | 'unauthorized' | 'forbidden' | 'not_found' | 'reset_required' | 'rate_limited' | 'upstream' | 'network' | 'timeout' | 'invalid_response' | 'redirect' | 'scope_mismatch' | 'unknown_outcome';

/** Stable categories only: never retain a response body, URL, bearer key or fetch error. */
export class LogiClientError extends Error {
  constructor(readonly code: LogiErrorCode, readonly retryAfterMs: number | null = null) {
    super(`Logi request failed: ${code}`);
    this.name = 'LogiClientError';
  }
}

export type LogiRequestOptions = { signal?: AbortSignal };
export type LogiFetch = (input: string, init: RequestInit) => Promise<Response>;

export type LogiTransportConfig = {
  /** Origin only. The API path is fixed by this adapter, not by user input. */
  origin: string;
  apiKey: string;
  gameId: 'hell_let_loose' | 'wardogs';
  /** Test/development only; accepts exact loopback hosts, never arbitrary HTTP. */
  allowLoopbackHttp?: boolean;
  environment?: 'production' | 'development' | 'test';
  timeoutMs?: number;
  maxBodyBytes?: number;
};

export const LOGI_DEFAULT_TIMEOUT_MS = 5000;
export const LOGI_MAX_TIMEOUT_MS = 15_000;
export const LOGI_MAX_BODY_BYTES = 2 * 1024 * 1024;

export function validateLogiOrigin(value: string, input: Pick<LogiTransportConfig, 'allowLoopbackHttp' | 'environment'> = {}): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new LogiClientError('configuration'); }
  const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
  const environment = input.environment ?? process.env.NODE_ENV ?? 'production';
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback && input.allowLoopbackHttp === true && environment !== 'production'))
    || (loopback && (environment === 'production' || !input.allowLoopbackHttp))) throw new LogiClientError('configuration');
  return url.origin;
}

export function logiRetryAfterMs(value: string | null, nowMs: number): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const milliseconds = Number(trimmed) * 1000;
    return Number.isSafeInteger(Math.ceil(milliseconds)) ? Math.ceil(milliseconds) : null;
  }
  if (!/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(trimmed)) return null;
  const date = Date.parse(trimmed);
  return Number.isFinite(date) ? Math.max(0, date - nowMs) : null;
}

function invalid(): never { throw new LogiClientError('invalid_response'); }

export function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new LogiClientError('timeout'));
  return new Promise((resolve, reject) => {
    const aborted = () => reject(new LogiClientError('timeout'));
    signal.addEventListener('abort', aborted, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}

export async function boundedJson(response: Response, maxBytes: number, signal: AbortSignal): Promise<unknown> {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) invalid();
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) invalid();
  if (!response.body) invalid();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await abortable(reader.read(), signal);
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maxBytes) invalid();
      chunks.push(next.value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as unknown; } catch { return invalid(); }
  } finally {
    // Do not await an untrusted stalled stream cancellation.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export type LogiTransport = {
  readonly origin: string;
  readonly timeoutMs: number;
  /** Parsed JSON body of a 2xx response; every other outcome is a `LogiClientError`. */
  get(path: string, query: Record<string, string>, options?: LogiRequestOptions): Promise<unknown>;
};

export function createLogiTransport(config: LogiTransportConfig, dependencies: { fetchImpl?: LogiFetch; now?: () => number } = {}): LogiTransport {
  if (!/^[\x21-\x7e]{16,1024}$/.test(config.apiKey) || !['hell_let_loose', 'wardogs'].includes(config.gameId)) throw new LogiClientError('configuration');
  const origin = validateLogiOrigin(config.origin, config);
  const apiKey = config.apiKey;
  const gameId = config.gameId;
  const timeoutMs = config.timeoutMs ?? LOGI_DEFAULT_TIMEOUT_MS;
  const maxBytes = config.maxBodyBytes ?? LOGI_MAX_BODY_BYTES;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > LOGI_MAX_TIMEOUT_MS || !Number.isInteger(maxBytes) || maxBytes < 64 || maxBytes > LOGI_MAX_BODY_BYTES) throw new LogiClientError('configuration');
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const now = dependencies.now ?? Date.now;

  async function get(path: string, query: Record<string, string>, options: LogiRequestOptions = {}): Promise<unknown> {
    const url = new URL(`/api/v1/clan/${path}`, origin);
    url.search = new URLSearchParams({ ...query, game: gameId }).toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    try {
      if (controller.signal.aborted) throw new LogiClientError('timeout');
      const response = await abortable(fetchImpl(url.href, {
        method: 'GET', headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'User-Agent': 'Valkyria-Web-Logi/1.0' },
        redirect: 'manual', cache: 'no-store', credentials: 'omit', signal: controller.signal,
      }), controller.signal);
      if (response.status >= 300 && response.status < 400 || response.redirected || response.url && response.url !== url.href) throw new LogiClientError('redirect');
      if (response.status === 401) throw new LogiClientError('unauthorized');
      if (response.status === 403) throw new LogiClientError('forbidden');
      if (response.status === 404) throw new LogiClientError('not_found');
      if (response.status === 410) throw new LogiClientError('reset_required');
      if (response.status === 429) throw new LogiClientError('rate_limited', logiRetryAfterMs(response.headers.get('retry-after'), now()));
      if (!response.ok) throw new LogiClientError('upstream', logiRetryAfterMs(response.headers.get('retry-after'), now()));
      return await boundedJson(response, maxBytes, controller.signal);
    } catch (error) {
      if (error instanceof LogiClientError) throw error;
      throw new LogiClientError(controller.signal.aborted ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      controller.abort();
    }
  }

  return { origin, timeoutMs, get };
}
