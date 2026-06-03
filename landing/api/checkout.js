// Flimify — start a Polar checkout for the signed-in user (Vercel Edge function).
// Called from the site as:  GET /api/checkout?plan=creator   with header
//   Authorization: Bearer <supabase access token>
// Returns { url } → the client redirects there.
//
// The user is verified server-side from their Supabase token (can't be spoofed),
// and the checkout is tied to their immutable Supabase id via customer_external_id,
// so the webhook upgrades exactly the right account.
//
// Required Vercel env vars:
//   SUPABASE_URL            https://hwsyaqmkwitxprtnrzkj.supabase.co
//   SUPABASE_ANON_KEY       the publishable/anon key (public) — used to verify the token
//   POLAR_ACCESS_TOKEN      Polar → Settings → API token (SECRET)
//   POLAR_PRODUCT_CREATOR   Polar product id for Creator
//   POLAR_PRODUCT_STUDIO    Polar product id for Studio
//   POLAR_SERVER            "production" or "sandbox"   (defaults to production)

export const config = { runtime: 'edge' };

const SITE = 'https://flimify.com';

export default async function handler(req) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const ANON = process.env.SUPABASE_ANON_KEY;
  const POLAR_TOKEN = process.env.POLAR_ACCESS_TOKEN;
  const PROD_CREATOR = process.env.POLAR_PRODUCT_CREATOR;
  const PROD_STUDIO = process.env.POLAR_PRODUCT_STUDIO;
  const apiBase = (process.env.POLAR_SERVER === 'sandbox')
    ? 'https://sandbox-api.polar.sh'
    : 'https://api.polar.sh';

  const url = new URL(req.url);
  const plan = (url.searchParams.get('plan') || '').toLowerCase();
  const productId = plan === 'studio' ? PROD_STUDIO : (plan === 'creator' ? PROD_CREATOR : null);
  if (!productId) return json({ error: 'Unknown plan.' }, 400);

  // Verify the caller's Supabase session token → trustworthy user id + email.
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

  // Create the Polar checkout session, bound to this user.
  let checkout;
  try {
    const r = await fetch(`${apiBase}/v1/checkouts/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${POLAR_TOKEN}` },
      body: JSON.stringify({
        products: [productId],
        customer_external_id: user.id,
        customer_email: user.email,
        success_url: `${SITE}/account.html?upgraded=true`,
        metadata: { supabase_user_id: user.id },
      }),
    });
    checkout = await r.json();
    if (!r.ok || !checkout.url) {
      return json({ error: 'Could not start checkout.', detail: checkout }, 502);
    }
  } catch (e) {
    return json({ error: 'Could not reach the payment provider.' }, 502);
  }

  return json({ url: checkout.url }, 200);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
