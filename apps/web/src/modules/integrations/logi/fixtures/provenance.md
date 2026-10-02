# Synthetic producer fixtures

These JSON files are copied without changes from the public Logi repository at
`61cae6f5e86fe2a20840c452b6ca9c4c32712bf6` (PR #158). They contain synthetic
identities and do not establish hosted/provider acceptance.

- `v0.4.json`: `docs/integrations/website/v0.4/fixtures.json`
- `v0.5.json`: `docs/integrations/website/v0.5/fixtures.json`
- `v0.6.json`: `docs/integrations/website/v0.6/fixtures.json`
- `v0.7.json`: `docs/integrations/website/v0.7/fixtures.json`
- `result-*.json`: `docs/integrations/website/v0.10/fixtures/*.json`

Consumer tests validate these against this adapter's closed wire schemas and then
exercise explicit website publication, freshness and game/tenant boundaries.
