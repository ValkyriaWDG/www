---
name: valkyria-auth
description: Implement or review Valkyria Discord login, session handling, role authorization, local administrator MFA and delegated publication security.
---

# Valkyria authentication and access

The [auth/RBAC contract](../../../docs/security/auth-rbac.md) is authoritative. Read it for any identity, session, role, recovery, private-query or delegated-publication change. Follow the [working agreement](../../../AGENTS.md) and [current status](../../../docs/STATUS.md); do not assume auth is already implemented.

## Execute

1. Identify the principal, credential/session assurance, capability, object scope and relevant freshness/revocation rule. Trace every affected server action, endpoint and private query, including alternate/direct request paths.
2. Inspect pinned Better Auth/Discord integration versions and use their official documentation for actual APIs. Let the maintained library handle authentication primitives; implement the project's policy centrally rather than trusting a UI or library default.
3. Keep Discord identity distinct from membership, publication consent and application privileges. Use explicit role-ID mapping, server refresh/version checks and durable sessions; no first-user admin or matching-email identity linking.
4. Preserve the separate provisioned local grant path. Interactive use requires credential login plus MFA; social linking/callbacks cannot unlock it. Valid local recovery must work during Discord outage without claiming Discord membership was verified.
5. For scheduled publication, apply the exact durable delegation and issuer revalidation rules in the policy. Never replay an old session/MFA token or let a narrowly scoped publication intent become general administrative authority.
6. Follow the [authentication workflow](../../../docs/engineering/application-workflows.md#authentication) and the policy's negative-case requirements. Denials and recovery behavior are part of the implementation, not optional hardening later.

## Evidence and handover

Exercise direct server requests with synthetic identities, real policy/session persistence and mocked provider adapters. Cover affected scope escalation, stale/revoked roles, incomplete MFA, account linking, expiry and outage paths. Inspect logs and response DTOs for secrets/private state.

Missing provider credentials require an unavailable-provider UI and explicit live-verification limitation, not a development bypass in production. Report the tested assurance boundary, commands/results and unverified live cases. Do not provision real users, send Discord messages or access production as an implicit part of this skill.
