const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { isoWeekStart } = require('../utils');

const DB_DIR = path.join(__dirname, '../data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, 'mise.db'));

// WAL mode allows concurrent reads during writes, which matters once the
// Express server handles multiple simultaneous requests.
db.pragma('journal_mode = WAL');
// SQLite disables foreign key enforcement by default; this must be set per connection.
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS recipes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    description TEXT,
    image_url   TEXT,
    source_url  TEXT,
    source_name TEXT,
    prep_time   INTEGER,
    cook_time   INTEGER,
    servings    INTEGER DEFAULT 4,
    difficulty  TEXT    CHECK(difficulty IN ('Easy','Medium','Hard')) DEFAULT 'Easy',
    category    TEXT,
    -- SQLite has no BOOLEAN type; 0 = unsaved, 1 = saved
    is_saved    INTEGER DEFAULT 0,
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ingredients (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    amount     TEXT,
    unit       TEXT,
    name       TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS instructions (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    step_num  INTEGER NOT NULL,
    body      TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS meal_plans (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    -- date stored as ISO 8601 text (YYYY-MM-DD) for portable BETWEEN range queries
    date       TEXT NOT NULL,
    meal_type  TEXT CHECK(meal_type IN ('Breakfast','Lunch','Dinner','Snack')) DEFAULT 'Dinner',
    servings   INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cart_items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    amount        TEXT,
    unit          TEXT,
    category      TEXT    DEFAULT 'Other',
    is_checked    INTEGER DEFAULT 0,
    -- week_start scopes items to a single week so lists don't bleed across weeks
    week_start    TEXT NOT NULL,
    source_recipe TEXT
  );

  -- Singleton table: the CHECK constraint on id ensures only one profile row ever exists.
  CREATE TABLE IF NOT EXISTS user_profile (
    id           INTEGER PRIMARY KEY CHECK(id = 1),
    name         TEXT DEFAULT 'Chef',
    username     TEXT DEFAULT '@chef',
    avatar_color TEXT DEFAULT '#7D6B3D'
  );

  INSERT OR IGNORE INTO user_profile (id, name, username) VALUES (1, 'Julia Delgado', '@juliacooks');
`);

// ── Demo seed ────────────────────────────────────────────────────────────────
// Only runs when the database is empty (fresh install).

const count = db.prepare('SELECT COUNT(*) as c FROM recipes').get();
if (count.c === 0) {
  const insertRecipe = db.prepare(`
    INSERT INTO recipes (title, description, image_url, source_url, source_name,
                         prep_time, cook_time, servings, difficulty, category, is_saved)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertIngredient = db.prepare(
    'INSERT INTO ingredients (recipe_id, amount, unit, name, sort_order) VALUES (?, ?, ?, ?, ?)'
  );
  const insertInstruction = db.prepare(
    'INSERT INTO instructions (recipe_id, step_num, body) VALUES (?, ?, ?)'
  );

  const seed = db.transaction(() => {
    const r1 = insertRecipe.run(
      'Lemon Herb Risotto',
      'Creamy arborio rice with fresh herbs, lemon zest, and aged parmesan',
      'https://images.unsplash.com/photo-1624127558754-7231675940d4?w=800',
      'https://example.com/lemon-risotto', 'Example Kitchen',
      20, 25, 4, 'Medium', 'Dinner', 1
    );
    [
      ['1½ cups', '', 'arborio rice'],
      ['4 cups',  '', 'warm chicken broth'],
      ['½ cup',   '', 'dry white wine'],
      ['1',       '', 'shallot, minced'],
      ['3 cloves','', 'garlic, minced'],
      ['½ cup',   '', 'parmesan, grated'],
      ['2 tbsp',  '', 'butter'],
      ['1',       '', 'lemon, zested and juiced'],
    ].forEach(([a, u, n], i) => insertIngredient.run(r1.lastInsertRowid, a, u, n, i));
    [
      'Toast arborio rice in butter until translucent, about 2 minutes.',
      'Add wine and stir until absorbed. Add warm broth one ladle at a time, stirring constantly.',
      'Fold in parmesan, lemon zest, juice, and fresh herbs. Season to taste.',
    ].forEach((b, i) => insertInstruction.run(r1.lastInsertRowid, i + 1, b));

    const r2 = insertRecipe.run(
      'Spiced Lamb Tacos',
      'Slow-braised lamb shoulder with cumin, chipotle, and fresh pico de gallo',
      'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800',
      null, null,
      30, 180, 6, 'Medium', 'Lunch', 1
    );
    [
      ['2 lbs', '', 'lamb shoulder'],
      ['1 tbsp', '', 'cumin'],
      ['2', '', 'chipotle peppers in adobo'],
      ['12', '', 'small corn tortillas'],
      ['1 cup', '', 'pico de gallo'],
      ['½ cup', '', 'cotija cheese'],
      ['¼ cup', '', 'fresh cilantro'],
    ].forEach(([a, u, n], i) => insertIngredient.run(r2.lastInsertRowid, a, u, n, i));
    [
      'Season lamb with spices and sear until browned on all sides.',
      'Braise with chipotle and beef broth at 325°F for 3 hours until tender.',
      'Shred meat, serve in warm tortillas topped with pico and cotija.',
    ].forEach((b, i) => insertInstruction.run(r2.lastInsertRowid, i + 1, b));

    const r3 = insertRecipe.run(
      'Miso Glazed Salmon',
      'Pan-seared salmon fillets with a sweet miso and ginger glaze',
      'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=800',
      null, null,
      10, 15, 2, 'Easy', 'Dinner', 1
    );
    [
      ['2', '', 'salmon fillets (6 oz each)'],
      ['3 tbsp', '', 'white miso paste'],
      ['2 tbsp', '', 'mirin'],
      ['1 tbsp', '', 'soy sauce'],
      ['1 tsp', '', 'fresh ginger, grated'],
      ['1 tsp', '', 'sesame oil'],
      ['2 tbsp', '', 'scallions, sliced'],
    ].forEach(([a, u, n], i) => insertIngredient.run(r3.lastInsertRowid, a, u, n, i));
    [
      'Whisk miso, mirin, soy sauce, ginger, and sesame oil into glaze.',
      'Coat salmon and marinate 20 minutes. Sear skin-side down 4 minutes.',
      'Flip, brush with more glaze, broil 2 minutes until caramelized.',
    ].forEach((b, i) => insertInstruction.run(r3.lastInsertRowid, i + 1, b));

    const r4 = insertRecipe.run(
      'Roasted Tomato Soup',
      'Oven-roasted plum tomatoes blended with basil and a swirl of cream',
      'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800',
      null, null,
      15, 45, 4, 'Easy', 'Lunch', 0
    );
    [
      ['2 lbs',  '', 'plum tomatoes, halved'],
      ['1 head', '', 'garlic'],
      ['1 large','', 'yellow onion'],
      ['2 cups', '', 'vegetable broth'],
      ['¼ cup',  '', 'fresh basil'],
      ['¼ cup',  '', 'heavy cream'],
      ['2 tbsp', '', 'olive oil'],
    ].forEach(([a, u, n], i) => insertIngredient.run(r4.lastInsertRowid, a, u, n, i));
    [
      'Toss tomatoes, garlic, and onion with olive oil. Roast at 400°F for 40 minutes.',
      'Blend roasted veg with broth until smooth. Season well.',
      'Swirl in cream and fresh basil before serving.',
    ].forEach((b, i) => insertInstruction.run(r4.lastInsertRowid, i + 1, b));

    // Seed meal plans for the current week so the Home screen has data on first launch.
    const ws = isoWeekStart();
    const dayOffset = (n) => {
      const d = new Date(ws); d.setDate(d.getDate() + n);
      return d.toISOString().split('T')[0];
    };
    const addMeal = db.prepare('INSERT INTO meal_plans (recipe_id,date,meal_type,servings) VALUES (?,?,?,?)');
    addMeal.run(r1.lastInsertRowid, dayOffset(0), 'Dinner', 2); // Monday
    addMeal.run(r3.lastInsertRowid, dayOffset(1), 'Dinner', 2); // Tuesday
    addMeal.run(r2.lastInsertRowid, dayOffset(2), 'Lunch',  4); // Wednesday
  });

  seed();
}

module.exports = db;
