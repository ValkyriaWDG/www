import { execFileSync } from 'node:child_process';

// Pass a trusted revision range via argv; never interpolate PR text into a shell.
const revision = process.argv[2] ?? 'HEAD';
if (!/^[a-zA-Z0-9_./~-]+$/.test(revision) || revision.startsWith('-')) throw new Error('Invalid revision range');
const messages = execFileSync('git', ['log', '--format=%H%n%B%x00', revision], { encoding: 'utf8' });
const disallowed = /^(?:Co-Authored-By:.*(?:Claude|Codex|Anthropic|OpenAI|Copilot|Gemini|\bAI\b)|Claude-Session:|.*Generated (?:with|by) (?:Claude|Codex|AI)|.*https:\/\/(?:claude\.ai|claude\.com)\/(?:code\/)?session)[^\n]*$/im;
if (disallowed.test(messages)) {
  console.error('AI attribution/session footer detected. Preserve human attribution; correct new task commits before publishing.');
  process.exit(1);
}
console.log('Commit attribution check passed.');
