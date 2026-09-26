// Read-only production HTTP proof. Run from any directory with Node 24:
// node docs/evidence/first-deployment-2026-09-26/http-smoke.mjs
// Saves only selected public headers/metadata; never cookies, credentials or HTML.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const origin = 'https://valkyriawdg.cz';
const manifestBytes = await readFile(new URL('../../../assets/background-media.json', import.meta.url));
const manifest = JSON.parse(manifestBytes);
const report = {
  schemaVersion: 1,
  evidenceKind: 'real-production-http',
  startedAt: new Date().toISOString(),
  nodeVersion: process.version,
  origin,
  deploymentRecord: {
    revision: 'd0f98b0475e7dfb07add2a679c49acce23259684',
    imageDigest: 'sha256:2ceb72d0b67fd462fa93733c752b60cdc708f36584bcffb5537be31bb5c360d4',
    provenance: 'Operator-supplied deployment identity; not independently discoverable through these public HTTP checks.',
  },
  mediaManifest: {
    id: manifest.id,
    sha256: createHash('sha256').update(manifestBytes).digest('hex'),
  },
  limits: [
    'GET and HEAD only; no authentication POST, account creation or configuration changes.',
    'No full media download/hash, browser decode or natural playback proof in this report.',
    'Mount permissions and host file SHA-256 require separate operator evidence.',
    'Redirect/private-route HTTP checks do not establish authenticated authorization behavior.',
  ],
  checks: [],
};
const selectedHeaders = ['location', 'content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control'];
const checks = [];
function assert(test, expected, actual) {
  checks.push({ test, expected, actual, passed: Boolean(test) });
}
function requireValue(condition, claim, actual) {
  assert(condition, claim, actual);
}
async function request(label, url, options, verify) {
  checks.length = 0;
  const started = Date.now();
  const entry = { label, method: options.method ?? 'GET', url, observedAt: new Date().toISOString() };
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
      ...options,
      headers: { 'accept-encoding': 'identity', 'user-agent': 'Valkyria-production-http-smoke/1.0', ...options.headers },
    });
    entry.status = response.status;
    entry.headers = Object.fromEntries(selectedHeaders.flatMap((name) => {
      const value = response.headers.get(name);
      return value === null ? [] : [[name, value]];
    }));
    await verify(response, entry);
    await response.body?.cancel().catch(() => {});
    entry.assertions = [...checks].map(({ expected, actual, passed }) => ({ expected, actual, passed }));
    entry.passed = checks.every((check) => check.passed);
  } catch (error) {
    entry.passed = false;
    entry.error = { name: error?.name ?? 'Error', code: error?.cause?.code ?? null };
  }
  entry.durationMs = Date.now() - started;
  report.checks.push(entry);
  console.log(`${entry.passed ? 'PASS' : 'FAIL'} ${label}`);
}
function redirectTo(response, expectedStatus, expectedUrl) {
  requireValue(response.status === expectedStatus, `HTTP ${expectedStatus}`, response.status);
  const actual = response.headers.get('location');
  requireValue(actual !== null && new URL(actual, response.url).href === expectedUrl, expectedUrl, actual);
}
function mediaHeaders(response, asset) {
  const type = response.headers.get('content-type')?.split(';')[0]?.trim();
  requireValue(type === asset.mimeType, asset.mimeType, type ?? null);
  const cache = response.headers.get('cache-control') ?? '';
  requireValue(/(?:^|,)\s*public(?:,|$)/i.test(cache) && /(?:^|,)\s*max-age=31536000(?:,|$)/i.test(cache) && /(?:^|,)\s*immutable(?:,|$)/i.test(cache),
    'public, max-age=31536000, immutable', cache);
}
function tags(html, name) {
  return [...html.matchAll(new RegExp('<' + name + '\\b[^>]*>', 'gi'))].map(([tag]) =>
    Object.fromEntries([...tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((match) => [match[1].toLowerCase(), match[2] ?? match[3]])));
}
function metadata(html) {
  const metas = tags(html, 'meta');
  const links = tags(html, 'link');
  return {
    language: tags(html, 'html')[0]?.lang ?? null,
    title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null,
    description: metas.find((tag) => tag.name === 'description')?.content ?? null,
    robots: metas.find((tag) => tag.name === 'robots')?.content ?? null,
    openGraphLocale: metas.find((tag) => tag.property === 'og:locale')?.content ?? null,
    canonical: links.find((tag) => tag.rel === 'canonical')?.href ?? null,
    alternates: links.filter((tag) => tag.rel === 'alternate' && tag.hreflang).map((tag) => ({ language: tag.hreflang, href: tag.href })),
  };
}

await request('root defaults to Czech', origin + '/', {}, (response) => redirectTo(response, 307, origin + '/cs'));
await request('www preserves locale, path and query', 'https://www.valkyriawdg.cz/en/clan?source=http-smoke', {}, (response) =>
  redirectTo(response, 308, origin + '/en/clan?source=http-smoke'));
await request('HTTP redirects to HTTPS with path and query', 'http://valkyriawdg.cz/en/clan?source=http-smoke', {}, (response) => {
  requireValue([301, 308].includes(response.status), 'permanent HTTP redirect (301 or 308)', response.status);
  const location = response.headers.get('location');
  requireValue(location === origin + '/en/clan?source=http-smoke', origin + '/en/clan?source=http-smoke', location);
});

for (const endpoint of ['live', 'ready']) {
  await request('health ' + endpoint, origin + '/api/health/' + endpoint, {}, async (response, entry) => {
    requireValue(response.status === 200, 'HTTP 200', response.status);
    const json = await response.json();
    entry.health = { status: json.status, ...(endpoint === 'ready' ? { checks: json.checks } : {}) };
    requireValue(json.status === (endpoint === 'live' ? 'ok' : 'ready'), endpoint === 'live' ? 'ok' : 'ready', json.status);
    if (endpoint === 'ready') {
      for (const key of ['config', 'database', 'schema', 'media']) requireValue(json.checks?.[key] === 'ok', key + '=ok', json.checks?.[key] ?? null);
    }
  });
}

for (const locale of ['cs', 'en']) {
  for (const suffix of ['', '/clan', '/community', '/privacy', '/news', '/members', '/matches']) {
    const url = origin + '/' + locale + suffix;
    await request('public metadata ' + locale + (suffix || '/'), url, {}, async (response, entry) => {
      requireValue(response.status === 200, 'HTTP 200', response.status);
      const page = metadata(await response.text());
      entry.metadata = page;
      requireValue(page.language === locale, 'html lang=' + locale, page.language);
      requireValue(Boolean(page.title?.trim()), 'nonempty localized title', page.title);
      requireValue(Boolean(page.description?.trim()), 'nonempty description', page.description);
      requireValue(page.openGraphLocale === (locale === 'cs' ? 'cs_CZ' : 'en_GB'), 'localized Open Graph locale', page.openGraphLocale);
      requireValue(page.canonical === url, 'canonical=' + url, page.canonical);
    });
  }
  await request('private login ' + locale, origin + '/' + locale + '/login', {}, async (response, entry) => {
    requireValue(response.status === 200, 'HTTP 200', response.status);
    const page = metadata(await response.text());
    entry.metadata = page;
    requireValue(/no-store/i.test(response.headers.get('cache-control') ?? ''), 'Cache-Control contains no-store', response.headers.get('cache-control'));
    requireValue(page.robots?.includes('noindex'), 'robots noindex', page.robots);
    requireValue(page.language === locale, 'html lang=' + locale, page.language);
  });
  await request('anonymous admin ' + locale, origin + '/' + locale + '/admin', {}, async (response, entry) => {
    requireValue(/no-store/i.test(response.headers.get('cache-control') ?? ''), 'Cache-Control contains no-store', response.headers.get('cache-control'));
    const target = origin + '/' + locale + '/login?returnTo=' + encodeURIComponent('/' + locale + '/admin');
    if ([303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      requireValue(location !== null && new URL(location, response.url).href === target, 'redirect to localized login with admin return path', location);
    } else {
      const html = await response.text();
      const refresh = tags(html, 'meta').find((tag) => tag['http-equiv']?.toLowerCase() === 'refresh')?.content ?? null;
      entry.streamedRedirect = refresh;
      requireValue(response.status === 200 && refresh !== null && refresh.endsWith('/' + locale + '/login?returnTo=' + encodeURIComponent('/' + locale + '/admin')),
        'streamed HTML redirect to localized login with admin return path', { status: response.status, refresh });
    }
  });
}

for (const asset of manifest.assets) {
  const url = origin + '/media/background/' + asset.filename;
  await request('media HEAD ' + asset.role, url, { method: 'HEAD' }, (response, entry) => {
    entry.asset = { filename: asset.filename, role: asset.role, expectedBytes: asset.bytes };
    requireValue(response.status === 200, 'HTTP 200', response.status);
    mediaHeaders(response, asset);
    requireValue(Number(response.headers.get('content-length')) === asset.bytes, 'manifest byte length=' + asset.bytes, response.headers.get('content-length'));
    requireValue(response.headers.get('accept-ranges') === 'bytes', 'Accept-Ranges: bytes', response.headers.get('accept-ranges'));
  });
  await request('media byte range ' + asset.role, url, { headers: { range: 'bytes=0-1023' } }, async (response, entry) => {
    requireValue(response.status === 206, 'HTTP 206', response.status);
    mediaHeaders(response, asset);
    requireValue(response.headers.get('content-range') === 'bytes 0-1023/' + asset.bytes, 'bytes 0-1023/' + asset.bytes, response.headers.get('content-range'));
    if (response.status === 206) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      entry.receivedBytes = bytes.byteLength;
      requireValue(bytes.byteLength === 1024, 'exactly 1024 received bytes', bytes.byteLength);
    }
  });
}
report.completedAt = new Date().toISOString();
report.summary = { total: report.checks.length, passed: report.checks.filter((check) => check.passed).length, failed: report.checks.filter((check) => !check.passed).length };
await writeFile(new URL('./http-smoke.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.summary));
process.exitCode = report.summary.failed === 0 ? 0 : 1;

