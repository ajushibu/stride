/* Stride app. Vanilla JS, renders HTML strings using the designer's components (window.UI) and classes. */
(function () {
  'use strict';
  const { UI, API, F } = window;
  const I = (n, o) => UI.icon(n, o);
  const esc = UI.esc;
  const $ = (s) => document.querySelector(s);
  const TABS = ['today', 'plan', 'insights', 'coach'];
  const TYPE_ATTR = { easy: 'easy', tempo: 'tempo', long: 'long', recovery: 'recovery', race: 'intervals', rest: 'rest' };

  let S = null; // server state
  let tab = 'today';
  let chatBusy = false;
  let L = null; // log-flow state
  let openPhases = null; // Set of phase names expanded in the plan; defaults to the current phase

  /* ------------------------------------------------------------------ helpers */
  const allSessions = () => S.plan.weeks.flatMap((w) => w.sessions.map((s) => Object.assign({}, s, { week: w.n, phase: w.phase })));
  const findSession = (id) => allSessions().find((s) => s.id === id);
  const todayStr = () => S.summary.today;
  const weekOf = (date) => S.plan.weeks.find((w) => w.start <= date && date <= F.addDays(w.start, 6));
  const currentWeek = () => S.plan.weeks.find((w) => w.n === S.summary.current_week) || null;
  const runFor = (sid) => S.runs.find((r) => r.session_id === sid);
  const lastRun = () => S.runs[S.runs.length - 1] || null;

  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind === 'error' ? ' toast--error' : kind === 'warn' ? ' toast--warn' : '');
    el.setAttribute('role', 'status');
    el.innerHTML = '<span class="toast__icon">' + I(kind === 'error' || kind === 'warn' ? 'alert' : 'check', { size: 18 }) + '</span>' + esc(msg);
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }

  function open(id) { $(id).classList.add('is-open'); }
  function close(id) { $(id).classList.remove('is-open'); }

  function hdr(eyebrow, title, extra) {
    const streak = S.summary.streak.current;
    return '<header class="hdr"><div class="hdr__text"><div class="hdr__eyebrow">' + esc(eyebrow) + '</div><h1 class="hdr__title">' + title + '</h1></div>' +
      '<div class="hdr__actions">' +
      (extra === 'nostreak' ? '' : '<button class="streak-pill' + (streak === 0 ? ' is-zero' : '') + '" data-act="streak" aria-label="' + streak + ' run streak">' + UI.flame(20) + streak + '</button>') +
      '<button class="icon-btn" data-act="settings" aria-label="Settings">' + I('menu') + '</button></div></header>';
  }

  function greeting() {
    const h = new Date().getHours();
    const g = h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
    return g + (S.profile.name ? ', ' + esc(S.profile.name) : '');
  }

  const hrText = (s) => {
    if (s.type === 'race' || !s.hr_hi) return null;
    if (s.type === 'tempo' && s.hr_lo) return { z: 'Z4', r: s.hr_lo + '–' + s.hr_hi };
    return { z: 'Z2', r: '≤' + s.hr_hi };
  };

  const WHY = {
    easy: (s) => 'Easy miles build the aerobic engine. Keep heart rate under ' + (s.hr_hi || S.profile.hr.easy_cap) + ' bpm, and slow down or walk if it creeps up.',
    recovery: () => 'This one is for recovery, not fitness. If your legs feel heavy, shorten it.',
    tempo: () => 'Comfortably-hard running raises the pace you can hold for longer. Stay controlled, not all-out.',
    long: () => 'The long run is the backbone of marathon training. Slow, steady, and practise fuelling.',
    race: (s) => (s.km > 30 ? 'Race day. Start controlled, fuel early.' : 'A test effort so the plan can recalibrate your paces from real data.'),
  };

  /* ------------------------------------------------------------------ nav */
  function renderNav() {
    const item = (t, icon, label) => '<button class="nav__item" data-tab="' + t + '"' + (tab === t ? ' aria-current="page"' : '') + '>' + I(icon) + '<span>' + label + '</span></button>';
    $('#nav').innerHTML = item('today', 'today', 'Today') + item('plan', 'plan', 'Plan') +
      '<button class="nav__fab" data-act="log" aria-label="Log run">' + I('run') + '</button>' +
      item('insights', 'insights', 'Insights') + item('coach', 'coach', 'Coach');
  }

  /* ------------------------------------------------------------------ TODAY */
  function heroCard() {
    const sm = S.summary;
    let s = sm.today_session;
    let eyebrow = F.dateShort(todayStr());
    let lead = '';
    if (!s) { s = sm.next_session; if (s) { lead = 'Rest day today'; eyebrow = F.dayShort(s.date) + ' ' + F.dateShort(s.date); } }
    if (!s) return '<article class="card run-hero" data-type="rest"><div class="run-hero__dist"><span class="num">Done</span></div><p class="run-hero__what">No more sessions in the plan.</p></article>';

    const done = s.status === 'done';
    const type = TYPE_ATTR[s.type] || 'easy';
    const run = done ? runFor(s.id) : null;
    const pill = '<span class="pill pill--type" data-type="' + type + '">' + esc(lead ? 'Next: ' + (s.title || F.typeLabel(s.type)) : s.title || F.typeLabel(s.type)) + '</span>';
    const hr = hrText(s);
    const paceCell = s.pace_lo
      ? '<div class="meta-cell"><span class="label">Target pace</span><span class="num">' + F.pace(Math.round((s.pace_lo + s.pace_hi) / 2)) + '<span class="num__unit">/km</span></span><small>' + (s.type === 'tempo' ? 'tempo block' : F.paceRange(s.pace_lo, s.pace_hi)) + '</small></div>'
      : '<div class="meta-cell"><span class="label">Effort</span><span class="num">Hard</span><small>even pacing</small></div>';
    const hrCell = hr
      ? '<div class="meta-cell"><span class="label">Heart rate</span><span class="num">' + hr.z + '<span class="num__unit">' + hr.r + '</span></span><small>bpm</small></div>'
      : '<div class="meta-cell"><span class="label">Heart rate</span><span class="num">Feel</span><small>no cap</small></div>';
    const why = s.coach_edited
      ? '<b>Coach adjusted this:</b> ' + esc(s.note)
      : '<b>Why ' + esc(F.typeLabel(s.type).toLowerCase()) + ':</b> ' + esc((WHY[s.type] || WHY.easy)(s));
    const doneLine = done && run
      ? '<div class="coach-note"><span class="avatar">' + I('check') + '</span><p><b>Done:</b> ' + F.km(run.distance_km) + ' km at ' + F.pace(run.avg_pace_sec) + '/km' + (run.avg_hr ? ', avg HR ' + run.avg_hr : '') + '.</p></div>'
      : '';
    return '<article class="card run-hero" data-type="' + type + '"><div class="run-hero__top">' + pill +
      '<span class="label">' + esc(done ? 'Completed' : lead || eyebrow) + '</span></div>' +
      '<div class="run-hero__dist"><span class="num">' + F.km(s.km) + '</span><span class="unit">km</span></div>' +
      '<p class="run-hero__what">' + esc(done ? F.dateLong(s.date) : s.note) + '</p>' +
      '<div class="run-hero__meta">' + paceCell + hrCell + '</div>' +
      (done ? doneLine : '<div class="coach-note"><span class="avatar">' + I('sparkle') + '</span><p>' + why + '</p></div>') +
      '</article>';
  }

  function weekStripHtml() {
    const w = currentWeek();
    if (!w) return '';
    const t = todayStr();
    const letters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const days = letters.map((d, i) => {
      const date = F.addDays(w.start, i);
      const s = w.sessions.find((x) => x.date === date);
      let state = 'rest', km = null;
      const extra = !s ? S.runs.filter((r) => r.date === date && !r.session_id) : [];
      if (extra.length) { state = 'done'; km = F.km(extra.reduce((a, r) => a + r.distance_km, 0)); }
      if (s) {
        km = F.km(s.km);
        if (s.status === 'done') {
          const r = runFor(s.id);
          state = r && (r.distance_km < s.km * 0.85 || r.distance_km > s.km * 1.15) ? 'half' : 'done';
          if (r) km = F.km(r.distance_km);
        } else if (s.status === 'skipped' || date < t) state = 'missed';
        else state = 'planned';
      }
      return { d, state, km, today: date === t, label: F.dayLong(date) + (s ? ', ' + F.typeLabel(s.type) + ' ' + F.km(s.km) + ' km, ' + s.status : ', rest') };
    });
    return '<div class="card card--pad-sm">' + UI.weekStrip(days) + '</div>';
  }

  function renderToday() {
    const sm = S.summary, wp = sm.week_progress;
    const cw = currentWeek();
    const hero = heroCard();

    // long run comparison
    const longs = S.runs.filter((r) => { const s = r.session_id && findSession(r.session_id); return s && s.type === 'long'; });
    const prevLong = longs.length ? longs[longs.length - 1].distance_km : S.profile.baseline.longest_km;
    const thisLongS = cw ? cw.sessions.find((s) => s.type === 'long' || (s.type === 'race' && s.km >= 10)) : null;
    const thisLong = thisLongS ? thisLongS.km : 0;
    const seg = (km) => Math.min(14, Math.round(km / 2.5));

    // 7-day average HR
    const wk = S.runs.filter((r) => r.date > F.addDays(todayStr(), -7) && r.avg_hr);
    const avgHr = wk.length ? Math.round(wk.reduce((a, r) => a + r.avg_hr, 0) / wk.length) : null;
    const cap = S.profile.hr.easy_cap;
    const hrFill = avgHr ? Math.max(1, Math.min(8, Math.round(((200 - avgHr) / 70) * 8))) : 0;

    const lr = lastRun();
    const feedback = lr && lr.review
      ? '<div class="card note-card"><span class="avatar">' + I('sparkle') + '</span><div><div class="row" style="gap:8px;margin-bottom:6px"><span class="label">Latest coach note</span>' +
        '<span class="pill ' + (lr.review.verdict === 'caution' || lr.review.verdict === 'behind' ? 'pill--warn' : 'pill--ok') + '">' + esc(({ ahead: 'Ahead', on_track: 'On track', behind: 'Behind', caution: 'Caution' })[lr.review.verdict] || '') + '</span></div>' +
        '<p>' + esc(lr.review.coach_note) + '</p></div></div>'
      : '';

    $('#screen-today').innerHTML =
      hdr(F.dayShort(todayStr()) + ' ' + F.dateShort(todayStr()), greeting()) +
      '<div class="stack">' +
      UI.arcGauge({ pct: wp.pct, value: wp.pct, unit: 'PERCENT', label: 'WEEK COMPLETE', caption: '<span class="delta"><b>' + F.km(wp.done_km) + '</b> of ' + F.km(wp.planned_km) + ' km</span>' }) +
      '<div class="section-title">' + (sm.today_session ? 'Today’s run' : 'Next run') + ' <small>' + (cw ? 'Week ' + cw.n + ' · ' + esc(cw.phase) : '') + '</small></div>' +
      hero + feedback + weekStripHtml() +
      '<div class="grid-2">' +
      '<div class="card stat-card"><div class="card__head"><span class="card__icon" style="--c:var(--mint)">' + I('run') + '</span><span class="card__title">Weekly km</span></div><div class="stat-card__body stat-card__body--center">' +
      UI.ring({ pct: wp.pct, size: 118, stroke: 14, color: 'var(--mint)', center: '<b class="num">' + F.km(wp.done_km) + '</b><small>of ' + F.km(wp.planned_km) + ' km</small>', ariaLabel: wp.pct + ' percent of weekly distance' }) + '</div></div>' +
      '<div class="card stat-card"><div class="card__head"><span class="card__icon" style="--c:var(--magenta)">' + I('mountain') + '</span><span class="card__title">Long run</span></div>' +
      '<div class="stat-card__body" style="flex-direction:row;gap:14px;align-items:flex-end;justify-content:space-between">' +
      '<div style="flex:1"><div class="stat-pair"><b class="magenta">' + F.km(prevLong) + '</b></div>' + UI.slantBar({ vertical: true, segments: 14, filled: seg(prevLong), tone: 'magenta', label: 'Last long run ' + F.km(prevLong) + ' km' }) + '</div>' +
      '<div style="flex:1"><div class="stat-pair"><b class="teal">' + (thisLong ? F.km(thisLong) : '–') + '</b></div>' + UI.slantBar({ vertical: true, segments: 14, filled: seg(thisLong), tone: 'teal', label: 'This week ' + F.km(thisLong) + ' km' }) + '</div>' +
      '</div><div class="card__foot"><span>Last</span><span>' + (thisLongS ? F.dayShort(thisLongS.date) : 'Next') + '</span></div></div></div>' +
      '<div class="card"><div class="card__head"><span class="card__icon" style="--c:var(--magenta)">' + I('heart') + '</span><span class="card__title">Avg heart rate</span><span class="card__meta">7 days</span></div>' +
      '<div class="row row--between" style="align-items:flex-end"><span class="num num--lg">' + (avgHr || '–') + '<span class="num__unit">bpm</span></span>' +
      '<div style="width:46%;padding-bottom:6px">' + UI.slantBar({ segments: 8, filled: hrFill, tone: avgHr && avgHr > cap + 5 ? 'magenta' : 'mint', size: 'md', label: avgHr ? 'Average heart rate ' + avgHr : 'No heart rate data' }) + '</div></div>' +
      '<div class="card__foot"><span>' + (avgHr ? (avgHr <= cap ? 'Under your easy cap' : 'Above your easy cap') : 'Log a run to see this') + '</span><span>Easy cap ' + cap + '</span></div></div>' +
      '<button class="btn btn--primary btn--block" data-act="log">' + I('run', { size: 22 }) + 'Log this run</button>' +
      '</div>';
  }

  /* ------------------------------------------------------------------ PLAN */
  const PHASE_ORDER = ['Base', 'Build', 'Peak', 'Taper'];

  function renderPlan() {
    const sm = S.summary, p = S.profile, t = todayStr();
    const totalWeeks = S.plan.weeks.length;
    const cur = sm.current_week || 0;
    const mp = p.target_time_sec / 42.195;
    const countdown =
      '<article class="card countdown"><div class="countdown__top"><div><span class="label">Race day · ' + esc(F.dateShort(p.race_date)) + ' ' + p.race_date.slice(0, 4) + '</span>' +
      '<div class="countdown__days" style="margin-top:8px"><span class="num">' + Math.max(0, sm.days_to_race) + '</span><span>days</span></div></div>' +
      '<div class="countdown__target"><span class="label">Target</span><div class="num">' + F.hms(p.target_time_sec) + '</div><span class="muted">' + F.pace(mp) + ' /km</span></div></div>' +
      '<div class="countdown__bar">' + UI.slantBar({ segments: 20, filled: Math.max(1, Math.round((cur / totalWeeks) * 20)), tone: 'green', label: 'Week ' + cur + ' of ' + totalWeeks }) +
      '<div class="countdown__scale"><span class="label">Week ' + cur + '</span><span class="label">of ' + totalWeeks + '</span></div></div></article>';

    if (!openPhases) { const cw = S.plan.weeks.find((w) => w.n === cur); openPhases = new Set([cw ? cw.phase : 'Base']); }
    const groups = PHASE_ORDER.map((ph) => ({ ph, weeks: S.plan.weeks.filter((w) => w.phase === ph) })).filter((g) => g.weeks.length);
    const letters = { 0: 'S', 1: 'M', 2: 'T', 3: 'W', 4: 'T', 5: 'F', 6: 'S' };
    const dayLetter = (d) => letters[new Date(d + 'T00:00:00Z').getUTCDay()];
    const phases = groups.map((g) => {
      const km = Math.round(g.weeks.reduce((a, w) => a + w.km, 0));
      const rows = g.weeks.map((w) => {
        const end = F.addDays(w.start, 6);
        const isCur = w.n === cur;
        const isDone = end < t && w.sessions.every((s) => s.status !== 'planned');
        const sess = w.sessions.map((s) => '<span class="session' + (s.status === 'done' ? ' is-done' : s.status === 'skipped' ? ' is-skipped' : '') + '" role="button" tabindex="0" data-type="' + (TYPE_ATTR[s.type] || 'easy') + '" data-sid="' + s.id + '" aria-label="' + esc(F.dayLong(s.date) + ' ' + F.typeLabel(s.type) + ' ' + F.km(s.km) + ' km') + '"><span class="session__d">' + dayLetter(s.date) + '</span><b>' + F.km(s.km) + '</b></span>').join('');
        return '<div class="week-row' + (isDone ? ' is-done' : '') + (isCur ? ' is-current' : '') + '"' + (isCur ? ' id="cur-week"' : '') + '>' + (isCur ? '<span class="week-row__tag">This week</span>' : '') +
          '<div class="week-row__lead"><span class="week-row__wk">Wk ' + w.n + '</span><span class="week-row__km">' + F.km(w.km) + '<small>km</small></span></div>' +
          '<div class="week-row__sessions">' + sess + '</div>' + (w.milestone ? '<div class="week-row__ms">' + I('flag', { size: 16 }) + '<span>' + esc(w.milestone) + '</span></div>' : '') + '</div>';
      }).join('');
      const isOpen = openPhases.has(g.ph);
      return '<div class="phase' + (isOpen ? '' : ' is-collapsed') + '" data-phase="' + g.ph.toLowerCase() + '"><div class="phase__head" role="button" tabindex="0" aria-expanded="' + isOpen + '" data-phase-toggle="' + g.ph + '"><span class="phase__dot"></span><span class="phase__name">' + g.ph + '</span><span class="phase__range">Wk ' + g.weeks[0].n + '–' + g.weeks[g.weeks.length - 1].n + '</span><span class="phase__km">' + km + ' km</span><span class="phase__chev">' + I('chev-d', { size: 18 }) + '</span></div>' + rows + '</div>';
    }).join('');

    $('#screen-plan').innerHTML = hdr(esc(p.race_name), 'Your plan') + '<div class="stack">' + countdown + phases + '</div>';
  }

  /* ------------------------------------------------------------------ INSIGHTS */
  function weekStats() {
    return S.plan.weeks.map((w) => {
      const end = F.addDays(w.start, 6);
      const rs = S.runs.filter((r) => r.date >= w.start && r.date <= end);
      const km = rs.reduce((a, r) => a + r.distance_km, 0);
      const sec = rs.reduce((a, r) => a + (r.duration_sec || 0), 0);
      const hrRuns = rs.filter((r) => r.avg_hr);
      return {
        n: w.n, plan: w.km, km, runs: rs.length,
        pace: km > 0 ? sec / km : null,
        hr: hrRuns.length ? hrRuns.reduce((a, r) => a + r.avg_hr, 0) / hrRuns.length : null,
        longest: rs.length ? Math.max.apply(null, rs.map((r) => r.distance_km)) : 0,
      };
    });
  }

  function renderInsights() {
    const sm = S.summary, rd = sm.readiness, cw = sm.current_week || 1;
    const ws = weekStats();
    const idx = cw - 1;
    const last8 = ws.slice(Math.max(0, idx - 7), idx + 1);
    const w = currentWeek();
    const span = ws.slice(Math.max(0, idx - 4), idx + 4);

    const trio = '<div class="trio">' +
      '<div class="trio__item trio__item--gold"><span class="trio__badge">' + I('trophy') + '</span><span class="trio__num">' + sm.streak.best + '</span><span class="trio__unit">runs</span><span class="trio__label">Best streak</span></div>' +
      '<div class="trio__item trio__item--violet"><span class="trio__badge">' + I('run') + '</span><span class="trio__num">' + sm.total_runs + '</span><span class="trio__unit">runs</span><span class="trio__label">Total runs</span></div>' +
      '<div class="trio__item trio__item--flame"><span class="trio__badge">' + I('flame') + '</span><span class="trio__num">' + sm.streak.current + '</span><span class="trio__unit">runs</span><span class="trio__label">Current streak</span></div></div>';

    const readiness = '<div class="card">' + UI.arcGauge({ variant: 'dash', pct: rd.score, value: rd.score, status: rd.label, label: 'RACE READINESS', glyph: 'run', ariaLabel: 'Race readiness ' + rd.score + ' out of 100' }) + trio +
      '<div class="kv"><div><b>' + F.km(rd.longest_km) + '<small> km</small></b><span>Longest run (goal 32)</span></div><div><b>' + F.km(rd.weekly_km_4w) + '<small> km</small></b><span>Weekly avg, 4 wks (goal 45)</span></div><div><b>' + rd.consistency + '<small>%</small></b><span>Sessions done, 4 wks</span></div></div></div>';

    const weekly = '<div class="card card--cream"><div class="row row--between" style="align-items:flex-end"><div><span class="label">Your week</span><div class="num num--sm" style="margin-top:6px">' + (w ? esc(F.dateShort(w.start) + ' – ' + F.dateShort(F.addDays(w.start, 6))) : '') + '</div></div>' +
      '<span class="num num--lg">' + F.km(sm.week_progress.done_km) + '<span class="num__unit">km</span></span></div>' +
      UI.weekBars({ step: 5, items: span.map((x) => ({ label: x.n === cw ? 'NOW' : 'W' + x.n, value: x.n > cw ? null : Math.round(x.km), plan: Math.round(x.plan), state: x.n === cw ? 'current' : 'done' })), ariaLabel: 'Weekly kilometres, done versus planned' }) + '</div>';

    const labels = last8.map((x) => 'W' + x.n);
    const lab = labels.map((l, i) => (i === 0 || i === labels.length - 1 || i % 2 === 0 ? l : ''));
    const paceData = last8.map((x) => (x.pace ? x.pace : null));
    const hrData = last8.map((x) => (x.hr ? Math.round(x.hr) : null));
    const havePace = paceData.filter((v) => v != null).length >= 2;
    const haveHr = hrData.filter((v) => v != null).length >= 2;
    const delta = (arr, fmt, unit, lowerBetter) => {
      const v = arr.filter((x) => x != null);
      if (v.length < 2) return '';
      const d = v[v.length - 1] - v[0];
      const good = lowerBetter ? d < 0 : d > 0;
      return '<span class="delta ' + (good ? 'delta--up' : 'delta--down') + '"><b>' + (d > 0 ? '+' : '−') + fmt(Math.abs(d)) + '</b> ' + unit + '</span>';
    };
    const lastVal = (arr) => { const v = arr.filter((x) => x != null); return v.length ? v[v.length - 1] : null; };
    const empty = '<div class="hint" style="padding:18px 4px 6px">Trends show up once you have runs in two different weeks.</div>';
    const pv = lastVal(paceData), hv = lastVal(hrData);
    const paceCard = '<article class="card chart-card"><div class="chart-card__head"><div><span class="label">Avg pace</span><div class="chart-card__value"><span class="num">' + (pv ? F.pace(pv) : '–') + '</span><span class="muted">/km</span></div></div>' + (havePace ? delta(paceData, (s) => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0'), 'pace', true) : '') + '</div>' +
      (havePace ? UI.lineChart({ data: paceData, labels: lab, color: 'var(--teal)', invert: true, min: Math.min.apply(null, paceData.filter(Boolean)) - 15, max: Math.max.apply(null, paceData.filter(Boolean)) + 15, fmt: (v) => F.pace(v), ticks: 3, ariaLabel: 'Average pace by week' }) : empty) + '</article>';
    const hrCard = '<article class="card chart-card"><div class="chart-card__head"><div><span class="label">Avg heart rate</span><div class="chart-card__value"><span class="num">' + (hv || '–') + '</span><span class="muted">bpm</span></div></div>' + (haveHr ? delta(hrData, (x) => String(Math.round(x)), 'bpm', true) : '') + '</div>' +
      (haveHr ? UI.lineChart({ data: hrData, labels: lab, color: 'var(--magenta)', min: Math.min.apply(null, hrData.filter(Boolean)) - 4, max: Math.max.apply(null, hrData.filter(Boolean)) + 4, ticks: 3, ariaLabel: 'Average heart rate by week' }) : empty) + '</article>';

    const lastFour = ws.slice(Math.max(0, idx - 3), idx + 1);
    const longCard = '<article class="card"><div class="card__head"><span class="card__icon" style="--c:var(--mint)">' + I('mountain') + '</span><span class="card__title">Longest run per week</span><span class="card__meta">goal 32 km</span></div><div class="stack stack--sm">' +
      lastFour.map((x, i) => '<div class="bar-row' + (i === lastFour.length - 1 ? ' is-current' : '') + '"><span class="bar-row__lbl">Wk ' + x.n + '</span>' + UI.slantBar({ segments: 16, filled: Math.round((x.longest / 32) * 16), tone: i === lastFour.length - 1 ? 'teal' : 'mint', size: 'sm', label: F.km(x.longest) + ' of 32 km' }) + '<span class="bar-row__val">' + (x.longest ? F.km(x.longest) + ' km' : '–') + '</span></div>').join('') + '</div></article>';

    const hist = S.runs.length
      ? '<div class="section-title">Run history <small>' + S.runs.length + (S.runs.length === 1 ? ' run' : ' runs') + '</small></div><div class="card"><div class="stack stack--sm">' +
        S.runs.slice().reverse().slice(0, 12).map((r) => '<div class="row row--between"><div><b>' + F.km(r.distance_km) + ' km</b> <span class="muted">· ' + F.pace(r.avg_pace_sec) + '/km' + (r.avg_hr ? ' · ' + r.avg_hr + ' bpm' : '') + '</span></div><span class="muted">' + esc(F.dateShort(r.date)) + '</span></div>').join('') + '</div></div>'
      : '';

    $('#screen-insights').innerHTML = hdr(Math.max(0, sm.days_to_race) + ' days to race', 'Insights', 'nostreak') + '<div class="stack">' + readiness +
      '<div class="section-title">Weekly <small>done vs planned</small></div>' + weekly + paceCard + hrCard + longCard + hist + '</div>';
  }

  /* ------------------------------------------------------------------ COACH */
  const fmtTime = (iso) => { try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };

  function appliedHtml(applied) {
    if (!applied || !applied.length) return '';
    return '<div class="applied"><b>Plan updated</b>' + applied.map((a) => {
      const s = findSession(a.id);
      const what = s ? F.dayShort(a.after.date) + ' ' + F.typeLabel(a.after.type).toLowerCase() : 'Session';
      const chg = a.after.status === 'skipped' ? 'skipped' : a.before.date !== a.after.date ? 'moved to ' + F.dateShort(a.after.date) : a.before.km !== a.after.km ? a.before.km + ' → ' + a.after.km + ' km' : 'notes updated';
      return '<div>' + esc(what) + ': ' + esc(chg) + '</div>';
    }).join('') + '</div>';
  }

  const bubble = (m) => m.role === 'user'
    ? '<div class="bubble-row bubble-row--user"><div class="bubble bubble--user">' + esc(m.content).replace(/\n/g, '<br>') + '<span class="bubble__meta">' + fmtTime(m.at) + '</span></div></div>'
    : '<div class="bubble-row"><span class="avatar avatar--sm">' + I('sparkle') + '</span><div class="bubble">' + esc(m.content).split(/\n{2,}/).map((p) => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('') + appliedHtml(m.changes) + '<span class="bubble__meta">Coach · ' + fmtTime(m.at) + '</span></div></div>';

  function renderCoach(typing) {
    const msgs = S.chat.length ? S.chat.map(bubble).join('') :
      '<div class="bubble-row"><span class="avatar avatar--sm">' + I('sparkle') + '</span><div class="bubble"><p>Hi' + (S.profile.name ? ' ' + esc(S.profile.name) : '') + '. I’m your coach. Log a run and I’ll review it and adjust your plan. You can also ask me anything: soreness, travel, pacing, fuelling.</p><span class="bubble__meta">Coach</span></div></div>';
    const typingRow = typing ? '<div class="bubble-row"><span class="avatar avatar--sm">' + I('sparkle') + '</span><div class="bubble bubble--typing" aria-label="Coach is typing"><i></i><i></i><i></i></div></div>' : '';
    const chips = ['Am I on track?', 'I’m feeling sore', 'I’m travelling this week', 'Make this week easier'];
    $('#screen-coach').innerHTML = hdr('Ask anything', 'Your coach', 'nostreak') +
      (S.ai.enabled ? '' : '<div class="banner" style="margin:0 0 10px">The AI coach is switched off because the server has no API key. Logging runs still works with basic feedback.</div>') +
      '<div class="chat" id="chat">' + msgs + typingRow + '</div>' +
      '<div class="chips" role="group">' + chips.map((c) => '<button class="chip" data-chip="' + esc(c) + '">' + esc(c) + '</button>').join('') + '</div>' +
      '<div class="composer"><button class="icon-btn" data-act="log" aria-label="Attach screenshot">' + I('clip') + '</button>' +
      '<label class="composer__field"><span class="sr-only">Message</span><input class="composer__input" id="chat-input" placeholder="Ask your coach..." autocomplete="off" enterkeyhint="send"></label>' +
      '<button class="icon-btn icon-btn--green" id="chat-send" aria-label="Send">' + I('send') + '</button></div>';
    const chat = $('#chat');
    if (chat) chat.scrollTop = chat.scrollHeight;
  }

  async function sendChat(text) {
    text = (text || '').trim();
    if (!text || chatBusy) return;
    chatBusy = true;
    S.chat.push({ role: 'user', content: text, at: new Date().toISOString() });
    renderCoach(true);
    try {
      const r = await API.chat(text);
      S.chat.push({ role: 'assistant', content: r.reply, at: new Date().toISOString(), changes: r.applied && r.applied.length ? r.applied : undefined });
      S.plan = r.plan; S.profile = r.profile; S.summary = r.summary;
      if (r.applied && r.applied.length) toast('Plan updated');
    } catch (e) {
      S.chat.pop();
      toast(e.code === 'no_api_key' ? 'AI is off: add ANTHROPIC_API_KEY on the server' : e.message, 'error');
    }
    chatBusy = false;
    render();
    renderCoach(false);
  }

  /* ------------------------------------------------------------------ SESSION DETAIL */
  function openSession(id) {
    const s = findSession(id);
    if (!s) return;
    const run = runFor(s.id);
    const hr = hrText(s);
    const canAct = s.status === 'planned' && s.date >= todayStr();
    const canLog = s.status === 'planned' && s.date <= F.addDays(todayStr(), 2);
    const rows = [
      ['Date', F.dateLong(s.date)],
      ['Type', F.typeLabel(s.type)],
      ['Distance', F.km(s.km) + ' km'],
      s.pace_lo ? ['Target pace', F.paceRange(s.pace_lo, s.pace_hi) + ' /km'] : null,
      hr ? ['Heart rate', hr.r + ' bpm'] : null,
      ['Status', s.status === 'done' ? 'Done' : s.status === 'skipped' ? 'Skipped' : 'Planned'],
    ].filter(Boolean);
    $('#session-sheet').innerHTML =
      '<div class="sheet__grab"></div><div class="sheet__head"><div><h2 class="sheet__title">' + esc(s.title || F.typeLabel(s.type)) + '</h2><p class="sheet__sub">Week ' + s.week + ' · ' + esc(s.phase) + (s.coach_edited ? ' · adjusted by coach' : '') + '</p></div><button class="icon-btn" data-close aria-label="Close">' + I('close') + '</button></div>' +
      '<div class="sheet__body"><div class="detail-list">' + rows.map((r) => '<div><span>' + r[0] + '</span><b>' + esc(r[1]) + '</b></div>').join('') + '</div>' +
      '<p class="hint" style="margin-top:12px">' + esc(s.note || '') + '</p>' +
      (run ? '<div class="card card--flat" style="margin-top:12px"><span class="label">Your run</span><div class="num num--sm" style="margin-top:6px">' + F.km(run.distance_km) + ' km · ' + F.pace(run.avg_pace_sec) + '/km' + (run.avg_hr ? ' · ' + run.avg_hr + ' bpm' : '') + '</div></div>' : '') +
      '</div><div class="sheet__foot">' +
      (canLog ? '<button class="btn btn--primary btn--block" data-sess-log="' + s.id + '">' + I('run', { size: 22 }) + 'Log this run</button>' : '') +
      (canAct ? '<button class="btn btn--soft btn--block" data-sess-skip="' + s.id + '">Skip this session</button>' : '') + '</div>';
    open('#ov-session');
  }

  /* ------------------------------------------------------------------ LOG FLOW */
  function startLog(preSessionId) {
    L = { step: 1, preSession: preSessionId || null, file: null, previewUrl: null, ex: null, edited: {}, paceTouched: false };
    renderLog();
    open('#ov-log');
  }

  function stepper(n) { return '<div class="stepper">' + [1, 2, 3].map((i) => '<i' + (i <= n ? ' class="is-on"' : '') + '></i>').join('') + '</div>'; }

  function sheetHead(title, sub) {
    return '<div class="sheet__grab"></div><div class="sheet__head"><div><h2 class="sheet__title">' + title + '</h2><p class="sheet__sub">' + sub + '</p></div><button class="icon-btn" data-close aria-label="Close">' + I('close') + '</button></div>';
  }

  function renderLog() {
    const el = $('#log-sheet');
    if (L.step === 1) {
      el.innerHTML = sheetHead('Log your run', 'Upload the summary screenshot from your Galaxy Watch') + stepper(1) +
        '<div class="sheet__body"><label class="dropzone" id="dropzone"><input type="file" id="shot" accept="image/*"><span class="dropzone__icon">' + I('upload') + '</span><span class="dropzone__title">Choose a screenshot</span><span class="dropzone__hint">Distance, time, pace and heart rate are read for you. You confirm before anything changes.</span></label></div>' +
        '<div class="sheet__foot"><button class="btn btn--soft btn--block" data-act="manual">' + I('edit', { size: 20 }) + 'Enter it manually instead</button></div>';
    } else if (L.step === 2) {
      el.innerHTML = sheetHead('Reading your run', 'This takes a few seconds') + stepper(2) +
        '<div class="sheet__body"><div class="preview"><img class="preview__img" src="' + L.previewUrl + '" alt="Your screenshot"><div class="preview__info"><div class="preview__name">' + esc(L.file.name) + '</div><div class="preview__size">' + Math.round(L.file.size / 1024) + ' KB</div></div></div>' +
        '<div class="scan"><div class="spinner" role="status"></div><div><b>Reading the numbers…</b><p class="muted">Checking distance, time, pace and heart rate</p></div></div>' +
        '<div class="stack stack--sm" style="margin-top:14px"><div class="skeleton skeleton--card"></div></div></div>';
    } else {
      const ex = L.ex || {};
      const t = ex.duration_sec != null ? F.hms(ex.duration_sec) : '';
      const date = ex.date || todayStr();
      const warn = (v) => (!L.manual && (v == null || v === '') ? ' is-warn' : '');
      const field = (id, label, val, unit, extra, mode) => '<label class="field-card' + (extra || '') + '"><span class="label">' + label + '</span><span class="field-card__row"><input class="field-card__input" id="' + id + '" value="' + esc(val == null ? '' : val) + '" inputmode="' + (mode || 'decimal') + '" autocomplete="off"><span class="field-card__unit">' + unit + '</span></span></label>';
      el.innerHTML = sheetHead('Confirm your run', L.manual ? 'Enter the numbers from your watch' : 'Check what I read. Tap any value to fix it.') + stepper(3) +
        '<div class="sheet__body">' +
        (ex.notes && !L.manual ? '<div class="banner" style="margin-bottom:12px">' + esc(ex.notes) + '</div>' : '') +
        (ex.is_run === false ? '<div class="banner banner--error" style="margin-bottom:12px">This doesn’t look like a running workout. Check the screenshot.</div>' : '') +
        '<div class="field-grid">' +
        '<label class="field-card field-card--wide"><span class="label">Date</span><span class="field-card__row"><input class="field-card__input" id="f-date" type="date" value="' + date + '" max="' + todayStr() + '"></span></label>' +
        field('f-dist', 'Distance', ex.distance_km, 'km', warn(ex.distance_km)) +
        field('f-time', 'Time', t, 'h:mm:ss', warn(ex.duration_sec), 'text') +
        field('f-pace', 'Avg pace', ex.avg_pace_sec_per_km ? F.pace(ex.avg_pace_sec_per_km) : '', '/km', warn(ex.avg_pace_sec_per_km), 'text') +
        field('f-hr', 'Avg HR', ex.avg_hr, 'bpm', warn(ex.avg_hr), 'numeric') +
        field('f-maxhr', 'Max HR', ex.max_hr, 'bpm', '', 'numeric') +
        field('f-cad', 'Cadence', ex.cadence_spm, 'spm', '', 'numeric') +
        field('f-cal', 'Calories', ex.calories, 'kcal', '', 'numeric') +
        '</div>' +
        '<div class="field" style="margin-top:14px"><label class="field__label" for="f-session">Which planned session was this?</label><select class="select" id="f-session"></select></div></div>' +
        '<div class="sheet__foot"><button class="btn btn--primary btn--block" id="confirm-run">Confirm &amp; update plan</button><button class="btn btn--text" data-act="log-back">Back</button></div>';
      fillSessionSelect(L.suggested || L.preSession);
    }
  }

  function fillSessionSelect(selectId) {
    const sel = $('#f-session');
    if (!sel) return;
    const date = ($('#f-date') || {}).value || todayStr();
    const diff = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
    const opts = allSessions().filter((s) => s.status === 'planned' && Math.abs(diff(s.date, date)) <= 3 && s.date <= F.addDays(todayStr(), 3));
    sel.innerHTML = '<option value="">Not in the plan (extra run)</option>' + opts.map((s) => '<option value="' + s.id + '">' + esc(F.dayShort(s.date) + ' ' + F.dateShort(s.date) + ' · ' + F.typeLabel(s.type) + ' ' + F.km(s.km) + ' km') + '</option>').join('');
    if (selectId && opts.some((s) => s.id === selectId)) sel.value = selectId;
  }

  function compressImage(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const max = 1600, sc = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => { URL.revokeObjectURL(url); resolve(b ? new File([b], 'run.jpg', { type: 'image/jpeg' }) : file); }, 'image/jpeg', 0.9);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  async function onShot(file) {
    if (!file) return;
    L.file = file;
    L.previewUrl = URL.createObjectURL(file);
    L.step = 2; renderLog();
    try {
      const small = await compressImage(file);
      const r = await API.extract(small);
      L.ex = r.extracted; L.suggested = r.suggested_session_id; L.manual = false;
      L.step = 3; renderLog();
    } catch (e) {
      L.ex = {}; L.manual = true; L.step = 3; renderLog();
      toast(e.code === 'no_api_key' ? 'AI is off, so enter the numbers yourself' : 'Couldn’t read it: ' + e.message, 'warn');
    }
  }

  function readForm() {
    const v = (id) => ($(id) || {}).value;
    const num = (id) => { const x = parseFloat(String(v(id) || '').replace(',', '.')); return Number.isFinite(x) ? x : null; };
    const dur = F.parseTime(v('#f-time') || '', false);
    const pace = F.parseTime(v('#f-pace') || '', false);
    return { date: v('#f-date'), distance_km: num('#f-dist'), duration_sec: dur, avg_pace_sec: pace, avg_hr: num('#f-hr'), max_hr: num('#f-maxhr'), cadence: num('#f-cad'), calories: num('#f-cal'), session_id: v('#f-session') || null, source: L.manual ? 'manual' : 'screenshot' };
  }

  async function confirmRun() {
    const body = readForm();
    if (!body.distance_km) return toast('Enter the distance', 'warn');
    if (!body.duration_sec) return toast('Enter the time as h:mm:ss', 'warn');
    const btn = $('#confirm-run');
    btn.disabled = true; btn.textContent = 'Coach is reviewing…';
    try {
      const r = await API.logRun(body);
      S.plan = r.plan; S.profile = r.profile; S.summary = r.summary; S.runs.push(r.run); S.runs.sort((a, b) => a.date.localeCompare(b.date));
      close('#ov-log'); L = null;
      render();
      showResult(r);
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Confirm & update plan';
      toast(e.message, 'error');
    }
  }

  function showResult(r) {
    const rv = r.review;
    const titles = { ahead: 'Ahead of plan', on_track: 'On track', behind: 'A bit behind', caution: 'Easy does it' };
    const good = rv.verdict === 'ahead' || rv.verdict === 'on_track';
    const streak = S.summary.streak.current;
    const changes = (r.applied || []).map((a) => {
      const up = a.after.km > a.before.km, down = a.after.km < a.before.km;
      const skipped = a.after.status === 'skipped';
      const c = skipped || down ? 'var(--magenta)' : up ? 'var(--mint)' : 'var(--teal)';
      const icon = skipped ? 'close' : up ? 'up' : down ? 'down' : 'edit';
      const sub = skipped ? 'Skipped' : a.before.date !== a.after.date ? 'Moved to ' + F.dateShort(a.after.date) : 'Adjusted';
      const delta = skipped ? '' : a.before.km !== a.after.km ? a.before.km + ' → ' + a.after.km + ' km' : '';
      return '<li class="change" style="--c:' + c + '"><span class="change__icon">' + I(icon, { size: 20 }) + '</span><div><div class="change__t">' + esc(F.dayLong(a.before.date) + ' ' + F.typeLabel(a.before.type).toLowerCase()) + '</div><div class="change__s">' + sub + '</div></div><span class="change__delta">' + delta + '</span></li>';
    }).join('');
    const flags = (rv.flags || []).map((f) => '<div class="banner" style="margin-top:8px;text-align:left">' + esc(f) + '</div>').join('');
    $('#result-modal').innerHTML =
      (good ? '<div class="confetti"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' : '') +
      '<div class="modal__icon">' + (streak > 1 ? UI.flame(64) : I('sparkle', { size: 56 })) + '</div>' +
      '<h2 class="modal__title">' + (streak > 1 ? '<span class="num">' + streak + '</span> Run Streak' : esc(titles[rv.verdict] || 'Run logged')) + '</h2>' +
      (streak > 1 ? '<p class="modal__text"><b>' + esc(titles[rv.verdict] || '') + '.</b></p>' : '') +
      '<p class="modal__text">' + esc(rv.coach_note) + '</p>' +
      (changes ? '<ul class="change-list">' + changes + '</ul>' : '<p class="modal__text muted">' + esc(rv.what_changed || 'No changes to the plan.') + '</p>') +
      flags +
      (rv.ai === false ? '<p class="hint" style="margin-top:10px">Basic review only: the AI coach was unavailable.</p>' : '') +
      '<button class="btn btn--primary" data-close style="margin-top:14px">Got it</button>';
    open('#ov-result');
  }

  /* ------------------------------------------------------------------ SETTINGS */
  function openSettings() {
    const p = S.profile;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    $('#settings-sheet').innerHTML = sheetHead('Settings', 'Race, target and heart-rate limits') +
      '<div class="sheet__body"><div class="stack">' +
      '<div class="field"><label class="field__label" for="s-name">Your name</label><input class="input" id="s-name" value="' + esc(p.name) + '" maxlength="40" autocomplete="off"></div>' +
      '<div class="field"><label class="field__label" for="s-race">Race</label><input class="input" id="s-race" value="' + esc(p.race_name) + '"></div>' +
      '<div class="field-row"><div class="field"><label class="field__label" for="s-date">Race date</label><input class="input" id="s-date" type="date" value="' + p.race_date + '"></div>' +
      '<div class="field"><label class="field__label" for="s-target">Target (h:mm)</label><input class="input input--time" id="s-target" value="' + Math.floor(p.target_time_sec / 3600) + ':' + String(Math.round((p.target_time_sec % 3600) / 60)).padStart(2, '0') + '" inputmode="numeric"></div></div>' +
      '<div class="field-row"><div class="field"><label class="field__label" for="s-cap">Easy HR cap</label><input class="input" id="s-cap" value="' + p.hr.easy_cap + '" inputmode="numeric"></div>' +
      '<div class="field"><label class="field__label" for="s-max">Max HR</label><input class="input" id="s-max" value="' + (p.max_hr || '') + '" inputmode="numeric" placeholder="unknown"></div></div>' +
      '<div class="field"><label class="field__label" for="s-tz">Time zone</label><input class="input" id="s-tz" value="' + esc(p.timezone) + '"><span class="field__hint">Your device says ' + esc(tz) + '. Change this when you travel.</span></div>' +
      '<label class="toggle"><span>Rebuild the weeks ahead with these settings</span><input type="checkbox" id="s-regen"><span class="toggle__track"></span></label>' +
      '<div class="hint">AI coach: ' + (S.ai.enabled ? 'on (' + esc(S.ai.model) + ')' : 'off. Set ANTHROPIC_API_KEY on the server.') + '</div>' +
      '<button class="btn btn--ghost btn--sm" data-act="clear-chat">Clear coach chat</button>' +
      '</div></div><div class="sheet__foot"><button class="btn btn--primary btn--block" id="save-settings">Save</button></div>';
    open('#ov-settings');
  }

  async function saveSettings() {
    const v = (id) => $(id).value.trim();
    const tt = v('#s-target').split(':').map(Number);
    const target = Number.isFinite(tt[0]) ? tt[0] * 3600 + (tt[1] || 0) * 60 : null;
    const body = { name: v('#s-name'), race_name: v('#s-race'), race_date: v('#s-date'), timezone: v('#s-tz'), regenerate: $('#s-regen').checked };
    if (target) body.target_time_sec = target;
    const cap = parseInt(v('#s-cap'), 10); if (cap) body.easy_hr_cap = cap;
    const mx = parseInt(v('#s-max'), 10); if (mx) body.max_hr = mx;
    try {
      await API.saveProfile(body);
      S = await API.state();
      close('#ov-settings'); render(); toast('Saved');
    } catch (e) { toast(e.message, 'error'); }
  }

  /* ------------------------------------------------------------------ passcode */
  function askPasscode() {
    $('#pass-modal').innerHTML = '<div class="modal__icon">' + I('lock', { size: 48 }) + '</div><h2 class="modal__title">Enter passcode</h2><p class="modal__text">This Stride server is protected.</p>' +
      '<div class="field" style="width:100%"><input class="input" id="pass-in" type="password" autocomplete="current-password" aria-label="Passcode"></div><button class="btn btn--primary" id="pass-go" style="margin-top:12px">Unlock</button>';
    open('#ov-pass');
  }

  /* ------------------------------------------------------------------ render + events */
  function render() {
    TABS.forEach((t) => { const el = $('#screen-' + t); if (el) el.hidden = t !== tab; });
    renderNav();
    if (tab === 'today') renderToday();
    else if (tab === 'plan') renderPlan();
    else if (tab === 'insights') renderInsights();
    else renderCoach(chatBusy);
  }

  function go(t) {
    tab = t; history.replaceState(null, '', '#' + t);
    render();
    window.scrollTo(0, 0);
    if (t === 'plan') { const c = $('#cur-week'); if (c) c.scrollIntoView({ block: 'center' }); }
  }

  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tab],[data-act],[data-close],[data-sid],[data-phase-toggle],[data-chip],[data-sess-log],[data-sess-skip],#confirm-run,#save-settings,#chat-send,#pass-go');
    if (!t) return;
    if (t.dataset.tab) return go(t.dataset.tab);
    if (t.dataset.phaseToggle) { const ph = t.dataset.phaseToggle; if (openPhases.has(ph)) openPhases.delete(ph); else openPhases.add(ph); const y = window.scrollY; renderPlan(); window.scrollTo(0, y); return; }
    if (t.dataset.sid) return openSession(t.dataset.sid);
    if (t.dataset.chip) return sendChat(t.dataset.chip);
    if (t.hasAttribute('data-close')) { const ov = t.closest('.overlay'); if (ov) ov.classList.remove('is-open'); return; }
    if (t.id === 'chat-send') { const i = $('#chat-input'); const v = i.value; i.value = ''; return sendChat(v); }
    if (t.id === 'confirm-run') return confirmRun();
    if (t.id === 'save-settings') return saveSettings();
    if (t.id === 'pass-go') { API.setPasscode($('#pass-in').value); close('#ov-pass'); return init(); }
    if (t.dataset.sessLog) { close('#ov-session'); return startLog(t.dataset.sessLog); }
    if (t.dataset.sessSkip) {
      try { const r = await API.skip(t.dataset.sessSkip, 'Skipped by you'); S.plan = r.plan; S.summary = r.summary; close('#ov-session'); render(); toast('Session skipped'); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    switch (t.dataset.act) {
      case 'log': { const s = S.summary.today_session; return startLog(s && s.status === 'planned' ? s.id : null); }
      case 'settings': return openSettings();
      case 'streak': return toast(S.summary.streak.current + ' completed runs in a row. Best: ' + S.summary.streak.best);
      case 'manual': L.manual = true; L.ex = {}; L.step = 3; return renderLog();
      case 'log-back': L.step = 1; return renderLog();
      case 'clear-chat': try { await API.clearChat(); S.chat = []; close('#ov-settings'); render(); toast('Chat cleared'); } catch (err) { toast(err.message, 'error'); } return;
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'shot') onShot(e.target.files[0]);
    if (e.target.id === 'f-date') fillSessionSelect(null);
  });

  document.addEventListener('input', (e) => {
    const id = e.target.id;
    if (id === 'f-pace') L.paceTouched = true;
    if ((id === 'f-dist' || id === 'f-time') && L && !L.paceTouched) {
      const d = parseFloat($('#f-dist').value.replace(',', '.')), s = F.parseTime($('#f-time').value, false);
      if (d > 0 && s > 0) $('#f-pace').value = F.pace(Math.round(s / d));
    }
    if (e.target.classList && e.target.classList.contains('field-card__input')) { const fc = e.target.closest('.field-card'); fc.classList.add('is-edited'); if (e.target.value.trim()) fc.classList.remove('is-warn'); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'chat-input') { const v = e.target.value; e.target.value = ''; sendChat(v); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.sid) { e.preventDefault(); openSession(e.target.dataset.sid); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.phaseToggle) { e.preventDefault(); e.target.click(); }
    if (e.key === 'Escape') document.querySelectorAll('.overlay.is-open').forEach((o) => { if (o.id !== 'ov-pass') o.classList.remove('is-open'); });
  });

  // drag and drop onto the dropzone
  document.addEventListener('dragover', (e) => { const z = e.target.closest('#dropzone'); if (z) { e.preventDefault(); z.classList.add('is-over'); } });
  document.addEventListener('dragleave', (e) => { const z = e.target.closest('#dropzone'); if (z) z.classList.remove('is-over'); });
  document.addEventListener('drop', (e) => { const z = e.target.closest('#dropzone'); if (z) { e.preventDefault(); z.classList.remove('is-over'); onShot(e.dataTransfer.files[0]); } });

  async function init() {
    try {
      S = await API.state();
    } catch (e) {
      if (e.status === 401) return askPasscode();
      document.body.insertAdjacentHTML('afterbegin', '<div class="banner banner--error" style="margin:16px">Can’t reach the Stride server: ' + esc(e.message) + '</div>');
      return;
    }
    const h = location.hash.slice(1);
    if (TABS.includes(h)) tab = h;
    render();
  }

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && S && !document.querySelector('.overlay.is-open')) {
      try { S = await API.state(); render(); } catch (e) { /* offline, keep what we have */ }
    }
  });

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  init();
})();
