/** Tournament link purposes that have a translated label on public pages. */
export type TournamentLinkKind = 'website' | 'rules' | 'standings' | 'schedule' | 'registration';

/** A generic purpose plus the editor's optional trailing note in parentheses, kept as written. */
export type GenericTournamentLink = { kind: TournamentLinkKind; note: string | null };

// Editors (and the legacy import) type one label per link in whichever language they
// used; these generic labels are shown in the page's language instead.
const GENERIC_LABELS: Readonly<Record<string, TournamentLinkKind>> = {
  website: 'website', web: 'website', 'official website': 'website', 'tournament website': 'website', 'competition website': 'website',
  'web soutěže': 'website', 'webové stránky': 'website', 'oficiální web': 'website', 'web turnaje': 'website',
  rules: 'rules', rulebook: 'rules', pravidla: 'rules',
  standings: 'standings', table: 'standings', tabulka: 'standings', 'pořadí': 'standings',
  schedule: 'schedule', rozpis: 'schedule', harmonogram: 'schedule',
  registration: 'registration', 'sign up': 'registration', 'sign-up': 'registration', registrace: 'registration', 'přihláška': 'registration',
};

/** "Web soutěže (ukázka)" → label "Web soutěže" and note "(ukázka)". */
const TRAILING_NOTE = /^(.*?)\s*(\([^()]+\))$/;

/**
 * The generic purpose of a link label (case-insensitive, surrounding and repeated spaces
 * ignored, an optional trailing note in parentheses kept), or `null` for a specific label
 * such as "ECL Discord" that stays as written.
 */
export function genericTournamentLink(label: string): GenericTournamentLink | null {
  const text = label.trim().replace(/\s+/g, ' ');
  const match = TRAILING_NOTE.exec(text);
  const kind = GENERIC_LABELS[(match?.[1] ?? text).toLocaleLowerCase('cs')];
  return kind ? { kind, note: match?.[2] ?? null } : null;
}
