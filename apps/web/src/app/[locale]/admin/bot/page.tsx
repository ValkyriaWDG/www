import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { requireAdminPage } from '@/modules/auth/admin-guard';
import { BotDashboard } from '@/components/admin-bot/dashboard';
export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'adminBot' });
  return { title: t('title'), robots: { index: false, follow: false } };
}
export default async function AdminBotPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const access = await requireAdminPage({ locale, path: '/admin/bot', capability: 'bot.read' });
  if (!access.ok) return access.denied;
  return <BotDashboard locale={locale} />;
}
