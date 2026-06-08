// Flimify — open the Polar customer portal for the signed-in user (Vercel Edge function).
// Called from the dashboard as:  GET /api/portal   with header
//   Authorization: Bearer <supabase access token>
// Returns { url } → the client redirects there (the pre-authenticated Polar portal,
// where the customer can manage/cancel their subscription, update card, see invoices).
// Returns { error: "no_customer" } (HTTP 200) when the user has never subscribed —
// there's no Polar customer to manage — so the client can send them to pricing instead.
//
// Reuses the SAME env vars as checkout.js — no new Polar setup needed:
//   SUPABASE_URL, SUPABASE_ANON_KEY, POLAR_ACCESS_TOKEN, POLAR_SERVER

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const ANON = process.env.SUPABASE_ANON_KEY;
  const POLAR_TOKEN = process.env.POLAR_ACCESS_TOKEN;
  const apiBase = (process.env.POLAR_SERVER === 'sandbox')
    ? 'https://sandbox-api.polar.sh'
    : 'https://api.polar.sh';

  // Verify the caller's Supabase session → trustworthy user id (can't be spoofed).
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return json({ error: 'Not signed in.' }, 401);

  let user;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return json({ error: 'Session expired — sign in again.' }, 401);
    user = await r.json();
  } catch {
    return json({ error: 'Could not verify your session.' }, 401);
  }
  if (!user || !user.id) return json({ error: 'Not signed in.' }, 401);

  // Create a Polar customer session, keyed by the same external id we set at checkout.
  let session;
  try {
    const r = await fetch(`${apiBase}/v1/customer-sessions/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${POLAR_TOKEN}` },
      body: JSON.stringify({ external_customer_id: user.id }),
    });
    session = await r.json().catch(() => ({}));
    if (!r.ok || !session.customer_portal_url) {
      // 404/422 → no Polar customer for this user yet (Free plan / never paid).
      if (r.status === 404 || r.status === 422) return json({ error: 'no_customer' }, 200);
      console.error('[portal] customer-session failed', r.status, session);
      return json({ error: 'Could not open the billing portal.' }, 502);
    }
  } catch {
    return json({ error: 'Could not reach the payment provider.' }, 502);
  }

  return json({ url: session.customer_portal_url }, 200);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
