import type { Game, Locale, PublicRoleKey } from '@valkyria/db';
import type { FixtureImageSpec } from './images';
import { bold, doc, h2, h3, hr, image, italic, link, ol, p, quote, strike, table, ul, underline } from '../seed/rich-text';

/*
 * Synthetic development/test fixtures. Every name, opponent and title is obviously
 * invented ("Syntetický hráč …", "Synthetic Opponent …", "[Ukázka]" / "[Sample]"); nothing
 * is taken from screenshots, the legacy site or real people/teams. Stable slugs and IDs
 * are exported for tests and browser checks.
 */

export const FIXTURE_ASSET_IDS = {
  newsCover: 'f1c7a0e0-0000-4000-8000-00000000a001',
  newsInline: 'f1c7a0e0-0000-4000-8000-00000000a002',
  memberAvatar: 'f1c7a0e0-0000-4000-8000-00000000a003',
  opponentLogo: 'f1c7a0e0-0000-4000-8000-00000000a004',
  matchCover: 'f1c7a0e0-0000-4000-8000-00000000a005',
  squareLogo: 'f1c7a0e0-0000-4000-8000-00000000a006',
  smallImage: 'f1c7a0e0-0000-4000-8000-00000000a007',
  portraitPhoto: 'f1c7a0e0-0000-4000-8000-00000000a008',
} as const;

export const FIXTURE_IMAGES: FixtureImageSpec[] = [
  {
    id: FIXTURE_ASSET_IDS.newsCover,
    name: 'news-cover',
    label: 'NEWS COVER',
    width: 1600,
    height: 900,
    scope: 'editorial',
    colors: ['#0d0f14', '#3a2412', '#f0a02a'],
    altCs: 'Syntetický ilustrační obrázek s nápisem SYNTHETIC FIXTURE',
    altEn: 'Synthetic illustration reading SYNTHETIC FIXTURE',
  },
  {
    id: FIXTURE_ASSET_IDS.newsInline,
    name: 'inline-image',
    label: 'INLINE IMAGE',
    width: 1200,
    height: 800,
    scope: 'editorial',
    colors: ['#10121a', '#23304a', '#8fb3ff'],
    altCs: 'Syntetický obrázek v textu článku',
    altEn: 'Synthetic inline article image',
  },
  {
    id: FIXTURE_ASSET_IDS.memberAvatar,
    name: 'avatar',
    label: 'AVATAR',
    width: 512,
    height: 512,
    scope: 'editorial',
    colors: ['#0b1216', '#1d3a44', '#5fd0c8'],
    altCs: 'Syntetický avatar',
    altEn: 'Synthetic avatar',
  },
  {
    id: FIXTURE_ASSET_IDS.opponentLogo,
    name: 'opponent-logo',
    label: 'OPPONENT LOGO',
    width: 512,
    height: 512,
    scope: 'match',
    colors: ['#140d12', '#43182c', '#ff6f91'],
    altCs: 'Syntetické logo soupeře',
    altEn: 'Synthetic opponent logo',
  },
  {
    id: FIXTURE_ASSET_IDS.matchCover,
    name: 'match-cover',
    label: 'MATCH COVER',
    width: 1600,
    height: 900,
    scope: 'match',
    colors: ['#0e1110', '#26351f', '#b6e36b'],
    altCs: 'Syntetický obrázek zápasu',
    altEn: 'Synthetic match image',
  },
  // Imported and editor-uploaded bodies also hold logos, small images and portrait photos.
  {
    id: FIXTURE_ASSET_IDS.squareLogo,
    name: 'square-logo',
    label: 'SQUARE LOGO',
    width: 800,
    height: 800,
    scope: 'editorial',
    colors: ['#15100c', '#4a2a12', '#ff9a3c'],
    altCs: 'Syntetické čtvercové logo',
    altEn: 'Synthetic square logo',
  },
  {
    id: FIXTURE_ASSET_IDS.smallImage,
    name: 'small-image',
    label: 'SMALL',
    width: 360,
    height: 200,
    scope: 'editorial',
    colors: ['#0f1412', '#23402f', '#7fe0a8'],
    altCs: 'Syntetický malý obrázek',
    altEn: 'Synthetic small image',
  },
  {
    id: FIXTURE_ASSET_IDS.portraitPhoto,
    name: 'portrait-photo',
    label: 'PORTRAIT',
    width: 900,
    height: 1350,
    scope: 'editorial',
    colors: ['#12101a', '#2e2446', '#c3a6ff'],
    altCs: 'Syntetická fotografie na výšku',
    altEn: 'Synthetic portrait photo',
  },
];

/** Synthetic tags, removed again by `--reset` (keys start with `fixture-`). */
export const FIXTURE_TAGS = [
  { key: 'fixture-wardogs', labelCs: 'Ukázka Wardogs', labelEn: 'Sample Wardogs' },
  { key: 'fixture-hll', labelCs: 'Ukázka HLL', labelEn: 'Sample HLL' },
  { key: 'fixture-guide', labelCs: 'Ukázkový návod', labelEn: 'Sample guide' },
] as const;

export const FIXTURE_SLUGS = {
  members: {
    publishedBilingual: 'synteticky-hrac-alfa',
    publishedCsOnlyBio: 'synteticka-hracka-bravo',
    draft: 'synteticky-hrac-charlie',
    hidden: 'synteticky-hrac-delta',
    longName: 'synteticky-hrac-echo-s-neobycejne-dlouhym-jmenem',
    emoji: 'synteticky-hrac-foxtrot',
  },
  matches: {
    upcoming: 'ukazka-wardogs-nadchazejici',
    postponed: 'ukazka-wardogs-odlozeny',
    cancelled: 'ukazka-wardogs-zruseny',
    completedVerified: 'ukazka-wardogs-overeny-vysledek',
    completedUnknown: 'ukazka-wardogs-neznamy-vysledek',
    hllHistorical: 'ukazka-hll-historicky',
    draft: 'ukazka-wardogs-koncept',
  },
  tournaments: {
    current: 'ukazka-hll-liga-podzim-2026',
    finished: 'ukazka-hll-pohar-jaro-2026',
    draft: 'ukazka-hll-turnaj-koncept',
  },
  news: {
    featureCs: 'ukazka-obrazky-tabulka-a-odkazy',
    featureEn: 'sample-images-table-and-links',
    csOnly: 'ukazka-pouze-cesky',
    withEnDraftCs: 'ukazka-s-anglickym-konceptem',
    withEnDraftEn: 'sample-private-english-draft',
    scheduledCs: 'ukazka-naplanovany-clanek',
    longFormCs: 'ukazka-dlouhy-clanek',
    longFormEn: 'sample-long-form-article',
    archivedCs: 'ukazka-archivovany-clanek',
    listingCs: Array.from({ length: 12 }, (_, i) => `ukazka-seznam-${String(i + 1).padStart(2, '0')}`),
    listingEn: Array.from({ length: 12 }, (_, i) => (i % 3 === 0 ? `sample-listing-${String(i + 1).padStart(2, '0')}` : null)),
  },
} as const;

/* ------------------------------------------------------------------ members */

export type FixtureBio = { published: boolean };
export type FixtureMember = {
  slug: string;
  displayName: string;
  state: 'draft' | 'published' | 'hidden';
  consent: boolean;
  avatar: boolean;
  games: Game[];
  publicRoleKeys: PublicRoleKey[];
  sortOrder: number;
  bio: Partial<Record<Locale, FixtureBio>>;
};

export const FIXTURE_MEMBERS: FixtureMember[] = [
  {
    slug: FIXTURE_SLUGS.members.publishedBilingual,
    displayName: 'Syntetický hráč Alfa',
    state: 'published',
    consent: true,
    avatar: true,
    games: ['wardogs'],
    publicRoleKeys: ['member'],
    sortOrder: 10,
    bio: { cs: { published: true }, en: { published: true } },
  },
  {
    slug: FIXTURE_SLUGS.members.publishedCsOnlyBio,
    displayName: 'Syntetická hráčka Bravo',
    state: 'published',
    consent: true,
    avatar: false,
    games: ['wardogs', 'hell-let-loose'],
    publicRoleKeys: ['officer', 'veteran'],
    sortOrder: 20,
    // English exists only as a private draft; the public profile reports it missing.
    bio: { cs: { published: true }, en: { published: false } },
  },
  {
    slug: FIXTURE_SLUGS.members.draft,
    displayName: 'Syntetický hráč Charlie',
    state: 'draft',
    consent: false,
    avatar: false,
    games: ['wardogs'],
    publicRoleKeys: ['recruit'],
    sortOrder: 30,
    bio: { cs: { published: false } },
  },
  {
    slug: FIXTURE_SLUGS.members.hidden,
    displayName: 'Syntetický hráč Delta',
    state: 'hidden',
    consent: true,
    avatar: true,
    games: ['hell-let-loose'],
    publicRoleKeys: ['member'],
    sortOrder: 40,
    bio: { cs: { published: true } },
  },
  {
    slug: FIXTURE_SLUGS.members.longName,
    displayName: 'Syntetický hráč Echo s neobyčejně dlouhým jménem Žluťoučký kůň úpěl ďábelské ódy',
    state: 'published',
    consent: true,
    avatar: false,
    games: ['hell-let-loose'],
    publicRoleKeys: ['recruit'],
    sortOrder: 50,
    bio: {},
  },
  {
    slug: FIXTURE_SLUGS.members.emoji,
    displayName: 'Syntetický hráč Foxtrot 🦊🎮',
    state: 'published',
    consent: true,
    avatar: true,
    games: ['wardogs'],
    publicRoleKeys: ['content-creator'],
    sortOrder: 60,
    bio: { en: { published: true } },
  },
];

export function memberBio(member: FixtureMember, locale: Locale) {
  return locale === 'cs'
    ? doc(
        p(bold('[Ukázka] '), `${member.displayName} je syntetický profil pro vývoj a testy. Nejde o skutečného hráče.`),
        p('Text obsahuje ', italic('kurzívu'), ', ', underline('podtržení'), ' a ', link('bezpečný odkaz', 'https://example.org/synthetic-fixture/profile'), '.'),
      )
    : doc(
        p(bold('[Sample] '), `${member.displayName} is a synthetic profile for development and tests. Not a real player.`),
        p('The text includes ', italic('italics'), ', ', underline('underline'), ' and a ', link('safe link', 'https://example.org/synthetic-fixture/profile'), '.'),
      );
}

/* ------------------------------------------------------------------ matches */

export type FixtureRound = {
  mapName: string | null;
  mode: string | null;
  side: string | null;
  scoreValkyria: number | null;
  scoreOpponent: number | null;
  outcome: 'win' | 'loss' | 'draw' | 'unknown' | null;
};

export type FixtureMatch = {
  slug: string;
  game: Game;
  opponentName: string;
  opponentShortCode: string;
  logo: boolean;
  cover: boolean;
  competitionType: 'league' | 'tournament' | 'cup' | 'friendly' | 'scrim' | 'other';
  competitionName: string | null;
  season: string | null;
  bestOf: number | null;
  /** Start relative to "now" in days at a Prague wall-clock time, or a fixed instant. */
  start: { days: number; time: string } | { instant: string };
  originalStart?: { days: number; time: string };
  status: 'scheduled' | 'live' | 'completed' | 'postponed' | 'cancelled';
  published: boolean;
  eventUrl: string | null;
  /** Synthetic Wardogs League link (accepted URL shape, nonexistent fixture ID). */
  leagueMatchUrl?: string;
  vodLinks: { url: string; label: string }[];
  internalNotes: string;
  result?: {
    scoreValkyria: number | null;
    scoreOpponent: number | null;
    outcome: 'win' | 'loss' | 'draw' | 'unknown';
    verification: 'provisional' | 'verified';
    source: string;
  };
  rounds?: FixtureRound[];
  recap: Partial<Record<Locale, { published: boolean }>>;
};

export const FIXTURE_MATCHES: FixtureMatch[] = [
  {
    slug: FIXTURE_SLUGS.matches.upcoming,
    game: 'wardogs',
    opponentName: 'Synthetic Opponent Alpha',
    opponentShortCode: 'SOA',
    logo: true,
    cover: false,
    competitionType: 'friendly',
    competitionName: 'Synthetic Friendly Series',
    season: null,
    bestOf: null,
    start: { days: 7, time: '19:00' },
    status: 'scheduled',
    published: true,
    eventUrl: 'https://example.org/synthetic-fixture/event-alpha',
    leagueMatchUrl: 'https://wardogsleague.net/matches/synthetic-fixture-alpha',
    vodLinks: [],
    internalNotes: 'Synthetic internal note (upcoming): must never appear publicly.',
    recap: {},
  },
  {
    slug: FIXTURE_SLUGS.matches.postponed,
    game: 'wardogs',
    opponentName: 'Synthetic Opponent Bravo',
    opponentShortCode: 'SOB',
    logo: false,
    cover: false,
    competitionType: 'league',
    competitionName: 'Synthetic Sample League',
    season: 'Fixture season',
    bestOf: 3,
    start: { days: 14, time: '20:00' },
    originalStart: { days: 2, time: '20:00' },
    status: 'postponed',
    published: true,
    eventUrl: null,
    vodLinks: [],
    internalNotes: '',
    recap: {},
  },
  {
    slug: FIXTURE_SLUGS.matches.cancelled,
    game: 'wardogs',
    opponentName: 'Synthetic Opponent Charlie',
    opponentShortCode: 'SOC',
    logo: false,
    cover: false,
    competitionType: 'cup',
    competitionName: 'Synthetic Sample Cup',
    season: null,
    bestOf: null,
    start: { days: -3, time: '19:00' },
    status: 'cancelled',
    published: true,
    eventUrl: null,
    vodLinks: [],
    internalNotes: '',
    recap: {},
  },
  {
    slug: FIXTURE_SLUGS.matches.completedVerified,
    game: 'wardogs',
    opponentName: 'Synthetic Opponent Delta',
    opponentShortCode: 'SOD',
    logo: true,
    cover: true,
    competitionType: 'league',
    competitionName: 'Synthetic Sample League',
    season: 'Fixture season',
    bestOf: 3,
    start: { days: -7, time: '19:00' },
    status: 'completed',
    published: true,
    eventUrl: 'https://example.org/synthetic-fixture/event-delta',
    vodLinks: [{ url: 'https://example.org/synthetic-fixture/vod-delta', label: 'Synthetic VOD' }],
    internalNotes: 'Synthetic internal note (completed): private.',
    result: { scoreValkyria: 2, scoreOpponent: 1, outcome: 'win', verification: 'verified', source: 'Synthetic fixture source (not a real result)' },
    rounds: [
      { mapName: 'Synthetic Map A', mode: 'Synthetic mode', side: null, scoreValkyria: 1, scoreOpponent: 0, outcome: 'win' },
      { mapName: 'Synthetic Map B', mode: 'Synthetic mode', side: null, scoreValkyria: 0, scoreOpponent: 1, outcome: 'loss' },
      { mapName: 'Synthetic Map C', mode: 'Synthetic mode', side: null, scoreValkyria: 1, scoreOpponent: 0, outcome: 'win' },
    ],
    recap: { cs: { published: true }, en: { published: true } },
  },
  {
    slug: FIXTURE_SLUGS.matches.completedUnknown,
    game: 'wardogs',
    opponentName: 'Synthetic Opponent Echo',
    opponentShortCode: 'SOE',
    logo: false,
    cover: false,
    competitionType: 'scrim',
    competitionName: null,
    season: null,
    bestOf: null,
    start: { days: -10, time: '18:30' },
    status: 'completed',
    published: true,
    eventUrl: null,
    vodLinks: [],
    internalNotes: '',
    // Unknown scores stay null; never rendered as 0:0.
    result: { scoreValkyria: null, scoreOpponent: null, outcome: 'unknown', verification: 'provisional', source: '' },
    // Czech recap is live; English exists only as a private draft.
    recap: { cs: { published: true }, en: { published: false } },
  },
  {
    slug: FIXTURE_SLUGS.matches.hllHistorical,
    game: 'hell-let-loose',
    opponentName: 'Synthetic HLL Opponent Foxtrot',
    opponentShortCode: 'SHF',
    logo: false,
    cover: false,
    competitionType: 'tournament',
    competitionName: 'Synthetic Historical Cup (sample)',
    season: 'Synthetic 2024',
    bestOf: null,
    start: { instant: '2024-05-12T18:00:00Z' },
    status: 'completed',
    published: true,
    eventUrl: null,
    vodLinks: [],
    internalNotes: '',
    result: { scoreValkyria: 3, scoreOpponent: 2, outcome: 'win', verification: 'provisional', source: 'Synthetic historical fixture (not a real result)' },
    // Public HLL map names (accented spellings on purpose) for map artwork; the third
    // round's synthetic map stays text-only. Scores are synthetic, including a real zero.
    rounds: [
      { mapName: 'Hürtgen Forest', mode: 'Warfare', side: 'allies', scoreValkyria: 3, scoreOpponent: 2, outcome: 'win' },
      { mapName: 'Sainte-Mère-Église', mode: 'Warfare', side: 'axis', scoreValkyria: 5, scoreOpponent: 0, outcome: 'win' },
      { mapName: 'Synthetic Map D', mode: 'Warfare', side: 'allies', scoreValkyria: null, scoreOpponent: null, outcome: 'unknown' },
    ],
    recap: {},
  },
  {
    slug: FIXTURE_SLUGS.matches.draft,
    game: 'wardogs',
    opponentName: 'Synthetic Opponent Golf',
    opponentShortCode: 'SOG',
    logo: true,
    cover: false,
    competitionType: 'other',
    competitionName: null,
    season: null,
    bestOf: null,
    start: { days: 21, time: '19:00' },
    status: 'scheduled',
    published: false,
    eventUrl: null,
    vodLinks: [],
    internalNotes: 'Synthetic internal note (draft): must never appear publicly.',
    recap: { cs: { published: false } },
  },
];

export function matchRecap(fixture: FixtureMatch, locale: Locale) {
  const withImage = fixture.cover;
  return locale === 'cs'
    ? doc(
        p(bold('[Ukázka] '), `Syntetická reportáž k zápasu proti týmu ${fixture.opponentName}. Nejde o skutečný zápas.`),
        h2('Průběh'),
        ul('Syntetický bod jedna', 'Syntetický bod dva'),
        ...(withImage ? [image(FIXTURE_ASSET_IDS.matchCover, 'Syntetický obrázek zápasu', 'Syntetický popisek')] : []),
      )
    : doc(
        p(bold('[Sample] '), `Synthetic recap of the match against ${fixture.opponentName}. Not a real match.`),
        h2('Summary'),
        ul('Synthetic point one', 'Synthetic point two'),
        ...(withImage ? [image(FIXTURE_ASSET_IDS.matchCover, 'Synthetic match image', 'Synthetic caption')] : []),
      );
}

/* -------------------------------------------------------------- tournaments */

export type FixtureTournament = {
  slug: string;
  game: Game;
  name: string;
  season: string | null;
  organizer: string | null;
  /** Calendar days relative to "now" (Europe/Prague); `null` leaves the day unknown. */
  startDays: number | null;
  endDays: number | null;
  links: { url: string; label: string }[];
  published: boolean;
  description: Partial<Record<Locale, { published: boolean }>>;
  /** Fixture matches linked to the tournament. */
  matchSlugs: string[];
};

export const FIXTURE_TOURNAMENTS: FixtureTournament[] = [
  {
    slug: FIXTURE_SLUGS.tournaments.current,
    game: 'hell-let-loose',
    name: '[SYNTHETIC] Valkyria Test League',
    season: 'Podzim 2026',
    organizer: '[SYNTHETIC] League Organizer',
    startDays: -30,
    endDays: 60,
    links: [{ url: 'https://example.org/synthetic-fixture/league', label: 'Web soutěže (ukázka)' }],
    published: true,
    // The English description stays a private draft: the English page shows the explicit absence.
    description: { cs: { published: true }, en: { published: false } },
    matchSlugs: [FIXTURE_SLUGS.matches.hllHistorical],
  },
  {
    slug: FIXTURE_SLUGS.tournaments.finished,
    game: 'hell-let-loose',
    name: '[SYNTHETIC] Valkyria Spring Cup',
    season: 'Jaro 2026',
    organizer: null,
    startDays: -200,
    endDays: -150,
    links: [],
    published: true,
    description: { cs: { published: true }, en: { published: true } },
    matchSlugs: [],
  },
  {
    slug: FIXTURE_SLUGS.tournaments.draft,
    game: 'hell-let-loose',
    name: '[SYNTHETIC] Draft Cup',
    season: null,
    organizer: null,
    startDays: null,
    endDays: null,
    links: [],
    published: false,
    description: { cs: { published: false } },
    matchSlugs: [],
  },
];

export function tournamentDescription(fixture: FixtureTournament, locale: Locale) {
  return locale === 'cs'
    ? doc(
        p(bold('[Ukázka] '), `Syntetický popis soutěže ${fixture.name}. Nejde o skutečný turnaj.`),
        h2('Pravidla'),
        ul('Syntetické pravidlo jedna', 'Syntetické pravidlo dva'),
        h2('Tabulka (stav k ukázkovému datu)'),
        table(
          ['Pořadí', 'Tým', 'Body'],
          [
            ['1', '[SYN] Tým Alfa', '9'],
            ['2', 'Valkyria', '6'],
            ['3', '[SYN] Tým Bravo', '3'],
          ],
        ),
      )
    : doc(
        p(bold('[Sample] '), `Synthetic description of the ${fixture.name} competition. Not a real tournament.`),
        h2('Rules'),
        ul('Synthetic rule one', 'Synthetic rule two'),
        h2('Standings (as of a sample date)'),
        table(
          ['Rank', 'Team', 'Points'],
          [
            ['1', '[SYN] Team Alpha', '9'],
            ['2', 'Valkyria', '6'],
            ['3', '[SYN] Team Bravo', '3'],
          ],
        ),
      );
}

/* --------------------------------------------------------------------- news */

export type FixtureNewsTranslation = {
  slug: string;
  title: string;
  excerpt: string;
  body: ReturnType<typeof doc>;
  /** `published`: live; `draft`: private draft only; `scheduled`: draft + pending schedule. */
  state: 'published' | 'draft' | 'scheduled';
  cover: boolean;
};

export type FixtureNews = {
  key: string;
  category: 'announcement' | 'match-report' | 'community' | 'update';
  tags: (typeof FIXTURE_TAGS)[number]['key'][];
  game: Game | null;
  /** Days before "now" of the publication time (schedule: days after). */
  days: number;
  archived: boolean;
  translations: Partial<Record<Locale, FixtureNewsTranslation>>;
};

const featureBodyCs = doc(
  p(bold('[Ukázka] '), 'Tento syntetický článek ukazuje ', bold('tučné'), ', ', italic('kurzívu'), ', ', underline('podtržení'), ' a ', strike('přeškrtnutí'), '.'),
  p('Odkaz na ', link('bezpečnou externí stránku', 'https://example.org/synthetic-fixture/article'), ' se otevře jako běžný odkaz.'),
  p('Starší odkazy: ', link('servery', 'https://valkyriahll.cz/servery'), ' a ', link('žebříčky', 'https://www.valkyriahll.cz/zebricky'), '.'),
  image(FIXTURE_ASSET_IDS.newsInline, 'Syntetický obrázek v textu článku', 'Syntetický popisek obrázku', 'wide'),
  h2('Ukázková tabulka'),
  table(
    ['Položka', 'Hodnota', 'Poznámka'],
    [
      ['Alfa', '1', 'Syntetická data'],
      ['Bravo', '2', 'Syntetická data'],
      ['Charlie', '3', 'Syntetická data'],
    ],
  ),
  h3('Seznamy'),
  ol('První syntetický krok', 'Druhý syntetický krok'),
  quote(['Syntetická citace pro test typografie.']),
);

const featureBodyEn = doc(
  p(bold('[Sample] '), 'This synthetic article shows ', bold('bold'), ', ', italic('italic'), ', ', underline('underline'), ' and ', strike('strikethrough'), '.'),
  p('A link to a ', link('safe external page', 'https://example.org/synthetic-fixture/article'), ' renders as a normal link.'),
  p('Older links: ', link('servers', 'https://valkyriahll.cz/servery'), ' and ', link('leaderboards', 'https://www.valkyriahll.cz/zebricky'), '.'),
  image(FIXTURE_ASSET_IDS.newsInline, 'Synthetic inline article image', 'Synthetic image caption', 'wide'),
  h2('Sample table'),
  table(
    ['Item', 'Value', 'Note'],
    [
      ['Alpha', '1', 'Synthetic data'],
      ['Bravo', '2', 'Synthetic data'],
      ['Charlie', '3', 'Synthetic data'],
    ],
  ),
  h3('Lists'),
  ol('First synthetic step', 'Second synthetic step'),
  quote(['A synthetic quote for typography testing.']),
);

function longBody(locale: Locale) {
  const sections = Array.from({ length: 8 }, (_, i) => i + 1);
  const cs = locale === 'cs';
  return doc(
    p(bold(cs ? '[Ukázka] ' : '[Sample] '), cs ? 'Dlouhý syntetický článek pro test čitelnosti a rozvržení.' : 'A long synthetic article for readability and layout testing.'),
    ...sections.flatMap((n) => [
      h2(cs ? `Syntetická kapitola ${n}` : `Synthetic chapter ${n}`),
      p(
        cs
          ? 'Příliš žluťoučký kůň úpěl ďábelské ódy. Tento odstavec je syntetický text, který ověřuje české znaky, zalamování dlouhých řádků a rytmus odstavců v delším článku.'
          : 'The quick brown fox jumps over the lazy dog. This paragraph is synthetic text that checks line wrapping and paragraph rhythm in a longer article.',
      ),
      ...(n % 3 === 0 ? [ul(cs ? 'Syntetická odrážka A' : 'Synthetic bullet A', cs ? 'Syntetická odrážka B' : 'Synthetic bullet B')] : []),
      ...(n % 4 === 0 ? [quote([cs ? 'Syntetická citace uprostřed článku.' : 'A synthetic quote in the middle of the article.']), hr()] : []),
      ...(n === 2 ? [image(FIXTURE_ASSET_IDS.squareLogo, cs ? 'Syntetické čtvercové logo' : 'Synthetic square logo')] : []),
      ...(n === 5 ? [image(FIXTURE_ASSET_IDS.smallImage, cs ? 'Syntetický malý obrázek' : 'Synthetic small image', cs ? 'Syntetický popisek malého obrázku' : 'Synthetic small image caption')] : []),
      ...(n === 7 ? [image(FIXTURE_ASSET_IDS.portraitPhoto, cs ? 'Syntetická fotografie na výšku' : 'Synthetic portrait photo', cs ? 'Syntetická fotografie na výšku' : 'Synthetic portrait photo')] : []),
    ]),
  );
}

function simpleBody(locale: Locale, title: string) {
  return locale === 'cs'
    ? doc(p(bold('[Ukázka] '), `${title}: syntetický obsah pro vývoj a testy.`), p('Nejde o skutečnou zprávu komunity.'))
    : doc(p(bold('[Sample] '), `${title}: synthetic content for development and tests.`), p('This is not a real community announcement.'));
}

const CATEGORIES = ['announcement', 'match-report', 'community', 'update'] as const;
const GAME_CYCLE: (Game | null)[] = ['wardogs', 'hell-let-loose', null];

export const FIXTURE_NEWS: FixtureNews[] = [
  {
    key: 'feature',
    category: 'announcement',
    tags: ['fixture-wardogs', 'fixture-guide'],
    game: 'wardogs',
    days: 1,
    archived: false,
    translations: {
      cs: {
        slug: FIXTURE_SLUGS.news.featureCs,
        title: '[Ukázka] Obrázky, tabulka a odkazy',
        excerpt: 'Syntetický článek s titulním obrázkem, obrázkem v textu, tabulkou a odkazem.',
        body: featureBodyCs,
        state: 'published',
        cover: true,
      },
      en: {
        slug: FIXTURE_SLUGS.news.featureEn,
        title: '[Sample] Images, table and links',
        excerpt: 'A synthetic article with a cover, an inline image, a table and a link.',
        body: featureBodyEn,
        state: 'published',
        cover: true,
      },
    },
  },
  {
    key: 'cs-only',
    category: 'community',
    tags: [],
    game: null,
    days: 2,
    archived: false,
    translations: {
      cs: {
        slug: FIXTURE_SLUGS.news.csOnly,
        title: '[Ukázka] Článek pouze v češtině',
        excerpt: 'Syntetický článek bez anglického překladu.',
        body: simpleBody('cs', 'Článek pouze v češtině'),
        state: 'published',
        cover: false,
      },
    },
  },
  {
    key: 'en-draft',
    category: 'update',
    tags: [],
    game: null,
    days: 3,
    archived: false,
    translations: {
      cs: {
        slug: FIXTURE_SLUGS.news.withEnDraftCs,
        title: '[Ukázka] Článek s anglickým konceptem',
        excerpt: 'Česká verze je zveřejněná, anglická je jen soukromý koncept.',
        body: simpleBody('cs', 'Článek s anglickým konceptem'),
        state: 'published',
        cover: false,
      },
      en: {
        slug: FIXTURE_SLUGS.news.withEnDraftEn,
        title: '[Sample] Private English draft',
        excerpt: 'Unpublished English draft that must never appear publicly.',
        body: simpleBody('en', 'Private English draft'),
        state: 'draft',
        cover: false,
      },
    },
  },
  {
    key: 'scheduled',
    category: 'announcement',
    tags: ['fixture-wardogs'],
    game: 'wardogs',
    days: -3,
    archived: false,
    translations: {
      cs: {
        slug: FIXTURE_SLUGS.news.scheduledCs,
        title: '[Ukázka] Naplánovaný článek',
        excerpt: 'Syntetický článek čekající na naplánované zveřejnění.',
        body: simpleBody('cs', 'Naplánovaný článek'),
        state: 'scheduled',
        cover: false,
      },
    },
  },
  {
    key: 'long-form',
    category: 'community',
    tags: ['fixture-guide'],
    game: null,
    days: 4,
    archived: false,
    translations: {
      cs: {
        slug: FIXTURE_SLUGS.news.longFormCs,
        title: '[Ukázka] Dlouhý článek pro test čitelnosti',
        excerpt: 'Syntetický dlouhý text s mnoha kapitolami.',
        body: longBody('cs'),
        state: 'published',
        cover: true,
      },
      en: {
        slug: FIXTURE_SLUGS.news.longFormEn,
        title: '[Sample] Long-form readability article',
        excerpt: 'Synthetic long text with many chapters.',
        body: longBody('en'),
        state: 'published',
        cover: true,
      },
    },
  },
  {
    key: 'archived',
    category: 'update',
    tags: [],
    game: null,
    days: 40,
    archived: true,
    translations: {
      cs: {
        slug: FIXTURE_SLUGS.news.archivedCs,
        title: '[Ukázka] Archivovaný článek',
        excerpt: 'Syntetický archivovaný článek, který není veřejný.',
        body: simpleBody('cs', 'Archivovaný článek'),
        state: 'published',
        cover: false,
      },
    },
  },
  ...FIXTURE_SLUGS.news.listingCs.map((slug, i): FixtureNews => {
    const n = String(i + 1).padStart(2, '0');
    const enSlug = FIXTURE_SLUGS.news.listingEn[i];
    return {
      key: `listing-${n}`,
      category: CATEGORIES[i % CATEGORIES.length]!,
      tags: i % 2 === 0 ? ['fixture-hll'] : [],
      game: GAME_CYCLE[i % GAME_CYCLE.length]!,
      days: 5 + i,
      archived: false,
      translations: {
        cs: {
          slug,
          title: `[Ukázka] Syntetická novinka ${n}`,
          excerpt: `Syntetická novinka číslo ${n} pro stránkování a filtry.`,
          body: simpleBody('cs', `Syntetická novinka ${n}`),
          state: 'published',
          cover: false,
        },
        ...(enSlug
          ? {
              en: {
                slug: enSlug,
                title: `[Sample] Synthetic news ${n}`,
                excerpt: `Synthetic news item ${n} for pagination and filters.`,
                body: simpleBody('en', `Synthetic news ${n}`),
                state: 'published' as const,
                cover: false,
              },
            }
          : {}),
      },
    };
  }),
];

/* ------------------------------------------------------------ field manual */

export const FIXTURE_MANUAL_SLUGS = {
  setupCs: 'ukazka-prvni-nastaveni',
  setupEn: 'sample-first-setup',
  squadLeaderCs: 'ukazka-velitel-druzstva',
  calloutsCs: 'ukazka-hlaseni-nepritele',
  calloutsEn: 'sample-enemy-callouts',
  tankCs: 'ukazka-posadka-tanku',
  tankEnDraft: 'sample-tank-crew-draft',
  draftCs: 'ukazka-koncept-spawny',
} as const;

export type FixtureManual = {
  key: string;
  /** Seeded HLL manual category key. */
  category: 'getting-started' | 'communication' | 'roles' | 'leadership' | 'vehicles' | 'spawns';
  sortOrder: number;
  days: number;
  meta: { sourceUrl: string | null; sourcePublishedOn: string | null; sourceLanguage: 'cs' | 'sk' | 'en' | null; credits: string; reviewed: boolean };
  translations: Partial<Record<Locale, Omit<FixtureNewsTranslation, 'state'> & { state: 'published' | 'draft' }>>;
};

function manualBody(locale: Locale, topic: string, steps: number) {
  const cs = locale === 'cs';
  return doc(
    p(bold(cs ? '[Ukázka] ' : '[Sample] '), cs ? `${topic}: syntetický návod pro vývoj a testy příručky.` : `${topic}: a synthetic guide for field manual development and tests.`),
    h2(cs ? 'Příprava' : 'Preparation'),
    p(
      cs
        ? 'Příliš žluťoučký kůň úpěl ďábelské ódy. Syntetický odstavec ověřuje české znaky, zalamování a čitelnost delšího textu v příručce.'
        : 'The quick brown fox jumps over the lazy dog. A synthetic paragraph that checks wrapping and readability of longer manual text.',
    ),
    h2(cs ? 'Postup krok za krokem' : 'Step by step'),
    ol(...Array.from({ length: steps }, (_, i) => (cs ? `Syntetický krok ${i + 1}` : `Synthetic step ${i + 1}`))),
    h3(cs ? 'Časté chyby' : 'Common mistakes'),
    ul(cs ? 'Syntetická chyba A' : 'Synthetic mistake A', cs ? 'Syntetická chyba B' : 'Synthetic mistake B'),
    h2(cs ? 'Shrnutí' : 'Summary'),
    p(cs ? 'Nejde o skutečný návod klanu Valkyria.' : 'This is not a real Valkyria guide.'),
  );
}

const SYNTHETIC_SOURCE = 'https://example.org/synthetic-fixture/field-manual';

export const FIXTURE_MANUAL: FixtureManual[] = [
  {
    key: 'setup',
    category: 'getting-started',
    sortOrder: 10,
    days: 3,
    meta: { sourceUrl: SYNTHETIC_SOURCE, sourcePublishedOn: '2021-03-14', sourceLanguage: 'cs', credits: 'Syntetický autor A, Syntetický autor B', reviewed: true },
    translations: {
      cs: {
        slug: FIXTURE_MANUAL_SLUGS.setupCs,
        title: '[Ukázka] První nastavení hry',
        excerpt: 'Syntetický návod: grafika, zvuk a ovládání před prvním nasazením.',
        body: manualBody('cs', 'První nastavení hry', 4),
        cover: true,
        state: 'published',
      },
      en: {
        slug: FIXTURE_MANUAL_SLUGS.setupEn,
        title: '[Sample] First game setup',
        excerpt: 'Synthetic guide: graphics, audio and controls before the first deployment.',
        body: manualBody('en', 'First game setup', 4),
        cover: true,
        state: 'published',
      },
    },
  },
  {
    key: 'squad-leader',
    category: 'roles',
    sortOrder: 10,
    days: 4,
    meta: { sourceUrl: null, sourcePublishedOn: null, sourceLanguage: null, credits: '', reviewed: false },
    translations: {
      cs: {
        slug: FIXTURE_MANUAL_SLUGS.squadLeaderCs,
        title: '[Ukázka] Velitel družstva',
        excerpt: 'Syntetický návod pro roli velitele družstva: komunikace, garrisony a outposty.',
        body: manualBody('cs', 'Velitel družstva', 5),
        cover: false,
        state: 'published',
      },
    },
  },
  {
    key: 'callouts',
    category: 'communication',
    sortOrder: 10,
    days: 5,
    meta: { sourceUrl: null, sourcePublishedOn: null, sourceLanguage: 'en', credits: 'Synthetic contributor', reviewed: false },
    translations: {
      cs: {
        slug: FIXTURE_MANUAL_SLUGS.calloutsCs,
        title: '[Ukázka] Hlášení nepřítele',
        excerpt: 'Syntetický návod: směr, vzdálenost a typ cíle v jedné větě.',
        body: manualBody('cs', 'Hlášení nepřítele', 3),
        cover: false,
        state: 'published',
      },
      en: {
        slug: FIXTURE_MANUAL_SLUGS.calloutsEn,
        title: '[Sample] Enemy callouts',
        excerpt: 'Synthetic guide: direction, distance and target type in one sentence.',
        body: manualBody('en', 'Enemy callouts', 3),
        cover: false,
        state: 'published',
      },
    },
  },
  {
    key: 'tank-crew',
    category: 'vehicles',
    sortOrder: 10,
    days: 6,
    meta: { sourceUrl: SYNTHETIC_SOURCE, sourcePublishedOn: '2022-11-02', sourceLanguage: 'sk', credits: 'Syntetický autor C', reviewed: false },
    translations: {
      cs: {
        slug: FIXTURE_MANUAL_SLUGS.tankCs,
        title: '[Ukázka] Posádka tanku',
        excerpt: 'Syntetický návod: řidič, střelec a velitel tanku.',
        body: manualBody('cs', 'Posádka tanku', 3),
        cover: false,
        state: 'published',
      },
      en: {
        slug: FIXTURE_MANUAL_SLUGS.tankEnDraft,
        title: '[Sample] Tank crew (private draft)',
        excerpt: 'Synthetic private English draft; never public.',
        body: manualBody('en', 'Tank crew', 3),
        cover: false,
        state: 'draft',
      },
    },
  },
  {
    key: 'spawns-draft',
    category: 'spawns',
    sortOrder: 10,
    days: 2,
    meta: { sourceUrl: null, sourcePublishedOn: null, sourceLanguage: null, credits: '', reviewed: false },
    translations: {
      cs: {
        slug: FIXTURE_MANUAL_SLUGS.draftCs,
        title: '[Ukázka] Soukromý koncept o spawnech',
        excerpt: 'Syntetický soukromý koncept; nikdy není veřejný ani v hledání.',
        body: manualBody('cs', 'Soukromý koncept', 2),
        cover: false,
        state: 'draft',
      },
    },
  },
];
