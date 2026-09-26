import { describe, expect, it } from 'vitest';
import { isSafeLoginErrorPath, isSafeReturnPath, loginErrorPath, sanitizeReturnPath } from './return-path';

describe('sanitizeReturnPath', () => {
  it.each([
    ['/cs/admin/news', '/cs/admin/news'],
    ['/en/account', '/en/account'],
    ['/cs', '/cs'],
    ['/en/news?page=2', '/en/news?page=2'],
  ])('accepts localized same-origin path %s', (input, expected) => {
    expect(sanitizeReturnPath(input, 'cs')).toBe(expected);
  });

  it.each([
    'https://evil.example',
    'https://evil.example/cs/admin',
    '//evil.example',
    '//evil.example/cs/admin',
    '/\\evil',
    '/\\/evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:text/html,hi',
    '/de/admin',
    '/admin',
    '/api/auth/sign-out',
    '/cs/api/auth',
    '/cs/../api/auth/get-session',
    '/cs/./admin',
    '/cs//admin',
    '/cs/%2e%2e/api',
    '/cs%2F%2Fevil.example',
    '/cs/admin\n',
    '/cs/admin\t',
    '/cs/login',
    '/cs/login/recovery',
    ' /cs/admin',
    '',
    `/cs/${'a'.repeat(600)}`,
  ])('falls back to the account page for %j', (input) => {
    expect(sanitizeReturnPath(input, 'cs')).toBe('/cs/account');
    expect(sanitizeReturnPath(input, 'en')).toBe('/en/account');
  });

  it('rejects non-string input', () => {
    expect(sanitizeReturnPath(undefined, 'en')).toBe('/en/account');
    expect(sanitizeReturnPath(['/cs/admin'], 'cs')).toBe('/cs/account');
    expect(sanitizeReturnPath({ toString: () => '/cs/admin' }, 'cs')).toBe('/cs/account');
  });

  it('drops fragments', () => {
    expect(sanitizeReturnPath('/cs/news#top', 'cs')).toBe('/cs/news');
  });
});

describe('OAuth callback targets', () => {
  it('recognizes only canonical safe return paths', () => {
    expect(isSafeReturnPath('/cs/account')).toBe(true);
    expect(isSafeReturnPath('/en/admin/matches')).toBe(true);
    expect(isSafeReturnPath('//evil.example')).toBe(false);
    expect(isSafeReturnPath('/cs/login')).toBe(false);
  });

  it('builds and validates localized login error paths', () => {
    expect(loginErrorPath('cs')).toBe('/cs/login');
    expect(loginErrorPath('en', '/en/admin')).toBe('/en/login?returnTo=%2Fen%2Fadmin');
    expect(loginErrorPath('en', 'https://evil.example')).toBe('/en/login');
    expect(isSafeLoginErrorPath('/cs/login')).toBe(true);
    expect(isSafeLoginErrorPath('/en/login?returnTo=%2Fen%2Fadmin')).toBe(true);
    expect(isSafeLoginErrorPath('/en/login?returnTo=https%3A%2F%2Fevil.example')).toBe(false);
    expect(isSafeLoginErrorPath('/en/login?next=%2Fen%2Fadmin')).toBe(false);
    expect(isSafeLoginErrorPath('/cs/admin')).toBe(false);
    expect(isSafeLoginErrorPath('https://evil.example/cs/login')).toBe(false);
    expect(isSafeLoginErrorPath('//evil.example/cs/login')).toBe(false);
  });
});
