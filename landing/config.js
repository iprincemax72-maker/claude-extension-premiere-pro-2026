/* ───────────────────────────────────────────────────────────────────────────
   Supabase PUBLIC config.

   These two values are SAFE to ship in the browser — the anon key is a public
   key guarded by Row Level Security. NEVER put the service_role key or any
   Stripe secret in this file.

   Where to get them:  Supabase Dashboard → Project Settings → API
   ─────────────────────────────────────────────────────────────────────────── */
window.SUPABASE_URL      = "https://hwsyaqmkwitxprtnrzkj.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable_k7tsIqZia0WXf4eGQwcY2w_jFjAkDEK";  // Supabase "publishable" key = the new anon key (safe in the browser)

/* Where Google sends users back after sign-in. Add this exact URL under
   Supabase → Authentication → URL Configuration → Redirect URLs.
   `location.origin` makes it work on both localhost preview and your live domain. */
window.APP_REDIRECT = location.origin + "/account.html";
