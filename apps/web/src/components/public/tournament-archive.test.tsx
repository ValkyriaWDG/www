import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PublicArchiveEditorial } from '@/modules/legacy/editorial-details';
import { TournamentArchiveFacts } from './tournament-archive';

const details = {
  kind: 'tournament', sourceUrl: 'https://valkyriahll.cz/turnaje/synthetic-cup', sourceLanguage: 'cs', sourceAuthorLabel: 'Synthetic author',
  sourceModifiedOn: '2020-06-01', excerpt: 'Synthetic excerpt', tag: 'SYN', series: 'Synthetic series', warnings: [], logo: null, authorImage: null,
} as unknown as PublicArchiveEditorial;

describe('TournamentArchiveFacts', () => {
  it('shows the restored description and series as tournament content without referring to the former website', () => {
    const html = renderToStaticMarkup(TournamentArchiveFacts({ details, compact: true }));
    expect(html).toContain('<p lang="cs">Synthetic excerpt</p>');
    expect(html).toContain('SYN · Synthetic series');
    expect(html).not.toMatch(/valkyriahll|původní|Synthetic author|2020/i);
  });

  it('renders nothing for other kinds or without facts', () => {
    expect(renderToStaticMarkup(TournamentArchiveFacts({ details: { ...details, kind: 'page' } }))).toBe('');
    expect(renderToStaticMarkup(TournamentArchiveFacts({ details: { ...details, excerpt: '', tag: '', series: '' } }))).toBe('');
  });
});
