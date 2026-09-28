import { expect, test } from '@playwright/test';
import { FIXTURE_SLUGS } from '../src/fixtures/data';
import { expectNoHorizontalOverflow } from './support/shell-helpers';

const NEWS = FIXTURE_SLUGS.news;

test.describe('public news list', () => {
  test('shows only published Czech posts with pagination', async ({ page }) => {
    const response = await page.goto('/cs/news');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'Novinky' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    const cards = page.locator('[data-news-card]');
    await expect(cards).toHaveCount(12);
    await expect(page.locator(`[data-news-card="${NEWS.featureCs}"]`)).toContainText('[Ukázka] Obrázky, tabulka a odkazy');
    // Covers reserve their dimensions and carry the published alt text.
    const cover = page.locator(`[data-news-card="${NEWS.featureCs}"] img`);
    await expect(cover).toHaveAttribute('src', /\/api\/media\/[0-9a-f-]+\/thumb$/);
    await expect(cover).toHaveAttribute('width', '1600');
    await expect(cover).toHaveAttribute('alt', /.+/);
    await expect(page.getByRole('status').filter({ hasText: '16 článků' })).toBeVisible();
    for (const hidden of [NEWS.scheduledCs, NEWS.archivedCs, NEWS.withEnDraftEn]) {
      await expect(page.locator(`a[href*="${hidden}"]`)).toHaveCount(0);
    }

    const pagination = page.getByRole('navigation', { name: 'Stránkování' });
    await expect(pagination.getByText('Stránka 1 z 2')).toBeVisible();
    await pagination.getByRole('link', { name: /Další/ }).click();
    await expect(page).toHaveURL(/\/cs\/news\?page=2$/);
    await expect(page.locator('[data-news-card]')).toHaveCount(4);
    await expect(pagination.getByRole('link', { name: 'Stránka 2' })).toHaveAttribute('aria-current', 'page');
    const secondPage = await page.locator('[data-news-card]').evaluateAll((items) => items.map((item) => item.getAttribute('data-news-card')));
    expect(secondPage).not.toContain(NEWS.featureCs);
    await page.goBack();
    await expect(page).toHaveURL(/\/cs\/news$/);
    await expect(page.locator('[data-news-card]')).toHaveCount(12);
  });

  test('filters and search live in the URL and back/forward restore them', async ({ page }) => {
    await page.goto('/cs/news');
    await page.locator('[data-filter="game:hell-let-loose"]').click();
    await expect(page).toHaveURL(/\/cs\/news\?game=hell-let-loose$/);
    await expect(page.locator('[data-filter="game:hell-let-loose"]')).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('[data-news-card]')).toHaveCount(4);
    for (const card of await page.locator('[data-news-card]').all()) await expect(card).toContainText('Hell Let Loose');

    await page.locator('[data-filter="category:match-report"]').click();
    await expect(page).toHaveURL(/\/cs\/news\?category=match-report&game=hell-let-loose$/);
    await expect(page.locator('[data-news-card]')).toHaveCount(1);
    await expect(page.getByRole('status').filter({ hasText: '1 článek' })).toBeVisible();

    await page.getByRole('searchbox', { name: 'Hledat v novinkách' }).fill('neexistujici-vyraz');
    await page.getByRole('button', { name: 'Hledat' }).click();
    await expect(page).toHaveURL(/q=neexistujici-vyraz/);
    await expect(page).toHaveURL(/category=match-report/);
    await expect(page.getByRole('heading', { name: 'Těmto filtrům neodpovídají žádné novinky.' })).toBeVisible();
    await expect(page.locator('[data-clear-filters]')).toHaveAttribute('href', '/cs/news');

    await page.goBack();
    await expect(page).toHaveURL(/\/cs\/news\?category=match-report&game=hell-let-loose$/);
    await expect(page.locator('[data-news-card]')).toHaveCount(1);
    await expect(page.locator('[data-filter="category:match-report"]')).toHaveAttribute('aria-current', 'true');
    await page.goBack();
    await expect(page).toHaveURL(/\/cs\/news\?game=hell-let-loose$/);
    await expect(page.locator('[data-news-card]')).toHaveCount(4);
    await page.goForward();
    await expect(page).toHaveURL(/category=match-report/);
    await expect(page.locator('[data-news-card]')).toHaveCount(1);

    await page.reload();
    await expect(page.locator('[data-filter="game:hell-let-loose"]')).toHaveAttribute('aria-current', 'true');
    await page.locator('[data-filter="game:all"]').click();
    await expect(page).toHaveURL(/\/cs\/news\?category=match-report$/);
  });

  test('English list contains only English translations', async ({ page }) => {
    await page.goto('/en/news');
    await expect(page.getByRole('heading', { level: 1, name: 'News' })).toBeVisible();
    await expect(page.locator('[data-news-card]')).toHaveCount(6);
    await expect(page.locator(`[data-news-card="${NEWS.featureEn}"]`)).toBeVisible();
    await expect(page.locator(`a[href*="${NEWS.csOnly}"]`)).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: '6 articles' })).toBeVisible();
  });
});

test.describe('missing article translation', () => {
  test('switching a Czech-only article to English lands on the English list with a notice and source link', async ({ page }) => {
    await page.goto(`/cs/news/${NEWS.csOnly}`);
    await page.getByRole('group', { name: 'Jazyk webu' }).getByRole('link', { name: 'Přepnout na angličtinu (English)' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/news\\?missing=cs(%3A|:)${NEWS.csOnly}$`));
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    const notice = page.locator(`[data-missing-translation="cs:${NEWS.csOnly}"]`);
    await expect(notice).toContainText('This article is not available in English');
    await expect(notice).toContainText('It has only been published in Czech.');
    const source = notice.locator('[data-missing-source]');
    await expect(source).toHaveAttribute('href', `/cs/news/${NEWS.csOnly}`);
    await expect(source).toHaveAttribute('hreflang', 'cs');
    await expect(source).toHaveText('Read the Czech version: [Ukázka] Článek pouze v češtině');
    await expect(source.locator('[lang="cs"]')).toHaveText('[Ukázka] Článek pouze v češtině');
    await source.click();
    await expect(page).toHaveURL(new RegExp(`/cs/news/${NEWS.csOnly}$`));
    await expect(page.getByRole('heading', { level: 1, name: '[Ukázka] Článek pouze v češtině' })).toBeVisible();
  });

  test('the endpoint redirect and the notice ignore unverifiable sources', async ({ page, request }) => {
    const redirect = await request.get(`/api/locale-switch?to=en&from=${encodeURIComponent(`/cs/news/${NEWS.csOnly}`)}`, { maxRedirects: 0 });
    expect(redirect.status()).toBe(307);
    expect(redirect.headers().location).toBe(`/en/news?missing=cs%3A${NEWS.csOnly}`);

    for (const missing of ['cs:neexistujici-clanek', `cs:${NEWS.scheduledCs}`, `cs:${NEWS.featureCs}`, `en:${NEWS.featureEn}`, 'de:x']) {
      await page.goto(`/en/news?missing=${encodeURIComponent(missing)}`);
      await expect(page.getByRole('heading', { level: 1, name: 'News' })).toBeVisible();
      await expect(page.locator('[data-missing-translation]')).toHaveCount(0);
    }
  });

  test('unpublished or foreign translations are 404 under a locale URL', async ({ page }) => {
    for (const path of [`/en/news/${NEWS.withEnDraftEn}`, `/cs/news/${NEWS.scheduledCs}`, `/cs/news/${NEWS.archivedCs}`, `/en/news/${NEWS.csOnly}`, '/cs/news/neexistuje']) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
    }
    await expect(page.getByRole('heading', { level: 1, name: 'Stránka nenalezena' })).toBeVisible();
    await page.goto(`/en/news/${NEWS.withEnDraftEn}`);
    await expect(page.getByRole('heading', { level: 1, name: /not found/i })).toBeVisible();
    await expect(page.getByText('Private English draft')).toHaveCount(0);
  });
});

test.describe('public article', () => {
  test('renders the feature article: cover, table region, inline image, caption and related posts', async ({ page }) => {
    // The feature post is a Wardogs post: the shared URL redirects to its canonical section.
    await page.goto(`/cs/news/${NEWS.featureCs}`);
    await expect(page).toHaveURL(new RegExp(`/cs/wardogs/news/${NEWS.featureCs}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('[Ukázka] Obrázky, tabulka a odkazy');
    await expect(page.locator('[data-back-link]')).toHaveAttribute('href', '/cs/wardogs/news');
    const cover = page.locator('[data-article-cover] img');
    await expect(cover).toHaveAttribute('src', /\/api\/media\/[0-9a-f-]+\/full$/);
    await expect(cover).toHaveAttribute('alt', /.+/);
    expect(await cover.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(page.locator('[data-article-published] time')).toHaveText(/^\d{1,2}\.\s[a-zěščřžýáíéúůň]+\s\d{4}$/);

    const body = page.locator('[data-article-body]');
    const region = body.getByRole('region', { name: 'Tabulka (na menší obrazovce ji posuňte vodorovně)' });
    await expect(region).toBeVisible();
    await expect(region.getByRole('table')).toContainText('Syntetická data');
    await expect(body.getByRole('img', { name: 'Syntetický obrázek v textu článku' })).toBeVisible();
    await expect(body.locator('figcaption')).toHaveText('Syntetický popisek obrázku');
    const external = body.getByRole('link', { name: /bezpečnou externí stránku/ });
    await expect(external).toHaveAccessibleName(/^bezpečnou externí stránku \(externí odkaz\)/);

    const related = page.locator('[data-related]');
    await expect(related.getByRole('heading', { name: 'Související novinky' })).toBeVisible();
    expect(await related.getByRole('link').count()).toBeGreaterThan(0);
    // Wait for the exact related article: the feature URL itself also matches `/cs/news/ukazka-`,
    // and going back before the client navigation commits would leave the page.
    const relatedLink = related.getByRole('link').first();
    const relatedHref = await relatedLink.getAttribute('href');
    expect(relatedHref).toMatch(/^\/cs\/(wardogs\/|hll\/)?news\/ukazka-[a-z0-9-]+$/);
    expect(relatedHref).not.toBe(`/cs/wardogs/news/${NEWS.featureCs}`);
    await relatedLink.click();
    await expect(page).toHaveURL(new RegExp(`${relatedHref}$`));
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('[Ukázka] Obrázky, tabulka a odkazy');
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('[Ukázka] Obrázky, tabulka a odkazy');
  });

  test('English article uses en-GB date conventions', async ({ page }) => {
    await page.goto(`/en/news/${NEWS.featureEn}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('[Sample] Images, table and links');
    // en-GB: day before month, no comma (never the US "September 25, 2026").
    await expect(page.locator('[data-article-published] time')).toHaveText(/^\d{1,2}\s[A-Z][a-z]+\s\d{4}$/);
    await expect(page.locator('[data-article-body]').getByRole('region', { name: 'Table (scroll horizontally on smaller screens)' })).toBeVisible();
  });

  test('hreflang alternates list only published counterparts', async ({ page }) => {
    await page.goto(`/cs/wardogs/news/${NEWS.featureCs}`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/cs/wardogs/news/${NEWS.featureCs}$`));
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute('href', new RegExp(`/en/wardogs/news/${NEWS.featureEn}$`));
    await expect(page.locator('link[rel="alternate"][hreflang="cs"]')).toHaveAttribute('href', new RegExp(`/cs/wardogs/news/${NEWS.featureCs}$`));
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute('href', new RegExp(`/cs/wardogs/news/${NEWS.featureCs}$`));
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', new RegExp(`/api/social/cs/news/${NEWS.featureCs}\\?v=2-`));

    for (const slug of [NEWS.csOnly, NEWS.withEnDraftCs]) {
      await page.goto(`/cs/news/${slug}`);
      await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveCount(0);
      await expect(page.locator('link[rel="alternate"][hreflang="cs"]')).toHaveCount(1);
      await expect(page.locator(`link[href*="${NEWS.withEnDraftEn}"]`)).toHaveCount(0);
    }
  });

  test('long article and table stay within a 390 px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of [`/cs/news/${NEWS.longFormCs}`, `/en/news/${NEWS.longFormEn}`, `/cs/news/${NEWS.featureCs}`, '/cs/news', '/en/news']) {
      await page.goto(path);
      await expectNoHorizontalOverflow(page);
    }
  });
});
