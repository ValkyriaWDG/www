import { describe, expect, it } from 'vitest';
import { assertFixturesAllowed, databaseNameFromUrl, FixtureGuardError } from './guard';

describe('fixture guard', () => {
  it('requires the explicit --allow-fixtures flag', () => {
    expect(() => assertFixturesAllowed({ argv: [], nodeEnv: 'development', databaseName: 'valkyria_dev' })).toThrowError(FixtureGuardError);
    expect(() => assertFixturesAllowed({ argv: ['--allow-fixtures'], nodeEnv: 'development', databaseName: 'valkyria' })).not.toThrow();
  });

  it('refuses production unless the database name marks a dev/test/e2e target', () => {
    expect(() => assertFixturesAllowed({ argv: ['--allow-fixtures'], nodeEnv: 'production', databaseName: 'valkyria' })).toThrowError(FixtureGuardError);
    expect(() => assertFixturesAllowed({ argv: ['--allow-fixtures'], nodeEnv: 'production', databaseName: 'valkyria_dev_backup' })).toThrowError(
      FixtureGuardError,
    );
    for (const name of ['valkyria_dev', 'valkyria_test', 'valkyria_e2e']) {
      expect(() => assertFixturesAllowed({ argv: ['--allow-fixtures'], nodeEnv: 'production', databaseName: name })).not.toThrow();
    }
  });

  it('extracts the database name without exposing credentials', () => {
    expect(databaseNameFromUrl('postgresql://user:secret@localhost:5432/valkyria_e2e')).toBe('valkyria_e2e');
    expect(() => databaseNameFromUrl(undefined)).toThrowError(FixtureGuardError);
    expect(() => databaseNameFromUrl('postgresql://user:secret@localhost:5432/')).toThrowError(FixtureGuardError);
  });
});
