import { randomInt } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import pg from 'pg';
import { e2eDatabaseUrl } from './support/database-url';

/*
 * Helpers for the community administration browser tests. Direct database reads are
 * test-only assertions against the disposable e2e database; every change under test is
 * made through the real UI and server actions.
 */

let pool: pg.Pool | undefined;
export function e2eDb(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: e2eDatabaseUrl(), max: 2, allowExitOnIdle: true });
  return pool;
}

export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${randomInt(100, 999)}`;
}

export async function matchBySlug(slug: string) {
  const result = await e2eDb().query<{ id: string; status: string; publication: string; version: number; starts_at: Date; original_starts_at: Date | null }>(
    'select id, status, publication, version, starts_at, original_starts_at from match where slug = $1',
    [slug],
  );
  return result.rows[0] ?? null;
}

export async function matchByOpponent(opponent: string) {
  const result = await e2eDb().query<{ id: string; slug: string; status: string; publication: string; version: number }>(
    'select id, slug, status, publication, version from match where opponent_name = $1',
    [opponent],
  );
  return result.rows[0] ?? null;
}

export async function memberBySlug(slug: string) {
  const result = await e2eDb().query<{ id: string; display_name: string; state: string; consent_confirmed_at: Date | null }>(
    'select id, display_name, state, consent_confirmed_at from member_profile where slug = $1',
    [slug],
  );
  return result.rows[0] ?? null;
}

export async function auditCount(where: { action: string; outcome?: string; entityId?: string; actorLabel?: string }): Promise<number> {
  const result = await e2eDb().query<{ n: string }>(
    `select count(*)::text as n from audit_event
      where action = $1 and ($2::text is null or outcome = $2) and ($3::text is null or entity_id = $3) and ($4::text is null or actor_label = $4)`,
    [where.action, where.outcome ?? null, where.entityId ?? null, where.actorLabel ?? null],
  );
  return Number(result.rows[0]?.n ?? 0);
}

/** ISO date `days` from now in Europe/Prague (YYYY-MM-DD). */
export function pragueDate(days: number): string {
  const instant = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/** Fills the Identity + Schedule groups of the new-match form. */
export async function fillNewMatch(page: Page, input: { opponent: string; shortCode?: string; date: string; time: string; zone?: string; competition?: string }) {
  await page.getByLabel(/^(Název soupeře|Opponent name)/).fill(input.opponent);
  if (input.shortCode) await page.getByLabel(/^(Zkratka soupeře|Opponent short code)/).fill(input.shortCode);
  if (input.competition) await page.getByLabel(/^(Název soutěže|Competition name)/).fill(input.competition);
  await page.getByLabel(/^(Datum začátku|Start date)/).fill(input.date);
  await page.getByLabel(/^(Čas začátku|Start time)/).fill(input.time);
  if (input.zone) await page.getByLabel(/^(Časové pásmo|Time zone)/).selectOption(input.zone);
}

/** Waits until a server action finished and the editor shows the given status badge. */
export async function expectMatchState(page: Page, state: { status?: string; publication?: string }) {
  if (state.status) await expect(page.locator(`[data-match-status="${state.status}"]`)).toBeVisible();
  if (state.publication) await expect(page.locator(`[data-match-publication="${state.publication}"]`)).toBeVisible();
}
