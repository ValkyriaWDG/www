import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=process.cwd();
const out=path.join(root,'apps/web/.local/browser-qualification');
mkdirSync(out,{recursive:true});
let source=readFileSync(path.join(root,'apps/web/e2e/media/actual-media.spec.ts'),'utf8');
const changes=[
 ["from '../support/auth'","from '../../e2e/support/auth'"],
 ["from './delivery'","from '../../e2e/media/delivery'"],
 ["const EVIDENCE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.local/evidence/background-media');","const EVIDENCE_DIR = process.env.BROWSER_PROOF_OUT!;"],
 ["const payload = { check: name,","const payload = { browserProduct: process.env.BROWSER_PROOF_PRODUCT, sourceConfiguration: process.env.BROWSER_PROOF_MODE, check: name,"],
 ["expect(facts.videoDecodedBytes ?? 0).toBeGreaterThan(0);","// Firefox exposes frame quality, not WebKit decoded-byte counters. Both are native observations.\n    if (facts.videoDecodedBytes !== null) expect(facts.videoDecodedBytes).toBeGreaterThan(0);\n    else expect(facts.totalVideoFrames ?? 0).toBeGreaterThan(0);"],
 ["if (support.vp9) expect(facts.currentSrc).toBe(`${MEDIA_PATH_PREFIX}${BACKGROUND_DELIVERY.webm}`);","if (process.env.BROWSER_PROOF_MODE === 'mp4-only') {\n      expect(support.h264).not.toBe('');\n      expect(facts.currentSrc).toBe(`${MEDIA_PATH_PREFIX}${BACKGROUND_DELIVERY.mp4}`);\n      await expect(page.locator('[data-background-video] source')).toHaveCount(1);\n    } else if (support.vp9) expect(facts.currentSrc).toBe(`${MEDIA_PATH_PREFIX}${BACKGROUND_DELIVERY.webm}`);"],
];
for(const [before,after] of changes){if(source.split(before).length!==2)throw new Error('Source anchor changed: '+before);source=source.replace(before,after);}
writeFileSync(path.join(out,'native.spec.ts'),source);
const here=path.dirname(fileURLToPath(import.meta.url));
for(const filename of ['dual.spec.ts','playwright.config.ts'])copyFileSync(path.join(here,filename),path.join(out,filename));
console.log('Prepared ignored browser qualification harness.');
