/* ───────────────────────────────────────────────────────────────────────────
   Supabase PUBLIC config.

   These two values are SAFE to ship in the browser — the anon key is a public
   key guarded by Row Level Security. NEVER put the service_role key or any
   Stripe secret in this file.

   Where to get them:  Supabase Dashboard → Project Settings → API
   ─────────────────────────────────────────────────────────────────────────── */
window.SUPABASE_URL      = "https://YOUR-PROJECT-REF.supabase.co";
window.SUPABASE_ANON_KEY = "YOUR-PUBLIC-ANON-KEY";

/* Where Google sends users back after sign-in. Add this exact URL under
   Supabase → Authentication → URL Configuration → Redirect URLs.
   `location.origin` makes it work on both localhost preview and your live domain. */
window.APP_REDIRECT = location.origin + "/account.html";
