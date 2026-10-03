# Editable Field Manual boundary

Field Manual articles use the shared content editor, localized revisions/publication,
media authorization and scheduling. Editors open `/[locale]/admin/manual` to search,
create or edit articles in their authorized game scope. Search keeps the manual
workspace and selected publication/language filters.

Each article has independent Czech/English drafts and published revisions. Its shared
metadata form edits ordering, source URL/date/language, credits and the last editorial
review; administration links and locale switches ask to save or discard unsaved
metadata. These fields are saved
explicitly and apply immediately to both languages. The server checks `content.edit`
and the article's game scope on every metadata save.

Public lists, category counts, search, locale counterparts and sitemap
entries read only published content in the requested game/language. The active public
manual belongs to HLL. Article category selection is editable in the article editor;
category definitions (immutable key, localized labels/descriptions, order, archive
state) are managed under `/[locale]/admin/taxonomy/manual/hll` by the
[taxonomy module](../taxonomy/README.md) within the same HLL `content.edit` scope.
Public lists, category cards and article headers read the live `manual_category` row,
so label/description/order changes apply immediately without an article revision;
the published revision keeps its own snapshot. Archived categories stay public for
their published articles and are hidden from the editor's selector unless already
assigned. Manual content is owned by the website CMS and is not synchronized from Logi.

The [legacy inventory](../../../../../docs/product/hll/legacy-migration.md) defines
source URLs and observed fields. The [design spec](../../../../../docs/design/hll/visual-spec.md)
defines category grid, article layout and accessible empty/error states. Integration
coverage lives in `tests/integration/field-manual.test.ts` and
`tests/integration/taxonomy-admin.test.ts`; browser coverage includes
`e2e/admin-manual.spec.ts`, `e2e/admin-taxonomy.spec.ts`, `e2e/admin-game-scope.spec.ts`
and the public manual journeys.
