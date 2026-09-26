import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const requiredNames = ['delivery', 'frontend', 'backend', 'auth', 'database', 'github', 'verification', 'release'].map((name) => `valkyria-${name}`);

// This repository intentionally uses the plain two-string YAML subset documented
// in docs/engineering/skills.md. Reject unsupported syntax instead of misparsing it.
export function validateAgentSkills(root, required = requiredNames) {
  const errors = [];
  const directory = path.join(root, '.claude', 'skills');
  if (!existsSync(directory)) return ['Missing .claude/skills directory'];
  const folders = readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  for (const name of required) if (!folders.includes(name)) errors.push(`Missing required skill: ${name}`);
  for (const folder of folders) {
    const file = path.join(directory, folder, 'SKILL.md');
    if (!existsSync(file)) { errors.push(`${folder}: missing SKILL.md`); continue; }
    const content = readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
    const match = /^---\n([^]*?)\n---\n([^]*)$/.exec(content);
    if (!match) { errors.push(`${folder}: missing YAML frontmatter or body`); continue; }
    const fields = new Map();
    for (const line of match[1].split('\n')) {
      const field = /^(name|description): (\S.*)$/.exec(line);
      if (!field || fields.has(field[1])) { errors.push(`${folder}: use unique name and description plain-string fields`); continue; }
      const value = field[2].trim();
      if (/^[\[\]{}&*!|>'"%@`#?:-]|:\s|\s#/.test(value)) errors.push(`${folder}: unsupported YAML string syntax in ${field[1]}`);
      if (/^(?:null|true|false|yes|no|on|off|~|[+\-.\d][\w.+:-]*)$/i.test(value)) errors.push(`${folder}: ${field[1]} must be a plain string, not a typed YAML scalar`);
      if (/^\d{4}-\d{1,2}-\d{1,2}(?:[Tt]|[ \t]+)\d/.test(value)) errors.push(`${folder}: ${field[1]} must be a plain string, not a YAML timestamp`);
      fields.set(field[1], value);
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(folder) || folder.length > 63 || fields.get('name') !== folder) errors.push(`${folder}: skill name must match its lowercase-hyphenated directory`);
    const description = fields.get('description');
    if (!description || description.length > 1024) errors.push(`${folder}: description must contain 1–1024 characters`);
    if (!match[2].trim()) errors.push(`${folder}: skill body is empty`);
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const errors = validateAgentSkills(process.cwd());
  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  } else console.log('Agent skill structure passed; client discovery and behavioral execution are separate checks.');
}
