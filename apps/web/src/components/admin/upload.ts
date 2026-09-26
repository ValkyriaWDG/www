import type { AssetDTO } from '@/modules/media/library';

/**
 * Browser upload to `POST /api/media/upload?scope=…` with byte progress (XHR, because
 * fetch has no upload progress). The server validates, decodes and re-encodes the image;
 * this helper only reports phases and the stable result code, never raw server text.
 */

export type UploadScope = 'editorial' | 'match';
export type UploadPhase = 'uploading' | 'processing';

/** Asset as serialized in the JSON response (dates are ISO strings). */
export type UploadedAsset = Omit<AssetDTO, 'createdAt' | 'updatedAt'> & { createdAt: string; updatedAt: string };

export type UploadResult = { ok: true; asset: UploadedAsset } | { ok: false; code: string };

export type UploadOptions = {
  scope: UploadScope;
  /** Optional library defaults sent with the file (e.g. default alt text). */
  metadata?: Partial<Record<'provenance' | 'rights' | 'defaultAltCs' | 'defaultAltEn' | 'defaultCaptionCs' | 'defaultCaptionEn', string>>;
  onProgress?: (fraction: number) => void;
  onPhase?: (phase: UploadPhase) => void;
  signal?: AbortSignal;
};

const KNOWN_CODES = new Set([
  'validation',
  'unsupported_media',
  'payload_too_large',
  'rate_limited',
  'unauthenticated',
  'forbidden',
  'stale_authorization',
  'verification_unavailable',
  'not_member',
  'mfa_required',
  'unavailable',
  'unexpected',
]);

/** Maps a response status/body to a stable code (unknown codes → `unexpected`). */
export function uploadResultFrom(status: number, body: unknown): UploadResult {
  const data = body as { ok?: unknown; asset?: unknown; code?: unknown } | null;
  if (status >= 200 && status < 300 && data?.ok === true && data.asset && typeof data.asset === 'object') {
    return { ok: true, asset: data.asset as UploadedAsset };
  }
  if (data && typeof data.code === 'string' && KNOWN_CODES.has(data.code)) return { ok: false, code: data.code };
  if (status === 413) return { ok: false, code: 'payload_too_large' };
  if (status === 415) return { ok: false, code: 'unsupported_media' };
  if (status === 429) return { ok: false, code: 'rate_limited' };
  if (status === 401) return { ok: false, code: 'unauthenticated' };
  if (status === 403) return { ok: false, code: 'forbidden' };
  if (status === 0 || status >= 500) return { ok: false, code: 'unavailable' };
  return { ok: false, code: 'unexpected' };
}

export function uploadImageFile(file: File, options: UploadOptions): Promise<UploadResult> {
  return new Promise((resolve) => {
    const form = new FormData();
    form.append('file', file, file.name);
    for (const [key, value] of Object.entries(options.metadata ?? {})) if (value) form.append(key, value);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/media/upload?scope=${encodeURIComponent(options.scope)}`);
    xhr.responseType = 'text';
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) options.onProgress?.(Math.min(1, event.loaded / event.total));
    };
    xhr.upload.onload = () => {
      options.onProgress?.(1);
      options.onPhase?.('processing');
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      resolve(uploadResultFrom(xhr.status, body));
    };
    xhr.onerror = () => resolve({ ok: false, code: 'unavailable' });
    xhr.onabort = () => resolve({ ok: false, code: 'aborted' });
    options.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    options.onPhase?.('uploading');
    xhr.send(form);
  });
}
