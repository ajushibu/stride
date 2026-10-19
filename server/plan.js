// Deterministic base plan generator. The LLM coach adjusts this plan after each run;
// it never has to invent a whole season from scratch.
const { addDays, diffDays, mondayOf } = require('./dates');

const MARATHON_KM = 42.195;
const round5 = (x) => Math.round(x * 2) / 2; // nearest 0.5 km

function defaultProfile(today) {
  return {
    name: '',
    age: 27,
    timezone: 'Asia/Calcutta',
    race_name: 'Melbourne Marathon',
    race_date: '2027-10-10', // expected date, edit in Settings once confirmed
    target_time_sec: 4 * 3600 + 30 * 60, // 4:30:00
    floor_time_sec: 5 * 3600, // 5:00:00 safe floor
    plan_start: today,
    baseline: { longest_km: 10, longest_time_min: 70, weekly_km: 21, runs_per_week: 3, easy_hr_seen: 150 },
    // Paces in seconds per km. Coach tunes these as data comes in.
    paces: { easy_lo: 435, easy_hi: 465, tempo: 400 },
    hr: { easy_cap: 142, tempo_lo: 155, tempo_hi: 165 },
    max_hr: null,
  };
}

function peakKm(targetSec) {
  if (targetSec <= 4 * 3600) return 62;
  if (targetSec <= 4.5 * 3600) return 55;
  return 48;
}

function phaseOf(w, n) {
  const buildEnd = n - 3;
  if (w >= n - 2) return 'Taper';
  if (w > buildEnd - 6) return 'Peak';
  if (w <= 16) return 'Base';
  return 'Build';
}

function tempoNote(w, cutback) {
  const mins = Math.min(40, 10 + Math.floor((w - 9) * 0.9));
  const m = cutback ? Math.max(10, Math.round(mins * 0.7)) : mins;
  return `1.5 km warm-up, ${m} min at tempo (comfortably hard), 1.5 km cool-down.`;
}

function generatePlan(profile) {
  const start = mondayOf(profile.plan_start);
  const raceMonday = mondayOf(profile.race_date);
  const n = Math.max(8, diffDays(start, raceMonday) / 7 + 1);
  const mp = profile.target_time_sec / MARATHON_KM; // marathon pace sec/km
  const peak = peakKm(profile.target_time_sec);
  const base = profile.baseline.weekly_km || 20;
  const buildEnd = n - 3;
  const weeks = [];

  for (let w = 1; w <= n; w++) {
    const phase = phaseOf(w, n);
    const wkStart = addDays(start, (w - 1) * 7);
    const cutback = w % 4 === 0 && w < buildEnd - 1 && phase !== 'Taper';
    const runs = w < 13 ? 3 : 4;

    // weekly volume
    let km;
    if (phase === 'Taper') {
      km = peak * (w === n - 2 ? 0.7 : w === n - 1 ? 0.5 : 0.3);
    } else {
      km = base + (peak - base) * ((w - 1) / Math.max(1, buildEnd - 1));
      if (cutback) km *= 0.8;
    }

    // long run progression: ~11 km -> 32 km by 3 weeks before the peak week
    let long;
    if (w === n) long = MARATHON_KM;
    else if (phase === 'Taper') long = w === n - 2 ? 18 : 12;
    else {
      const prog = Math.min(1, (w - 1) / Math.max(1, buildEnd - 4));
      long = 11 + (32 - 11) * prog;
      if (cutback) long *= 0.75;
      long = Math.min(long, 32, km * (runs === 3 ? 0.47 : 0.56));
    }
    long = w === n ? MARATHON_KM : round5(long);

    // other sessions share the remaining volume
    const rest = Math.max(6, km - long);
    let shares = runs === 3 ? [0.46, 0.54] : [0.36, 0.38, 0.26];
    if (w === n) shares = runs === 3 ? [0.55, 0.45] : [0.38, 0.34, 0.28];
    let others = shares.map((s) => Math.max(3, round5(rest * s)));
    if (w === n) others = runs === 3 ? [6, 4] : [6, 5, 3];

    const dayOffsets = runs === 3 ? [1, 3, 6] : [1, 3, 5, 6]; // Tue Thu (Sat) Sun
    const sessions = [];
    const easyPace = { lo: profile.paces.easy_lo, hi: profile.paces.easy_hi };
    const tempoPace = Math.round(profile.paces.tempo - Math.max(0, (profile.paces.tempo - (mp - 12)) * Math.min(1, w / 40)));

    // Tuesday: strides early, tempo from week 9
    const isTempo = w >= 9 && phase !== 'Taper' && w !== n;
    sessions.push({
      type: isTempo ? 'tempo' : 'easy',
      km: others[0],
      pace_lo: isTempo ? tempoPace - 5 : easyPace.lo,
      pace_hi: isTempo ? tempoPace + 5 : easyPace.hi,
      hr_lo: isTempo ? profile.hr.tempo_lo : null,
      hr_hi: isTempo ? profile.hr.tempo_hi : profile.hr.easy_cap,
      note: isTempo
        ? tempoNote(w, cutback)
        : w === n
        ? 'Easy shake-out with 4 strides. Legs should feel light.'
        : 'Easy, conversational pace. Finish with 4 x 20 s relaxed strides.',
    });
    // Thursday: easy
    sessions.push({
      type: 'easy',
      km: others[1],
      pace_lo: easyPace.lo,
      pace_hi: easyPace.hi,
      hr_lo: null,
      hr_hi: profile.hr.easy_cap,
      note: 'Easy. Keep heart rate under the cap, slow down on hills.',
    });
    // Saturday (4-run weeks): recovery
    if (runs === 4) {
      sessions.push({
        type: 'recovery',
        km: others[2],
        pace_lo: easyPace.hi,
        pace_hi: easyPace.hi + 25,
        hr_lo: null,
        hr_hi: profile.hr.easy_cap - 4,
        note: w === n ? 'Very short shake-out, 10 min of easy jogging.' : 'Very easy. This run is for tired legs and routine, not fitness.',
      });
    }
    // Sunday: long run, test or race
    let milestone = null;
    let sunday = {
      type: 'long',
      km: long,
      pace_lo: easyPace.lo,
      pace_hi: easyPace.hi + 10,
      hr_lo: null,
      hr_hi: profile.hr.easy_cap + 3,
      note: long >= 22 && w >= 30 && phase !== 'Taper'
        ? `Long run. Run the last ${Math.min(10, Math.round(long * 0.3))} km at goal marathon pace if you feel good. Practise fuelling every 40 min.`
        : 'Long run at easy effort. Walk breaks at water points are fine. Time on feet is the goal.',
    };
    if (w === 16) {
      milestone = '10K time trial';
      sunday = { type: 'race', km: 10, pace_lo: 0, pace_hi: 0, hr_lo: null, hr_hi: null, title: '10K time trial', note: 'Test race. Warm up 10 min, then run a steady hard effort. This result recalibrates all paces.' };
    } else if (w === 36) {
      milestone = 'Half marathon test';
      sunday = { type: 'race', km: 21.1, pace_lo: 0, pace_hi: 0, hr_lo: null, hr_hi: null, title: 'Half marathon test', note: 'Test race or solo time trial. Predicts your marathon time. Start controlled and hold even pace.' };
    }
    if (w === n) {
      milestone = profile.race_name;
      sunday = {
        type: 'race',
        km: MARATHON_KM,
        pace_lo: Math.round(mp - 5),
        pace_hi: Math.round(mp + 8),
        hr_lo: null,
        hr_hi: null,
        title: profile.race_name,
        note: 'Race day. First 10 km slightly slower than goal pace. Fuel early, trust the training.',
      };
    }
    sessions.push(sunday);

    const out = sessions.map((s, i) => ({
      id: `w${w}-${i + 1}`,
      date: addDays(wkStart, dayOffsets[i]),
      title: s.title || null,
      status: 'planned',
      ...s,
    }));
    const total = Math.round(out.reduce((a, s) => a + s.km, 0) * 10) / 10;
    weeks.push({ n: w, start: wkStart, phase, km: total, cutback, milestone, sessions: out });
  }
  return { generated_at: new Date().toISOString(), weeks };
}

module.exports = { generatePlan, defaultProfile, MARATHON_KM };
