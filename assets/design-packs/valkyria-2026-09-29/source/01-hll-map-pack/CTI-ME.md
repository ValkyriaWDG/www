# VALKYRIA / Hell Let Loose / mapový balík

20 map, 9 hotových grafických formátů pro každou. Obrázky jsou předem vyexportované; editor není nutný pro jejich použití.

## Použití

Otevři `EDITOR.html`, zvol mapu a formát. U výsledku doplň týmy, skóre, soutěž a datum; u článku titulek a podtitulek. Zkontroluj náhled a vyexportuj PNG, JPG, WebP nebo upravitelné SVG. Editor funguje offline a neodesílá data.

Všechny hotové soubory jsou ve `maps/<slug-mapy>/`. Rozměry jsou přímo v názvech. Každá mapa má kartu serveru, úzký serverový řádek, článek, výsledek, pozvánku na zápas, široké záhlaví, čtvercový příspěvek, taktický plakát a čisté FHD taktické pozadí. Články a pozvánky jsou navíc v JPG; články a výsledky navíc v SVG.

`maps.json` popisuje soubory a zdroje. `web/INTEGRACE.md` ukazuje zapojení do webu. `web/map-assets.mjs` umí převádět názvy map a běžné serverové layer ID na cesty k obrázkům. Jde o statickou grafiku, nikoli RCON klienta.

## Důležité

Předvyplněné `— : —`, `SOUPEŘ`, soutěž a datum jsou prázdná šablona, nikoli skutečný výsledek. Herní náhledy mají původní rozlišení 718 × 404; původní taktické mapy 4096 × 4096. Tyto originály jsou přiložené. Editor pracuje s optimalizovanou taktickou mapou 1400 × 1400.

Použité herní podklady nejsou AI ilustrace. Jsou převzaté z komunitního projektu uvedeného v `ZDROJE-A-PRAVA.md`; nejsou licencované jeho MIT licencí. Písma nejsou přibalena. Den/noc a jiné varianty jedné základní mapy používají stejnou grafiku.

Přehled map: `PREHLED-MAP.jpg`. Přehled celého velkého balíčku: `../START.html`.
