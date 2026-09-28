# Security reporting

Report vulnerabilities using [GitHub private vulnerability reporting](https://github.com/ValkyriaWDG/www/security/advisories/new).
Do not put exploitable details, credentials or private member information in public issues.
If private reporting is unavailable, contact the repository owner through GitHub
to arrange a private channel before sharing details.

Report against the current `main` revision or identify the affected deployed image
and source revision. The application exists; [status](docs/STATUS.md) distinguishes
accepted source, historical deployment evidence and outstanding operator checks.
Merging a fix does not establish that every deployment has received it.
Reports should include the affected revision, impact, minimal reproduction and
suggested mitigation. Never test against live services without explicit authorization.

Design requirements: [auth/RBAC](docs/security/auth-rbac.md),
[verification](docs/implementation/verification.md), [deployment](docs/operations/deployment.md).
