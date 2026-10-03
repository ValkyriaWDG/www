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

## Approved reader fixtures (issue #87, producer branch `pr-158` at `c42ea770c307793494ae159a924f86e3c6ced50d`)

- `league-v0.12-stale-http.json`: copied without changes from
  `docs/integrations/website/v0.12/evidence/2026-10-02-league/stale-http.json`. It is the
  producer's recorded local HTTP evidence of one real public Wardogs League detail page
  (team codes/names and public counts as displayed on `wardogsleague.net`) served as a
  stale snapshot plus a snapshot-less cooldown response; the rate limit was injected
  locally, not observed upstream. `results` is `null` as in every parser-1 read.
- `warcon-v0.11.json`: not a captured exchange. The `live` and `matches` envelopes were
  assembled from the synthetic generator `src/infrastructure/testing/warcon.ts` (values
  unchanged, the generator's non-contract `error` field omitted as the producer's
  `z.object` projection strips it) in the `{data: WarconEnvelope}` shape of
  `src/lib/api/warcon-route.ts`. The Steam ID and player name are synthetic.

Consumer tests parse these against the closed reader schemas and prove that no
player row, Steam ID, panel/server identifier, connection ID or moderator text
reaches a website DTO. Neither file establishes hosted producer acceptance.
