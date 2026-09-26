/**
 * Content-Security-Policy for HTML routes. Scripts require the per-request nonce;
 * media/image origins are limited to self plus explicitly configured background media.
 */
export function buildContentSecurityPolicy(nonce: string, env: NodeJS.ProcessEnv = process.env): string {
  const isDev = env.NODE_ENV === 'development';
  const mediaOrigins = originsOf([env.BACKGROUND_VIDEO_MP4_URL, env.BACKGROUND_VIDEO_WEBM_URL]);
  const imageOrigins = originsOf([env.BACKGROUND_POSTER_URL]);
  const httpsSite = (env.APP_URL ?? '').startsWith('https://');
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // Development HMR injects un-nonced style tags; production styles are bundled files.
    isDev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' data: blob:${imageOrigins}`,
    `media-src 'self'${mediaOrigins}`,
    "font-src 'self' data:",
    `connect-src 'self'${isDev ? ' ws:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    // Discord OAuth begins with a same-origin POST that redirects to discord.com.
    "form-action 'self' https://discord.com",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    ...(httpsSite ? ['upgrade-insecure-requests'] : []),
  ];
  return directives.join('; ');
}

function originsOf(urls: (string | undefined)[]): string {
  const origins = new Set<string>();
  for (const value of urls) {
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol === 'https:') origins.add(url.origin);
    } catch {
      // Invalid URLs are rejected by runtime configuration validation.
    }
  }
  return [...origins].map((origin) => ` ${origin}`).join('');
}

/** Static security headers applied to every response (see next.config.ts). */
export const STATIC_SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
] as const;
