import { ASSET_SCOPES, type AssetScope, type Executor } from '@valkyria/db';
import { DomainError, type ErrorCode } from '@/lib/result';
import type { Capability } from '@/modules/access/capabilities';
import { AccessDeniedError, type Actor } from '@/modules/access/types';
import { MAX_UPLOAD_BYTES } from './image';
import { uploadImage } from './library';
import { scopeCapability } from './scope';

/**
 * `POST /api/media/upload?scope=<editorial|match>` (multipart/form-data, field `file`
 * plus optional `provenance`, `rights`, `defaultAltCs`, `defaultAltEn`,
 * `defaultCaptionCs`, `defaultCaptionEn`). Same-origin only; the capability of the
 * requested scope is checked BEFORE the body is read; the body size is enforced while
 * streaming. Responds with `{ ok: true, asset }` or `{ ok: false, code }` (stable codes).
 */

export type UploadHandlerDeps = {
  db: Executor;
  /** Resolves a write-intent actor holding `capability` or throws AccessDeniedError. */
  requireActor: (capability: Capability) => Promise<Actor>;
  mediaRoot: string;
  /** Origins accepted in the `Origin` header (the configured site origin). */
  allowedOrigins: readonly string[];
  now?: () => Date;
};

/** Multipart framing allowance on top of the file limit. */
const MULTIPART_OVERHEAD = 256 * 1024;
export const MAX_UPLOAD_REQUEST_BYTES = MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD;

const STATUS: Partial<Record<ErrorCode, number>> = {
  validation: 400,
  unsupported_media: 415,
  payload_too_large: 413,
  rate_limited: 429,
  unauthenticated: 401,
  forbidden: 403,
  stale_authorization: 403,
  verification_unavailable: 503,
  not_member: 403,
  mfa_required: 403,
  unavailable: 503,
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function failure(code: ErrorCode, fieldErrors?: Record<string, string>): Response {
  return json(STATUS[code] ?? 500, fieldErrors ? { ok: false, code, fieldErrors } : { ok: false, code });
}

class TooLarge extends Error {}

/** Reads the request body, aborting as soon as `limit` bytes are exceeded. */
async function readBody(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      throw new TooLarge();
    }
    chunks.push(value);
  }
  const body = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function isSameOrigin(request: Request, allowed: readonly string[]): boolean {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin') return false;
  const origin = request.headers.get('origin');
  return origin !== null && allowed.includes(origin);
}

const optionalText = (form: FormData, key: string): string | undefined => {
  const value = form.get(key);
  return typeof value === 'string' ? value : undefined;
};

export async function handleUploadRequest(request: Request, deps: UploadHandlerDeps): Promise<Response> {
  if (!isSameOrigin(request, deps.allowedOrigins)) return failure('forbidden');
  const scopeParam = new URL(request.url).searchParams.get('scope');
  if (!scopeParam || !(ASSET_SCOPES as readonly string[]).includes(scopeParam)) return failure('validation', { scope: 'invalid' });
  const scope = scopeParam as AssetScope;

  let actor: Actor;
  try {
    actor = await deps.requireActor(scopeCapability(scope));
  } catch (error) {
    if (error instanceof AccessDeniedError) return failure(error.code);
    return failure('unavailable');
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!/^multipart\/form-data;\s*boundary=/i.test(contentType)) return failure('unsupported_media');
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_REQUEST_BYTES) return failure('payload_too_large');

  let form: FormData;
  try {
    const body = await readBody(request, MAX_UPLOAD_REQUEST_BYTES);
    form = await new Response(body, { headers: { 'content-type': contentType } }).formData();
  } catch (error) {
    if (error instanceof TooLarge) return failure('payload_too_large');
    return failure('validation', { file: 'malformed' });
  }
  const file = form.get('file');
  if (!file || typeof file === 'string') return failure('validation', { file: 'required' });
  if (file.size > MAX_UPLOAD_BYTES) return failure('payload_too_large');

  try {
    const asset = await uploadImage(
      deps.db,
      actor,
      {
        bytes: Buffer.from(await file.arrayBuffer()),
        filename: file.name || 'image',
        scope,
        provenance: optionalText(form, 'provenance'),
        rights: optionalText(form, 'rights'),
        defaultAltCs: optionalText(form, 'defaultAltCs'),
        defaultAltEn: optionalText(form, 'defaultAltEn'),
        defaultCaptionCs: optionalText(form, 'defaultCaptionCs'),
        defaultCaptionEn: optionalText(form, 'defaultCaptionEn'),
      },
      { mediaRoot: deps.mediaRoot, now: deps.now },
    );
    return json(201, { ok: true, asset });
  } catch (error) {
    if (error instanceof DomainError) return failure(error.code, error.fieldErrors);
    if (error instanceof AccessDeniedError) return failure(error.code);
    console.error(`[media.upload] unexpected failure: ${error instanceof Error ? error.name : 'unknown'}`);
    return failure('unexpected');
  }
}
