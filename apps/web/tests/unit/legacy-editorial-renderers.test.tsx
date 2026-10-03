import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CorePage } from '@/components/public/core-page';
import { ManualArticleScreen } from '@/components/field-manual/manual-article-screen';
import type { AppLocale } from '@/i18n/routing';
import type { ArticleDTO } from '@/modules/content/types';
import { getPublishedManualBySlug } from '@/modules/field-manual/public';
import type { PublicArchiveEditorial } from '@/modules/legacy/editorial-details';

vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
  permanentRedirect: () => { throw new Error('NEXT_REDIRECT'); },
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href, ...props }: { children: ReactNode; href: string }) => createElement('a', { href, ...props }, children),
}));
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }));
vi.mock('@/lib/site', () => ({ getSiteOrigin: () => 'https://example.test' }));
vi.mock('@/modules/field-manual/public', () => ({ getPublishedManualBySlug: vi.fn() }));

function archival(kind: 'page' | 'manual', slug: string): PublicArchiveEditorial {
  return {
    schemaVersion: 1, kind, sourceUrl: `https://valkyriahll.cz/${slug}`, sourceLanguage: 'cs',
    sourcePublishedOn: '2020-05-01', sourceModifiedOn: '2020-06-01',
    sourceAuthorLabel: 'Synthetic historical author <b>plain text</b>', excerpt: '', tag: '', series: '',
    logoAssetId: null, authorImageAssetId: null, coverSourceUrl: null, thumbnailSourceUrl: null,
    sourceIndex: null, warnings: [], logo: null, authorImage: null,
  };
}

function article(kind: 'page' | 'manual', locale: AppLocale, slug: 'clan' | 'faq' | 'synthetic-manual', withArchive = true): ArticleDTO {
  return {
    documentId: 'synthetic-document', translationId: 'synthetic-translation', revisionId: 'synthetic-revision',
    kind, locale, slug, pageKey: slug === 'synthetic-manual' ? null : slug,
    title: 'Current published title', excerpt: 'Current published excerpt',
    body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Current ${locale} editorial body remains unchanged.` }] }] },
    cover: null, authorLabel: 'Current author', seoTitle: '', seoDescription: '',
    publishedAt: new Date('2026-09-01T10:00:00Z'), updatedAt: new Date('2026-09-01T10:00:00Z'),
    category: null, tags: [], game: kind === 'manual' ? 'hell-let-loose' : null,
    assets: new Map(), counterparts: { [locale]: slug }, isPreview: false,
    // The public projection deliberately does not provide Czech historical copy to EN.
    archiveEditorial: withArchive && locale === 'cs' ? archival(kind, slug) : null,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('FAQ introduction at the public page renderer', () => {
  for (const locale of ['cs', 'en'] as const) {
    it(`keeps an independent authored summary in ${locale}`, async () => {
      const page = article('page', locale, 'faq');
      const html = renderToStaticMarkup(await CorePage({ locale, pageKey: 'faq', page }));
      const header = html.split('data-core-page=')[0]!;
      expect(header).toContain('Current published excerpt');
      expect(header).not.toContain('faq.meta.description');
    });

    it(`replaces a long copied question/answer prefix with the localized introduction in ${locale}`, async () => {
      const page = article('page', locale, 'faq');
      const question = locale === 'cs' ? 'Jak se přidat?' : 'How do I join?';
      const answer = (locale === 'cs' ? 'Syntetická odpověď na otázku. ' : 'Synthetic answer to the question. ').repeat(30).trim();
      page.body = { type: 'doc', content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: question }] },
        { type: 'paragraph', content: [{ type: 'text', text: answer }] },
      ] };
      page.excerpt = `${`${question} ${answer}`.slice(0, 590).trim()}${locale === 'cs' ? '…' : '...'}`;
      const html = renderToStaticMarkup(await CorePage({ locale, pageKey: 'faq', page }));
      const header = html.split('data-core-page=')[0]!;
      expect(header).toContain('faq.meta.description');
      expect(header).not.toContain(question);
      expect(html).toContain(question);
      expect(html).toContain(answer);
    });

    it(`uses the localized introduction for an empty published summary in ${locale}`, async () => {
      const page = { ...article('page', locale, 'faq'), excerpt: '  ' };
      const html = renderToStaticMarkup(await CorePage({ locale, pageKey: 'faq', page }));
      expect(html.split('data-core-page=')[0]).toContain('faq.meta.description');
    });
  }

  it('does not change another core page summary', async () => {
    const page = article('page', 'cs', 'clan');
    page.excerpt = 'Current cs editorial body remains unchanged.';
    const html = renderToStaticMarkup(await CorePage({ locale: 'cs', pageKey: 'clan', page }));
    expect(html.split('data-core-page=')[0]).toContain(page.excerpt);
  });
});

describe('published archive metadata at the actual page renderers', () => {
  for (const pageKey of ['clan', 'faq'] as const) {
    it(`${pageKey} renders the unchanged Czech editorial body without referring to the former website`, async () => {
      const html = renderToStaticMarkup(await CorePage({ locale: 'cs', pageKey, page: article('page', 'cs', pageKey) }));
      expect(html).toContain('Current cs editorial body remains unchanged.');
      expect(html).not.toContain('data-archive-editorial');
      expect(html).not.toContain('Z původního webu');
      expect(html).not.toContain('valkyriahll.cz');
      expect(html).not.toContain('Synthetic historical author');
    });
    it(`${pageKey} renders an independent English page without inventing an archive counterpart`, async () => {
      const html = renderToStaticMarkup(await CorePage({ locale: 'en', pageKey, page: article('page', 'en', pageKey) }));
      expect(html).toContain('Current en editorial body remains unchanged.');
      expect(html).not.toContain('data-archive-editorial');
      expect(html).not.toContain('Synthetic historical author');
    });
    it(`${pageKey} omits archive metadata when the published DTO has none`, async () => {
      const html = renderToStaticMarkup(await CorePage({ locale: 'cs', pageKey, page: article('page', 'cs', pageKey, false) }));
      expect(html).not.toContain('data-archive-editorial');
    });
    it(`${pageKey} unpublished state has no source metadata or editorial body`, async () => {
      const html = renderToStaticMarkup(await CorePage({ locale: 'cs', pageKey, page: null }));
      expect(html).toContain('data-published="false"');
      expect(html).not.toContain('data-archive-editorial');
      expect(html).not.toContain('Current cs editorial body');
    });
  }

  it('manual moved from the former website keeps its credits but no link, date or language of that website', async () => {
    vi.mocked(getPublishedManualBySlug).mockResolvedValue({ kind: 'article', article: article('manual', 'cs', 'synthetic-manual'),
      meta: { sourceUrl: 'https://valkyriahll.cz/synthetic-manual', sourcePublishedOn: '2020-05-01', sourceLanguage: 'cs', credits: 'Existing manual credit', reviewedAt: null } });
    const html = renderToStaticMarkup(await ManualArticleScreen({ locale: 'cs', game: 'hll', slug: 'synthetic-manual' }));
    expect(html).not.toContain('data-archive-editorial');
    expect(html).not.toContain('valkyriahll.cz');
    expect(html).not.toContain('dateTime="2020-05-01"');
    expect(html).not.toContain('Synthetic historical author');
    expect(html).toContain('data-manual-provenance');
    expect(html).toContain('Existing manual credit');
    expect(html).toContain('Current cs editorial body remains unchanged.');
  });

  it('manual adapted from a third-party guide still credits that source', async () => {
    vi.mocked(getPublishedManualBySlug).mockResolvedValue({ kind: 'article', article: article('manual', 'cs', 'synthetic-manual', false),
      meta: { sourceUrl: 'https://example.org/guide', sourcePublishedOn: '2020-05-01', sourceLanguage: 'en', credits: 'Guide author', reviewedAt: null } });
    const html = renderToStaticMarkup(await ManualArticleScreen({ locale: 'cs', game: 'hll', slug: 'synthetic-manual' }));
    expect(html).toContain('href="https://example.org/guide"');
    expect(html).toContain('dateTime="2020-05-01"');
    expect(html).toContain('Guide author');
  });

  it.each(['cs', 'en'] as const)('manual without archival DTO remains unchanged in %s', async (locale) => {
    vi.mocked(getPublishedManualBySlug).mockResolvedValue({ kind: 'article', article: article('manual', locale, 'synthetic-manual', false),
      meta: { sourceUrl: null, sourcePublishedOn: null, sourceLanguage: null, credits: '', reviewedAt: null } });
    const html = renderToStaticMarkup(await ManualArticleScreen({ locale, game: 'hll', slug: 'synthetic-manual' }));
    expect(html).toContain(`Current ${locale} editorial body remains unchanged.`);
    expect(html).not.toContain('data-archive-editorial');
    expect(html).not.toContain('Synthetic historical author');
  });

  it('unpublished manual still produces not-found rather than source metadata', async () => {
    vi.mocked(getPublishedManualBySlug).mockResolvedValue(null);
    await expect(ManualArticleScreen({ locale: 'cs', game: 'hll', slug: 'synthetic-manual' })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
