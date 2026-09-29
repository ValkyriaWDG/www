import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { HLL_MAPS } from './hll-catalog';
import { hllMapArtwork, hllMapSlugs, resolveHllMap } from './hll-maps';

const PACK_SLUGS = [
  'carentan', 'driel', 'el-alamein', 'elsenborn-ridge', 'foy', 'hill-400', 'hurtgen-forest', 'juno-beach', 'kharkov', 'kursk',
  'mortain', 'omaha-beach', 'purple-heart-lane', 'remagen', 'sainte-marie-du-mont', 'sainte-mere-eglise', 'smolensk', 'stalingrad', 'tobruk', 'utah-beach',
];

describe('HLL map identity for artwork', () => {
  it('maps every application map name to exactly one pack folder', () => {
    const slugs = hllMapSlugs();
    expect(slugs.map((entry) => entry.map)).toEqual([...HLL_MAPS]);
    expect(new Set(slugs.map((entry) => entry.slug)).size).toBe(20);
    expect(slugs.map((entry) => entry.slug).sort()).toEqual([...PACK_SLUGS].sort());
    for (const map of HLL_MAPS) expect(resolveHllMap(map)).toBe(map);
  });

  it.each([
    ['carentan', 'Carentan'],
    ['CARENTAN', 'Carentan'],
    ['  Foy ', 'Foy'],
    ['Hürtgen Forest', 'Hurtgen Forest'],
    ['HÜRTGEN FOREST', 'Hurtgen Forest'],
    ['Hurtgen', 'Hurtgen Forest'],
    ['Sainte-Mère-Église', 'St. Mere Eglise'],
    ['SAINTE-MÈRE-ÉGLISE', 'St. Mere Eglise'],
    ['St Mere Eglise', 'St. Mere Eglise'],
    ['Sainte-Marie-du-Mont', 'St. Marie Du Mont'],
    ['St. Marie du Mont', 'St. Marie Du Mont'],
    ['hill 400', 'Hill 400'],
    ['HILL400', 'Hill 400'],
    ['Juno', 'Juno Beach'],
    ['Omaha', 'Omaha Beach'],
    ['Elsenborn', 'Elsenborn Ridge'],
    ['PHL', 'Purple Heart Lane'],
    ['SMDM', 'St. Marie Du Mont'],
    ['smdm', 'St. Marie Du Mont'],
    ['H4', 'Hill 400'],
  ])('recognises the name or approved alias %j', (input, map) => {
    expect(resolveHllMap(input)).toBe(map);
  });

  it.each([
    ['carentan_warfare', 'Carentan'],
    ['carentan_warfare_night', 'Carentan'],
    ['carentan_offensive_ger', 'Carentan'],
    ['stmereeglise_warfare', 'St. Mere Eglise'],
    ['stmariedumont_off_us', 'St. Marie Du Mont'],
    ['hurtgenforest_warfare_V2_night', 'Hurtgen Forest'],
    ['hill400_offensive_US', 'Hill 400'],
    ['elalamein_offensive_CW', 'El Alamein'],
    ['mortain_offensiveUS_day', 'Mortain'],
    ['elsenbornridge_warfare_morning', 'Elsenborn Ridge'],
    ['tobruk_offensivebritish_day', 'Tobruk'],
    ['PHL_L_1944_Warfare', 'Purple Heart Lane'],
    ['CAR_S_1944_Day_P_Skirmish', 'Carentan'],
    ['SMDM_S_1944_Night_P_Skirmish', 'St. Marie Du Mont'],
    ['DRL_S_1944_P_Skirmish', 'Driel'],
    ['ELA_S_1942_P_Skirmish', 'El Alamein'],
    ['CT_warfare', 'Carentan'],
    ['H4_warfare', 'Hill 400'],
    ['Carentan Warfare', 'Carentan'],
    ['Carentan Warfare (Night)', 'Carentan'],
    ['St. Mere Eglise Offensive', 'St. Mere Eglise'],
    ['Hill 400 Skirmish', 'Hill 400'],
    ['Sainte-Marie-du-Mont Warfare', 'St. Marie Du Mont'],
  ])('recognises the layer %j (variants share one base illustration)', (input, map) => {
    expect(resolveHllMap(input)).toBe(map);
  });

  it.each([
    null,
    undefined,
    '',
    '   ',
    'carentanTypo',
    'Carentan2',
    'Carent',
    'Carentan Beach',
    'carentan_typo',
    'carentan_warfare_extra',
    'carentan__warfare',
    '_warfare',
    'hill40',
    'hill4000',
    'Hill 400 Hill',
    'Foyer',
    'foywarfare',
    'Omaha Utah',
    'Synthetic Map North',
    'synthetic_warfare',
    'St. Marie',
    'Sainte',
    'Beach',
    'Juno Beach 2',
    '../carentan',
    'carentan/../foy',
    '<carentan>',
    'C a r e n t a n',
    'Car entan',
    'constructor',
    '__proto__',
    'toString',
    'c'.repeat(81),
    'Carentan Warfare ' + 'night '.repeat(20),
  ])('keeps the unknown or near-match value %j without artwork', (input) => {
    expect(resolveHllMap(input)).toBeNull();
    expect(hllMapArtwork(input)).toBeNull();
  });

  it('describes the shipped derivatives with their real dimensions', async () => {
    for (const { map } of hllMapSlugs()) {
      const artwork = hllMapArtwork(map)!;
      for (const image of [artwork.thumb, artwork.scene, artwork.tactical]) {
        const file = path.join(process.cwd(), 'public', image.src);
        expect(existsSync(file), file).toBe(true);
        const metadata = await sharp(file).metadata();
        expect([metadata.format, metadata.width, metadata.height], file).toEqual(['webp', image.width, image.height]);
      }
      expect(artwork.tactical.bytes).toBeGreaterThan(0);
    }
  });
});
