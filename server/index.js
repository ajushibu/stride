require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const { load, save, uid } = require('./store');
const { generatePlan } = require('./plan');
const { todayIn, addDays, diffDays, mondayOf } = require('./dates');
const { summary, allSessions } = require('./stats');
const coach = require('./coach');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const PASSCODE = process.env.APP_PASSCODE || '';

app.use(express.json({ limit: '1mb' }));

// Optional passcode so a public deployment is not an open Claude proxy.
app.use('/api', (req, res, next) => {
  if (PASSCODE && req.get('x-passcode') !== PASSCODE) return res.status(401).json({ error: 'passcode_required' });
  next();
});

const today = () => todayIn(load().profile.timezone);
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  console.error(e);
  if (e.code === 'no_api_key') return res.status(503).json({ error: 'no_api_key', message: e.message });
  res.status(500).json({ error: 'server_error', message: e.message || 'Something went wrong' });
});

/* ---------- state ---------- */
app.get('/api/state', wrap((req, res) => {
  const store = load();
  res.json({
    profile: store.profile,
    plan: store.plan,
    runs: store.runs,
    chat: store.chat.slice(-60),
    summary: summary(store, today()),
    ai: { enabled: coach.hasKey(), model: coach.MODEL },
    passcode_required: !!PASSCODE,
  });
}));

app.get('/api/health', (req, res) => res.json({ ok: true, ai: coach.hasKey() }));

/* ---------- profile / plan ---------- */
app.put('/api/profile', wrap((req, res) => {
  const store = load();
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
    const t = today();
    const nextMon = addDays(mondayOf(t), 7);
    const fresh = generatePlan({ ...p, plan_start: store.plan.weeks[0].start });
    const keep = store.plan.weeks.filter((w) => w.start < nextMon);
    const rest = fresh.weeks.filter((w) => w.start >= nextMon);
    store.plan = { generated_at: new Date().toISOString(), weeks: [...keep, ...rest] };
    store.changelog.push({ at: new Date().toISOString(), what: 'Plan regenerated from Settings' });
  }
  save();
  res.json({ profile: p, plan: store.plan, summary: summary(store, today()) });
}));

/* ---------- run logging ---------- */
app.post('/api/runs/extract', upload.single('image'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_image', message: 'Attach a screenshot.' });
  const okTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  if (!okTypes.includes(req.file.mimetype)) return res.status(400).json({ error: 'bad_type', message: 'Use a PNG, JPG or WebP screenshot.' });
  const extracted = await coach.extractRun(req.file.buffer, req.file.mimetype);

  const store = load();
  const t = today();
  const date = extracted.date || t;
  // suggest which planned session this run belongs to
  const candidates = allSessions(store.plan)
    .filter((s) => s.status === 'planned' && Math.abs(diffDays(date, s.date)) <= 2)
    .sort((a, b) => Math.abs(diffDays(date, a.date)) - Math.abs(diffDays(date, b.date)) || Math.abs(a.km - (extracted.distance_km || 0)) - Math.abs(b.km - (extracted.distance_km || 0)));
  res.json({ extracted, suggested_session_id: candidates[0]?.id || null, date });
}));

app.post('/api/runs', wrap(async (req, res) => {
  const store = load();
  const b = req.body || {};
  const num = (v) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : null);
  const distance = num(b.distance_km);
  const duration = num(b.duration_sec);
  if (!distance || distance < 0.5 || distance > 100) return res.status(400).json({ error: 'bad_distance', message: 'Distance looks wrong.' });
  if (!duration || duration < 120 || duration > 24 * 3600) return res.status(400).json({ error: 'bad_duration', message: 'Duration looks wrong.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) return res.status(400).json({ error: 'bad_date', message: 'Date is required.' });
  if (b.date > today()) return res.status(400).json({ error: 'future_date', message: 'That date is in the future.' });

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
  if (session) { session.status = 'done'; session.run_id = run.id; }
  store.runs.push(run);
  store.runs.sort((a, b) => a.date.localeCompare(b.date));

  // coach review (AI if available, transparent fallback if not)
  let review;
  let ai = true;
  try {
    review = await coach.reviewRun(store, today(), run);
  } catch (e) {
    ai = false;
    console.error('review failed:', e.message);
    review = coach.fallbackReview(store, today(), run);
  }
  const applied = coach.applyChanges(store, today(), review);
  run.review = { verdict: review.verdict, coach_note: review.coach_note, what_changed: review.what_changed, flags: review.flags || [], ai };
  store.changelog.push({ at: run.created_at, run_id: run.id, applied: applied.applied });
  save();

  res.json({ run, review: run.review, applied: applied.applied, rejected: applied.rejected, plan: store.plan, profile: store.profile, summary: summary(store, today()) });
}));

app.delete('/api/runs/:id', wrap((req, res) => {
  const store = load();
  const i = store.runs.findIndex((r) => r.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'not_found' });
  const [r] = store.runs.splice(i, 1);
  for (const w of store.plan.weeks) for (const s of w.sessions) if (s.run_id === r.id) { s.status = 'planned'; delete s.run_id; }
  save();
  res.json({ ok: true, runs: store.runs, plan: store.plan, summary: summary(store, today()) });
}));

app.post('/api/sessions/:id/skip', wrap((req, res) => {
  const store = load();
  for (const w of store.plan.weeks) {
    const s = w.sessions.find((x) => x.id === req.params.id);
    if (s && s.status === 'planned') {
      s.status = 'skipped';
      s.skip_reason = (req.body && req.body.reason) || 'Skipped';
      w.km = Math.round(w.sessions.filter((x) => x.status !== 'skipped').reduce((a, x) => a + x.km, 0) * 10) / 10;
      save();
      return res.json({ plan: store.plan, summary: summary(store, today()) });
    }
  }
  res.status(404).json({ error: 'not_found' });
}));

/* ---------- coach chat ---------- */
app.post('/api/chat', wrap(async (req, res) => {
  const store = load();
  const text = ((req.body && req.body.message) || '').toString().trim().slice(0, 2000);
  if (!text) return res.status(400).json({ error: 'empty' });
  const history = store.chat.filter((m) => m.role === 'user' || m.role === 'assistant');
  const out = await coach.chat(store, today(), history, text);
  const at = new Date().toISOString();
  store.chat.push({ role: 'user', content: text, at });
  store.chat.push({ role: 'assistant', content: out.text, at: new Date().toISOString(), changes: out.changes ? out.changes.applied : undefined });
  if (store.chat.length > 200) store.chat = store.chat.slice(-200);
  if (out.changes && out.changes.applied.length) store.changelog.push({ at, chat: true, applied: out.changes.applied });
  save();
  res.json({ reply: out.text, applied: out.changes ? out.changes.applied : [], plan: store.plan, profile: store.profile, summary: summary(store, today()) });
}));

app.delete('/api/chat', wrap((req, res) => { const s = load(); s.chat = []; save(); res.json({ ok: true }); }));

/* ---------- static ---------- */
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));
app.get('/{*splat}', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Stride running on http://localhost:${PORT}  (AI ${coach.hasKey() ? 'on' : 'OFF - set ANTHROPIC_API_KEY'})`));
}
module.exports = app;
