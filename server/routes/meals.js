const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { isoWeekStart, isoWeekEnd } = require('../utils');

const MEAL_TYPE_ORDER = { Breakfast: 0, Lunch: 1, Dinner: 2, Snack: 3 };

// ── GET /api/meals?week=YYYY-MM-DD ────────────────────────────────────────────
// Returns meals joined with recipe data. Pass any date in the desired week;
// omit the param to get all meals across all weeks.
router.get('/', (req, res) => {
  const { week } = req.query;

  let sql = `
    SELECT mp.*, r.title, r.image_url, r.prep_time, r.cook_time, r.difficulty, r.category
    FROM meal_plans mp
    JOIN recipes r ON r.id = mp.recipe_id
  `;
  const params = [];

  if (week) {
    sql += ' WHERE mp.date BETWEEN ? AND ?';
    params.push(isoWeekStart(week), isoWeekEnd(week));
  }

  sql += ' ORDER BY mp.date, mp.meal_type';
  res.json(db.prepare(sql).all(...params));
});

// ── GET /api/meals/grid?week=YYYY-MM-DD ───────────────────────────────────────
// Returns a 7-element array (Mon–Sun) each with a `date`, `dayName`, and
// `meals` array — structured for the Menu Builder's calendar view.
router.get('/grid', (req, res) => {
  const ws = isoWeekStart(req.query.week);
  const we = isoWeekEnd(req.query.week);

  const meals = db.prepare(`
    SELECT mp.*, r.title, r.image_url, r.prep_time, r.cook_time, r.difficulty, r.category
    FROM meal_plans mp JOIN recipes r ON r.id = mp.recipe_id
    WHERE mp.date BETWEEN ? AND ?
    ORDER BY mp.date, mp.meal_type
  `).all(ws, we);

  // Build a day-keyed map then output as an ordered array Mon → Sun.
  const byDate = {};
  meals.forEach(m => {
    if (!byDate[m.date]) byDate[m.date] = [];
    byDate[m.date].push(m);
  });

  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const grid = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ws); d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    return { date: dateStr, dayName: DAY_NAMES[i], meals: byDate[dateStr] || [] };
  });

  res.json({ weekStart: ws, weekEnd: we, days: grid });
});

// ── POST /api/meals ───────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { recipe_id, date, meal_type = 'Dinner', servings = 1 } = req.body;
  if (!recipe_id || !date) return res.status(400).json({ error: 'recipe_id and date required' });

  const info = db.prepare(
    'INSERT INTO meal_plans (recipe_id,date,meal_type,servings) VALUES (?,?,?,?)'
  ).run(recipe_id, date, meal_type, servings);

  const meal = db.prepare(`
    SELECT mp.*, r.title, r.image_url, r.prep_time, r.cook_time, r.difficulty
    FROM meal_plans mp JOIN recipes r ON r.id = mp.recipe_id WHERE mp.id = ?
  `).get(info.lastInsertRowid);

  res.status(201).json(meal);
});

// ── DELETE /api/meals/:id ─────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM meal_plans WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ deleted: true });
});

// ── POST /api/meals/generate?week=YYYY-MM-DD ──────────────────────────────────
// Auto-fills empty Breakfast / Lunch / Dinner slots for the week by randomly
// sampling from saved recipes. Existing meals are never overwritten.
router.post('/generate', (req, res) => {
  const ws = isoWeekStart(req.query.week || req.body.week);
  const we = isoWeekEnd(req.query.week || req.body.week);

  const existing = db.prepare(
    'SELECT date, meal_type FROM meal_plans WHERE date BETWEEN ? AND ?'
  ).all(ws, we);

  // Build a set of already-planned slots so we only fill gaps.
  const planned = new Set(existing.map(m => `${m.date}|${m.meal_type}`));

  const recipes = db.prepare('SELECT id, servings FROM recipes WHERE is_saved = 1').all();
  if (!recipes.length) return res.status(422).json({ error: 'No saved recipes to assign' });

  const pick = () => recipes[Math.floor(Math.random() * recipes.length)];

  const insert = db.prepare('INSERT INTO meal_plans (recipe_id,date,meal_type,servings) VALUES (?,?,?,?)');
  const added = [];

  const run = db.transaction(() => {
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws); d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      for (const mt of ['Breakfast', 'Lunch', 'Dinner']) {
        if (!planned.has(`${dateStr}|${mt}`)) {
          const r = pick();
          const info = insert.run(r.id, dateStr, mt, r.servings || 2);
          added.push(info.lastInsertRowid);
        }
      }
    }
  });
  run();

  res.json({ weekStart: ws, added: added.length });
});

// ── GET /api/meals/stats?week=YYYY-MM-DD ──────────────────────────────────────
// Aggregated stats for the Home screen's "This Week's Plan" summary cards.
// totalCookMins is weighted by servings so multi-serving meals count proportionally.
router.get('/stats', (req, res) => {
  const ws = isoWeekStart(req.query.week);
  const we = isoWeekEnd(req.query.week);

  const meals = db.prepare(
    'SELECT COUNT(*) as count FROM meal_plans WHERE date BETWEEN ? AND ?'
  ).get(ws, we);

  const recipes = db.prepare(
    'SELECT COUNT(DISTINCT recipe_id) as count FROM meal_plans WHERE date BETWEEN ? AND ?'
  ).get(ws, we);

  const totalTime = db.prepare(`
    SELECT COALESCE(SUM((r.prep_time + r.cook_time) * mp.servings), 0) as mins
    FROM meal_plans mp JOIN recipes r ON r.id = mp.recipe_id
    WHERE mp.date BETWEEN ? AND ?
  `).get(ws, we);

  res.json({
    mealsPlanned:  meals.count,
    uniqueRecipes: recipes.count,
    totalCookMins: totalTime.mins,
  });
});

module.exports = router;
