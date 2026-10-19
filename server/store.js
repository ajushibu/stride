// Tiny JSON-file store. Single user, so no database needed.
const fs = require('fs');
const path = require('path');
const { generatePlan, defaultProfile } = require('./plan');
const { todayIn } = require('./dates');

const DATA_DIR = process.env.STRIDE_DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'store.json');

let cache = null;

function load() {
  if (cache) return cache;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(FILE)) {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } else {
    const profile = defaultProfile(todayIn('Asia/Calcutta'));
    cache = { profile, plan: generatePlan(profile), runs: [], chat: [], changelog: [] };
    save();
  }
  return cache;
}

function save() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, FILE); // atomic on the same filesystem
}

const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

module.exports = { load, save, uid };
