# Security reporting

Report vulnerabilities using [GitHub private vulnerability reporting](https://github.com/ValkyriaWDG/www/security/advisories/new).
Do not put exploitable details, credentials or private member information in public issues.
If private reporting is unavailable, contact the repository owner through GitHub
to arrange a private channel before sharing details.

The repository is in foundation development. No production release is supported yet.
Reports should include the affected revision, impact, minimal reproduction and
suggested mitigation. Never test against live services without explicit authorization.

Design requirements: [auth/RBAC](docs/security/auth-rbac.md),
[verification](docs/implementation/verification.md), [deployment](docs/operations/deployment.md).
