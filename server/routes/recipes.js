const express   = require('express');
const router    = express.Router();
const { db }    = require('../db/database');
const axios     = require('axios');
const cheerio   = require('cheerio');
const Anthropic = require('@anthropic-ai/sdk');

// ── GET /api/recipes ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { saved, category, q } = req.query;
  let sql = 'SELECT * FROM recipes WHERE 1=1';
  const args = [];
  if (saved !== undefined) { sql += ' AND is_saved = ?';                           args.push(Number(saved)); }
  if (category)            { sql += ' AND category = ?';                            args.push(category); }
  if (q) {
    sql += ' AND (title LIKE ? OR description LIKE ?)';
    args.push(`%${q}%`, `%${q}%`);
  }
  sql += ' ORDER BY created_at DESC';
  const { rows } = await db.execute({ sql, args });
  res.json(rows);
});

// ── GET /api/recipes/:id ──────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const { rows: [recipe] } = await db.execute({ sql: 'SELECT * FROM recipes WHERE id = ?', args: [req.params.id] });
  if (!recipe) return res.status(404).json({ error: 'Not found' });
  const [{ rows: ingredients }, { rows: instructions }] = await Promise.all([
    db.execute({ sql: 'SELECT * FROM ingredients  WHERE recipe_id = ? ORDER BY sort_order', args: [req.params.id] }),
    db.execute({ sql: 'SELECT * FROM instructions WHERE recipe_id = ? ORDER BY step_num',   args: [req.params.id] }),
  ]);
  res.json({ ...recipe, ingredients, instructions });
});

// ── POST /api/recipes ─────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { title, description, image_url, source_url, source_name,
          prep_time, cook_time, servings, difficulty, category,
          ingredients = [], instructions = [] } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  const tx = await db.transaction('write');
  try {
    const r = await tx.execute({
      sql: `INSERT INTO recipes (title,description,image_url,source_url,source_name,prep_time,cook_time,servings,difficulty,category)
            VALUES (?,?,?,?,?,?,?,?,?,?)`,
      args: [title, description, image_url, source_url, source_name,
             prep_time || 0, cook_time || 0, servings || 4, difficulty || 'Easy', category || 'Other'],
    });
    const id = Number(r.lastInsertRowid);

    for (const [i, ing] of ingredients.entries())
      await tx.execute({ sql: 'INSERT INTO ingredients (recipe_id,amount,unit,name,sort_order) VALUES (?,?,?,?,?)', args: [id, ing.amount||'', ing.unit||'', ing.name, i] });
    for (const [i, ins] of instructions.entries())
      await tx.execute({ sql: 'INSERT INTO instructions (recipe_id,step_num,body) VALUES (?,?,?)', args: [id, i+1, ins.body||ins] });

    await tx.commit();

    const [{ rows: [recipe] }, { rows: ings }, { rows: steps }] = await Promise.all([
      db.execute({ sql: 'SELECT * FROM recipes WHERE id = ?', args: [id] }),
      db.execute({ sql: 'SELECT * FROM ingredients  WHERE recipe_id = ? ORDER BY sort_order', args: [id] }),
      db.execute({ sql: 'SELECT * FROM instructions WHERE recipe_id = ? ORDER BY step_num',   args: [id] }),
    ]);
    res.status(201).json({ ...recipe, ingredients: ings, instructions: steps });
  } catch (err) {
    await tx.rollback();
    throw err;
  }
});

// ── PATCH /api/recipes/:id ────────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  const { rows: [existing] } = await db.execute({ sql: 'SELECT * FROM recipes WHERE id = ?', args: [req.params.id] });
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { ingredients, instructions, ...fields } = req.body;

  const tx = await db.transaction('write');
  try {
    const allowed = ['title','description','image_url','prep_time','cook_time','servings','difficulty','category','is_saved'];
    const updates = [];
    const args    = [];
    allowed.forEach(f => { if (fields[f] !== undefined) { updates.push(`${f} = ?`); args.push(fields[f]); } });
    if (updates.length)
      await tx.execute({ sql: `UPDATE recipes SET ${updates.join(', ')} WHERE id = ?`, args: [...args, req.params.id] });

    if (Array.isArray(ingredients)) {
      await tx.execute({ sql: 'DELETE FROM ingredients WHERE recipe_id = ?', args: [req.params.id] });
      for (const [i, ing] of ingredients.entries())
        await tx.execute({ sql: 'INSERT INTO ingredients (recipe_id,amount,unit,name,sort_order) VALUES (?,?,?,?,?)', args: [req.params.id, ing.amount||'', ing.unit||'', ing.name, i] });
    }
    if (Array.isArray(instructions)) {
      await tx.execute({ sql: 'DELETE FROM instructions WHERE recipe_id = ?', args: [req.params.id] });
      for (const [i, step] of instructions.entries())
        await tx.execute({ sql: 'INSERT INTO instructions (recipe_id,step_num,body) VALUES (?,?,?)', args: [req.params.id, i+1, step.body||step] });
    }

    await tx.commit();

    const [{ rows: [recipe] }, { rows: ings }, { rows: steps }] = await Promise.all([
      db.execute({ sql: 'SELECT * FROM recipes WHERE id = ?', args: [req.params.id] }),
      db.execute({ sql: 'SELECT * FROM ingredients  WHERE recipe_id = ? ORDER BY sort_order', args: [req.params.id] }),
      db.execute({ sql: 'SELECT * FROM instructions WHERE recipe_id = ? ORDER BY step_num',   args: [req.params.id] }),
    ]);
    res.json({ ...recipe, ingredients: ings, instructions: steps });
  } catch (err) {
    await tx.rollback();
    throw err;
  }
});

// ── DELETE /api/recipes/:id ───────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const r = await db.execute({ sql: 'DELETE FROM recipes WHERE id = ?', args: [req.params.id] });
  if (!r.rowsAffected) return res.status(404).json({ error: 'Not found' });
  res.json({ deleted: true });
});

// ── POST /api/recipes/import ──────────────────────────────────────────────────
router.post('/import', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  try {
    const { data: html } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1',
      },
      timeout: 15000,
      maxRedirects: 5,
    });
    const $          = cheerio.load(html);
    const sourceName = new URL(url).hostname.replace('www.', '');
    const jsonLd     = extractJsonLd($);
    if (jsonLd) return res.json(formatJsonLd(jsonLd, url, sourceName));
    const microdata = extractMicrodata($);
    if (microdata) return res.json(formatMicrodata(microdata, url, sourceName));
    return res.json(await extractWithAI($, url, sourceName));
  } catch (err) {
    res.status(422).json({ error: `Could not fetch recipe: ${err.message}` });
  }
});

module.exports = router;

// ═════════════════════════════════════════════════════════════════════════════
// Import helpers
// ═════════════════════════════════════════════════════════════════════════════

function parseDuration(iso) {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  return m ? (parseInt(m[1] || 0) * 60) + parseInt(m[2] || 0) : 0;
}

function mapIngredient(ing) {
  if (typeof ing === 'string') return { amount: '', unit: '', name: ing.trim() };
  return { amount: ing.amount || '', unit: ing.unit || '', name: ing.name || String(ing) };
}

function mapStep(step) {
  if (typeof step === 'string')       return { body: step.trim() };
  if (step['@type'] === 'HowToStep')  return { body: (step.text || step.name || '').trim() };
  return { body: String(step).trim() };
}

function parseYield(raw) {
  if (!raw) return 4;
  const str = Array.isArray(raw) ? raw[0] : String(raw);
  return parseInt(str) || 4;
}

function isRecipeType(type) {
  if (!type) return false;
  const t = Array.isArray(type) ? type : [type];
  return t.some(v => v === 'Recipe' || String(v).endsWith('/Recipe'));
}

function extractJsonLd($) {
  let found = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (found) return;
    try {
      const json = JSON.parse($(el).html());
      // Normalise to a flat list of nodes covering top-level, arrays, and @graph
      const nodes = Array.isArray(json) ? json : json['@graph'] ? [json, ...json['@graph']] : [json];
      // 1. Direct @type: Recipe (or ["Recipe", ...])
      const direct = nodes.find(x => isRecipeType(x['@type']));
      if (direct) { found = direct; return; }
      // 2. Wrapped in mainEntity (e.g. WebPage → Recipe)
      for (const node of nodes) {
        if (node.mainEntity && isRecipeType(node.mainEntity['@type'])) {
          found = node.mainEntity; return;
        }
      }
    } catch { /* malformed JSON-LD — skip */ }
  });
  return found;
}

function formatJsonLd(r, url, sourceName) {
  const rawImage = Array.isArray(r.image) ? r.image[0] : r.image;
  const imageUrl = typeof rawImage === 'string' ? rawImage : (rawImage?.url || '');
  return {
    title: r.name || '', description: r.description || '', image_url: imageUrl,
    source_url: url, source_name: sourceName,
    prep_time: parseDuration(r.prepTime), cook_time: parseDuration(r.cookTime),
    servings: parseYield(r.recipeYield), difficulty: 'Medium',
    category: r.recipeCategory || 'Other',
    ingredients:  (r.recipeIngredient || []).map(mapIngredient),
    instructions: (() => {
      const raw = r.recipeInstructions;
      if (!raw) return [];
      // Some sites emit a single plain string instead of an array
      if (typeof raw === 'string') return raw.split(/\n+/).map(s => s.trim()).filter(Boolean).map(s => ({ body: s }));
      return (Array.isArray(raw) ? raw : [raw])
        .flatMap(s => s['@type'] === 'HowToSection' ? (s.itemListElement || []).map(mapStep) : [mapStep(s)])
        .filter(s => s.body);
    })(),
  };
}

function extractMicrodata($) {
  const container = $('[itemtype*="schema.org/Recipe"]').first();
  if (!container.length) return null;
  const get  = (prop) => container.find(`[itemprop="${prop}"]`).first();
  const text = (prop) => get(prop).text().trim() || get(prop).attr('content') || '';
  const attr = (prop, a) => get(prop).attr(a) || '';
  const ingredients  = container.find('[itemprop="recipeIngredient"]').map((_, el) => $(el).text().trim()).get().filter(Boolean);
  const instructions = container.find('[itemprop="recipeInstructions"], [itemprop="text"]').map((_, el) => $(el).text().trim()).get().filter(s => s.length > 10);
  if (!ingredients.length && !instructions.length) return null;
  const imageUrl = attr('image','src') || attr('image','content') || attr('image','href');
  return {
    title: text('name'), description: text('description'), image_url: imageUrl,
    prep_time: parseDuration(text('prepTime') || attr('prepTime','content') || attr('prepTime','datetime')),
    cook_time: parseDuration(text('cookTime') || attr('cookTime','content') || attr('cookTime','datetime')),
    servings: parseYield(text('recipeYield')), category: text('recipeCategory') || 'Other',
    ingredients, instructions,
  };
}

function formatMicrodata(m, url, sourceName) {
  return {
    title: m.title, description: m.description, image_url: m.image_url,
    source_url: url, source_name: sourceName,
    prep_time: m.prep_time, cook_time: m.cook_time, servings: m.servings,
    difficulty: 'Medium', category: m.category,
    ingredients:  m.ingredients.map(s => ({ amount: '', unit: '', name: s })),
    instructions: m.instructions.map(s => ({ body: s })),
  };
}

const AI_CONTENT_MAX_CHARS = 8000;

// ── Platform-specific content extractors ─────────────────────────────────────

/**
 * YouTube embeds `ytInitialPlayerResponse` in a script tag which contains
 * `videoDetails.shortDescription` — the full video description as a JSON string.
 * Targeting that specific field avoids parsing the entire multi-MB ytInitialData blob.
 */
function extractYouTubeDescription($) {
  let description = '';
  $('script').each((_, el) => {
    if (description) return;
    const src = $(el).html() || '';
    if (!src.includes('shortDescription')) return;
    const match = src.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
    if (!match) return;
    try {
      // Re-parse as a JSON string value to correctly handle all escape sequences.
      description = JSON.parse('"' + match[1] + '"');
    } catch {
      description = match[1]
        .replace(/\\n/g, '\n').replace(/\\t/g, '\t')
        .replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
  });
  return description;
}

/**
 * TikTok and Instagram caption text is in og:description (often the full caption)
 * and the title is in og:title. Their page bodies are JavaScript-rendered so
 * standard HTML scraping returns nothing useful.
 */
function extractSocialCaption($) {
  return (
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    ''
  );
}

/**
 * Returns platform-specific recipe content when the URL is a known video/social
 * platform, otherwise returns null so the caller falls back to generic scraping.
 */
function extractPlatformContent($, url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com')) {
      return extractYouTubeDescription($) || null;
    }
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com') ||
        host === 'instagram.com' || host.endsWith('.instagram.com')) {
      return extractSocialCaption($) || null;
    }
  } catch { /* invalid URL */ }
  return null;
}

function stripToContentText($) {
  $('nav,header,footer,aside,noscript,script,style,[role="navigation"],[role="banner"],[role="contentinfo"],[class*="nav"],[class*="sidebar"],[class*="footer"],[class*="header"],[class*="comment"],[class*="related"],[class*="newsletter"],[class*="cookie"],[class*=" ad"],[id*="sidebar"],[id*="comment"]').remove();
  const content = $('main,article,[class*="recipe"],[id*="recipe"]').first().text() || $('body').text();
  return content.replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim().slice(0, AI_CONTENT_MAX_CHARS);
}

const EXTRACTION_SCHEMA = JSON.stringify({
  title:'', description:'', prep_time:0, cook_time:0, servings:0,
  difficulty:'Easy|Medium|Hard', category:'',
  ingredients:[{amount:'',unit:'',name:''}], instructions:[{body:''}],
});

async function extractWithAI($, url, sourceName) {
  const metaTitle = $('meta[property="og:title"]').attr('content') || $('h1').first().text().trim() || $('title').text().trim();
  const metaDesc  = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
  const metaImage = $('meta[property="og:image"]').attr('content') || '';
  const fallback  = { title:metaTitle, description:metaDesc, image_url:metaImage, source_url:url, source_name:sourceName, prep_time:0, cook_time:0, servings:4, difficulty:'Medium', category:'Other', ingredients:[], instructions:[] };
  if (!process.env.ANTHROPIC_API_KEY) return fallback;
  try {
    const client  = new Anthropic();

    // Use platform-specific extraction first; fall back to generic HTML scraping.
    const platformContent = extractPlatformContent($, url);
    const content = platformContent
      ? platformContent.slice(0, AI_CONTENT_MAX_CHARS)
      : stripToContentText($);

    const contentType = platformContent ? 'video description / social caption' : 'web page text';

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 1200,
      system: `You extract recipe data from ${contentType}. The content may be a YouTube video description, TikTok caption, or web page. Extract all ingredients and steps you can find. Respond with valid JSON only, no explanation.`,
      messages: [{ role: 'user', content: `Fill this JSON schema with recipe data from the content below. Use empty string or 0 for unknown fields. Times are in minutes.\n\nSCHEMA: ${EXTRACTION_SCHEMA}\n\nCONTENT:\n${content}` }],
    });
    const raw  = message.content[0].text.replace(/```[a-z]*\n?/gi,'').trim();
    const data = JSON.parse(raw);
    return {
      title:        data.title        || metaTitle,
      description:  data.description  || metaDesc,
      image_url:    data.image_url    || metaImage,
      source_url:   url, source_name: sourceName,
      prep_time:    Number(data.prep_time)  || 0,
      cook_time:    Number(data.cook_time)  || 0,
      servings:     Number(data.servings)   || 4,
      difficulty:   ['Easy','Medium','Hard'].includes(data.difficulty) ? data.difficulty : 'Medium',
      category:     data.category     || 'Other',
      ingredients:  (data.ingredients  || []).filter(i => i.name),
      instructions: (data.instructions || []).filter(i => i.body),
    };
  } catch { return fallback; }
}
