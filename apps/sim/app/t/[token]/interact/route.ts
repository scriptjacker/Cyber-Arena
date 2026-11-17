import { confirmClick, rateKey, rateLimited } from '@/lib/telemetry';

export const dynamic = 'force-dynamic';

/**
 * The human-interaction beacon.
 *
 * A link visit alone proves very little — secure email gateways and link
 * scanners visit everything. This endpoint is called only after real pointer,
 * scroll, key or sustained-focus activity, and it is what promotes a click to
 * CLICK_CONFIRMED, the only click counted as a human failure.
 */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (rateLimited(rateKey(req))) return new Response(null, { status: 429 });

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const ok = await confirmClick(token, body, req);
  return new Response(null, { status: ok ? 204 : 400 });
}
