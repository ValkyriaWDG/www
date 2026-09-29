import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Executor } from '@valkyria/db';
import { GET } from '@/app/api/legacy/hll/route';

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), db: vi.fn(() => ({})) }));
vi.mock('@/lib/db', () => ({ getDb: mocks.db }));
vi.mock('./resolve-public-url', () => ({ resolvePublishedLegacyHllUrl: mocks.resolve }));
const originalOrigin = process.env.APP_URL;
afterEach(() => { if (originalOrigin === undefined) delete process.env.APP_URL; else process.env.APP_URL = originalOrigin; vi.clearAllMocks(); });
const request = (query: string) => new Request(`https://untrusted-host.invalid/api/legacy/hll?${query}`);

describe('legacy public alias endpoint', () => {
  it('uses only the configured canonical origin and a published localized result', async () => {
    process.env.APP_URL = 'https://valkyria.cz';
    mocks.resolve.mockResolvedValue('/en/hll/field-manual/published-guide');
    const response = await GET(request('path=/guide/tanky&locale=en'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://valkyria.cz/en/hll/field-manual/published-guide');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.resolve).toHaveBeenCalledWith({} as Executor, '/guide/tanky', 'en');
  });
  it.each(['path=https://evil.invalid/guide/tanky', 'path=//evil.invalid', 'path=/guide/%252e%252e', 'path=/matches/0211', 'path=/guide/tanky&path=/faq', 'path=/faq&locale=de', 'path=/faq&locale=cs&locale=en', 'path=/faq&next=https://evil.invalid', 'path=/api/legacy/hll', 'path=/guide'])('rejects unsafe or non-detail query %s before storage', async (query) => {
    process.env.APP_URL = 'https://valkyria.cz';
    expect((await GET(request(query))).status).toBe(404);
    expect(mocks.db).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it('makes missing, draft and archived targets indistinguishable', async () => {
    process.env.APP_URL = 'https://valkyria.cz';
    mocks.resolve.mockResolvedValue(null);
    const response = await GET(request('path=/clanky/hidden'));
    expect(response.status).toBe(404);
    expect(response.headers.get('location')).toBeNull();
    expect(await response.text()).toBe('Not found');
  });
  it('rejects external or wrong-locale resolver results defensively', async () => {
    process.env.APP_URL = 'https://valkyria.cz';
    for (const target of ['https://evil.invalid', '//evil.invalid', '/en/news/wrong-locale']) {
      mocks.resolve.mockResolvedValue(target);
      expect((await GET(request('path=/faq'))).status).toBe(404);
    }
  });
  it('returns generic uncached unavailability for missing configuration or storage outage', async () => {
    delete process.env.APP_URL;
    expect((await GET(request('path=/faq'))).status).toBe(503);
    expect(mocks.db).not.toHaveBeenCalled();
    process.env.APP_URL = 'https://valkyria.cz';
    mocks.resolve.mockRejectedValue(new Error('PRIVATE-DB-DIAGNOSTIC'));
    const response = await GET(request('path=/faq'));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('PRIVATE-DB');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
