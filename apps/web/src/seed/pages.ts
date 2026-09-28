import type { Locale, PageKey, RichTextDocument } from '@valkyria/db';
import { bold, doc, h2, link, ol, p, ul } from './rich-text';

/*
 * Reviewed production copy for the core static pages. Only facts reviewed in
 * docs/research/legacy-site-audit.md are used: a Czech and Slovak gaming community,
 * together since 2022 with a competitive Hell Let Loose history, a Wardogs server
 * announced on 17 September 2026 (teamwork, helping new players, fair play), competitive
 * Wardogs depending on future game support, and Discord as the main coordination and
 * recruitment channel. No member/match counts, rankings, standings or social links.
 */

export const HLL_WEBSITE_URL = 'https://valkyriahll.cz/';
export const HLL_MATCH_ARCHIVE_URL = 'https://valkyriahll.cz/matches';
/** Advertised community invite (legacy audit); administrators can edit the page later. */
export const DISCORD_INVITE_URL = 'https://discord.gg/vlkhll';

export type SeedPageCopy = {
  title: string;
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
  body: RichTextDocument;
};

const clan: Record<Locale, SeedPageCopy> = {
  cs: {
    title: 'Klan Valkyria',
    excerpt: 'Kdo jsme, co hrajeme a jak se k nám přidat.',
    seoTitle: 'Klan Valkyria',
    seoDescription: 'Valkyria je česká a slovenská herní komunita. Dnes hlavně Wardogs, od roku 2022 s historií v Hell Let Loose.',
    body: doc(
      h2('Kdo jsme'),
      p(
        'Valkyria je česká a slovenská herní komunita. Hrajeme spolu, domlouváme se na Discordu a záleží nám na tom, aby se u nás dobře hrálo nováčkům i zkušeným hráčům.',
      ),
      h2('Wardogs'),
      p(
        'Naše pozornost se čím dál víc přesouvá k Wardogs. Vlastní Wardogs server jsme oznámili 17. září 2026 a stavíme ho na týmové hře, pomoci novým hráčům a fair play.',
      ),
      p('Soutěžní Wardogs nás láká. Jestli a v jaké podobě ho budeme hrát, ale záleží na tom, jakou podporu mu hra v budoucnu nabídne.'),
      h2('Kořeny v Hell Let Loose'),
      p(
        'Jako komunita fungujeme od roku 2022. Začínali jsme v Hell Let Loose, kde jsme hráli i soutěžně. Tahle historie k nám patří – zápasy a informace z té doby zůstávají na našem původním webu.',
      ),
      ul([link('Web Hell Let Loose', HLL_WEBSITE_URL)], [link('Archiv HLL zápasů', HLL_MATCH_ARCHIVE_URL)]),
      h2('Jak hrajeme'),
      ul(
        [bold('Týmová hra.'), ' Společný výsledek je víc než osobní statistiky.'],
        [bold('Fair play.'), ' Hrajeme férově vůči soupeřům i vlastnímu týmu.'],
        [bold('Nováčci vítáni.'), ' Kdo začíná, dostane radu a prostor se zorientovat.'],
      ),
      h2('Jak se přidat'),
      p('Všechno začíná na našem Discordu – tam se domlouváme na hraní i na náboru. Postup najdeš na stránce Komunita.'),
      p('Přihlášení na tento web je samostatná věc: slouží hlavně správcům obsahu a samo o sobě z nikoho nedělá člena klanu.'),
    ),
  },
  en: {
    title: 'The Valkyria clan',
    excerpt: 'Who we are, what we play and how to join.',
    seoTitle: 'The Valkyria clan',
    seoDescription: 'Valkyria is a Czech and Slovak gaming community. Mostly Wardogs today, with a Hell Let Loose history since 2022.',
    body: doc(
      h2('Who we are'),
      p(
        'Valkyria is a Czech and Slovak gaming community. We play together, organise on Discord and want the game to be enjoyable for newcomers and experienced players alike.',
      ),
      h2('Wardogs'),
      p(
        'Our focus is shifting more and more towards Wardogs. On 17 September 2026 we announced our own Wardogs server, built around teamwork, helping new players and fair play.',
      ),
      p('Competitive Wardogs appeals to us, but whether and how we play it depends on the support the game offers in the future.'),
      h2('Roots in Hell Let Loose'),
      p(
        'We have been a community since 2022. We started in Hell Let Loose, where we also played competitively. That history is part of us – matches and information from that time remain on our original website.',
      ),
      ul([link('Hell Let Loose website', HLL_WEBSITE_URL)], [link('HLL match archive', HLL_MATCH_ARCHIVE_URL)]),
      h2('How we play'),
      ul(
        [bold('Teamwork.'), ' The shared result matters more than personal stats.'],
        [bold('Fair play.'), ' We play fair towards our opponents and our own team.'],
        [bold('Newcomers welcome.'), ' If you are just starting out, you get advice and room to find your feet.'],
      ),
      h2('How to join'),
      p('Everything starts on our Discord – that is where we arrange games and recruitment. The steps are on the Community page.'),
      p('Signing in to this website is a separate thing: it is mainly for content administrators and does not by itself make anyone a clan member.'),
    ),
  },
};

const community: Record<Locale, SeedPageCopy> = {
  cs: {
    title: 'Komunita',
    excerpt: 'Jak se přidat na náš Discord a k čemu ho používáme.',
    seoTitle: 'Komunita Valkyria',
    seoDescription: 'Jak se přidat ke komunitě Valkyria na Discordu a čím se liší členství na Discordu od přihlášení na web.',
    body: doc(
      p('Valkyria stojí na lidech, kteří spolu rádi hrají. Hlavním místem, kde se potkáváme a domlouváme, je náš Discord server.'),
      h2('Jak se přidat'),
      ol(
        ['Otevři ', link('pozvánku na Discord Valkyria', DISCORD_INVITE_URL), ' a připoj se k serveru.'],
        'Ozvi se ostatním a domluv se na společném hraní.',
        'Zajímá tě nábor do klanu? Řeš ho přímo na Discordu – nábor probíhá tam.',
      ),
      h2('K čemu slouží náš Discord'),
      ul('Domluva na společném hraní', 'Nábor nových hráčů do klanu', 'Rady a pomoc pro nováčky'),
      h2('Discord a přihlášení na web nejsou totéž'),
      p(
        'Připojením k Discordu se stáváš součástí komunity. Přihlášení na tento web přes Discord je samostatný krok: web si při něm ověří tvůj účet a role na našem serveru, aby mohl správcům obsahu otevřít administraci.',
      ),
      p('Přihlášení z nikoho nedělá člena klanu a nevytváří veřejný profil. Obsah webu si můžeš přečíst i bez přihlášení.'),
      h2('Hell Let Loose'),
      p('Naše historie a zápasy z Hell Let Loose zůstávají na původním webu:'),
      ul([link('Web Hell Let Loose', HLL_WEBSITE_URL)], [link('Archiv HLL zápasů', HLL_MATCH_ARCHIVE_URL)]),
    ),
  },
  en: {
    title: 'Community',
    excerpt: 'How to join our Discord and what we use it for.',
    seoTitle: 'Valkyria community',
    seoDescription: 'How to join the Valkyria community on Discord and how Discord membership differs from signing in to the website.',
    body: doc(
      p('Valkyria is built on people who enjoy playing together. Our Discord server is the main place where we meet and organise.'),
      h2('How to join'),
      ol(
        ['Open the ', link('Valkyria Discord invite', DISCORD_INVITE_URL), ' and join the server.'],
        'Say hello and arrange games with the others.',
        'Interested in joining the clan? Ask directly on Discord – that is where recruitment happens.',
      ),
      h2('What our Discord is for'),
      ul('Arranging games together', 'Recruiting new clan members', 'Advice and help for newcomers'),
      h2('Discord and website sign-in are not the same'),
      p(
        'Joining Discord makes you part of the community. Signing in to this website with Discord is a separate step: the website checks your account and roles on our server so that it can open the administration to content managers.',
      ),
      p('Signing in does not make anyone a clan member and does not create a public profile. You can read the website without signing in.'),
      h2('Hell Let Loose'),
      p('Our Hell Let Loose history and matches remain on the original website:'),
      ul([link('Hell Let Loose website', HLL_WEBSITE_URL)], [link('HLL match archive', HLL_MATCH_ARCHIVE_URL)]),
    ),
  },
};

const privacy: Record<Locale, SeedPageCopy> = {
  cs: {
    title: 'Ochrana soukromí',
    excerpt: 'Jaké údaje tento web zpracovává a proč.',
    seoTitle: 'Ochrana soukromí – Valkyria',
    seoDescription: 'Jaké údaje zpracovává web komunity Valkyria: přihlášení přes Discord, relační cookie, provozní záznamy a veřejné profily se souhlasem.',
    body: doc(
      p('Tato stránka popisuje, jaké údaje zpracovává tento web. Veřejný obsah si můžeš prohlížet bez přihlášení a bez účtu.'),
      h2('Přihlášení přes Discord'),
      p('Přihlášení používá Discord OAuth s oprávněním identify. Web tak dostane tvé Discord ID, uživatelské a zobrazované jméno a avatar.'),
      p(
        'Aby mohl rozhodnout o přístupu do administrace, server ověřuje tvé členství a role na Discord serveru Valkyria. Role se zjišťují na straně serveru, nikdy z tvého prohlížeče.',
      ),
      h2('Relace a cookies'),
      p('Po přihlášení web nastaví relační cookie, která tě drží přihlášeného. Nepoužíváme analytické ani reklamní nástroje a nesledujeme tě napříč weby.'),
      h2('Lokální účet správce'),
      p(
        'Pro případ výpadku Discordu může provozovatel zřídit samostatný lokální účet správce. Ten se přihlašuje heslem a dvoufázovým ověřením (MFA). Veřejná registrace neexistuje.',
      ),
      h2('Nastavení v prohlížeči'),
      p('Volbu, zda chceš přehrávat video na pozadí, si web ukládá do localStorage ve tvém prohlížeči. Zůstává jen tam.'),
      h2('Provozní záznamy'),
      p(
        'Server vede provozní záznamy (logy) s identifikátory požadavků, abychom mohli řešit chyby a bezpečnostní problémy. Změny v administraci se zapisují do auditního záznamu – kdo, co a kdy změnil.',
      ),
      h2('Veřejné profily členů'),
      p('Veřejný profil člena zveřejníme jen s jeho souhlasem. Souhlas lze odvolat; profil pak skryjeme.'),
      h2('Doba uchování a kontakt'),
      p(
        'Doby uchování jednotlivých údajů a formální kontaktní cesta pro dotazy k osobním údajům ještě čekají na potvrzení a doplníme je před spuštěním webu. Do té doby nás kontaktuj přes náš Discord server.',
      ),
    ),
  },
  en: {
    title: 'Privacy',
    excerpt: 'What data this website processes and why.',
    seoTitle: 'Privacy – Valkyria',
    seoDescription: 'What data the Valkyria community website processes: Discord sign-in, a session cookie, server logs and member profiles published with consent.',
    body: doc(
      p('This page describes what data this website processes. You can browse public content without signing in or having an account.'),
      h2('Signing in with Discord'),
      p('Sign-in uses Discord OAuth with the identify scope. The website receives your Discord user ID, your username and display name, and your avatar.'),
      p(
        'To decide on access to the administration, the server checks your membership and roles in the Valkyria Discord server. Roles are determined on the server, never by your browser.',
      ),
      h2('Sessions and cookies'),
      p('After you sign in, the website sets a session cookie that keeps you signed in. We use no analytics or advertising tools and do not track you across websites.'),
      h2('Local administrator account'),
      p(
        'In case Discord is unavailable, the operator can set up a separate local administrator account. It signs in with a password and multi-factor authentication (MFA). There is no public registration.',
      ),
      h2('Browser preference'),
      p('Whether you want the background video to play is stored in your browser’s localStorage. It stays there only.'),
      h2('Server logs'),
      p(
        'The server keeps operational logs with request IDs so that we can investigate errors and security problems. Changes made in the administration are recorded in an audit log – who changed what and when.',
      ),
      h2('Public member profiles'),
      p('A member’s public profile is published only with their consent. Consent can be withdrawn; the profile is then hidden.'),
      h2('Retention and contact'),
      p(
        'Retention periods for the individual data and the formal contact route for personal-data requests are pending confirmation and will be completed before the website launches. Until then, please contact us through our Discord server.',
      ),
    ),
  },
};

/*
 * FAQ outline for editors: the question topics of the legacy valkyriahll.cz FAQ
 * (docs/product/hll/legacy-migration.md), without answers. Legacy answers (age limits,
 * training frequency, VIP thresholds) are not confirmed policy, so the seed stores this
 * only as an unpublished draft; editors write and publish the answers.
 */
const FAQ_PENDING = { cs: 'Odpověď připravujeme.', en: 'We are preparing this answer.' } as const;
const FAQ_QUESTIONS: Record<Locale, string[]> = {
  cs: [
    'Jak se přidat do Valkyrie?',
    'Jak získat VIP na našich serverech?',
    'Pořádáte tréninky?',
    'Jaké jsou požadavky na přijetí?',
    'Hrajete soutěžní zápasy?',
    'Jak často pořádáte akce?',
    'Potřebuji zkušenosti s Hell Let Loose?',
    'Jak spolu komunikujeme?',
    'Jaká jsme komunita?',
    'Kolik času musím hraní věnovat?',
    'Na čem nám záleží?',
  ],
  en: [
    'How do I join Valkyria?',
    'How do I get VIP on our servers?',
    'Do you run training sessions?',
    'What are the requirements to join?',
    'Do you play competitive matches?',
    'How often do you hold events?',
    'Do I need Hell Let Loose experience?',
    'How do we communicate?',
    'What kind of community are we?',
    'How much time do I need to commit?',
    'What do we value?',
  ],
};
const faq: Record<Locale, SeedPageCopy> = {
  cs: {
    title: 'Časté dotazy',
    excerpt: 'Odpovědi na nejčastější otázky o Valkyrii, náboru a hraní Hell Let Loose.',
    seoTitle: 'Časté dotazy',
    seoDescription: 'Nejčastější otázky o komunitě Valkyria, náboru, VIP a hraní Hell Let Loose.',
    body: doc(...FAQ_QUESTIONS.cs.flatMap((question) => [h2(question), p(FAQ_PENDING.cs)])),
  },
  en: {
    title: 'Frequently asked questions',
    excerpt: 'Answers to the most common questions about Valkyria, joining and playing Hell Let Loose.',
    seoTitle: 'Frequently asked questions',
    seoDescription: 'The most common questions about the Valkyria community, joining, VIP and playing Hell Let Loose.',
    body: doc(...FAQ_QUESTIONS.en.flatMap((question) => [h2(question), p(FAQ_PENDING.en)])),
  },
};

/** Core static pages; both locales are required for launch. The route slug equals the page key. */
export const SEED_PAGES: Record<PageKey, Record<Locale, SeedPageCopy>> = { clan, community, privacy, faq };

/** Pages the seed creates only as unpublished drafts (no reviewed public copy exists yet). */
export const SEED_DRAFT_ONLY_PAGES: ReadonlySet<PageKey> = new Set<PageKey>(['faq']);

export const SEED_AUTHOR_LABEL = 'Valkyria';
