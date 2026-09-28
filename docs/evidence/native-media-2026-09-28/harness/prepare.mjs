// Run from the repository root. Generated files stay in the ignored app .local directory.
import {readFileSync, writeFileSync, mkdirSync, copyFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = process.cwd();
const target = path.join(root, 'apps/web/.local/edge-h264-proof');
const here = path.dirname(fileURLToPath(import.meta.url));
let source = readFileSync(path.join(root, 'apps/web/e2e/media/actual-media.spec.ts'), 'utf8');
const replacements = [
  ["from '../support/auth'", "from '../../e2e/support/auth'"],
  ["from './delivery'", "from '../../e2e/media/delivery'"],
  ["const EVIDENCE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.local/evidence/background-media');", 'const EVIDENCE_DIR = process.env.H264_PROOF_OUT!;'],
  ["const payload = { check: name,", "const payload = { sourceConfiguration: 'MP4-only environment; unmodified application player and native media APIs', check: name,"],
  ["if (support.vp9) expect(facts.currentSrc).toBe(`${MEDIA_PATH_PREFIX}${BACKGROUND_DELIVERY.webm}`);", "expect(support.h264).not.toBe('');\n    expect(facts.currentSrc).toBe(`${MEDIA_PATH_PREFIX}${BACKGROUND_DELIVERY.mp4}`);\n    await expect(page.locator('[data-background-video] source')).toHaveCount(1);"],
];
for (const [before, after] of replacements) {
  if (source.split(before).length !== 2) throw new Error(`Source changed; review adaptation anchor: ${before}`);
  source = source.replace(before, after);
}
mkdirSync(target, {recursive: true});
writeFileSync(path.join(target, 'mp4-only.spec.ts'), source);
for (const filename of ['dual.spec.ts', 'playwright.config.ts']) copyFileSync(path.join(here, filename), path.join(target, filename));
console.log('Prepared ignored native-media proof harness (11 MP4-only and 2 dual-source scenarios).');
