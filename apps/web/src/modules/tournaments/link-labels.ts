/** Tournament link purposes that have a translated label on public pages. */
export type TournamentLinkKind = 'website' | 'rules' | 'standings' | 'schedule' | 'registration';

// Editors (and the legacy import) type one label per link in whichever language they
// used; these generic labels are shown in the page's language instead.
const GENERIC_LABELS: Readonly<Record<string, TournamentLinkKind>> = {
  website: 'website', web: 'website', 'official website': 'website', 'tournament website': 'website',
  'web soutěže': 'website', 'webové stránky': 'website', 'oficiální web': 'website',
  rules: 'rules', rulebook: 'rules', pravidla: 'rules',
  standings: 'standings', table: 'standings', tabulka: 'standings', 'pořadí': 'standings',
  schedule: 'schedule', rozpis: 'schedule', harmonogram: 'schedule',
  registration: 'registration', 'sign up': 'registration', 'sign-up': 'registration', registrace: 'registration', 'přihláška': 'registration',
};

/** The generic purpose of a link label, or `null` for a specific label kept as written. */
export function genericTournamentLink(label: string): TournamentLinkKind | null {
  return GENERIC_LABELS[label.trim().replace(/\s+/g, ' ').toLocaleLowerCase('cs')] ?? null;
}
