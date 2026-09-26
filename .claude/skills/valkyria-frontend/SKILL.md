---
name: valkyria-frontend
description: Implement or review Valkyria public screens and administration UI including the Wardogs menu, visual editor, responsive behavior and browser evidence.
---

# Valkyria frontend

Apply the [working agreement](../../../AGENTS.md) and inspect [current status](../../../docs/STATUS.md) first. This repository starts as a foundation; confirm which routes, dependencies and package scripts actually exist before coding or reporting checks.

## Intake

- Identify the assigned screen, user journey and milestone in the [screen map](../../../docs/design/screen-map.md).
- Read the relevant [visual specification](../../../docs/design/visual-spec.md) and open the actual [reference images](../../../docs/design/references/README.md). Main-menu, list/detail and dialog references serve different screens.
- For posts, media or match forms, read [editorial and match requirements](../../../docs/product/editorial-and-matches.md). Keep the accepted English-only interface and route names.

## Execute

1. Inspect the route/layout/component boundary and existing styles. Build the smallest complete user journey using the selected App Router, TypeScript, CSS variables/modules and existing primitives.
2. Preserve the landscape-led menu, faded clan crest, sharp panels and amber navigation. `NEWS` is primary navigation; `HLL WEBSITE` remains visible on desktop/mobile. Use real URLs, history, headings and focus behavior.
3. Keep database/auth internals outside client components. Public pages receive published DTOs; admin clients receive only the authorized fields needed for their task, never credentials. Add client code for interaction; public articles must not download Tiptap. UI visibility never replaces server authorization.
4. Implement loading, empty, error, pending, long-content and access-loss states that apply to the journey. Rich editing needs actual toolbar/media/preview/save behavior; a textarea is insufficient.
5. Follow the [frontend workflow](../../../docs/engineering/application-workflows.md#frontend) for browser, media, accessibility and visual verification. Inspect the results and fix material failures before extending the pattern.

## Evidence and handover

Use actual available checks from the [verification matrix](../../../docs/implementation/verification.md), not invented passing scripts. Capture deterministic desktop/mobile screenshots for a visual change, including the relevant keyboard or failure state. For video changes, inspect network requests under reduced motion/data saving; paused playback alone does not prove no download.

Report changed behavior, routes, screenshot paths, commands/results and concrete limitations. Update the scoped status/checkpoint. Missing final video or live OAuth is recorded separately from tested fallback/adapter behavior; do not wait for those inputs to finish independent UI work.
