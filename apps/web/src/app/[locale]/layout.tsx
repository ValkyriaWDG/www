import type { Metadata, Viewport } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { routing } from '@/i18n/routing';
import { getSiteOrigin } from '@/lib/site';
import { sharingMetadata } from '@/modules/social/metadata';
import '@/styles/globals.css';

export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: '#11110f',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export async function generateMetadata({ params }: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'common.site' });
  const sharing = sharingMetadata(locale, 'site', undefined, undefined, t('name'), t('description'));
  return {
    metadataBase: new URL(getSiteOrigin()),
    title: { default: t('name'), template: `%s · ${t('name')}` },
    description: t('description'),
    applicationName: t('name'),
    openGraph: { siteName: t('name'), locale: locale === 'cs' ? 'cs_CZ' : 'en_GB', type: 'website', images: sharing.images },
    twitter: sharing.twitter,
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  // Reading the per-request nonce keeps every UI route dynamically rendered so the
  // nonce-based CSP applies to all framework scripts (no prerendered HTML without nonces).
  await headers();
  // The presentation frame is chosen by the route group below: `(platform)` for the
  // community hub, shared pages, account and admin; `[game]` for HLL and Wardogs.
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>{children as ReactNode}</NextIntlClientProvider>
      </body>
    </html>
  );
}
