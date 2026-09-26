import { setTimeout } from 'node:timers/promises';

export async function waitForFixtureDatabase(docker, container, database, wait = setTimeout) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      // The official entrypoint's temporary initialization server is socket-only.
      // TCP avoids accepting it immediately before shutdown and final startup.
      docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'test', '-d', database]);
      return;
    } catch {
      if (attempt < 59) await wait(500);
    }
  }
  throw new Error('Disposable PostgreSQL TCP readiness timed out');
}
