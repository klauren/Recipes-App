const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { isoWeekStart, isoWeekEnd } = require('../utils');

// ── GET /api/cart?week=YYYY-MM-DD ─────────────────────────────────────────────
// Returns all cart items for the week, plus a `groups` map keyed by category
// so the client can render section headers without doing grouping itself.
router.get('/', (req, res) => {
  const ws = isoWeekStart(req.query.week);
  const items = db.prepare(
    'SELECT * FROM cart_items WHERE week_start = ? ORDER BY category, name'
  ).all(ws);

  const groups = {};
  items.forEach(item => {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  });

  res.json({ weekStart: ws, groups, items });
});

// ── POST /api/cart/generate ───────────────────────────────────────────────────
// Builds the shopping list from all meal plan entries for the requested week.
// Checked items are intentionally preserved so users don't lose progress if
// they regenerate mid-week after adding new meals.
router.post('/generate', (req, res) => {
  const ws = isoWeekStart(req.query.week || req.body.week);
  const we = (() => {
    const d = new Date(ws); d.setDate(d.getDate() + 6);
    return d.toISOString().split('T')[0];
  })();

  // Remove only unchecked items so already-purchased items stay ticked off.
  db.prepare("DELETE FROM cart_items WHERE week_start = ? AND is_checked = 0").run(ws);

  const meals = db.prepare(`
    SELECT mp.recipe_id, mp.servings, r.title
    FROM meal_plans mp JOIN recipes r ON r.id = mp.recipe_id
    WHERE mp.date BETWEEN ? AND ?
  `).all(ws, we);

  // Heuristic keyword mapping — ingredients don't carry a category, so we
  // do a best-effort regex match to group the shopping list into store aisles.
  const categorize = (name) => {
    const n = name.toLowerCase();
    if (/\b(milk|cream|butter|cheese|yogurt|egg)\b/.test(n))                                                                   return 'Dairy';
    if (/\b(chicken|beef|pork|lamb|salmon|fish|shrimp|turkey)\b/.test(n))                                                      return 'Meat & Fish';
    if (/\b(tomato|onion|garlic|pepper|carrot|celery|spinach|basil|herb|lemon|lime|ginger|scallion|cilantro|lettuce|avocado|mushroom|zucchini|broccoli|potato)\b/.test(n)) return 'Produce';
    if (/\b(flour|sugar|rice|pasta|bread|oil|vinegar|salt|sauce|spice|cumin|stock|broth|miso|soy)\b/.test(n))                  return 'Pantry';
    if (/\b(wine|beer|juice|water)\b/.test(n))                                                                                 return 'Drinks';
    return 'Other';
  };

  const insertItem = db.prepare(
    'INSERT INTO cart_items (name, amount, unit, category, week_start, source_recipe) VALUES (?,?,?,?,?,?)'
  );
  const inserted = [];

  const insert = db.transaction(() => {
    meals.forEach(({ recipe_id, title }) => {
      const ings = db.prepare('SELECT * FROM ingredients WHERE recipe_id = ?').all(recipe_id);
      ings.forEach(ing => {
        const cat = categorize(ing.name);
        const info = insertItem.run(ing.name, ing.amount, ing.unit, cat, ws, title);
        inserted.push({
          id: info.lastInsertRowid,
          name: ing.name, amount: ing.amount, unit: ing.unit,
          category: cat, is_checked: 0, week_start: ws, source_recipe: title,
        });
      });
    });
  });
  insert();

  res.json({ weekStart: ws, generated: inserted.length, items: inserted });
});

// ── PATCH /api/cart/:id ───────────────────────────────────────────────────────
// Toggles the is_checked flag (0 / 1) for a single item.
router.patch('/:id', (req, res) => {
  const { is_checked } = req.body;
  db.prepare('UPDATE cart_items SET is_checked = ? WHERE id = ?')
    .run(is_checked ? 1 : 0, req.params.id);
  res.json(db.prepare('SELECT * FROM cart_items WHERE id = ?').get(req.params.id));
});

// ── POST /api/cart ────────────────────────────────────────────────────────────
// Adds a single manually-entered item to the current week's list.
router.post('/', (req, res) => {
  const { name, amount, unit, category, week } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const ws = isoWeekStart(week);
  const info = db.prepare(
    'INSERT INTO cart_items (name,amount,unit,category,week_start) VALUES (?,?,?,?,?)'
  ).run(name, amount || '', unit || '', category || 'Other', ws);
  res.status(201).json(db.prepare('SELECT * FROM cart_items WHERE id = ?').get(info.lastInsertRowid));
});

// ── DELETE /api/cart/:id ──────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM cart_items WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ deleted: true });
});

// ── GET /api/cart/monthly?month=YYYY-MM ──────────────────────────────────────
// Returns all cart items across every week that starts within the given month,
// aggregated into category groups — used by the Cart Monthly view.
router.get('/monthly', (req, res) => {
  const monthStr = req.query.month || new Date().toISOString().slice(0, 7);
  const [year, month] = monthStr.split('-').map(Number);

  // Collect every Monday (week_start) that falls within the calendar month.
  const weekStarts = [];
  const d = new Date(year, month - 1, 1);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // rewind to the Monday on or before the 1st
  const lastDay = new Date(year, month, 0);
  while (d <= lastDay) {
    weekStarts.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 7);
  }

  if (!weekStarts.length) return res.json({ month: monthStr, groups: {}, items: [] });

  const placeholders = weekStarts.map(() => '?').join(',');
  const items = db.prepare(
    `SELECT * FROM cart_items WHERE week_start IN (${placeholders}) ORDER BY category, name`
  ).all(...weekStarts);

  const groups = {};
  items.forEach(item => {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  });

  res.json({
    month: monthStr,
    weekStarts,
    groups,
    items,
    totalItems:   items.length,
    checkedItems: items.filter(i => i.is_checked).length,
    weekCount:    weekStarts.length,
  });
});

// ── DELETE /api/cart?week= ────────────────────────────────────────────────────
// Clears the entire list for the week (checked and unchecked).
router.delete('/', (req, res) => {
  const ws = isoWeekStart(req.query.week);
  const info = db.prepare('DELETE FROM cart_items WHERE week_start = ?').run(ws);
  res.json({ deleted: info.changes });
});

module.exports = router;
