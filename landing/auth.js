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

/* Paint the nav auth state on index.html. No-op if the nodes aren't present. */
export async function paintNav() {
  const signin = document.getElementById("navSignin");
  const acct = document.getElementById("navAcct");
  if (!signin && !acct) return;
  const u = await getUser();
  if (u) {
    const name = u.user_metadata?.full_name || u.user_metadata?.name || u.email || "Account";
    const avatar = u.user_metadata?.avatar_url;
    const initial = (name.trim()[0] || "U").toUpperCase();
    if (signin) signin.hidden = true;
    if (acct) {
      acct.hidden = false;
      acct.innerHTML =
        '<a href="account.html" class="acct-chip" title="' + name + '">' +
        (avatar
          ? '<img src="' + avatar + '" alt="" referrerpolicy="no-referrer">'
          : '<span class="acct-i">' + initial + "</span>") +
        "<span>Account</span></a>";
    }
  } else {
    if (signin) signin.hidden = false;
    if (acct) acct.hidden = true;
  }
}
