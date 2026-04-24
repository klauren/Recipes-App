const { createClient } = require('@libsql/client');
const { isoWeekStart } = require('../utils');

const db = createClient({
  url:       process.env.TURSO_DATABASE_URL ?? 'file:./data/local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS recipes (
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
    is_saved    INTEGER DEFAULT 0,
    created_at  TEXT    DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS ingredients (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    amount     TEXT,
    unit       TEXT,
    name       TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS instructions (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    step_num  INTEGER NOT NULL,
    body      TEXT    NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS meal_plans (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    date       TEXT NOT NULL,
    meal_type  TEXT CHECK(meal_type IN ('Breakfast','Lunch','Dinner','Snack')) DEFAULT 'Dinner',
    servings   INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS cart_items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    amount        TEXT,
    unit          TEXT,
    category      TEXT    DEFAULT 'Other',
    is_checked    INTEGER DEFAULT 0,
    week_start    TEXT NOT NULL,
    source_recipe TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS user_profile (
    id           INTEGER PRIMARY KEY CHECK(id = 1),
    name         TEXT DEFAULT 'Chef',
    username     TEXT DEFAULT '@chef',
    avatar_color TEXT DEFAULT '#7D6B3D'
  )`,
  `INSERT OR IGNORE INTO user_profile (id, name, username) VALUES (1, 'Julia Delgado', '@juliacooks')`,
];

async function initDb() {
  await db.batch(SCHEMA, 'write');
  const { rows } = await db.execute('SELECT COUNT(*) as c FROM recipes');
  if (Number(rows[0].c) === 0) await seedDb();
}

async function ins(sql, args) {
  return Number((await db.execute({ sql, args })).lastInsertRowid);
}

async function seedDb() {
  const id1 = await ins(
    `INSERT INTO recipes (title,description,image_url,source_url,source_name,prep_time,cook_time,servings,difficulty,category,is_saved)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ['Lemon Herb Risotto','Creamy arborio rice with fresh herbs, lemon zest, and aged parmesan',
     'https://images.unsplash.com/photo-1624127558754-7231675940d4?w=800',
     'https://example.com/lemon-risotto','Example Kitchen',20,25,4,'Medium','Dinner',1],
  );
  for (const [i,[a,u,n]] of [['1½ cups','','arborio rice'],['4 cups','','warm chicken broth'],['½ cup','','dry white wine'],['1','','shallot, minced'],['3 cloves','','garlic, minced'],['½ cup','','parmesan, grated'],['2 tbsp','','butter'],['1','','lemon, zested and juiced']].entries())
    await db.execute({ sql:'INSERT INTO ingredients (recipe_id,amount,unit,name,sort_order) VALUES (?,?,?,?,?)', args:[id1,a,u,n,i] });
  for (const [i,b] of ['Toast arborio rice in butter until translucent, about 2 minutes.','Add wine and stir until absorbed. Add warm broth one ladle at a time, stirring constantly.','Fold in parmesan, lemon zest, juice, and fresh herbs. Season to taste.'].entries())
    await db.execute({ sql:'INSERT INTO instructions (recipe_id,step_num,body) VALUES (?,?,?)', args:[id1,i+1,b] });

  const id2 = await ins(
    `INSERT INTO recipes (title,description,image_url,source_url,source_name,prep_time,cook_time,servings,difficulty,category,is_saved)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ['Spiced Lamb Tacos','Slow-braised lamb shoulder with cumin, chipotle, and fresh pico de gallo',
     'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800',
     null,null,30,180,6,'Medium','Lunch',1],
  );
  for (const [i,[a,u,n]] of [['2 lbs','','lamb shoulder'],['1 tbsp','','cumin'],['2','','chipotle peppers in adobo'],['12','','small corn tortillas'],['1 cup','','pico de gallo'],['½ cup','','cotija cheese'],['¼ cup','','fresh cilantro']].entries())
    await db.execute({ sql:'INSERT INTO ingredients (recipe_id,amount,unit,name,sort_order) VALUES (?,?,?,?,?)', args:[id2,a,u,n,i] });
  for (const [i,b] of ['Season lamb with spices and sear until browned on all sides.','Braise with chipotle and beef broth at 325°F for 3 hours until tender.','Shred meat, serve in warm tortillas topped with pico and cotija.'].entries())
    await db.execute({ sql:'INSERT INTO instructions (recipe_id,step_num,body) VALUES (?,?,?)', args:[id2,i+1,b] });

  const id3 = await ins(
    `INSERT INTO recipes (title,description,image_url,source_url,source_name,prep_time,cook_time,servings,difficulty,category,is_saved)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ['Miso Glazed Salmon','Pan-seared salmon fillets with a sweet miso and ginger glaze',
     'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=800',
     null,null,10,15,2,'Easy','Dinner',1],
  );
  for (const [i,[a,u,n]] of [['2','','salmon fillets (6 oz each)'],['3 tbsp','','white miso paste'],['2 tbsp','','mirin'],['1 tbsp','','soy sauce'],['1 tsp','','fresh ginger, grated'],['1 tsp','','sesame oil'],['2 tbsp','','scallions, sliced']].entries())
    await db.execute({ sql:'INSERT INTO ingredients (recipe_id,amount,unit,name,sort_order) VALUES (?,?,?,?,?)', args:[id3,a,u,n,i] });
  for (const [i,b] of ['Whisk miso, mirin, soy sauce, ginger, and sesame oil into glaze.','Coat salmon and marinate 20 minutes. Sear skin-side down 4 minutes.','Flip, brush with more glaze, broil 2 minutes until caramelized.'].entries())
    await db.execute({ sql:'INSERT INTO instructions (recipe_id,step_num,body) VALUES (?,?,?)', args:[id3,i+1,b] });

  await ins(
    `INSERT INTO recipes (title,description,image_url,source_url,source_name,prep_time,cook_time,servings,difficulty,category,is_saved)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ['Roasted Tomato Soup','Oven-roasted plum tomatoes blended with basil and a swirl of cream',
     'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800',
     null,null,15,45,4,'Easy','Lunch',0],
  );

  const ws = isoWeekStart();
  const day = (n) => { const d = new Date(ws); d.setDate(d.getDate()+n); return d.toISOString().split('T')[0]; };
  await db.execute({ sql:'INSERT INTO meal_plans (recipe_id,date,meal_type,servings) VALUES (?,?,?,?)', args:[id1,day(0),'Dinner',2] });
  await db.execute({ sql:'INSERT INTO meal_plans (recipe_id,date,meal_type,servings) VALUES (?,?,?,?)', args:[id3,day(1),'Dinner',2] });
  await db.execute({ sql:'INSERT INTO meal_plans (recipe_id,date,meal_type,servings) VALUES (?,?,?,?)', args:[id2,day(2),'Lunch',4]  });
}

module.exports = { db, initDb };
