const express   = require('express');
const router    = express.Router();
const db        = require('../db/database');
const axios     = require('axios');
const cheerio   = require('cheerio');
const Anthropic = require('@anthropic-ai/sdk');

// ── GET /api/recipes ──────────────────────────────────────────────────────────
// Query params: saved=0|1, category=string, q=search string
router.get('/', (req, res) => {
  const { saved, category, q } = req.query;
  let sql = 'SELECT * FROM recipes WHERE 1=1';
  const params = [];
  if (saved !== undefined) { sql += ' AND is_saved = ?'; params.push(Number(saved)); }
  if (category)            { sql += ' AND category = ?'; params.push(category); }
  if (q) {
    sql += ' AND (title LIKE ? OR description LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  sql += ' ORDER BY created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

// ── GET /api/recipes/:id ──────────────────────────────────────────────────────
// Returns the recipe with its ingredients and instructions joined in.
router.get('/:id', (req, res) => {
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Not found' });
  recipe.ingredients  = db.prepare('SELECT * FROM ingredients  WHERE recipe_id = ? ORDER BY sort_order').all(req.params.id);
  recipe.instructions = db.prepare('SELECT * FROM instructions WHERE recipe_id = ? ORDER BY step_num').all(req.params.id);
  res.json(recipe);
});

// ── POST /api/recipes ─────────────────────────────────────────────────────────
// Creates a recipe with its ingredients and instructions in a single transaction
// so a partial failure never leaves orphaned rows.
router.post('/', (req, res) => {
  const {
    title, description, image_url, source_url, source_name,
    prep_time, cook_time, servings, difficulty, category,
    ingredients = [], instructions = [],
  } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  const insert = db.transaction(() => {
    const r = db.prepare(`
      INSERT INTO recipes (title,description,image_url,source_url,source_name,
                           prep_time,cook_time,servings,difficulty,category)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(title, description, image_url, source_url, source_name,
           prep_time || 0, cook_time || 0, servings || 4, difficulty || 'Easy', category || 'Other');

    ingredients.forEach((ing, i) => {
      db.prepare('INSERT INTO ingredients (recipe_id,amount,unit,name,sort_order) VALUES (?,?,?,?,?)')
        .run(r.lastInsertRowid, ing.amount || '', ing.unit || '', ing.name, i);
    });
    instructions.forEach((ins, i) => {
      // Accept either { body: string } objects or raw strings
      db.prepare('INSERT INTO instructions (recipe_id,step_num,body) VALUES (?,?,?)')
        .run(r.lastInsertRowid, i + 1, ins.body || ins);
    });
    return r.lastInsertRowid;
  });

  const id = insert();
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id);
  recipe.ingredients  = db.prepare('SELECT * FROM ingredients  WHERE recipe_id = ? ORDER BY sort_order').all(id);
  recipe.instructions = db.prepare('SELECT * FROM instructions WHERE recipe_id = ? ORDER BY step_num').all(id);
  res.status(201).json(recipe);
});

// ── PATCH /api/recipes/:id ────────────────────────────────────────────────────
// Partial update — only fields present in the request body are changed.
// Used both for simple field toggles (is_saved) and full recipe edits.
//
// When `ingredients` or `instructions` arrays are included, the existing rows
// are deleted and replaced in the same transaction so the lists are always
// consistent (no stale rows left behind after an edit).
router.patch('/:id', (req, res) => {
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Not found' });

  const { ingredients, instructions, ...fields } = req.body;

  const run = db.transaction(() => {
    // ── Simple field update ───────────────────────────────────────────────────
    const allowed = ['title','description','image_url','prep_time','cook_time','servings','difficulty','category','is_saved'];
    const updates = [];
    const params  = [];
    allowed.forEach(f => {
      if (fields[f] !== undefined) { updates.push(`${f} = ?`); params.push(fields[f]); }
    });
    if (updates.length) {
      params.push(req.params.id);
      db.prepare(`UPDATE recipes SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    // ── Ingredient replacement ────────────────────────────────────────────────
    // When ingredients are supplied, wipe the existing list and insert the new
    // one. This avoids partial merges and orphaned sort_order gaps.
    if (Array.isArray(ingredients)) {
      db.prepare('DELETE FROM ingredients WHERE recipe_id = ?').run(req.params.id);
      const ins = db.prepare(
        'INSERT INTO ingredients (recipe_id, amount, unit, name, sort_order) VALUES (?,?,?,?,?)'
      );
      ingredients.forEach((ing, i) => {
        ins.run(req.params.id, ing.amount || '', ing.unit || '', ing.name, i);
      });
    }

    // ── Instruction replacement ───────────────────────────────────────────────
    if (Array.isArray(instructions)) {
      db.prepare('DELETE FROM instructions WHERE recipe_id = ?').run(req.params.id);
      const ins = db.prepare(
        'INSERT INTO instructions (recipe_id, step_num, body) VALUES (?,?,?)'
      );
      instructions.forEach((step, i) => {
        ins.run(req.params.id, i + 1, step.body || step);
      });
    }
  });

  run();

  // Return the full recipe with fresh ingredient and instruction lists.
  const updated = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
  updated.ingredients  = db.prepare('SELECT * FROM ingredients  WHERE recipe_id = ? ORDER BY sort_order').all(req.params.id);
  updated.instructions = db.prepare('SELECT * FROM instructions WHERE recipe_id = ? ORDER BY step_num').all(req.params.id);
  res.json(updated);
});

// ── DELETE /api/recipes/:id ───────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM recipes WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ deleted: true });
});

// ── POST /api/recipes/import ──────────────────────────────────────────────────
// Scrapes a URL and returns a pre-filled recipe object for the client to review
// before saving. Does NOT persist to the database.
//
// Three-tier waterfall — each tier is tried only if the previous one yields nothing,
// so LLM tokens are consumed only when structured data is absent from the page:
//
//   Tier 1 — JSON-LD  (<script type="application/ld+json">)   0 tokens, ~80 % coverage
//   Tier 2 — HTML microdata  (itemprop / itemscope attrs)      0 tokens, ~10 % coverage
//   Tier 3 — Claude Haiku on stripped page text               minimal tokens, remaining sites
router.post('/import', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  try {
    const { data: html } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MiseRecipeBot/1.0)' },
      timeout: 10000,
    });
    const $          = cheerio.load(html);
    const sourceName = new URL(url).hostname.replace('www.', '');

    // ── Tier 1: JSON-LD ───────────────────────────────────────────────────────
    const jsonLd = extractJsonLd($);
    if (jsonLd) return res.json(formatJsonLd(jsonLd, url, sourceName));

    // ── Tier 2: HTML microdata ────────────────────────────────────────────────
    const microdata = extractMicrodata($);
    if (microdata) return res.json(formatMicrodata(microdata, url, sourceName));

    // ── Tier 3: Claude Haiku (minimal tokens) ─────────────────────────────────
    // Only reached if the page has no structured recipe data at all.
    const aiResult = await extractWithAI($, url, sourceName);
    return res.json(aiResult);

  } catch (err) {
    res.status(422).json({ error: `Could not fetch recipe: ${err.message}` });
  }
});

module.exports = router;

// ═════════════════════════════════════════════════════════════════════════════
// Import helpers — kept outside the route handler so they are easy to unit-test
// ═════════════════════════════════════════════════════════════════════════════

// ── Shared normalisation helpers ──────────────────────────────────────────────

/** ISO 8601 duration → minutes.  "PT1H30M" → 90, "PT45M" → 45, null → 0. */
function parseDuration(iso) {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  return m ? (parseInt(m[1] || 0) * 60) + parseInt(m[2] || 0) : 0;
}

/**
 * Normalise a single recipeIngredient entry to { amount, unit, name }.
 * JSON-LD allows plain strings, HowToIngredient objects, or arbitrary objects.
 */
function mapIngredient(ing) {
  if (typeof ing === 'string') return { amount: '', unit: '', name: ing.trim() };
  return { amount: ing.amount || '', unit: ing.unit || '', name: ing.name || String(ing) };
}

/**
 * Normalise a single recipeInstructions entry to { body }.
 * JSON-LD allows plain strings, HowToStep objects, or HowToSection objects
 * (which wrap multiple steps) — all flattened to a simple list by the caller.
 */
function mapStep(step) {
  if (typeof step === 'string')       return { body: step.trim() };
  if (step['@type'] === 'HowToStep')  return { body: (step.text || step.name || '').trim() };
  return { body: String(step).trim() };
}

/**
 * Normalise recipeYield which can be a number, "4", "4 servings", or an array.
 * Returns an integer (defaults to 4).
 */
function parseYield(raw) {
  if (!raw) return 4;
  const str = Array.isArray(raw) ? raw[0] : String(raw);
  return parseInt(str) || 4;
}

// ── Tier 1: JSON-LD ───────────────────────────────────────────────────────────

/**
 * Searches all <script type="application/ld+json"> blocks for a schema.org/Recipe
 * object. Returns the raw JSON-LD Recipe object, or null if none found.
 *
 * Handles three common embedding patterns:
 *   • Single object:  { "@type": "Recipe", ... }
 *   • Array:          [{ "@type": "Recipe", ... }]
 *   • @graph wrapper: { "@graph": [{ "@type": "Recipe" }, ...] }
 */
function extractJsonLd($) {
  let found = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (found) return; // short-circuit once a Recipe is found
    try {
      const json = JSON.parse($(el).html());
      const candidate = Array.isArray(json)
        ? json.find(x => x['@type'] === 'Recipe')
        : json['@type'] === 'Recipe'
          ? json
          : json['@graph']?.find(x => x['@type'] === 'Recipe');
      if (candidate) found = candidate;
    } catch {
      // Malformed JSON-LD block — skip and continue.
    }
  });
  return found;
}

/** Converts a raw JSON-LD Recipe object to the API response shape. */
function formatJsonLd(r, url, sourceName) {
  // image can be a string URL, an ImageObject, or an array of either.
  const rawImage = Array.isArray(r.image) ? r.image[0] : r.image;
  const imageUrl = typeof rawImage === 'string' ? rawImage : (rawImage?.url || '');

  return {
    title:        r.name || '',
    description:  r.description || '',
    image_url:    imageUrl,
    source_url:   url,
    source_name:  sourceName,
    prep_time:    parseDuration(r.prepTime),
    cook_time:    parseDuration(r.cookTime),
    servings:     parseYield(r.recipeYield),
    difficulty:   'Medium',
    category:     r.recipeCategory || 'Other',
    ingredients:  (r.recipeIngredient || []).map(mapIngredient),
    // HowToSection groups steps into named sections — flatten to a flat list.
    instructions: (Array.isArray(r.recipeInstructions) ? r.recipeInstructions : [])
      .flatMap(s => s['@type'] === 'HowToSection'
        ? (s.itemListElement || []).map(mapStep)
        : [mapStep(s)])
      .filter(s => s.body),
  };
}

// ── Tier 2: HTML microdata ────────────────────────────────────────────────────

/**
 * Extracts recipe data from HTML microdata attributes (itemscope / itemprop).
 * Many WordPress recipe plugins (WP Recipe Maker, Tasty Recipes, etc.) emit
 * microdata rather than JSON-LD.
 *
 * Returns a normalised recipe object, or null if no Recipe itemtype is found.
 */
function extractMicrodata($) {
  // Both http and https schema.org URLs appear in the wild.
  const container = $('[itemtype*="schema.org/Recipe"]').first();
  if (!container.length) return null;

  const get   = (prop) => container.find(`[itemprop="${prop}"]`).first();
  const text  = (prop) => get(prop).text().trim() || get(prop).attr('content') || '';
  const attr  = (prop, a) => get(prop).attr(a) || '';

  const ingredients  = container.find('[itemprop="recipeIngredient"]')
    .map((_, el) => $(el).text().trim()).get().filter(Boolean);

  // Instructions can live in several itemprop variants depending on the plugin.
  const instructions = container.find('[itemprop="recipeInstructions"], [itemprop="text"]')
    .map((_, el) => $(el).text().trim()).get()
    .filter(s => s.length > 10); // discard tiny strings that are UI labels, not steps

  // If no useful content was found, treat as a miss and fall through to AI.
  if (!ingredients.length && !instructions.length) return null;

  // Image can live in src (img element) or content (link/meta element).
  const imageUrl = attr('image', 'src') || attr('image', 'content') || attr('image', 'href');

  return {
    title:        text('name'),
    description:  text('description'),
    image_url:    imageUrl,
    prep_time:    parseDuration(text('prepTime') || attr('prepTime', 'content') || attr('prepTime', 'datetime')),
    cook_time:    parseDuration(text('cookTime') || attr('cookTime', 'content') || attr('cookTime', 'datetime')),
    servings:     parseYield(text('recipeYield')),
    category:     text('recipeCategory') || 'Other',
    ingredients,
    instructions,
  };
}

/** Converts a microdata object to the API response shape. */
function formatMicrodata(m, url, sourceName) {
  return {
    title:        m.title,
    description:  m.description,
    image_url:    m.image_url,
    source_url:   url,
    source_name:  sourceName,
    prep_time:    m.prep_time,
    cook_time:    m.cook_time,
    servings:     m.servings,
    difficulty:   'Medium',
    category:     m.category,
    ingredients:  m.ingredients.map(s => ({ amount: '', unit: '', name: s })),
    instructions: m.instructions.map(s => ({ body: s })),
  };
}

// ── Tier 3: Claude Haiku (minimal tokens) ─────────────────────────────────────

/**
 * Strips a cheerio document down to plain text from the main content area,
 * removing navigation, headers, footers, sidebars, ads, and scripts so the
 * LLM receives only the recipe-relevant portion of the page.
 *
 * Truncates to MAX_CHARS to cap token usage.
 */
const AI_CONTENT_MAX_CHARS = 6000; // ~1 500 input tokens — enough for any recipe

function stripToContentText($) {
  // Remove elements that are never part of the recipe content.
  $(
    'nav, header, footer, aside, noscript, script, style, ' +
    '[role="navigation"], [role="banner"], [role="contentinfo"], ' +
    '[class*="nav"], [class*="sidebar"], [class*="footer"], [class*="header"], ' +
    '[class*="comment"], [class*="related"], [class*="newsletter"], ' +
    '[class*="cookie"], [class*=" ad"], [id*="sidebar"], [id*="comment"]'
  ).remove();

  // Prefer the most specific content container; fall back to <body>.
  const content =
    $('main, article, [class*="recipe"], [id*="recipe"]').first().text() ||
    $('body').text();

  // Collapse whitespace and trim to the character budget.
  return content.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
    .slice(0, AI_CONTENT_MAX_CHARS);
}

/**
 * JSON schema sent verbatim to the model — no prose, no examples.
 * Keeping it terse minimises prompt tokens while still constraining the output.
 */
const EXTRACTION_SCHEMA = JSON.stringify({
  title: '', description: '',
  prep_time: 0, cook_time: 0, servings: 0,
  difficulty: 'Easy|Medium|Hard', category: '',
  ingredients: [{ amount: '', unit: '', name: '' }],
  instructions: [{ body: '' }],
});

/**
 * Calls Claude Haiku to extract structured recipe data from stripped page text.
 *
 * Token budget (approximate):
 *   System prompt:   ~30 tokens
 *   User message:    ~1 550 tokens (schema ~50 + content ≤1 500)
 *   Response:        ≤900 tokens (max_tokens cap)
 *   ─────────────────────────────────────────
 *   Total per call:  ≤2 480 tokens
 *
 * Haiku is used (not Sonnet/Opus) because structured extraction from clean text
 * is well within its capability and costs ~20× less per token than Opus.
 *
 * Falls back to a metadata-only stub if ANTHROPIC_API_KEY is not set or the
 * call fails, so the import flow always returns something usable.
 */
async function extractWithAI($, url, sourceName) {
  // Metadata extracted before the AI call — used both as the AI fallback
  // and to supplement fields the model might leave empty.
  const metaTitle   = $('h1').first().text().trim() || $('title').text().trim();
  const metaDesc    = $('meta[name="description"]').attr('content') || '';
  const metaImage   = $('meta[property="og:image"]').attr('content') || '';

  const fallback = {
    title: metaTitle, description: metaDesc, image_url: metaImage,
    source_url: url, source_name: sourceName,
    prep_time: 0, cook_time: 0, servings: 4, difficulty: 'Medium', category: 'Other',
    ingredients: [], instructions: [],
  };

  if (!process.env.ANTHROPIC_API_KEY) return fallback;

  try {
    const client  = new Anthropic();
    const content = stripToContentText($);

    const message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 900,
      // Minimal system prompt — just enough to set the output contract.
      system: 'You extract recipe data from web page text. Respond with valid JSON only, no explanation.',
      messages: [{
        role: 'user',
        content:
          `Fill this JSON schema with data from the recipe text below. ` +
          `Use empty string or 0 for unknown fields. Times are in minutes.\n\n` +
          `SCHEMA: ${EXTRACTION_SCHEMA}\n\n` +
          `TEXT:\n${content}`,
      }],
    });

    // Strip any accidental markdown fences before parsing.
    const raw  = message.content[0].text.replace(/```[a-z]*\n?/gi, '').trim();
    const data = JSON.parse(raw);

    return {
      title:        data.title        || metaTitle,
      description:  data.description  || metaDesc,
      image_url:    data.image_url    || metaImage,
      source_url:   url,
      source_name:  sourceName,
      prep_time:    Number(data.prep_time)  || 0,
      cook_time:    Number(data.cook_time)  || 0,
      servings:     Number(data.servings)   || 4,
      difficulty:   ['Easy','Medium','Hard'].includes(data.difficulty) ? data.difficulty : 'Medium',
      category:     data.category     || 'Other',
      ingredients:  (data.ingredients  || []).filter(i => i.name),
      instructions: (data.instructions || []).filter(i => i.body),
    };

  } catch {
    // Parse error or API failure — return the metadata stub so the user
    // can still complete the form manually via Import Preview.
    return fallback;
  }
}
