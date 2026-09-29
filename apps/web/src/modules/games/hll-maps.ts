import { HLL_MAPS } from './hll-catalog';
import TACTICAL_BYTES from './hll-map-tactical-bytes.json';

/**
 * Map identity for artwork. Every entry of the application vocabulary (`HLL_MAPS`) maps
 * explicitly to one folder of the owner-supplied map pack
 * (assets/design-packs/valkyria-2026-09-29, docs/assets/graphics-pack-2026-09-29.md).
 * Recognised inputs: the proper name with or without diacritics/punctuation, reviewed
 * aliases, CRCON map IDs and tags, and layer names built from those plus a bounded
 * vocabulary (`carentan_warfare_night`, `PHL_L_1944_Warfare`, `CT_warfare`,
 * `Carentan Warfare (Night)`). Anything else — typos, extra words, partial names — is
 * unknown and gets no artwork: another map's image is worse than none.
 */
export type HllMapName = (typeof HLL_MAPS)[number];

type MapIdentity = {
  /** Folder under `/images/hll/maps/` (the pack's slug). */
  slug: string;
  /** CRCON map IDs (`current_map.map.map.id`) and layer prefixes. */
  ids: readonly string[];
  /** Short codes of the pack catalog, also used as layer prefixes (`CAR_S_1944_Day_P_Skirmish`, `CT_warfare`). */
  tags: readonly string[];
  /** Other reviewed spellings, e.g. the in-game names with diacritics. */
  aliases: readonly string[];
};

const IDENTITY: Readonly<Record<HllMapName, MapIdentity>> = {
  Carentan: { slug: 'carentan', ids: ['carentan'], tags: ['CAR', 'CT'], aliases: [] },
  Driel: { slug: 'driel', ids: ['driel'], tags: ['DRL', 'DRI'], aliases: [] },
  'El Alamein': { slug: 'el-alamein', ids: ['elalamein'], tags: ['ELA'], aliases: [] },
  'Elsenborn Ridge': { slug: 'elsenborn-ridge', ids: ['elsenbornridge'], tags: ['EBR'], aliases: ['Elsenborn'] },
  Foy: { slug: 'foy', ids: ['foy'], tags: ['FOY'], aliases: [] },
  'Hill 400': { slug: 'hill-400', ids: ['hill400'], tags: ['H4'], aliases: [] },
  'Hurtgen Forest': { slug: 'hurtgen-forest', ids: ['hurtgenforest'], tags: ['HUR'], aliases: ['Hürtgen Forest', 'Hürtgenwald', 'Hurtgen'] },
  'Juno Beach': { slug: 'juno-beach', ids: ['junobeach'], tags: ['JUN'], aliases: ['Juno'] },
  Kharkov: { slug: 'kharkov', ids: ['kharkov'], tags: ['KHA'], aliases: [] },
  Kursk: { slug: 'kursk', ids: ['kursk'], tags: ['KUR'], aliases: [] },
  Mortain: { slug: 'mortain', ids: ['mortain'], tags: ['MOR'], aliases: [] },
  'Omaha Beach': { slug: 'omaha-beach', ids: ['omahabeach'], tags: ['OMA'], aliases: ['Omaha'] },
  'Purple Heart Lane': { slug: 'purple-heart-lane', ids: ['purpleheartlane'], tags: ['PHL'], aliases: [] },
  Remagen: { slug: 'remagen', ids: ['remagen'], tags: ['REM'], aliases: [] },
  Smolensk: { slug: 'smolensk', ids: ['smolensk'], tags: ['SMO'], aliases: [] },
  'St. Marie Du Mont': {
    slug: 'sainte-marie-du-mont',
    ids: ['stmariedumont'],
    tags: ['SMDM', 'SMM'],
    aliases: ['Sainte-Marie-du-Mont', 'Ste. Marie du Mont', 'St. Marie-du-Mont', 'S. Marie du Mont'],
  },
  'St. Mere Eglise': {
    slug: 'sainte-mere-eglise',
    ids: ['stmereeglise'],
    tags: ['SME'],
    aliases: ['Sainte-Mère-Église', 'Ste. Mère Église', 'St. Mère Église', 'St. Mère-Église', 'S. Mère Église'],
  },
  Stalingrad: { slug: 'stalingrad', ids: ['stalingrad'], tags: ['STA'], aliases: [] },
  Tobruk: { slug: 'tobruk', ids: ['tobruk'], tags: ['TOB'], aliases: [] },
  'Utah Beach': { slug: 'utah-beach', ids: ['utahbeach'], tags: ['UTA'], aliases: ['Utah'] },
};

/**
 * Words allowed after a map in a layer ID or layer name: modes, attacking factions,
 * environment variants and the `<TAG>_<S|L>_<year>_…_P_…` grammar of newer layers.
 */
const LAYER_WORDS = new Set([
  'warfare', 'offensive', 'off', 'skirmish', 'control', 'conquest',
  'offensiveus', 'offensiveger', 'offensiverus', 'offensivebritish', 'offensivecw', 'offensivegb',
  'us', 'ger', 'rus', 'gb', 'cw', 'british',
  'day', 'night', 'dusk', 'dawn', 'morning', 'overcast', 'rain', 'snow', 'fog', 'storm', 'v2',
  's', 'l', 'p', '1941', '1942', '1943', '1944', '1945',
]);

const MAX_INPUT = 80;
/** Letters, digits, spaces and the punctuation real map/layer names use; no paths or markup. */
const PLAIN = /^[\p{L}\p{N} .'’()\-–_]+$/u;

/** Case, diacritics, dots/apostrophes and word separators do not matter; letters and word order do. */
function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
const words = (value: string) => fold(value).replace(/[.'’()]/g, ' ').split(/[\s\-–]+/).filter(Boolean);
const key = (value: string) => words(value).join(' ');

const EXACT = new Map<string, HllMapName>();
const PREFIX = new Map<string, HllMapName>();
for (const name of HLL_MAPS) {
  const identity = IDENTITY[name];
  for (const entry of [name, ...identity.aliases, ...identity.ids, ...identity.tags]) {
    const folded = key(entry);
    const previous = EXACT.get(folded);
    if (previous && previous !== name) throw new Error(`Ambiguous HLL map key ${folded}`);
    EXACT.set(folded, name);
  }
  for (const entry of [...identity.ids, ...identity.tags]) PREFIX.set(key(entry), name);
}

/** Layer ID: known map ID/code, then only known layer words (`hurtgenforest_warfare_V2_night`). */
function fromLayerId(value: string): HllMapName | null {
  const parts = fold(value).split('_');
  if (parts.length < 2 || parts.some((part) => !/^[a-z0-9]+$/.test(part))) return null;
  const map = PREFIX.get(parts[0]!);
  if (!map) return null;
  return parts.slice(1).every((part) => LAYER_WORDS.has(part)) ? map : null;
}

/** Layer name: a whole map name, then only known layer words (`St. Mere Eglise Offensive`). */
function fromLayerName(value: string): HllMapName | null {
  const list = words(value);
  for (let end = list.length - 1; end > 0; end--) {
    const map = EXACT.get(list.slice(0, end).join(' '));
    if (!map) continue;
    return list.slice(end).every((word) => LAYER_WORDS.has(word)) ? map : null;
  }
  return null;
}

/** The application map name for a stored/observed value, or `null` when it is not recognised. */
export function resolveHllMap(value: string | null | undefined): HllMapName | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.normalize('NFC').trim();
  if (!trimmed || trimmed.length > MAX_INPUT || !PLAIN.test(trimmed)) return null;
  const exact = EXACT.get(key(trimmed));
  if (exact) return exact;
  return trimmed.includes('_') ? fromLayerId(trimmed) : fromLayerName(trimmed);
}

export type HllMapImage = Readonly<{ src: string; width: number; height: number }>;

/**
 * Shipped derivatives of one map (apps/web/public/images/hll/maps/<slug>/, registered in
 * assets/manifest.json). Day/night and other layers share one base illustration.
 */
export type HllMapArtwork = Readonly<{
  map: HllMapName;
  slug: string;
  /** 160×90 list thumbnail (decorative next to the textual map name). */
  thumb: HllMapImage;
  /** Original 718×404 in-game scene. */
  scene: HllMapImage;
  /** 1024×1024 tactical map, loaded only when a visitor asks for it (size generated by scripts/media/derive-graphics-pack.mjs). */
  tactical: HllMapImage & { bytes: number };
}>;

export function hllMapArtwork(value: string | null | undefined): HllMapArtwork | null {
  const map = resolveHllMap(value);
  if (!map) return null;
  const { slug } = IDENTITY[map];
  const base = `/images/hll/maps/${slug}`;
  return {
    map,
    slug,
    thumb: { src: `${base}/thumb-160x90.webp`, width: 160, height: 90 },
    scene: { src: `${base}/scene-718x404.webp`, width: 718, height: 404 },
    tactical: { src: `${base}/tactical-1024.webp`, width: 1024, height: 1024, bytes: (TACTICAL_BYTES as Readonly<Record<string, number>>)[slug] ?? 0 },
  };
}

/** Pack slug of every application map (for asset checks and tests). */
export function hllMapSlugs(): ReadonlyArray<{ map: HllMapName; slug: string }> {
  return HLL_MAPS.map((map) => ({ map, slug: IDENTITY[map].slug }));
}
