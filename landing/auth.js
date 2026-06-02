/* Shared Supabase auth helpers (ES module). Pages load config.js first, then import this. */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
});

export async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

export function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.APP_REDIRECT, queryParams: { prompt: "select_account" } },
  });
}

/* Email + password — Supabase only authenticates REAL, existing accounts with
   the correct password (and, when email confirmation is on, only confirmed
   ones). We never create or fake an account on a login attempt. */
export function signInWithEmail(email, password) {
  return supabase.auth.signInWithPassword({ email: String(email).trim(), password });
}

/* Create a real account. Supabase validates the email format + password and
   (when confirmation is enabled) emails a verify link before the account can be
   used — so only valid, owned emails become usable accounts. The profiles row
   is created by the DB trigger, same as Google sign-ups. */
export function signUpWithEmail(email, password, fullName) {
  return supabase.auth.signUp({
    email: String(email).trim(),
    password,
    options: {
      data: fullName ? { full_name: String(fullName).trim() } : undefined,
      emailRedirectTo: window.APP_REDIRECT,
    },
  });
}

/* Send a password-reset link. redirectTo lands back on the login page, which
   detects the recovery token and shows a "set new password" form. */
export function sendPasswordReset(email, redirectTo) {
  return supabase.auth.resetPasswordForEmail(String(email).trim(), { redirectTo });
}

/* Set a new password for the current (recovery) session. */
export function updatePassword(password) {
  return supabase.auth.updateUser({ password });
}

export async function signOut() {
  await supabase.auth.signOut();
  location.href = "index.html";
}

/* The user's row in public.profiles — plan + render usage. Created by a DB trigger on signup. */
export async function getProfile() {
  const u = await getUser();
  if (!u) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", u.id).single();
  return data ?? null;
}

/* The locally-stored session user (instant, no network) — best for UI state. */
export async function sessionUser() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.user ?? null;
}

let _acctMenuWired = false;

/* Synchronously paint the nav for a given user (or null). Safe to call from
   inside onAuthStateChange — it does NOT call any supabase method (which would
   risk a deadlock and leave the nav stuck on "Sign in"). */
export function renderNav(u) {
  const signin = document.getElementById("navSignin");
  const acct = document.getElementById("navAcct");
  if (!signin && !acct) return;
  // Toggle via display (not the `hidden` attribute) — `.btn`/flex display rules
  // override `[hidden]`, which is why Sign in wouldn't disappear before.
  const setVis = (el, vis) => { if (!el) return; if (vis) { el.removeAttribute("hidden"); el.style.display = ""; } else { el.style.display = "none"; } };
  if (u) {
    const name = u.user_metadata?.full_name || u.user_metadata?.name || u.email || "Account";
    const avatar = u.user_metadata?.avatar_url;
    const initial = (name.trim()[0] || "U").toUpperCase();
    setVis(signin, false);
    if (acct) {
      const av = avatar
        ? '<img src="' + avatar + '" alt="" referrerpolicy="no-referrer">'
        : '<span class="acct-i">' + initial + "</span>";
      const dashIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>';
      const outIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';
      acct.innerHTML =
        '<button class="acct-chip" id="acctBtn" type="button" aria-haspopup="true" aria-expanded="false" title="' + name + '">' + av + '</button>' +
        '<div class="acct-menu" id="acctMenu" hidden role="menu">' +
          '<div class="acct-who"><b>' + name + '</b><span>' + (u.email || "") + '</span></div>' +
          '<a href="account.html" role="menuitem">' + dashIcon + 'Dashboard</a>' +
          '<button type="button" id="acctSignout" role="menuitem">' + outIcon + 'Sign out</button>' +
        '</div>';
      setVis(acct, true);
      const btn = acct.querySelector("#acctBtn");
      const menu = acct.querySelector("#acctMenu");
      btn.addEventListener("click", e => { e.stopPropagation(); const open = menu.hidden; menu.hidden = !open; btn.setAttribute("aria-expanded", String(open)); });
      acct.querySelector("#acctSignout").addEventListener("click", () => signOut());
      if (!_acctMenuWired) {
        _acctMenuWired = true;
        document.addEventListener("click", e => {
          const m = document.getElementById("acctMenu"), b = document.getElementById("acctBtn");
          if (m && !m.hidden && b && !b.contains(e.target) && !m.contains(e.target)) { m.hidden = true; b.setAttribute("aria-expanded", "false"); }
        });
        document.addEventListener("keydown", e => { if (e.key === "Escape") { const m = document.getElementById("acctMenu"); if (m) m.hidden = true; } });
      }
    }
  } else {
    setVis(signin, true);
    setVis(acct, false);
  }
}

/* Async convenience: read the stored session once and paint. */
export async function paintNav() { renderNav(await sessionUser()); }
