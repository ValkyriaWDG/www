# @valkyria/web

Next.js 16 App Router application for `valkyriawdg.cz`: Czech-first (`/cs`) with English
(`/en`), a persistent Wardogs-style menu shell, public clan/news/members/matches pages and
the authorized administration. Commands and environment: see the [root README](../../README.md#develop-and-verify).

| Path | Responsibility |
|---|---|
| `src/proxy.ts` | Locale redirects (`/` → `/cs`), nonce CSP, request IDs, private no-store headers |
| `src/app/[locale]/…` | Localized routes (public, `login`, `account`, `admin`); `src/app/api/…` stays unprefixed |
| `src/i18n/` | Routing contract, formats (`cs-CZ`/`en-GB`, `Europe/Prague`), dictionaries per namespace |
| `src/components/shell`, `src/components/ui` | Menu shell, background media controller, language switcher, primitives |
| `src/components/editor` | Tiptap visual editor (admin only) matching rich-text schema v1 |
| `src/modules/*` | Server-only domain modules: access (capabilities/policy), auth, audit, content, media, matches, members, prose, settings |
| `src/cli/*` | Operational CLIs bundled to `dist/cli` (migrate, seed, fixtures, publish-due, provision-local-admin) |
| `tests/`, `e2e/` | PostgreSQL integration harness and Playwright journeys |

Route files stay thin; UI never queries tables directly; database/auth modules import
`server-only`. The documentation reference captures are never bundled as runtime assets.
