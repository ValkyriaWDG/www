import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { matchBySlug } from './admin-community-support';
import { signInAs } from './support/auth';

/** Real application rendering against disposable synthetic fixtures and loopback CRCON. */
test.skip(process.env.CAPTURE_LEGACY_EVIDENCE !== '1', 'Set CAPTURE_LEGACY_EVIDENCE=1 to capture legacy integration proof.');
const output = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.local/legacy-audit/screenshots');
const editorOnly = process.env.CAPTURE_LEGACY_EDITOR_ONLY === '1';
const captures: Array<{ file: string; caption: string; viewport: string; locale: string; path: string }> = [];
let browserVersion: string | null = null;
test.afterAll(() => {
  if (process.env.CAPTURE_LEGACY_EVIDENCE !== '1') return;
  mkdirSync(output, { recursive: true });
  writeFileSync(path.join(output, editorOnly ? 'captions-editor.json' : 'captions.json'), `${JSON.stringify({ capturedAt: new Date().toISOString(), sourceRevision: process.env.EVIDENCE_SOURCE_REVISION ?? null, browser: `Chromium ${browserVersion ?? 'not captured'}`, environment: 'Local production build, synthetic fixtures; not live clan/CRCON data.', captures }, null, 2)}\n`);
});

test('capture localized desktop and mobile player snapshots and CRCON URL imports', async ({ browser }) => {
  test.setTimeout(180_000);
  browserVersion = browser.version();
  mkdirSync(output, { recursive: true });
  for (const locale of ['cs', 'en'] as const) {
    for (const viewport of [{ width: 1920, height: 1200 }, { width: 390, height: 844 }]) {
      if (editorOnly && viewport.width !== 390) continue;
      const name = `${locale}-${viewport.width}x${viewport.height}`;
      if (!editorOnly) {
        const context = await browser.newContext({ viewport, reducedMotion: 'reduce', locale: locale === 'cs' ? 'cs-CZ' : 'en-GB' });
        try {
          const page = await context.newPage();
          const target = `/${locale}/hll/servers?server=synthetic-alpha`;
          await page.goto(target);
          await expect(page.locator('[data-live-players="fresh"]')).toContainText('[SYN] Alpha Player');
          await page.evaluate(() => document.fonts.ready);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
          const file = `server-round-players-${name}.png`;
          await page.screenshot({ path: path.join(output, file), fullPage: true, animations: 'disabled', caret: 'hide' });
          captures.push({ file, locale, viewport: `${viewport.width}x${viewport.height}`, path: target, caption: 'Rendered synthetic server selection and round-participant table, including source timestamp, differing connected/round counts, nullable defense and visible refresh controls. Player names are synthetic; the background is the shipped HLL poster.' });
        } finally { await context.close(); }
      }

      const admin = await browser.newContext({ viewport, reducedMotion: 'reduce', locale: locale === 'cs' ? 'cs-CZ' : 'en-GB' });
      try {
        await signInAs(admin, { roles: ['match_manager'], name: 'Synthetic integration reviewer' });
        const page = await admin.newPage();
        const fixtureSlug = 'ukazka-hll-historicky';
        const fixture = await matchBySlug(fixtureSlug);
        expect(fixture).not.toBeNull();
        const target = `/${locale}/admin/matches/${fixture!.id}`;
        await page.goto(target);
        const panel = page.locator('[data-statistics-panel]');
        await panel.getByRole('radio', { name: locale === 'cs' ? /^Odkaz na dokončenou hru/ : /^Link to a finished game/ }).check();
        const input = panel.getByLabel(locale === 'cs' ? /^Odkaz na hru/ : /^Game URL/);
        await input.fill('https://untrusted.example.org/games/4321');
        await panel.locator('[data-statistics-action="import"]').click();
        await expect(input).toHaveAttribute('aria-invalid', 'true');
        if (locale === 'en' && viewport.width === 1920) {
          const file = `crcon-untrusted-url-${name}.png`;
          await panel.screenshot({ path: path.join(output, file), animations: 'disabled', caret: 'hide' });
          captures.push({ file, locale, viewport: `${viewport.width}x${viewport.height}`, path: target, caption: 'Match-manager form rejects an unconfigured statistics host without replacing the existing snapshot. Synthetic fixture and real server-side validation; panel crop.' });
        }
        await input.fill('https://stats.example.org/games/4321');
        await panel.locator('[data-statistics-action="import"]').click();
        await expect(panel.getByText(locale === 'cs' ? 'Statistiky importovány.' : 'Statistics imported.', { exact: true })).toBeVisible();
        await expect(panel.locator('[data-statistics-current] [data-statistics-source-link]')).toHaveAttribute('href', 'https://stats.example.org/games/4321');
        await page.evaluate(() => document.fonts.ready);
        const geometry = await page.evaluate(() => ({
          viewport: innerWidth,
          document: document.documentElement.scrollWidth,
          overflow: [...document.querySelectorAll('body *')].filter((element) => {
            const bounds = element.getBoundingClientRect();
            return element instanceof HTMLElement && bounds.width > 0 && bounds.right > innerWidth + 1;
          }).slice(0, 32).map((element) => ({ tag: element.tagName, className: element.className, right: element.getBoundingClientRect().right })),
        }));
        expect(geometry.document, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.viewport + 1);
        if (!editorOnly) {
          const file = `crcon-game-url-import-${name}.png`;
          await panel.screenshot({ path: path.join(output, file), animations: 'disabled', caret: 'hide' });
          captures.push({ file, locale, viewport: `${viewport.width}x${viewport.height}`, path: target, caption: 'Successful finished-game URL import via the configured loopback CRCON adapter. Visible provenance link points to synthetic stats.example.org; scores and players are synthetic. Match-manager panel crop, no live external import.' });
        }
        if (viewport.width === 390) {
          await expect(page.locator('[data-public-path]')).toHaveText(`/${locale}/hll/matches/${fixtureSlug}`);
          const file = `match-editor-mobile-${name}.png`;
          await page.locator('[data-group="presentation"]').screenshot({ path: path.join(output, file), animations: 'disabled', caret: 'hide' });
          captures.push({ file, locale, viewport: `${viewport.width}x${viewport.height}`, path: target, caption: 'Synthetic match editor public-presentation group fits the mobile viewport. Rich-text controls use their own horizontal toolbar scroll area; the page has no horizontal overflow. Actual application panel crop after the bounded grid-track fix.' });
        }
      } finally { await admin.close(); }
    }
  }
});
