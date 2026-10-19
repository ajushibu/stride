// Date helpers. All dates are plain 'YYYY-MM-DD' strings, handled in UTC so there are no DST surprises.
const DAY = 86400000;

const parse = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (s, n) => fmt(parse(s) + n * DAY);
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / DAY);
const dow = (s) => new Date(parse(s)).getUTCDay(); // 0 = Sunday
const mondayOf = (s) => addDays(s, -((dow(s) + 6) % 7));

function todayIn(tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || 'Asia/Calcutta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    return parts; // en-CA gives YYYY-MM-DD
  } catch {
    return fmt(Date.now());
  }
}

function secToPace(sec) {
  if (!sec && sec !== 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
}

function secToHMS(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

module.exports = { DAY, parse, fmt, addDays, diffDays, dow, mondayOf, todayIn, secToPace, secToHMS };
