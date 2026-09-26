import { describe, expect, it } from 'vitest';
import { flattenAuditSummary } from './summary';

describe('flattenAuditSummary', () => {
  it('flattens nested summaries into dotted key/value lines and redacts on read', () => {
    const { entries, truncated } = flattenAuditSummary({
      from: { status: 'scheduled', publication: 'draft' },
      fields: ['opponentName', 'bestOf'],
      apiToken: 'secret',
      previous: null,
      rounds: 3,
    });
    expect(truncated).toBe(false);
    expect(entries).toEqual([
      { key: 'from.status', value: 'scheduled' },
      { key: 'from.publication', value: 'draft' },
      { key: 'fields', value: 'opponentName, bestOf' },
      { key: 'apiToken', value: '[redacted]' },
      { key: 'previous', value: '—' },
      { key: 'rounds', value: '3' },
    ]);
  });

  it('caps depth, line count and value length and replaces unusual keys', () => {
    const deep = flattenAuditSummary({ a: { b: { c: { d: 1 } } }, 'weird key<script>': 'x', long: 'y'.repeat(500) });
    expect(deep.entries).toContainEqual({ key: 'a.b.c', value: '[…]' });
    expect(deep.entries).toContainEqual({ key: '[key]', value: 'x' });
    expect(deep.entries.find((entry) => entry.key === 'long')!.value.length).toBeLessThanOrEqual(201);
    const many = flattenAuditSummary(Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`k${i}`, i])));
    expect(many.entries.length).toBeLessThanOrEqual(40);
    expect(flattenAuditSummary(null).entries).toEqual([]);
  });
});
