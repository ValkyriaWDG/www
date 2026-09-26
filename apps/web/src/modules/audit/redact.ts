const SENSITIVE_KEY = /(token|secret|password|passwd|cookie|session|authorization|email|credential|otp|totp|backup|signature|ip_?address|user_?agent)/i;
const MAX_STRING = 300;
const MAX_DEPTH = 4;
const MAX_KEYS = 40;

/**
 * Produces a bounded, redacted summary safe for the audit log: sensitive keys are
 * replaced, long strings truncated, nesting and key counts capped.
 */
export function redactSummary(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, MAX_KEYS).map((item) => redactSummary(item, depth + 1));
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, MAX_KEYS)) {
      result[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redactSummary(item, depth + 1);
    }
    return result;
  }
  return String(value);
}
