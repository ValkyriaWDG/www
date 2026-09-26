import { describe, expect, it } from 'vitest';
import robots from './robots';

describe('robots', () => {
  it('keeps private areas out of indexing and advertises the sitemap', () => {
    process.env.APP_URL = 'https://valkyriawdg.cz';
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rule?.disallow).toEqual(expect.arrayContaining(['/api/', '/cs/admin', '/en/admin', '/cs/account']));
    expect(result.sitemap).toMatch(/\/sitemap\.xml$/);
  });
});
