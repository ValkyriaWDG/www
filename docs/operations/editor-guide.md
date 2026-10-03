# Website content editing

Sign in through the configured identity provider, then open `/cs/admin` or
`/en/admin`. Navigation lists the modules covered by your current website roles.
Signing in alone does not grant editing rights. The interface language and the
content translation being edited are separate choices.

| Content | Administration location | Required scope |
|---|---|---|
| FAQ, clan, community and privacy pages | `/[locale]/admin/content` | Platform-wide content editor or administrator |
| HLL Field Manual articles | `/[locale]/admin/manual` | HLL content editor or platform-wide editor |
| News | `/[locale]/admin/news` | Content editor for the article's game; community news needs platform-wide authority |
| Public member profiles | `/[locale]/admin/members` | Member-profile editor for every affiliated game |
| Editorial images | `/[locale]/admin/media` | Platform-wide editorial media permission |
| Public links and background media | `/[locale]/admin/settings` | Platform-wide administrator or owner |

## FAQ

1. Open **Pages and FAQ / Stránky a FAQ** and select **FAQ / Časté dotazy**.
   The shared FAQ appears at `/[locale]/faq` and in the HLL section.
2. Choose the Czech or English content tab. Write each question as a level-two
   heading and its answer below it. The public question index follows those headings
   in document order.
3. Use the excerpt for a short introduction. An empty excerpt or an excerpt copied
   verbatim from the beginning of the answers displays the concise localized FAQ
   introduction instead; the saved text and answers are preserved.
4. Save the draft, inspect its private preview and publish or update that language.
   Saving a draft does not change the public page. English and Czech are published
   independently; a missing translation is not filled from the other language.

The four core pages have fixed identities. If a platform-wide editor sees the
missing-pages warning, an operator must check the seed/migrations; creating arbitrary
site pages is not currently an administration feature.

## Field Manual

Open **Field manual / Příručka**, search or choose **New article / Nový článek**,
then edit the rich-text body, summary, category, images and selected translation.
The list's publication and language filters remain selected when searching.
Use draft, preview and explicit publication as for news.

**Source and ordering / Zdroj a řazení** is a separate shared form for the source
URL/date/language, credits, article order and review date. Saving these details
applies them immediately to both languages. Administration links and language
switches ask to stay, save or discard when this form has unsaved changes. Failed
saves keep the entered values and do not continue navigation.

Article categories can be selected in the editor. Category definitions, their
localized descriptions/order and news category/tag definitions currently have no
administration editor. Changes require reviewed operator maintenance; seeds only
add missing definitions and never overwrite existing labels.

## Wardogs League link on a match

The match editor's **Public presentation** group offers **Wardogs League match URL**
for Wardogs matches (match managers with Wardogs scope; HLL-only managers are denied
and the field is rejected on HLL matches). Paste the public detail link in the form
`https://wardogsleague.net/matches/<id>`; a trailing slash is removed, and queries,
fragments, other hosts or request pages are rejected. Leave it empty to remove it.

When the readers are configured, the public match page shows a **League preview**
section with the fixture number, title, type, status, scheduled time, team codes and
names, map, hosting, map vote and progress steps, the observation time and a visible
"unverified preview from Wardogs League" note. The preview never fills in CMS fields
and never shows a result: record the result in the editor as before. When the League
read fails or the reader is not configured, the page shows a quiet "League preview
unavailable" line; cached data older than 15 minutes is not shown as current.

## Website and Logi ownership

The website owns FAQ, manuals, pages, news, translations, media, public biographies,
consent and publication. These are edited here and are not overwritten by Logi sync.
Logi owns connected events, membership, published rosters, attendance and collected
player/server facts. Connected event edits use the Logi-backed match editor; roster
and attendance management stays in Logi/Discord. Public profile associations to Logi
are explicit and do not grant login or editorial permissions.

See [the integration contract](../integrations/logi/contract.md),
[people synchronization](../integrations/logi/people.md) and
[editorial publication rules](../product/editorial-and-matches.md) for the detailed
boundaries. Local test success does not establish hosted Logi or production activation.
