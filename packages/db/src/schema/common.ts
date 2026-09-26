import { sql } from 'drizzle-orm';
import { timestamp } from 'drizzle-orm/pg-core';

/** Supported UI/content locales. Locale identifiers are not flag country codes. */
export const LOCALES = ['cs', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Stable game identifiers shared across locales; labels live in UI dictionaries. */
export const GAMES = ['wardogs', 'hell-let-loose'] as const;
export type Game = (typeof GAMES)[number];

/** Builds a SQL `IN (...)` list from a readonly allowlist for CHECK constraints. */
export function sqlList(values: readonly string[]) {
  return sql.raw(values.map((value) => `'${value.replaceAll("'", "''")}'`).join(', '));
}

export const createdAt = () => timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
export const updatedAt = () => timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
export const tz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
