import { expect, test } from '@playwright/test';
import { canvas, expectSaved, publish, storedTranslation } from './admin-editorial-helpers';
import { signInAs } from './support/auth';
import { captureEditorialPage, expectNoArchiveAttribution } from './support/legacy-editorial';

/**
 * FAQ (legacy `/faq`): a shared core page seeded only as an unpublished Czech/English
 * question outline. An editor publishes Czech; the HLL FAQ then lists the questions in
 * the editor's order with links to the answers, while English stays unpublished.
 */
test('an editor publishes the Czech FAQ independently of English', async ({ context, page }) => {
  test.setTimeout(90_000);
  await signInAs(context, { roles: ['editor'] });
  await page.goto('/cs/admin/content');
  const faq = page.getByRole('row', { name: /Časté dotazy/ });
  await expect(faq.getByTestId('state-cs')).toHaveAttribute('data-state', 'draft');
  await expect(faq.getByTestId('state-en')).toHaveAttribute('data-state', 'draft');
  await faq.getByTestId('row-edit').click();
  await expect(page).toHaveURL(/\/cs\/admin\/content\/[0-9a-f-]{36}\?lang=cs$/);
  const documentId = /content\/([0-9a-f-]{36})/.exec(page.url())![1]!;
  await expect(page.getByRole('heading', { level: 1, name: 'Stránka: Časté dotazy' })).toBeVisible();
  await expect(page.getByTestId('news-editor')).toHaveAttribute('data-mode', 'page');
  await expect(page.getByTestId('editor-panel')).toContainText('/cs/faq');

  // The editor answers the first question, saves and publishes Czech only.
  const answer = 'Syntetická odpověď: napiš nám na Discord a domluvíme se.';
  await canvas(page, 'cs').getByText('Odpověď připravujeme.').first().click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.type(answer);
  await page.getByTestId('editor-save').click();
  await expectSaved(page);
  await expect(page.getByTestId('editor-publish')).toHaveText('Publikovat češtinu');
  await publish(page);
  expect(await storedTranslation(documentId, 'cs')).toMatchObject({ liveSlug: 'faq' });
  expect(await storedTranslation(documentId, 'en')).toMatchObject({ liveSlug: null, publishedRevisionId: null });

  const visitorContext = await page.context().browser()!.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto('/cs/hll/faq');
  await expect(visitor.locator('[data-core-page="faq"]')).toHaveAttribute('data-published', 'true');
  const index = visitor.locator('[data-faq-index]');
  await expect(index.getByRole('link')).toHaveCount(11);
  await expect(index.getByRole('link').first()).toHaveText('Jak se přidat do Valkyrie?');
  await expect(index.getByRole('link').first()).toHaveAttribute('href', '#jak-se-pridat-do-valkyrie');
  await index.getByRole('link', { name: 'Jak získat VIP na našich serverech?' }).click();
  await expect(visitor).toHaveURL(/#jak-ziskat-vip-na-nasich-serverech$/);
  await expect(visitor.locator('#jak-ziskat-vip-na-nasich-serverech')).toBeInViewport();
  await expect(visitor.locator('[data-core-page="faq"]')).toContainText(answer);
  await expect(visitor.locator('[data-hll-menu="bar"] [data-hll-menu-item="faq"]')).toHaveAttribute('aria-current', 'page');
  // Question dividers span the answers panel instead of stopping at the text column.
  const body = visitor.locator('[data-core-page="faq"] div[lang]').first();
  const panel = (await body.boundingBox())!;
  const question = (await body.locator('h2').nth(1).boundingBox())!;
  expect(question.width).toBeGreaterThan(panel.width - 2);

  // Published archive metadata never surfaces as a reference to the former website.
  for (const width of [1920, 390]) {
    await visitor.setViewportSize({ width, height: width === 1920 ? 1080 : 844 });
    await visitor.emulateMedia({ reducedMotion: 'reduce' });
    await visitor.goto('/cs/hll/faq');
    await expectNoArchiveAttribution(visitor, 'faq');
    await captureEditorialPage(visitor, 'faq', width);
  }

  // English is published separately and stays an honest unpublished state.
  await visitor.goto('/en/hll/faq');
  await expect(visitor.locator('[data-core-page="faq"]')).toHaveAttribute('data-published', 'false');
  await expect(visitor.getByText('How do I join Valkyria?')).toHaveCount(0);
  await expect(visitor.locator('[data-archive-editorial]')).toHaveCount(0);
  expect(await visitor.content()).not.toContain('Synthetic historical author');
  await visitorContext.close();
});
