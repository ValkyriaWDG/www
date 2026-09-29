# Public copy, community artwork, Discord mark and glyphs (2026-09-29)

Before: main `a7be042`. After: branch `feat/hll-platform-handoff` application source
`797f7d4` (copy/artwork `b8209bb` plus logos/icons). Both are standalone production
builds served locally with the synthetic e2e fixtures, captured in Chromium with
Playwright, Europe/Prague. Every file is registered in `assets/manifest.json`.

| Scenario | Before | After |
|---|---|---|
| Hub `/cs`, 1440×900 (lower half). Before: shared destinations were text-only buttons and the footer used a generic chat bubble for Discord. After: pack glyphs on "Všechny novinky / Všechny zápasy / Členové / O klanu / Jak se přidat", the Discord mark on "Připojit se na Discord" and on the footer utility. The HLL card reads "Zápasy a turnaje, herní servery, příručka a nábor do klanu". | [before](before/hub-cs-1440x900.webp) | [after](after/hub-cs-1440x900.webp), [en 390 px](after/hub-en-390-full.webp) |
| Sign-in `/cs/login` and `/en/login`. Before: text-only panel. After: the clan crest beside "Účet Valkyria / Přihlásit se" and the Discord mark on "Pokračovat přes Discord"; labels, notes and links unchanged. | [before](before/login-cs-1440x900.webp) | [after (cs)](after/login-cs-1440x900.webp), [after (en, 390 px)](after/login-en-390x844.webp) |
| Community `/cs/community`: the Discord choice uses the Discord mark instead of a chat bubble. | [before](before/community-cs-1440x900.webp) | [after](after/community-cs-1440x900.webp) |
| Discord call to action on `/cs/clan` and the HLL landing `/cs/hll`: the Discord mark precedes the label. | – | [clan](after/clan-discord-cs-1440x900.webp), [HLL landing](after/hll-landing-cs-1440x900.webp) |
| HLL tournaments `/cs/hll/tournaments`: each card gets a trophy emblem (muted when finished); the intro no longer explains standings dates. | [before](before/hll-tournaments-cs-1440x900.webp) | [after](after/hll-tournaments-cs-1440x900.webp) |
| HLL news `/cs/hll/news`. Before: coverless community posts showed a grey "VALKYRIA" box and HLL posts repeated "· HELL LET LOOSE". After: the pack's text-free community scene with the crest, and only community posts are labelled. | [before](before/hll-news-cs-1440x900.webp) | [after](after/hll-news-cs-1440x900.webp) |
| HLL servers `/cs/hll/servers?server=synthetic-alpha`, full page. Before: "Pozorovaný stav nakonfigurovaných serverů…", a ping explanation, a refresh note repeating the checkbox, and "Status uvádí 64 připojených hráčů; snímek kola obsahuje 1 účastníků". After: visitor copy, no ping note or duplicate note, and "Právě připojení hráči: 64 · hráči v tabulce kola: 1." | [before](before/hll-servers-alpha-cs-1440-full.webp) | [after](after/hll-servers-alpha-cs-1440-full.webp) |
| HLL members `/cs/hll/members` at 390 px (full page). Before: the intro about "veřejnou příslušností ke hře" and a permanently disabled "Zobrazen statický obraz." button in the footer. After: "Hráči klanu Valkyria, kteří hrají Hell Let Loose a mají veřejný profil." and no disabled control on content pages (the landing keeps play/pause). | [before](before/hll-members-cs-390-full.webp) | [after](after/hll-members-cs-390-full.webp) |

Regression coverage: `e2e/public-layout.spec.ts` (Discord marks, glyphs, trophy
emblems), the updated `e2e/hll-stage.spec.ts` and `e2e/server-live-players.spec.ts`,
`icons.test.tsx` (Discord geometry against `assets/icons/simple-icons/discord.svg`)
and `discord-cta.test.tsx`. Not established here: the real production data set.
Tournaments have no logo field yet, so the emblem is a glyph, not a competition logo.
