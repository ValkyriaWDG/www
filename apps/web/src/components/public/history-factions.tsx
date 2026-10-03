import { getTranslations } from 'next-intl/server';
import type { CSSProperties } from 'react';
import { formatNumber } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import type { HistoryFactionPublic, HistoryOutcomesPublic } from '@/modules/integrations/logi/readers/history-public';
import styles from './history.module.css';

/** The producer validates `colorHex` as `#rrggbb`; anything else keeps the neutral token. */
const HEX = /^#[0-9a-f]{6}$/i;

export function factionColor(colorHex: string | null): CSSProperties | undefined {
  return colorHex && HEX.test(colorHex) ? { background: colorHex } : undefined;
}

/** Decorative colour chip of a faction (its published colour, or the neutral token). */
export function FactionSwatch({ colorHex }: { colorHex: string | null }) {
  return <span className={styles.swatch} style={factionColor(colorHex)} aria-hidden="true" />;
}

/**
 * Faction win shares: one horizontal bar per faction in the faction's published colour,
 * labelled with wins / decided games and the rounded share, plus appearances; the
 * table beneath carries the same values for screen readers and without CSS. Draws and
 * games without a result are listed separately and never attributed to a faction.
 */
export async function FactionShares({ factions, outcomes, locale, compact = false, captionId }: { factions: readonly HistoryFactionPublic[]; outcomes: HistoryOutcomesPublic; locale: AppLocale; compact?: boolean; captionId: string }) {
  const t = await getTranslations({ locale, namespace: 'history.factions' });
  const number = (value: number) => formatNumber(value, locale);
  const percent = (value: number) => formatNumber(value, locale, { style: 'percent', maximumFractionDigits: 0 });
  const share = (faction: HistoryFactionPublic) => (faction.winShare === null ? t('shareUnknown') : percent(faction.winShare));
  const other = outcomes.unknown > 0
    ? t('otherUnknown', { draw: number(outcomes.draw), noResult: number(outcomes.noResult), unknown: number(outcomes.unknown) })
    : t('other', { draw: number(outcomes.draw), noResult: number(outcomes.noResult) });
  if (factions.length === 0) {
    return <p className={styles.note} data-history-factions="empty">{t('none')}</p>;
  }
  return (
    <div data-history-factions="">
      <figure className={styles.factionChart} data-compact={compact ? '' : undefined} aria-hidden="true">
        <ul className={styles.factionRows}>
          {factions.map((faction) => (
            <li key={faction.name} className={styles.factionRow} data-history-faction={faction.name}>
              <span className={styles.factionName}>
                <FactionSwatch colorHex={faction.colorHex} />
                <span>{faction.name}</span>
              </span>
              <span className={styles.factionBar}>
                <span className={styles.factionFill} style={{ ...factionColor(faction.colorHex), width: `${Math.round((faction.winShare ?? 0) * 1000) / 10}%` }} data-history-faction-fill="" />
              </span>
              <span className={styles.factionValue}>
                {t('wins', { wins: number(faction.wins), decided: number(outcomes.decided) })} · {share(faction)}
              </span>
              <span className={styles.factionMeta}>{t('appearances', { count: faction.appearances })}</span>
            </li>
          ))}
        </ul>
      </figure>
      {/* The wrapper is hidden, not the table: a hidden table's caption would still widen a phone page. */}
      <div className="visually-hidden">
        <table data-history-faction-table="">
          <caption id={captionId}>{t('caption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('columns.faction')}</th>
            <th scope="col">{t('columns.wins')}</th>
            <th scope="col">{t('columns.share')}</th>
            <th scope="col">{t('columns.appearances')}</th>
          </tr>
        </thead>
        <tbody>
          {factions.map((faction) => (
            <tr key={faction.name}>
              <th scope="row">{faction.name}</th>
              <td>{t('wins', { wins: number(faction.wins), decided: number(outcomes.decided) })}</td>
              <td>{share(faction)}</td>
              <td>{number(faction.appearances)}</td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
      <p className={styles.otherOutcomes} data-history-other-outcomes="">{other}</p>
    </div>
  );
}
