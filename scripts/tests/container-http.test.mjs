import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import test from 'node:test';
import { containerHttp } from '../release/container-http.mjs';

const execute = promisify(execFile);
const docker = async (args) => {
  assert.deepEqual(args.slice(0, 4), ['exec', 'fixture', 'node', '-e']);
  return (await execute(process.execPath, ['-e', args[4]], { maxBuffer: 4 * 1024 * 1024 })).stdout;
};

test('isolated HTTP probe preserves real status, JSON and binary bytes without a published port', async () => {
  const bytes = Buffer.from([0, 255, 10, 128, 42]);
  const server = createServer((req, res) => {
    if (req.url === '/media') { res.setHeader('Content-Type', 'image/webp'); res.end(bytes); }
    else { res.statusCode = 503; res.setHeader('Content-Type', 'application/json'); res.end('{"status":"unready"}'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const ready = await containerHttp(docker, 'fixture', '/api/health/ready', { port });
    assert.equal(ready.status, 503);
    assert.deepEqual(await ready.json(), { status: 'unready' });
    const media = await containerHttp(docker, 'fixture', '/media', { port });
    assert.equal(media.headers.get('content-type'), 'image/webp');
    assert.deepEqual(Buffer.from(await media.arrayBuffer()), bytes);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('isolated HTTP probe bounds delayed and oversized responses and rejects redirects', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/large') res.end(Buffer.alloc(2 * 1024 * 1024 + 1));
    else if (req.url === '/redirect') { res.statusCode = 302; res.setHeader('Location', '/large'); res.end(); }
    else res.writeHead(200).flushHeaders();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    await assert.rejects(containerHttp(docker, 'fixture', '/delay', { port, timeoutMs: 100 }));
    await assert.rejects(containerHttp(docker, 'fixture', '/large', { port }), /exceeds 2 MiB/);
    await assert.rejects(containerHttp(docker, 'fixture', '/redirect', { port }));
    const redirect = await containerHttp(docker, 'fixture', '/redirect', { port, redirect: 'manual' });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get('location'), '/large');
    await assert.rejects(containerHttp(docker, 'fixture', '/redirect', { port, redirect: 'follow' }));
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
