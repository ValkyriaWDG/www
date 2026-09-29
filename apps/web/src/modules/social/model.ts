import type { AppLocale } from '@/i18n/routing';
import { formatDate } from '@/i18n/date-format';
import { describeResult } from '@/components/public/match-format';
import type { ArticleDTO } from '@/modules/content/types';
import type { PublicMatchDetail } from '@/modules/matches/types';
import cs from '@/i18n/messages/cs/social.json';
import en from '@/i18n/messages/en/social.json';
import type { GameRoute } from '@/modules/games/registry';
import { hllMapArtwork } from '@/modules/games/hll-maps';

export const SOCIAL_SIZE = { width: 1200, height: 630 } as const;
/** v3: owner graphics pack backgrounds and HLL map briefing (docs/assets/graphics-pack-2026-09-29.md). */
export const SOCIAL_TEMPLATE_VERSION = '3';
export type SocialKind = 'site' | 'news' | 'matches';
/** Colours and default background: HLL khaki, Wardogs amber, shared community. */
export type SocialTheme = 'hll' | 'wardogs' | 'community';
/** Official game marks shown in the card header instead of the game name text. */
export type SocialMark = 'hll' | 'wardogs';
export type SocialCard = {
  locale: AppLocale;
  kind: SocialKind;
  title: string;
  label: string;
  detail: string;
  score: string | null;
  status: string;
  /** Game name; rendered as text only when no official mark applies (community articles). */
  game: string;
  marks: SocialMark[];
  /** Only a cover from the currently published DTO, never a draft or remote URL. */
  coverId: string | null;
  theme: SocialTheme;
  /** First recognised map of a published HLL match (catalog slug, never request input). */
  map: { name: string; slug: string } | null;
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
    marks: game === 'hll' ? ['hll'] : game === 'wardogs' ? ['wardogs'] : ['wardogs', 'hll'],
    coverId: null, theme: game === 'hll' ? 'hll' : game === 'wardogs' ? 'wardogs' : 'community', map: null,
  };
}

export function articleCard(article: ArticleDTO): SocialCard {
  const copy = socialCopy(article.locale);
  return {
    locale: article.locale, kind: 'news', title: cardText(article.title),
    label: cardText(article.category?.label || copy.news, 44),
    detail: article.publishedAt ? formatDate(article.publishedAt, article.locale, 'date') : '',
    score: null, status: '', game: article.game === 'wardogs' ? 'WARDOGS' : article.game === 'hell-let-loose' ? 'HELL LET LOOSE' : copy.community,
    marks: article.game === 'wardogs' ? ['wardogs'] : article.game === 'hell-let-loose' ? ['hll'] : [],
    coverId: article.cover?.assetId ?? null, theme: article.game === 'wardogs' ? 'wardogs' : article.game === 'hell-let-loose' ? 'hll' : 'community', map: null,
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
  let map: SocialCard['map'] = null;
  if (match.game === 'hell-let-loose') {
    for (const round of match.rounds ?? []) {
      const artwork = hllMapArtwork(round.mapName);
      if (artwork) {
        map = { name: artwork.map, slug: artwork.slug };
        break;
      }
    }
  }
  return {
    locale, kind: 'matches', title: cardText(`VALKYRIA vs ${match.opponentName}`, 112),
    label: match.status === 'completed' ? copy.result : copy.match,
    detail: cardText([formatDate(match.startsAt, locale, 'dateTimeZone', match.timeZone), match.competitionName].filter(Boolean).join(' · '), 110),
    score, status, game: match.game === 'wardogs' ? 'WARDOGS' : 'HELL LET LOOSE', marks: [match.game === 'wardogs' ? 'wardogs' : 'hll'],
    coverId: match.cover?.assetId ?? null, theme: match.game === 'wardogs' ? 'wardogs' : 'hll', map,
  };
}
