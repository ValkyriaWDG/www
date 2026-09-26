import { describe, expect, it } from 'vitest';
import { uploadResultFrom } from './upload';

describe('upload response mapping', () => {
  it('accepts only a well-formed success body', () => {
    expect(uploadResultFrom(201, { ok: true, asset: { id: 'a' } })).toEqual({ ok: true, asset: { id: 'a' } });
    expect(uploadResultFrom(201, { ok: true })).toEqual({ ok: false, code: 'unexpected' });
  });

  it('keeps known stable codes and never surfaces unknown server text', () => {
    expect(uploadResultFrom(415, { ok: false, code: 'unsupported_media' })).toEqual({ ok: false, code: 'unsupported_media' });
    expect(uploadResultFrom(403, { ok: false, code: 'forbidden' })).toEqual({ ok: false, code: 'forbidden' });
    expect(uploadResultFrom(400, { ok: false, code: '<script>' })).toEqual({ ok: false, code: 'unexpected' });
  });

  it('falls back to the HTTP status when the body is not JSON', () => {
    expect(uploadResultFrom(413, null)).toEqual({ ok: false, code: 'payload_too_large' });
    expect(uploadResultFrom(429, null)).toEqual({ ok: false, code: 'rate_limited' });
    expect(uploadResultFrom(0, null)).toEqual({ ok: false, code: 'unavailable' });
    expect(uploadResultFrom(502, null)).toEqual({ ok: false, code: 'unavailable' });
  });
});
