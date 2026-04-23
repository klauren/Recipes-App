const express = require('express');
const router = express.Router();
const db = require('../db/database');

// ── GET /api/profile ──────────────────────────────────────────────────────────
// Returns the single user profile row augmented with live counts so the
// Profile screen doesn't need separate requests for each stat.
router.get('/', (req, res) => {
  const profile      = db.prepare('SELECT * FROM user_profile WHERE id = 1').get();
  const totalRecipes = db.prepare('SELECT COUNT(*) as c FROM recipes').get().c;
  const savedRecipes = db.prepare('SELECT COUNT(*) as c FROM recipes WHERE is_saved = 1').get().c;
  const mealsPlanned = db.prepare('SELECT COUNT(*) as c FROM meal_plans').get().c;
  res.json({ ...profile, totalRecipes, savedRecipes, mealsPlanned });
});

// ── PATCH /api/profile ────────────────────────────────────────────────────────
// Updates only the fields provided; other fields are left unchanged.
router.patch('/', (req, res) => {
  const { name, username } = req.body;
  if (name     !== undefined) db.prepare('UPDATE user_profile SET name     = ? WHERE id = 1').run(name);
  if (username !== undefined) db.prepare('UPDATE user_profile SET username = ? WHERE id = 1').run(username);
  res.json(db.prepare('SELECT * FROM user_profile WHERE id = 1').get());
});

module.exports = router;
