const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { isoWeekStart, isoWeekEnd } = require('../utils');
const Anthropic = require('@anthropic-ai/sdk');

const VALID_CATEGORIES = ['Produce', 'Dairy', 'Meat & Fish', 'Bakery', 'Pantry', 'Drinks', 'Other'];

// Regex fallback categorizer used when AI is unavailable
function categorizeFallback(name) {
  const n = name.toLowerCase();
  if (/\b(milk|cream|butter|cheese|yogurt|egg)\b/.test(n))                                                                   return 'Dairy';
  if (/\b(chicken|beef|pork|lamb|salmon|tuna|fish|shrimp|turkey|bacon|sausage)\b/.test(n))                                   return 'Meat & Fish';
  if (/\b(tomato|onion|garlic|pepper|carrot|celery|spinach|basil|herb|lemon|lime|ginger|scallion|cilantro|lettuce|avocado|mushroom|zucchini|broccoli|potato|kale|parsley|thyme|rosemary|mint|dill)\b/.test(n)) return 'Produce';
  if (/\b(flour|sugar|rice|pasta|bread|oil|vinegar|salt|sauce|spice|cumin|stock|broth|miso|soy|honey|maple|vanilla|baking|cocoa)\b/.test(n)) return 'Pantry';
  if (/\b(wine|beer|juice|water|broth|stock)\b/.test(n))                                                                     return 'Drinks';
  if (/\b(bread|roll|bagel|croissant|bun)\b/.test(n))                                                                        return 'Bakery';
  return 'Other';
}

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

  // Collect all ingredients from this week's meal plan (read-only phase, no transaction yet)
  const { rows: meals } = await db.execute({
    sql: `SELECT mp.recipe_id, mp.servings, r.title
          FROM meal_plans mp JOIN recipes r ON r.id = mp.recipe_id
          WHERE mp.date BETWEEN ? AND ?`,
    args: [ws, we],
  });

  const rawIngredients = [];
  for (const meal of meals) {
    const { rows: ings } = await db.execute({
      sql: 'SELECT * FROM ingredients WHERE recipe_id = ?',
      args: [meal.recipe_id],
    });
    for (const ing of ings) {
      rawIngredients.push({ name: ing.name, amount: ing.amount || '', unit: ing.unit || '', source: meal.title });
    }
  }

  // Run AI DEDUPE + CATEGORIZE if available
  let processedItems = null;
  if (rawIngredients.length > 0 && process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic();
      const ingList = rawIngredients
        .map((i, idx) => `${idx + 1}. ${i.amount} ${i.unit} ${i.name} (from: ${i.source})`.trim())
        .join('\n');

      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        system: `You are a smart grocery list processor. Given a raw ingredient list from multiple recipes:
1. DEDUPLICATE: Merge ingredients that refer to the same thing (e.g. "garlic" and "minced garlic" → "garlic"; "cilantro" and "coriander" → "cilantro/coriander"). Sum quantities where possible, otherwise use the larger quantity or list both.
2. CATEGORIZE: Assign each merged ingredient to exactly one of these store sections: ${VALID_CATEGORIES.join(', ')}.
Respond with valid JSON only, no explanation.`,
        messages: [{
          role: 'user',
          content: `Process this ingredient list:\n${ingList}\n\nReturn JSON array: [{"name":"ingredient name","amount":"combined amount","unit":"unit","category":"one of the valid categories","source_recipe":"recipe name or multiple names"}]`,
        }],
      });

      const raw = message.content[0].text.replace(/```[a-z]*\n?/gi, '').trim();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        processedItems = parsed
          .filter(i => i.name)
          .map(i => ({
            name:          String(i.name).trim(),
            amount:        String(i.amount || '').trim(),
            unit:          String(i.unit   || '').trim(),
            category:      VALID_CATEGORIES.includes(i.category) ? i.category : categorizeFallback(i.name),
            source_recipe: String(i.source_recipe || '').trim(),
          }));
      }
    } catch { /* fall through to regex fallback */ }
  }

  // Fallback: regex categorize, no deduplication
  if (!processedItems) {
    processedItems = rawIngredients.map(i => ({
      name:          i.name,
      amount:        i.amount,
      unit:          i.unit,
      category:      categorizeFallback(i.name),
      source_recipe: i.source,
    }));
  }

  // Write phase: clear unchecked items, insert processed list
  const tx = await db.transaction('write');
  try {
    await tx.execute({ sql: 'DELETE FROM cart_items WHERE week_start = ? AND is_checked = 0', args: [ws] });

    const inserted = [];
    for (const item of processedItems) {
      const r = await tx.execute({
        sql: 'INSERT INTO cart_items (name,amount,unit,category,week_start,source_recipe) VALUES (?,?,?,?,?,?)',
        args: [item.name, item.amount, item.unit, item.category, ws, item.source_recipe],
      });
      inserted.push({
        id: Number(r.lastInsertRowid),
        name: item.name, amount: item.amount, unit: item.unit,
        category: item.category, is_checked: 0, week_start: ws, source_recipe: item.source_recipe,
      });
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
