# Step Together

A static walking-step tracker for a group. Hosted free on GitHub Pages, with Supabase (free tier) as the backend.

- Sign in with email (or phone) using a one-time code.
- Everyone sees the team total, progress bar and live ticker; nobody sees anyone else's numbers.
- Each person can view, edit and delete their own daily entries.

## Setup (about 10 minutes)

1. **Supabase**: create a free project at supabase.com. Open *SQL Editor*, paste `schema.sql`, and run it.
2. **Email sign-in**: *Authentication → Providers → Email* is on by default. To send a 6-digit code instead of a link, edit the "Magic Link" email template and use `{{ .Token }}`. (Default Supabase email is rate-limited; add a free SMTP provider such as Resend if the group grows.)
3. **Phone sign-in (optional)**: *Authentication → Providers → Phone* needs an SMS provider (e.g. Twilio), which costs money. Skip it to keep things free; email-only works fine.
4. **Config**: copy *Project Settings → API* values (Project URL and `anon` key) into `config.js`. Set `TEAM_NAME` and `GOAL` there too.
5. **GitHub Pages**: push these files to a GitHub repo, then *Settings → Pages → Deploy from branch → main / root*.
6. Add your Pages URL under *Supabase → Authentication → URL Configuration → Site URL*.

Leave `SUPABASE_URL` empty in `config.js` to run the demo mode locally (sample data, demo code `123456`).

## Daily messages (optional)

- **8 AM:** a motivational message with the team total, by email or text depending on how each person signed up.
- **8 PM:** a reminder to anyone who hasn't logged today, and a thank-you to anyone who has.
- Times and time zone are secrets (`MORNING_HOUR`, `EVENING_HOUR`, `TZ_NAME`; default 8, 20, America/New_York). Daylight saving is handled.
- When the team crosses 25%, 50%, 75% or 100% of the goal, the next message opens with a celebration line.
- Everyone can switch messages off with the checkbox on the page. Texts also honor "STOP".

Setup:

1. Run `notifications.sql` in the SQL Editor, but leave the last `cron.schedule` statement for step 5.
2. **Email:** create a free Resend account (resend.com), verify a sending domain, and make an API key.
3. **Text:** create a Twilio account, buy a number, and register it for US messaging (A2P 10DLC). Texting costs money, and US carriers require registration before they deliver. Email-only is free: skip this and phone users simply won't get messages.
4. Install the Supabase CLI, then from this folder:

   ```
   supabase login
   supabase link --project-ref YOUR-PROJECT-REF
   supabase secrets set CRON_SECRET=pick-a-long-random-string FROM_EMAIL="Step Together <steps@yourdomain.com>" RESEND_API_KEY=... SITE_URL=https://nu-stats.github.io/step-together/ TEAM_NAME="Step Together" GOAL=1000000
   supabase secrets set TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_FROM=+15551234567
   supabase functions deploy daily-message --no-verify-jwt
   ```

5. Put your project ref and the same `CRON_SECRET` into the `cron.schedule` block of `notifications.sql` and run it.
6. Test without sending anything (shows who would get what):

   ```
   curl -H "x-cron-secret: YOUR-SECRET" "https://YOUR-PROJECT-REF.supabase.co/functions/v1/daily-message?kind=evening&dry=1"
   ```

The message wording lives in `supabase/functions/daily-message/index.ts` (the `QUOTES` list and the texts below it). Redeploy after editing.

## Preview locally

```
bun .claude/serve.js
```
