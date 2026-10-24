import type { AppLocale } from '@/i18n/routing';
import type { GameRoute } from '@/modules/games/registry';
import type { PublicLogiEvent } from '@/modules/integrations/logi/mapping';

export type OperationalMatchIdentity = {
  title: string;
  teams: { key: string; name: string; code: string | null; side: string | null }[];
  subtitle: string | null;
};

/** Presentation only: captured teams and reviewed archive identities never imply score attribution. */
export function operationalMatchIdentity(event: PublicLogiEvent): OperationalMatchIdentity {
  const archive = event.archive;
  const teams: OperationalMatchIdentity['teams'] = archive?.opponentName ? [
    { key: 'home', name: 'Valkyria', code: 'VLK', side: null },
    { key: 'opponent', name: archive.opponentName, code: archive.opponentShortCode ?? null, side: null },
  ] : event.teams.map((team) => ({
    key: team.id,
    name: team.name,
    code: team.shortCode !== null && team.shortCode.toLowerCase() === team.name.toLowerCase() ? null : team.shortCode,
    side: team.side,
  }));
  const title = archive?.opponentName ? `Valkyria vs. ${archive.opponentName}` : teams.length ? teams.map((team) => team.name).join(' vs. ') : event.title;
  return { title, teams, subtitle: title !== event.title ? event.title : null };
}

/** Only known HLL faction words are localized; arbitrary participant labels stay intact. */
export function publicResultLabel(label: string, game: GameRoute, locale: AppLocale): string {
  if (game !== 'hll') return label;
  const side = label.toLowerCase();
  if (side === 'allies') return locale === 'cs' ? 'Spojenci' : 'Allies';
  if (side === 'axis') return locale === 'cs' ? 'Osa' : 'Axis';
  return label;
}
