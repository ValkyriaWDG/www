'use strict';

// Only the optional Next.js RSC prefetch has the added cancellation exception.
// A failed navigation, ordinary fetch or transport error remains a failure.
function isAbortedRscPrefetch(request) {
  return request.sameOrigin === true && request.method === 'GET' &&
    request.resourceType === 'fetch' && request.errorCode === 'net::ERR_ABORTED' &&
    request.rsc === true && request.prefetch === true;
}

module.exports = { isAbortedRscPrefetch };
