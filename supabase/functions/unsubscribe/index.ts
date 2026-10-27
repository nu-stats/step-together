// Target of the "Unsubscribe" link in emails. Verifies the signed link, records the opt-out,
// then sends the person back to the site with a confirmation banner.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

async function sign(uid: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env("CRON_SECRET")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(uid));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const uid = url.searchParams.get("u") ?? "";
  const t = url.searchParams.get("t") ?? "";
  if (!env("CRON_SECRET") || !/^[0-9a-f-]{36}$/.test(uid) || t !== (await sign(uid))) {
    return new Response("This unsubscribe link isn't valid.", { status: 400 });
  }
  const { error } = await sb.from("notify_prefs").upsert({ user_id: uid, enabled: false }, { onConflict: "user_id" });
  if (error) return new Response("Something went wrong. Please try again.", { status: 500 });
  const site = env("SITE_URL");
  return site
    ? new Response(null, { status: 302, headers: { Location: `${site}${site.includes("?") ? "&" : "?"}unsubscribed=1` } })
    : new Response("You're unsubscribed from the daily messages.");
});
