import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { FIXTURE_SLUGS } from '../src/fixtures/data';
import { signInAs } from './support/auth';
import { e2eDatabaseUrl } from './support/database-url';

// Actual API pixels and browser UI; synthetic fixtures only. No Discord messages.
test.skip(!process.env.CAPTURE_EVIDENCE, 'Opt-in social sharing evidence capture.');
test.setTimeout(90_000);
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.local/evidence/social');

test('sharing artwork and editorial previews in both locales', async ({ browser, request }) => {
  mkdirSync(out, { recursive: true });
  const captured: { file: string; caption: string }[] = [];
  const templates = [
    ['site-cs', 'cs/site'], ['site-en', 'en/site'], ['news-cs', `cs/news/${FIXTURE_SLUGS.news.featureCs}`],
    ['news-en', `en/news/${FIXTURE_SLUGS.news.featureEn}`],
    ['wardogs-news-cs', `cs/news/${FIXTURE_SLUGS.news.listingCs[0]}`],
    ['result-en', `en/matches/${FIXTURE_SLUGS.matches.completedVerified}`],
    ['unknown-result-cs', `cs/matches/${FIXTURE_SLUGS.matches.completedUnknown}`],
  ];
  for (const [name, route] of templates) {
    const response = await request.get(`/api/social/${route}`);
    expect(response.status(), route).toBe(200);
    const file = `${name}.png`;
    writeFileSync(path.join(out, file), await response.body());
    captured.push({ file, caption: `Actual 1200×630 PNG from GET /api/social/${route}; local synthetic content, not a live social-network unfurl.` });
  }
  const client = new pg.Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  const { rows } = await client.query('select document_id from content_translation where live_slug=$1', [FIXTURE_SLUGS.news.featureCs]);
  const original = (await client.query('select id, opponent_name, competition_name from match where slug=$1', [FIXTURE_SLUGS.matches.completedVerified])).rows[0];
  const originalResult = (await client.query('select score_valkyria, score_opponent from match_result where match_id=$1', [original.id])).rows[0];
  try {
    await client.query('update match set opponent_name=$1, competition_name=$2 where id=$3', ['W'.repeat(120), 'Příliš žluťoučký kůň '.repeat(6).slice(0, 120), original.id]);
    await client.query('update match_result set score_valkyria=1000000, score_opponent=999999 where match_id=$1', [original.id]);
    const stress = await request.get(`/api/social/cs/matches/${FIXTURE_SLUGS.matches.completedVerified}`);
    expect(stress.status()).toBe(200);
    writeFileSync(path.join(out, 'long-result-cs.png'), await stress.body());
    captured.push({ file: 'long-result-cs.png', caption: 'Actual PNG from the production route with isolated 120-character wide-glyph opponent and competition fixtures and maximum supported score; title ellipsis preserves score, verification and date space. Fixture restored afterward.' });
  } finally {
    await client.query('update match set opponent_name=$1, competition_name=$2 where id=$3', [original.opponent_name, original.competition_name, original.id]);
    await client.query('update match_result set score_valkyria=$1, score_opponent=$2 where match_id=$3', [originalResult.score_valkyria, originalResult.score_opponent, original.id]);
  }
  await client.end();
  expect(rows).toHaveLength(1);
  for (const locale of ['cs', 'en'] as const) {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion: 'reduce' });
      await signInAs(context, { roles: ['editor'], name: 'Synthetic sharing editor' });
      const page = await context.newPage();
      await page.goto(`/${locale}/admin/news/${rows[0].document_id}?lang=${locale}`);
      const preview = page.getByTestId('sharing-preview');
      await preview.locator('summary').click();
      await preview.scrollIntoViewIfNeeded();
      await expect(preview.locator('img')).toBeVisible();
      await expect(preview.locator('img')).toHaveJSProperty('naturalWidth', 1200);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const file = `editor-${locale}-${width}.png`;
      await page.screenshot({ path: path.join(out, file), animations: 'disabled' });
      captured.push({ file, caption: `Real editor at ${width}×960, ${locale.toUpperCase()} UI/content, expanded sharing preview of the published translation; isolated session + Discord REST fixture.` });
      await context.close();
    }
  }
  writeFileSync(path.join(out, 'captions.json'), JSON.stringify({ observedAt: new Date().toISOString(), browser: browser.version(), captured }, null, 2) + '\n');
});
