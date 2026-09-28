import path from 'node:path';
import {defineConfig} from '@playwright/test';
import baseline from '../../playwright.media.config';
const app=path.resolve(import.meta.dirname,'../..');
const product=process.env.BROWSER_PROOF_PRODUCT;
if(product!=='chrome-for-testing'&&product!=='playwright-firefox')throw new Error('Select an explicit test-browser product');
const mode=process.env.BROWSER_PROOF_MODE;
if(!['default','mp4-only','fallback'].includes(mode??''))throw new Error('Select an explicit media source mode');
const firefox=product==='playwright-firefox';
process.env.BROWSER_PROOF_OUT=path.resolve(app,'../../.local/evidence/browser-qualification-2026-09-28',product,mode!);
const server=baseline.webServer as Exclude<typeof baseline.webServer,undefined|unknown[]>;
export default defineConfig({
 ...baseline,
 testDir:import.meta.dirname,
 testMatch:mode==='fallback'?'dual.spec.ts':'native.spec.ts',
 // Firefox does not support Playwright's isMobile emulation. This scope exclusion is reported explicitly.
 grepInvert:firefox?/mobile: zero video requests/:undefined,
 projects:[{name:product,use:{browserName:firefox?'firefox':'chromium',launchOptions:{executablePath:process.env.BROWSER_PROOF_EXECUTABLE}}}],
 outputDir:path.join(process.env.BROWSER_PROOF_OUT,'test-results'),
 globalSetup:path.join(app,'e2e/media/verify-delivery.ts'),
 webServer:{...server,cwd:app,env:{...server.env,...(mode==='mp4-only'?{BACKGROUND_VIDEO_WEBM_URL:''}:{})}},
});
