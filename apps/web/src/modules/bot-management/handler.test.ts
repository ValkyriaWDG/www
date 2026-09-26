import { describe, expect, it, vi } from 'vitest';
import { testPrincipal } from '@/modules/access/testing';
import { BotError } from './contracts';
import { handleBotRequest, type BotDependencies } from './handler';

const origin = 'https://website.invalid';
const update = { expectedRevision: '0', settings: { defaultLocale: 'en', serverLabels: { primary: 'Valkyria' } }, reason: 'Presentation change' };
function dependencies() {
  const actor = testPrincipal(['administrator']);
  return { origin, identity: vi.fn(async () => ({ actor, discordUserId: '300000000000000004' })), audit: vi.fn(async () => {}), client: { status: vi.fn(async () => ({})), settings: vi.fn(async () => ({ desired: { revision: '0', settings: update.settings } })), update: vi.fn(async () => ({ desired: { revision: '1', settings: update.settings }, effective: null, applyState: 'pending', schemaVersion: 1 })) } } as unknown as BotDependencies;
}
const patch = (data: unknown = update, requestOrigin = origin) => new Request(origin + '/api/admin/bot', { method: 'PATCH', headers: { Origin: requestOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
describe('actual bot administration handler', () => {
  it('rejects CSRF, browser identities and unsupported controls before bot I/O', async () => {
    const deps = dependencies();
    expect((await handleBotRequest(patch(update, 'https://evil.invalid'), deps)).status).toBe(403);
    expect((await handleBotRequest(patch({ ...update, actorId: '999999999999999999' }), deps)).status).toBe(400);
    expect(deps.client!.update).not.toHaveBeenCalled();
  });
  it('audits before dispatch, then rechecks actor and never sends if audit or recheck fails', async () => {
    const deps = dependencies();
    vi.mocked(deps.audit).mockRejectedValueOnce(new Error('SECRET DB DETAIL'));
    expect((await handleBotRequest(patch(), deps)).status).toBe(503);
    expect(deps.client!.update).not.toHaveBeenCalled();
    vi.mocked(deps.identity).mockResolvedValueOnce({ actor: testPrincipal(['administrator']), discordUserId: '300000000000000004' }).mockRejectedValueOnce(new BotError('forbidden'));
    expect((await handleBotRequest(patch(), deps)).status).toBe(403);
    expect(deps.client!.update).not.toHaveBeenCalled();
  });
  it('separates read/configure authority and refuses a stale actor or local recovery identity', async () => {
    for (const actor of [testPrincipal(['editor']), testPrincipal(['administrator'], { status: 'stale' }), testPrincipal(['administrator'], { source: 'local_admin' })]) {
      const deps = dependencies(); vi.mocked(deps.identity).mockResolvedValue({ actor, discordUserId: '300000000000000004' });
      expect((await handleBotRequest(patch(), deps)).status).toBe(403);
      expect(deps.client!.update).not.toHaveBeenCalled();
    }
  });
  it('uses server actor and correlation ID, returns no-store, and reports pending honestly', async () => {
    const deps = dependencies(); const result = await handleBotRequest(patch(), deps);
    expect(result.status).toBe(202); expect(result.headers.get('Cache-Control')).toContain('no-store');
    expect(deps.client!.update).toHaveBeenCalledWith('300000000000000004', expect.objectContaining({ expectedRevision: '0', correlationId: expect.any(String) }));
    expect(deps.audit).toHaveBeenCalledTimes(2);
    expect(await result.json()).toMatchObject({ ok: true, settings: { applyState: 'pending' } });
  });
  it('keeps uncertain outcomes distinct and does not retry when terminal audit fails', async () => {
    const deps = dependencies(); vi.mocked(deps.audit).mockResolvedValueOnce().mockRejectedValueOnce(new Error('PRIVATE'));
    const result = await handleBotRequest(patch(), deps);
    expect(await result.json()).toEqual({ ok: false, code: 'unknown_outcome' });
    expect(deps.client!.update).toHaveBeenCalledTimes(1);
  });
  it('rejects a body whose transport never completes before its deadline, even if the prefix is valid JSON', async () => {
    vi.useFakeTimers();
    try {
      const deps = dependencies();
      const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify(update))); } });
      const request = new Request(origin + '/api/admin/bot', { method: 'PATCH', headers: { Origin: origin, 'Content-Type': 'application/json' }, body, duplex: 'half' } as RequestInit);
      const pending = handleBotRequest(request, deps);
      await vi.advanceTimersByTimeAsync(5001);
      expect((await pending).status).toBe(400);
      expect(deps.client!.update).not.toHaveBeenCalled();
      expect(deps.audit).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
});
