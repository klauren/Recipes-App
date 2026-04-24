require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// IMPORTANT: /api/recipes/import must be mounted before /api/recipes, otherwise
// Express matches the literal string "import" as the :id param in GET /api/recipes/:id.
app.use('/api/recipes/import', require('./routes/recipes'));
app.use('/api/recipes',        require('./routes/recipes'));
app.use('/api/meals',          require('./routes/meals'));
app.use('/api/cart',           require('./routes/cart'));
app.use('/api/profile',        require('./routes/profile'));

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

initDb()
  .then(() => app.listen(PORT, () => console.log(`Mise API running on http://localhost:${PORT}`)))
  .catch(err => { console.error('DB init failed:', err); process.exit(1); });
