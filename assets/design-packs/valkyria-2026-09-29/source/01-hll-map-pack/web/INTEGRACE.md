# Zapojení do webu

1. Zkopíruj `../maps/` do `public/assets/hll-maps/` (cesta je příklad).
2. Vlož `map-assets.mjs` mezi své frontendové utility.
3. Použij existující obrázek místo generování grafiky při každém načtení.

```js
import { getMapAssets } from './map-assets.mjs';
const map = getMapAssets('carentan_warfare_night');
// map.assets['server-card'] => /assets/hll-maps/carentan/server-card-640x360.webp
```

```jsx
const map = getMapAssets(server.map);
return map ? (
  <img src={map.assets['server-card']} alt={map.name}
       width={640} height={360} loading="lazy" />
) : <span>{server.map}</span>;
```

Názvy map a běžné layer názvy se normalizují; nejde o kompletní validátor každého herního režimu. Neznámá hodnota vrací `null`. Pro live počet hráčů, režim, status a aktuální skóre vykresli samostatné HTML nad obrázek podle vlastních serverových dat. Do hotových karet nejsou vypáleny vymyšlené živé statistiky.

Den/noc/sníh/mlha jedné mapy sdílejí základní grafiku. Renderer nevydává denní fotografii za nový noční screenshot.

Test bez dalších balíčků: `node test-map-assets.mjs`.

`renderer-source.js` je zdroj rendereru z EDITOR.html; očekává blok `asset-data`, který je vložen v editoru. Pro běžné použití statických obrázků jej nepotřebuješ.
