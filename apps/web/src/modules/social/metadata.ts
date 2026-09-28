import type { Metadata } from 'next';
import type { AppLocale } from '@/i18n/routing';
import { SOCIAL_SIZE, socialCopy, socialImagePath, type SocialKind } from './model';
import type { GameRoute } from '@/modules/games/registry';

export function sharingMetadata(locale: AppLocale, kind: SocialKind = 'site', slug?: string, revision?: string, title = 'Valkyria', description?: string, game?: GameRoute) {
  const image = { url: socialImagePath(locale, kind, slug, revision, game), ...SOCIAL_SIZE, alt: title === 'Valkyria' ? `Valkyria · ${socialCopy(locale).community}` : title, type: 'image/png' };
  return {
    images: [image],
    twitter: { card: 'summary_large_image', title, ...(description ? { description } : {}), images: [image] } satisfies Metadata['twitter'],
  };
}
