const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { isoWeekStart, isoWeekEnd } = require('../utils');

// ── GET /api/cart?week=YYYY-MM-DD ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  const ws = isoWeekStart(req.query.week);
  const { rows: items } = await db.execute({
    sql: 'SELECT * FROM cart_items WHERE week_start = ? ORDER BY category, name',
    args: [ws],
  });
  const groups = {};
  items.forEach(item => {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  });
  res.json({ weekStart: ws, groups, items });
});

// ── GET /api/cart/monthly?month=YYYY-MM ───────────────────────────────────────
router.get('/monthly', async (req, res) => {
  const monthStr = req.query.month || new Date().toISOString().slice(0, 7);
  const [year, month] = monthStr.split('-').map(Number);

  const weekStarts = [];
  const d = new Date(year, month - 1, 1);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const lastDay = new Date(year, month, 0);
  while (d <= lastDay) {
    weekStarts.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 7);
  }

  if (!weekStarts.length) return res.json({ month: monthStr, groups: {}, items: [] });

  const placeholders = weekStarts.map(() => '?').join(',');
  const { rows: items } = await db.execute({
    sql: `SELECT * FROM cart_items WHERE week_start IN (${placeholders}) ORDER BY category, name`,
    args: weekStarts,
  });

  const groups = {};
  items.forEach(item => {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  });

  res.json({
    month: monthStr, weekStarts, groups, items,
    totalItems:   items.length,
    checkedItems: items.filter(i => i.is_checked).length,
    weekCount:    weekStarts.length,
  });
});

// ── POST /api/cart/generate ───────────────────────────────────────────────────
router.post('/generate', async (req, res) => {
  const ws = isoWeekStart(req.query.week || req.body.week);
  const we = (() => { const d = new Date(ws); d.setDate(d.getDate() + 6); return d.toISOString().split('T')[0]; })();

  const categorize = (name) => {
    const n = name.toLowerCase();
    if (/\b(milk|cream|butter|cheese|yogurt|egg)\b/.test(n))                                                                   return 'Dairy';
    if (/\b(chicken|beef|pork|lamb|salmon|fish|shrimp|turkey)\b/.test(n))                                                      return 'Meat & Fish';
    if (/\b(tomato|onion|garlic|pepper|carrot|celery|spinach|basil|herb|lemon|lime|ginger|scallion|cilantro|lettuce|avocado|mushroom|zucchini|broccoli|potato)\b/.test(n)) return 'Produce';
    if (/\b(flour|sugar|rice|pasta|bread|oil|vinegar|salt|sauce|spice|cumin|stock|broth|miso|soy)\b/.test(n))                  return 'Pantry';
    if (/\b(wine|beer|juice|water)\b/.test(n))                                                                                 return 'Drinks';
    return 'Other';
  };

  const tx = await db.transaction('write');
  try {
    await tx.execute({ sql: 'DELETE FROM cart_items WHERE week_start = ? AND is_checked = 0', args: [ws] });

    const { rows: meals } = await tx.execute({
      sql: `SELECT mp.recipe_id, mp.servings, r.title
            FROM meal_plans mp JOIN recipes r ON r.id = mp.recipe_id
            WHERE mp.date BETWEEN ? AND ?`,
      args: [ws, we],
    });

    const inserted = [];
    for (const meal of meals) {
      const { rows: ings } = await tx.execute({
        sql: 'SELECT * FROM ingredients WHERE recipe_id = ?',
        args: [meal.recipe_id],
      });
      for (const ing of ings) {
        const cat = categorize(ing.name);
        const r = await tx.execute({
          sql: 'INSERT INTO cart_items (name,amount,unit,category,week_start,source_recipe) VALUES (?,?,?,?,?,?)',
          args: [ing.name, ing.amount, ing.unit, cat, ws, meal.title],
        });
        inserted.push({ id: Number(r.lastInsertRowid), name: ing.name, amount: ing.amount, unit: ing.unit, category: cat, is_checked: 0, week_start: ws, source_recipe: meal.title });
      }
    }

    await tx.commit();
    res.json({ weekStart: ws, generated: inserted.length, items: inserted });
  } catch (err) {
    await tx.rollback();
    throw err;
  }
});

// ── POST /api/cart ────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { name, amount, unit, category, week } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const ws = isoWeekStart(week);
  const r = await db.execute({
    sql: 'INSERT INTO cart_items (name,amount,unit,category,week_start) VALUES (?,?,?,?,?)',
    args: [name, amount || '', unit || '', category || 'Other', ws],
  });
  const { rows: [item] } = await db.execute({ sql: 'SELECT * FROM cart_items WHERE id = ?', args: [Number(r.lastInsertRowid)] });
  res.status(201).json(item);
});

// ── PATCH /api/cart/:id ───────────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  const { is_checked } = req.body;
  await db.execute({ sql: 'UPDATE cart_items SET is_checked = ? WHERE id = ?', args: [is_checked ? 1 : 0, req.params.id] });
  const { rows: [item] } = await db.execute({ sql: 'SELECT * FROM cart_items WHERE id = ?', args: [req.params.id] });
  res.json(item);
});

// ── DELETE /api/cart/:id ──────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const r = await db.execute({ sql: 'DELETE FROM cart_items WHERE id = ?', args: [req.params.id] });
  if (!r.rowsAffected) return res.status(404).json({ error: 'Not found' });
  res.json({ deleted: true });
});

// ── DELETE /api/cart?week= ────────────────────────────────────────────────────
router.delete('/', async (req, res) => {
  const ws = isoWeekStart(req.query.week);
  const r = await db.execute({ sql: 'DELETE FROM cart_items WHERE week_start = ?', args: [ws] });
  res.json({ deleted: r.rowsAffected });
});

module.exports = router;
