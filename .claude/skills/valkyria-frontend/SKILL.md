---
name: valkyria-frontend
description: Implement or review Valkyria public screens and administration UI including the Wardogs menu, visual editor, responsive behavior and browser evidence.
---

# Valkyria frontend

Apply the [working agreement](../../../AGENTS.md) and inspect [current status](../../../docs/STATUS.md) first. This repository starts as a foundation; confirm which routes, dependencies and package scripts actually exist before coding or reporting checks.

## Intake

- Identify the assigned screen, user journey and milestone in the [screen map](../../../docs/design/screen-map.md).
- Read the relevant [visual specification](../../../docs/design/visual-spec.md) and open the actual [reference images](../../../docs/design/references/README.md). Main-menu, list/detail and dialog references serve different screens.
- Read the [localization contract](../../../docs/product/localization.md): Czech-first `cs` / `en` public/account/admin UI, URL-prefixed routes and bilingual labels; code/docs/prompts stay English. For posts, media or match forms, also read [editorial and match requirements](../../../docs/product/editorial-and-matches.md).

## Execute

1. Inspect the route/layout/component boundary and existing styles. Build the smallest complete user journey using the selected App Router, TypeScript, CSS variables/modules and existing primitives.
2. Preserve the landscape-led menu, faded clan crest, sharp panels and amber navigation. Localized News and HLL links remain prominent. Implement Czech/UK flags with Čeština/English, CS/EN and accessible names, preserving safe entity/filter state and guarding unsaved drafts. Bare `/` returns HTTP 307 to `/cs`; the URL is authoritative, no browser/cookie locale detection applies, and English system route segments stay unchanged.
3. Keep database/auth internals outside client components. Public pages receive published DTOs; admin clients receive only the authorized fields needed for their task, never credentials. Add client code for interaction; public articles must not download Tiptap. UI visibility never replaces server authorization.
4. Implement both locales' loading, empty, error, pending, long-content and access-loss states. Rich editing needs actual toolbar/media/preview/save behavior and independent content translations; a textarea is insufficient. A missing published article counterpart switches to the target-language list with notice and safe source link, never a draft or auto-translation.
5. Follow the [frontend workflow](../../../docs/engineering/application-workflows.md#frontend) for browser, media, accessibility and visual verification. Inspect the results and fix material failures before extending the pattern.

## Evidence and handover

Use actual available checks from the [verification matrix](../../../docs/implementation/verification.md), not invented passing scripts. Capture deterministic Czech and English desktop/mobile screenshots for a visual change, including Czech font glyphs and relevant switcher/keyboard/failure state. Prove locale routes and independent translation publication boundaries. For video changes, inspect network requests under reduced motion/data saving; paused playback alone does not prove no download.

Report changed behavior, routes, screenshot paths, commands/results and concrete limitations. Update the scoped status/checkpoint. Missing final video or live OAuth is recorded separately from tested fallback/adapter behavior; do not wait for those inputs to finish independent UI work.

Attach selected real screenshots with descriptive captions and tested browser/viewport,
environment/revision to the PR and related issue/incident acceptance summary. Follow
[the evidence policy](../../../docs/engineering/evidence.md); local paths alone do
not count as delivered screenshots, and unavailable capture/upload blocks visual acceptance.
