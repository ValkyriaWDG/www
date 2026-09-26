import 'server-only';
import { getServerEnv } from './env';

/** Canonical site origin without locale suffix (e.g. `https://valkyriawdg.cz`). */
export function getSiteOrigin(): string {
  try {
    return new URL(getServerEnv().APP_URL).origin;
  } catch {
    return 'https://valkyriawdg.cz';
  }
}
