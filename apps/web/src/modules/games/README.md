# Shared game context boundary

Implementation placement reserved for the unified platform. This directory contains no runtime code yet.

Reuse the existing database enum: URL hll -> database hell-let-loose -> Logi hell_let_loose; wardogs maps explicitly across all three. Centralize registry/route builders/theme identifiers here without duplicating database enums. Game is a resource and permission scope, independent of locale and login.

Reuse existing modules for content/matches/members/settings. Audit detail queries, previews, exports, homepage teasers and cache keys as well as list filters. Keep global hub/account/privacy/admin routes separate from game views. Do not create a second app/database or change route behavior merely by adding this directory.

See [implementation order](../../../../../docs/implementation/hll/README.md).
