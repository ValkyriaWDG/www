# Architecture

> Current extension: follow [ADR-WEB-002](decisions/0002-unified-valkyria-platform.md) for one HLL/Wardogs application on future valkyria.cz. Retain existing modules/persistence; add explicit game context and permissions.

## Decision

Use a modular TypeScript monolith: Next.js App Router, React, PostgreSQL, Drizzle ORM
and Better Auth. Build a bespoke CSS-variable/CSS-module interface. Use pnpm
workspaces for the web app, database package and integration contracts. A Discord
worker is a later independent runtime only if gateway role events are needed.
See [ADR 0001](decisions/0001-modular-web.md).

The product is Czech-first with English support (`cs` and `en`); engineering prose,
code identifiers, agent prompts and GitHub material stay English. The canonical
[localization contract](../product/localization.md) owns routing and translation behavior.

Version policy: Node 24 LTS; resolve a supported stable Next.js/React/Better Auth/
Drizzle combination when implementation begins, consult official documentation and
pin exact dependencies and lockfile. Do not use prerelease auth packages or assume
an old tutorial's API is current. The foundation has no application dependencies.

```mermaid
flowchart LR
  Visitor[Browser] --> Edge[HTTPS edge and reverse proxy]
  Edge --> Web[Next.js web container]
  Web --> DB[(PostgreSQL project database)]
  Web --> Media[Approved static media]
  Web --> OAuth[Discord OAuth and member REST API]
  Worker[Optional Discord worker] --> Discord[Discord Gateway]
  Worker -->|Authenticated role snapshots| Web
```

## Boundaries

| Location | Responsibility |
|---|---|
| `apps/web/src/app` | Route composition, metadata, layouts and route handlers |
| `apps/web/src/components` | Reusable visual primitives and game-menu shell |
| `apps/web/src/modules/content` | Editorial content and publication rules |
| `apps/web/src/modules/members` | Public profiles distinct from private user identities |
| `apps/web/src/modules/matches` | Match/result use cases and later roster coordination |
| `apps/web/src/modules/auth` | Better Auth integration and session handling |
| `apps/web/src/modules/access` | Central policy engine and Discord-role adapter |
| `apps/web/src/i18n` | Validated locale routing, Czech/English UI dictionaries and locale formatting |
| `packages/db` | Schema, reviewed migrations and server-side repositories |
| `packages/contracts` | Runtime-validated integration messages and public DTO schemas |
| `apps/discord-worker` | Reserved role-event adapter; no bot functionality in this scaffold |
| `infra` | Example deployment configuration and runbooks, never live credentials |

These module paths are the planned implementation layout, not existing implementations.
Route files remain thin. UI does not query tables directly. Database, tokens and
private DTOs must stay out of client bundles. Share a package only when another
consumer actually needs it; do not add a generic abstraction framework.

## Rendering and data

Public and admin UI live under explicit `/cs` and `/en` prefixes with English logical
path suffixes: for example `/cs/news`, `/en/news` and `/cs/admin/news`. `/` redirects
deterministically with HTTP 307 to `/cs`. The URL is the locale source; do not add a
language cookie or automatic browser-language negotiation. `/api/*`, including auth
callbacks and health endpoints, plus robots/sitemap/static assets stay outside locale
routing. In the proposed pinned `next-intl` bootstrap configuration, disable
`localeDetection`, `localeCookie` and automatic `alternateLinks`; emit CMS counterpart
links only after published-translation lookup. Verify the selected version's API when
implementing this contract. The foundation does not yet install an i18n dependency.

Public pages use server rendering with explicit publication filters; cache only
public projections and invalidate after publish/unpublish. Content identity, requested
locale and published revision belong in public data/cache keys; list/search/taxonomy
caches also need locale. Cross-language shared facts remain one record. Authenticated and admin
responses are private/no-store. Never cache a permission decision across identities.
The persistent shell preserves the video element across normal route navigation,
while the URL, title, accessible heading, focus and history remain real web navigation.
Prefer server components; use client components for interactive menu, filters, forms
and video preferences. Do not fetch all members or private rosters into the browser.

Resolve language-switch links by entity identity and available published translation,
not string replacement of paths. A missing English article switches to `/en/news`
with a localized notice/source-language link; direct absent/unpublished translations
return 404. Canonical/hreflang/OG and any sitemap/feed include only eligible published
locale variants. Optional member biographies/match recaps may show an explicit absence
label and a link to published source-language prose; shared facts stay readable when
the owning entity's global publication/consent gate permits it.

Use PostgreSQL in development and integration tests; SQLite is not a substitute for
authorization/migration testing. A Docker Compose development database is disposable
and isolated. Production uses a dedicated database and role on the existing PostgreSQL
service, not a new shared superuser. No Redis, queue platform or search service in v1.
Use PostgreSQL-backed session, replay and rate-limit state when durability is needed.

## Media and content

Small reviewed brand assets are committed. Large background media is delivered through
an approved media origin or read-only deployment mount, with content hashes and provenance.
Never require a video download before displaying navigation. No production hotlinking
to the old site. Store media references and metadata, not video bytes, in PostgreSQL.
Use a WordPress-like visual editor based on Tiptap/ProseMirror with schema-versioned
JSON as canonical content. Validate the node/mark/attribute allowlist server-side and
render safe public HTML without loading the editor bundle. No arbitrary MDX/JavaScript
or raw HTML execution. Use one news/page entity with independent Czech/English
`ContentTranslation` draft/live revisions and slugs. Autosave never changes either
language's live content; translation and publication are explicit, never automatic.
Snapshot title/body/SEO, effective taxonomy labels and image alt/caption in the exact
locale's immutable revision so mutable global metadata cannot leak into live output.
Provide a scoped image media library with validated uploads and private draft delivery;
store runtime bytes in persistent media storage, not Git or the app image. Implement
a durable idempotent scheduled-publication CLI backed by PostgreSQL and an operator
minute timer. Each scheduled intent, authorization check, audit event and cache
invalidation targets the exact translation/locale/revision. See
[editorial and match requirements](../product/editorial-and-matches.md).

## Integration and delivery

Discord OAuth establishes identity. Guild membership and configured role IDs establish
capabilities through the [access policy](../security/auth-rbac.md). The bot is not
required to render public content. Handle 429, outages, departure and out-of-order events.
The worker contract can later be implemented by the clan's existing bot without
coupling to any private legacy project.

Publish images from protected GitHub main only after quality checks. Use an immutable
`sha-<commit>` tag and digest; the operator promotes a verified image to production.
The deployment topology is outbound tunnel → reverse proxy → application container;
the app has no public host port and no Docker socket. See the
[deployment runbook](../operations/deployment.md). Production access is not part of a cloud coding task.

## Operational targets

- Desktop and mobile current Chrome, Firefox, Safari and Edge; keyboard-only operation.
- Public LCP <= 2.5 s and CLS <= 0.1 in an agreed reproducible mobile test; report environment.
- Home initial compressed JS budget <= 200 KiB excluding optional media; justify any exception.
- No initial video fetch with reduced-motion/save-data policy; background media failure harmless.
- Liveness separate from database readiness; structured redacted logs and request IDs.
- UTC storage for all dates; display match time with an explicit time zone.
- Czech-default and English UI, including CMS states; both translations for core static
  pages at launch and no cross-locale draft, metadata or media leakage.
- Backups + restore verification before first production schema migration.
