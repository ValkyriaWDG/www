import type { MetadataRoute } from 'next';
import { getSiteOrigin } from '@/lib/site';

/** Public pages are indexable; account, administration, previews and APIs are not. */
export default function robots(): MetadataRoute.Robots {
  const origin = getSiteOrigin();
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/api/social/'],
        disallow: ['/api/', '/cs/admin', '/en/admin', '/cs/account', '/en/account', '/cs/login', '/en/login'],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
