# Step Together

A static walking-step tracker for a group. Hosted free on GitHub Pages, with Supabase (free tier) as the backend and Brevo (free tier) for email.

- Sign in with an email address using a one-time 6-digit code.
- Everyone sees the team total, progress bar and live ticker; nobody sees anyone else's numbers.
- Each person can view, edit and delete their own daily entries.
- Daily emails: a motivational message at 8 AM and a reminder or thank-you at 8 PM (Eastern).

## Setup

1. **Supabase**: create a free project. In *SQL Editor*, run `schema.sql`, then `notifications.sql` (leave its last `cron.schedule` block for later).
2. **Sign-in emails**: *Authentication → Emails → Templates*. In both **Confirm sign up** and **Magic link**, make the body show `{{ .Token }}` (the 6-digit code) instead of a link.
3. **Sending service**: create a free Brevo account, add and verify a sender address, then under *SMTP & API → SMTP* generate an SMTP key. In Supabase, *Authentication → Emails → SMTP Settings*, enable custom SMTP: host `smtp-relay.brevo.com`, port `587`, username = your Brevo SMTP login, password = the SMTP key.
4. **Config**: put the Supabase Project URL and publishable (anon) key into `config.js`. Set `TEAM_NAME` and `GOAL` there too.
5. **GitHub Pages**: push these files, then *Settings → Pages → Deploy from branch → main / root*. Set the Supabase *Authentication → URL Configuration → Site URL* to your Pages address.

## Daily messages

- **8 AM:** a motivational message (31 rotating sayings) with the team total.
- **8 PM:** a reminder to anyone who hasn't logged today, and a thank-you to anyone who has.
- When the team crosses 25%, 50%, 75% or 100% of the goal, the next message opens with a celebration line.
- Every email has an unsubscribe link. There is no setting on the page.
- Times and time zone are secrets (`MORNING_HOUR`, `EVENING_HOUR`, `TZ_NAME`; default 8, 20, America/New_York). Daylight saving is handled.

Setup (all in the Supabase and Brevo dashboards):

1. In Brevo: *SMTP & API → API Keys → Generate a new API key* (this is different from the SMTP key).
2. In Supabase: *Edge Functions → Deploy a new function → Via Editor*. Create `daily-message` and paste in `supabase/functions/daily-message/index.ts`. Create `unsubscribe` and paste in `supabase/functions/unsubscribe/index.ts`. For both, turn **off** "Verify JWT".
3. In Supabase: *Edge Functions → Secrets*, add `CRON_SECRET` (a long random string), `BREVO_API_KEY`, `FROM_EMAIL` (your verified Brevo sender), `FROM_NAME`, `SITE_URL`, `TEAM_NAME`, `GOAL`.
4. In the SQL Editor, run the `cron.schedule` block at the bottom of `notifications.sql` with your project ref and the same `CRON_SECRET`.
5. Test without sending anything (shows who would get what):

   ```
   curl -H "x-cron-secret: YOUR-SECRET" "https://YOUR-PROJECT-REF.supabase.co/functions/v1/daily-message?kind=evening&dry=1"
   ```

The wording lives in `supabase/functions/daily-message/index.ts` (the `QUOTES` list and the texts below it). Paste the updated file into the dashboard editor to change it.

## Preview locally

```
bun .claude/serve.js
```
