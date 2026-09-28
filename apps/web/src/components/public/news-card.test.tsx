import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { NewsSummary } from '@/modules/content/types';
import { NewsCard } from './news-card';

// App Router's navigation runtime is unavailable in plain Node; keep the card itself real.
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href, className }: { children: ReactNode; href: string; className?: string }) => createElement('a', { href, className }, children),
}));

const item: NewsSummary = {
  documentId: 'synthetic-document', translationId: 'synthetic-translation', locale: 'cs',
  slug: 'synthetic-announcement', title: 'Synthetic announcement', excerpt: '',
  cover: null, publishedAt: new Date('2026-09-28T12:00:00Z'), updatedAt: new Date('2026-09-28T12:00:00Z'),
  authorLabel: '', category: null, tags: [], game: 'hell-let-loose',
};
const labels = { games: { 'hell-let-loose': 'Hell Let Loose', wardogs: 'Wardogs' }, placeholder: 'Valkyria', tags: 'Tags' };
function render(overrides: Partial<NewsSummary> = {}) {
  return renderToStaticMarkup(createElement(NewsCard, { item: { ...item, ...overrides }, locale: 'cs', labels }));
}

describe('news card decorative game artwork', () => {
  it('gives a coverless HLL article a decorative scene and clan crest', () => {
    const html = render();
    expect(html).toContain('src="/images/hll/news.webp"');
    expect(html).toContain('src="/brand/valkyria-emblem-733.webp"');
    expect(html).toContain('aria-hidden="true"');
  });

  it('preserves the published cover and its alt text instead of decorative artwork', () => {
    const html = render({ cover: { assetId: '00000000-0000-4000-8000-000000000001', alt: 'Actual published cover', width: 800, height: 600 } });
    expect(html).toContain('alt="Actual published cover"');
    expect(html).toContain('/api/media/00000000-0000-4000-8000-000000000001');
    expect(html).not.toContain('/images/hll/');
  });

  it('keeps the Wardogs wordmark on a coverless Wardogs article', () => {
    const html = render({ game: 'wardogs' });
    expect(html).toContain('/presskit/wardogs-fullmark-white.svg');
    expect(html).not.toContain('/images/hll/');
  });

  it('keeps a shared community article game-neutral', () => {
    const html = render({ game: null });
    expect(html).not.toContain('/images/hll/');
    expect(html).not.toContain('/presskit/');
  });
});
