# VALKYRIA — kompletní grafický balík

## Začni tady

Rozbal celý ZIP a otevři **START.html**. Obsahuje přehled všech map, odkaz na mapový editor a odkaz na původní bannery. Nic se neinstaluje a není potřeba internet.

**Hotové obrázky jsou už v balíčku. Editor není povinný krok pro jejich získání.**

## Co je kde

- `01-hll-map-pack`: 20 základních map, 9 hotových grafických formátů pro každou, JPG varianty pro sdílení, upravitelné SVG článku a výsledku, skutečné zdrojové obrázky a editor.
- `02-predchozi-bannery`: rozbalený původní balík bannerů, jeho galerie, editor, PNG, WebP, JPG a SVG.
- `03-pozadi-a-revize`: všech šest dosavadních samostatných panoramat, včetně poslední úpravy, původní PNG a FHD WebP. `valkyria-aktualni-1920x1080.png` je poslední verze z této konverzace, nikoli nově ověřená/odsouhlasená verze.
- `04-koncepty`: dvě starší grafické koláže a unikátní dřívější náhledy. Jsou to koncepty, ne jednotlivé bannery v deklarovaných velikostech.
- `05-zdroje`: původ podkladů a upozornění na práva.

## Nové formáty pro každou mapu

| Soubor | Rozměr | Použití |
| --- | --- | --- |
| `server-card` | 640 × 360 | Karta v seznamu serverů, výpis map |
| `server-strip` | 960 × 240 | Úzký řádek v seznamu serverů |
| `article` | 1200 × 630 | Titulní obrázek článku a Open Graph |
| `match-result` | 1920 × 1080 | Výsledková grafika zápasu |
| `match-preview` | 1200 × 630 | Pozvánka na zápas / sdílení |
| `wide` | 1920 × 480 | Široké záhlaví |
| `social` | 1080 × 1080 | Čtvercový příspěvek |
| `tactical-poster` | 1080 × 1350 | Přehled s celou taktickou mapou |
| `tactical-background` | 1920 × 1080 | Tmavé taktické pozadí bez textu |

Každý formát je předexportovaný ve WebP. `article` a `match-preview` mají také JPG. `article` a `match-result` mají upravitelné SVG s vloženými obrázky. PNG libovolné mapy a formátu vyexportuje editor. V balíčku je i samostatný PNG příklad výsledkové šablony.

## Výsledek zápasu

Otevři `01-hll-map-pack/EDITOR.html`, vyber mapu a formát Výsledek zápasu, doplň týmy, skóre, soutěž a datum. Zkontroluj náhled a stiskni PNG, WebP, JPG nebo SVG. Výchozí `— : —`, `SOUPEŘ`, `SOUTĚŽ / DOPLNIT` a `DATUM / DOPLNIT` jsou záměrně nevyplněná pole, ne skutečné výsledky.

Stejný editor umožňuje měnit titulek článku, podtitulek a barvu akcentu. Veškeré obrázky má vložené přímo v HTML. Nepřipojuje se k vašim webům, serverům ani RCON a nic na nich nemění.

## Pro web / vývojáře

`01-hll-map-pack/web` obsahuje ukázku integrace, mapový resolver a testy. Zkopíruj složku `maps` z mapového balíčku například do `public/assets/hll-maps/`. Hotové WebP soubory můžeš použít rovnou.

`maps.json` obsahuje cesty ke všem souborům. `map-assets.mjs` rozpozná názvy map a běžné layer identifikátory přes aliasy. Neznámou mapu vrací jako null; nevymýšlí náhradní lokaci. Všechny varianty dne/noci jedné základní mapy používají stejný obrázek. Nejde o živá serverová data.

## Rozlišení a původ

Nový mapový balík používá herní podklady, ne AI malby. Zdrojové scénické náhledy mají 718 × 404 px; původní taktické mapy 4096 × 4096 px. FHD výsledkové kompozice používají malé screenshoty jako vložený panel. Zdrojové originály jsou zachovány v každé složce mapy. Editor používá optimalizovaný taktický podklad 1400 × 1400 px.

Staré panorama grafiky z předchozích odpovědí jsou naopak AI ilustrace. Podrobnosti a zdroje viz `05-zdroje/ZDROJE-A-PRAVA.md`.

Písma nejsou přibalená. Rastrové exporty mají text vykreslený. V upravitelném SVG/editoru se použijí systémová Arial/Helvetica/sans-serif, takže při další editaci na jiném počítači mohou být malé typografické rozdíly.

## Kontrola balíčku

Ověřeny rozměry všech 180 nových mapových WebP, existence deklarovaných souborů, načtení editoru a integrita ZIPu. `SHA256SUMS.txt` obsahuje kontrolní součty souborů před zabalením. Rozlišení a velikosti balíčku jsou v `KONTROLA.json`.
