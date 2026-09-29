// Anonymous GET/HEAD proof. No cookies, authentication, content writes or full video downloads.
import { readFile, access, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (name) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const stage = arg('--stage');
const mediaOrigin = arg('--media-origin');
const allowedOrigins = new Set(['https://valkyria.cz','https://www.valkyria.cz','https://valkyriawdg.cz','https://www.valkyriawdg.cz']);
const origin = arg('--origin') ?? 'https://valkyria.cz';
const revision = arg('--revision');
const imageDigest = arg('--digest');
const identityReference = arg('--identity-ref');
if (args.includes('--help')) {
  console.log('node http-smoke.mjs --stage after --media-origin <effective approved HTTPS origin> --dependency-root <installed checkout> [--origin https://valkyria.cz] [--revision <actual-40-hex>] [--digest sha256:<actual-64-hex>] [--identity-ref <public evidence filename>] [--report-id <safe-name>]');
  process.exit(0);
}
if (!['after'].includes(stage) || origin !== 'https://valkyria.cz') throw new Error('Select after and the authorized HTTPS origin.');
if (revision !== undefined && !/^[a-f0-9]{40}$/.test(revision)) throw new Error('Invalid supplied revision.');
if (imageDigest !== undefined && !/^sha256:[a-f0-9]{64}$/.test(imageDigest)) throw new Error('Invalid supplied digest.');
if (stage === 'after' && (!revision || !imageDigest || !identityReference)) throw new Error('After proof requires operator-observed revision, digest and public evidence reference.');
if (identityReference && !/^[a-zA-Z0-9._/-]{1,150}$/.test(identityReference)) throw new Error('Use a sanitized relative evidence reference.');
if (!['https://valkyria.cz','https://valkyriawdg.cz'].includes(mediaOrigin)) throw new Error('Supply effective approved media origin.');
const reportId = arg('--report-id') ?? `http-${stage}`;
if (!/^[a-z0-9-]{1,80}$/.test(reportId)) throw new Error('Invalid report ID.');
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../../..');
const dependencyRoot = arg('--dependency-root');
if (!dependencyRoot) throw new Error('Supply installed dependency checkout.');
const appRequire = createRequire(path.join(path.resolve(dependencyRoot), 'apps/web/package.json'));
const sharp = appRequire('sharp');
const reportFile = path.join(directory, `${reportId}.json`);
try { await access(reportFile); throw new Error('Report already exists; choose a new report ID to preserve prior observations.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const reportHandle = await open(reportFile, 'wx');
async function saveReport() { const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n'); await reportHandle.write(bytes,0,bytes.length,0); await reportHandle.truncate(bytes.length); }
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifestBytes = await readFile(path.join(root, 'assets/background-media.json'));
const manifest = JSON.parse(manifestBytes);
const artworkManifestBytes = await readFile(path.join(directory, 'hll-artwork-manifest.json'));
const artworkManifest = JSON.parse(artworkManifestBytes);
const report = {
  schemaVersion: 1, evidenceKind: 'anonymous-public-production-http', stage, origin, mediaOrigin,
  startedAt: new Date().toISOString(), nodeVersion: process.version,
  imageDecoder: { name: 'sharp', version: sharp.versions.sharp, limitInputPixels: 1200 * 630, maximumBytes: 5 * 1024 * 1024 },
  localHarnessRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  harnessSha256: hash(await readFile(fileURLToPath(import.meta.url))),
  deploymentIdentity: { revision: revision ?? null, imageDigest: imageDigest ?? null, identityReference: identityReference ?? null,
    provenance: revision || imageDigest ? 'Operator-supplied observed identity; public HTTP cannot independently verify the container digest or source label.' : 'Not supplied: no deployment identity inferred from local HEAD, metadata or prior records.' },
  mediaManifest: { id: manifest.id, sha256: hash(manifestBytes) },
  hllArtworkManifest: { sourceRevision: artworkManifest.sourceRevision, sha256: hash(artworkManifestBytes), assets: artworkManifest.assets.length },
  expectedChecks: 85,
  limits: [
    'Anonymous GET and HEAD only; no credentials, cookies, sign-in, account creation or content changes.',
    'Assertions describe the accepted target behavior even in before mode; before failures are retained.',
    'No full video download/hash, browser decode, authenticated RBAC or real social-network crawler test.',
    'Sitemap privacy checks reject private route classes; without private data access they cannot prove every publication-state boundary.',
  ], checks: [],
};
const safeHeaders = ['location', 'content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control', 'x-robots-tag'];
const decode = (value) => value?.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');
function tags(html, name) {
  return [...html.matchAll(new RegExp('<' + name + '\\b[^>]*>', 'gi'))].map(([tag]) => Object.fromEntries(
    [...tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((match) => [match[1].toLowerCase(), decode(match[2] ?? match[3])])));
}
function metadata(html) {
  const metas = tags(html, 'meta'), links = tags(html, 'link');
  const named = (name) => metas.filter((tag) => tag.name === name).map((tag) => tag.content);
  const property = (name) => metas.filter((tag) => tag.property === name).map((tag) => tag.content);
  return { language: tags(html, 'html')[0]?.lang ?? null,
    title: decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]) ?? null,
    description: named('description'), robots: named('robots'), canonical: links.filter((tag) => tag.rel === 'canonical').map((tag) => tag.href),
    alternates: links.filter((tag) => tag.rel === 'alternate' && tag.hreflang).map((tag) => ({ language: tag.hreflang, href: tag.href })),
    ogLocale: property('og:locale'), ogUrl: property('og:url'), ogImage: property('og:image'),
    twitterCard: named('twitter:card'), twitterImage: named('twitter:image') };
}
async function limitedBytes(response, maximum) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
      if (size > maximum) throw new Error('Public response exceeded evidence size limit.'); chunks.push(value); }
    return Buffer.concat(chunks);
  } finally { await reader.cancel().catch(() => {}); }
}
async function request(label, pathname, options, verify) {
  const url = new URL(pathname, origin);
  if (!allowedOrigins.has(url.origin) || !['GET', 'HEAD'].includes(options.method ?? 'GET')) throw new Error('Read-only same-origin guard.');
  const entry = { label, origin: url.origin, path: url.pathname + url.search, method: options.method ?? 'GET', observedAt: new Date().toISOString(), assertions: [] };
  const expect = (passed, expected, actual) => entry.assertions.push({ expected, actual, passed: Boolean(passed) });
  const started = Date.now(); let response;
  try {
    response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(25000), ...options,
      headers: { 'user-agent': 'Valkyria-production-verification/2.0', 'accept-encoding': 'identity', ...options.headers } });
    entry.status = response.status;
    entry.headers = Object.fromEntries(safeHeaders.flatMap((name) => response.headers.has(name) ? [[name, response.headers.get(name)]] : []));
    await verify(response, entry, expect);
    entry.passed = entry.assertions.length > 0 && entry.assertions.every((item) => item.passed);
  } catch (error) { entry.passed = false; entry.error = { name: error?.name ?? 'Error', code: error?.cause?.code ?? null }; }
  finally { await response?.body?.cancel().catch(() => {}); }
  entry.durationMs = Date.now() - started; report.checks.push(entry);
  console.log(`${entry.passed ? 'PASS' : 'FAIL'} ${label}`);
  await saveReport();
}

await request('root defaults to Czech', '/', {}, async (response, entry, expect) => {
  expect(response.status === 307, 'HTTP 307', response.status);
  expect(response.headers.get('location') !== null && new URL(response.headers.get('location'), origin).href === `${origin}/cs`, 'redirect to /cs', response.headers.get('location'));
});
for (const endpoint of ['live', 'ready']) await request(`health ${endpoint}`, `/api/health/${endpoint}`, {}, async (response, entry, expect) => {
  expect(response.status === 200, 'HTTP 200', response.status);
  const body = JSON.parse((await limitedBytes(response, 32768)).toString('utf8'));
  entry.health = { status: body.status, ...(endpoint === 'ready' ? { checks: body.checks } : {}) };
  expect(body.status === (endpoint === 'live' ? 'ok' : 'ready'), 'healthy status', body.status);
  if (endpoint === 'ready') for (const key of ['config', 'database', 'schema', 'media']) expect(body.checks?.[key] === 'ok', `${key}=ok`, body.checks?.[key] ?? null);
});
for (const locale of ['cs', 'en']) {
  for (const suffix of ['', '/hll', '/wardogs', '/hll/news', '/wardogs/news', '/hll/matches', '/wardogs/matches', '/hll/servers', '/hll/field-manual', '/privacy', '/hll/tournaments']) {
    const pathname = `/${locale}${suffix}`;
    await request(`public metadata ${pathname}`, pathname, {}, async (response, entry, expect) => {
      expect(response.status === 200, 'HTTP 200', response.status);
      const html = (await limitedBytes(response, 2 * 1024 * 1024)).toString('utf8');
      const page = metadata(html); entry.metadata = page;
      expect(page.language === locale, `html lang=${locale}`, page.language);
      expect(Boolean(page.title?.trim()), 'nonempty title', page.title);
      expect(page.description.length === 1 && Boolean(page.description[0].trim()), 'one nonempty description', page.description);
      expect(page.canonical.length === 1 && page.canonical[0] === origin + pathname, 'one self-canonical', page.canonical);
      for (const language of ['cs', 'en', 'x-default']) {
        const found = page.alternates.filter((item) => item.language === language);
        expect(found.length === 1 && found[0].href === `${origin}/${language === 'x-default' ? 'cs' : language}${suffix}`, `one reciprocal ${language} alternate`, found);
      }
      expect(page.ogLocale.length === 1 && page.ogLocale[0] === (locale === 'cs' ? 'cs_CZ' : 'en_GB'), 'localized Open Graph locale', page.ogLocale);
      // Home/member-list metadata inherits the shared image without an explicit og:url.
      // Check consistency when present; canonical presence is asserted independently above.
      expect(page.ogUrl.length <= 1 && (page.ogUrl.length === 0 || page.ogUrl[0] === origin + pathname), 'Open Graph URL matches canonical when supplied', page.ogUrl);
      const indexingDirectives = { meta: page.robots, header: response.headers.get('x-robots-tag') };
      const forbidsIndexing = (value) => /(?:^|[\s,:])(?:noindex|none)(?=$|[\s,;])/i.test(value ?? '');
      expect(!page.robots.some(forbidsIndexing) && !forbidsIndexing(indexingDirectives.header), 'public meta robots and X-Robots-Tag omit noindex/none', indexingDirectives);
      if (['', '/hll', '/wardogs', '/hll/news', '/wardogs/news', '/hll/matches', '/wardogs/matches', '/hll/tournaments'].includes(suffix)) {
        const template = suffix.endsWith('/news') ? 'news' : /\/(?:matches|tournaments)$/.test(suffix) ? 'matches' : 'site';
        const game = suffix.split('/')[1];
        const image = `${origin}/api/social/${locale}/${template}?v=1${game ? '&game=' + game : ''}`;
        expect(page.ogImage.length === 1 && page.ogImage[0] === image, 'one branded social PNG URL', page.ogImage);
        expect(page.twitterImage.length === 1 && page.twitterImage[0] === image, 'Twitter image matches OG image', page.twitterImage);
        expect(page.twitterCard.length === 1 && page.twitterCard[0] === 'summary_large_image', 'large Twitter card', page.twitterCard);
      }
      if (suffix === '/hll/tournaments') {
        const cards = tags(html, 'li').filter(tag => 'data-tournament-card' in tag).map(tag => tag['data-tournament-card']);
        const empty = locale === 'cs' ? 'Zatím žádné zveřejněné turnaje' : 'No published tournaments yet';
        const loadError = locale === 'cs' ? 'Turnaje se nepodařilo načíst.' : 'The tournaments could not be loaded.';
        entry.tournaments = { count: cards.length, honestEmpty: html.includes(empty) };
        expect(cards.length > 0 || entry.tournaments.honestEmpty, 'published tournament cards or honest localized empty state', entry.tournaments);
        expect(!html.includes(loadError), 'no tournament query error', !html.includes(loadError));
        expect(!cards.some(slug => /^(?:ukazka-|synthetic-)/i.test(slug)), 'no known test-fixture tournaments', cards.length);
      }
    });
  }
  await request(`anonymous login cache ${locale}`, `/${locale}/login`, {}, async (response, entry, expect) => {
    expect(response.status === 200, 'HTTP 200', response.status);
    expect(/no-store/i.test(response.headers.get('cache-control') ?? ''), 'login no-store', response.headers.get('cache-control'));
    const html = (await limitedBytes(response, 1024 * 1024)).toString('utf8');
    const page = metadata(html); entry.metadata = page;
    expect(/<button(?=[^>]*data-testid="login-discord")(?=[^>]*\sdisabled(?:=|\s|>))[^>]*>/i.test(html), 'Discord sign-in is visibly disabled', 'disabled button checked');
    expect(page.robots.some((value) => /noindex/i.test(value)), 'login noindex', page.robots);
  });
  await request(`anonymous administration cache ${locale}`, `/${locale}/admin`, {}, async (response, entry, expect) => {
    expect(/no-store/i.test(response.headers.get('cache-control') ?? ''), 'administration no-store', response.headers.get('cache-control'));
    const target = `/${locale}/login?returnTo=${encodeURIComponent(`/${locale}/admin`)}`;
    const location = response.headers.get('location');
    if ([303, 307, 308].includes(response.status)) expect(location !== null && new URL(location, origin).href === origin + target, 'redirect to localized login', location);
    else {
      const html = (await limitedBytes(response, 1024 * 1024)).toString('utf8');
      const refresh = tags(html, 'meta').find((tag) => tag['http-equiv']?.toLowerCase() === 'refresh')?.content ?? null;
      entry.streamedRedirect = refresh;
      expect(response.status === 200 && refresh?.endsWith(target), 'streamed redirect to localized login', refresh);
    }
  });
  for (const { template, game } of ['site', 'news', 'matches'].flatMap(template => [{ template, game: null }, { template, game: 'hll' }])) await request(`social PNG ${locale}/${template}${game ? ' ' + game : ''}`, `/api/social/${locale}/${template}?v=1${game ? '&game=' + game : ''}`, {}, async (response, entry, expect) => {
    expect(response.status === 200, 'HTTP 200', response.status);
    expect(response.headers.get('content-type')?.split(';')[0] === 'image/png', 'image/png', response.headers.get('content-type'));
    expect(/no-store/i.test(response.headers.get('cache-control') ?? ''), 'social image no-store', response.headers.get('cache-control'));
    const bytes = await limitedBytes(response, 5 * 1024 * 1024);
    const png = bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
    entry.image = { sha256: hash(bytes), bytes: bytes.length, png, width: png && bytes.length >= 24 ? bytes.readUInt32BE(16) : null, height: png && bytes.length >= 24 ? bytes.readUInt32BE(20) : null };
    expect(png && entry.image.width === 1200 && entry.image.height === 630, '1200x630 PNG header', entry.image);
    entry.image.decode = { passed: false };
    if (png) {
      try {
        // Raw output forces complete image decoding; metadata/IHDR inspection alone cannot prove it.
        const decoded = await sharp(bytes, { limitInputPixels: 1200 * 630, failOn: 'warning', pages: 1 })
          .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        entry.image.decode = { passed: decoded.info.width === 1200 && decoded.info.height === 630 && decoded.info.channels === 4 && decoded.data.length === 1200 * 630 * 4,
          width: decoded.info.width, height: decoded.info.height, channels: decoded.info.channels, decodedBytes: decoded.data.length };
      } catch (error) { entry.image.decode.errorType = error?.name ?? 'Error'; }
    }
    expect(entry.image.decode.passed, 'complete bounded 1200x630 RGBA decode', entry.image.decode);
  });
}
await request('robots public social and private exclusions', '/robots.txt', {}, async (response, entry, expect) => {
  expect(response.status === 200, 'HTTP 200', response.status);
  const lines = (await limitedBytes(response, 65536)).toString('utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean); entry.directives = lines;
  for (const directive of ['Allow: /api/social/', 'Disallow: /api/', 'Disallow: /cs/admin', 'Disallow: /en/admin', 'Disallow: /cs/account', 'Disallow: /en/account', 'Disallow: /cs/login', 'Disallow: /en/login', `Sitemap: ${origin}/sitemap.xml`]) expect(lines.includes(directive), directive, lines.includes(directive));
});
await request('sitemap public routes and reciprocal languages', '/sitemap.xml', {}, async (response, entry, expect) => {
  expect(response.status === 200, 'HTTP 200', response.status);
  const cache = response.headers.get('cache-control') ?? '';
  const requiresRevalidation = /(?:^|,)\s*max-age=0(?:,|$)/i.test(cache) && /(?:^|,)\s*must-revalidate(?:,|$)/i.test(cache) && !/(?:s-maxage=[1-9]|stale-while-revalidate|stale-if-error)/i.test(cache);
  expect(/no-store/i.test(cache) || requiresRevalidation, 'sitemap no-store or mandatory immediate revalidation without stale allowance', cache);
  const xml = (await limitedBytes(response, 2 * 1024 * 1024)).toString('utf8');
  const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, body]) => ({ url: decode(body.match(/<loc>([^<]+)<\/loc>/)?.[1]), alternates: tags(body, 'xhtml:link') }));
  entry.urlCount = entries.length;
  entry.privateRouteCount = entries.filter((item) => { try { const url = new URL(item.url); return url.origin !== origin || /^\/api\/|\/(?:admin|account|login|preview)(?:\/|$)/.test(url.pathname) || Boolean(url.search); } catch { return true; } }).length;
  expect(entry.privateRouteCount === 0, 'only same-origin public paths without query strings', entry.privateRouteCount);
  for (const suffix of ['', '/news', '/matches', '/members', '/hll', '/hll/news', '/hll/matches', '/hll/servers', '/hll/field-manual', '/hll/tournaments', '/hll/faq', '/wardogs', '/wardogs/news', '/wardogs/matches']) for (const locale of ['cs', 'en']) {
    const found = entries.filter((item) => item.url === `${origin}/${locale}${suffix}`);
    expect(found.length === 1, `one ${locale}${suffix || '/'} collection URL`, found.length);
    for (const language of ['cs', 'en', 'x-default']) expect(found.length === 1 && found[0].alternates.some((item) => item.hreflang === language && item.href === `${origin}/${language === 'x-default' ? 'cs' : language}${suffix}`), `${locale}${suffix || '/'} sitemap ${language} alternate`, found[0]?.alternates ?? []);
  }
});
for (const asset of manifest.assets) {
  const pathname = `${mediaOrigin}/media/background/${asset.filename}`;
  const verifyHeaders = (response, expect) => {
    expect(response.headers.get('content-type')?.split(';')[0]?.trim() === asset.mimeType, asset.mimeType, response.headers.get('content-type'));
    const cache = response.headers.get('cache-control') ?? '';
    expect(/(?:^|,)\s*public(?:,|$)/i.test(cache) && /(?:^|,)\s*max-age=31536000(?:,|$)/i.test(cache) && /(?:^|,)\s*immutable(?:,|$)/i.test(cache), 'public, max-age=31536000, immutable', cache);
  };
  await request(`media HEAD ${asset.role}`, pathname, { method: 'HEAD' }, async (response, entry, expect) => {
    expect(response.status === 200, 'HTTP 200', response.status); verifyHeaders(response, expect);
    expect(Number(response.headers.get('content-length')) === asset.bytes, 'manifest content length', { expected: asset.bytes, actual: response.headers.get('content-length') });
    expect(response.headers.get('accept-ranges') === 'bytes', 'Accept-Ranges: bytes', response.headers.get('accept-ranges'));
  });
  await request(`media range ${asset.role}`, pathname, { headers: { range: 'bytes=0-1023' } }, async (response, entry, expect) => {
    expect(response.status === 206, 'HTTP 206', response.status); verifyHeaders(response, expect);
    expect(response.headers.get('content-range') === `bytes 0-1023/${asset.bytes}`, 'matching 1024-byte range', response.headers.get('content-range'));
    if (response.status === 206) { const bytes = await limitedBytes(response, 1024); entry.receivedBytes = bytes.length; expect(bytes.length === 1024, '1024 response bytes', bytes.length); }
  });
}

for (const [from,to] of [
 ['https://www.valkyria.cz/','https://valkyria.cz/'],
 ['https://www.valkyria.cz/en/hll?view=public','https://valkyria.cz/en/hll?view=public'],
 ...['https://valkyriawdg.cz','https://www.valkyriawdg.cz'].flatMap(host=>[
  [host+'/',origin+'/cs/wardogs'],[host+'/cs',origin+'/cs/wardogs'],[host+'/en',origin+'/en/wardogs'],
  [host+'/en/news?game=hell-let-loose&view=public',origin+'/en/news?game=hell-let-loose&view=public']
 ])
]) await request('canonical redirect '+from,from,{},async(response,entry,expect)=>{
 expect([301,308].includes(response.status),'permanent HTTP 301/308',response.status);
 const location=response.headers.get('location'); expect(location!==null&&new URL(location,from).href===to,'exact canonical path and query',location);
});
for (const locale of ['cs','en']) await request('HLL honest server state '+locale,'/'+locale+'/hll/servers',{},async(response,entry,expect)=>{
 expect(response.status===200,'HTTP 200',response.status);
 const html=(await limitedBytes(response,2*1024*1024)).toString('utf8');
 expect(html.includes('data-server-state="not_configured"'),'unconfigured source state',html.match(/data-server-state="([^"]*)"/)?.[1]??null);
 expect(!html.includes('data-synthetic-data=')&&!html.includes('data-server-name='),'no synthetic or fabricated server rows',true);
});

for (const locale of ['cs', 'en']) {
  for (const suffix of ['/faq', '/hll/faq']) await request(`FAQ public state ${locale}${suffix}`, `/${locale}${suffix}`, {}, async (response, entry, expect) => {
    expect(response.status === 200, 'HTTP 200', response.status);
    const html = (await limitedBytes(response, 2 * 1024 * 1024)).toString('utf8');
    const page = metadata(html); entry.metadata = page;
    const published = tags(html, 'div').find(tag => tag['data-core-page'] === 'faq')?.['data-published'];
    entry.faq = { published };
    expect(page.language === locale, 'localized FAQ document', page.language);
    expect(page.canonical.length === 1 && page.canonical[0] === `${origin}/${locale}/faq`, 'FAQ canonical points to shared page', page.canonical);
    for (const language of ['cs', 'en', 'x-default']) {
      const found = page.alternates.filter(item => item.language === language);
      expect(found.length === 1 && found[0].href === `${origin}/${language === 'x-default' ? 'cs' : language}/faq`, `shared FAQ ${language} alternate`, found);
    }
    expect(['true', 'false'].includes(published), 'explicit FAQ publication state', published);
    if (published === 'false') {
      expect(page.robots.some(value => /\bnoindex\b/i.test(value)), 'unpublished FAQ noindex', page.robots);
      expect(html.includes(locale === 'cs' ? 'Tato stránka zatím není zveřejněná.' : 'This page has not been published yet.'), 'honest unpublished FAQ message', true);
      expect(!html.includes('data-faq-index='), 'no fabricated FAQ index', !html.includes('data-faq-index='));
    }
  });
  for (const suffix of ['/admin/tournaments', '/admin/tournaments/new']) await request(`anonymous tournament administration ${locale}${suffix}`, `/${locale}${suffix}`, {}, async (response, entry, expect) => {
    expect(/no-store/i.test(response.headers.get('cache-control') ?? ''), 'administration no-store', response.headers.get('cache-control'));
    const target = `/${locale}/login?returnTo=${encodeURIComponent(`/${locale}${suffix}`)}`;
    const location = response.headers.get('location');
    if ([303, 307, 308].includes(response.status)) expect(location !== null && new URL(location, origin).href === origin + target, 'redirect to localized login with exact returnTo', location);
    else {
      const html = (await limitedBytes(response, 1024 * 1024)).toString('utf8');
      const refresh = tags(html, 'meta').find(tag => tag['http-equiv']?.toLowerCase() === 'refresh')?.content ?? null;
      entry.streamedRedirect = refresh;
      expect(response.status === 200 && refresh?.endsWith(target), 'streamed redirect to localized login with exact returnTo', refresh);
    }
  });
  for (const section of ['faq', 'tournaments']) await request(`unsupported Wardogs ${locale}/${section}`, `/${locale}/wardogs/${section}`, {}, async (response, entry, expect) => {
    expect(response.status === 404, 'HTTP 404 for unsupported game section', response.status);
  });
}
for (const asset of artworkManifest.assets) await request(`shipped HLL artwork ${asset.id}`, asset.path.replace('apps/web/public', ''), {}, async (response, entry, expect) => {
  expect(response.status === 200, 'HTTP 200', response.status);
  expect(response.headers.get('content-type')?.split(';')[0] === 'image/webp', 'image/webp', response.headers.get('content-type'));
  const bytes = await limitedBytes(response, 2 * 1024 * 1024);
  entry.image = { sha256: hash(bytes), bytes: bytes.length, expectedSha256: asset.sha256 };
  expect(entry.image.sha256 === asset.sha256 && bytes.length === asset.bytes, 'registered artwork bytes and SHA256', entry.image);
  const decoded = await sharp(bytes, { limitInputPixels: 1920 * 1080, failOn: 'warning', pages: 1 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  entry.image.decode = { width: decoded.info.width, height: decoded.info.height, channels: decoded.info.channels, bytes: decoded.data.length };
  expect(decoded.info.width === asset.width && decoded.info.height === asset.height && decoded.info.channels === 4 && decoded.data.length === asset.width * asset.height * 4, 'complete bounded registered artwork decode', entry.image.decode);
});
report.completedAt = new Date().toISOString();
report.summary = { total: report.checks.length, passed: report.checks.filter((check) => check.passed).length, failed: report.checks.filter((check) => !check.passed).length };
await saveReport();
await reportHandle.close();
console.log(JSON.stringify(report.summary));
process.exitCode = report.summary.failed || report.summary.total !== report.expectedChecks ? 1 : 0;
