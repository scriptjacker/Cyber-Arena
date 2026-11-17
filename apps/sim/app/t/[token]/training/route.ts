import { rateKey, rateLimited, recordTraining } from '@/lib/telemetry';

export const dynamic = 'force-dynamic';

/**
 * Learning telemetry: started, completed, drill passed or failed, and dwell
 * time.
 *
 * Completion is tracked rather than delivery because that is what the evidence
 * supports: the UCSD study (19,500 employees) found static, unfinished training
 * had no measurable effect, while participants who *completed* an interactive
 * session failed later exercises less often.
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

  const ok = await recordTraining(token, body);
  return new Response(null, { status: ok ? 204 : 400 });
}
