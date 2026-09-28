import type { AppLocale } from '@/i18n/routing';
import { formatDate } from '@/i18n/date-format';
import { describeResult } from '@/components/public/match-format';
import type { ArticleDTO } from '@/modules/content/types';
import type { PublicMatchDetail } from '@/modules/matches/types';
import cs from '@/i18n/messages/cs/social.json';
import en from '@/i18n/messages/en/social.json';
import type { GameRoute } from '@/modules/games/registry';

export const SOCIAL_SIZE = { width: 1200, height: 630 } as const;
export const SOCIAL_TEMPLATE_VERSION = '2';
export type SocialKind = 'site' | 'news' | 'matches';
export type SocialCard = {
  locale: AppLocale;
  kind: SocialKind;
  title: string;
  label: string;
  detail: string;
  score: string | null;
  status: string;
  game: string;
  /** Only a cover from the currently published DTO, never a draft or remote URL. */
  coverId: string | null;
  artwork: 'flying' | 'brand' | 'hll-scene';
};

export const socialCopy = (locale: AppLocale) => (locale === 'cs' ? cs : en);

/** Fixed routes only; this is not an arbitrary image/HTML/text rendering endpoint. */
export function parseSocialTarget(locale: string, kind: string, slug: string[] = []) {
  if (locale !== 'cs' && locale !== 'en') return null;
  if (kind !== 'site' && kind !== 'news' && kind !== 'matches') return null;
  if (slug.length > 1 || (kind === 'site' && slug.length)) return null;
  if (slug[0] && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug[0])) return null;
  if ((slug[0]?.length ?? 0) > 160) return null;
  return { locale, kind, slug: slug[0] } as { locale: AppLocale; kind: SocialKind; slug: string | undefined };
}

export function socialImagePath(locale: AppLocale, kind: SocialKind = 'site', slug?: string, revision?: string, game?: GameRoute): string {
  const path = `/api/social/${locale}/${kind}${slug ? `/${encodeURIComponent(slug)}` : ''}`;
  const version = revision ? `${SOCIAL_TEMPLATE_VERSION}-${revision}` : SOCIAL_TEMPLATE_VERSION;
  return `${path}?v=${encodeURIComponent(version)}${game ? `&game=${game}` : ''}`;
}

/** Bound layout work and long tokens without losing Czech grapheme clusters. */
export function cardText(value: string, maximum = 130): string {
  const clean = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
  const segments = [...new Intl.Segmenter('cs', { granularity: 'grapheme' }).segment(clean)].map((entry) => entry.segment);
  const bounded = segments.length > maximum ? `${segments.slice(0, maximum - 1).join('')}…` : clean;
  return bounded.replace(/\S{24,}/gu, (word) => [...word].map((char, i) => (i && i % 18 === 0 ? `\u200b${char}` : char)).join(''));
}

export function siteCard(locale: AppLocale, kind: SocialKind = 'site', game?: GameRoute): SocialCard {
  const copy = socialCopy(locale);
  return {
    locale, kind, title: kind === 'site' ? 'VALKYRIA' : copy[kind], label: copy.community,
    detail: game === 'hll' ? copy.hllIntroduction : copy.introduction, score: null, status: '',
    game: game === 'hll' ? 'HELL LET LOOSE' : game === 'wardogs' ? 'WARDOGS' : 'WARDOGS // HELL LET LOOSE',
    coverId: null, artwork: game === 'hll' ? 'hll-scene' : game === 'wardogs' ? 'flying' : 'brand',
  };
}

export function articleCard(article: ArticleDTO): SocialCard {
  const copy = socialCopy(article.locale);
  return {
    locale: article.locale, kind: 'news', title: cardText(article.title),
    label: cardText(article.category?.label || copy.news, 44),
    detail: article.publishedAt ? formatDate(article.publishedAt, article.locale, 'date') : '',
    score: null, status: '', game: article.game === 'wardogs' ? 'WARDOGS' : article.game === 'hell-let-loose' ? 'HELL LET LOOSE' : copy.community,
    coverId: article.cover?.assetId ?? null, artwork: article.game === 'wardogs' ? 'flying' : article.game === 'hell-let-loose' ? 'hll-scene' : 'brand',
  };
}

export function matchCard(match: PublicMatchDetail, locale: AppLocale): SocialCard {
  const copy = socialCopy(locale);
  const result = describeResult(match);
  const score = result.kind === 'score' ? `${result.valkyria} : ${result.opponent}` : null;
  let status: string = copy.status[match.status];
  if (result.kind === 'unpublished') status = copy.resultUnpublished;
  if (result.kind === 'outcome') status = copy.outcome[result.outcome];
  if (result.kind === 'score' || result.kind === 'outcome') status += ` · ${copy.verification[result.verification]}`;
  return {
    locale, kind: 'matches', title: cardText(`VALKYRIA vs ${match.opponentName}`, 112),
    label: match.status === 'completed' ? copy.result : copy.match,
    detail: cardText([formatDate(match.startsAt, locale, 'dateTimeZone', match.timeZone), match.competitionName].filter(Boolean).join(' · '), 110),
    score, status, game: match.game === 'wardogs' ? 'WARDOGS' : 'HELL LET LOOSE',
    coverId: match.cover?.assetId ?? null, artwork: match.game === 'wardogs' ? 'flying' : 'hll-scene',
  };
}
