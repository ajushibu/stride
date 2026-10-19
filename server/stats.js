// Derived numbers for the UI: streaks, weekly progress, race readiness.
const { addDays, diffDays, mondayOf, todayIn } = require('./dates');

const allSessions = (plan) => plan.weeks.flatMap((w) => w.sessions.map((s) => ({ ...s, week: w.n, phase: w.phase })));

function currentWeek(plan, today) {
  const mon = mondayOf(today);
  return plan.weeks.find((w) => w.start === mon) || null;
}

// Streak = consecutive planned sessions completed, in date order. A past session that is
// still 'planned' or 'skipped' breaks it. Today's open session is not counted either way.
function streaks(plan, today) {
  const done = allSessions(plan)
    .filter((s) => s.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((s) => !(s.date === today && s.status === 'planned'));
  let best = 0;
  let run = 0;
  for (const s of done) {
    if (s.status === 'done') {
      run++;
      best = Math.max(best, run);
    } else run = 0;
  }
  return { current: run, best };
}

function weekProgress(plan, runs, today) {
  const w = currentWeek(plan, today);
  if (!w) return { planned_km: 0, done_km: 0, pct: 0, week: null };
  const planned = w.sessions.reduce((a, s) => a + (s.status === 'skipped' ? 0 : s.km), 0);
  const done = runs.filter((r) => r.date >= w.start && r.date <= addDays(w.start, 6)).reduce((a, r) => a + r.distance_km, 0);
  const pct = planned > 0 ? Math.min(100, Math.round((done / planned) * 100)) : 0;
  return { planned_km: Math.round(planned * 10) / 10, done_km: Math.round(done * 10) / 10, pct, week: w.n };
}

// Honest "how ready are you for the full marathon today" score, 0-100.
// 40% longest run toward 32 km, 30% recent weekly volume toward 45 km, 30% consistency over last 4 weeks.
function readiness(profile, plan, runs, today) {
  const longestRun = Math.max(profile.baseline.longest_km || 0, ...runs.map((r) => r.distance_km), 0);
  const fourWeeksAgo = addDays(today, -28);
  const recent = runs.filter((r) => r.date > fourWeeksAgo && r.date <= today);
  const weeklyKm = recent.reduce((a, r) => a + r.distance_km, 0) / 4;
  const vol = recent.length ? weeklyKm : (profile.baseline.weekly_km || 0) * 0.7; // baseline counts a bit until real data arrives
  const sess = allSessions(plan).filter((s) => s.date > fourWeeksAgo && s.date < today && s.type !== 'race');
  const consistency = sess.length ? sess.filter((s) => s.status === 'done').length / sess.length : 0; // no history, no credit
  const score = 40 * Math.min(1, longestRun / 32) + 30 * Math.min(1, vol / 45) + 30 * consistency;
  const v = Math.round(score);
  const label = v >= 85 ? 'RACE READY' : v >= 65 ? 'THRIVING' : v >= 45 ? 'BUILDING' : v >= 25 ? 'GETTING STARTED' : 'JUST BEGINNING';
  return { score: v, label, longest_km: Math.round(longestRun * 10) / 10, weekly_km_4w: Math.round(weeklyKm * 10) / 10, consistency: Math.round(consistency * 100) };
}

function summary(store, today) {
  const { profile, plan, runs } = store;
  const sessions = allSessions(plan);
  const todaySession = sessions.find((s) => s.date === today) || null;
  const next = sessions.filter((s) => s.date >= today && s.status === 'planned').sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  const st = streaks(plan, today);
  return {
    today,
    days_to_race: diffDays(today, profile.race_date),
    weeks_to_race: Math.max(0, Math.ceil(diffDays(today, profile.race_date) / 7)),
    week_progress: weekProgress(plan, runs, today),
    current_week: currentWeek(plan, today)?.n || null,
    today_session: todaySession,
    next_session: next,
    streak: st,
    total_runs: runs.length,
    total_km: Math.round(runs.reduce((a, r) => a + r.distance_km, 0) * 10) / 10,
    readiness: readiness(profile, plan, runs, today),
  };
}

module.exports = { summary, readiness, streaks, weekProgress, allSessions, currentWeek, todayIn };
