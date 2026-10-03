# Hosted Logi integration

Both HLL and Wardogs target Ninjonik's hosted instance at https://logi.igportals.eu,
API base `/api/v1`. Website adapters are implemented; production activation is a
separate step. Public API documentation does not demonstrate tenant access or SSO.

Start with the [current capability and readiness audit](readiness-2026-10-03.md),
then the [operator runbook](runbook.md), [people synchronization](people.md),
[Wardogs servers](wardogs-servers.md) and the
[retained Warcon game history](warcon-history.md). The implemented producer is
[Ninjonik/logi PR #158](https://github.com/Ninjonik/logi/pull/158), reviewed at
`c42ea770c307793494ae159a924f86e3c6ced50d` on 2026-10-03. Its merge/deployment and
the hosted grants must be checked again before activation. The older
[contract 0.2](contract.md) records initial architectural decisions; use the
versioned producer contract and current consumer schemas for exact wire shapes.

Logi owns connected events, signup/roster/attendance and Discord workflows. The
website owns news, FAQ, Field Manual, historical editorial content and profile
publication consent. See the [editor guide](../../operations/editor-guide.md).
Public projections and game-scoped permissions are separate from service-key
access: retain exact source/guild/game identity and never infer access from a
directory, nickname, Steam ID or published roster. Use synthetic fixtures until
approved live inputs arrive. Keep unresolved authentication findings in authorized
private coordination.
