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

## Preview locally

```
bun .claude/serve.js
```
