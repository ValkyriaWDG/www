import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateAgentSkills } from '../check-agent-skills.mjs';

const valid = '---\nname: sample-skill\ndescription: Validate a bounded example.\n---\n\nRead the applicable contract and verify the result.\n';

function fixture(t, content = valid) {
  const root = mkdtempSync(path.join(tmpdir(), 'valkyria-skill-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const folder = path.join(root, '.claude', 'skills', 'sample-skill');
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, 'SKILL.md'), content);
  return root;
}

test('valid project skill works with LF and CRLF', (t) => {
  for (const content of [valid, valid.replaceAll('\n', '\r\n')]) {
    assert.deepEqual(validateAgentSkills(fixture(t, content), ['sample-skill']), []);
  }
});

test('missing required skill fails even when remaining skills are valid', (t) => {
  assert.ok(validateAgentSkills(fixture(t), ['sample-skill', 'missing-skill']).length > 0);
});

test('directory entry without SKILL.md fails discovery validation', (t) => {
  const root = fixture(t);
  mkdirSync(path.join(root, '.claude', 'skills', 'incomplete-skill'));
  assert.ok(validateAgentSkills(root, ['sample-skill']).length > 0);
});

test('malformed or ambiguous frontmatter and empty instructions fail', (t) => {
  const cases = [
    valid.replace('---\n', ''),
    valid.replace('name: sample-skill', 'name: another-skill'),
    valid.replace('description: Validate a bounded example.', ''),
    valid.replace('description: Validate a bounded example.', 'description: first\ndescription: second'),
    valid.replace('description: Validate a bounded example.', 'description: |\n  Multiple lines'),
    valid.replace('description: Validate a bounded example.', 'description: hidden: mapping'),
    valid.replace('description: Validate a bounded example.', 'description: !!str encoded'),
    valid.replace('description: Validate a bounded example.', 'description: false'),
    valid.replace('description: Validate a bounded example.', 'description: 2026-09-26'),
    valid.replace('description: Validate a bounded example.', 'description: 2026-09-26 12:00:00'),
    valid.replace('Read the applicable contract and verify the result.', ''),
  ];
  for (const content of cases) assert.ok(validateAgentSkills(fixture(t, content), ['sample-skill']).length > 0);
});
