// Sends the morning motivation and the evening reminder/thank-you.
// Email users get an email (Resend); phone users get a text (Twilio).
// Called hourly by pg_cron; it only acts when the local hour matches and never sends twice a day.
// Test without sending:  .../daily-message?kind=evening&dry=1   (send header x-cron-secret)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const TZ = env("TZ_NAME", "America/New_York");
const MORNING_HOUR = Number(env("MORNING_HOUR", "8"));
const EVENING_HOUR = Number(env("EVENING_HOUR", "20"));
const TEAM = env("TEAM_NAME", "Step Together");
const SITE = env("SITE_URL");
const GOAL = Number(env("GOAL", "1000000"));

const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

const QUOTES = [
  "Every step counts. Today's walk is a gift to future you.",
  "You don't have to go fast. You just have to go.",
  "A short walk is better than a perfect plan. Lace up!",
  "Small steps, taken daily, move mountains.",
  "The team is counting on your steps, and so is your mood. Get moving!",
  "Fresh air, steady pace, big impact. Have a great walk today.",
  "Progress, not perfection: one more step than yesterday.",
  "Walk like the finish line is just around the corner. Because together, it is.",
  "Your body keeps the score, so make it a good one today.",
  "Ten minutes now beats an hour of 'someday'. Step out the door!",
  "Move a little, feel a lot better. Your team is cheering you on.",
  "Rain or shine, every step you add lifts the whole team.",
  "Be the reason the team total jumps today.",
  "Start where you are, use what you have, walk what you can.",
  "One foot in front of the other. That's the whole secret.",
  "Today's steps are tomorrow's energy.",
  "You showed up yesterday. Do it again today.",
  "Walk it off, walk it out, walk it up.",
  "Every lap around the block is a win.",
  "Your future self says thanks for walking today.",
  "Slow and steady still gets there.",
  "Take the long way. Your legs will thank you.",
  "A good day starts with a good walk.",
  "Stretch, step out, smile.",
  "No excuses, just steps.",
  "Take the stairs. Park far away. Every bit adds up.",
  "Little by little, the team total climbs.",
  "Walk with a friend today and double the fun.",
  "Make today a 'yes, I walked' day.",
  "Don't count the steps. Make the steps count.",
  "The best workout is the one you actually do. Go for a walk!",
];

const n = (x: number) => Math.round(x).toLocaleString("en-US");

function localNow() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date()).map((x) => [x.type, x.value]),
  );
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

async function sendEmail(to: string, subject: string, text: string) {
  const key = env("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY not set");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env("FROM_EMAIL"), to, subject, text }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
}

async function sendSms(to: string, body: string) {
  const sid = env("TWILIO_ACCOUNT_SID"), token = env("TWILIO_AUTH_TOKEN");
  if (!sid || !token) throw new Error("Twilio secrets not set");
  const form = new URLSearchParams({ To: to.startsWith("+") ? to : "+" + to, Body: body });
  if (env("TWILIO_MESSAGING_SERVICE_SID")) form.set("MessagingServiceSid", env("TWILIO_MESSAGING_SERVICE_SID"));
  else form.set("From", env("TWILIO_FROM"));
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${sid}:${token}`), "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (!r.ok) throw new Error(`Twilio ${r.status}: ${await r.text()}`);
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== env("CRON_SECRET") || !env("CRON_SECRET")) {
    return new Response("Unauthorized", { status: 401 });
  }
  const url = new URL(req.url);
  const dry = url.searchParams.has("dry");
  const { day, hour } = localNow();
  const kind = (url.searchParams.get("kind") ??
    (hour === MORNING_HOUR ? "morning" : hour === EVENING_HOUR ? "evening" : "")) as "morning" | "evening" | "";
  if (!kind) return Response.json({ skipped: "not a send hour", day, hour });

  const [{ data: totals }, { data: opted }, { data: logged }, { data: already }] = await Promise.all([
    sb.rpc("team_totals"),
    sb.from("notify_prefs").select("user_id").eq("enabled", false),
    sb.from("steps").select("user_id").eq("day", day),
    sb.from("message_log").select("user_id").eq("day", day).eq("kind", kind),
  ]);
  const out = new Set((opted ?? []).map((r) => r.user_id));
  const hasLogged = new Set((logged ?? []).map((r) => r.user_id));
  const done = new Set((already ?? []).map((r) => r.user_id));
  const pct = Math.min(100, ((totals?.total ?? 0) / GOAL) * 100).toFixed(1);
  // Milestone shout-out: did the team cross 25/50/75/100% of the goal since the last message?
  const shift = (d: string, k: number) => new Date(new Date(d + "T00:00:00Z").getTime() + k * 864e5).toISOString().slice(0, 10);
  const through = async (d: string) => Number((await sb.rpc("total_through", { d })).data ?? 0);
  const [from, to] = kind === "morning" ? [shift(day, -2), shift(day, -1)] : [shift(day, -1), day];
  const level = (t: number) => Math.min(4, Math.floor((t / GOAL) * 4));
  const [before, after] = [level(await through(from)), level(await through(to))];
  const MILESTONES: Record<number, string> = {
    1: "The team just passed 25% of our goal, a quarter of the way there!",
    2: "Halfway there! The team just hit 50% of our goal.",
    3: "75% of the goal is done. The finish line is in sight!",
    4: `GOAL REACHED! The team just hit ${n(GOAL)} steps. Amazing work, everyone!`,
  };
  const milestone = after > before ? MILESTONES[after] + "\n\n" : "";
  const teamLine = `${milestone}${TEAM} total: ${n(totals?.total ?? 0)} steps (${pct}% of goal).`;
  const link = SITE ? `\n${SITE}` : "";
  const quote = QUOTES[Math.floor(new Date(day).getTime() / 86400000) % QUOTES.length];

  const result = { kind, day, dry, sent: 0, skipped: 0, failed: [] as string[], preview: [] as string[] };
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) {
      if (out.has(u.id) || done.has(u.id)) { result.skipped++; continue; }
      const via = u.email ? "email" : u.phone ? "sms" : "";
      if (!via) { result.skipped++; continue; }

      let subject: string, text: string;
      if (kind === "morning") {
        subject = `Good morning from ${TEAM}`;
        text = `Good morning! ${quote}\n\n${teamLine}${link}`;
      } else if (hasLogged.has(u.id)) {
        subject = `Thank you from ${TEAM}`;
        text = `Thanks for logging your steps today! Every one counts.\n\n${teamLine}${link}`;
      } else {
        subject = `Don't forget to log your steps`;
        text = `Quick reminder: you haven't logged today's steps yet. It only takes a moment, and the team is counting on you!\n\n${teamLine}${link}`;
      }
      if (via === "sms") text += "\nReply STOP to opt out.";

      try {
        if (dry) result.preview.push(`${via}: ${text.replaceAll("\n", " | ")}`);
        else {
          await (via === "email" ? sendEmail(u.email!, subject, text) : sendSms(u.phone!, text));
          await sb.from("message_log").insert({ user_id: u.id, day, kind });
        }
        result.sent++;
      } catch (e) {
        result.failed.push(`${via}: ${(e as Error).message}`);
      }
    }
    if (data.users.length < 1000) break;
  }
  if (!dry) result.preview = [];
  return Response.json(result);
});
