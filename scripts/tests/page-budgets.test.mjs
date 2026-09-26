import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessPageBudgets, maximumLayoutShiftSession } from '../release/page-budgets.mjs';

const policy = {
  runs: 3,
  routes: ['/cs', '/cs/news', '/cs/news/fixture'],
  limits: {
    javascriptBytes: 350000,
    cssBytes: 60000,
    fontBytes: 180000,
    totalBytes: 1000000,
    lcpMs: 2500,
    cls: 0.1,
  },
};
const sample = (route) => ({
  route,
  status: 200,
  javascriptBytes: 100000,
  cssBytes: 12000,
  fontBytes: 50000,
  totalBytes: 200000,
  lcpMs: 1800,
  cls: 0.01,
  videoRequests: 0,
  pageErrors: 0,
  failedResources: 0,
});
const valid = () =>
  policy.routes.flatMap((route) => Array.from({ length: 3 }, () => sample(route)));

test('passes complete valid measurements and reports median LCP', () => {
  const samples = valid();
  samples[0].lcpMs = 2800;
  const result = assessPageBudgets(samples, policy);
  assert.deepEqual(result.errors, []);
  assert.equal(result.routes[0].medianLcpMs, 1800);
});
test('rejects missing routes and duplicate extra runs', () => {
  assert(assessPageBudgets(valid().slice(0, 6), policy).errors.length > 0);
  assert(assessPageBudgets([...valid(), sample('/cs')], policy).errors.length > 0);
});
test('rejects missing, nonfinite and zero vital/network measurements', () => {
  for (const value of [undefined, NaN, Infinity, 0, -1]) {
    const samples = valid();
    samples[0].lcpMs = value;
    assert(assessPageBudgets(samples, policy).errors.length > 0);
  }
  const samples = valid();
  samples[0].javascriptBytes = 0;
  assert(assessPageBudgets(samples, policy).errors.length > 0);
});
test('fails real weight regressions instead of hiding one run behind a median', () => {
  for (const metric of ['javascriptBytes', 'cssBytes', 'fontBytes', 'totalBytes']) {
    const samples = valid();
    samples[0][metric] = policy.limits[metric] + 1;
    assert(assessPageBudgets(samples, policy).errors.some((error) => error.includes(metric)));
  }
});
test('fails median LCP, any CLS excursion, wrong status and incomplete loading', () => {
  for (const metric of [
    'lcpMs',
    'cls',
    'status',
    'videoRequests',
    'pageErrors',
    'failedResources',
  ]) {
    const samples = valid();
    for (const row of samples)
      row[metric] = {
        lcpMs: 2501,
        cls: 0.11,
        status: 404,
        videoRequests: 1,
        pageErrors: 1,
        failedResources: 1,
      }[metric];
    assert(assessPageBudgets(samples, policy).errors.length > 0);
  }
});
test('CLS uses maximum five-second session window, ignoring recent input', () => {
  assert.equal(
    maximumLayoutShiftSession([
      { startTime: 100, value: 0.04 },
      { startTime: 500, value: 0.03 },
      { startTime: 1600, value: 0.05 },
      { startTime: 1700, value: 0.9, hadRecentInput: true },
    ]),
    0.07,
  );
  assert.equal(
    maximumLayoutShiftSession(
      Array.from({ length: 8 }, (_, i) => ({ startTime: i * 900, value: 0.01 })),
    ),
    0.060000000000000005,
  );
});
