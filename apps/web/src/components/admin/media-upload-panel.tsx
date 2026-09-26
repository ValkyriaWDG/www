'use client';

import { useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { MediaUploader } from './media-uploader';
import type { UploadScope } from './upload';

/** Library-page uploader: refreshes the server-rendered grid after each ready upload. */
export function MediaUploadPanel({ scope, locale }: { scope: UploadScope; locale: AppLocale }) {
  const router = useRouter();
  return <MediaUploader scope={scope} locale={locale} onUploaded={() => router.refresh()} />;
}
