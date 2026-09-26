import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function validateReleaseRevision(expected, actual) {
  if (!/^[0-9a-f]{40}$/.test(expected ?? '')) return 'Expected revision must be a full lowercase Git SHA.';
  if (!/^[0-9a-f]{40}$/.test(actual ?? '')) return 'Workflow revision must be a full lowercase Git SHA.';
  if (expected !== actual) return 'Workflow revision differs from the accepted revision; publication is blocked.';
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const error = validateReleaseRevision(process.env.EXPECTED_SHA, process.env.GITHUB_SHA);
  if (error) {
    console.error(error);
    process.exitCode = 1;
  } else console.log('Workflow revision matches the accepted revision. Other publication gates still apply.');
}
