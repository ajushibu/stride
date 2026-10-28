// Claude-powered coach: reads watch screenshots, adjusts the plan, chats.
// The model proposes changes; this module validates them before anything is written.
const Anthropic = require('@anthropic-ai/sdk');
const { addDays, diffDays, secToPace, secToHMS } = require('./dates');
const { allSessions, summary } = require('./stats');

const MODEL = process.env.STRIDE_MODEL || 'claude-sonnet-5-5';
const TYPES = ['easy', 'tempo', 'long', 'recovery', 'race', 'rest'];

let client = null;
function api() {
  if (!process.env.ANTHROPIC_API_KEY) {
    const e = new Error('ANTHROPIC_API_KEY is not set on the server.');
    e.code = 'no_api_key';
    throw e;
  }
  client = client || new Anthropic();
  return client;
}
const hasKey = () => !!process.env.ANTHROPIC_API_KEY;


// This model rejects forced tool_choice ("tool"/"any"), so we ask for the tool in the prompt and
// check the reply. If the model answers in plain text instead, we retry once with a firmer nudge.
async function callTool(params, toolName) {
  const run = async (extra) => {
    const messages = extra ? [...params.messages, { role: 'assistant', content: 'I will call the tool now.' }, { role: 'user', content: extra }] : params.messages;
    const res = await api().messages.create({ ...params, messages });
    return res.content.find((b) => b.type === 'tool_use' && b.name === toolName);
  };
  let tool = await run();
  if (!tool) tool = await run('Call the ' + toolName + ' tool now. Reply with the tool call only, no other text.');
  return tool;
}

/* ---------- 1. Screenshot -> structured run ---------- */

const RECORD_RUN = {
  name: 'record_run',
  description: 'Record the run shown in a smartwatch workout summary screenshot. Use null for anything not visible. Never guess.',
  input_schema: {
    type: 'object',
    properties: {
      is_run: { type: 'boolean', description: 'False if the screenshot is not a running workout summary.' },
      date: { type: ['string', 'null'], description: 'YYYY-MM-DD if a date is visible, else null.' },
      distance_km: { type: ['number', 'null'] },
      duration_sec: { type: ['integer', 'null'], description: 'Total moving or elapsed workout time in seconds.' },
      avg_pace_sec_per_km: { type: ['integer', 'null'] },
      avg_hr: { type: ['integer', 'null'] },
      max_hr: { type: ['integer', 'null'] },
      cadence_spm: { type: ['integer', 'null'] },
      calories: { type: ['integer', 'null'] },
      elevation_gain_m: { type: ['integer', 'null'] },
      hr_zone_minutes: { type: ['object', 'null'], description: 'Minutes per heart-rate zone if shown, keys zone1..zone5.' },
      segments: {
        type: ['array', 'null'],
        description: 'Only when the screenshots are SEPARATE workouts (different distance and duration) that together make one run, e.g. the watch recorded two parts. One entry per workout; then leave the top-level distance, duration, pace and HR fields null.',
        items: { type: 'object', properties: { distance_km: { type: 'number' }, duration_sec: { type: 'integer' }, avg_hr: { type: ['integer', 'null'] }, max_hr: { type: ['integer', 'null'] }, cadence_spm: { type: ['integer', 'null'] }, calories: { type: ['integer', 'null'] }, elevation_gain_m: { type: ['integer', 'null'] } }, required: ['distance_km', 'duration_sec'] },
      },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      notes: { type: 'string', description: 'Usually an empty string. Only if something may make a recorded number wrong (miles converted to km, partial screenshot, unreadable digit), ONE short sentence under 100 characters. Never describe other data on the screen (VO2 max, laps, sweat loss, device) and never restate the numbers.' },
    },
    required: ['is_run', 'confidence', 'notes'],
  },
};

// Several separate workouts that make up one run: sum distance/time, weight HR and cadence by time.
function mergeSegments(r) {
  const seg = Array.isArray(r.segments) ? r.segments.filter((x) => x && x.distance_km > 0 && x.duration_sec > 0) : [];
  if (seg.length < 2) return r;
  const sum = (k) => seg.reduce((a, x) => a + (x[k] || 0), 0);
  const wavg = (k) => { const xs = seg.filter((x) => x[k]); const t = xs.reduce((a, x) => a + x.duration_sec, 0); return t ? Math.round(xs.reduce((a, x) => a + x[k] * x.duration_sec, 0) / t) : null; };
  const dist = Math.round(sum('distance_km') * 100) / 100, dur = sum('duration_sec');
  return {
    ...r, is_run: r.is_run !== false, distance_km: dist, duration_sec: dur, avg_pace_sec_per_km: Math.round(dur / dist),
    avg_hr: wavg('avg_hr'), max_hr: Math.max(0, ...seg.map((x) => x.max_hr || 0)) || null, cadence_spm: wavg('cadence_spm'),
    calories: sum('calories') || null, elevation_gain_m: sum('elevation_gain_m') || null,
    notes: 'Combined ' + seg.length + ' workouts: ' + seg.map((x) => x.distance_km + ' km').join(' + ') + '.',
  };
}

async function extractRun(images) {
  const tool = await callTool({
    model: MODEL,
    max_tokens: 1024,
    tools: [RECORD_RUN],
    messages: [
      {
        role: 'user',
        content: [
          ...images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.mediaType, data: im.buffer.toString('base64') } })),
          {
            type: 'text',
            text:
              (images.length > 1 ? `These ${images.length} screenshots belong to ONE training run. Either they are different screens of the same workout (same distance and time: merge into one record), or they are separate workouts the watch recorded for the same run (different distance and time, e.g. the run was split in two): then fill segments with one entry per workout and leave the top-level distance, duration, pace and heart-rate fields null. Never report a conflict; always return usable numbers. ` : '') + 'This is a screenshot from a Samsung Galaxy Watch / Samsung Health running summary. You must call the record_run tool with what you can read. ' +
              'Convert miles to km if needed. Keep notes empty unless a recorded number might be wrong; extra data on the screen that has no field is simply ignored. Pace must be seconds per km. If the screenshot shows several screens, combine them. ' +
              'If a value is not visible, use null. Do not invent numbers.',
          },
        ],
      },
    ],
  }, 'record_run');
  if (!tool) throw new Error('The model did not return a run record.');
  const r = mergeSegments(tool.input);
  r.notes = typeof r.notes === 'string' && r.notes.length <= 140 ? r.notes.trim() : '';
  // derive missing pieces from the ones we have
  if (!r.avg_pace_sec_per_km && r.distance_km && r.duration_sec) r.avg_pace_sec_per_km = Math.round(r.duration_sec / r.distance_km);
  if (!r.duration_sec && r.distance_km && r.avg_pace_sec_per_km) r.duration_sec = Math.round(r.distance_km * r.avg_pace_sec_per_km);
  return r;
}

/* ---------- 2. Plan-adjustment tool ---------- */

const UPDATE_PLAN = {
  name: 'update_plan',
  description:
    'Propose changes to upcoming training sessions. Only change what the evidence justifies. An empty session_changes list is a valid and often correct answer.',
  input_schema: {
    type: 'object',
    properties: {
      verdict: { type: 'string', enum: ['ahead', 'on_track', 'behind', 'caution'] },
      coach_note: { type: 'string', description: 'Max ~60 words. Plain, direct, honest. No flattery, no filler.' },
      what_changed: { type: 'string', description: 'One sentence summary of plan changes, or "No changes to the plan."' },
      session_changes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            session_id: { type: 'string' },
            action: { type: 'string', enum: ['modify', 'skip', 'move'] },
            new_km: { type: 'number' },
            new_type: { type: 'string', enum: TYPES },
            new_date: { type: 'string', description: 'YYYY-MM-DD, only for move.' },
            new_pace_lo_sec: { type: 'integer' },
            new_pace_hi_sec: { type: 'integer' },
            new_hr_cap: { type: 'integer' },
            note: { type: 'string', description: 'Replacement instructions shown on the session card.' },
          },
          required: ['session_id', 'action'],
        },
      },
      profile_updates: {
        type: 'object',
        description: 'Optional recalibration of training paces / heart-rate cap based on evidence.',
        properties: {
          easy_pace_lo_sec: { type: 'integer' },
          easy_pace_hi_sec: { type: 'integer' },
          tempo_pace_sec: { type: 'integer' },
          easy_hr_cap: { type: 'integer' },
          max_hr: { type: 'integer' },
        },
      },
      flags: { type: 'array', items: { type: 'string' }, description: 'Injury / overtraining / data-quality warnings for the runner.' },
    },
    required: ['verdict', 'coach_note', 'what_changed', 'session_changes'],
  },
};

const SYSTEM = `You are the running coach inside Stride, a personal marathon-training app. The runner is a 27-year-old first-time marathoner (Melbourne Marathon, target about 4:30, safe floor 5:00).
Rules:
- Be honest and specific. Do not flatter. If a run was too fast, too hard, or too short, say so plainly.
- Easy runs are controlled by heart rate: if average HR on an easy run was above the cap, the next easy runs should be slower, not shorter by default.
- Never raise weekly volume more than ~10% over the previous non-cutback week and never add intensity after a missed or poor-recovery week.
- Missed sessions are never made up by adding distance later. If a run was done on a different day than planned (see planned_date), it still counts as that session. Check the days around it: keep at least 48 hours between hard sessions (tempo, long run), never put a hard session the day after a long run, and if the shifted run collides with the next session, make that next session easier or shorter rather than stacking volume.
- Prefer small adjustments. Do not rewrite the plan after one run. Changes should only touch sessions in the next 21 days.
- Pain, dizziness, chest symptoms or a sharp pain that changes gait: tell the runner to stop running and see a doctor/physio, and put it in flags.
- Runner comments (runner_comment / notes on a run, e.g. dehydrated, ill, poor sleep, heat, sore) are context from the runner. Weigh them honestly: a run affected by dehydration, illness, heat or poor sleep is weaker evidence about fitness, so do not cut the plan or slow paces on that run alone, but do mention it, and if the same excuse keeps recurring say so plainly. Illness or pain still follows the safety rule below. Never let a comment excuse a pacing mistake that is not explained by it.
- You are not a doctor. Keep notes short. Pace is in min:sec per km.`;

function planContext(store, today) {
  const upcoming = allSessions(store.plan)
    .filter((s) => s.date >= addDays(today, -3) && s.date <= addDays(today, 21))
    .map((s) => ({
      id: s.id,
      date: s.date,
      week: s.week,
      phase: s.phase,
      type: s.type,
      km: s.km,
      pace: s.pace_lo ? `${secToPace(s.pace_lo)}-${secToPace(s.pace_hi)}` : null,
      hr_cap: s.hr_hi,
      status: s.status,
    }));
  const runs = store.runs.slice(-10).map((r) => ({
    date: r.date,
    km: r.distance_km,
    time: secToHMS(r.duration_sec || 0),
    pace: secToPace(r.avg_pace_sec),
    avg_hr: r.avg_hr,
    max_hr: r.max_hr,
    session_id: r.session_id,
    planned_date: r.planned_date || null,
    runner_comment: r.notes || undefined,
  }));
  const missed = allSessions(store.plan)
    .filter((s) => s.status === 'planned' && s.date < today && s.date >= addDays(today, -10))
    .map((s) => ({ id: s.id, date: s.date, type: s.type, km: s.km }));
  const p = store.profile;
  return {
    today,
    race: { name: p.race_name, date: p.race_date, target: secToHMS(p.target_time_sec), floor: secToHMS(p.floor_time_sec) },
    baseline: p.baseline,
    paces: { easy: `${secToPace(p.paces.easy_lo)}-${secToPace(p.paces.easy_hi)}`, tempo: secToPace(p.paces.tempo) },
    hr: p.hr,
    stats: summary(store, today),
    upcoming_sessions: upcoming,
    recent_runs: runs,
    missed_recent: missed,
  };
}

/* ---------- 3. Validate + apply model-proposed changes ---------- */

function applyChanges(store, today, proposal) {
  const applied = [];
  const rejected = [];
  const sessions = new Map(allSessions(store.plan).map((s) => [s.id, s]));
  const live = (id) => {
    for (const w of store.plan.weeks) {
      const s = w.sessions.find((x) => x.id === id);
      if (s) return s;
    }
    return null;
  };

  for (const c of proposal.session_changes || []) {
    const meta = sessions.get(c.session_id);
    const s = live(c.session_id);
    if (!meta || !s) { rejected.push({ id: c.session_id, why: 'unknown session' }); continue; }
    if (s.status !== 'planned') { rejected.push({ id: s.id, why: 'already done or skipped' }); continue; }
    if (s.date < today) { rejected.push({ id: s.id, why: 'in the past' }); continue; }
    if (diffDays(today, s.date) > 21) { rejected.push({ id: s.id, why: 'too far ahead' }); continue; }
    if (s.type === 'race' && s.km > 21.1 && c.action !== 'modify') { rejected.push({ id: s.id, why: 'race day is fixed' }); continue; }

    const before = { date: s.date, km: s.km, type: s.type, note: s.note };
    if (c.action === 'skip') {
      s.status = 'skipped';
      s.skip_reason = c.note || 'Skipped by coach';
    } else if (c.action === 'move') {
      const nd = c.new_date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nd || '') || nd < today || Math.abs(diffDays(s.date, nd)) > 3) { rejected.push({ id: s.id, why: 'bad move date' }); continue; }
      s.date = nd;
    }
    if (c.action !== 'skip') {
      if (typeof c.new_km === 'number' && s.type !== 'race') {
        const lo = Math.max(3, s.km * 0.65);
        const hi = Math.min(32, s.km * 1.15); // coach may cut a lot, add little
        s.km = Math.round(Math.min(hi, Math.max(lo, c.new_km)) * 2) / 2;
      }
      if (c.new_type && TYPES.includes(c.new_type) && c.new_type !== 'race' && s.type !== 'race') s.type = c.new_type;
      if (c.new_pace_lo_sec && c.new_pace_hi_sec && c.new_pace_lo_sec >= 240 && c.new_pace_hi_sec <= 600 && c.new_pace_lo_sec <= c.new_pace_hi_sec) {
        s.pace_lo = c.new_pace_lo_sec;
        s.pace_hi = c.new_pace_hi_sec;
      }
      if (c.new_hr_cap && c.new_hr_cap >= 110 && c.new_hr_cap <= 190) s.hr_hi = c.new_hr_cap;
      if (c.note) s.note = c.note.slice(0, 280);
    }
    s.coach_edited = true;
    applied.push({ id: s.id, action: c.action, before, after: { date: s.date, km: s.km, type: s.type, status: s.status } });
  }

  // keep weekly totals honest
  for (const w of store.plan.weeks) w.km = Math.round(w.sessions.filter((s) => s.status !== 'skipped').reduce((a, s) => a + s.km, 0) * 10) / 10;

  const pu = proposal.profile_updates || {};
  const prof = store.profile;
  if (pu.easy_pace_lo_sec && pu.easy_pace_hi_sec && pu.easy_pace_lo_sec >= 300 && pu.easy_pace_hi_sec <= 600) {
    prof.paces.easy_lo = pu.easy_pace_lo_sec;
    prof.paces.easy_hi = pu.easy_pace_hi_sec;
  }
  if (pu.tempo_pace_sec && pu.tempo_pace_sec >= 270 && pu.tempo_pace_sec <= 500) prof.paces.tempo = pu.tempo_pace_sec;
  if (pu.easy_hr_cap && pu.easy_hr_cap >= 120 && pu.easy_hr_cap <= 160) prof.hr.easy_cap = pu.easy_hr_cap;
  if (pu.max_hr && pu.max_hr >= 160 && pu.max_hr <= 225) prof.max_hr = pu.max_hr;

  return { applied, rejected };
}

/* ---------- 4. Review a logged run ---------- */

async function reviewRun(store, today, run) {
  const ctx = planContext(store, today);
  const tool = await callTool({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM,
    tools: [UPDATE_PLAN],
    messages: [
      {
        role: 'user',
        content:
          `The runner just logged a run. Review it against the plan and decide whether any upcoming session needs changing. You must answer by calling the update_plan tool.\n\n` +
          `NEW RUN:\n${JSON.stringify({ ...run, pace: secToPace(run.avg_pace_sec), time: secToHMS(run.duration_sec || 0) })}\n\n` +
          (run.planned_date && run.planned_date !== run.date ? `NOTE: this run was planned for ${run.planned_date} but done on ${run.date} (${Math.abs(diffDays(run.planned_date, run.date))} day(s) ${run.date > run.planned_date ? 'late' : 'early'}). Check the sessions around it for collisions.\n\n` : '') +
          (run.notes ? `RUNNER COMMENT on this run: "${run.notes}"\n\n` : '') +
          (!run.session_id ? 'NOTE: this was an extra run, not linked to a planned session.\n\n' : '') +
          `CONTEXT:\n${JSON.stringify(ctx)}`,
      },
    ],
  }, 'update_plan');
  if (!tool) throw new Error('No plan proposal returned.');
  return tool.input;
}

// Used when no API key is configured or the API call fails. Conservative and transparent.
function fallbackReview(store, today, run) {
  const cap = store.profile.hr.easy_cap;
  const planned = run.session_id ? allSessions(store.plan).find((s) => s.id === run.session_id) : null;
  let note = `Logged ${run.distance_km} km at ${secToPace(run.avg_pace_sec)}/km.`;
  const flags = [];
  let verdict = 'on_track';
  if (planned && ['easy', 'recovery', 'long'].includes(planned.type) && run.avg_hr && run.avg_hr > cap + 8) {
    verdict = 'caution';
    note += ` Average HR ${run.avg_hr} was well above your easy cap of ${cap}. Slow down on the next easy runs.`;
  } else if (planned && run.distance_km < planned.km * 0.8) {
    verdict = 'behind';
    note += ` That was short of the planned ${planned.km} km. No plan changes made.`;
  } else note += ' Looks in line with the plan.';
  if (planned && planned.date !== run.date) note += ` It counts as your ${planned.date} session, done on ${run.date}. Keep a rest day before the next hard run.`;
  return { verdict, coach_note: note + ' (Offline coach: AI review unavailable.)', what_changed: 'No changes to the plan.', session_changes: [], flags };
}

/* ---------- 5. Chat ---------- */

async function chat(store, today, history, userText) {
  const ctx = planContext(store, today);
  const messages = [...history.slice(-20).map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: userText }];
  const res = await api().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system:
      SYSTEM +
      `\nYou are chatting with the runner. Answer in at most ~120 words unless they ask for detail. ` +
      `If they ask for a plan change (travel, illness, soreness, time constraints), call update_plan with the minimal justified change and also explain it in text. ` +
      `If it is only a question, just answer.\n\nCURRENT STATE:\n${JSON.stringify(ctx)}`,
    tools: [UPDATE_PLAN],
    messages,
  });
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  const tool = res.content.find((b) => b.type === 'tool_use');
  let changes = null;
  if (tool) changes = { proposal: tool.input, ...applyChanges(store, today, tool.input) };
  return { text: text || (changes ? changes.proposal.coach_note : '...'), changes };
}

module.exports = {
  mergeSegments, extractRun, reviewRun, fallbackReview, applyChanges, chat, hasKey, MODEL };
