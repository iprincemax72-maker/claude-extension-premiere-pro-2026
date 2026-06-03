# Flimify billing — Polar setup (activation checklist)

The code is done. It only goes live once you plug in the values below. Nothing
here can be hardcoded in the repo (these are secrets / per-account ids).

## How it works (the security model)

- **Pay → unlock** is driven entirely by a **signature-verified Polar webhook**.
  No client can grant itself a plan.
- A user's `plan` lives in Supabase `profiles`. **Clients can only READ it** —
  the `UPDATE` policy was removed, so the old "set your own plan in the browser
  console" hole is closed. Only the webhook (service_role) writes plans.
- The webhook is **idempotent** (each event id is recorded once) and rejects any
  request whose signature doesn't match `POLAR_WEBHOOK_SECRET`.
- Checkout is created **server-side from the verified Supabase token** and tied to
  the user's immutable id (`customer_external_id`), so the right account is upgraded.

## 1. Run the database schema

Supabase → SQL Editor → paste **`landing/schema.sql`** → Run. (Safe to re-run.)
This removes the self-upgrade RLS hole, adds the Polar columns, the
`billing_events` idempotency table, and the locked `apply_polar_subscription`
function.

## 2. Create the two products in Polar

Already have **Creator** (product id `1e9984cd-7c2e-4e8a-a711-18c5d827aa3f`).
Create **Studio** the same way (Recurring subscription, Monthly, $49) and copy
its product id.

## 3. Add the webhook in Polar

Polar → Settings → Webhooks → **Add endpoint**:
- **URL:** `https://flimify.com/api/polar-webhook`
- **Format:** Raw / Standard Webhooks (default)
- **Events:** `subscription.active`, `subscription.updated`, `subscription.uncanceled`, `subscription.revoked`
- Copy the **signing secret** it gives you (starts with `whsec_`).

## 4. Add the Vercel environment variables

Vercel → your project → Settings → Environment Variables (Production). Add:

| Name | Value | Secret? |
|---|---|---|
| `SUPABASE_URL` | `https://hwsyaqmkwitxprtnrzkj.supabase.co` | no |
| `SUPABASE_ANON_KEY` | your publishable/anon key (same as config.js) | no |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → **service_role** | **YES** |
| `POLAR_ACCESS_TOKEN` | Polar → Settings → API token | **YES** |
| `POLAR_WEBHOOK_SECRET` | the `whsec_…` from step 3 | **YES** |
| `POLAR_PRODUCT_CREATOR` | `1e9984cd-7c2e-4e8a-a711-18c5d827aa3f` | no |
| `POLAR_PRODUCT_STUDIO` | the Studio product id from step 2 | no |
| `POLAR_SERVER` | `production` (or `sandbox` while testing) | no |

Then **redeploy** so the functions pick them up.

> The functions live in `landing/api/`. This is correct **if your Vercel project's
> Root Directory is `landing`** (the webhook is then `https://flimify.com/api/polar-webhook`).
> If your Root Directory is the repo root instead, move the `api/` folder to the
> repo root.

## 5. Test in Sandbox first

Set `POLAR_SERVER=sandbox`, use Polar's sandbox + test card, click **Get Creator**
on the site while signed in. After paying you should see, within a few seconds:
- the dashboard shows **Creator** with 50 renders, and
- a row in Supabase `billing_events`, and `profiles.plan = 'creator'`.

Then flip `POLAR_SERVER=production` and the production product ids/secret.

## Notes / things to confirm against Polar's current API

- Checkout create posts `{ products: [productId], customer_external_id, customer_email, success_url, metadata }`.
  If Polar's API rejects `products`, the field may be `product_price_id` — easy one-line change in `landing/api/checkout.js`.
- Grant happens on `subscription.active`; downgrade to free on `subscription.revoked`
  (Polar fires `revoked` when access should actually end — a canceled sub keeps
  access until the period end, which is correct).
