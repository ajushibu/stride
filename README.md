# Stride

A marathon training app for your phone with a Claude-powered coach.

- **Today** shows what to run, the target pace and heart-rate limit, and why.
- **Plan** is a 51-week plan to race day (Base, Build, Peak, Taper) with a 10K test and a half-marathon test along the way.
- **Insights** has race readiness, streaks, weekly distance, and pace and heart-rate trends.
- **Coach** is a chat where you can say "my calf is sore" or "I'm travelling Thursday" and the plan adjusts.
- **Log run**: upload a screenshot of your Galaxy Watch run summary. Claude reads the numbers, you confirm or fix them, and the coach reviews the run and adjusts the next few weeks.

## Run it

You need Node 20 or newer and an Anthropic API key.

```bash
npm install
cp .env.example .env      # then put your key in .env
npm start
```

Open http://localhost:3000. Your data is saved in `data/store.json`.

Without an API key the app still works: plans, logging runs by hand and basic offline feedback. Screenshot reading, AI plan adjustments and chat need the key.

## Use it on your phone

Option A, same Wi-Fi: open `http://<your-computer-ip>:3000` on the phone. It works as a website, but "Add to Home Screen" install and offline mode need HTTPS.

Option B, host it (recommended): deploy this folder to any Node host (Render, Railway, Fly.io, a small VPS). Set `ANTHROPIC_API_KEY` and `APP_PASSCODE` as environment variables, and put `data/` on a persistent disk or volume or your history is lost on redeploy. Once it is served over HTTPS, open it in Chrome on your phone and choose Add to Home Screen.

Always set `APP_PASSCODE` on a public deployment, otherwise anyone with the link can spend your API credits.

## Settings worth checking on day one

- **Race date**: set to Sunday 10 Oct 2027 as an expected date. Confirm it against the official Melbourne Marathon Festival date once published, then use "Rebuild the weeks ahead".
- **Target time**: 4:30. Race a 10K around week 16 (February) and let that result decide whether to aim faster or slower.
- **Easy HR cap**: 142 bpm. Your 10 km at about 150 bpm was too hard for an easy run. Check your max heart rate if you know it.
- **Time zone**: matters for "today". Change it when you travel.

## How the coach stays safe

The AI proposes changes and the server checks them before saving anything. It can only edit sessions in the next 21 days, never in the past, can cut a run by up to 35% but add at most 15%, cannot move race day, and pace and heart-rate recalibrations are range-checked. Injury or pain warnings are shown to you as flags. It is not a doctor.

## Project layout

```
server/   Express API, plan generator, Claude coach, JSON storage
public/   The app (index.html, app.js, styles.css, design/ui.js)
public/design/   Design contract, gallery.html, review notes
```

Change the model with `STRIDE_MODEL` (default `claude-sonnet-5-5`).
