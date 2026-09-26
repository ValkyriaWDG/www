import { describe, expect, it } from 'vitest';
import { parseRoleMapping, rolesForRoleIds } from './role-mapping';

describe('parseRoleMapping', () => {
  it('accepts strings and arrays of mappable roles and canonicalizes them', () => {
    const parsed = parseRoleMapping(JSON.stringify({ '200000000000000002': ['editor', 'editor'], '200000000000000001': 'member' }));
    expect(parsed.ok).toBe(true);
    expect(parsed.mapping).toEqual({ '200000000000000001': ['member'], '200000000000000002': ['editor'] });
    const reordered = parseRoleMapping(JSON.stringify({ '200000000000000001': ['member'], '200000000000000002': 'editor' }));
    expect(reordered.digest).toBe(parsed.digest);
  });

  it('treats an empty value as an empty (valid) mapping', () => {
    expect(parseRoleMapping('')).toMatchObject({ ok: true, mapping: {} });
    expect(parseRoleMapping(undefined)).toMatchObject({ ok: true, mapping: {} });
  });

  it.each([
    ['{"200000000000000001": "owner"}', 'invalid_role'],
    ['{"200000000000000001": ["editor", "owner"]}', 'invalid_role'],
    ['{"200000000000000001": "superuser"}', 'invalid_role'],
    ['{"200000000000000001": "Administrator"}', 'invalid_role'],
    ['{"200000000000000001": []}', 'empty_roles'],
    ['{"Moderators": "editor"}', 'invalid_role_id'],
    ['{"1234": "editor"}', 'invalid_role_id'],
    ['{"200000000000000001": 7}', 'invalid_role'],
    ['["editor"]', 'not_an_object'],
    ['null', 'not_an_object'],
    ['{not json', 'invalid_json'],
  ])('rejects %s (%s) and grants nothing', (json, error) => {
    const parsed = parseRoleMapping(json);
    expect(parsed).toMatchObject({ ok: false, error, digest: null });
    expect(parsed.mapping).toEqual({});
    expect(rolesForRoleIds(parsed.mapping, ['200000000000000001'])).toEqual([]);
  });
});

describe('rolesForRoleIds', () => {
  it('maps only explicitly configured role IDs', () => {
    const { mapping } = parseRoleMapping(JSON.stringify({ '200000000000000002': 'editor', '200000000000000003': ['match_manager', 'editor'] }));
    expect(rolesForRoleIds(mapping, ['200000000000000003', '999999999999999999'])).toEqual(['editor', 'match_manager']);
    expect(rolesForRoleIds(mapping, [])).toEqual([]);
  });
});
