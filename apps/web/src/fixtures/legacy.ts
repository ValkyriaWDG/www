import type { ArchiveEditorialDetails } from '../modules/legacy/editorial-details';

/** Synthetic archive metadata, never copied from a real match or person. */
export const FIXTURE_LEGACY_MATCH_DETAILS = {
  version: 1,
  homeTeamName: 'VLK + Synthetic Ally',
  awayTeamName: 'Synthetic HLL Opponent Foxtrot',
  homeCountry: 'CZ',
  awayCountry: 'US',
  homeSide: 'allies',
  awaySide: 'axis',
  homeSideLabel: 'allies',
  awaySideLabel: 'axis',
  capturePoint: 'Synthetic Capture Point',
  legacyPoint: 'Synthetic Point',
  points: ['3', '2'],
  durationMinutes: 90,
  firstCapture: 'allies',
  legacyFirstCaptured: 'axis',
  firstCaptureConflict: true,
  sourceDate: '12/05/2024 19:00',
  separateTime: '20:00',
  timeConflict: true,
  clock: 'legacy-fixed-offset',
  sourceLinks: [{
    url: 'https://example.org/synthetic-fixture/hll-recording',
    title: 'Synthetic HLL recording',
    description: 'Synthetic match recording for migration parity tests.',
    author: 'Synthetic recording author',
    date: '12/05/2024',
    type: 'youtube',
  }],
} as const;

export const FIXTURE_EDITORIAL_KEYS = ['synthetic-editorial-fixture:clan', 'synthetic-editorial-fixture:faq', 'synthetic-editorial-fixture:manual-setup'] as const;

export function fixtureEditorialDetails(kind: 'page' | 'manual', key: string): ArchiveEditorialDetails {
  return {
    schemaVersion: 1, kind, sourceUrl: `https://valkyriahll.cz/synthetic-fixture/${key}`, sourceLanguage: 'cs',
    sourcePublishedOn: '2020-05-01', sourceModifiedOn: '2020-06-01',
    sourceAuthorLabel: 'Synthetic historical author <b>plain text</b>',
    excerpt: '', tag: '', series: '', logoAssetId: null, authorImageAssetId: null,
    coverSourceUrl: null, thumbnailSourceUrl: null, sourceIndex: null, warnings: [],
  };
}
