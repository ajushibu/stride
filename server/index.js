require('dotenv').config();
const app = require('./app');
const coach = require('./coach');
const db = require('./store');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Stride running on http://localhost:${PORT}`);
  console.log(`  storage: ${db.mode}${db.mode === 'file' ? ' (data/store.json, no sign-in)' : ''}`);
  console.log(`  AI coach: ${coach.hasKey() ? 'on' : 'OFF - set ANTHROPIC_API_KEY'}`);
});
