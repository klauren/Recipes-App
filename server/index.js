require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check is DB-independent — always responds so Vercel can verify the function is alive.
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Kick off DB init eagerly (once per cold start). All routes below wait for it.
const dbReady = initDb().catch(err => { console.error('DB init failed:', err); return Promise.reject(err); });

// Gate every non-health request behind DB readiness.
app.use(async (_req, res, next) => {
  try { await dbReady; next(); }
  catch { res.status(503).json({ error: 'Database unavailable — check TURSO env vars.' }); }
});

app.use('/api/recipes', require('./routes/recipes'));
app.use('/api/meals',          require('./routes/meals'));
app.use('/api/cart',           require('./routes/cart'));
app.use('/api/profile',        require('./routes/profile'));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

// Export the app for Vercel's @vercel/node serverless handler.
module.exports = app;

// Only bind a port when run directly (local dev).
if (require.main === module) {
  dbReady.then(() => app.listen(PORT, () => console.log(`Mise API running on http://localhost:${PORT}`))).catch(() => process.exit(1));
}
