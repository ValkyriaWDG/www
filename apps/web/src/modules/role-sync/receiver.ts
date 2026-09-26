import type { Database } from '@valkyria/db';
import { MAX_BODY_BYTES, RoleSyncError, validReceiverConfig, verifyEnvelope, type ReceiverConfig } from './protocol';
import { acceptEnvelope } from './store';

const headers = { 'cache-control': 'private, no-store, max-age=0' };
const failure = (code: string, status: number) => Response.json({ code }, { status, headers });

/** Bounded streaming read: Content-Length is neither trusted nor required. */
async function readBody(request: Request): Promise<Uint8Array> {
  if (request.headers.get('content-encoding') && request.headers.get('content-encoding') !== 'identity') throw new RoleSyncError('INVALID_REQUEST');
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) throw new RoleSyncError('INVALID_REQUEST');
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw new RoleSyncError('BODY_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) throw new RoleSyncError('INVALID_REQUEST');
  const chunks: Uint8Array[] = [];
  let length = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new RoleSyncError('BODY_TIMEOUT')), 5000); });
  try {
    for (;;) {
      const item = await Promise.race([reader.read(), deadline]);
      if (item.done) return Buffer.concat(chunks, length);
      length += item.value.byteLength;
      if (length > MAX_BODY_BYTES) throw new RoleSyncError('BODY_TOO_LARGE');
      chunks.push(item.value);
    }
  } catch (error) { void reader.cancel().catch(() => undefined); throw error; }
  finally { clearTimeout(timer); reader.releaseLock(); }
}

export async function receiveRoleSync(request: Request, deps: { db: Database; config: ReceiverConfig; now?: () => Date }): Promise<Response> {
  if (!deps.config.enabled) return failure('DISABLED', 503);
  if (!validReceiverConfig(deps.config)) return failure('UNAVAILABLE', 503);
  const now = deps.now ?? (() => new Date());
  try {
    const url = new URL(request.url);
    const body = await readBody(request);
    const verified = verifyEnvelope({ method: request.method, path: `${url.pathname}${url.search}`, headers: request.headers, body }, deps.config, now());
    const outcome = await acceptEnvelope(deps.db, verified, now);
    if (outcome === 'APPLIED') return new Response(null, { status: 204, headers });
    return Response.json({ code: outcome, eventId: verified.event.eventId }, { status: outcome === 'EXPIRED_REQUEST' ? 401 : 409, headers });
  } catch (error) {
    if (error instanceof RoleSyncError) return failure(error.code, error.code === 'UNAUTHORIZED' ? 401 : error.code === 'BODY_TOO_LARGE' ? 413 : error.code === 'BODY_TIMEOUT' ? 408 : 400);
    // A failed/unknown commit never produces a success ACK. Sender retries the same event.
    return failure('UNAVAILABLE', 503);
  }
}
