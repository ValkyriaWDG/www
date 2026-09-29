#!/usr/bin/env node
'use strict';

// Anonymous production reads only. Run after the operator supplies observed deployment identity.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { existsSync, readFileSync, writeFileSync, openSync, writeSync, ftruncateSync, closeSync } = require('node:fs');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { isAbortedRscPrefetch } = require('./request-classification.cjs');
const root = path.resolve(__dirname, '../../..');
const args = process.argv.slice(2);
const arg = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
if (args.includes('--help')) {
  console.log('node browser-smoke.cjs --media-origin <effective approved origin> --dependency-root <installed checkout> --revision <actual-40-hex> --digest sha256:<actual-64-hex> --identity-ref <public evidence filename> --browser-executable <isolated browser path> --browser-product <product name> [--report-id <safe-name>]');
  process.exit(0);
}
const origin = 'https://valkyria.cz';
const mediaOrigin=arg('--media-origin');
assert(['https://valkyria.cz','https://valkyriawdg.cz'].includes(mediaOrigin),'Supply effective media origin.');
const allowedOrigins=new Set([origin,mediaOrigin]);
const revision = arg('--revision'), imageDigest = arg('--digest'), identityReference = arg('--identity-ref');
const executablePath = arg('--browser-executable'), browserProduct = arg('--browser-product');
const reportId = arg('--report-id') ?? 'browser-after';
assert(/^[a-f0-9]{40}$/.test(revision ?? ''), 'Supply operator-observed revision.');
assert(/^sha256:[a-f0-9]{64}$/.test(imageDigest ?? ''), 'Supply operator-observed digest.');
assert(/^[a-zA-Z0-9._/-]{1,150}$/.test(identityReference ?? ''), 'Supply sanitized public identity reference.');
assert(executablePath && existsSync(executablePath), 'Select an existing explicit browser executable.');
assert(browserProduct && /^[A-Za-z0-9 .-]{1,80}$/.test(browserProduct), 'Name the actual browser product.');
assert(/^[a-z0-9-]{1,80}$/.test(reportId), 'Invalid report ID.');
const reportPath = path.join(__dirname, `${reportId}.json`);
assert(!existsSync(reportPath), 'Preserve prior reports: select a new report ID.');
const dependencyRoot=arg('--dependency-root'); assert(dependencyRoot,'Supply installed dependency checkout.');
const appRequire = createRequire(path.join(path.resolve(dependencyRoot), 'apps/web/package.json'));
const reportFd=openSync(reportPath,'wx');
const { chromium } = appRequire('@playwright/test');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestBytes = readFileSync(path.join(root, 'assets/background-media.json'));
const manifest = JSON.parse(manifestBytes);
const artworkManifestBytes = readFileSync(path.join(__dirname, 'hll-artwork-manifest.json'));
const artworkManifest = JSON.parse(artworkManifestBytes);
const hllPoster = artworkManifest.assets.find(asset => asset.path.endsWith('/scene-poster.webp'));
assert(hllPoster, 'Registered HLL scene poster is required.');
const EXPECTED_CHECKS = 15;
const approvedVideos = new Set(manifest.assets.filter(asset => ['primary', 'alternate'].includes(asset.role) && asset.width === 1920 && asset.height === 1080 && ['video/mp4', 'video/webm'].includes(asset.mimeType)).map(asset => `/media/background/${asset.filename}`));
const approvedPoster = manifest.assets.find(asset => asset.role === 'poster');
assert.equal(approvedVideos.size, 2, 'Manifest must identify the two 1080p renditions.');
assert(approvedPoster, 'Manifest must identify the poster.');
const posterPath = `/media/background/${approvedPoster.filename}`;
const report = {
  schemaVersion: 1, evidenceKind: 'anonymous-public-production-browser', origin, mediaOrigin,
  startedAt: new Date().toISOString(),
  deploymentIdentity: { revision, imageDigest, identityReference,
    provenance: 'Operator-supplied observed identity; browser checks do not establish container digest or source labels.' },
  localHarnessRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  harnessSha256: sha(readFileSync(__filename)),
  requestClassifierSha256: sha(readFileSync(path.join(__dirname, 'request-classification.cjs'))),
  browserProduct, browserExecutableSha256: sha(readFileSync(executablePath)),
  playwrightVersion: appRequire('@playwright/test/package.json').version,
  mediaManifest: { id: manifest.id, sha256: sha(manifestBytes) },
  hllArtworkManifest: { sourceRevision: artworkManifest.sourceRevision, sha256: sha(artworkManifestBytes), scenePosterSha256: hllPoster.sha256 },
  checks: [], captures: [], pageErrors: [], blockedRequests: [], failedRequests: [], cancelledRequests: [], httpFailures: [],
  unexpectedOriginRequests: [], unexpectedOriginResponses: [], observedWriteAttempts: [], webSocketAttempts: [],
  limits: [
    'Anonymous public pages only. Fresh contexts, no owner cookies, no authentication or production content mutation.',
    'Initial routed requests are filtered to approved-origin GET/HEAD. Playwright can follow redirect hops without routing them again; this is not a complete pre-network isolation boundary.',
    'Every observed request/response origin is checked; unexpected-origin hops or write attempts fail the run. WebSocket attempts are blocked by routeWebSocket and fail the run.',
    'Issue #46 remains an open qualification limit: actual non-prefetch RSC cancellations fail the network gate; no broad exception is introduced.',
    'Short native playback interval, not full-loop, cross-codec, constrained-network or physical-device qualification.',
    'Mobile viewport/touch and reduced-motion settings are browser emulation, not physical Android or iOS.',
    'Actual screenshot visual inspection is required separately from this script.',
  ],
};
const save=()=>{const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');writeSync(reportFd,bytes,0,bytes.length,0);ftruncateSync(reportFd,bytes.length);};
const safePath = raw => { try { const u = new URL(raw); return allowedOrigins.has(u.origin) ? u.pathname : '[external-origin]'; } catch { return '[invalid-url]'; } };
let browser;
const contexts = new Set();
const closingContexts = new WeakSet();
const requestContexts = new WeakMap();
async function check(name, fn) {
  const started = Date.now(); let deadline;
  report.activeCheck = name; save(); console.log(`START ${name}`);
  try {
    const observed = await Promise.race([fn(), new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('CHECK_TIMEOUT')), 60000); })]);
    report.checks.push({ name, status: 'passed', durationMs: Date.now() - started, observed });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({ name, status: 'failed', durationMs: Date.now() - started, errorType: error?.name ?? 'Error', reason: error?.message === 'CHECK_TIMEOUT' ? 'Bounded check deadline exceeded.' : 'A browser operation or assertion failed; inspect this named scenario.' });
    console.log(`FAIL ${name}`); throw error;
  } finally { clearTimeout(deadline); report.activeCheck = null; save(); }
}
async function newContext(options) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US', timezoneId: 'Europe/Prague', serviceWorkers: 'block', ...options });
  contexts.add(ctx);
  ctx.on('request', request => {
    requestContexts.set(request, ctx);
    if (!allowedOrigins.has(new URL(request.url()).origin)) report.unexpectedOriginRequests.push({ method: request.method(), path: safePath(request.url()), resourceType: request.resourceType() });
    if (!['GET', 'HEAD'].includes(request.method())) report.observedWriteAttempts.push({ method: request.method(), path: safePath(request.url()) });
  });
  ctx.on('response', response => {
    if (!allowedOrigins.has(new URL(response.url()).origin)) report.unexpectedOriginResponses.push({ path: safePath(response.url()), status: response.status() });
    else if (response.status() >= 400) report.httpFailures.push({ path: safePath(response.url()), status: response.status(), resourceType: response.request().resourceType() });
  });
  ctx.on('requestfailed', request => {
    const sameOrigin = new URL(request.url()).origin === origin;
    const rawErrorCode = request.failure()?.errorText;
    const errorCode = /^(?:net::)?ERR_[A-Z0-9_]+$/.test(rawErrorCode ?? '') ? rawErrorCode : '[other-error]';
    const headers = request.headers();
    const record = { method: request.method(), path: safePath(request.url()), resourceType: request.resourceType(), sameOrigin,
      errorCode, rsc: headers.rsc === '1', prefetch: headers['next-router-prefetch'] === '1',
      segmentPrefetch: Boolean(headers['next-router-segment-prefetch']), duringContextClose: closingContexts.has(requestContexts.get(request)) };
    const browserCancelled = errorCode === 'net::ERR_ABORTED';
    // Chromium reports aborted navigation/media loads during route changes, pause or context disposal.
    const lifecycleCancellation = browserCancelled && (request.isNavigationRequest() || request.resourceType() === 'media' || /\.(mp4|webm)(?:\?|$)/i.test(request.url()) || record.duringContextClose);
    const prefetchCancellation = isAbortedRscPrefetch(record);
    const legitimateCancellation = lifecycleCancellation || prefetchCancellation;
    if (legitimateCancellation) record.cancellationReason = prefetchCancellation ? 'best-effort-rsc-prefetch' : 'navigation-media-or-context-disposal';
    (legitimateCancellation ? report.cancelledRequests : report.failedRequests).push(record);
  });
  await ctx.routeWebSocket('**/*', async socket => {
    report.webSocketAttempts.push({ path: safePath(socket.url()) });
    // Do not call connectToServer: no upstream WebSocket connection is made by this route.
    await socket.close({ code: 1008, reason: 'Public verification does not allow WebSockets.' });
  });
  await ctx.route('**/*', async route => {
    const request = route.request(), u = new URL(request.url());
    if (!['GET', 'HEAD'].includes(request.method()) || !allowedOrigins.has(u.origin)) {
      report.blockedRequests.push({ method: request.method(), path: safePath(request.url()) });
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  ctx.on('page', page => {
    page.on('pageerror', error => report.pageErrors.push({ type: error.name ?? 'Error', route: safePath(page.url()) }));
  });
  ctx.setDefaultTimeout(15000); ctx.setDefaultNavigationTimeout(30000);
  return ctx;
}
async function dispose(ctx) { closingContexts.add(ctx); await ctx.close(); contexts.delete(ctx); }
async function pageMetadata(page, locale, suffix = '', { template = 'site', canonicalSuffix = suffix, game = suffix.split('/')[1] || null } = {}) {
  await page.waitForFunction(() => document.querySelectorAll('link[rel="canonical"]').length === 1);
  const facts = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    canonicals: [...document.querySelectorAll('link[rel="canonical"]')].map(node => node.href),
    alternates: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map(node => ({ language: node.hreflang, href: node.href })),
    ogImage: [...document.querySelectorAll('meta[property="og:image"]')].map(node => node.content),
    twitterImage: [...document.querySelectorAll('meta[name="twitter:image"]')].map(node => node.content),
  }));
  assert.equal(facts.lang, locale); assert.deepEqual(facts.canonicals, [`${origin}/${locale}${canonicalSuffix}`]);
  for (const language of ['cs', 'en', 'x-default']) assert.deepEqual(facts.alternates.filter(item => item.language === language), [{ language, href: `${origin}/${language === 'x-default' ? 'cs' : language}${canonicalSuffix}` }]);
  assert.deepEqual(facts.ogImage, [`${origin}/api/social/${locale}/${template}?v=1${game ? '&game=' + game : ''}`]);
  assert.deepEqual(facts.twitterImage, facts.ogImage);
  return facts;
}
async function hllScene(page) {
  const scene = page.locator('[data-hll-scene]');
  assert.equal(await scene.getAttribute('data-hll-stage-reason'), 'no-clip');
  assert.equal(await scene.getAttribute('data-hll-clip-count'), '0');
  assert.equal(await page.locator('[data-hll-stage-video], [data-hll-stage-toggle]').count(), 0);
  const poster = page.locator('[data-hll-default-poster]');
  await poster.evaluate(image => image.decode());
  const image = await poster.evaluate(image => ({ src: image.currentSrc, width: image.naturalWidth, height: image.naturalHeight, loaded: image.complete }));
  assert.equal(image.src, origin + '/images/hll/scene-poster.webp');
  assert.equal(image.width, hllPoster.width); assert.equal(image.height, hllPoster.height); assert(image.loaded);
  const bounds = await scene.boundingBox(), posterBounds = await poster.boundingBox();
  const viewport = await page.evaluate(() => ({ width: document.documentElement.clientWidth, height: innerHeight }));
  for (const box of [bounds, posterBounds]) {
    assert(box); assert(Math.abs(box.x) <= 1 && Math.abs(box.y) <= 1);
    assert(Math.abs(box.width - viewport.width) <= 1 && Math.abs(box.height - viewport.height) <= 1, 'HLL artwork fills the viewport.');
  }
  assert(await page.locator('[data-hll-identity]').isVisible());
  await page.locator('a[data-game-option="wardogs"]:visible').first().waitFor({ state: 'visible' });
  return { image, bounds, posterBounds, viewport, clipCount: 0 };
}
async function tournamentState(page, locale) {
  await page.locator('#tournaments-title').waitFor({ state: 'visible' });
  const cards = await page.locator('[data-tournament-card]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-tournament-card')));
  const empty = locale === 'cs' ? 'Zatím žádné zveřejněné turnaje' : 'No published tournaments yet';
  const error = locale === 'cs' ? 'Turnaje se nepodařilo načíst. Zkuste to prosím později.' : 'The tournaments could not be loaded. Please try again later.';
  const honestEmpty = await page.getByText(empty, { exact: true }).isVisible();
  assert(cards.length > 0 || honestEmpty, 'Real published tournaments or explicit empty state.');
  assert.equal(await page.getByText(error, { exact: true }).count(), 0);
  assert(!cards.some(slug => /^(?:ukazka-|synthetic-)/i.test(slug)), 'No known synthetic tournament fixtures.');
  return { count: cards.length, honestEmpty, detailsExercised: false };
}
async function faqState(page, locale) {
  await page.locator('#faq-title').waitFor({ state: 'visible' });
  const published = await page.locator('[data-core-page="faq"]').getAttribute('data-published');
  assert(['true', 'false'].includes(published));
  if (published === 'false') {
    assert(await page.getByText(locale === 'cs' ? 'Tato stránka zatím není zveřejněná.' : 'This page has not been published yet.', { exact: true }).isVisible());
    assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /\bnoindex\b/i);
    assert.equal(await page.locator('[data-faq-index]').count(), 0);
  }
  return { published: published === 'true', questionIndexCount: await page.locator('[data-faq-index]').count() };
}
async function sample(page) {
  return page.locator('[data-background-video]').evaluate(video => ({
    currentTime: video.currentTime, duration: video.duration, paused: video.paused,
    width: video.videoWidth, height: video.videoHeight, muted: video.muted, loop: video.loop,
    error: video.error?.code ?? null, rate: video.playbackRate,
    source: video.currentSrc ? new URL(video.currentSrc).pathname : null,
    sourceOrigin: video.currentSrc ? new URL(video.currentSrc).origin : null,
    sourceSearch: video.currentSrc ? new URL(video.currentSrc).search : null,
    frames: video.getVideoPlaybackQuality().totalVideoFrames, droppedFrames: video.getVideoPlaybackQuality().droppedVideoFrames,
  }));
}
function requireApprovedPlayback(facts) {
  assert.equal(facts.sourceOrigin, mediaOrigin, 'Native playback must use the authorized origin.');
  assert.equal(facts.sourceSearch, '', 'Approved media URLs have no query string.');
  assert(approvedVideos.has(facts.source), 'Native playback must select an approved 1080p rendition.');
}
async function capture(page, filename, caption) {
  await page.evaluate(async () => {
    await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 5000))]);
    await Promise.all([...document.images].filter(image => {
      const bounds = image.getBoundingClientRect(); return bounds.width > 0 && bounds.height > 0 && bounds.top < innerHeight && bounds.bottom > 0;
    }).map(image => Promise.race([image.decode(), new Promise((_, reject) => setTimeout(() => reject(new Error('Image readiness timeout')), 8000))])));
  });
  const layout = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth }));
  assert(layout.documentWidth <= layout.width + 2, 'No horizontal overflow.');
  const file = `${reportId}-${filename}`;
  assert(!existsSync(path.join(__dirname,file)),'Preserve prior capture.');
  const bytes = await page.screenshot({ type: 'png', fullPage: true, timeout: 15000 });
  writeFileSync(path.join(__dirname,file),bytes,{flag:'wx'});
  report.captures.push({ file, caption, sha256: sha(bytes), bytes: bytes.length, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), viewport: page.viewportSize(), route: safePath(page.url()), locale: await page.locator('html').getAttribute('lang'), layout });
  save();
}

(async () => {
  browser = await chromium.launch({ executablePath, headless: true, timeout: 20000 });
  report.browserVersion = browser.version(); save();
  const desktop = await newContext({ reducedMotion: 'no-preference' });
  const page = await desktop.newPage();
  await check('desktop-cs-hub',async()=>{
    const response=await page.goto(origin+'/cs',{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);
    const metadata=await pageMetadata(page,'cs');await page.locator('main h1').waitFor({state:'attached'});
    await capture(page,'hub-cs-desktop.png','Actual anonymous Czech community hub on valkyria.cz, 1440x900 desktop.');return {metadata};
  });
  await check('desktop-game-switch-to-hll-honest-fallback',async()=>{
    await page.locator('a[data-game-option="hll"]:visible').first().click();await page.waitForURL(origin+'/cs/hll');
    const metadata=await pageMetadata(page,'cs','/hll');await page.locator('#hll-heading').waitFor({state:'attached'});
    const scene=await hllScene(page);
    await capture(page,'hll-cs-desktop.png','Actual Czech HLL landing with shipped full-viewport decorative game artwork and an empty clip playlist; no synthetic battle video or clan-event claim.');return {metadata,scene};
  });
  await check('desktop-game-switch-to-wardogs-playback-language',async()=>{
    await page.locator('a[data-game-option="wardogs"]:visible').first().click();await page.waitForURL(origin+'/cs/wardogs');
    const metadataCs=await pageMetadata(page,'cs','/wardogs');
    await page.waitForFunction(()=>{const v=document.querySelector('[data-background-video]');return v&&!v.paused&&!v.error&&v.currentTime>.1;},null,{timeout:25000});
    const before=await sample(page);await page.waitForTimeout(2500);const after=await sample(page);requireApprovedPlayback(before);requireApprovedPlayback(after);
    assert(after.currentTime>before.currentTime+.5);assert(after.frames>before.frames);assert(after.duration>192.3&&after.duration<192.6);assert.equal(after.width,1920);assert.equal(after.height,1080);assert.equal(after.error,null);assert.equal(after.rate,1);assert(after.muted&&after.loop);
    await capture(page,'wardogs-cs-desktop.png','Actual Czech Wardogs landing with native approved 1080p playback; short interval, not a full loop qualification.');
    await page.locator('a[data-locale="en"]:visible').first().click();await page.waitForURL(origin+'/en/wardogs');const metadataEn=await pageMetadata(page,'en','/wardogs');
    return {metadataCs,metadataEn,before,after};
  });
  await check('wardogs-manual-pause-reload-resume',async()=>{
    await page.locator('[data-background-toggle]:visible').first().click();await page.waitForFunction(()=>document.querySelector('[data-background-video]')?.paused);
    const before=await sample(page);await page.waitForTimeout(1200);const paused=await sample(page);assert(Math.abs(paused.currentTime-before.currentTime)<.08);
    await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('[data-background-reason]')?.getAttribute('data-background-reason')==='user-paused');
    const reloaded=await sample(page);assert(reloaded.paused);assert.equal(reloaded.currentTime,0);
    await page.locator('[data-background-toggle]:visible').first().click();await page.waitForFunction(()=>{const v=document.querySelector('[data-background-video]');return v&&!v.paused&&v.currentTime>.1;});
    const resumed=await sample(page);requireApprovedPlayback(resumed);return{before,paused,reloaded,resumed};
  });
  await check('wardogs-news-home-client-navigation-both-locales',async()=>{
    const visits=[];
    for(const locale of ['en','cs']){
      if(locale==='cs'){await page.locator('a[data-locale="cs"]:visible').first().click();await page.waitForURL(origin+'/cs/wardogs');}
      const token=locale+'-unified-navigation';await page.evaluate(token=>window.__publicSmokeDocumentToken=token,token);
      await page.locator('[data-nav="desktop"] [data-nav-item="news"]').click();await page.waitForURL(origin+'/'+locale+'/wardogs/news');
      await page.getByRole('heading',{name:locale==='cs'?'Novinky':'News',exact:true}).waitFor({state:'visible'});
      assert.equal(await page.evaluate(()=>window.__publicSmokeDocumentToken),token);assert.equal(await page.getByText(locale==='cs'?'Novinky se nepodařilo načíst.':'The news could not be loaded.',{exact:true}).count(),0);
      visits.push({route:safePath(page.url()),sameDocument:true});await page.waitForTimeout(1500);
      await page.locator('[data-nav="desktop"] [data-nav-item="home"]').click();await page.waitForURL(origin+'/'+locale+'/wardogs');
      await page.locator('[data-nav="desktop"] [data-nav-item="home"][aria-current="page"]').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>window.__publicSmokeDocumentToken),token);
      visits.push({route:safePath(page.url()),sameDocument:true});await page.waitForTimeout(1500);
    }return{visits};
  });
  await check('hll-servers-honest-unconfigured-and-manual',async()=>{
    await page.goto(origin+'/en/hll/servers',{waitUntil:'domcontentloaded'});await page.locator('[data-server-state="not_configured"]').waitFor({state:'visible'});
    assert.equal(await page.locator('[data-server-name]').count(),0);assert.equal(await page.locator('[data-synthetic-data]').count(),0);
    const response=await page.goto(origin+'/en/hll/field-manual',{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);await page.locator('main h1').waitFor({state:'attached'});
    return{serversState:'not_configured',serverRows:0,manualRoute:safePath(page.url())};
  });
  await check('hll-tournaments-and-faq-anonymous-both-locales',async()=>{
    const visits=[];
    for(const locale of ['cs','en']){
      if(locale==='cs'){
        const response=await page.goto(origin+'/cs/hll/tournaments',{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);
      }else{
        await page.locator('a[data-locale="en"]:visible').first().click();await page.waitForURL(origin+'/en/hll/tournaments');
      }
      const metadata=await pageMetadata(page,locale,'/hll/tournaments',{template:'matches'});
      const state=await tournamentState(page,locale);visits.push({route:safePath(page.url()),metadata,state});
      if(locale==='cs')await capture(page,'hll-tournaments-cs-desktop.png','Actual anonymous Czech HLL tournament page. Published production content or its honest empty state; no fixtures inserted for this proof.');
    }
    for(const locale of ['cs','en']){
      const response=await page.goto(origin+'/'+locale+'/hll/faq',{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);
      const metadata=await pageMetadata(page,locale,'/hll/faq',{canonicalSuffix:'/faq',game:null});
      visits.push({route:safePath(page.url()),metadata,state:await faqState(page,locale)});
    }
    return{visits};
  });
  await check('hll-en-desktop-fullscreen-artwork',async()=>{
    const response=await page.goto(origin+'/en/hll',{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);
    const metadata=await pageMetadata(page,'en','/hll'),scene=await hllScene(page);
    await capture(page,'hll-en-desktop.png','Actual English HLL main menu with the shared masthead and shipped full-viewport static artwork. Empty clip playlist; no live gameplay or fixture claim.');
    return{metadata,scene};
  });
  await dispose(desktop);
  for(const {locale,suffix} of [{locale:'en',suffix:''},{locale:'en',suffix:'/hll'},{locale:'en',suffix:'/wardogs'},{locale:'cs',suffix:'/hll'},{locale:'en',suffix:'/hll/tournaments'},{locale:'en',suffix:'/hll/faq'}])await check('mobile-'+locale+'-'+(suffix.slice(1)||'hub'),async()=>{
    const mobile=await newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,reducedMotion:'no-preference'});
    const videoRequests=[];mobile.on('request',request=>{if(request.resourceType()==='media'||/\.(mp4|webm)(?:\?|$)/i.test(request.url()))videoRequests.push({path:safePath(request.url()),resourceType:request.resourceType()});});
    try{
      const page=await mobile.newPage();const response=await page.goto(origin+'/'+locale+suffix,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);
      const metadata=await pageMetadata(page,locale,suffix,suffix.endsWith('/faq')?{canonicalSuffix:'/faq',game:null}:suffix.endsWith('/tournaments')?{template:'matches'}:{});
      await page.locator('main h1').waitFor({state:'attached'});let poster=null,feature=null;
      if(suffix==='/wardogs'){
        await page.waitForFunction(()=>document.querySelector('[data-background-reason]')?.getAttribute('data-background-reason')==='narrow-coarse');await page.waitForTimeout(1000);
        poster=await page.locator('[data-background-state]').evaluate(layer=>{const v=layer.querySelector('video'),im=layer.querySelector('img');return{state:layer.getAttribute('data-background-state'),reason:layer.getAttribute('data-background-reason'),loaded:Boolean(im?.complete&&im.naturalWidth>0),sources:v?.querySelectorAll('source').length,paused:v?.paused,time:v?.currentTime,currentSrc:v?.currentSrc===''?'':'[unexpected-source]',posterOrigin:im?.currentSrc?new URL(im.currentSrc).origin:null,posterPath:im?.currentSrc?new URL(im.currentSrc).pathname:null,posterSearch:im?.currentSrc?new URL(im.currentSrc).search:null};});
        assert.equal(poster.state,'paused');assert(poster.loaded);assert.equal(poster.sources,0);assert.equal(poster.paused,true);assert.equal(poster.time,0);assert.equal(poster.currentSrc,'');assert.equal(poster.posterOrigin,mediaOrigin);assert.equal(poster.posterPath,posterPath);assert.equal(poster.posterSearch,'');
      }
      if(suffix.startsWith('/hll'))poster=await hllScene(page);
      if(suffix.endsWith('/tournaments'))feature=await tournamentState(page,locale);
      if(suffix.endsWith('/faq'))feature=await faqState(page,locale);
      await capture(page,(suffix.slice(1).replaceAll('/','-')||'hub')+'-'+locale+'-mobile.png','Actual '+locale.toUpperCase()+' '+(suffix.slice(1)||'community hub')+' at 390x844 mobile/touch emulation in '+browserProduct+' '+report.browserVersion+'. Production content or honest unpublished state; no fixture or physical-device claim. No video request through capture.');
      assert.equal(videoRequests.length,0,'No media resource or video-extension request through completed capture.');return{metadata,poster,feature,videoRequestsBeforeOptIn:videoRequests.length};
    }finally{await dispose(mobile);}
  });
  await check('no-uncaught-errors-or-write-attempts', async () => {
    assert.equal(report.pageErrors.length, 0);
    assert.equal(report.blockedRequests.filter(request => !['GET', 'HEAD'].includes(request.method)).length, 0);
    assert.equal(report.observedWriteAttempts.length, 0, 'No write attempts across observed redirect hops.');
    assert.equal(report.unexpectedOriginRequests.length, 0, 'No unexpected-origin request hops.');
    assert.equal(report.unexpectedOriginResponses.length, 0, 'No unexpected-origin response hops.');
    assert.equal(report.webSocketAttempts.length, 0, 'No WebSocket attempts.');
    assert.equal(report.failedRequests.length, 0, 'No non-cancelled same-origin request failures.');
    assert.equal(report.httpFailures.length, 0, 'No same-origin HTTP errors.');
    return { pageErrors: report.pageErrors.length, writeAttempts: 0, blockedExternalRequests: report.blockedRequests.length, unexpectedOriginRequests: 0, unexpectedOriginResponses: 0, webSocketAttempts: 0, sameOriginRequestFailures: 0, httpFailures: 0, legitimateCancellations: report.cancelledRequests.length };
  });
})().catch(error => {
  report.fatal = { errorType: error?.name ?? 'Error', reason: 'Setup or named browser check failed; remaining checks are not run.' };
  process.exitCode = 1;
}).finally(async () => {
  let timer;
  try { await Promise.race([browser?.close(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Close deadline')), 10000); })]); }
  catch { report.cleanupIncomplete = true; } finally { clearTimeout(timer); }
  report.completedAt = new Date().toISOString();
  report.summary = { total: report.checks.length, passed: report.checks.filter(item => item.status === 'passed').length, failed: report.checks.filter(item => item.status === 'failed').length, expectedChecks: EXPECTED_CHECKS };
  report.status = !report.fatal && !report.cleanupIncomplete && report.summary.total === EXPECTED_CHECKS && report.summary.failed === 0 ? 'passed' : 'failed';
  report.visualInspection = 'Required separately; not asserted by this script.'; save();
  closeSync(reportFd);
  console.log(JSON.stringify({ status: report.status, ...report.summary }));
  if (report.status !== 'passed') process.exitCode = 1;
});
