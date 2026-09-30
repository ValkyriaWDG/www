import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PublicArchiveEditorial } from '@/modules/legacy/editorial-details';
import { TournamentEmblem } from './tournament-emblem';

const archive = {
  logo: { assetId: '00000000-0000-4000-8000-000000000001', width: 200, height: 120 },
} as PublicArchiveEditorial;

describe('TournamentEmblem', () => {
  it('shows a restored competition logo as the decorative emblem', () => {
    const html = renderToStaticMarkup(TournamentEmblem({ item: { archiveEditorial: archive }, size: 30 }));
    expect(html).toContain('data-emblem="logo"');
    expect(html).toContain('/media/00000000-0000-4000-8000-000000000001/');
    expect(html).toContain('alt=""');
    expect(html).not.toContain('data-icon="trophy"');
  });

  it('falls back to the trophy glyph and forwards data attributes', () => {
    const html = renderToStaticMarkup(TournamentEmblem({ item: { archiveEditorial: null }, size: 36, 'data-tournament-emblem': '' }));
    expect(html).toContain('data-emblem="trophy"');
    expect(html).toContain('data-icon="trophy"');
    expect(html).toContain('data-tournament-emblem=""');
  });
});
