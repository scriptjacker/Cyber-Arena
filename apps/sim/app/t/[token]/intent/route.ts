import { rateKey, rateLimited, recordIntent } from '@/lib/telemetry';

export const dynamic = 'force-dynamic';

/**
 * "I would have signed in."
 *
 * The request body schema is an EMPTY strict object. Any field at all — a
 * password, a username, a note — is rejected, and nothing from the body ever
 * reaches the database. There is no code path in this application that reads a
 * value out of this request.
 *
 * This endpoint is attacked directly by tests/abuse A16.
 */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (rateLimited(rateKey(req))) return new Response(null, { status: 429 });

  // Read the body only to reject it. The parsed value is never used.
  let body: unknown = {};
  try {
    const text = await req.text();
    body = text.trim() ? JSON.parse(text) : {};
  } catch {
    return new Response(null, { status: 400 });
  }

  const ok = await recordIntent(token, body);
  return new Response(null, { status: ok ? 204 : 400 });
}
