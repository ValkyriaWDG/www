import { describe, expect, it } from 'vitest';
import { getHllManualArtwork } from './artwork';

describe('HLL manual artwork selection', () => {
  it.each([
    ['getting-started', '/images/hll/getting-started.webp'],
    ['objectives-and-modes', '/images/hll/objectives-and-modes.webp'],
    ['roles-and-equipment', '/images/hll/roles-and-equipment.webp'],
    ['communication', '/images/hll/communication.webp'],
    ['logistics-and-vehicles', '/images/hll/logistics-and-vehicles.webp'],
    ['armor-and-artillery', '/images/hll/armor-and-artillery.webp'],
    ['spawns-and-engineering', '/images/hll/spawns-and-engineering.webp'],
    ['squad-leader-fieldcraft', '/images/hll/squad-leader-fieldcraft.webp'],
    ['roles', '/images/hll/roles-and-equipment.webp'],
    ['vehicles', '/images/hll/logistics-and-vehicles.webp'],
    ['spawns', '/images/hll/spawns-and-engineering.webp'],
    ['leadership', '/images/hll/squad-leader-fieldcraft.webp'],
  ])('provides decorative artwork for the supported category %s', (key, src) => {
    expect(getHllManualArtwork('hll', key)?.src).toBe(src);
  });

  it('does not apply HLL art to a Wardogs category with the same name', () => {
    expect(getHllManualArtwork('wardogs', 'getting-started')).toBeNull();
    expect(getHllManualArtwork('wardogs', 'roles')).toBeNull();
  });

  it.each([undefined, '', 'unknown-category', '../news', 'constructor', '__proto__', 'toString'])('keeps unknown category %s text-only', (key) => {
    expect(getHllManualArtwork('hll', key)).toBeNull();
  });
});
