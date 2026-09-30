/**
 * Reviewed manifest of the legacy HLL website (valkyriahll.cz), from the bounded public
 * inventory in docs/product/hll/legacy-migration.md (observed 28 September 2026). It is
 * reference data for redirects and draft imports only: no legacy body text, images,
 * member rows or statistics are copied into this repository.
 */

export const LEGACY_HLL_ORIGIN = 'https://valkyriahll.cz';

const LEGACY_HLL_HOSTS: ReadonlySet<string> = new Set(['valkyriahll.cz', 'www.valkyriahll.cz']);

/** True for a URL on the former HLL website, which public pages neither link nor mention. */
export function isLegacyHllUrl(href: string): boolean {
  const url = URL.parse(href);
  return Boolean(url && (url.protocol === 'https:' || url.protocol === 'http:') && LEGACY_HLL_HOSTS.has(url.hostname.toLowerCase()));
}

export type LegacyGuide = {
  /** Exact legacy slug under `/guide/`, reused as the Czech field manual slug. */
  slug: string;
  /** Working Czech title for the draft shell; the editor confirms it against the source. */
  workingTitle: string;
  /** Seeded HLL manual category key. */
  category: 'getting-started' | 'communication' | 'roles' | 'leadership' | 'vehicles' | 'spawns';
  sortOrder: number;
  /** Source date shown on the legacy page (ISO date). */
  sourcePublishedOn: string;
  sourceLanguage: 'cs' | 'sk';
  /** Source attribution as published on the legacy page (not member profiles). */
  credits: string;
  /** Editorial notes carried into the migration checklist. */
  notes: string;
};

export const LEGACY_GUIDES: readonly LegacyGuide[] = [
  {
    slug: 'zakladni-nastaveni',
    workingTitle: 'Základní nastavení',
    category: 'getting-started',
    sortOrder: 10,
    sourcePublishedOn: '2024-06-08',
    sourceLanguage: 'cs',
    credits: '',
    notes: 'Windows, display, NVIDIA and game settings; startup optimisation. Review dated driver/game options.',
  },
  {
    slug: 'herni-mody',
    workingTitle: 'Herní módy',
    category: 'getting-started',
    sortOrder: 20,
    sourcePublishedOn: '2024-06-08',
    sourceLanguage: 'cs',
    credits: '',
    notes: 'Warfare, Offensive, Skirmish, phases and victory conditions.',
  },
  {
    slug: 'role',
    workingTitle: 'Role',
    category: 'roles',
    sortOrder: 10,
    sourcePublishedOn: '2024-06-09',
    sourceLanguage: 'cs',
    credits: '',
    notes: 'Commander, infantry, recon, armour and artillery; commander ability table (cost/cooldown) needs a current game-version review.',
  },
  {
    slug: 'vozidla',
    workingTitle: 'Vozidla',
    category: 'vehicles',
    sortOrder: 10,
    sourcePublishedOn: '2024-02-28',
    sourceLanguage: 'cs',
    credits: '',
    notes: 'Transport/supply trucks, jeeps, repair and resupply.',
  },
  {
    slug: 'tanky',
    workingTitle: 'Tanky',
    category: 'vehicles',
    sortOrder: 20,
    sourcePublishedOn: '2025-01-25',
    sourceLanguage: 'sk',
    credits: 'Ninjonik',
    notes: 'Slovak body. Links The Line’s Tank Bible and externally hosted illustrations: record reuse status per image before copying.',
  },
  {
    slug: 'spawny',
    workingTitle: 'Spawny',
    category: 'spawns',
    sortOrder: 10,
    sourcePublishedOn: '2024-06-17',
    sourceLanguage: 'cs',
    credits: '',
    notes: 'HQ, garrisons, outposts, airheads and halftracks. Keep operational spawn locations in authorised Logi context.',
  },
  {
    slug: 'gameplay',
    workingTitle: 'Gameplay',
    category: 'communication',
    sortOrder: 10,
    sourcePublishedOn: '2024-02-28',
    sourceLanguage: 'cs',
    credits: '',
    notes: 'Communication, markers/pings and map icons. Marked under construction at the source: do not invent missing material.',
  },
  {
    slug: 'prirucka-sl',
    workingTitle: 'Příručka velitele družstva (SL)',
    category: 'leadership',
    sortOrder: 10,
    sourcePublishedOn: '2024-06-08',
    sourceLanguage: 'cs',
    credits: 'Sandiary, Tryfid-GA, Larry, Kelly',
    notes: 'Squad leadership, terminology, spawns, command communication, defence, movement and coordination. Keep the contributors’ roles as credited at the source.',
  },
];

/** Legacy `/clanky/<slug>` articles and their canonical scope (redirect targets once imported). */
export const LEGACY_NEWS: Readonly<Record<string, string>> = {
  'wardogs-oznameni': '/cs/wardogs/news/wardogs-oznameni',
  'sobotni-verejna-akce': '/cs/hll/news/sobotni-verejna-akce',
  'sbirka-2026': '/cs/news/sbirka-2026',
  'ecl-2025-a-ghc-2025-aktualne': '/cs/hll/news/ecl-2025-a-ghc-2025-aktualne',
  'oznameni-23-04-2025': '/cs/hll/news/oznameni-23-04-2025',
  'vlk-push-ecl-2025-jaro-1': '/cs/hll/news/vlk-push-ecl-2025-jaro-1',
  'vlk-fll-ecl-2025-jaro-1': '/cs/hll/news/vlk-fll-ecl-2025-jaro-1',
  'uvod-ecl-2025-jaro': '/cs/hll/news/uvod-ecl-2025-jaro',
  'jak-ziskat-vip': '/cs/hll/news/jak-ziskat-vip',
};

export const LEGACY_TOURNAMENTS = [
  'ecl-2026-fall',
  'ecl-2026-spring',
  'ecl-2025-fall',
  'hca-fap-2025',
  'greyhound-skirmish-cup-2025',
  'ecl-2025-spring',
  'thursday-night-league-eu-season-7',
  'ecl-2024',
] as const;

const LEGACY_RANKINGS: Readonly<Record<string, string>> = {
  zabiti: 'kills',
  'win-rate': 'win-rate',
  'zabiti-za-minutu': 'kills-per-minute',
  'kd-pomer': 'kd-ratio',
  'serie-zabiti': 'kill-streak',
  teamkills: 'teamkills',
  'herni-cas': 'playtime',
  vyhry: 'wins',
  'capture-points': 'capture-points',
};

const LEGACY_SERVER_IDS = new Set(['1', '6']);

/**
 * - `redirect`: permanent redirect to an implemented canonical route (Czech; the legacy
 *   site has no English URLs, and English is never an automatic Czech redirect).
 * - `lookup`: an allowed detail shape; resolve its import identity against a currently
 *   published target. A matching path alone does not prove that content is public.
 * - `pending`: a reviewed legacy URL whose destination is not built or whose content is
 *   not imported yet. It must not be redirected to Home; keep the legacy page until the
 *   destination exists.
 * - `null`: not a known legacy URL (404, never a blanket prefix substitution).
 */
export type LegacyResolution =
  | { kind: 'redirect'; target: string }
  | { kind: 'lookup'; sourceKind: 'news' | 'manual' | 'page' | 'match' | 'tournament'; sourceKey: string }
  | { kind: 'pending'; proposed: string; reason: 'destination_not_built' | 'content_not_imported' | 'needs_id_alias' }
  | null;

function pending(proposed: string, reason: Extract<LegacyResolution, { kind: 'pending' }>['reason']): LegacyResolution {
  return { kind: 'pending', proposed, reason };
}

/**
 * Resolves one legacy path (and query) against the reviewed manifest. Pagination of the
 * legacy lists is not carried over because page sizes differ; the history intent of
 * `/matches?page=N` maps to the results view. Fragments never reach the server; manual
 * articles derive their own heading anchors.
 */
export function resolveLegacyHllPath(pathname: string, search: URLSearchParams = new URLSearchParams()): LegacyResolution {
  if (pathname.length > 160 || !pathname.startsWith('/') || pathname.includes('//') || /[\\?#%\s]/.test(pathname)) return null;
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  const segments = path.split('/').filter(Boolean);
  if (segments.some((segment) => segment.length > 120 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(segment)) || segments.length > 2) return null;
  const [first, second] = segments;

  if (!first) return { kind: 'redirect', target: '/cs/hll' };
  if (second === undefined) {
    switch (first) {
      case 'servery':
        return { kind: 'redirect', target: '/cs/hll/servers' };
      case 'matches':
        return { kind: 'redirect', target: search.has('page') ? '/cs/hll/matches?view=results' : '/cs/hll/matches' };
      case 'guide':
        return { kind: 'redirect', target: '/cs/hll/field-manual' };
      case 'clanky':
        return { kind: 'redirect', target: '/cs/hll/news' };
      case 'about':
        return { kind: 'lookup', sourceKind: 'page', sourceKey: 'about' };
      case 'faq':
        return { kind: 'lookup', sourceKind: 'page', sourceKey: 'faq' };
      case 'events':
        return pending('/cs/hll/events', 'destination_not_built');
      case 'turnaje':
      case 'tournaments':
        return { kind: 'redirect', target: '/cs/hll/tournaments' };
      case 'zebricky':
        return pending('/cs/hll/leaderboards/kills', 'destination_not_built');
      default:
        return null;
    }
  }

  switch (first) {
    case 'guide':
      return { kind: 'lookup', sourceKind: 'manual', sourceKey: second };
    case 'clanky':
      return { kind: 'lookup', sourceKind: 'news', sourceKey: second };
    case 'matches':
      return /^[1-9]\d{0,8}$/.test(second) ? { kind: 'lookup', sourceKind: 'match', sourceKey: second } : null;
    case 'turnaje':
    case 'tournaments':
      return { kind: 'lookup', sourceKind: 'tournament', sourceKey: second };
    case 'zebricky':
      return LEGACY_RANKINGS[second] ? pending(`/cs/hll/leaderboards/${LEGACY_RANKINGS[second]}`, 'destination_not_built') : null;
    case 'stats':
      return LEGACY_SERVER_IDS.has(second) ? pending(`/cs/hll/servers/${second}/stats`, 'destination_not_built') : null;
    default:
      return null;
  }
}
