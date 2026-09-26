import type { Metadata, Viewport } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import type { ShellAccount } from '@/components/shell/account-slot';
import { MenuShell } from '@/components/shell/menu-shell';
import { routing } from '@/i18n/routing';
import { getHeaderAccountState } from '@/modules/auth/header-state';
import { getSiteOrigin } from '@/lib/site';
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
  return {
    metadataBase: new URL(getSiteOrigin()),
    title: { default: t('name'), template: `%s · ${t('name')}` },
    description: t('description'),
    applicationName: t('name'),
    openGraph: { siteName: t('name'), locale: locale === 'cs' ? 'cs_CZ' : 'en_GB', type: 'website' },
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  // Reading the per-request nonce keeps every UI route dynamically rendered so the
  // nonce-based CSP applies to all framework scripts (no prerendered HTML without nonces).
  await headers();
  // Signed-in projection for the header; visibility is convenience only, account/admin
  // routes authorize every request on the server.
  const account: ShellAccount = await getHeaderAccountState();
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>
          <MenuShell account={account}>{children as ReactNode}</MenuShell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
