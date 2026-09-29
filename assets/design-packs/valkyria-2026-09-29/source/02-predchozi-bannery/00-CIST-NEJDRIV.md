# Valkyria – grafický balíček

Vytvořeno 29. 09. 2026 pro valkyria.cz, valkyriahll.cz a valkyriawdg.cz.

## Začni zde

Rozbal ZIP a otevři **index.html**. Uvidíš všechny samostatné bannery včetně odkazů na jednotlivé exporty. **EDITOR.html** je samostatný lokální editor: přepínání témat, změna českých titulků, rozměrů, barvy, vlastního screenshotu a originálního loga; export PNG, WebP a JPG. Nepotřebuje instalaci ani internet a nic nikam neodesílá.

## Co je v balíčku

| Složka | Obsah | Použití |
|---|---|---|
| 01-pozadi | 3 čistá pozadí, 1920 × 1080, PNG + WebP | Hlavní rozcestník, HLL a Wardogs; text a tlačítka vykresli v HTML |
| 02-clanky-fhd | 14 motivů, 1920 × 1080, PNG + WebP | Hlavní bannery článků, video náhledy, velké plochy |
| 03-clanky-og | 14 motivů, 1200 × 630, WebP + JPG | Články a náhledy sdílení / Open Graph |
| 04-karty | 14 motivů, 800 × 450 WebP | Karty v seznamu článků |
| 05-social | 5 překompovaných motivů, 1080 × 1080, PNG + WebP | Čtvercové příspěvky |
| 06-discord | 3 široké bannery, 1920 × 480, PNG + WebP | Discord nebo komunitní záhlaví; ověř výřez konkrétního umístění |
| 07-sablony | 14 SVG s textovou vrstvou | Další úpravy ve vektorovém editoru |
| assets | 8 podkladových ilustrací | Editor a další vlastní kompozice |

WebP pro OG mají v této sadě přibližně **76–172 kB**, medián **107 kB**. PNG ponech jako master; na web použij WebP. Pro `og:image` je přiložen i JPG.

## Vizuální a obsahové poznámky

Podklady jsou **AI vytvořené, herně inspirované ilustrace**, nikoli originální screenshoty, oficiální key art či přesné kopie herních modelů. Typografie a výsledné exporty byly vytvořeny zvlášť, aby byly české titulky čitelné a bez chyb generátoru. Použita je oranžovočervená paleta navazující na branding webu. Původní znak Valkyrie není nahrazen vymyšleným erbem: hotové exporty používají jen typografické označení VALKYRIA. Původní průhledné logo lze vložit v lokálním editoru.

Ilustrace byly připraveny z podkladů v této konverzaci a exportovány do přesných uvedených rozměrů. FHD export neznamená, že generátor vytvořil zdrojový obrázek nativně v FHD. Nikde nejsou doplňována smyšlená skóre, loga soupeřů, QR platby, bankovní údaje nebo neověřená data akcí.

Šablony pro obecné novinky a report jsou nové univerzální formáty, nikoli tvrzení, že stejnojmenné články už na webu existují. Nové hlavní stránky v kontrolovaném výstupu neobsahovaly zveřejněné novinky, proto byla konkrétní témata čerpána převážně ze stávajícího HLL webu. Wardogs doména při kontrole směřovala do sekce `valkyria.cz/cs/wardogs`.

Zápasový banner VLK vs EJIG používá datum **04. 10. 2026** z rozpisu na webu. Před publikací jej znovu ověř. Čas nebyl do grafiky vložen. Serverová migrace odkazuje na historický článek z 23. 04. 2025; grafika neoznamuje novou plánovanou migraci. Sbírka má rok 2026 podle zveřejněného článku.

## Editovatelnost a písma

Hotové PNG, WebP a JPG mají pevně vykreslenou typografii a zobrazují se stejně na každém zařízení. SVG obsahují skutečné textové vrstvy; vzhled písma se může v editoru s jinou sadou fontů změnit. V prohlížečovém editoru je dostupná systémová volba Impact / Arial Black / Arial / system-ui. Fontové soubory nejsou součástí balíčku.

Do editoru nahrávej PNG, WebP nebo JPG jako screenshot. Originální logo lze přidat jako PNG, WebP nebo SVG. Zvolená data se čtou jen lokálně. Pokud chceš úplně beztextové pozadí, zapni „Exportovat jen pozadí bez textu“.

## Vložení do webu

```html
<picture>
  <source srcset="/images/valkyria/03-clanky-og/02-sobotni-verejna-akce-1200x630.webp" type="image/webp">
  <img
    src="/images/valkyria/03-clanky-og/02-sobotni-verejna-akce-1200x630.jpg"
    width="1200" height="630"
    alt="Sobotní veřejná akce Hell Let Loose – komunita Valkyria"
    loading="lazy" decoding="async"
    style="display:block;width:100%;height:auto"
  >
</picture>
```

Obrázky s vloženými titulky zbytečně neořezávej pomocí `object-fit: cover` v jiném poměru stran. Pro 16:9 kartu použij export z `04-karty`, pro náhled článku export z `03-clanky-og`. Na úvodní stránce používej čistá pozadí z `01-pozadi` a sémantický HTML nadpis nad nimi.

```css
.community-hero {
  background: #080c0f url('/images/valkyria/01-pozadi/valkyria-hub-1920x1080.webp') center / cover no-repeat;
  min-height: min(900px, 90svh);
}
```

## Zdroje témat

Konkrétní titulky v grafice jsou nově napsané teaserové verze. Zdroj obsahu pro každý motiv je uveden také v `manifest.json`.

- **Wardogs server CZ/SK**: https://valkyriahll.cz/clanky/wardogs-oznameni
- **Sobotní veřejná akce**: https://valkyriahll.cz/clanky/sobotni-verejna-akce
- **ECL 2026 · Split 2**: https://valkyriahll.cz/turnaje/ecl-2026-fall
- **Sbírka na servery 2026**: https://valkyriahll.cz/clanky/sbirka-2026
- **VIP na našich serverech**: https://valkyriahll.cz/clanky/jak-ziskat-vip
- **Migrace, nastavení a moderace**: https://valkyriahll.cz/clanky/oznameni-23-04-2025
- **Nábor do klanu**: https://valkyriahll.cz/about
- **Příručka hráče HLL**: https://valkyriahll.cz/guide
- **Novinky Hell Let Loose**: https://valkyriahll.cz/clanky
- **Novinky Wardogs**: https://valkyria.cz/cs/wardogs
- **Seeding serveru**: https://valkyriahll.cz/clanky/jak-ziskat-vip
- **Komunita a Discord**: https://valkyria.cz/cs
- **VLK vs EJIG · ECL**: https://valkyriahll.cz/matches/208
- **Zápasový report**: https://valkyriahll.cz/clanky

Vizuální referenční průzkum:

- Branding Valkyrie: https://valkyria.cz/cs a https://valkyriahll.cz/
- Původní emblém webu: https://valkyria.cz/_next/static/media/valkyria-emblem-733.3pmu4fyke6h3k.webp
- Původní wordmark webu: https://valkyriahll.cz/valkyria_header.png
- WARDOGS / BULKHEAD: https://bulkhead.com/games/wardogs/
- WARDOGS / Steam: https://store.steampowered.com/app/1867240/WARDOGS/
- Hell Let Loose / Steam: https://store.steampowered.com/app/686810/Hell_Let_Loose/

Vše je předáno jako samostatný pracovní balíček. Nebyla provedena žádná změna ani publikace na živých webech.
