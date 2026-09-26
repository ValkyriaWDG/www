import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { matchBySlug, memberBySlug } from './admin-community-support';
import { type E2ERole, signInAs } from './support/auth';

/**
 * Automated WCAG 2.x A/AA scan (axe-core) of the community administration screens in
 * both UI languages. Automated checks complement, not replace, keyboard and visual review.
 */

const pages: { name: string; role: E2ERole; path: () => Promise<string> }[] = [
  { name: 'match overview', role: 'match_manager', path: async () => '/cs/admin/matches' },
  { name: 'new match form', role: 'match_manager', path: async () => '/en/admin/matches/new' },
  { name: 'match editor', role: 'match_manager', path: async () => `/cs/admin/matches/${(await matchBySlug('ukazka-wardogs-overeny-vysledek'))!.id}` },
  { name: 'member list', role: 'editor', path: async () => '/en/admin/members' },
  { name: 'member editor', role: 'editor', path: async () => `/cs/admin/members/${(await memberBySlug('synteticka-hracka-bravo'))!.id}` },
  { name: 'settings', role: 'administrator', path: async () => '/cs/admin/settings' },
  { name: 'audit log', role: 'administrator', path: async () => '/en/admin/audit' },
];

for (const entry of pages) {
  test(`no WCAG A/AA violations: ${entry.name}`, async ({ browser }) => {
    const context = await browser.newContext();
    await signInAs(context, { roles: [entry.role] });
    const page = await context.newPage();
    await page.goto(await entry.path());
    await page.evaluate(() => document.fonts.ready);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      // Scope to the page content; the shared shell header/footer is covered by the shell suite.
      .include('#main-content')
      .analyze();
    const summary = results.violations.map((violation) => `${violation.id} (${violation.impact}): ${violation.nodes.map((node) => node.target.join(' ')).slice(0, 3).join(' | ')}`);
    expect(summary).toEqual([]);
    await context.close();
  });
}
