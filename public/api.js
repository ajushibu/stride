// Thin client for the Stride server + small formatting helpers. No framework.
(function () {
  const PASS_KEY = 'stride.passcode';

  async function request(method, url, body, isForm) {
    const headers = {};
    try { const p = localStorage.getItem(PASS_KEY); if (p) headers['x-passcode'] = p; } catch (e) { /* storage blocked */ }
    if (body && !isForm) headers['content-type'] = 'application/json';
    const res = await fetch(url, { method, headers, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
    let data = null;
    try { data = await res.json(); } catch (e) { /* non-JSON */ }
    if (!res.ok) {
      const err = new Error((data && data.message) || 'Request failed (' + res.status + ')');
      err.status = res.status;
      err.code = data && data.error;
      throw err;
    }
    return data;
  }

  const API = {
    setPasscode(p) { try { localStorage.setItem(PASS_KEY, p); } catch (e) { /* ignore */ } },
    state: () => request('GET', '/api/state'),
    saveProfile: (b) => request('PUT', '/api/profile', b),
    extract(file) { const f = new FormData(); f.append('image', file); return request('POST', '/api/runs/extract', f, true); },
    logRun: (b) => request('POST', '/api/runs', b),
    deleteRun: (id) => request('DELETE', '/api/runs/' + encodeURIComponent(id)),
    skip: (id, reason) => request('POST', '/api/sessions/' + encodeURIComponent(id) + '/skip', { reason }),
    chat: (message) => request('POST', '/api/chat', { message }),
    clearChat: () => request('DELETE', '/api/chat'),
  };

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const utc = (s) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)));

  const F = {
    pace(sec) {
      if (!sec) return '–';
      const m = Math.floor(sec / 60);
      let s = Math.round(sec % 60);
      if (s === 60) return (m + 1) + ':00';
      return m + ':' + String(s).padStart(2, '0');
    },
    paceRange(lo, hi) { return lo ? F.pace(lo) + '–' + F.pace(hi) : ''; },
    hms(sec) {
      if (!sec && sec !== 0) return '–';
      const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.round(sec % 60);
      return h > 0 ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') : m + ':' + String(s).padStart(2, '0');
    },
    // "1:10:00" / "70:00" / "4:30" (h:mm for marathon target) -> seconds
    parseTime(str, hoursFirst) {
      const parts = String(str).trim().split(':').map(Number);
      if (parts.some((n) => !Number.isFinite(n))) return null;
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return hoursFirst ? parts[0] * 3600 + parts[1] * 60 : parts[0] * 60 + parts[1];
      if (parts.length === 1) return parts[0] * 60;
      return null;
    },
    km(x) { return x == null ? '–' : (Math.round(x * 10) / 10).toString().replace(/\.0$/, ''); },
    dayShort: (d) => DAYS[utc(d).getUTCDay()],
    dayLong: (d) => DAYS_LONG[utc(d).getUTCDay()],
    dateShort: (d) => utc(d).getUTCDate() + ' ' + MONTHS[utc(d).getUTCMonth()],
    dateLong: (d) => DAYS_LONG[utc(d).getUTCDay()] + ', ' + utc(d).getUTCDate() + ' ' + MONTHS[utc(d).getUTCMonth()],
    addDays(d, n) { const t = utc(d); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); },
    esc: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    typeLabel: (t) => ({ easy: 'Easy run', tempo: 'Tempo', long: 'Long run', recovery: 'Recovery', race: 'Race', rest: 'Rest' }[t] || t),
  };

  window.API = API;
  window.F = F;
})();
