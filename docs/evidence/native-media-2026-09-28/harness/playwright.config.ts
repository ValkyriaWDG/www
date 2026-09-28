import path from 'node:path';
import {defineConfig} from '@playwright/test';
import baseline from '../../playwright.media.config';
const app = path.resolve(import.meta.dirname, '../..');
const mode = process.env.H264_PROOF_MODE === 'dual' ? 'dual' : 'mp4-only';
process.env.H264_PROOF_OUT = path.resolve(app, '../../.local/evidence/edge-h264-2026-09-28', mode);
const server = baseline.webServer as Exclude<typeof baseline.webServer, undefined | unknown[]>;
export default defineConfig({
 ...baseline,
 testDir: import.meta.dirname,
 testMatch: `${mode}.spec.ts`,
 outputDir: path.join(process.env.H264_PROOF_OUT, 'test-results'),
 globalSetup: path.join(app, 'e2e/media/verify-delivery.ts'),
 webServer: {...server, cwd: app, env: {...server.env,
  ...(mode === 'mp4-only' ? {BACKGROUND_VIDEO_WEBM_URL:''} : {}),
 }},
});