import { describe, expect, it } from 'vitest';
import { redactSummary } from './redact';

describe('redactSummary', () => {
  it('redacts sensitive keys at any depth', () => {
    const result = redactSummary({
      title: 'Published',
      sessionToken: 'abc',
      nested: { accessToken: 'x', email: 'user@example.com', password: 'p', slug: 'ok' },
    });
    expect(result).toEqual({
      title: 'Published',
      sessionToken: '[redacted]',
      nested: { accessToken: '[redacted]', email: '[redacted]', password: '[redacted]', slug: 'ok' },
    });
  });

  it('bounds string length and depth', () => {
    const long = 'x'.repeat(1000);
    const result = redactSummary({ a: { b: { c: { d: { e: long } } } }, s: long }) as Record<string, unknown>;
    expect(String(result.s).length).toBeLessThanOrEqual(301);
    expect(JSON.stringify(result)).toContain('[truncated]');
  });
});
