const express = require('express');
const router = express.Router();
const { db } = require('../db/database');

// ── GET /api/profile ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const [{ rows: [profile] }, { rows: [total] }, { rows: [saved] }, { rows: [meals] }] = await Promise.all([
    db.execute('SELECT * FROM user_profile WHERE id = 1'),
    db.execute('SELECT COUNT(*) as c FROM recipes'),
    db.execute('SELECT COUNT(*) as c FROM recipes WHERE is_saved = 1'),
    db.execute('SELECT COUNT(*) as c FROM meal_plans'),
  ]);
  res.json({ ...profile, totalRecipes: Number(total.c), savedRecipes: Number(saved.c), mealsPlanned: Number(meals.c) });
});

// ── PATCH /api/profile ────────────────────────────────────────────────────────
router.patch('/', async (req, res) => {
  const { name, username } = req.body;
  if (name     !== undefined) await db.execute({ sql: 'UPDATE user_profile SET name     = ? WHERE id = 1', args: [name] });
  if (username !== undefined) await db.execute({ sql: 'UPDATE user_profile SET username = ? WHERE id = 1', args: [username] });
  const { rows: [profile] } = await db.execute('SELECT * FROM user_profile WHERE id = 1');
  res.json(profile);
});

module.exports = router;
