// Storage. Two modes, chosen by environment:
//   Supabase (SUPABASE_URL set): one JSON row per signed-in user, protected by row-level security.
//   File (default, local dev): data/store.json, single user, no sign-in.
// The same state object shape is used in both, so the rest of the server doesn't care.
const fs = require('fs');
const path = require('path');
const { generatePlan, defaultProfile } = require('./plan');
const { todayIn } = require('./dates');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const mode = SUPABASE_URL ? 'supabase' : 'file';

const DATA_DIR = process.env.STRIDE_DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'store.json');

const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function freshState() {
  const profile = defaultProfile(todayIn('Asia/Calcutta'));
  return { profile, plan: generatePlan(profile), runs: [], chat: [], changelog: [] };
}

function trim(state) {
  if (state.chat.length > 200) state.chat = state.chat.slice(-200);
  if (state.changelog.length > 300) state.changelog = state.changelog.slice(-300);
  return state;
}

/* ---------------- file mode ---------------- */
let cache = null;
function loadFile() {
  if (cache) return cache;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(FILE)) cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  else { cache = freshState(); saveFile(cache); }
  return cache;
}
function saveFile(state) {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(trim(state), null, 2));
  fs.renameSync(tmp, FILE); // atomic on the same filesystem
}

/* ---------------- supabase mode ---------------- */
function sbHeaders(token, extra) {
  return Object.assign({ apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, extra || {});
}

// Verifies the access token with Supabase and returns { id, email }, or null.
async function verifyToken(token) {
  if (!token) return null;
  const r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? { id: u.id, email: (u.email || '').toLowerCase() } : null;
}

async function loadSupabase(ctx) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/stride_state?select=data&limit=1', { headers: sbHeaders(ctx.token) });
  if (!r.ok) throw new Error('Supabase read failed (' + r.status + '). Did you run supabase/schema.sql? ' + (await r.text()).slice(0, 200));
  const rows = await r.json();
  if (rows.length) return rows[0].data;
  const state = freshState();
  await saveSupabase(state, ctx);
  return state;
}

async function saveSupabase(state, ctx) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/stride_state?on_conflict=user_id', {
    method: 'POST',
    headers: sbHeaders(ctx.token, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ user_id: ctx.user.id, data: trim(state), updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error('Supabase save failed (' + r.status + '): ' + (await r.text()).slice(0, 200));
}

/* ---------------- public API ---------------- */
async function load(ctx) { return mode === 'supabase' ? loadSupabase(ctx) : loadFile(); }
async function save(state, ctx) { return mode === 'supabase' ? saveSupabase(state, ctx) : saveFile(state); }

module.exports = { mode, load, save, uid, verifyToken, config: { url: SUPABASE_URL, key: SUPABASE_KEY } };
