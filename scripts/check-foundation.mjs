import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { validateAgentSkills } from './check-agent-skills.mjs';
import { validatePresskit } from './check-presskit.mjs';

const root = process.cwd();
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean))];
const errors = [];
const fail = (message) => errors.push(message);
errors.push(...validateAgentSkills(root));
errors.push(...validatePresskit(root).errors);
const required = ['README.md', 'AGENTS.md', 'CLAUDE.md', 'SECURITY.md', 'CONTRIBUTING.md', 'LICENSE', 'NOTICE.md', '.env.example', '.claude/settings.json', 'docs/STATUS.md', 'docs/product/brief.md', 'docs/architecture/overview.md', 'docs/design/visual-spec.md', 'docs/design/screen-map.md', 'docs/security/auth-rbac.md', 'docs/implementation/plan.md', 'docs/implementation/verification.md', 'docs/handoff/claude-code-cloud.md', 'docs/handoff/start-prompt.md', 'docs/operations/deployment.md', 'assets/manifest.json'];
for (const file of required) if (!existsSync(file)) fail(`Missing required file: ${file}`);
if (!existsSync('apps/web/package.json') && (existsSync('apps/web/src') || existsSync('apps/web/Dockerfile'))) fail('Application source/Dockerfile exists without apps/web/package.json; application CI cannot be skipped.');

for (const file of files) {
  if (!existsSync(file)) { fail(`Indexed file missing from working tree: ${file}`); continue; }
  const base = path.basename(file);
  if ((base.startsWith('.env') && !base.endsWith('.example')) || /\.(pem|key|p12|avi|bk2|bik|pak|ucas|utoc|mp4|webm)$/i.test(file)) fail(`Forbidden public-repository file: ${file}`);
  if (/^(?:\.local|assets\/(?:incoming|private))\//.test(file)) fail(`Local-only directory tracked: ${file}`);
  if (statSync(file).size > 5 * 1024 * 1024) fail(`File exceeds 5 MiB source limit: ${file}`);
  if (file.endsWith('.json')) {
    try { JSON.parse(readFileSync(file, 'utf8')); } catch (error) { fail(`${file}: ${error.message}`); }
  }
  if (!/\.(md|json|ya?ml|example|[cm]?js|jsx|tsx?|toml)$/.test(file) && base !== 'Dockerfile') continue;
  const content = readFileSync(file, 'utf8');
  if (/[A-Z]:[\\/]Users[\\/]/i.test(content)) fail(`Machine-specific user path in ${file}`);
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) fail(`Private key material in ${file}`);
  if (/\bgh[pousr]_[A-Za-z0-9]{30,}\b/.test(content)) fail(`Possible GitHub credential in ${file}`);
  if (/\bgithub_pat_[A-Za-z0-9_]{30,}\b/.test(content)) fail(`Possible fine-grained GitHub credential in ${file}`);
  if (file.endsWith('.md')) {
    // Local link existence only; external URL/fragment checking is not claimed.
    const withoutCode = content.replace(/```[\s\S]*?```/g, '');
    for (const match of withoutCode.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].trim().replace(/^<|>$/g, '').split('#')[0];
      if (!target || /^(?:https?:|mailto:|data:)/i.test(target)) continue;
      if (target.startsWith('/')) { fail(`Use repository-relative local link in ${file}: ${target}`); continue; }
      const resolved = path.resolve(path.dirname(path.resolve(root, file)), decodeURIComponent(target));
      if (!resolved.startsWith(root + path.sep) && resolved !== root) fail(`Link escapes repository in ${file}: ${target}`);
      else if (!existsSync(resolved)) fail(`Broken local link in ${file}: ${target}`);
    }
  }
}

if (existsSync('assets/manifest.json')) {
  const manifest = JSON.parse(readFileSync('assets/manifest.json', 'utf8'));
  const seen = new Set();
  for (const asset of manifest.assets ?? []) {
    if (seen.has(asset.path)) fail(`Duplicate asset path: ${asset.path}`);
    seen.add(asset.path);
    const resolved = path.resolve(root, asset.path);
    if (!resolved.startsWith(root + path.sep) || !existsSync(resolved)) { fail(`Missing/invalid manifest asset: ${asset.path}`); continue; }
    const bytes = readFileSync(resolved);
    if (bytes.length !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) fail(`Asset digest/size mismatch: ${asset.path}`);
    if (!asset.source || !asset.usage || !asset.rights) fail(`Missing asset provenance: ${asset.path}`);
  }
  for (const file of files.filter((f) => /\.(png|jpg|jpeg|webp|woff2|svg)$/i.test(f))) {
    if (!seen.has(file)) fail(`Unregistered binary asset: ${file}`);
  }
}

if (existsSync('.claude/settings.json')) {
  const settings = JSON.parse(readFileSync('.claude/settings.json', 'utf8'));
  if (settings.attribution?.commit !== '' || settings.attribution?.pr !== '' || settings.attribution?.sessionUrl !== false) fail('Claude attribution settings must remain disabled.');
}

if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log(`Foundation checks passed (${files.length} files): required docs, skill structure, local links, JSON, asset integrity, basic public-file hygiene.`);
console.log(existsSync('apps/web/package.json') ? 'Application exists: its independent quality checks are also required.' : 'Application is not implemented. No application, auth, container or deployment verification is implied.');
