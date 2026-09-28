/** Pure fail-closed assessment shared by the browser runner and regression tests. */
export function assessPageBudgets(samples, policy) {
  const errors = [];
  const routes = [];
  if (
    !Array.isArray(samples) ||
    !Array.isArray(policy.routes) ||
    !Number.isInteger(policy.runs) ||
    policy.runs < 3
  ) {
    return { errors: ['Invalid samples or measurement policy'], routes };
  }
  const metrics = ['javascriptBytes', 'cssBytes', 'fontBytes', 'totalBytes', 'lcpMs', 'cls'];
  for (const metric of metrics) {
    if (!Number.isFinite(policy.limits?.[metric]) || policy.limits[metric] <= 0)
      errors.push(`Invalid limit ${metric}`);
  }
  for (const row of samples) {
    if (!row || !policy.routes.includes(row.route)) {
      errors.push('Unexpected route measurement');
      continue;
    }
    for (const metric of metrics) {
      const minimum = metric === 'cls' ? 0 : Number.MIN_VALUE;
      if (!Number.isFinite(row[metric]) || row[metric] < minimum)
        errors.push(`${row.route}: missing/invalid ${metric}`);
      else if (metric !== 'lcpMs' && row[metric] > policy.limits[metric])
        errors.push(`${row.route}: ${metric} exceeds ${policy.limits[metric]}`);
    }
    if (row.status !== 200) errors.push(`${row.route}: expected HTTP 200`);
    for (const field of ['videoRequests', 'pageErrors', 'failedResources'])
      if (row[field] !== 0) errors.push(`${row.route}: ${field} must be zero`);
    if (row.totalBytes < row.javascriptBytes + row.cssBytes + row.fontBytes)
      errors.push(`${row.route}: inconsistent total transfer`);
  }
  for (const route of policy.routes) {
    const rows = samples.filter((row) => row?.route === route);
    if (rows.length !== policy.runs) {
      errors.push(`${route}: expected exactly ${policy.runs} cold runs`);
      continue;
    }
    const lcps = rows.map((row) => row.lcpMs).sort((a, b) => a - b);
    const medianLcpMs = lcps[Math.floor(lcps.length / 2)];
    if (medianLcpMs > policy.limits.lcpMs)
      errors.push(`${route}: median lcpMs exceeds ${policy.limits.lcpMs}`);
    routes.push({
      route,
      medianLcpMs,
      maximumCls: Math.max(...rows.map((row) => row.cls)),
      maximumTransferBytes: Math.max(...rows.map((row) => row.totalBytes)),
    });
  }
  return { errors, routes };
}

/** CLS maximum session window: gaps <1 second, duration <5 seconds, no recent input. */
export function maximumLayoutShiftSession(entries) {
  let maximum = 0;
  let sum = 0;
  let first = 0;
  let previous = 0;
  for (const entry of entries
    .filter((item) => !item.hadRecentInput)
    .sort((a, b) => a.startTime - b.startTime)) {
    if (sum > 0 && entry.startTime - previous < 1000 && entry.startTime - first < 5000)
      sum += entry.value;
    else {
      first = entry.startTime;
      sum = entry.value;
    }
    previous = entry.startTime;
    maximum = Math.max(maximum, sum);
  }
  return maximum;
}
