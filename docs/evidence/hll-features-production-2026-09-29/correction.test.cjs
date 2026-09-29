'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { tournamentMarkup } = require('./tournament-markup.cjs');
const root = path.resolve(__dirname, '../../..');
const appSource = fs.readFileSync(path.join(root, 'apps/web/src/modules/social/model.ts'), 'utf8');
const http = fs.readFileSync(path.join(__dirname, 'http-smoke.mjs'), 'utf8');
const browser = fs.readFileSync(path.join(__dirname, 'browser-smoke.cjs'), 'utf8');
test('independent social expectation matches accepted source version 2', () => {
  assert.match(appSource, /SOCIAL_TEMPLATE_VERSION = '2'/);
  assert.match(appSource, /return `\$\{path\}\?v=\$\{encodeURIComponent\(version\)\}\$\{game \? `&game=\$\{game\}` : ''\}`/);
  assert(!http.includes('?v=1')); assert(!browser.includes('?v=1'));
});
for (const locale of ['cs', 'en']) for (const game of ['', 'hll', 'wardogs']) test(`actual HTTP/browser image expressions ${locale}/${game || 'hub'}`, () => {
  const context = { origin: 'https://valkyria.cz', locale, template: 'site', game };
  const httpExpression = http.match(/const image = (`[^;]+`);/)[1];
  const browserExpression = browser.match(/assert\.deepEqual\(facts\.ogImage, \[(`[^\]]+`)\]\)/)[1];
  const expected = `https://valkyria.cz/api/social/${locale}/site?v=2${game ? '&game=' + game : ''}`;
  assert.equal(vm.runInNewContext(httpExpression, context), expected);
  assert.equal(vm.runInNewContext(browserExpression, context), expected);
});
for (const [locale, empty] of [['cs', 'Zatím žádné zveřejněné turnaje'], ['en', 'No published tournaments yet']]) {
  const dictionary = '<script>self.__next_f.push(["The tournaments could not be loaded.","Turnaje se nepodařilo načíst.","' + empty + '"])</script>';
  test(`${locale} serialized dictionary alone cannot prove error or empty content`, () => assert.deepEqual(tournamentMarkup('<main><h1>Tournaments</h1></main>' + dictionary, locale), { mainCount: 1, cards: [], honestEmpty: false, queryError: false }));
  test(`${locale} rendered localized empty state survives serialized error`, () => assert.equal(tournamentMarkup('<main><h2>' + empty + '</h2></main>' + dictionary, locale).honestEmpty, true));
  test(`${locale} actual rendered error remains a failure`, () => { const facts = tournamentMarkup('<main><div data-list-error=""><h2>Failure</h2></div></main>' + dictionary, locale); assert.equal(facts.queryError, true); assert.equal(facts.honestEmpty, false); });
  test(`${locale} scripts and templates inside main cannot fake error, cards or empty state`, () => { const fake = '<div data-list-error=""></div><li data-tournament-card="fake"></li><h2>' + empty + '</h2>'; assert.deepEqual(tournamentMarkup('<main><script>' + fake + '</script><template>' + fake + '</template></main>', locale), { mainCount: 1, cards: [], honestEmpty: false, queryError: false }); });
}
test('real published tournament cards remain accepted independently of empty dictionary', () => assert.deepEqual(tournamentMarkup('<main><li data-tournament-card="autumn-cup"></li></main>', 'en').cards, ['autumn-cup']));
test('missing or multiple main content fails closed', () => { assert.equal(tournamentMarkup('<h2>No published tournaments yet</h2>', 'en').mainCount, 0); const result = tournamentMarkup('<main></main><main><h2>No published tournaments yet</h2></main>', 'en'); assert.equal(result.mainCount, 2); assert.equal(result.honestEmpty, false); });
