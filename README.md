# Stride

A marathon training app for your phone with a Claude-powered coach.

- **Today**: what to run, target pace and heart-rate limit, and why.
- **Plan**: a 51-week plan to race day (Base, Build, Peak, Taper) with a 10K test and a half-marathon test.
- **Insights**: race readiness, streaks, weekly distance, pace and heart-rate trends.
- **Coach**: chat. Say "my calf is sore" or "I'm travelling Thursday" and the plan adjusts.
- **Log run**: upload a Galaxy Watch run screenshot. Claude reads the numbers, you confirm, the coach reviews the run and adjusts the next few weeks. Ran it on a different day than planned? Pick the date and the session it counts as. Missed runs show up on Today so you can log them late or mark them missed.

## Deploy (Vercel + Supabase, both free tiers)

Same setup as Margin and Recall. The data lives in Supabase (one private row per user), the app and API run on Vercel.

**1. Supabase** (you can reuse the Margin project)
- SQL Editor, New query, paste `supabase/schema.sql`, Run. It only adds a `stride_state` table.
- Project Settings, API Keys: copy the **Project URL** and the **Publishable key**.
- Sign in with your existing account (same email as `ALLOWED_EMAIL`). If you ever need a new account, create it under Authentication, Users.

**2. Vercel**
- Add New, Project, import `ajushibu/stride`. Leave all build settings alone.
- Environment Variables (copy from Margin's project where you can):

| Name | What |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key. Safe to expose, row-level security does the locking |
| `ANTHROPIC_API_KEY` | Claude API key. Server only |
| `ALLOWED_EMAIL` | The one account allowed in |

- Deploy. Vercel only reads environment variables at deploy time, so after changing one, redeploy.

**3. Install**
- Open the Vercel URL on your phone and sign in. On iPhone/iPad: Safari, Share, Add to Home Screen. On Android: Chrome menu, Install app.

**Updating later:** `git add -A && git commit -m "what changed" && git push`. Vercel redeploys in about a minute.

## Run locally

```bash
npm install
cp .env.example .env
npm start            # http://localhost:3000
```

With `SUPABASE_URL` unset, the app runs in file mode: data in `data/store.json`, no sign-in (set `APP_PASSCODE` to protect it). With the Supabase variables set it behaves exactly like the deployed version.

Without `ANTHROPIC_API_KEY` the app still works with manual run entry and basic offline feedback. Screenshot reading, AI plan changes and chat need the key.

## Settings worth checking on day one

- **Race date**: set to Sunday 10 Oct 2027 as an expected date. Confirm it once the official date is published, then use "Rebuild the weeks ahead".
- **Target time**: 4:30. Race a 10K around week 16 (February) and let that result decide whether to aim faster or slower.
- **Easy HR cap**: 142 bpm. A 10 km run at about 150 bpm is too hard for an easy run.
- **Time zone**: decides what "today" is. Change it when you travel.

## How the coach stays safe

The AI proposes changes and the server checks them before saving. It can only edit sessions in the next 21 days, never past ones, can cut a run by up to 35% but add at most 15%, cannot move race day, and pace and heart-rate recalibrations are range-checked. Pain or injury warnings are shown as flags. It is not a doctor.

## Notes and limits

- Screenshots are shrunk in the browser before upload because Vercel functions accept requests up to about 4.5 MB.
- The whole training state is one JSON row, last write wins. Fine for one person, but if you use two devices at the exact same moment the later save overwrites the earlier one.
- Supabase pauses free projects after about a week with no traffic. Opening the app wakes it.
- Each screenshot read, run review and chat message is one Claude API call on your key.

## Layout

```
api/index.js        Vercel entry, hands every /api/* request to the Express app
server/             Express app, plan generator, Claude coach, storage (Supabase or file)
supabase/schema.sql The one table plus row-level security
public/             The app (index.html, app.js, styles.css, design/ui.js, sw.js)
vercel.json         Serves public/, rewrites /api/* to the function
```
