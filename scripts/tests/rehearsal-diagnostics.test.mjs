import assert from 'node:assert/strict';
import test from 'node:test';
import { rehearsalDiagnostic } from '../release/rehearsal-diagnostics.mjs';

test('retains bounded process stderr without the command or credentials', () => {
  const password = 'synthetic-password/with+chars';
  const error = Object.assign(new Error(`Command failed: docker run -e SECRET=${password}`), {
    stderr: Buffer.from(`\u001b[31mConnection failed postgresql://test:${encodeURIComponent(password)}@database:5432/test_db\u001b[0m\nPOSTGRES_PASSWORD=${password}\nsharp: unavailable`),
    stdout: Buffer.from('do not expose the full command in stdout'),
    status: 1,
  });
  const detail = rehearsalDiagnostic(error, [password]);
  assert.match(detail, /sharp: unavailable/);
  assert.doesNotMatch(detail, /synthetic-password|with\+chars|postgresql:|docker run|SECRET=|stdout|\u001b/);
});

test('preserves assertion reasons and redacts secrets before bounding output', () => {
  const secret = 'synthetic-secret-0000000000';
  const detail = rehearsalDiagnostic(new Error(`Expected ready, received unavailable. ${secret}`), [secret]);
  assert.match(detail, /Expected ready, received unavailable/);
  assert.doesNotMatch(detail, /synthetic-secret/);
  const long = rehearsalDiagnostic({ stderr: Buffer.from('x'.repeat(9000) + secret) }, [secret]);
  assert(long.length <= 4096);
  assert.match(long, /truncated/);
  assert.doesNotMatch(long, /synthetic-secret/);
});

test('handles command failures without stderr without printing command arguments', () => {
  assert.equal(rehearsalDiagnostic(Object.assign(new Error('Command failed: docker run PRIVATE_ARGUMENT'), { status: 2, stderr: Buffer.alloc(0) })), 'Process failed without stderr.');
  assert.equal(rehearsalDiagnostic(null), 'No diagnostic available.');
});
