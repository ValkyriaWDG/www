/** Diagnostic text only: never return execFile's message because it includes argv. */
export function rehearsalDiagnostic(error, secrets = []) {
  if (!error || typeof error !== 'object') return 'No diagnostic available.';
  const processFailure = 'stderr' in error || 'status' in error || /^Command failed:/.test(error.message ?? '');
  let text = processFailure
    ? String(error.stderr ?? '').trim() || 'Process failed without stderr.'
    : typeof error.message === 'string' ? error.message : 'No diagnostic available.';
  for (const secret of secrets.filter(value => typeof value === 'string' && value.length)) {
    text = text.replaceAll(secret, '[redacted]').replaceAll(encodeURIComponent(secret), '[redacted]');
  }
  text = text
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\bpostgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[database-url]')
    .replace(/\b[A-Z][A-Z0-9_]*(?:PASSWORD|TOKEN|SECRET)\s*=\s*[^\s"']+/gi, '[credential]')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
  return text.length > 4096 ? '[truncated]\n' + text.slice(-4084) : text;
}
