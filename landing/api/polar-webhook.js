// Flimify — Polar billing webhook (Vercel Edge function).
// URL:  https://flimify.com/api/polar-webhook   (add this exact URL in Polar → Settings → Webhooks)
//
// Security model:
//   1. Every request is signature-verified against POLAR_WEBHOOK_SECRET using the
//      Standard Webhooks spec (HMAC-SHA256). Unsigned / forged calls are rejected,
//      so nobody can POST a fake "you paid" event to upgrade themselves.
//   2. The plan change is written with the Supabase service_role key via a locked
//      SECURITY DEFINER function (apply_polar_subscription) that clients cannot call.
//   3. Idempotent: the webhook-id is recorded once, so re-delivered events never
//      double-apply.
//   4. The user is identified by customer_external_id (the immutable Supabase user
//      id we set at checkout) — not by anything the buyer can spoof.
//
// Required Vercel env vars (Project → Settings → Environment Variables):
//   SUPABASE_URL                 e.g. https://hwsyaqmkwitxprtnrzkj.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    Supabase → Settings → API → service_role (SECRET)
//   POLAR_WEBHOOK_SECRET         Polar → Settings → Webhooks → your endpoint's signing secret
//   POLAR_PRODUCT_CREATOR        Polar product id for the Creator plan
//   POLAR_PRODUCT_STUDIO         Polar product id for the Studio plan

export const config = { runtime: 'edge' };

const PLAN_LIMITS = { creator: 50, studio: 250, free: 5 };

function b64ToBytes(b64) {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
function bytesToB64(u) {
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Standard Webhooks signature verification (the spec Polar uses).
async function verifySignature(rawBody, headers, secret) {
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const sigHeader = headers.get('webhook-signature');
  if (!id || !timestamp || !sigHeader || !secret) return null;

  // Replay guard: reject timestamps more than 5 minutes off.
  const ts = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 300) return null;

  const secretB64 = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  let keyBytes;
  try { keyBytes = b64ToBytes(secretB64); } catch { return null; }

  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`));
  const expected = bytesToB64(new Uint8Array(sigBuf));

  // Header is a space-delimited list of "v1,<base64sig>" entries.
  const ok = sigHeader.split(' ').some(part => {
    const [version, sig] = part.split(',');
    return version === 'v1' && safeEqual(sig, expected);
  });
  return ok ? id : null;   // return the event id (for idempotency) on success
}

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET;
  const PROD_CREATOR = process.env.POLAR_PRODUCT_CREATOR;
  const PROD_CREATOR_Y = process.env.POLAR_PRODUCT_CREATOR_YEARLY;
  const PROD_STUDIO = process.env.POLAR_PRODUCT_STUDIO;
  const PROD_STUDIO_Y = process.env.POLAR_PRODUCT_STUDIO_YEARLY;

  const raw = await req.text();

  // 1) Verify the signature — reject anything we can't prove came from Polar.
  const eventId = await verifySignature(raw, req.headers, WEBHOOK_SECRET);
  if (!eventId) return new Response('invalid signature', { status: 401 });

  let event;
  try { event = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }

  const type = event.type || '';
  const data = event.data || {};

  // Only subscription lifecycle events change a plan. Grant on active/uncanceled,
  // revoke (to free) on revoked. Everything else is acknowledged and ignored.
  const isGrant =
    type === 'subscription.active' ||
    type === 'subscription.uncanceled' ||
    (type === 'subscription.updated' && data.status === 'active');
  const isRevoke = type === 'subscription.revoked';
  if (!isGrant && !isRevoke) return new Response('ignored', { status: 200 });

  // Identify the Supabase user (set as customer_external_id at checkout).
  const userId =
    (data.customer && data.customer.external_id) ||
    data.customer_external_id ||
    (data.metadata && data.metadata.supabase_user_id) ||
    null;
  if (!userId) return new Response('no external id; skipped', { status: 200 });

  let plan, limit, status;
  if (isRevoke) {
    plan = 'free'; limit = PLAN_LIMITS.free; status = 'revoked';
  } else {
    const productId =
      data.product_id ||
      (data.product && data.product.id) ||
      (Array.isArray(data.products) && data.products[0] && data.products[0].id) ||
      null;
    plan = (productId === PROD_STUDIO || productId === PROD_STUDIO_Y) ? 'studio'
         : (productId === PROD_CREATOR || productId === PROD_CREATOR_Y) ? 'creator'
         : null;
    if (!plan) return new Response('unknown product; skipped', { status: 200 });
    limit = PLAN_LIMITS[plan]; status = 'active';
  }

  // 2) Apply via the locked service_role RPC (idempotent on eventId).
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/apply_polar_subscription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
    body: JSON.stringify({
      p_event_id: eventId,
      p_user_id: userId,
      p_plan: plan,
      p_limit: limit,
      p_status: status,
      p_period_end: data.current_period_end || null,
      p_customer: (data.customer && data.customer.id) || data.customer_id || null,
      p_subscription: data.id || null,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    // Return 500 so Polar retries — a transient Supabase blip won't lose the upgrade.
    return new Response('supabase update failed: ' + body.slice(0, 300), { status: 500 });
  }
  return new Response('ok', { status: 200 });
}
