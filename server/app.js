require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('./store');
const { uid } = db;
const { generatePlan } = require('./plan');
const { todayIn, addDays, diffDays, mondayOf } = require('./dates');
const { summary, allSessions } = require('./stats');
const coach = require('./coach');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const PASSCODE = process.env.APP_PASSCODE || ''; // file mode only
const ALLOWED_EMAIL = (process.env.ALLOWED_EMAIL || '').trim().toLowerCase();

app.use(express.json({ limit: '1mb' }));

// Public values the browser needs to sign in. The publishable key is designed to be public.
app.get('/api/config', (req, res) => {
  res.json({ auth: db.mode === 'supabase' ? 'supabase' : PASSCODE ? 'passcode' : 'none', supabase_url: db.config.url || null, supabase_key: db.config.key || null });
});
app.get('/api/health', (req, res) => res.json({ ok: true, ai: coach.hasKey(), storage: db.mode }));

// Everything else needs a signed-in, allowed user (Supabase mode) or the optional passcode (file mode).
app.use('/api', async (req, res, next) => {
  try {
    if (db.mode === 'supabase') {
      const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
      const user = await db.verifyToken(m && m[1]);
      if (!user) return res.status(401).json({ error: 'auth_required', message: 'Please sign in.' });
      if (!ALLOWED_EMAIL) return res.status(500).json({ error: 'server_error', message: 'ALLOWED_EMAIL is not set on the server.' });
      if (user.email !== ALLOWED_EMAIL) return res.status(403).json({ error: 'not_allowed', message: 'This account is not allowed.' });
      req.ctx = { token: m[1], user };
    } else {
      if (PASSCODE && req.get('x-passcode') !== PASSCODE) return res.status(401).json({ error: 'auth_required', message: 'Passcode required.' });
      req.ctx = {};
    }
    req.store = await db.load(req.ctx);
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error', message: e.message || 'Something went wrong' });
  }
});

const todayOf = (store) => todayIn(store.profile.timezone);
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  console.error(e);
  if (e.code === 'no_api_key') return res.status(503).json({ error: 'no_api_key', message: e.message });
  if (e.status && e.error && e.error.type) { // error from the Anthropic API
    const t = e.error.error && e.error.error.type, m = (e.error.error && e.error.error.message) || '';
    const msg = e.status === 401 ? 'The Claude API key on the server is invalid. Check ANTHROPIC_API_KEY in Vercel and redeploy.'
      : /credit balance/i.test(m) ? 'Your Anthropic account is out of credit. Add credit under Billing in the Anthropic console.'
      : e.status === 429 ? 'Claude is rate limited right now. Try again in a minute.'
      : e.status === 529 || e.status >= 500 ? 'Claude is busy right now. Try again in a minute.'
      : 'Claude could not process that (' + (t || e.status) + '). ' + m.slice(0, 160);
    return res.status(502).json({ error: 'ai_error', message: msg });
  }
  res.status(500).json({ error: 'server_error', message: e.message || 'Something went wrong' });
});

/* ---------- state ---------- */
app.get('/api/state', wrap(async (req, res) => {
  const store = req.store;
  res.json({
    profile: store.profile,
    plan: store.plan,
    runs: store.runs,
    chat: store.chat.slice(-60),
    summary: summary(store, todayOf(store)),
    ai: { enabled: coach.hasKey(), model: coach.MODEL },
    passcode_required: !!PASSCODE,
  });
}));

/* ---------- profile / plan ---------- */
app.put('/api/profile', wrap(async (req, res) => {
  const store = req.store;
  const b = req.body || {};
  const p = store.profile;
  if (typeof b.name === 'string') p.name = b.name.slice(0, 40);
  if (typeof b.race_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.race_date)) p.race_date = b.race_date;
  if (typeof b.race_name === 'string' && b.race_name.trim()) p.race_name = b.race_name.slice(0, 60);
  if (Number.isFinite(b.target_time_sec) && b.target_time_sec > 7200 && b.target_time_sec < 25200) p.target_time_sec = Math.round(b.target_time_sec);
  if (Number.isFinite(b.max_hr) && b.max_hr > 150 && b.max_hr < 225) p.max_hr = Math.round(b.max_hr);
  if (Number.isFinite(b.easy_hr_cap) && b.easy_hr_cap > 110 && b.easy_hr_cap < 165) p.hr.easy_cap = Math.round(b.easy_hr_cap);
  if (typeof b.timezone === 'string' && b.timezone) {
    try { new Intl.DateTimeFormat('en', { timeZone: b.timezone }); p.timezone = b.timezone; } catch { /* ignore bad tz */ }
  }

  // Regenerate only the weeks that have not started yet. History is never rewritten.
  if (b.regenerate) {
    const t = todayOf(store);
    const nextMon = addDays(mondayOf(t), 7);
    const fresh = generatePlan({ ...p, plan_start: store.plan.weeks[0].start });
    const keep = store.plan.weeks.filter((w) => w.start < nextMon);
    const rest = fresh.weeks.filter((w) => w.start >= nextMon);
    store.plan = { generated_at: new Date().toISOString(), weeks: [...keep, ...rest] };
    store.changelog.push({ at: new Date().toISOString(), what: 'Plan regenerated from Settings' });
  }
  await db.save(store, req.ctx);
  res.json({ profile: p, plan: store.plan, summary: summary(store, todayOf(store)) });
}));

/* ---------- run logging ---------- */
app.post('/api/runs/extract', upload.single('image'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_image', message: 'Attach a screenshot.' });
  const okTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  if (!okTypes.includes(req.file.mimetype)) return res.status(400).json({ error: 'bad_type', message: 'Use a PNG, JPG or WebP screenshot.' });
  const extracted = await coach.extractRun(req.file.buffer, req.file.mimetype);

  const store = req.store;
  const t = todayOf(store);
  const date = extracted.date || t;
  // suggest which planned session this run belongs to
  const candidates = allSessions(store.plan)
    .filter((s) => s.status === 'planned' && diffDays(date, s.date) >= -14 && diffDays(date, s.date) <= 3) // up to 14 days late, 3 days early
    .sort((a, b) => Math.abs(diffDays(date, a.date)) - Math.abs(diffDays(date, b.date)) || Math.abs(a.km - (extracted.distance_km || 0)) - Math.abs(b.km - (extracted.distance_km || 0)));
  const best = candidates[0];
  const suggested = best && Math.abs(diffDays(date, best.date)) <= 3 ? best.id : null; // older missed sessions are offered, not assumed
  res.json({ extracted, suggested_session_id: suggested, date });
}));

app.post('/api/runs', wrap(async (req, res) => {
  const store = req.store;
  const b = req.body || {};
  const num = (v) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : null);
  const distance = num(b.distance_km);
  const duration = num(b.duration_sec);
  if (!distance || distance < 0.5 || distance > 100) return res.status(400).json({ error: 'bad_distance', message: 'Distance looks wrong.' });
  if (!duration || duration < 120 || duration > 24 * 3600) return res.status(400).json({ error: 'bad_duration', message: 'Duration looks wrong.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) return res.status(400).json({ error: 'bad_date', message: 'Date is required.' });
  if (b.date > todayOf(store)) return res.status(400).json({ error: 'future_date', message: 'That date is in the future.' });

  const run = {
    id: uid('run'),
    date: b.date,
    distance_km: Math.round(distance * 100) / 100,
    duration_sec: Math.round(duration),
    avg_pace_sec: num(b.avg_pace_sec) || Math.round(duration / distance),
    avg_hr: num(b.avg_hr),
    max_hr: num(b.max_hr),
    cadence: num(b.cadence),
    calories: num(b.calories),
    elevation_m: num(b.elevation_m),
    session_id: b.session_id || null,
    source: b.source === 'manual' ? 'manual' : 'screenshot',
    notes: typeof b.notes === 'string' ? b.notes.slice(0, 300) : '',
    created_at: new Date().toISOString(),
  };

  // link to the planned session
  let session = null;
  if (run.session_id) {
    for (const w of store.plan.weeks) {
      const s = w.sessions.find((x) => x.id === run.session_id);
      if (s && s.status === 'planned') { session = s; break; }
    }
    if (!session) run.session_id = null;
  }
  if (session && Math.abs(diffDays(session.date, run.date)) > 14) return res.status(400).json({ error: 'bad_session', message: 'That session is more than two weeks from the run date.' });
  if (session) { run.planned_date = session.date; session.status = 'done'; session.run_id = run.id; session.done_on = run.date; }
  store.runs.push(run);
  store.runs.sort((a, b) => a.date.localeCompare(b.date));

  // coach review (AI if available, transparent fallback if not)
  let review;
  let ai = true;
  try {
    review = await coach.reviewRun(store, todayOf(store), run);
  } catch (e) {
    ai = false;
    console.error('review failed:', e.message);
    review = coach.fallbackReview(store, todayOf(store), run);
  }
  const applied = coach.applyChanges(store, todayOf(store), review);
  run.review = { verdict: review.verdict, coach_note: review.coach_note, what_changed: review.what_changed, flags: review.flags || [], ai };
  store.changelog.push({ at: run.created_at, run_id: run.id, applied: applied.applied });
  await db.save(store, req.ctx);

  res.json({ run, review: run.review, applied: applied.applied, rejected: applied.rejected, plan: store.plan, profile: store.profile, summary: summary(store, todayOf(store)) });
}));

app.delete('/api/runs/:id', wrap(async (req, res) => {
  const store = req.store;
  const i = store.runs.findIndex((r) => r.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'not_found' });
  const [r] = store.runs.splice(i, 1);
  for (const w of store.plan.weeks) for (const s of w.sessions) if (s.run_id === r.id) { s.status = 'planned'; delete s.run_id; }
  await db.save(store, req.ctx);
  res.json({ ok: true, runs: store.runs, plan: store.plan, summary: summary(store, todayOf(store)) });
}));

app.post('/api/sessions/:id/skip', wrap(async (req, res) => {
  const store = req.store;
  for (const w of store.plan.weeks) {
    const s = w.sessions.find((x) => x.id === req.params.id);
    if (s && s.status === 'planned') {
      s.status = 'skipped';
      s.skip_reason = (req.body && req.body.reason) || 'Skipped';
      w.km = Math.round(w.sessions.filter((x) => x.status !== 'skipped').reduce((a, x) => a + x.km, 0) * 10) / 10;
      await db.save(store, req.ctx);
      return res.json({ plan: store.plan, summary: summary(store, todayOf(store)) });
    }
  }
  res.status(404).json({ error: 'not_found' });
}));

/* ---------- coach chat ---------- */
app.post('/api/chat', wrap(async (req, res) => {
  const store = req.store;
  const text = ((req.body && req.body.message) || '').toString().trim().slice(0, 2000);
  if (!text) return res.status(400).json({ error: 'empty' });
  const history = store.chat.filter((m) => m.role === 'user' || m.role === 'assistant');
  const out = await coach.chat(store, todayOf(store), history, text);
  const at = new Date().toISOString();
  store.chat.push({ role: 'user', content: text, at });
  store.chat.push({ role: 'assistant', content: out.text, at: new Date().toISOString(), changes: out.changes ? out.changes.applied : undefined });
  if (store.chat.length > 200) store.chat = store.chat.slice(-200);
  if (out.changes && out.changes.applied.length) store.changelog.push({ at, chat: true, applied: out.changes.applied });
  await db.save(store, req.ctx);
  res.json({ reply: out.text, applied: out.changes ? out.changes.applied : [], plan: store.plan, profile: store.profile, summary: summary(store, todayOf(store)) });
}));

app.delete('/api/chat', wrap(async (req, res) => { req.store.chat = []; await db.save(req.store, req.ctx); res.json({ ok: true }); }));

/* ---------- static ---------- */
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));
app.get('/{*splat}', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

module.exports = app;
