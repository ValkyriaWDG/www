import { checkReadiness } from '@/lib/readiness';

/** Dependency readiness with bounded timeouts and sanitized output (no connection details). */
export async function GET() {
  const report = await checkReadiness();
  return Response.json(report, {
    status: report.status === 'ready' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
