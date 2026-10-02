import { createDb } from '@valkyria/db';
import { getServerEnv } from '@/lib/env';
import { runLogiSync } from '@/modules/integrations/logi-runner';

async function main() {
  const env = getServerEnv();
  if (!env.DATABASE_URL) throw new Error('Missing database configuration');
  const handle = createDb(env.DATABASE_URL, { max: 3, applicationName: 'valkyria-logi-sync' });
  try {
    const outcomes = await runLogiSync(handle.db, env);
    console.log(JSON.stringify({ event: 'logi.sync', outcomes }));
    return outcomes.some((row) => row.state === 'failed') ? 1 : 0;
  } finally { await handle.close(); }
}
main().then((code) => { process.exitCode = code; }, () => { console.error('Logi synchronization failed; inspect configured source and database availability.'); process.exitCode = 1; });
