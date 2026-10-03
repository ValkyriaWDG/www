# Taxonomy administration boundary

`modules/taxonomy` manages the definitions behind the shared taxonomy keys: Field Manual
categories (`manual_category`, one set per game) and shared news categories/tags
(`taxonomy_term`). Articles keep referencing keys through `content_document`; this module
never rewrites those associations, never deletes content and never changes a key.

| Piece | Responsibility |
|---|---|
| `scope.ts` | Pure scope model (`manual-category` + game, `news-category`, `news-tag`), URL segments (`/admin/taxonomy/manual/hll/<id>`, `/admin/taxonomy/news-tag/<id>`), limits and picker ordering. |
| `admin.ts` | Server-only use cases: `listTaxonomyForAdmin`, `getTaxonomyTermForAdmin`, `saveTaxonomyTerm`, `archiveTaxonomyTerm`, `restoreTaxonomyTerm`, `deleteTaxonomyTerm`. |
| `actions.ts` | Server actions for the admin form; revalidate the admin lists, `/[locale]/[game]/field-manual` and the news lists. |

## Authorization

Every operation calls `authorize(content.edit, write)` and then `authorizeGameScope`
with the scope's resource game: the manual category's game, or `null` (community) for
news taxonomy. A game-scoped editor therefore manages only the manual categories of
their games; news categories/tags need a platform-wide grant. Denials are audited with
reason `game_scope`. Reads use `content.read_private` with the same scope rule, so the
`/admin/taxonomy` page lists only the sections the actor can manage.

## Invariants

- Keys are immutable (`^[a-z0-9]+(-[a-z0-9]+)*$`, max 64) and unique per scope
  (`manual_category_game_key_uq`, `taxonomy_term_kind_key_uq`); a duplicate is a
  validation error (`key: duplicate_key`), never an overwrite.
- Labels are trimmed single-line text of 1–80 characters, descriptions at most 300
  characters (DB CHECK), order is an integer 0–10000.
- Updates carry the loaded `updatedAt` as `expectedUpdatedAt`; the row is locked
  `FOR UPDATE` and a mismatch is `DomainError('conflict')`.
- Archiving sets `archived_at`: pickers hide the term unless a document already uses it,
  `assertTaxonomyKeys` rejects assigning an archived key anew (`archived_category`,
  `archived_tag`) but keeps an existing assignment valid, and public pages keep rendering
  archived terms that have published content.
- Deletion is allowed only with zero current references (`conflict`, `_: referenced`
  otherwise). Draft saves take a share lock on the keys they validate, so a deletion and
  a concurrent assignment serialize instead of racing.
- Every mutation writes an audit row (`taxonomy.create|update|archive|restore|delete`,
  capability `content.edit`, entity `manual_category` or `taxonomy_term`) whose summary
  holds scope, game, key, order and flags only.

## Publication semantics

Manual category labels, descriptions and order are read live by the public Field Manual
(category overview, list cards, article header), so a save applies immediately without
an editorial revision. News category/tag labels apply immediately to the public news
filter facets; the eyebrow/tag labels printed on an article come from its published
revision snapshot and change when that translation is next published. News order affects
only the editor pickers. The admin form states this per scope.

## Migration

`packages/db/drizzle/0011_taxonomy_admin.sql` is additive (new nullable/defaulted
columns and two CHECK constraints), so the previous image keeps reading and writing both
tables during the rollback window; rolling the application back leaves the new columns
unused. No backfill is needed. There is no Logi synchronization writer for CMS taxonomy
and none is planned: these definitions are owned by the website.
