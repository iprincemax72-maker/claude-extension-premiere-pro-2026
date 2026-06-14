# Setup — Supabase auth + Google sign-in (Phase 1)

Everything in the code is done. These are the console steps only **you** can do (they need your Google + Supabase logins). ~10 minutes, no credit card.

---

## 1. Create the Supabase project
1. Go to <https://supabase.com> → **New project**.
2. Name it (e.g. `claude-premiere`), set a strong DB password, pick a region near you.
3. Wait ~2 min for it to provision.

## 2. Paste your keys into `config.js`
1. In Supabase: **Project Settings → API**.
2. Copy **Project URL** and the **anon public** key.
3. Open `landing/config.js` and replace the two placeholders:
   ```js
   window.SUPABASE_URL      = "https://abcd1234.supabase.co";   // your Project URL
   window.SUPABASE_ANON_KEY = "eyJhbGciOi...";                  // your anon public key
   ```
   > The anon key is **meant** to be public (guarded by Row Level Security). The `service_role` key is the secret one — never put that here.

## 3. Create the database tables
1. In Supabase: **SQL Editor → New query**.
2. Paste the entire contents of `landing/schema.sql` and click **Run**.
3. You should see “Success”. This creates the `profiles` table (plan + render usage), the auto-create-on-signup trigger, and the `consume_render()` / `my_usage()` functions.

## 4. Turn on Google sign-in
**a) Make Google OAuth credentials**
1. Go to <https://console.cloud.google.com> → create/select a project.
2. **APIs & Services → OAuth consent screen** → External → fill app name + your email → save.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
4. Under **Authorized redirect URIs**, add (replace with your ref):
   ```
   https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
   ```
   (Find this exact URL in Supabase → Authentication → Providers → Google — it shows the callback to copy.)
5. Create → copy the **Client ID** and **Client secret**.

**b) Paste them into Supabase**
1. Supabase: **Authentication → Providers → Google** → enable.
2. Paste the **Client ID** and **Client secret** → **Save**.

## 5. Allow your site URLs
Supabase: **Authentication → URL Configuration**:
- **Site URL:** `http://localhost:8899` (for now; change to your real domain later)
- **Redirect URLs** — add both:
  ```
  http://localhost:8899/account.html
  https://your-real-domain.com/account.html
  ```

## 6. Test it
1. Run the preview server: `python3 landing/serve.py`
2. Open <http://localhost:8899> → click **Sign in** (top-right) → **Continue with Google**.
3. After Google, you land on **/account.html** showing your name, avatar, and **0 / 10 renders**.
4. A row should appear in Supabase → **Table editor → profiles**.

---

### Troubleshooting
| Problem | Fix |
|---|---|
| “redirect_uri_mismatch” from Google | The URI in Google Cloud must match `https://<ref>.supabase.co/auth/v1/callback` exactly. |
| Lands on a blank/error after Google | Add `http://localhost:8899/account.html` to Supabase Redirect URLs (step 5). |
| Account page shows defaults, no DB row | Re-run `schema.sql` (the signup trigger must exist). |
| “Invalid API key” in console | `config.js` still has placeholders, or you pasted the wrong key. |

---

## Phase 3 — Sign-in + render limits inside the extension

The extension (CEP panel + local bridge) now has its own login that reuses the **same** Supabase project. The bridge serves a `/connect` page, the panel opens it in your browser, you sign in with Google, and the session is handed back to the bridge. Before each render the bridge calls `consume_render()` — so the **render limit is actually enforced**, and free chat stays open.

It's **fail-open**: if the bridge has no Supabase config, renders work exactly as before. So this only switches on once you do the two steps below.

### a) Tell the bridge your Supabase keys
Create `~/PremiereClaude/bridge-auth.json` (same values as `config.js`):
```json
{
  "SUPABASE_URL": "https://abcd1234.supabase.co",
  "SUPABASE_ANON_KEY": "eyJhbGciOi..."
}
```
(There's a template at `bridge/bridge-auth.example.json`. You can also set `SUPABASE_URL` / `SUPABASE_ANON_KEY` as env vars instead.)

### b) Allow the bridge's connect URL
Supabase → **Authentication → URL Configuration → Redirect URLs**, add:
```
http://localhost:3737/connect
```

### c) Update the installed extension + bridge
Re-run the installer so the new panel + bridge land in place, then restart the bridge:
```bash
bash install.sh
```
(Or copy `bridge/bridge.js` → `~/PremiereClaude/` and the panel folder manually.)

### d) Use it
1. Open the panel in Premiere → click the **account icon** (top bar) → **Sign in with Google**.
2. A browser tab opens (`localhost:3737/connect`) → sign in → "✓ Connected" → back to Premiere.
3. The account icon turns coral and shows **plan + renders used / limit**.
4. Try to render past your limit → the panel replies that you're out and to upgrade. Each successful render increments the count in Supabase.

> Note (v1): a render is counted when it starts, so a failed render still consumes one. We can move counting to on-success later if you want.

---

When this works, tell me and we'll do **Phase 2 (Stripe monthly billing)** — wire the pricing buttons to Checkout, a webhook that flips `plan` / `renders_limit`, and the "Manage billing" portal.
