import { defineConfig } from 'drizzle-kit';

// Generation only reads the TypeScript schema. Migrations are applied through the
// explicit runner (apps/web/src/cli/migrate.ts), never through `drizzle-kit push`.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
});
