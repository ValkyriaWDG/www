'use strict';

// Inspect actual server-rendered main markup, never serialized translation/Flight data.
// This is a bounded markup check, not CSS visibility: the browser independently checks
// the visible tournament screen. The known page emits exactly one labelled main.
function tournamentMarkup(html, locale) {
  const markup = html.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const mains = [...markup.matchAll(/<main\b[^>]*>[\s\S]*?<\/main\s*>/gi)].map(match => match[0]);
  const main = mains.length === 1 ? mains[0] : '';
  const cards = [...main.matchAll(/<li\b[^>]*\bdata-tournament-card="([^"]*)"[^>]*>/gi)].map(match => match[1]);
  const headings = [...main.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2\s*>/gi)].map(match => match[1].replace(/<[^>]*>/g, '').trim());
  const empty = locale === 'cs' ? 'Zatím žádné zveřejněné turnaje' : 'No published tournaments yet';
  return { mainCount: mains.length, cards, honestEmpty: headings.includes(empty), queryError: /<div\b[^>]*\bdata-list-error(?:=|\s|>)/i.test(main) };
}
module.exports = { tournamentMarkup };
