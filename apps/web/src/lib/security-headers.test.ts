import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy } from './security-headers';

describe('buildContentSecurityPolicy', () => {
  it('requires a nonce for scripts and forbids framing in production', () => {
    const csp = buildContentSecurityPolicy('abc123', { NODE_ENV: 'production', APP_URL: 'https://valkyriawdg.cz' });
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('only allows explicitly configured https media origins', () => {
    const csp = buildContentSecurityPolicy('n', {
      NODE_ENV: 'production',
      BACKGROUND_VIDEO_MP4_URL: 'https://media.example.org/loop.mp4',
      BACKGROUND_VIDEO_WEBM_URL: 'http://insecure.example.org/loop.webm',
    });
    expect(csp).toContain("media-src 'self' https://media.example.org");
    expect(csp).not.toContain('insecure.example.org');
    expect(csp).not.toContain('upgrade-insecure-requests');
  });
});
