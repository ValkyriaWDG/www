import assert from 'node:assert/strict';
import {MAPS,resolveMap,getMapAssets} from './map-assets.mjs';
for (const m of MAPS) for (const alias of [m.id,m.name,m.code,...m.aliases]) assert.equal(resolveMap(alias)?.id,m.id,alias);
for (const [input,id] of [['carentan_warfare_night','carentan'],['stmereeglise_warfare','sainte-mere-eglise'],['stmariedumont_offensive_us','sainte-marie-du-mont'],['HLL_L_Smolensk_Warfare','smolensk'],['foy_warfare','foy']]) assert.equal(resolveMap(input)?.id,id,input);
assert.equal(resolveMap(''),null);assert.equal(resolveMap('unknown-map'),null);
assert.equal(getMapAssets('Carentan').assets['server-card'],'/assets/hll-maps/carentan/server-card-640x360.webp');
assert.equal(getMapAssets('Carentan','/my-maps/').assets.article,'/my-maps/carentan/article-1200x630.webp');
console.log(`OK: ${MAPS.length} maps + all aliases + sample layer identifiers`);
