// Vercel entry point: every /api/* request is rewritten here (see vercel.json) and handled by the Express app.
require('dotenv').config();
module.exports = require('../server/app');
