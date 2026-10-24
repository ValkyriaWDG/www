import { describe, expect, it } from 'vitest';
import { testPrincipal } from '@/modules/access/testing';
import { permittedAdminModules } from '@/modules/auth/admin-modules';
import { adminLogiLinks, groupAdminModules } from './admin-workflows';

const hll = { sourceInstanceId: 'synthetic', origin: 'https://logi.example.test', guildId: '100000000000000001', gameId: 'hell_let_loose' };
const wardogs = { ...hll, gameId: 'wardogs' };
const env = { NODE_ENV: 'test', LOGI_SOURCES_JSON: JSON.stringify([hll, wardogs]) };

describe('Logi-first administration', () => {
  it('keeps editorial, configuration and integration health primary while retaining historical repair tools', () => {
    const groups = groupAdminModules(permittedAdminModules(testPrincipal(['administrator'])));
    expect(groups.website.map((module) => module.key)).toEqual(['news', 'manual', 'content', 'taxonomy', 'media', 'settings', 'integrations', 'audit']);
    expect(groups.archive.map((module) => module.key)).toEqual(['matches', 'tournaments', 'members']);
    expect(groups.archive.map((module) => module.path)).toEqual(['/admin/matches', '/admin/tournaments', '/admin/members']);
  });

  it('does not introduce new permissions while moving modules to a secondary group', () => {
    const groups = groupAdminModules(permittedAdminModules(testPrincipal(['match_manager'], { games: ['wardogs'] })));
    expect(groups.website).toEqual([]);
    expect(groups.archive.map((module) => module.key)).toEqual(['matches', 'tournaments']);
  });

  it('links to the configured entry point once for both games without exposing tenant identifiers or keys', () => {
    const links = adminLogiLinks({ ...env, LOGI_DATA_API_KEY_HLL: 'synthetic-secret-not-for-browser' }, testPrincipal(['administrator']));
    expect(links).toEqual([{ href: hll.origin, games: ['hll', 'wardogs'] }]);
    expect(JSON.stringify(links)).not.toContain(hll.guildId);
    expect(JSON.stringify(links)).not.toContain('synthetic-secret');
  });

  it('limits entry links and game labels to the actor’s game scope', () => {
    const actor = testPrincipal(['match_manager'], { games: ['wardogs'] });
    expect(adminLogiLinks(env, actor)).toEqual([{ href: hll.origin, games: ['wardogs'] }]);
    expect(adminLogiLinks({ ...env, LOGI_SOURCES_JSON: JSON.stringify([hll]) }, actor)).toEqual([]);
  });

  it('retains distinct configured origins without inventing a dashboard or workspace route', () => {
    const separated = { ...env, LOGI_SOURCES_JSON: JSON.stringify([hll, { ...wardogs, origin: 'https://wardogs.example.test' }]) };
    expect(adminLogiLinks(separated, testPrincipal(['administrator']))).toEqual([
      { href: hll.origin, games: ['hll'] },
      { href: 'https://wardogs.example.test', games: ['wardogs'] },
    ]);
  });

  it.each(['javascript:alert(1)', 'https://user:secret@logi.example.test', 'https://logi.example.test/?target=other', 'https://logi.example.test/other', 'http://logi.example.test'])('does not render an unsafe origin: %s', (origin) => {
    expect(adminLogiLinks({ ...env, LOGI_SOURCES_JSON: JSON.stringify([{ ...hll, origin }]) }, testPrincipal(['administrator']))).toEqual([]);
  });

  it('fails closed for absent or malformed provider configuration', () => {
    expect(adminLogiLinks({}, testPrincipal(['administrator']))).toEqual([]);
    expect(adminLogiLinks({ LOGI_SOURCES_JSON: '{' }, testPrincipal(['administrator']))).toEqual([]);
  });

  it('does not offer provider navigation with missing or stale administrative authority', () => {
    expect(adminLogiLinks(env, { kind: 'anonymous' })).toEqual([]);
    expect(adminLogiLinks(env, testPrincipal(['member']))).toEqual([]);
    expect(adminLogiLinks(env, testPrincipal(['administrator'], { status: 'stale' }))).toEqual([]);
  });
});
