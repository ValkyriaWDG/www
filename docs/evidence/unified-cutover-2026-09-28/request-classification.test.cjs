'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isAbortedRscPrefetch } = require('./request-classification.cjs');

const baseline = { sameOrigin: true, method: 'GET', resourceType: 'fetch', errorCode: 'net::ERR_ABORTED', rsc: true, prefetch: true };
test('only the exact optional RSC prefetch abort is a cancellation', () => {
  assert.equal(isAbortedRscPrefetch(baseline), true);
});
for (const [name, change] of [
  ['external origin', { sameOrigin: false }],
  ['unknown origin', { sameOrigin: undefined }],
  ['write request', { method: 'POST' }],
  ['HEAD request', { method: 'HEAD' }],
  ['document navigation', { resourceType: 'document' }],
  ['XHR request', { resourceType: 'xhr' }],
  ['generic network failure', { errorCode: 'net::ERR_FAILED' }],
  ['connection reset', { errorCode: 'net::ERR_CONNECTION_RESET' }],
  ['similar but nonexact abort error', { errorCode: 'net::ERR_ABORTED_EXTRA' }],
  ['unknown error', { errorCode: undefined }],
  ['ordinary fetch', { rsc: false, prefetch: false }],
  ['RSC navigation without prefetch', { prefetch: false }],
  ['missing prefetch header', { prefetch: undefined }],
  ['prefetch without RSC', { rsc: false }],
  ['missing RSC header', { rsc: undefined }],
]) test(`${name} remains a failure`, () => assert.equal(isAbortedRscPrefetch({ ...baseline, ...change }), false));
