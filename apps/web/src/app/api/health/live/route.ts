/** Process liveness only; never touches the database so DB outages cannot cause restart storms. */
export function GET() {
  return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}
