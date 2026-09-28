import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForFixtureDatabase } from '../release/fixture-readiness.mjs';

test('a temporary socket-only init server cannot release fixture readiness', async () => {
  let tcpStarted = false;
  let probes = 0;
  let waits = 0;
  const docker = (args) => {
    probes++;
    // Official entrypoint initialization accepts Unix-socket connections before
    // replacing that temporary server with the TCP-listening application server.
    const host = args.includes('-h') ? args[args.indexOf('-h') + 1] : null;
    if (host && !tcpStarted) throw new Error('connection refused');
    if (host) assert.equal(host, '127.0.0.1');
  };
  await waitForFixtureDatabase(docker, 'disposable-pg', 'fixture_test', async (ms) => {
    assert.equal(ms, 500);
    waits++;
    tcpStarted = true;
  });
  assert.equal(tcpStarted, true, 'readiness must wait for TCP, not the temporary socket');
  assert.equal(probes, 2);
  assert.equal(waits, 1);
});

test('an unavailable database fails after a bounded readiness window', async () => {
  let probes = 0;
  let waits = 0;
  await assert.rejects(
    waitForFixtureDatabase(() => {
      probes++;
      throw new Error('connection refused');
    }, 'disposable-pg', 'fixture_test', async () => { waits++; }),
    /TCP readiness timed out/,
  );
  assert.equal(probes, 60);
  assert.equal(waits, 59);
});
