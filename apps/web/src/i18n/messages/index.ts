import csAdmin from './cs/admin.json';
import csAdminCommunity from './cs/adminCommunity.json';
import csAdminEditorial from './cs/adminEditorial.json';
import csAuth from './cs/auth.json';
import csCommon from './cs/common.json';
import csEditor from './cs/editor.json';
import csErrors from './cs/errors.json';
import csGames from './cs/games.json';
import csHome from './cs/home.json';
import csMatches from './cs/matches.json';
import csMedia from './cs/media.json';
import csMembers from './cs/members.json';
import csNews from './cs/news.json';
import csPages from './cs/pages.json';
import enAdmin from './en/admin.json';
import enAdminCommunity from './en/adminCommunity.json';
import enAdminEditorial from './en/adminEditorial.json';
import enAuth from './en/auth.json';
import enCommon from './en/common.json';
import enEditor from './en/editor.json';
import enErrors from './en/errors.json';
import enGames from './en/games.json';
import enHome from './en/home.json';
import enMatches from './en/matches.json';
import enMedia from './en/media.json';
import enMembers from './en/members.json';
import enNews from './en/news.json';
import enPages from './en/pages.json';

/**
 * UI dictionaries, one JSON file per namespace and locale. English keys define the typed
 * contract; `messages.test.ts` enforces Czech/English key parity and ICU validity.
 */
export const enMessages = {
  common: enCommon,
  errors: enErrors,
  home: enHome,
  games: enGames,
  pages: enPages,
  news: enNews,
  members: enMembers,
  matches: enMatches,
  auth: enAuth,
  admin: enAdmin,
  adminEditorial: enAdminEditorial,
  adminCommunity: enAdminCommunity,
  editor: enEditor,
  media: enMedia,
};

export type Messages = typeof enMessages;

export const csMessages: Messages = {
  common: csCommon,
  errors: csErrors,
  home: csHome,
  games: csGames,
  pages: csPages,
  news: csNews,
  members: csMembers,
  matches: csMatches,
  auth: csAuth,
  admin: csAdmin,
  adminEditorial: csAdminEditorial,
  adminCommunity: csAdminCommunity,
  editor: csEditor,
  media: csMedia,
};

export const messages = { cs: csMessages, en: enMessages } as const;
