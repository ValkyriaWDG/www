# Czech-first bilingual website

Owner decision: the website supports **Czech (`cs`) and English (`en`)**, with Czech
as the primary/default language. This includes public pages, account/login and admin
UI. Code identifiers, comments, technical documentation, GitHub descriptions/issues/PRs,
commit messages and AI prompts remain **English**. Czech user-facing translations and
copy examples are intentional exceptions; do not translate technical identifiers.

## URL and application contract

| Concern | Decision |
|---|---|
| Canonical origin | `https://valkyriawdg.cz` |
| UI locales | Exact allowlist `cs`, `en`; locale identifiers are not flag country codes |
| Default visit | `/` responds with HTTP 307 to `/cs`, regardless of browser language or old cookies |
| Public/account/admin UI | Explicit `/cs` and `/en` prefixes; URL determines active locale |
| Logical route examples in existing documents | English suffixes: `/news` means `/cs/news` and `/en/news`; `/admin/news` means `/cs/admin/news` and `/en/admin/news` |
| APIs and infrastructure | `/api/*`, auth callbacks, health endpoints, `/_next/*`, static assets, robots and sitemap routes remain unprefixed |
| English technical segments | Keep `news`, `members`, `matches`, `admin`, etc. consistent; CMS article slugs may differ per translation |
| Unprefixed known UI suffix | HTTP 307 to its Czech equivalent, preserving only safe supported query parameters |
| Unsupported explicit locale / unknown route | Not found; never rewrite an arbitrary path into a published page |

The origin in `APP_URL`/`BETTER_AUTH_URL` has no locale suffix. Validate locale and
return targets server-side; OAuth retains a safe localized destination without
changing its unprefixed provider callback. Locale cannot change capabilities, bypass
MFA, select a different identity or make a private response cacheable. Shared auth
must cover both language routes. Server errors use stable English machine codes;
the UI maps them to localized safe messages rather than showing raw provider errors.

Implement localized pages in the existing App Router application, with `next-intl`
and platform `Intl` formatting. Resolve a compatible stable version and pin it with
the initial app dependencies; no i18n runtime exists in this foundation yet. Keep
English message keys in one typed contract with complete Czech and English dictionaries.
Do not concatenate translated sentence fragments or store rendered translations as
business identifiers. Use locale-aware plural handling, especially Czech plural forms.

The planned routing configuration uses `locales: ['cs', 'en']`, `defaultLocale: 'cs'`,
`localePrefix: 'always'`, `localeDetection: false`, `localeCookie: false` and
`alternateLinks: false`. Generate alternate links from published CMS availability.
Check these APIs against the installed version and exclude infrastructure paths from
locale matching. See [next-intl routing configuration](https://next-intl.dev/docs/routing/configuration).

The URL carries the current selection across internal links, direct reload and
back/forward navigation. Do not silently override it through browser preferences,
cookie detection or geolocation. Revisiting bare `/` intentionally starts in Czech.

## Visible language switcher

Place a compact switcher in the shared desktop header/utility region and an equally
discoverable mobile location. It must also be available on login/account/admin pages.
Use a **Czech flag with CS / Čeština** and a **UK flag with EN / English**. The flags
are visual language cues, not the only accessible names. Provide persistent text or
equivalent full accessible labels, a clear current-language state, keyboard operation
and visible focus. Do not depend on hover, color alone or platform flag-emoji rendering.
Use small original flag shapes or appropriately licensed local assets with provenance.

Switch the current logical route and stable entity identity where a published target
exists. Resolve translated article slugs from the shared content ID, not by replacing
text inside a URL. Preserve valid public filters/sort state; reset pagination if the
target collection has fewer items. Never copy authentication secrets, preview tokens
or arbitrary redirect parameters into the new URL.

For an unsaved form/editor, protect draft work before changing UI or content locale:
save through the authorized path or offer a clear stay/discard choice. Never mark a
failed save successful or move an unsaved Czech draft into the English translation.
Changing the UI language and selecting the content language being edited are separate
controls; show both explicitly in the CMS.

Primary navigation working copy:

| English key / EN label | Czech label |
|---|---|
| Main menu / MAIN MENU | HLAVNÍ MENU |
| News / NEWS | NOVINKY |
| Clan / CLAN | KLAN |
| Members / MEMBERS | ČLENOVÉ |
| Matches / MATCHES | ZÁPASY |
| Sign in / SIGN IN | PŘIHLÁSIT SE |
| HLL website / HLL WEBSITE | HLL WEB |

All labels, validation, empty/error states, tooltips, accessible names, editor controls
and privacy/navigation copy must have reviewed Czech and English text. English labels
in engineering/design documents identify the component/action, not English-only UI.
Preserve clan/game names and member display names as supplied, including diacritics.
Verify the chosen fonts support Czech glyphs in all used weights.

## Editorial translations and missing content

One content entity links its language variants. A translation owns its title, slug,
excerpt, body, SEO fields, public revision pointers and locale-specific media text.
See [the data model](../architecture/data-model.md) and
[editorial workflows](editorial-and-matches.md). Drafts, autosave, preview, revision
history, schedules, cancellation and publication act on one explicit translation.
Publishing/unpublishing Czech must not implicitly publish/unpublish English. Audit
records, optimistic concurrency, scheduler authority and cache invalidation retain
the translation identity. Public metadata and body always come from that locale's
published snapshot, never from the other language's draft or shared mutable metadata.

An editor can create and review the English version independently. Do not send private
content to an external translation service or auto-publish machine translations as a
side effect of switching languages. Missing UI message keys fail validation; missing
editorial translations are a valid content state with deliberate UX:

- Core static launch pages and interface/privacy copy require reviewed Czech and English
  versions before launch. Primary authoring starts in Czech for new content.
- A news listing includes only published translations for its active locale. An article
  whose target translation is absent/unpublished has no public target detail URL.
  Switching from that article opens the target-language news collection with a localized
  unavailable-translation notice and a safe link to the existing published source version.
  Direct requests for an unpublished target translation return not found.
- Member identities and match facts (names, scores, times, game IDs) remain shared.
  Optional localized biographies/recaps can show an explicit unavailable-text message
  with a link to a published source-language version. Never fabricate a translation
  or relabel Czech text as an English translation.
- A locale change is never a reason to expose draft media, skip object authorization,
  lose consent/visibility restrictions or fetch private source content.

Translated categories/public role labels use shared stable keys with localized labels.
Alt text and captions belong to the appropriate published content snapshot; changing
media-library defaults must not silently mutate the other language's live article.

## Formatting, metadata and caching

Use `cs-CZ` and `en-GB` for display, with the existing explicit `Europe/Prague` timezone
policy. Persist timestamps independent of presentation; keep numeric scores numeric.
Test Czech accents, plural forms, longer labels and DST boundaries in both interfaces.
Do not use user-visible translated labels for enum values, permissions or database joins.

Render `<html lang="cs">` or `<html lang="en">` and translated titles/descriptions/OG
from the active published variant. Each locale has its own canonical URL. Generate
reciprocal `hreflang="cs"`/`"en"` only for real published counterparts; `x-default`
may point to the Czech counterpart when it exists. Do not canonicalize English pages
to Czech or advertise unpublished/fallback URLs as translated alternates. Include only
published localized URLs in the sitemap. See [Google's localized-page guidance](https://developers.google.com/search/docs/specialty/international/localized-versions).

Public query/cache identities include locale, content identity and publication state.
Locale-scoped slug redirects preserve published history without loops; changing a draft
slug cannot alter a live URL or another language's redirect. Invalidate affected pages,
lists, metadata and language availability on publication/unpublication. This includes
the other locale's cached counterpart links, hreflang and switch availability, plus
shared sitemap/availability entries. Publishing English changes neither Czech content
nor its published revision, but must refresh Czech metadata that now links to English.
Admin/auth/preview responses remain private/no-store regardless of locale; infrastructure
health is unchanged.

## Required evidence

Implement and verify this in M1–M3, not as a later localization phase. Test default
Czech with an English browser, direct `/en` navigation, safe switching/back/refresh,
unsupported locales and unprefixed API/callback/health routes. Check dictionary key
parity and ICU/format validity. Exercise Czech plural/date formats, localized errors,
keyboard switcher access and 360/390 px layouts in both languages.

Use two language variants to prove independent draft/live state, schedule execution,
slug uniqueness/redirects, concurrent edits, media privacy and cache/SEO behavior.
Verify missing English translation never exposes its draft or changes Czech publication.
Show real captioned Czech and English desktop/mobile captures for affected visual
work in the PR and related issue before closure under [the evidence policy](../engineering/evidence.md).
Documentation and mock plans alone do not prove a working bilingual website.
