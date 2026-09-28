import { userInfo } from 'node:os';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { createDb, redactConnectionDetails } from '@valkyria/db';
import {
  createLocalAdmin,
  listLocalAdmins,
  parseRoles,
  passwordProblem,
  ProvisioningError,
  resetLocalAdminPassword,
  revokeLocalAdmin,
} from '../modules/auth/local-admin';
import type { Game } from '@valkyria/db';

/**
 * Operator CLI for local recovery administrators (`pnpm admin:provision`, bundled as
 * `scripts/provision-local-admin.mjs`). Passwords are read only from standard input
 * (interactive no-echo prompt or `--password-stdin`), never from arguments or the
 * environment, and are never printed or logged.
 *
 *   create --email <email> --name <label> --roles administrator[,owner,editor,match_manager]
 *          [--games hell-let-loose[,wardogs]] [--expires-at <ISO date>] [--operator <label>] [--password-stdin]
 *   Without --games the grant is platform-wide (all games and community content).
 *   revoke --email <email> [--operator <label>]
 *   reset-password --email <email> [--operator <label>] [--password-stdin]
 *   list
 */

const USAGE = `Usage:
  provision-local-admin create --email <email> --name <label> --roles <role[,role]> [--games <game[,game]>] [--expires-at <iso>] [--operator <label>] [--password-stdin]
  provision-local-admin revoke --email <email> [--operator <label>]
  provision-local-admin reset-password --email <email> [--operator <label>] [--password-stdin]
  provision-local-admin list
Roles: editor, match_manager, administrator, owner. Passwords are read from stdin only.`;

type Args = { command: string | undefined; options: Map<string, string | true> };

const VALUE_FLAGS = new Set(['email', 'name', 'roles', 'games', 'operator', 'expires-at']);
const BOOLEAN_FLAGS = new Set(['password-stdin', 'help']);

function parseArgs(argv: string[]): Args {
  const [command, ...rest] = argv;
  const options = new Map<string, string | true>();
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]!;
    if (!token.startsWith('--')) throw new UsageError(`Unexpected argument "${token.slice(0, 40)}".`);
    const [rawName, inline] = token.slice(2).split(/=(.*)/s, 2) as [string, string | undefined];
    if (rawName === 'password' || rawName.startsWith('password=')) {
      throw new UsageError('Passwords are never accepted as arguments; use the interactive prompt or --password-stdin.');
    }
    if (BOOLEAN_FLAGS.has(rawName)) {
      options.set(rawName, true);
      continue;
    }
    if (!VALUE_FLAGS.has(rawName)) throw new UsageError(`Unknown option --${rawName.slice(0, 40)}.`);
    const value = inline ?? rest[index + 1];
    if (value === undefined || value.startsWith('--')) throw new UsageError(`Option --${rawName} needs a value.`);
    if (inline === undefined) index += 1;
    options.set(rawName, value);
  }
  return { command, options };
}

class UsageError extends Error {}

function required(args: Args, name: string): string {
  const value = args.options.get(name);
  if (typeof value !== 'string' || value.trim() === '') throw new UsageError(`Missing --${name}.`);
  return value;
}

function operatorLabel(args: Args): string {
  const explicit = args.options.get('operator');
  if (typeof explicit === 'string') return explicit;
  try {
    return userInfo().username || 'operator';
  } catch {
    return 'operator';
  }
}

async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > 4096) throw new UsageError('Standard input is too large for a password.');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

/** Prompts on the terminal without echoing the typed characters. */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let muted = false;
    const output = new Writable({
      write(chunk, _encoding, callback) {
        if (!muted) process.stderr.write(chunk);
        callback();
      },
    });
    const rl = createInterface({ input: process.stdin, output, terminal: true });
    rl.on('SIGINT', () => {
      rl.close();
      reject(new UsageError('Cancelled.'));
    });
    rl.question(question, (answer) => {
      rl.close();
      process.stderr.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

async function readPassword(args: Args, context: { email?: string; name?: string }): Promise<string> {
  if (args.options.get('password-stdin') === true) {
    const password = await readAllStdin();
    if (!password) throw new UsageError('No password received on standard input.');
    return password;
  }
  if (!process.stdin.isTTY) throw new UsageError('Provide the password with --password-stdin or run in an interactive terminal.');
  const first = await promptHidden('New password: ');
  const problem = passwordProblem(first, context);
  if (problem) throw new UsageError(`The password ${problem}.`);
  const second = await promptHidden('Repeat password: ');
  if (first !== second) throw new UsageError('The passwords do not match.');
  return first;
}

async function main(): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Invalid arguments.');
    console.error(USAGE);
    return 2;
  }
  if (!args.command || args.options.get('help') === true || !['create', 'revoke', 'reset-password', 'list'].includes(args.command)) {
    console.error(USAGE);
    return 2;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required.');
    return 2;
  }

  const handle = createDb(url, { max: 2, applicationName: 'valkyria-provision-local-admin' });
  try {
    switch (args.command) {
      case 'create': {
        const email = required(args, 'email');
        const name = required(args, 'name');
        const roles = parseRoles(required(args, 'roles'));
        const expiresRaw = args.options.get('expires-at');
        const expiresAt = typeof expiresRaw === 'string' ? new Date(expiresRaw) : null;
        if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new UsageError('--expires-at must be an ISO date.');
        const password = await readPassword(args, { email, name });
        const gamesRaw = args.options.get('games');
        if (gamesRaw === true) throw new UsageError('Option --games needs a value.');
        const games = gamesRaw === undefined ? null : (gamesRaw.split(',').map((value) => value.trim()) as Game[]);
        const result = await createLocalAdmin(handle.db, { email, name, roles, games, password, operator: operatorLabel(args), expiresAt });
        console.log(
          `Created local administrator ${result.userId} (grant ${result.grantId}, version 1, roles ${roles.join(',')}, games ${games ? games.join(',') : 'all'}).`,
        );
        console.log('Next: enable LOCAL_ADMIN_LOGIN_ENABLED, sign in at /cs/login/recovery and enroll TOTP before any admin access.');
        return 0;
      }
      case 'revoke': {
        const result = await revokeLocalAdmin(handle.db, { email: required(args, 'email'), operator: operatorLabel(args) });
        console.log(`Revoked grant ${result.grantId} (now version ${result.version}); ended ${result.sessionsRevoked} session(s).`);
        return 0;
      }
      case 'reset-password': {
        const email = required(args, 'email');
        const password = await readPassword(args, { email });
        const result = await resetLocalAdminPassword(handle.db, { email, password, operator: operatorLabel(args) });
        console.log(
          `Password reset for grant ${result.grantId} (now version ${result.version}); two-factor removed (re-enrollment required); ended ${result.sessionsRevoked} session(s).`,
        );
        return 0;
      }
      case 'list': {
        const rows = await listLocalAdmins(handle.db);
        if (rows.length === 0) console.log('No local administrators are provisioned.');
        for (const row of rows) {
          console.log(
            [
              row.userId,
              JSON.stringify(row.label),
              row.email,
              `roles=${row.roles.join(',')}`,
              `version=${row.grantVersion}`,
              `status=${row.status}`,
              `2fa=${row.twoFactorEnabled ? 'enrolled' : 'not-enrolled'}`,
              `provisionedBy=${row.provisionedBy}`,
              `expires=${row.expiresAt?.toISOString() ?? 'never'}`,
            ].join('  '),
          );
        }
        return 0;
      }
      default:
        return 2;
    }
  } catch (error) {
    if (error instanceof UsageError || error instanceof ProvisioningError) {
      console.error(error.message);
      return 1;
    }
    console.error(`Provisioning failed: ${error instanceof Error ? redactConnectionDetails(error.message).slice(0, 200) : 'unknown error'}`);
    return 1;
  } finally {
    await handle.close().catch(() => undefined);
  }
}

main().then(
  (code) => process.exit(code),
  () => process.exit(1),
);
