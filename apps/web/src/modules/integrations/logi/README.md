# Hosted Logi adapter boundary

Reserved server-only transport/projection boundary for both game sections; no network calls or credentials are added by this handoff. Consume the [versioned contract](../../../../../../docs/integrations/logi/contract.md).

Use fixed configured HTTPS origin, explicit source/guild/game/resource IDs, bounded requests and per-scope reconciliation checkpoints. Never expose the clan bearer key or blindly proxy source DTOs. Public projection and website authorization are separate decisions. Logi writes and production SSO remain gated on verified actor/provider behavior. Reuse existing modules for application records; do not share Logi's Convex database.
