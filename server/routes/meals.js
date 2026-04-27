const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { isoWeekStart, isoWeekEnd } = require('../utils');
const Anthropic = require('@anthropic-ai/sdk');

// ── GET /api/meals?week=YYYY-MM-DD ────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { week } = req.query;
  let sql = `
    SELECT mp.*, r.title, r.image_url, r.prep_time, r.cook_time, r.difficulty, r.category
    FROM meal_plans mp JOIN recipes r ON r.id = mp.recipe_id
  `;
  const args = [];
  if (week) {
    sql += ' WHERE mp.date BETWEEN ? AND ?';
    args.push(isoWeekStart(week), isoWeekEnd(week));
  }
  sql += ' ORDER BY mp.date, mp.meal_type';
  const { rows } = await db.execute({ sql, args });
  res.json(rows);
});

// ── GET /api/meals/grid?week=YYYY-MM-DD ───────────────────────────────────────
router.get('/grid', async (req, res) => {
  const ws = isoWeekStart(req.query.week);
  const we = isoWeekEnd(req.query.week);

  const { rows: meals } = await db.execute({
    sql: `SELECT mp.*, r.title, r.image_url, r.prep_time, r.cook_time, r.difficulty, r.category
          FROM meal_plans mp JOIN recipes r ON r.id = mp.recipe_id
          WHERE mp.date BETWEEN ? AND ?
          ORDER BY mp.date, mp.meal_type`,
    args: [ws, we],
  });

  const byDate = {};
  meals.forEach(m => {
    if (!byDate[m.date]) byDate[m.date] = [];
    byDate[m.date].push(m);
  });

  const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const grid = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ws); d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    return { date: dateStr, dayName: DAY_NAMES[i], meals: byDate[dateStr] || [] };
  });

  res.json({ weekStart: ws, weekEnd: we, days: grid });
});

// ── GET /api/meals/stats?week=YYYY-MM-DD ──────────────────────────────────────
router.get('/stats', async (req, res) => {
  const ws = isoWeekStart(req.query.week);
  const we = isoWeekEnd(req.query.week);
  const [{ rows: [meals] }, { rows: [recipes] }, { rows: [totalTime] }] = await Promise.all([
    db.execute({ sql: 'SELECT COUNT(*) as count FROM meal_plans WHERE date BETWEEN ? AND ?', args: [ws, we] }),
    db.execute({ sql: 'SELECT COUNT(DISTINCT recipe_id) as count FROM meal_plans WHERE date BETWEEN ? AND ?', args: [ws, we] }),
    db.execute({ sql: `SELECT COALESCE(SUM((r.prep_time + r.cook_time) * mp.servings), 0) as mins
                       FROM meal_plans mp JOIN recipes r ON r.id = mp.recipe_id
                       WHERE mp.date BETWEEN ? AND ?`, args: [ws, we] }),
  ]);
  res.json({ mealsPlanned: Number(meals.count), uniqueRecipes: Number(recipes.count), totalCookMins: Number(totalTime.mins) });
});

// ── POST /api/meals ───────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { recipe_id, date, meal_type = 'Dinner', servings = 1 } = req.body;
  if (!recipe_id || !date) return res.status(400).json({ error: 'recipe_id and date required' });

  const r = await db.execute({
    sql: 'INSERT INTO meal_plans (recipe_id,date,meal_type,servings) VALUES (?,?,?,?)',
    args: [recipe_id, date, meal_type, servings],
  });
  const { rows: [meal] } = await db.execute({
    sql: `SELECT mp.*, r.title, r.image_url, r.prep_time, r.cook_time, r.difficulty
          FROM meal_plans mp JOIN recipes r ON r.id = mp.recipe_id WHERE mp.id = ?`,
    args: [Number(r.lastInsertRowid)],
  });
  res.status(201).json(meal);
});

// ── POST /api/meals/generate?week=YYYY-MM-DD ──────────────────────────────────
router.post('/generate', async (req, res) => {
  const ws = isoWeekStart(req.query.week || req.body.week);
  const we = isoWeekEnd(req.query.week || req.body.week);

  const { rows: existing } = await db.execute({
    sql: 'SELECT date, meal_type FROM meal_plans WHERE date BETWEEN ? AND ?',
    args: [ws, we],
  });
  const planned = new Set(existing.map(m => `${m.date}|${m.meal_type}`));

  const { rows: recipes } = await db.execute(
    'SELECT id, title, category, difficulty, prep_time, cook_time, servings FROM recipes WHERE is_saved = 1'
  );
  if (!recipes.length) return res.status(422).json({ error: 'No saved recipes to assign' });

  // Build list of empty slots
  const emptySlots = [];
  const DAY_NAMES = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  for (let i = 0; i < 7; i++) {
    const d = new Date(ws); d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    for (const mt of ['Breakfast','Lunch','Dinner']) {
      if (!planned.has(`${dateStr}|${mt}`)) emptySlots.push({ date: dateStr, dayName: DAY_NAMES[i], meal_type: mt });
    }
  }

  if (!emptySlots.length) return res.json({ weekStart: ws, added: 0 });

  let assignments = [];

  // Try AI suggestions first
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic();
      const recipeList = recipes
        .map(r => `ID:${r.id} "${r.title}" [${r.category}, ${r.difficulty}, ${(r.prep_time || 0) + (r.cook_time || 0)}min]`)
        .join('\n');
      const slotList = emptySlots
        .map(s => `${s.date} (${s.dayName}) ${s.meal_type}`)
        .join('\n');

      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: 'You are a meal planner. Assign recipes to meal slots optimizing for nutritional balance, variety across the week, and appropriate meal timing (lighter breakfasts, heartier dinners). Avoid repeating the same recipe more than twice. Respond with a JSON array only, no explanation.',
        messages: [{
          role: 'user',
          content: `Assign recipe IDs to these empty meal slots:\n${slotList}\n\nAvailable recipes:\n${recipeList}\n\nReturn JSON array: [{"date":"YYYY-MM-DD","meal_type":"Breakfast|Lunch|Dinner","recipe_id":N}]`,
        }],
      });

      const raw = message.content[0].text.replace(/```[a-z]*\n?/gi, '').trim();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const validIds = new Set(recipes.map(r => Number(r.id)));
        assignments = parsed.filter(a => a.date && a.meal_type && validIds.has(Number(a.recipe_id)));
      }
    } catch { /* fall through to random */ }
  }

  // Fallback: random selection
  if (!assignments.length) {
    const pick = () => recipes[Math.floor(Math.random() * recipes.length)];
    assignments = emptySlots.map(slot => ({ date: slot.date, meal_type: slot.meal_type, recipe_id: pick().id }));
  }

  const recipeMap = Object.fromEntries(recipes.map(r => [Number(r.id), r]));
  const statements = assignments.map(a => ({
    sql: 'INSERT INTO meal_plans (recipe_id,date,meal_type,servings) VALUES (?,?,?,?)',
    args: [Number(a.recipe_id), a.date, a.meal_type, recipeMap[Number(a.recipe_id)]?.servings || 2],
  }));

  await db.batch(statements, 'write');
  res.json({ weekStart: ws, added: statements.length });
});

// ── DELETE /api/meals/:id ─────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const r = await db.execute({ sql: 'DELETE FROM meal_plans WHERE id = ?', args: [req.params.id] });
  if (!r.rowsAffected) return res.status(404).json({ error: 'Not found' });
  res.json({ deleted: true });
});

module.exports = router;
