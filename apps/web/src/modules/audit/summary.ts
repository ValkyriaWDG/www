import { redactSummary } from './redact';

/** One printable line of a redacted audit summary (`key` is a dotted path). */
export type AuditSummaryEntry = { key: string; value: string };

const MAX_ENTRIES = 40;
const MAX_DEPTH = 3;
const MAX_VALUE = 200;
const SAFE_KEY = /^[A-Za-z0-9_.-]{1,60}$/;

function scalar(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value.length > MAX_VALUE ? `${value.slice(0, MAX_VALUE)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '[…]';
}

/**
 * Flattens a stored audit summary into bounded key/value lines for display. The summary
 * is redacted again on read (defense in depth), nesting is capped at three levels,
 * arrays of scalars are joined, unusual keys are replaced and at most 40 lines are shown.
 * No raw JSON of unknown depth ever reaches the page.
 */
export function flattenAuditSummary(summary: unknown): { entries: AuditSummaryEntry[]; truncated: boolean } {
  const redacted = redactSummary(summary ?? {});
  const entries: AuditSummaryEntry[] = [];
  let truncated = false;
  const push = (key: string, value: string) => {
    if (entries.length >= MAX_ENTRIES) {
      truncated = true;
      return;
    }
    entries.push({ key, value });
  };
  const walk = (value: unknown, path: string, depth: number) => {
    if (Array.isArray(value)) {
      if (value.every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item))) {
        push(path, value.length === 0 ? '—' : value.map(scalar).join(', '));
        return;
      }
      if (depth >= MAX_DEPTH) {
        push(path, '[…]');
        return;
      }
      value.forEach((item, index) => walk(item, `${path}.${index}`, depth + 1));
      return;
    }
    if (typeof value === 'object' && value !== null) {
      const fields = Object.entries(value as Record<string, unknown>);
      if (fields.length === 0) {
        if (path) push(path, '—');
        return;
      }
      if (depth >= MAX_DEPTH) {
        push(path, '[…]');
        return;
      }
      for (const [rawKey, item] of fields) {
        const key = SAFE_KEY.test(rawKey) ? rawKey : '[key]';
        walk(item, path ? `${path}.${key}` : key, depth + 1);
      }
      return;
    }
    push(path || 'value', scalar(value));
  };
  walk(redacted, '', 0);
  return { entries, truncated };
}
