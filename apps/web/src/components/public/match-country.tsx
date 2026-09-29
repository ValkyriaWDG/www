import type { ReactNode } from 'react';
import { CzechFlag, UnitedKingdomFlag } from '@/components/shell/flags';
import type { MatchT } from './match-parts';
import styles from './matches.module.css';

const COUNTRIES = ['CZ', 'FR', 'RU', 'TR', 'ES', 'FI', 'DE', 'US', 'PL', 'AU', 'CN', 'HU', 'GB', 'BR'] as const;
type Country = (typeof COUNTRIES)[number];

function Star({ x, y, radius, points = 5, fill = '#fff' }: { x: number; y: number; radius: number; points?: number; fill?: string }) {
  const vertices = Array.from({ length: points * 2 }, (_, index) => {
    const angle = (index * Math.PI) / points - Math.PI / 2;
    const r = index % 2 === 0 ? radius : radius * 0.4;
    return `${(x + r * Math.cos(angle)).toFixed(3)},${(y + r * Math.sin(angle)).toFixed(3)}`;
  }).join(' ');
  return <polygon points={vertices} fill={fill} />;
}

/** Original compact vector drawings. No remote assets or platform-dependent flag emoji. */
function Flag({ code }: { code: Country }) {
  if (code === 'CZ') return <CzechFlag className={styles.countryFlag} />;
  if (code === 'GB') return <UnitedKingdomFlag className={styles.countryFlag} />;
  let drawing: ReactNode;
  switch (code) {
    case 'FR':
      drawing = <><rect width="30" height="20" fill="#fff" /><rect width="10" height="20" fill="#002654" /><rect x="20" width="10" height="20" fill="#ed2939" /></>;
      break;
    case 'RU':
      drawing = <><rect width="30" height="20" fill="#fff" /><rect y="6.667" width="30" height="6.667" fill="#0039a6" /><rect y="13.333" width="30" height="6.667" fill="#d52b1e" /></>;
      break;
    case 'DE':
      drawing = <><rect width="30" height="20" fill="#000" /><rect y="6.667" width="30" height="6.667" fill="#d00" /><rect y="13.333" width="30" height="6.667" fill="#ffce00" /></>;
      break;
    case 'HU':
      drawing = <><rect width="30" height="20" fill="#fff" /><rect width="30" height="6.667" fill="#ce2939" /><rect y="13.333" width="30" height="6.667" fill="#477050" /></>;
      break;
    case 'PL':
      drawing = <><rect width="30" height="20" fill="#fff" /><rect y="10" width="30" height="10" fill="#dc143c" /></>;
      break;
    case 'FI':
      drawing = <><rect width="30" height="20" fill="#fff" /><path d="M10 0 V20 M0 10 H30" stroke="#002f6c" strokeWidth="5" /></>;
      break;
    case 'TR':
      drawing = <><rect width="30" height="20" fill="#e30a17" /><circle cx="12" cy="10" r="5" fill="#fff" /><circle cx="13.4" cy="10" r="4" fill="#e30a17" /><Star x={18.5} y={10} radius={2.3} /></>;
      break;
    case 'ES':
      drawing = <><rect width="30" height="20" fill="#aa151b" /><rect y="5" width="30" height="10" fill="#f1bf00" /><path d="M8 8 H12 V12 Q10 15 8 12 Z" fill="#aa151b" stroke="#fff" strokeWidth=".5" /><path d="M8 7 H12" stroke="#aa151b" strokeWidth="1" /></>;
      break;
    case 'US':
      drawing = <><rect width="30" height="20" fill="#fff" />{Array.from({ length: 7 }, (_, i) => <rect key={i} y={(i * 40) / 13} width="30" height={20 / 13} fill="#b22234" />)}<rect width="12" height={140 / 13} fill="#3c3b6e" />{Array.from({ length: 9 }, (_, row) => Array.from({ length: row % 2 === 0 ? 6 : 5 }, (_, col) => <Star key={`${row}-${col}`} x={1 + col * 2 + (row % 2)} y={1 + row * 1.1} radius={0.55} />))}</>;
      break;
    case 'AU':
      drawing = <><rect width="30" height="20" fill="#012169" /><svg width="15" height="10" viewBox="0 0 24 12"><UnitedKingdomFlag /></svg><Star x={7.5} y={15} radius={2.6} points={7} /><Star x={23} y={4} radius={1.8} points={7} /><Star x={18.5} y={10} radius={1.8} points={7} /><Star x={27} y={9} radius={1.8} points={7} /><Star x={23} y={16} radius={1.8} points={7} /><Star x={25} y={12} radius={0.9} /></>;
      break;
    case 'CN':
      drawing = <><rect width="30" height="20" fill="#de2910" /><Star x={5} y={5} radius={3} fill="#ffde00" />{[[10, 2], [12, 4], [12, 7], [10, 9]].map(([x, y]) => <Star key={`${x}-${y}`} x={x!} y={y!} radius={1} fill="#ffde00" />)}</>;
      break;
    case 'BR':
      drawing = <><rect width="30" height="20" fill="#009739" /><path d="M2 10 L15 2 L28 10 L15 18 Z" fill="#ffdf00" /><circle cx="15" cy="10" r="5" fill="#002776" /><path d="M10.3 8.5 Q15 7.3 19.7 11" fill="none" stroke="#fff" strokeWidth="1" /><circle cx="13" cy="12" r=".45" fill="#fff" /><circle cx="16" cy="13" r=".45" fill="#fff" /><circle cx="17" cy="11.5" r=".4" fill="#fff" /></>;
      break;
  }
  return <svg className={styles.countryFlag} viewBox="0 0 30 20" width="24" height="16" aria-hidden="true" focusable="false">{drawing}</svg>;
}

/** Regional/unknown source codes remain text badges; they are never invented national flags. */
export function MatchCountry({ code, t, showName = false }: { code: string | null | undefined; t: MatchT; showName?: boolean }) {
  if (!code) return null;
  const country = COUNTRIES.find((entry) => entry === code);
  const name = country ? t(`legacy.countries.${country}`) : t('legacy.regionCode', { code });
  return (
    <span className={styles.country} data-match-country={code}>
      <span className={styles.countrySymbol} role="img" aria-label={name} title={name}>
        {country ? <Flag code={country} /> : <span className={styles.regionCode} aria-hidden="true">{code}</span>}
      </span>
      {showName ? <span aria-hidden="true">{name}</span> : null}
    </span>
  );
}
