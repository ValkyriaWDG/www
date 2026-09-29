import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { LEGACY_GUIDES, LEGACY_HLL_ORIGIN } from '../modules/legacy/hll';
import { readLegacyPublicDom } from '../modules/legacy/extract-dom';
import { convertLegacyDom, legacyImageUrl, safeLegacyUrl } from '../modules/legacy/extract-rich-text';
import { announcementTree, extractLegacyFaq, parseLegacyFrontmatter } from '../modules/legacy/extract-source';
import { reconcileLegacyMatches, REVIEWED_MATCH_IDENTITY_REPAIRS, validateLegacyScoreboardMap, verifiedLegacyScoreboardUrl } from '../modules/legacy/extract-matches';
import type { LegacyExtractBundle, LegacyExtractDocument, LegacyExtractMedia } from '../modules/legacy/extract-types';

/** Offline/read-only preparation only. No application imports, database access, auth or publication. */
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const ORIGIN = LEGACY_HLL_ORIGIN;
function argument(name: string): string | undefined { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; }
function required(name: string): string { const value = argument(name); if (!value || value.startsWith('--')) throw new Error(`${name} is required`); return value; }
function contained(root: string, requested: string): string {
  const result = realpathSync(requested);
  if (!result.startsWith(realpathSync(root) + path.sep)) throw new Error('Source path escapes its declared root');
  return result;
}
function placeholderId(url: string): string {
  const hash = sha(`valkyria-legacy-media-v1:${url}`);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
function scalar(metadata: Record<string, string | string[]>, key: string): string { const value = metadata[key]; return typeof value === 'string' ? value : ''; }
function date(value: string): string | null { return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : null; }

async function main() {
  const source = realpathSync(required('--source'));
  const output = path.resolve(required('--output'));
  if (!output.split(path.sep).includes('.local')) throw new Error('Populated bundles must be written inside an ignored .local directory');
  const cache = argument('--public-cache') ? realpathSync(required('--public-cache')) : path.join(output, 'public-pages');
  mkdirSync(output, { recursive: true }); mkdirSync(cache, { recursive: true });
  mkdirSync(path.join(output, 'media'), { recursive: true }); mkdirSync(path.join(output, 'scoreboards'), { recursive: true });
  const bundle: LegacyExtractBundle = {
    schemaVersion: 1, sourceOrigin: ORIGIN, observedAt: new Date().toISOString(),
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(),
    documents: [], media: [], matches: [], matchMedia: [], scoreboardSources: [],
    warnings: ['Local preparation only: publication and media acceptance require the importer.', 'Legacy match dates used fixed GMT+1; do not silently reinterpret them as Europe/Prague.', 'Raw local scoreboard snapshots may contain extra private fields. Never commit them; the importer must allowlist fields.'],
  };
  const media = new Map<string, LegacyExtractMedia>();
  const sourcePublic = path.join(source, 'public');
  const resolveMedia = (input: string, alt: string, role: LegacyExtractMedia['role'] = 'body'): string | null => {
    const sourceUrl = legacyImageUrl(input, ORIGIN);
    if (!sourceUrl) return null;
    const known = media.get(sourceUrl);
    if (known) return known.relativeFile ? known.id : null;
    const descriptor: LegacyExtractMedia = { id: placeholderId(sourceUrl), sourceUrl, alt, role, rightsStatus: 'external-review-required' };
    const url = new URL(sourceUrl);
    if (url.origin === ORIGIN && !url.search && !url.hash && /\.(?:png|jpe?g|webp)$/i.test(url.pathname)) {
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      if (relative.includes('\\') || relative.split('/').some((part) => part === '..' || part === '.')) throw new Error('Unsafe media source path');
      const filename = path.join(sourcePublic, relative);
      if (existsSync(filename)) {
        const local = contained(sourcePublic, filename);
        if (statSync(local).size <= 15 * 1024 * 1024) {
          const bytes = readFileSync(local);
          descriptor.relativeFile = `media/${descriptor.id}${path.extname(local).toLowerCase()}`;
          descriptor.sha256 = sha(bytes); descriptor.bytes = bytes.length;
          descriptor.rightsStatus = 'legacy-published-owner-migration';
          writeFileSync(path.join(output, descriptor.relativeFile), bytes);
        }
      }
    }
    media.set(sourceUrl, descriptor);
    return descriptor.relativeFile ? descriptor.id : null;
  };
  const publicHtml = async (slug: string, url: string): Promise<string> => {
    const file = path.join(cache, `${slug}.html`);
    if (existsSync(file)) {
      if (statSync(file).size > 8_000_000) throw new Error('Cached HTML exceeds bounds');
      return readFileSync(file, 'utf8');
    }
    if (new URL(url).origin !== ORIGIN) throw new Error('Only the declared public origin can be fetched');
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(25_000) });
    if (!response.ok) throw new Error(`Public page returned ${response.status}: ${url}`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 8_000_000) throw new Error('Fetched HTML exceeds bounds');
    writeFileSync(file, Buffer.from(bytes));
    return Buffer.from(bytes).toString('utf8');
  };
  const matchFile = path.join(cache, 'matches.json');
  if (!existsSync(matchFile)) {
    const response = await fetch(`${ORIGIN}/api/matches`, { redirect: 'error', signal: AbortSignal.timeout(25_000) });
    if (!response.ok) throw new Error('Public matches endpoint unavailable');
    writeFileSync(matchFile, await response.text());
  }
  const matchData = JSON.parse(readFileSync(matchFile, 'utf8').replace(/^\uFEFF/, '')) as { completed: Record<string, unknown>[]; upcoming: Record<string, unknown>[] };
  if (!Array.isArray(matchData.completed) || !Array.isArray(matchData.upcoming)) throw new Error('Unexpected public matches envelope');
  const sourceMatchesDirectory = path.join(source, 'src/data/matches');
  const sourceMatches = readdirSync(sourceMatchesDirectory).filter((name) => /^\d+\.json$/.test(name)).map((name) => ({
    fileId: Number(name.slice(0, -5)), row: JSON.parse(readFileSync(contained(source, path.join(sourceMatchesDirectory, name)), 'utf8').replace(/^\uFEFF/, '')) as Record<string, unknown>,
  }));
  const reconciled = reconcileLegacyMatches([...matchData.completed, ...matchData.upcoming], sourceMatches, REVIEWED_MATCH_IDENTITY_REPAIRS);
  bundle.matches = reconciled.matches;
  bundle.warnings.push(...reconciled.warnings);

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' });
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    for (const category of ['articles', 'guide', 'tournaments', 'news'] as const) {
      const directory = path.join(source, 'content', category);
      for (const name of readdirSync(directory).filter((name) => /^[a-z0-9-]+\.mdx$/.test(name)).sort()) {
        const slug = name.slice(0, -4);
        const { metadata, body: archivedBody } = parseLegacyFrontmatter(readFileSync(contained(source, path.join(directory, name)), 'utf8'));
        const route = category === 'articles' ? 'clanky' : category === 'tournaments' ? 'turnaje' : category;
        const sourceUrl = category === 'news' ? ORIGIN : `${ORIGIN}/${route}/${slug}`;
        const root = category === 'news' ? announcementTree(archivedBody) : await readLegacyPublicDom(page, await publicHtml(`${category}-${slug}`, sourceUrl), 'mdx');
        const converted = convertLegacyDom(root, { pageUrl: sourceUrl, resolveImage: resolveMedia });
        const guide = LEGACY_GUIDES.find((guide) => guide.slug === slug);
        const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
        const document: LegacyExtractDocument = {
          kind: category === 'guide' ? 'manual' : category === 'tournaments' ? 'tournament' : 'news', legacyId: slug, slug,
          game: slug === 'wardogs-oznameni' ? 'wardogs' : slug === 'sbirka-2026' ? null : 'hell-let-loose', locale: 'cs', sourceLanguage: guide?.sourceLanguage ?? 'cs', sourceUrl,
          sourcePublishedOn: date(scalar(metadata, 'publishDate')), sourceModifiedOn: date(scalar(metadata, 'lastModified')),
          title: scalar(metadata, 'title'), excerpt: scalar(metadata, 'description'), authorLabel: scalar(metadata, 'author'),
          credits: ['authors', 'editors', 'contributors'].flatMap((key) => Array.isArray(metadata[key]) ? [`${key}: ${(metadata[key] as string[]).join(', ')}`] : []).join('; ') || guide?.credits || '',
          body: converted.body, coverAssetId: resolveMedia(scalar(metadata, 'bannerUrl') || scalar(metadata, 'thumbnail'), scalar(metadata, 'title'), 'cover'), tags,
          metadata: {}, warnings: converted.warnings,
        };
        if (guide) document.metadata = { categoryKey: guide.category, sortOrder: guide.sortOrder, sourceNotes: [guide.notes] };
        if (category === 'news') {
          document.metadata = { archive: true, expiresOn: date(scalar(metadata, 'endDate')), sourceNotes: ['Historical expired homepage announcement recovered from literal source; not a current promotion.'] };
          document.warnings.push('Expired announcement: archive only; never activate as a current giveaway or event.');
        }
        if (category === 'tournaments') {
          const startsOn = date(scalar(metadata, 'startDate'));
          let endsOn = date(scalar(metadata, 'endDate'));
          const notes: string[] = [];
          if (startsOn && endsOn && endsOn < startsOn) { notes.push(`Legacy endDate ${endsOn} precedes startDate ${startsOn}; end date left unknown.`); endsOn = null; }
          document.metadata = {
            name: document.title, tag: scalar(metadata, 'tag'), series: scalar(metadata, 'series'), season: scalar(metadata, 'season'), startsOn, endsOn,
            links: [['webUrl', 'Website'], ['rulesUrl', 'Rules'], ['discordUrl', 'Discord']].flatMap(([key, label]) => {
              const url = safeLegacyUrl(scalar(metadata, key!), ORIGIN);
              return url ? [{ label: label!, url }] : [];
            }), sourceNotes: notes, logoAssetId: resolveMedia(scalar(metadata, 'logoUrl'), document.title, 'logo'),
          };
        }
        bundle.documents.push(document);
      }
    }
    const faqs = extractLegacyFaq(readFileSync(contained(source, path.join(source, 'src/app/(main)/faq/page.tsx')), 'utf8'));
    await publicHtml('faq', `${ORIGIN}/faq`);
    const faqBody = convertLegacyDom({ tag: 'root', children: faqs.flatMap((faq) => [{ tag: 'h2', children: [{ tag: '#text', text: faq.question }] }, { tag: 'p', children: [{ tag: '#text', text: faq.answer }] }]) }, { pageUrl: `${ORIGIN}/faq`, resolveImage: resolveMedia });
    const pageDocument = (key: 'faq' | 'clan', title: string): LegacyExtractDocument => ({ kind: 'page', legacyId: key === 'clan' ? 'about' : key, slug: key, game: key === 'faq' ? 'hell-let-loose' : null, locale: 'cs', sourceLanguage: 'cs', sourceUrl: `${ORIGIN}/${key === 'clan' ? 'about' : key}`, sourcePublishedOn: null, sourceModifiedOn: null, title, excerpt: '', authorLabel: '', credits: '', body: { type: 'doc', content: [] }, coverAssetId: null, tags: [], metadata: { pageKey: key }, warnings: [] });
    bundle.documents.push({ ...pageDocument('faq', 'Časté otázky'), ...faqBody });
    const about = convertLegacyDom(await readLegacyPublicDom(page, await publicHtml('about', `${ORIGIN}/about`), 'about'), { pageUrl: `${ORIGIN}/about`, resolveImage: resolveMedia });
    bundle.documents.push({ ...pageDocument('clan', 'O komunitě Valkyria'), ...about, metadata: { pageKey: 'clan', sourceNotes: ['Member/Discord/match counters are historical source claims, not live metrics.'] } });
  } finally { await browser.close(); }

  // Read the literal map-image map without importing any old application module.
  const mapSource = ts.createSourceFile('legacy-map.tsx', readFileSync(contained(source, path.join(source, 'src/components/match/utils.tsx')), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const mapImages: Record<string, string> = {};
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'nameToImage' && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      for (const property of node.initializer.properties) if (ts.isPropertyAssignment(property) && ts.isStringLiteral(property.name) && ts.isStringLiteral(property.initializer)) mapImages[property.name.text] = property.initializer.text;
    }
    ts.forEachChild(node, visit);
  };
  visit(mapSource);
  for (const row of bundle.matches) {
    const teams = row.teams as { home?: { name?: string; img?: string }; away?: { name?: string; img?: string } };
    const league = row.league as { name?: string; img?: string };
    const map = typeof row.map === 'string' ? mapImages[row.map || 'unknown'] : undefined;
    const mapSourceUrl = map ? `${ORIGIN}/images/maps/${map}` : null;
    bundle.matchMedia!.push({ legacyMatchId: row.id as number,
      homeLogoAssetId: resolveMedia(teams.home?.img ?? '', teams.home?.name ?? '', 'logo'),
      awayLogoAssetId: resolveMedia(teams.away?.img ?? '', teams.away?.name ?? '', 'logo'),
      leagueLogoAssetId: resolveMedia(league.img ?? '', league.name ?? '', 'logo'),
      mapAssetId: mapSourceUrl ? resolveMedia(mapSourceUrl, String(row.map), 'cover') : null, mapSourceUrl,
    });
  }
  const byId = new Map(bundle.matches.map((row) => [row.id as number, row]));
  const scoreboardDirectory = path.join(source, 'src/data/stats');
  for (const name of readdirSync(scoreboardDirectory).filter((name) => /^\d+(?:_\d+)?\.json$/.test(name)).sort()) {
    const [id, suffix] = name.replace('.json', '').split('_');
    const match = byId.get(Number(id));
    if (!match) continue;
    const bytes = readFileSync(contained(source, path.join(scoreboardDirectory, name)));
    const value = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')) as { result?: { id?: unknown; map_name?: unknown; start?: unknown; server_number?: unknown; player_stats?: unknown[] } };
    if (typeof value.result?.id !== 'number' || !Array.isArray(value.result.player_stats) || !value.result.player_stats.length) {
      bundle.warnings.push(`Empty or incomplete scoreboard excluded: ${name}; match facts remain eligible for migration.`);
      continue;
    }
    const mapAssociation = validateLegacyScoreboardMap(match.map, value.result.map_name);
    if (!mapAssociation.ok) {
      bundle.warnings.push(`Scoreboard quarantined: ${name}. ${mapAssociation.note}`);
      continue;
    }
    const teams = match.teams as { home?: { name?: string; side?: string }; away?: { name?: string; side?: string } };
    const vlk = teams.home?.name === 'VLK' ? teams.home : teams.away?.name === 'VLK' ? teams.away : null;
    const side = !suffix && match.format === 'best of 1' && (vlk?.side === 'allies' || vlk?.side === 'axis') ? vlk.side : null;
    const ordinal = suffix ? Number(suffix) : 1;
    const sourceGameUrl = verifiedLegacyScoreboardUrl(Number(id), ordinal, value.result);
    const relativeFile = `scoreboards/${name}`;
    writeFileSync(path.join(output, relativeFile), bytes);
    bundle.scoreboardSources.push({ legacyMatchId: Number(id), ordinal, providerGameId: typeof value.result?.id === 'number' ? value.result.id : null, sourceGameUrl, relativeFile, sha256: sha(bytes), bytes: bytes.length, valkyriaSide: side, notes: [...(side ? [] : ['No confirmed per-round Valkyria side; do not infer from weapons or player names.']), ...(mapAssociation.note ? [mapAssociation.note] : []), sourceGameUrl ? 'Provider origin verified on 2026-09-29 against public API id/server_number/start/map_name.' : 'Provider host is unverified; a game ID and server number do not identify its origin. No external game link published.'] });
  }
  bundle.media = [...media.values()];
  writeFileSync(path.join(output, 'bundle.json'), JSON.stringify(bundle, null, 2) + '\n');
  const summary = { documents: bundle.documents.length, byKind: Object.fromEntries(['news', 'manual', 'tournament', 'page'].map((kind) => [kind, bundle.documents.filter((doc) => doc.kind === kind).length])), matches: bundle.matches.length, scoreboards: bundle.scoreboardSources.length, stagedMedia: bundle.media.filter((item) => item.relativeFile).length, linkedMediaForReview: bundle.media.filter((item) => !item.relativeFile).length, documentWarnings: bundle.documents.filter((doc) => doc.warnings.length).map((doc) => ({ slug: doc.slug, warnings: doc.warnings })) };
  writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error: unknown) => {
  console.error(`Legacy extraction failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});
