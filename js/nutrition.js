/* Habits — Food & Nutrition module. Self-contained like finance.js / health.js: its own data
   (HT.data.nutrition), maths and screens.

   Online services (all optional, all called straight from the browser — there is no server):
   - Open Food Facts: barcode lookups and product search. Sends only the barcode or search words.
   - LogMeal: meal-photo recognition, only if the user pastes their own LogMeal token. The token is kept
     in its own localStorage key on this device and is never included in backups.
   - jsDelivr CDN: the barcode decoder (ZXing) and label text recognition (Tesseract) are loaded the
     first time those features are used; label photos are read on the device and never uploaded.

   Every food keeps a "basis" (nutrients per 100 g/ml and/or per serving). Diary entries store their own
   copy of the basis plus the nutrients for the amount eaten, so editing or deleting a food never
   changes what was already logged. Missing values stay missing — nothing is filled in or guessed.

   Hooks used by the rest of the app: HT.normalizeNutrition (storage), N.todayWidget (Today),
   and wrappers on HT.health.metricValue/openMetric so the Health "Calories"/"Protein" metrics read
   the food diary on days that have entries. */
(function () {
  'use strict';
  const HT = window.HT;
  const esc = HT.esc, icon = HT.icon;
  const N = (HT.nutrition = {});
  const D = () => HT.data.nutrition;
  const svg = (d) => '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  Object.assign(HT.icon, { // icons used only by this module
    barcode: svg('<path d="M4 6v12M7 6v12M10 6v12M14 6v12M17 6v12M20 6v12"/>'),
    camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
    label: svg('<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8 8h8M8 11.5h8M8 15h5"/>'),
  });

  const nid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const num = (v) => { const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : null; };
  const pos = (v) => { const n = num(v); return n != null && n > 0 ? n : null; };
  const nonneg = (v) => { const n = num(v); return n != null && n >= 0 ? n : null; };
  const r2 = (n) => Math.round(n * 100) / 100;
  const str = (v, max) => String(v == null ? '' : v).slice(0, max || 120);
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const arr = (v) => (Array.isArray(v) ? v : []);
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const longDate = (key) => HT.parseKey(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const shortDate = (key) => HT.parseKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  /* ---------- nutrients ---------- */

  // [key, label, unit, Open Food Facts key, factor from OFF grams, LogMeal code]
  const NUTRIENTS = [
    ['kcal', 'Calories', 'kcal', 'energy-kcal', 1, 'ENERC_KCAL'],
    ['protein', 'Protein', 'g', 'proteins', 1, 'PROCNT'],
    ['carbs', 'Carbohydrate', 'g', 'carbohydrates', 1, 'CHOCDF'],
    ['fat', 'Fat', 'g', 'fat', 1, 'FAT'],
    ['satfat', 'Saturated fat', 'g', 'saturated-fat', 1, 'FASAT'],
    ['transfat', 'Trans fat', 'g', 'trans-fat', 1, 'FATRN'],
    ['fibre', 'Fibre', 'g', 'fiber', 1, 'FIBTG'],
    ['sugar', 'Sugars', 'g', 'sugars', 1, 'SUGAR'],
    ['sodium', 'Sodium', 'mg', 'sodium', 1000, 'NA'],
    ['chol', 'Cholesterol', 'mg', 'cholesterol', 1000, 'CHOLE'],
    ['potassium', 'Potassium', 'mg', 'potassium', 1000, 'K'],
    ['calcium', 'Calcium', 'mg', 'calcium', 1000, 'CA'],
    ['iron', 'Iron', 'mg', 'iron', 1000, 'FE'],
    ['vitc', 'Vitamin C', 'mg', 'vitamin-c', 1000, 'VITC'],
    ['vitd', 'Vitamin D', 'µg', 'vitamin-d', 1e6, 'VITD'],
  ];
  N.NUTRIENTS = NUTRIENTS;
  const NK = NUTRIENTS.map((x) => x[0]);
  const MAIN = ['kcal', 'protein', 'carbs', 'fat'];
  const nutr = (k) => NUTRIENTS.find((x) => x[0] === k);
  const TARGETS = [['kcal', 'Calories'], ['protein', 'Protein'], ['carbs', 'Carbohydrate'], ['fat', 'Fat'], ['fibre', 'Fibre'], ['sugar', 'Sugars (limit)'], ['sodium', 'Sodium (limit)']];

  /* Keeps only real, non-negative numbers; anything missing stays missing. */
  const normN = (o) => {
    const out = {};
    if (!o || typeof o !== 'object') return out;
    NK.forEach((k) => { const v = nonneg(o[k]); if (v != null) out[k] = r2(v); });
    return out;
  };
  N.scale = (n, f) => { const out = {}; Object.keys(n || {}).forEach((k) => { out[k] = r2(n[k] * f); }); return out; };
  const hasN = (n) => n && Object.keys(n).length > 0;
  const normBasis = (b) => {
    const x = obj(b);
    const per100 = normN(x.per100), perServing = normN(x.perServing), perPortion = normN(x.perPortion);
    return {
      per100: hasN(per100) ? per100 : null,
      perServing: hasN(perServing) ? perServing : null,
      perPortion: hasN(perPortion) ? perPortion : null,
      servingGrams: pos(x.servingGrams),
      servingLabel: str(x.servingLabel, 80),
      liquid: !!x.liquid,
    };
  };
  N.normBasis = normBasis;

  /* Units the amount can be given in for a basis. */
  N.units = (b) => {
    const u = [];
    if (b.perServing || (b.per100 && b.servingGrams)) u.push('serving');
    if (b.per100 || (b.perServing && b.servingGrams)) u.push(b.liquid ? 'ml' : 'g');
    if (b.perPortion) u.push('portion');
    return u;
  };
  /* Nutrients for an amount. Returns null if the basis can't express that unit. */
  N.compute = (b, amount, unit) => {
    const a = pos(amount);
    if (a == null) return null;
    if (unit === 'g' || unit === 'ml') {
      if (b.per100) return N.scale(b.per100, a / 100);
      if (b.perServing && b.servingGrams) return N.scale(b.perServing, a / b.servingGrams);
      return null;
    }
    if (unit === 'serving') {
      if (b.perServing) return N.scale(b.perServing, a);
      if (b.per100 && b.servingGrams) return N.scale(b.per100, (b.servingGrams * a) / 100);
      return null;
    }
    if (unit === 'portion' && b.perPortion) return N.scale(b.perPortion, a);
    return null;
  };
  const unitLabel = (u, a) => (u === 'serving' ? (a === 1 ? 'serving' : 'servings') : u === 'portion' ? (a === 1 ? 'portion' : 'portions') : u);
  const amountText = (e) => HT.num(e.amount) + ' ' + unitLabel(e.unit, e.amount);
  const fmtN = (k, v) => { const x = nutr(k); if (v == null) return '—'; return (k === 'kcal' ? Math.round(v).toLocaleString() : x[2] === 'g' ? HT.num(Math.round(v * 10) / 10) : HT.num(Math.round(v))) + (k === 'kcal' ? ' kcal' : ' ' + x[2]); };
  N.fmtN = fmtN;

  /* ---------- data shape ---------- */

  const DEFAULT_MEALS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['snacks', 'Snacks']];
  const normFood = (f) => ({
    id: str(f.id, 40) || nid('f'),
    name: str(f.name, 120).trim() || 'Unnamed food',
    brand: str(f.brand, 80),
    code: /^\d{6,14}$/.test(String(f.code || '')) ? String(f.code) : '',
    source: ['off', 'custom', 'label'].includes(f.source) ? f.source : 'custom',
    basis: normBasis(f.basis),
    ingredients: str(f.ingredients, 2000),
    allergens: arr(f.allergens).map((a) => str(a, 40)).filter(Boolean).slice(0, 30),
    image: /^https:\/\//.test(String(f.image || '')) ? str(f.image, 300) : '',
    favourite: !!f.favourite,
    uses: Math.max(0, Math.round(num(f.uses) || 0)),
    lastUsed: typeof f.lastUsed === 'string' ? f.lastUsed : null,
    fetchedAt: typeof f.fetchedAt === 'string' ? f.fetchedAt : null,
    createdAt: f.createdAt || new Date().toISOString(),
  });
  const normLine = (x) => {
    const basis = normBasis(x.basis);
    const units = N.units(basis);
    const unit = units.includes(x.unit) ? x.unit : units[0] || 'serving';
    const amount = pos(x.amount) || 1;
    const computed = N.compute(basis, amount, unit);
    return { basis, unit, amount, n: computed || normN(x.n) };
  };

  HT.normalizeNutrition = (raw) => {
    const r = obj(raw);
    const custom = arr(r.meals).filter((m) => m && str(m.name).trim() && !DEFAULT_MEALS.some((d) => d[0] === m.id))
      .map((m) => ({ id: str(m.id, 40) || nid('meal'), name: str(m.name, 30).trim() }));
    const meals = DEFAULT_MEALS.map((d) => ({ id: d[0], name: d[1] })).concat(custom);
    const mealIds = new Set(meals.map((m) => m.id));
    const t = obj(r.targets);
    const targets = {};
    TARGETS.forEach((x) => { targets[x[0]] = pos(t[x[0]]); });
    const foods = arr(r.foods).filter((f) => f && typeof f === 'object' && str(f.name).trim()).map(normFood);
    const recipes = arr(r.recipes).filter((x) => x && str(x.name).trim()).map((x) => ({
      id: str(x.id, 40) || nid('rc'), name: str(x.name, 80).trim(), servings: pos(x.servings) || 1, notes: str(x.notes, 400),
      ingredients: arr(x.ingredients).filter((i) => i && str(i.name).trim()).slice(0, 60).map((i) => Object.assign({ id: str(i.id, 40) || nid('ri'), name: str(i.name, 120).trim(), foodId: i.foodId ? str(i.foodId, 40) : null }, normLine(i))),
      createdAt: x.createdAt || new Date().toISOString(),
    }));
    const entries = arr(r.entries).filter((e) => e && HT.isDateKey(e.date) && str(e.name).trim()).map((e) => Object.assign({
      id: str(e.id, 40) || nid('e'), date: e.date, time: /^\d{2}:\d{2}$/.test(e.time) ? e.time : '',
      meal: mealIds.has(e.meal) ? e.meal : 'snacks', name: str(e.name, 120).trim(), brand: str(e.brand, 80),
      source: ['food', 'recipe', 'photo', 'quick', 'label'].includes(e.source) ? e.source : 'food',
      foodId: e.foodId ? str(e.foodId, 40) : null, recipeId: e.recipeId ? str(e.recipeId, 40) : null,
      estimate: !!e.estimate, note: str(e.note, 200), createdAt: e.createdAt || new Date().toISOString(),
    }, normLine(e)));
    const s = obj(r.settings);
    return { targets, meals, foods, recipes, entries, settings: { online: s.online !== false } };
  };

  /* ---------- totals ---------- */

  N.entriesOn = (key) => D().entries.filter((e) => e.date === key);
  /* Sum of a list of entries; `missing[k]` counts entries that don't list nutrient k. */
  N.total = (list) => {
    const n = {}, missing = {};
    list.forEach((e) => NK.forEach((k) => {
      if (e.n[k] == null) missing[k] = (missing[k] || 0) + 1;
      else n[k] = r2((n[k] || 0) + e.n[k]);
    }));
    return { n, missing, count: list.length };
  };
  N.dayTotal = (key) => N.total(N.entriesOn(key));

  /* Days in [from, to] that have at least one diary entry, with their totals. */
  N.loggedDays = (from, to) => {
    const by = {};
    D().entries.forEach((e) => { if (e.date >= from && e.date <= to) (by[e.date] = by[e.date] || []).push(e); });
    return Object.keys(by).sort().map((k) => ({ date: k, total: N.total(by[k]) }));
  };
  /* Averages over logged days only (days with no entries are not treated as zero). */
  N.period = (from, to) => {
    const days = N.loggedDays(from, to);
    const out = { days: days.length, avg: {}, hit: {} };
    MAIN.concat(['fibre', 'sugar', 'sodium']).forEach((k) => {
      const vals = days.map((d) => d.total.n[k]).filter((v) => v != null);
      out.avg[k] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    });
    const t = D().targets;
    if (t.kcal) out.hit.kcal = days.filter((d) => d.total.n.kcal != null && Math.abs(d.total.n.kcal - t.kcal) <= t.kcal * 0.1).length;
    if (t.protein) out.hit.protein = days.filter((d) => (d.total.n.protein || 0) >= t.protein).length;
    return out;
  };

  /* ---------- foods ---------- */

  N.food = (id) => D().foods.find((f) => f.id === id);
  N.recipe = (id) => D().recipes.find((x) => x.id === id);
  N.touchFood = (f) => { f.uses++; f.lastUsed = new Date().toISOString(); };
  N.recipeBasis = (rc) => {
    const t = N.total(rc.ingredients.map((i) => ({ n: i.n })));
    return normBasis({ perServing: N.scale(t.n, 1 / rc.servings), servingLabel: '1 of ' + plural(rc.servings, 'serving') });
  };

  /* ---------- Open Food Facts ---------- */

  const OFF = 'https://world.openfoodfacts.org';
  const OFF_FIELDS = 'code,product_name,product_name_en,brands,serving_size,serving_quantity,serving_quantity_unit,nutriments,ingredients_text,ingredients_text_en,allergens_tags,image_front_small_url';
  const CACHE_DAYS = 30;

  /* Maps an Open Food Facts product to a food. Only values the product lists are used. */
  N.fromOFF = (p, code) => {
    const nm = obj(p.nutriments);
    const pick = (suffix) => {
      const o = {};
      NUTRIENTS.forEach((x) => { const v = nonneg(nm[x[3] + suffix]); if (v != null) o[x[0]] = v * x[4]; });
      if (o.kcal == null) { const kj = nonneg(nm['energy-kj' + suffix]); if (kj != null) o.kcal = kj / 4.184; }
      return o;
    };
    const unit = String(p.serving_quantity_unit || '').toLowerCase();
    return normFood({
      name: p.product_name_en || p.product_name || 'Unnamed product',
      brand: String(p.brands || '').split(',')[0].trim(),
      code: String(code || p.code || ''),
      source: 'off',
      basis: { per100: pick('_100g'), perServing: pick('_serving'), servingGrams: unit === '' || unit === 'g' || unit === 'ml' ? p.serving_quantity : null, servingLabel: p.serving_size || '', liquid: unit === 'ml' },
      ingredients: p.ingredients_text_en || p.ingredients_text || '',
      allergens: arr(p.allergens_tags).map((a) => String(a).replace(/^[a-z]{2}:/, '').replace(/-/g, ' ')),
      image: p.image_front_small_url || '',
      fetchedAt: new Date().toISOString(),
    });
  };

  const inflight = {};
  const timeoutFetch = (url, opts, ms) => {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), ms || 15000) : null;
    return fetch(url, Object.assign({}, opts, ctl ? { signal: ctl.signal } : {})).finally(() => { if (t) clearTimeout(t); });
  };
  N.validGtin = (code) => {
    if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
    const d = code.split('').map(Number), check = d.pop();
    const sum = d.reverse().reduce((s, x, i) => s + x * (i % 2 === 0 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === check;
  };
  /* Returns { food } or { notFound: true }; throws on network / service errors. Cached for 30 days. */
  N.lookupBarcode = async (code) => {
    const cached = D().foods.find((f) => f.code === code);
    if (cached && (cached.source !== 'off' || (cached.fetchedAt && Date.now() - Date.parse(cached.fetchedAt) < CACHE_DAYS * 864e5))) return { food: cached };
    if (!D().settings.online) throw new Error('Online lookups are turned off in Nutrition settings.');
    if (inflight[code]) return inflight[code];
    inflight[code] = (async () => {
      let res;
      try {
        res = await timeoutFetch(OFF + '/api/v2/product/' + encodeURIComponent(code) + '.json?fields=' + OFF_FIELDS, {}, 15000);
      } catch (err) {
        throw new Error(navigator.onLine === false ? 'You\'re offline. Connect to look up products.' : 'Couldn\'t reach Open Food Facts.');
      }
      if (res.status === 429 || res.status === 503) throw new Error('Open Food Facts is busy. Try again in a minute.');
      const j = await res.json().catch(() => null);
      if (!j || (res.status === 404 && j.status !== 0)) throw new Error('Open Food Facts returned an error (' + res.status + ').');
      if (j.status !== 1 || !j.product) return { notFound: true };
      const food = N.fromOFF(j.product, code);
      if (cached) { Object.assign(cached, food, { id: cached.id, favourite: cached.favourite, uses: cached.uses, lastUsed: cached.lastUsed, createdAt: cached.createdAt }); HT.save(); return { food: cached }; }
      D().foods.push(food);
      HT.save();
      return { food };
    })();
    try { return await inflight[code]; } finally { delete inflight[code]; }
  };
  const searchCache = {};
  /* Name search on Open Food Facts (only on submit — the service asks apps not to search as you type). */
  N.searchOFF = async (q) => {
    const key = q.toLowerCase();
    if (searchCache[key]) return searchCache[key];
    if (!D().settings.online) return [];
    const base = OFF + '/cgi/search.pl?search_simple=1&action=process&json=1&page_size=20&search_terms=' + encodeURIComponent(q) + '&fields=' + OFF_FIELDS;
    let res;
    try {
      // Products sold in Canada first; the whole database only if that finds very little.
      res = await timeoutFetch(base + '&tagtype_0=countries&tag_contains_0=contains&tag_0=canada', {}, 20000);
      if (res.ok) {
        const j = await res.clone().json();
        if (arr(j.products).length < 5) { const world = await timeoutFetch(base, {}, 20000).catch(() => null); if (world && world.ok) res = world; }
      }
    } catch (err) {
      // Open Food Facts often answers browser name-searches with "503 busy" (no CORS headers), which
      // reaches us only as a network error. Barcode lookups are not affected.
      throw new Error(navigator.onLine === false ? 'You\'re offline — showing your own foods only.'
        : 'Open Food Facts isn\'t accepting name searches from the app right now. Scan the barcode instead, or use your own foods or quick add.');
    }
    if (!res.ok) throw new Error(res.status === 429 || res.status === 503 ? 'Open Food Facts is busy. Try again in a minute.' : 'Search failed (' + res.status + ').');
    const j = await res.json();
    const list = arr(j.products).filter((p) => p && (p.product_name || p.product_name_en)).map((p) => N.fromOFF(p, p.code)).filter((f) => N.units(f.basis).length);
    searchCache[key] = list;
    return list;
  };

  /* ---------- nutrition label text (Canadian bilingual or US) ---------- */

  N.parseLabel = (text) => {
    let t = String(text || '').replace(/\r/g, '');
    t = t.replace(/(\d),(\d)/g, '$1.$2').replace(/\b[oO](\s?m?g)\b/g, '0$1').replace(/[|]/g, ' ');
    const lower = t.toLowerCase();
    const out = { n: {}, servingLabel: '', servingAmount: null, servingUnit: 'g' };
    const sv = lower.match(/(?:per|pour|serving size|portion)\s*([^\n(]{0,40})\(\s*(\d+(?:\.\d+)?)\s*(g|ml)\s*\)/) || lower.match(/\(\s*(\d+(?:\.\d+)?)\s*(g|ml)\s*\)/);
    if (sv) {
      const amount = sv.length === 4 ? sv[2] : sv[1], unit = sv.length === 4 ? sv[3] : sv[2];
      out.servingAmount = num(amount);
      out.servingUnit = unit === 'ml' ? 'ml' : 'g';
      const words = sv.length === 4 ? sv[1].replace(/:/g, ' ').replace(/\s*\/\s*$/, '').replace(/\s+/g, ' ').trim() : '';
      out.servingLabel = (words ? words + ' ' : '') + '(' + amount + ' ' + (unit === 'ml' ? 'mL' : 'g') + ')';
    }
    const grab = (re) => { const m = lower.match(re); return m ? num(m[1]) : null; };
    const G = '[^\\n\\d]*?(\\d+(?:\\.\\d+)?)\\s*';
    const rules = {
      kcal: /calories[^\n\d]*?(\d+(?:\.\d+)?)/,
      fat: new RegExp('(?:^|\\n)\\s*(?:total\\s+)?(?:fat|lipides)\\b' + G + 'g'),
      satfat: new RegExp('(?:saturated|saturés|satures)' + G + 'g'),
      transfat: new RegExp('trans\\b' + G + 'g'),
      carbs: new RegExp('(?:carbohydrate|glucides)' + G + 'g'),
      fibre: new RegExp('(?:fibre|fiber|fibres)' + G + 'g'),
      sugar: new RegExp('(?:sugars?|sucres)' + G + 'g'),
      protein: new RegExp('(?:protein|protéines|proteines)' + G + 'g'),
      chol: new RegExp('(?:cholesterol|cholestérol)' + G + 'mg'),
      sodium: new RegExp('sodium' + G + 'mg'),
      potassium: new RegExp('potassium' + G + 'mg'),
      calcium: new RegExp('calcium' + G + 'mg'),
      iron: new RegExp('(?:\\biron\\b|\\bfer\\b)' + G + 'mg'),
    };
    Object.keys(rules).forEach((k) => { const v = grab(rules[k]); if (v != null) out.n[k] = v; });
    return out;
  };

  /* ---------- LogMeal (meal photo) ---------- */

  const TOKEN_KEY = 'habits.logmealToken';
  N.token = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } };
  const setToken = (v) => { try { if (v) localStorage.setItem(TOKEN_KEY, v); else localStorage.removeItem(TOKEN_KEY); } catch (e) { /* storage blocked */ } };
  const LM = 'https://api.logmeal.com';

  /* Converts LogMeal's nutritional_info into our nutrient keys, respecting the units it reports. */
  N.fromLogmeal = (ni) => {
    const o = {};
    const x = obj(ni);
    if (nonneg(x.calories) != null) o.kcal = x.calories;
    const tn = obj(x.totalNutrients);
    NUTRIENTS.forEach((n) => {
      const v = tn[n[5]];
      if (!v || nonneg(v.quantity) == null || (n[0] === 'kcal' && o.kcal != null)) return;
      const unit = String(v.unit || '').toLowerCase();
      let q = v.quantity;
      if (n[2] === 'mg' && unit === 'g') q *= 1000;
      if (n[2] === 'g' && unit === 'mg') q /= 1000;
      if (n[2] === 'µg' && unit === 'mg') q *= 1000;
      if (n[2] === 'µg' && unit === 'g') q *= 1e6;
      o[n[0]] = q;
    });
    return normN(o);
  };
  /* Builds editable items from the two LogMeal responses. Each item keeps the estimate as its basis. */
  N.logmealItems = (seg, nut) => {
    const segs = arr(obj(seg).segmentation_results);
    const per = arr(obj(nut).nutritional_info_per_item);
    return segs.map((s, i) => {
      const best = arr(s.recognition_results)[0] || {};
      const pi = per.find((p) => p && (p.food_item_position === s.food_item_position)) || per[i] || null;
      const n = pi ? N.fromLogmeal(pi.nutritional_info) : {};
      const grams = pos((pi && pi.serving_size) || s.serving_size);
      const basis = grams && hasN(n) ? normBasis({ per100: N.scale(n, 100 / grams) }) : normBasis({ perPortion: n });
      return {
        id: nid('it'), name: str(best.name || 'Unknown food', 120), prob: num(best.prob), basis,
        amount: grams && hasN(n) ? Math.round(grams) : 1, unit: grams && hasN(n) ? 'g' : 'portion', hasNutrition: hasN(n),
      };
    }).filter((x) => x.name);
  };
  const shrinkImage = (file, max) => new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, (max || 1280) / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => resolve(b || file), 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
  N.analyzePhoto = async (file) => {
    const token = N.token();
    if (!token) throw new Error('Add your LogMeal token in Nutrition settings first.');
    const body = new FormData();
    body.append('image', await shrinkImage(file, 1280), 'meal.jpg');
    const why = (s) => (s === 401 ? 'LogMeal rejected the token. Check it in Nutrition settings.' : s === 403 ? 'Your LogMeal plan doesn\'t include this. (Nutrition needs their Monitor plan or the free trial.)'
      : s === 429 ? 'LogMeal\'s daily or per-second limit was reached. Try again later.' : s === 400 ? 'LogMeal couldn\'t read that image. Try a clearer, well-lit photo.' : 'LogMeal returned an error (' + s + ').');
    let r1;
    try { r1 = await timeoutFetch(LM + '/v2/image/segmentation/complete?language=eng', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body }, 45000); }
    catch (e) { throw new Error(navigator.onLine === false ? 'You\'re offline.' : 'Couldn\'t reach LogMeal.'); }
    if (!r1.ok) throw new Error(why(r1.status));
    const seg = await r1.json();
    let nut = null, nutError = '';
    try {
      const r2 = await timeoutFetch(LM + '/v2/nutrition/recipe/nutritionalInfo?language=eng', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ imageId: seg.imageId }) }, 45000);
      if (r2.ok) nut = await r2.json(); else nutError = why(r2.status);
    } catch (e) { nutError = 'Couldn\'t get nutrition from LogMeal.'; }
    return { items: N.logmealItems(seg, nut), nutError };
  };

  /* ---------- lazily loaded libraries ---------- */

  const libs = {};
  const loadScript = (key, src, integrity, globalName) => {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    if (libs[key]) return libs[key];
    libs[key] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.integrity = integrity; s.crossOrigin = 'anonymous'; s.async = true;
      s.onload = () => (window[globalName] ? resolve(window[globalName]) : reject(new Error('Library failed to start')));
      s.onerror = () => { delete libs[key]; s.remove(); reject(new Error(navigator.onLine === false ? 'You\'re offline — this needs a connection the first time.' : 'Couldn\'t download the scanner library.')); };
      document.head.appendChild(s);
    });
    return libs[key];
  };
  const loadZXing = () => loadScript('zxing', 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js', 'sha384-BzBxP10ZE72aitqj5UMmUsbKFliP/DZqA8Wq+BNNhlIJDGoEd1tpkMYXOg9+n6sB', 'ZXing');
  const loadTesseract = () => loadScript('tesseract', 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js', 'sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F', 'Tesseract');

  /* Decodes a barcode from a canvas / image / video frame. Native BarcodeDetector first, ZXing otherwise. */
  let detector = null;
  const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
  const decodeFrom = async (source, canvas) => {
    if ('BarcodeDetector' in window) {
      try {
        if (!detector) {
          const supported = window.BarcodeDetector.getSupportedFormats ? await window.BarcodeDetector.getSupportedFormats() : FORMATS;
          const fm = FORMATS.filter((f) => supported.includes(f));
          if (fm.length) detector = new window.BarcodeDetector({ formats: fm });
        }
        if (detector) { const found = await detector.detect(source); return found.length ? found[0].rawValue : null; }
      } catch (e) { detector = null; }
    }
    const Z = await loadZXing();
    const w = source.videoWidth || source.naturalWidth || source.width, h = source.videoHeight || source.naturalHeight || source.height;
    if (!w || !h) return null;
    const s = Math.min(1, 1280 / Math.max(w, h));
    canvas.width = Math.round(w * s); canvas.height = Math.round(h * s);
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    const hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    const reader = new Z.MultiFormatReader();
    reader.setHints(hints);
    try { return reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)))).getText(); }
    catch (e) { return null; }
  };
  /* UPC-A is EAN-13 with a leading 0; Open Food Facts stores many North American codes in 13 digits. */
  const normaliseCode = (c) => { const d = String(c || '').replace(/\D/g, ''); return d.length === 12 ? '0' + d : d; };

  /* ---------- shared UI pieces ---------- */

  N.vs = { day: null, tab: '', period: 7, pickTab: 'recent' };
  const opt = (v, l, cur) => '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(l) + '</option>';
  const field = (lab, input, optional) => '<label class="field"><span class="label">' + lab + (optional ? ' <em>optional</em>' : '') + '</span>' + input + '</label>';
  const numIn = (id, v, ph, extra) => '<input id="' + id + '" type="number" inputmode="decimal" min="0" step="any" placeholder="' + esc(ph || '') + '" value="' + (v != null && v !== '' ? v : '') + '"' + (extra || '') + '>';
  const textIn = (id, v, ph, max) => '<input id="' + id + '" type="text" maxlength="' + (max || 120) + '" autocomplete="off" placeholder="' + esc(ph || '') + '" value="' + esc(v || '') + '">';
  const val = (wrap, sel) => { const e = HT.$(sel, wrap); return e ? e.value.trim() : ''; };
  const mealName = (id) => (D().meals.find((m) => m.id === id) || { name: 'Snacks' }).name;
  const mealSelect = (id, cur) => '<select id="' + id + '">' + D().meals.map((m) => opt(m.id, m.name, cur)).join('') + '</select>';
  const defaultMeal = () => { const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snacks'; };
  const macroLine = (n) => [n.kcal != null ? fmtN('kcal', n.kcal) : 'kcal —', 'P ' + (n.protein != null ? HT.num(Math.round(n.protein)) : '—'), 'C ' + (n.carbs != null ? HT.num(Math.round(n.carbs)) : '—'), 'F ' + (n.fat != null ? HT.num(Math.round(n.fat)) : '—')].join(' · ');
  N.macroLine = macroLine;

  function sheet(o) {
    return HT.openSheet({
      title: o.title, kind: o.kind || 'sheet tall', html: o.html,
      footer: o.footer != null ? o.footer : (o.onDelete ? '<button type="button" class="btn btn-danger-ghost" data-del>' + (o.deleteLabel || 'Delete') + '</button>' : '<button type="button" class="btn" data-close>Cancel</button>') +
        (o.onSave ? '<button type="button" class="btn btn-primary" data-save>' + (o.saveLabel || 'Save') + '</button>' : ''),
      onClose: o.onClose,
      onMount: (wrap, close) => {
        const finish = (ok) => { if (ok !== false) { HT.save(); close(); if (!o.noRender) HT.render(); } };
        let busy = false;
        const run = (fn) => {
          if (busy || !fn) return;
          const res = fn(wrap, close);
          if (res && typeof res.then === 'function') { busy = true; res.then((ok) => { busy = false; finish(ok); }, (err) => { busy = false; console.error(err); HT.toast(err.message || 'Something went wrong'); }); }
          else finish(res);
        };
        wrap.addEventListener('click', (e) => {
          if (e.target.closest('[data-save]')) run(o.onSave);
          else if (e.target.closest('[data-del]')) run(o.onDelete);
        });
        if (o.onMount) o.onMount(wrap, close);
      },
    });
  }
  const nutrientTable = (n, missingNote) => '<div class="ntable">' + NUTRIENTS.map((x) => {
    const v = n ? n[x[0]] : null;
    if (v == null && !MAIN.includes(x[0]) && !['fibre', 'sugar', 'sodium'].includes(x[0])) return '';
    return '<div class="frow' + (MAIN.includes(x[0]) ? ' strong' : '') + '"><span>' + x[1] + '</span><b>' + (v == null ? '<small>not listed</small>' : fmtN(x[0], v)) + '</b></div>';
  }).join('') + (missingNote ? '<p class="hint">' + missingNote + '</p>' : '') + '</div>';

  /* ---------- amount sheet: add / edit one diary entry or recipe ingredient ---------- */

  /* item: { name, brand, basis, foodId, recipeId, source, ingredients, allergens, code, estimate }
     ctx:  { date, meal, mode: 'diary' | 'collect', onCollect(line), entry (when editing) } */
  N.openAmount = (item, ctx) => {
    const entry = ctx.entry || null;
    const basis = item.basis;
    const units = N.units(basis);
    if (!units.length) { HT.toast('This food has no nutrition values to work with'); return; }
    const food = item.foodId ? N.food(item.foodId) : null;
    const unit0 = entry ? entry.unit : units.includes('serving') ? 'serving' : units[0];
    const amount0 = entry ? entry.amount : unit0 === 'serving' || unit0 === 'portion' ? 1 : basis.servingGrams || 100;
    const collect = ctx.mode === 'collect';
    const info = [basis.servingLabel ? 'Serving: ' + basis.servingLabel : '', basis.per100 ? 'Values per 100 ' + (basis.liquid ? 'ml' : 'g') + ' available' : ''].filter(Boolean).join(' · ');
    const html = '<div class="food-head">' + (food && food.image ? '<img src="' + esc(food.image) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '') +
      '<div><b>' + esc(item.name) + '</b>' + (item.brand ? '<div class="muted">' + esc(item.brand) + '</div>' : '') + (info ? '<div class="hint">' + esc(info) + '</div>' : '') +
      (item.estimate ? '<div class="tag est">Estimate</div>' : '') + '</div></div>' +
      '<div class="row2">' + field('Amount', numIn('na-amt', amount0, '', ' autofocus')) + field('Unit', '<select id="na-unit">' + units.map((u) => opt(u, unitLabel(u, 2), unit0)).join('') + '</select>') + '</div>' +
      (collect ? '' : '<div class="row2">' + field('Meal', mealSelect('na-meal', entry ? entry.meal : ctx.meal || defaultMeal())) + field('Date', '<input id="na-date" type="date" max="' + HT.today() + '" value="' + (entry ? entry.date : ctx.date || HT.today()) + '">') + '</div>') +
      '<div id="na-n"></div>' +
      (item.ingredients || (item.allergens && item.allergens.length) ? '<details class="nmore"><summary>Ingredients and allergens</summary>' +
        (item.allergens && item.allergens.length ? '<p><b>Allergens listed:</b> ' + esc(item.allergens.join(', ')) + '</p>' : '') + (item.ingredients ? '<p class="muted">' + esc(item.ingredients) + '</p>' : '') + '</details>' : '') +
      (food ? '<div class="switch-row"><div><div class="sw-title">Favourite</div></div><label class="switch"><input type="checkbox" id="na-fav"' + (food.favourite ? ' checked' : '') + '><span></span></label></div>' : '') +
      (food && food.source === 'off' ? '<p class="hint">Product data from <a href="https://world.openfoodfacts.org/product/' + esc(food.code) + '" target="_blank" rel="noopener noreferrer">Open Food Facts</a> (ODbL). Check it against the package.</p>' : '') +
      (entry ? '<div class="btn-row"><button type="button" class="btn" data-dup>Duplicate</button></div>' : '');
    sheet({
      title: entry ? 'Edit entry' : collect ? 'How much?' : 'Add food',
      html,
      saveLabel: entry ? 'Save' : collect ? 'Add' : 'Add to diary',
      onDelete: entry ? async () => {
        const ok = await HT.confirm({ title: 'Delete entry?', message: 'Remove <b>' + esc(entry.name) + '</b> from ' + esc(mealName(entry.meal)) + '?', confirmLabel: 'Delete', danger: true });
        if (!ok) return false;
        D().entries = D().entries.filter((e) => e.id !== entry.id);
        HT.toast('Entry deleted');
      } : null,
      onMount: (wrap) => {
        const show = () => {
          const n = N.compute(basis, val(wrap, '#na-amt'), val(wrap, '#na-unit'));
          HT.$('#na-n', wrap).innerHTML = n ? nutrientTable(n, item.estimate ? 'Estimated values. Portions, oils, sauces and hidden ingredients can change these a lot.' : '') : '<p class="note">Enter an amount above 0.</p>';
        };
        show();
        wrap.addEventListener('input', (e) => { if (e.target.id === 'na-amt') show(); });
        wrap.addEventListener('change', (e) => {
          if (e.target.id === 'na-unit') {
            const u = e.target.value;
            HT.$('#na-amt', wrap).value = u === 'serving' || u === 'portion' ? 1 : basis.servingGrams || 100;
            show();
          }
          if (e.target.id === 'na-fav' && food) { food.favourite = e.target.checked; HT.save(); HT.toast(food.favourite ? 'Added to favourites' : 'Removed from favourites'); }
        });
        const dup = HT.$('[data-dup]', wrap);
        if (dup) dup.addEventListener('click', () => {
          const copy = Object.assign({}, JSON.parse(JSON.stringify(entry)), { id: nid('e'), createdAt: new Date().toISOString() });
          D().entries.push(copy);
          HT.save();
          HT.closeTopSheet();
          HT.toast('Duplicated');
          HT.render();
        });
      },
      onSave: (wrap) => {
        const amount = pos(val(wrap, '#na-amt')), unit = val(wrap, '#na-unit');
        if (amount == null) { HT.toast('Enter an amount above 0'); return false; }
        const n = N.compute(basis, amount, unit);
        if (!n) { HT.toast('That unit can\'t be used for this food'); return false; }
        if (collect) { ctx.onCollect({ name: item.name, foodId: item.foodId || null, basis, amount, unit, n }); return; }
        const date = val(wrap, '#na-date');
        if (!HT.isDateKey(date) || date > HT.today()) { HT.toast('Pick a date that isn\'t in the future'); return false; }
        const fields = { date, meal: val(wrap, '#na-meal'), amount, unit, n, basis };
        if (entry) { Object.assign(D().entries.find((e) => e.id === entry.id) || {}, fields); HT.toast('Entry updated'); return; }
        D().entries.push(Object.assign({
          id: nid('e'), name: item.name, brand: item.brand || '', source: item.source || 'food', foodId: item.foodId || null, recipeId: item.recipeId || null,
          estimate: !!item.estimate, note: '', time: '', createdAt: new Date().toISOString(),
        }, fields));
        if (food) N.touchFood(food);
        HT.toast('Added to ' + mealName(fields.meal));
      },
    });
  };
  N.editEntry = (e) => {
    const food = e.foodId ? N.food(e.foodId) : null;
    N.openAmount({ name: e.name, brand: e.brand, basis: e.basis, foodId: food ? food.id : null, recipeId: e.recipeId, source: e.source, estimate: e.estimate, ingredients: food ? food.ingredients : '', allergens: food ? food.allergens : [] }, { entry: e });
  };
  const foodItem = (f) => ({ name: f.name, brand: f.brand, basis: f.basis, foodId: f.id, source: f.source === 'label' ? 'label' : 'food', ingredients: f.ingredients, allergens: f.allergens });
  const recipeItem = (rc) => ({ name: rc.name, brand: '', basis: N.recipeBasis(rc), recipeId: rc.id, source: 'recipe' });

  /* ---------- food picker ---------- */

  N.openPicker = (ctx) => {
    const collect = ctx.mode === 'collect';
    let results = null, searching = false, err = '', lastQ = '';
    const row = (kind, id, title, sub, extra) => '<li><button type="button" class="drow" data-pick="' + kind + ':' + id + '"><span class="dname">' + esc(title) + '<small>' + esc(sub) + '</small></span>' + (extra || '') + '<span class="chev">' + icon.next + '</span></button></li>';
    const foodSub = (f) => [f.brand, f.basis.servingLabel || (f.basis.per100 ? 'per 100 ' + (f.basis.liquid ? 'ml' : 'g') : ''), (N.compute(f.basis, 1, 'serving') || {}).kcal != null ? fmtN('kcal', N.compute(f.basis, 1, 'serving').kcal) + ' / serving' : f.basis.per100 && f.basis.per100.kcal != null ? fmtN('kcal', f.basis.per100.kcal) + ' / 100 ' + (f.basis.liquid ? 'ml' : 'g') : ''].filter(Boolean).join(' · ');
    const lists = () => {
      const tab = N.vs.pickTab;
      let items = [];
      if (tab === 'recent') {
        const seen = new Set();
        D().entries.slice().reverse().forEach((e) => {
          const k = e.foodId || e.recipeId || e.name.toLowerCase();
          if (seen.has(k) || items.length >= 25 || e.source === 'photo' || e.source === 'quick') return;
          seen.add(k);
          if (e.recipeId && N.recipe(e.recipeId)) items.push(row('recipe', e.recipeId, e.name, 'Recipe'));
          else if (e.foodId && N.food(e.foodId)) items.push(row('food', e.foodId, e.name, foodSub(N.food(e.foodId))));
          else items.push(row('entry', e.id, e.name, 'Same as last time: ' + amountText(e)));
        });
      } else if (tab === 'fav') items = D().foods.filter((f) => f.favourite).map((f) => row('food', f.id, f.name, foodSub(f)));
      else if (tab === 'mine') items = D().foods.filter((f) => f.source !== 'off').map((f) => row('food', f.id, f.name, foodSub(f)));
      else if (tab === 'recipes') items = D().recipes.filter((r) => !ctx.excludeRecipe || r.id !== ctx.excludeRecipe).map((r) => row('recipe', r.id, r.name, macroLine(N.recipeBasis(r).perServing || {}) + ' per serving'));
      const empty = { recent: 'Foods you log will appear here.', fav: 'Tap "Favourite" on a food to keep it here.', mine: 'Foods you create or scan from a label appear here.', recipes: 'Build recipes in Nutrition → Recipes.' }[tab];
      return items.length ? '<ul class="dlist">' + items.join('') + '</ul>' : '<p class="muted">' + empty + '</p>';
    };
    const body = () => {
      let h = '<form class="quickadd" data-nsearch><input id="np-q" type="search" maxlength="80" autocomplete="off" placeholder="Search foods, e.g. greek yogurt" value="' + esc(lastQ) + '" aria-label="Search foods">' +
        '<button type="submit" class="btn btn-primary">Search</button></form>' +
        '<div class="nquick">' + '<button type="button" class="btn" data-np="scan">' + icon.barcode + '<span>Scan barcode</span></button>' +
        '<button type="button" class="btn" data-np="label">' + icon.label + '<span>Scan label</span></button>' +
        (collect ? '' : '<button type="button" class="btn" data-np="photo">' + icon.camera + '<span>Meal photo</span></button>') +
        '<button type="button" class="btn" data-np="quick">' + icon.plus + '<span>Quick add</span></button></div>';
      if (searching) h += '<p class="note">Searching…</p>';
      else if (err) h += '<p class="note">' + esc(err) + ' <button type="button" class="linkish" data-np="retry">Retry</button></p>';
      if (results) {
        const local = D().foods.filter((f) => f.name.toLowerCase().includes(lastQ.toLowerCase()) || (f.brand || '').toLowerCase().includes(lastQ.toLowerCase())).slice(0, 10);
        const rec = D().recipes.filter((r) => r.name.toLowerCase().includes(lastQ.toLowerCase()));
        h += '<h3 class="sp">Results for “' + esc(lastQ) + '”</h3>';
        const rows = local.map((f) => row('food', f.id, f.name, foodSub(f), f.favourite ? '<span class="tag">★</span>' : '')).concat(rec.map((r) => row('recipe', r.id, r.name, 'Recipe')))
          .concat(results.map((f, i) => ({ f, i })).filter((o) => !local.some((l) => l.code && l.code === o.f.code)).map((o) => row('off', o.i, o.f.name, foodSub(o.f))));
        h += rows.length ? '<ul class="dlist">' + rows.join('') + '</ul>' + (results.length ? '<p class="hint">Product results from Open Food Facts. Not seeing it? Try a shorter name, scan the barcode or create the food yourself.</p>' : '')
          : '<p class="muted">Nothing found. Try another name, scan the barcode, or <button type="button" class="linkish" data-np="new">create the food yourself</button>.</p>';
      }
      h += '<div class="chips gap-top" id="np-tabs">' + [['recent', 'Recent'], ['fav', 'Favourites'], ['mine', 'My foods'], ['recipes', 'Recipes']].map((t) =>
        '<button type="button" class="chip' + (t[0] === N.vs.pickTab ? ' on' : '') + '" data-np-tab="' + t[0] + '">' + t[1] + '</button>').join('') + '</div><div class="gap-top">' + lists() + '</div>';
      return h;
    };
    sheet({
      title: collect ? 'Add an ingredient' : 'Add to ' + mealName(ctx.meal || defaultMeal()),
      html: body(),
      footer: '<button type="button" class="btn" data-close>Close</button>',
      noRender: true,
      onMount: (wrap, close) => {
        const redraw = () => { const b = HT.$('.panel-body', wrap); const top = b.scrollTop; b.innerHTML = body(); b.scrollTop = top; };
        const go = (fn) => { close(); setTimeout(fn, 230); };
        const doSearch = async () => {
          const q = val(wrap, '#np-q');
          if (q.length < 2) { HT.toast('Type at least 2 letters'); return; }
          lastQ = q; searching = true; err = ''; results = results || []; redraw();
          try { results = await N.searchOFF(q); } catch (e2) { err = e2.message; results = []; }
          searching = false; redraw();
        };
        wrap.addEventListener('submit', (e) => { if (e.target.matches('[data-nsearch]')) { e.preventDefault(); doSearch(); } });
        wrap.addEventListener('click', (e) => {
          const tab = e.target.closest('[data-np-tab]');
          if (tab) { N.vs.pickTab = tab.dataset.npTab; redraw(); return; }
          const a = e.target.closest('[data-np]');
          if (a) {
            const k = a.dataset.np;
            if (k === 'retry') doSearch();
            else if (k === 'scan') go(() => N.openScanner(ctx));
            else if (k === 'label') go(() => N.openFoodForm(null, ctx, true));
            else if (k === 'new') go(() => N.openFoodForm(null, ctx, false));
            else if (k === 'photo') go(() => N.openPhoto(ctx));
            else if (k === 'quick') go(() => N.openQuick(ctx));
            return;
          }
          const p = e.target.closest('[data-pick]');
          if (!p) return;
          const [kind, id] = p.dataset.pick.split(':');
          if (kind === 'food') go(() => N.openAmount(foodItem(N.food(id)), ctx));
          else if (kind === 'recipe') go(() => N.openAmount(recipeItem(N.recipe(id)), ctx));
          else if (kind === 'entry') { const e0 = D().entries.find((x) => x.id === id); go(() => N.openAmount({ name: e0.name, brand: e0.brand, basis: e0.basis, source: e0.source, estimate: e0.estimate }, ctx)); }
          else if (kind === 'off') {
            const f = results[+id];
            let saved = D().foods.find((x) => x.code && x.code === f.code);
            if (!saved) { saved = f; D().foods.push(saved); HT.save(); }
            go(() => N.openAmount(foodItem(saved), ctx));
          }
        });
        setTimeout(() => { const q = HT.$('#np-q', wrap); if (q && !('ontouchstart' in window)) q.focus(); }, 250);
      },
    });
  };

  /* ---------- quick add ---------- */

  N.openQuick = (ctx) => {
    const collect = ctx.mode === 'collect';
    sheet({
      title: 'Quick add',
      html: field('Name', textIn('nq-name', '', 'e.g. Restaurant pasta', 120), true) +
        '<div class="row2">' + field('Calories (kcal)', numIn('nq-kcal', '', '')) + field('Protein (g)', numIn('nq-protein', '', ''), true) + '</div>' +
        '<div class="row2">' + field('Carbohydrate (g)', numIn('nq-carbs', '', ''), true) + field('Fat (g)', numIn('nq-fat', '', ''), true) + '</div>' +
        (collect ? '' : '<div class="row2">' + field('Meal', mealSelect('nq-meal', ctx.meal || defaultMeal())) + field('Date', '<input id="nq-date" type="date" max="' + HT.today() + '" value="' + (ctx.date || HT.today()) + '">') + '</div>') +
        '<p class="hint">For when you only know the totals. Leave anything you don\'t know blank — blanks are shown as "not listed", not as zero.</p>',
      saveLabel: collect ? 'Add' : 'Add to diary',
      onSave: (wrap) => {
        const n = {};
        for (const k of MAIN) {
          const raw = val(wrap, '#nq-' + k);
          if (raw === '') continue;
          const v = nonneg(raw);
          if (v == null) { HT.toast('Numbers can\'t be negative'); return false; }
          n[k] = v;
        }
        if (n.kcal == null && n.protein == null && n.carbs == null && n.fat == null) { HT.toast('Enter at least one value'); return false; }
        const name = val(wrap, '#nq-name') || 'Quick add';
        const basis = normBasis({ perServing: n, servingLabel: 'as entered' });
        if (collect) { ctx.onCollect({ name, foodId: null, basis, amount: 1, unit: 'serving', n: normN(n) }); return; }
        const date = val(wrap, '#nq-date');
        if (!HT.isDateKey(date) || date > HT.today()) { HT.toast('Pick a date that isn\'t in the future'); return false; }
        D().entries.push({ id: nid('e'), date, time: '', meal: val(wrap, '#nq-meal'), name, brand: '', source: 'quick', foodId: null, recipeId: null, estimate: false, note: '', amount: 1, unit: 'serving', basis, n: normN(n), createdAt: new Date().toISOString() });
        HT.toast('Added');
      },
    });
  };

  /* ---------- custom food / nutrition label ---------- */

  /* Create or edit a food. With `scan` it starts with the label photo + text recognition. */
  N.openFoodForm = (existing, ctx, scan, presetCode) => {
    ctx = ctx || {};
    const f = existing || { name: '', brand: '', code: presetCode || '', basis: normBasis({}) };
    const b = f.basis;
    const per = b.perServing || (b.per100 ? b.per100 : {});
    const perLabel = b.perServing ? 'serving' : b.per100 ? '100' : 'serving';
    const html = (scan ? '<div class="lscan"><div class="btn-row"><label class="btn btn-primary file-btn">' + icon.camera + '<span>Take photo</span><input type="file" accept="image/*" capture="environment" data-lphoto hidden></label>' +
        '<label class="btn file-btn"><span>Choose photo</span><input type="file" accept="image/*" data-lphoto hidden></label></div>' +
        '<img class="lpreview" alt="Label photo" hidden><p class="hint" id="nl-status">Photograph the Nutrition Facts table straight on, in good light. The photo is read on this phone and isn\'t uploaded or saved.</p>' +
        '<details class="nmore" id="nl-raw" hidden><summary>Text that was read</summary><pre></pre></details></div>' : '') +
      field('Name', textIn('nf-name', f.name, 'e.g. Plain Greek yogurt 2%', 120)) +
      '<div class="row2">' + field('Brand', textIn('nf-brand', f.brand, '', 80), true) + field('Barcode', '<input id="nf-code" type="text" inputmode="numeric" maxlength="14" value="' + esc(f.code || '') + '">', true) + '</div>' +
      field('Serving as written on the label', textIn('nf-slabel', b.servingLabel, 'e.g. 3/4 cup (175 g)', 80), true) +
      '<div class="row2">' + field('Serving size', numIn('nf-sg', b.servingGrams, 'e.g. 175'), true) + field('Measured in', '<select id="nf-su">' + opt('g', 'grams (g)', b.liquid ? 'ml' : 'g') + opt('ml', 'millilitres (mL)', b.liquid ? 'ml' : 'g') + '</select>') + '</div>' +
      field('The values below are', '<select id="nf-per">' + opt('serving', 'Per serving (as on a Canadian label)', perLabel) + opt('100', 'Per 100 g / 100 mL', perLabel) + '</select>') +
      '<div class="nfields">' + NUTRIENTS.map((x) => field(x[1] + ' (' + x[2] + ')', numIn('nf-' + x[0], per[x[0]] != null ? per[x[0]] : '', ''), x[0] !== 'kcal')).join('') + '</div>' +
      '<p class="hint">' + (scan ? 'Check every number against the label before saving — text recognition makes mistakes. ' : '') + 'Leave values you don\'t have blank.</p>';
    sheet({
      title: existing ? 'Edit food' : scan ? 'Scan a nutrition label' : 'New food',
      html,
      footer: (existing ? '<button type="button" class="btn btn-danger-ghost" data-del>Delete</button>' : '<button type="button" class="btn" data-close>Cancel</button>') +
        '<button type="button" class="btn' + (existing ? ' btn-primary' : '') + '" data-save>' + (existing ? 'Save' : 'Save food') + '</button>' +
        (existing ? '' : '<button type="button" class="btn btn-primary" data-save-add>Save & ' + (ctx.mode === 'collect' ? 'use' : 'add') + '</button>'),
      noRender: !!ctx.mode,
      onDelete: existing ? async () => {
        const ok = await HT.confirm({ title: 'Delete food?', message: 'Delete <b>' + esc(existing.name) + '</b> from your foods? Diary entries and recipes that used it keep their values.', confirmLabel: 'Delete', danger: true });
        if (!ok) return false;
        D().foods = D().foods.filter((x) => x.id !== existing.id);
        HT.toast('Food deleted');
      } : null,
      onMount: (wrap, close) => {
        const read = () => {
          const name = val(wrap, '#nf-name');
          if (!name) { HT.toast('Enter a name'); HT.$('#nf-name', wrap).focus(); return null; }
          const n = {};
          for (const x of NUTRIENTS) {
            const raw = val(wrap, '#nf-' + x[0]);
            if (raw === '') continue;
            const v = nonneg(raw);
            if (v == null) { HT.toast(x[1] + ' can\'t be negative'); return null; }
            n[x[0]] = v;
          }
          if (!Object.keys(n).length) { HT.toast('Enter at least the calories'); return null; }
          const code = val(wrap, '#nf-code').replace(/\D/g, '');
          if (code && !/^\d{6,14}$/.test(code)) { HT.toast('A barcode is 8 to 14 digits'); return null; }
          const sg = val(wrap, '#nf-sg');
          if (sg !== '' && pos(sg) == null) { HT.toast('Serving size must be above 0'); return null; }
          const per100 = val(wrap, '#nf-per') === '100';
          if (!per100 && pos(sg) == null && !val(wrap, '#nf-slabel')) { /* allowed: values per "1 serving" without grams */ }
          return {
            name, brand: val(wrap, '#nf-brand'), code,
            source: existing ? existing.source === 'off' ? 'custom' : existing.source : scan ? 'label' : 'custom',
            basis: normBasis({ per100: per100 ? n : null, perServing: per100 ? null : n, servingGrams: sg, servingLabel: val(wrap, '#nf-slabel') || (sg ? sg + ' ' + val(wrap, '#nf-su') : ''), liquid: val(wrap, '#nf-su') === 'ml' }),
          };
        };
        const save = (andAdd) => {
          const data = read();
          if (!data) return;
          let food;
          if (existing) { food = D().foods.find((x) => x.id === existing.id); Object.assign(food, data); }
          else {
            food = normFood(Object.assign({ createdAt: new Date().toISOString() }, data));
            const same = data.code && D().foods.find((x) => x.code === data.code);
            if (same) D().foods = D().foods.filter((x) => x !== same); // replace a cached / earlier product with the same barcode
            D().foods.push(food);
          }
          HT.save();
          close();
          HT.toast(existing ? 'Food saved' : 'Saved to your foods');
          if (andAdd) setTimeout(() => N.openAmount(foodItem(food), ctx), 230);
          else HT.render();
        };
        wrap.addEventListener('click', (e) => {
          if (e.target.closest('[data-save-add]')) save(true);
          else if (e.target.closest('[data-save]')) save(false);
        });
        wrap.addEventListener('change', async (e) => {
          if (!e.target.matches('[data-lphoto]') || !e.target.files[0]) return;
          const file = e.target.files[0];
          const img = HT.$('.lpreview', wrap), status = HT.$('#nl-status', wrap);
          img.src = URL.createObjectURL(file); img.hidden = false;
          status.textContent = 'Loading text recognition (first time downloads about 7 MB)…';
          try {
            const T = await loadTesseract();
            const res = await T.recognize(await shrinkImage(file, 2000), 'eng', { logger: (m) => { if (m.status === 'recognizing text') status.textContent = 'Reading the label… ' + Math.round(m.progress * 100) + '%'; } });
            const text = res && res.data ? res.data.text : '';
            const p = N.parseLabel(text);
            const raw = HT.$('#nl-raw', wrap);
            raw.hidden = false; HT.$('pre', raw).textContent = text;
            const found = Object.keys(p.n);
            HT.$('#nf-per', wrap).value = 'serving';
            found.forEach((k) => { HT.$('#nf-' + k, wrap).value = p.n[k]; });
            if (p.servingAmount) { HT.$('#nf-sg', wrap).value = p.servingAmount; HT.$('#nf-su', wrap).value = p.servingUnit; }
            if (p.servingLabel && !val(wrap, '#nf-slabel')) HT.$('#nf-slabel', wrap).value = p.servingLabel;
            status.textContent = found.length ? 'Filled in ' + plural(found.length, 'value') + '. Check each one against the label and fix anything that\'s wrong.' : 'Couldn\'t find nutrition values in that photo. Try a sharper, straight-on photo, or type the values in.';
          } catch (err) {
            status.textContent = (err && err.message ? err.message : 'Text recognition failed.') + ' You can still type the values in.';
          }
        });
      },
    });
  };

  /* ---------- barcode scanner ---------- */

  N.openScanner = (ctx) => {
    let stream = null, timer = null, done = false;
    const stop = () => { done = true; clearTimeout(timer); if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; };
    sheet({
      title: 'Scan a barcode',
      html: '<div class="scan-box"><video playsinline muted autoplay></video><div class="scan-frame"></div><canvas hidden></canvas></div>' +
        '<p class="note" id="ns-status">Starting the camera…</p><div id="ns-result"></div>' +
        '<form class="quickadd" data-ncode><input id="ns-code" type="text" inputmode="numeric" maxlength="14" placeholder="Or type the barcode number" aria-label="Barcode number"><button type="submit" class="btn">Look up</button></form>' +
        '<label class="btn wide file-btn"><span>Scan from a photo instead</span><input type="file" accept="image/*" data-bphoto hidden></label>' +
        '<p class="hint">Product data comes from Open Food Facts, a free community database. Only the barcode number is sent.</p>',
      footer: '<button type="button" class="btn" data-close>Close</button>',
      noRender: true,
      onClose: stop,
      onMount: (wrap, close) => {
        const status = HT.$('#ns-status', wrap), video = HT.$('video', wrap), canvas = HT.$('canvas', wrap), result = HT.$('#ns-result', wrap);
        const setStatus = (t) => { status.textContent = t; };
        const lookup = async (raw) => {
          const code = normaliseCode(raw);
          if (!N.validGtin(code)) { setStatus('That doesn\'t look like a valid UPC/EAN barcode (' + raw + '). Check the digits.'); return; }
          stop();
          HT.$('#ns-code', wrap).value = code;
          setStatus('Looking up ' + code + '…');
          result.innerHTML = '';
          try {
            const r = await N.lookupBarcode(code);
            if (r.food && N.units(r.food.basis).length) { close(); setTimeout(() => N.openAmount(foodItem(r.food), ctx), 230); return; }
            setStatus(r.food ? 'Found "' + r.food.name + '", but Open Food Facts has no nutrition values for it.' : 'Barcode ' + code + ' isn\'t in Open Food Facts.');
            result.innerHTML = '<div class="btn-row"><button type="button" class="btn" data-nr="label">Scan its label</button><button type="button" class="btn" data-nr="search">Search by name</button><button type="button" class="btn" data-nr="new">Enter it myself</button></div>';
            result.dataset.code = code;
          } catch (err) {
            setStatus(err.message);
            result.innerHTML = '<button type="button" class="btn" data-nr="retry">Try again</button>';
            result.dataset.code = code;
          }
        };
        wrap.addEventListener('click', (e) => {
          const b = e.target.closest('[data-nr]');
          if (!b) return;
          const code = result.dataset.code;
          if (b.dataset.nr === 'retry') lookup(code);
          else { close(); setTimeout(() => (b.dataset.nr === 'search' ? N.openPicker(ctx) : N.openFoodForm(null, ctx, b.dataset.nr === 'label', code)), 230); }
        });
        wrap.addEventListener('submit', (e) => { if (e.target.matches('[data-ncode]')) { e.preventDefault(); lookup(val(wrap, '#ns-code')); } });
        wrap.addEventListener('change', async (e) => {
          if (!e.target.matches('[data-bphoto]') || !e.target.files[0]) return;
          stop();
          setStatus('Reading the barcode in the photo…');
          const img = new Image();
          try {
            await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('Couldn\'t open that photo.')); img.src = URL.createObjectURL(e.target.files[0]); });
            const code = await decodeFrom(img, canvas);
            if (code) lookup(code); else setStatus('No barcode found in that photo. Try a closer, sharper photo, or type the number.');
          } catch (err) { setStatus(err.message || 'Couldn\'t read that photo.'); }
        });
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { setStatus('This browser can\'t use the camera here. Type the barcode or use a photo.'); return; }
        navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false }).then((s) => {
          if (done) { s.getTracks().forEach((t) => t.stop()); return; }
          stream = s;
          video.srcObject = s;
          return video.play().then(() => {
            setStatus('Point the camera at the barcode.');
            const tick = async () => {
              if (done) return;
              try {
                const code = video.readyState >= 2 ? await decodeFrom(video, canvas) : null;
                if (code && !done) { if (navigator.vibrate) navigator.vibrate(30); lookup(code); return; }
              } catch (err) { setStatus(err.message); return; }
              timer = setTimeout(tick, 300);
            };
            tick();
          });
        }).catch((err) => {
          setStatus(err && err.name === 'NotAllowedError' ? 'Camera access was blocked. Allow it in your browser settings, or type the barcode / use a photo.' : 'Couldn\'t start the camera. Type the barcode or use a photo.');
        });
      },
    });
  };

  /* ---------- meal photo ---------- */

  N.openPhoto = (ctx) => {
    let items = [], analysed = false, busy = false, note = '';
    const hasToken = !!N.token();
    const itemRow = (it, i) => {
      const n = N.compute(it.basis, it.amount, it.unit) || {};
      const units = N.units(it.basis);
      return '<div class="pitem" data-i="' + i + '"><div class="pitem-h"><input type="text" data-iname="' + i + '" maxlength="120" value="' + esc(it.name) + '" aria-label="Food name">' +
        '<button type="button" class="icon-btn sm" data-irm="' + i + '" aria-label="Remove ' + esc(it.name) + '">' + icon.x + '</button></div>' +
        '<div class="pitem-b"><input type="number" inputmode="decimal" min="0" step="any" data-iamt="' + i + '" value="' + it.amount + '" aria-label="Amount">' +
        '<select data-iunit="' + i + '">' + units.map((u) => opt(u, unitLabel(u, 2), it.unit)).join('') + '</select>' +
        '<span class="pitem-n">' + (hasN(n) ? esc(macroLine(n)) : 'No nutrition data — edit or replace') + '</span></div>' +
        (it.prob != null ? '<div class="hint">Recognised as "' + esc(it.name) + '" (' + Math.round(it.prob * 100) + '% confidence)</div>' : '') + '</div>';
    };
    const totals = () => N.total(items.map((it) => ({ n: N.compute(it.basis, it.amount, it.unit) || {} })));
    const body = () => '<div class="btn-row"><label class="btn btn-primary file-btn">' + icon.camera + '<span>Take photo</span><input type="file" accept="image/*" capture="environment" data-mphoto hidden></label>' +
      '<label class="btn file-btn"><span>Choose photo</span><input type="file" accept="image/*" data-mphoto hidden></label></div>' +
      '<img class="lpreview" id="np-img" alt="Meal photo" hidden>' +
      (hasToken ? '<button type="button" class="btn wide" data-analyse hidden>Identify foods with LogMeal</button>'
        : '<p class="hint">Automatic recognition uses LogMeal and needs your own LogMeal token (Nutrition → Settings). Without it, build the meal below from search, your foods or quick add — the photo is only for your reference and isn\'t saved.</p>') +
      '<p class="note" id="np-status">' + esc(note) + '</p>' +
      '<div id="np-items">' + items.map(itemRow).join('') + '</div>' +
      '<button type="button" class="btn wide" data-iadd>' + icon.plus + '<span>Add a food</span></button>' +
      (items.length ? '<div class="panel-card tight gap-top"><h3>Meal total</h3>' + nutrientTable(totals().n) + '</div>' : '') +
      '<p class="hint gap-top"><b>These are estimates.</b> Photos can\'t show exact portion sizes, cooking oils, sauces or hidden ingredients. Adjust names and amounts, remove anything wrong, then confirm.</p>' +
      '<div class="row2">' + field('Meal', mealSelect('np-meal', ctx.meal || defaultMeal())) + field('Date', '<input id="np-date" type="date" max="' + HT.today() + '" value="' + (ctx.date || HT.today()) + '">') + '</div>';
    sheet({
      title: 'Photograph your meal',
      html: body(),
      saveLabel: 'Confirm and save',
      noRender: false,
      onMount: (wrap) => {
        const redraw = () => {
          const keep = { meal: val(wrap, '#np-meal'), date: val(wrap, '#np-date'), src: HT.$('#np-img', wrap).src, show: !HT.$('#np-img', wrap).hidden };
          const b = HT.$('.panel-body', wrap), top = b.scrollTop;
          b.innerHTML = body();
          HT.$('#np-meal', wrap).value = keep.meal; HT.$('#np-date', wrap).value = keep.date;
          if (keep.show) { const im = HT.$('#np-img', wrap); im.src = keep.src; im.hidden = false; const an = HT.$('[data-analyse]', wrap); if (an && !analysed) an.hidden = false; }
          b.scrollTop = top;
        };
        let file = null;
        wrap.addEventListener('change', (e) => {
          if (e.target.matches('[data-mphoto]') && e.target.files[0]) {
            file = e.target.files[0];
            const im = HT.$('#np-img', wrap);
            im.src = URL.createObjectURL(file); im.hidden = false;
            analysed = false;
            const an = HT.$('[data-analyse]', wrap);
            if (an) an.hidden = false;
            return;
          }
          const i = e.target.dataset.iunit;
          if (i != null) { const it = items[+i]; it.unit = e.target.value; it.amount = it.unit === 'g' || it.unit === 'ml' ? it.basis.servingGrams || 100 : 1; redraw(); }
        });
        wrap.addEventListener('input', (e) => {
          const ni = e.target.dataset.iname, ai = e.target.dataset.iamt;
          if (ni != null) items[+ni].name = e.target.value;
          if (ai != null) {
            const v = pos(e.target.value);
            if (v != null) {
              items[+ai].amount = v;
              const n = N.compute(items[+ai].basis, v, items[+ai].unit) || {};
              HT.$('[data-i="' + ai + '"] .pitem-n', wrap).textContent = hasN(n) ? macroLine(n) : 'No nutrition data — edit or replace';
              const tot = HT.$('.panel-card.tight .ntable', wrap);
              if (tot) tot.outerHTML = nutrientTable(totals().n);
            }
          }
        });
        wrap.addEventListener('click', async (e) => {
          const rm = e.target.closest('[data-irm]');
          if (rm) { items.splice(+rm.dataset.irm, 1); redraw(); return; }
          if (e.target.closest('[data-iadd]')) {
            N.openPicker({ mode: 'collect', onCollect: (line) => { items.push({ id: nid('it'), name: line.name, basis: line.basis, amount: line.amount, unit: line.unit, prob: null }); setTimeout(redraw, 240); } });
            return;
          }
          if (e.target.closest('[data-analyse]') && file && !busy) {
            busy = true;
            const st = HT.$('#np-status', wrap);
            st.textContent = 'Sending the photo to LogMeal…';
            e.target.closest('[data-analyse]').disabled = true;
            try {
              const r = await N.analyzePhoto(file);
              items = items.concat(r.items);
              analysed = true;
              note = r.items.length ? 'Found ' + plural(r.items.length, 'food') + '.' + (r.nutError ? ' ' + r.nutError + ' Replace them with foods from search to get values.' : ' Check each one.') : 'LogMeal didn\'t recognise any food in that photo.';
            } catch (err) { note = err.message; }
            busy = false;
            redraw();
          }
        });
      },
      onSave: (wrap) => {
        const usable = items.filter((it) => hasN(N.compute(it.basis, it.amount, it.unit) || {}));
        if (!items.length) { HT.toast('Add at least one food'); return false; }
        if (usable.length < items.length) { HT.toast('Remove or replace foods without nutrition data first'); return false; }
        if (items.some((it) => !it.name.trim())) { HT.toast('Every food needs a name'); return false; }
        const date = val(wrap, '#np-date'), meal = val(wrap, '#np-meal');
        if (!HT.isDateKey(date) || date > HT.today()) { HT.toast('Pick a date that isn\'t in the future'); return false; }
        items.forEach((it) => D().entries.push({
          id: nid('e'), date, time: '', meal, name: it.name.trim(), brand: '', source: 'photo', foodId: null, recipeId: null,
          estimate: it.prob != null, note: '', amount: it.amount, unit: it.unit, basis: it.basis, n: N.compute(it.basis, it.amount, it.unit), createdAt: new Date().toISOString(),
        }));
        HT.toast('Saved ' + plural(items.length, 'food') + ' to ' + mealName(meal));
      },
    });
  };

  /* ---------- recipes ---------- */

  N.openRecipe = (existing) => {
    const rc = existing ? JSON.parse(JSON.stringify(existing)) : { name: '', servings: 4, ingredients: [], notes: '' };
    const body = () => {
      const t = N.total(rc.ingredients.map((i) => ({ n: i.n })));
      const per = N.scale(t.n, 1 / (pos(rc.servings) || 1));
      return field('Recipe name', textIn('nr-name', rc.name, 'e.g. Chicken chili', 80)) +
        field('Servings it makes', numIn('nr-serv', rc.servings, 'e.g. 4')) +
        '<h3 class="sp">Ingredients</h3>' + (rc.ingredients.length ? '<ul class="dlist">' + rc.ingredients.map((i, k) => '<li><div class="drow"><span class="dname">' + esc(i.name) + '<small>' + esc(amountText(i) + ' · ' + macroLine(i.n)) + '</small></span>' +
          '<button type="button" class="icon-btn" data-ri-rm="' + k + '" aria-label="Remove ' + esc(i.name) + '">' + icon.x + '</button></div></li>').join('') + '</ul>' : '<p class="muted">No ingredients yet.</p>') +
        '<button type="button" class="btn wide" data-ri-add>' + icon.plus + '<span>Add ingredient</span></button>' +
        (rc.ingredients.length ? '<div class="tiles t2 gap-top">' + '<div class="tile"><div class="tile-v">' + fmtN('kcal', t.n.kcal) + '</div><div class="tile-l">Whole recipe</div></div>' +
          '<div class="tile"><div class="tile-v">' + fmtN('kcal', per.kcal) + '</div><div class="tile-l">Per serving</div></div></div><h3 class="sp">Per serving</h3>' + nutrientTable(per, Object.keys(t.missing).length ? 'Some ingredients don\'t list every nutrient, so those totals may be low.' : '') : '') +
        field('Notes', textIn('nr-notes', rc.notes, '', 400), true);
    };
    sheet({
      title: existing ? 'Edit recipe' : 'New recipe',
      html: body(),
      onDelete: existing ? async () => {
        const ok = await HT.confirm({ title: 'Delete recipe?', message: 'Delete <b>' + esc(existing.name) + '</b>? Diary entries already logged keep their values.', confirmLabel: 'Delete', danger: true });
        if (!ok) return false;
        D().recipes = D().recipes.filter((x) => x.id !== existing.id);
        HT.toast('Recipe deleted');
      } : null,
      onMount: (wrap) => {
        const keep = () => { rc.name = val(wrap, '#nr-name'); rc.servings = pos(val(wrap, '#nr-serv')) || rc.servings; rc.notes = val(wrap, '#nr-notes'); };
        const redraw = () => { const b = HT.$('.panel-body', wrap), top = b.scrollTop; b.innerHTML = body(); b.scrollTop = top; };
        wrap.addEventListener('change', (e) => { if (e.target.id === 'nr-serv') { keep(); redraw(); } });
        wrap.addEventListener('click', (e) => {
          const rm = e.target.closest('[data-ri-rm]');
          if (rm) { keep(); rc.ingredients.splice(+rm.dataset.riRm, 1); redraw(); return; }
          if (e.target.closest('[data-ri-add]')) {
            keep();
            N.openPicker({ mode: 'collect', excludeRecipe: existing && existing.id, onCollect: (line) => { rc.ingredients.push(Object.assign({ id: nid('ri') }, line)); setTimeout(redraw, 240); } });
          }
        });
      },
      onSave: (wrap) => {
        rc.name = val(wrap, '#nr-name'); rc.notes = val(wrap, '#nr-notes');
        const s = pos(val(wrap, '#nr-serv'));
        if (!rc.name) { HT.toast('Name the recipe'); return false; }
        if (s == null) { HT.toast('Servings must be above 0'); return false; }
        if (!rc.ingredients.length) { HT.toast('Add at least one ingredient'); return false; }
        rc.servings = s;
        const clean = HT.normalizeNutrition({ recipes: [rc] }).recipes[0];
        if (existing) { clean.id = existing.id; clean.createdAt = existing.createdAt; D().recipes = D().recipes.map((x) => (x.id === existing.id ? clean : x)); }
        else D().recipes.push(clean);
        HT.toast(existing ? 'Recipe saved' : 'Recipe added');
      },
    });
  };

  /* ---------- settings ---------- */

  N.openSettings = () => {
    const t = D().targets;
    const unit = (k) => (nutr(k) || [])[2];
    sheet({
      title: 'Nutrition settings',
      html: '<h3>Daily targets</h3><p class="hint gap-bottom">Optional. Use your own numbers or ones from your clinician or dietitian — the app doesn\'t set targets for you.</p>' +
        '<div class="nfields">' + TARGETS.map((x) => field(x[1] + ' (' + unit(x[0]) + ')', numIn('nt-' + x[0], t[x[0]], 'No target'), true)).join('') + '</div>' +
        '<h3 class="sp">Meal categories</h3><ul class="dlist" id="nm-list">' + D().meals.map((m) => '<li><div class="drow"><span class="dname">' + esc(m.name) + '</span>' +
          (DEFAULT_MEALS.some((d) => d[0] === m.id) ? '' : '<button type="button" class="icon-btn" data-meal-rm="' + m.id + '" aria-label="Remove ' + esc(m.name) + '">' + icon.x + '</button>') + '</div></li>').join('') + '</ul>' +
        '<div class="add-inline"><input id="nm-new" type="text" maxlength="30" placeholder="e.g. Pre-workout"><button type="button" class="btn" data-meal-add>Add</button></div>' +
        '<h3 class="sp">Online services</h3>' +
        '<div class="switch-row"><div><div class="sw-title">Open Food Facts lookups</div><div class="hint">Barcode lookups and product search. Sends only the barcode or search words.</div></div><label class="switch"><input type="checkbox" id="ns-online"' + (D().settings.online ? ' checked' : '') + '><span></span></label></div>' +
        field('LogMeal API token (for meal photos)', '<input id="ns-token" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your APIUser token" value="' + esc(N.token()) + '">', true) +
        '<p class="hint">Get one from LogMeal (logmeal.com/api — free 30-day trial, then paid). It is stored only on this device, is sent only to LogMeal with meal photos, and is not included in backups. Leave blank to build meals by hand.</p>',
      onMount: (wrap) => {
        wrap.addEventListener('click', async (e) => {
          if (e.target.closest('[data-meal-add]')) {
            const name = val(wrap, '#nm-new');
            if (!name) { HT.toast('Name the meal'); return; }
            if (D().meals.some((m) => m.name.toLowerCase() === name.toLowerCase())) { HT.toast('That meal already exists'); return; }
            const m = { id: nid('meal'), name };
            D().meals.push(m);
            HT.save();
            HT.$('#nm-list', wrap).insertAdjacentHTML('beforeend', '<li><div class="drow"><span class="dname">' + esc(name) + '</span><button type="button" class="icon-btn" data-meal-rm="' + m.id + '" aria-label="Remove ' + esc(name) + '">' + icon.x + '</button></div></li>');
            HT.$('#nm-new', wrap).value = '';
            HT.toast(name + ' added');
          }
          const rm = e.target.closest('[data-meal-rm]');
          if (rm) {
            const m = D().meals.find((x) => x.id === rm.dataset.mealRm);
            const count = D().entries.filter((x) => x.meal === m.id).length;
            const ok = await HT.confirm({ title: 'Remove meal category?', message: 'Remove <b>' + esc(m.name) + '</b>?' + (count ? ' Its ' + plural(count, 'entry') + ' move to Snacks.' : ''), confirmLabel: 'Remove' });
            if (!ok) return;
            D().entries.forEach((x) => { if (x.meal === m.id) x.meal = 'snacks'; });
            D().meals = D().meals.filter((x) => x.id !== m.id);
            HT.save();
            rm.closest('li').remove();
          }
        });
      },
      onSave: (wrap) => {
        const next = {};
        for (const x of TARGETS) {
          const raw = val(wrap, '#nt-' + x[0]);
          if (raw !== '' && pos(raw) == null) { HT.toast(x[1] + ' target must be above 0, or blank'); return false; }
          next[x[0]] = pos(raw);
        }
        D().targets = next;
        D().settings.online = HT.$('#ns-online', wrap).checked;
        setToken(val(wrap, '#ns-token'));
        HT.toast('Nutrition settings saved');
      },
    });
  };

  /* ---------- screens ---------- */

  const SUB = [['', 'Diary'], ['trends', 'Trends'], ['foods', 'Foods'], ['recipes', 'Recipes']];
  const subnav = (cur) => '<div class="segmented gap-bottom" role="tablist">' + SUB.map((t) => '<a href="#/nutrition' + (t[0] ? '/' + t[0] : '') + '"' + (t[0] === cur ? ' aria-current="page"' : '') + '>' + t[1] + '</a>').join('') + '</div>';
  const head = (cur) => (HT.health ? HT.health.head('Nutrition', '<button type="button" class="btn" data-action="n-settings">' + icon.settings + '<span>Settings</span></button>') + HT.health.subnav('nutrition')
    : '<header class="page-head"><div><div class="eyebrow">Health</div><h1>Nutrition</h1></div></header>') + subnav(cur);

  const progress = (k, v, target, limit) => {
    const pct = target ? Math.min(100, ((v || 0) / target) * 100) : 0;
    const over = limit && target && (v || 0) > target;
    return '<div class="nbar"><div class="nbar-t"><span>' + (nutr(k) ? nutr(k)[1] : k) + '</span><b>' + fmtN(k, v || 0) + (target ? ' <small>/ ' + fmtN(k, target) + (limit ? ' limit' : '') + '</small>' : '') + '</b></div>' +
      (target ? '<div class="fbar' + (over ? ' over' : '') + '"><i style="width:' + pct + '%"></i></div>' : '') + '</div>';
  };

  function diary() {
    const key = N.vs.day || HT.today();
    const today = HT.today();
    const tot = N.dayTotal(key);
    const t = D().targets;
    const n = tot.n;
    let html = head('') + '<div class="hday"><button type="button" class="icon-btn" data-action="n-day" data-d="-1" aria-label="Previous day">' + icon.back + '</button>' +
      '<div class="hday-l"><b>' + (key === today ? 'Today' : esc(longDate(key))) + '</b>' + (key === today ? '<span>' + esc(longDate(key)) + '</span>' : '<button type="button" class="linkish" data-action="n-day" data-d="0">Back to today</button>') + '</div>' +
      '<button type="button" class="icon-btn" data-action="n-day" data-d="1" aria-label="Next day"' + (key >= today ? ' disabled' : '') + '>' + icon.next + '</button></div>';

    const kcal = n.kcal || 0;
    html += '<section class="panel-card ncal"><div class="ncal-top"><div><div class="tile-l">Calories</div><div class="w-big">' + Math.round(kcal).toLocaleString() + '<small> kcal</small></div>' +
      (t.kcal ? '<div class="muted">' + (kcal <= t.kcal ? Math.round(t.kcal - kcal).toLocaleString() + ' left of ' + Math.round(t.kcal).toLocaleString() : Math.round(kcal - t.kcal).toLocaleString() + ' over ' + Math.round(t.kcal).toLocaleString()) + '</div>'
        : '<button type="button" class="linkish" data-action="n-settings">Set daily targets</button>') + '</div>' +
      '<button type="button" class="btn btn-primary" data-action="n-add">' + icon.plus + '<span>Add food</span></button></div>' +
      (t.kcal ? '<div class="fbar big' + (kcal > t.kcal ? ' over' : '') + '"><i style="width:' + Math.min(100, (kcal / t.kcal) * 100) + '%"></i></div>' : '') +
      '<div class="nmacros">' + progress('protein', n.protein, t.protein) + progress('carbs', n.carbs, t.carbs) + progress('fat', n.fat, t.fat) + '</div>' +
      '<details class="nmore"><summary>Fibre, sugars, sodium and more</summary>' + progress('fibre', n.fibre, t.fibre) + progress('sugar', n.sugar, t.sugar, true) + progress('sodium', n.sodium, t.sodium, true) +
      NUTRIENTS.filter((x) => !MAIN.includes(x[0]) && !['fibre', 'sugar', 'sodium'].includes(x[0]) && n[x[0]] != null).map((x) => '<div class="frow"><span>' + x[1] + '</span><b>' + fmtN(x[0], n[x[0]]) + '</b></div>').join('') + '</details>' +
      (tot.count && Object.keys(tot.missing).some((k) => MAIN.includes(k)) ? '<p class="hint">Some foods don\'t list every value, so totals may be low.</p>' : '') +
      (N.entriesOn(key).some((e) => e.estimate) ? '<p class="hint">Includes photo estimates.</p>' : '') + '</section>';

    html += '<div class="nquick">' + '<button type="button" class="btn" data-action="n-scan">' + icon.barcode + '<span>Scan barcode</span></button>' +
      '<button type="button" class="btn" data-action="n-photo">' + icon.camera + '<span>Meal photo</span></button>' +
      '<button type="button" class="btn" data-action="n-label">' + icon.label + '<span>Scan label</span></button>' +
      '<button type="button" class="btn" data-action="n-quick">' + icon.plus + '<span>Quick add</span></button></div>';

    D().meals.forEach((m) => {
      const list = N.entriesOn(key).filter((e) => e.meal === m.id);
      const mt = N.total(list);
      html += '<section class="nmeal"><div class="widget-h"><h2 class="section-title">' + esc(m.name) + (list.length ? ' · ' + fmtN('kcal', mt.n.kcal || 0) : '') + '</h2>' +
        '<button type="button" class="linkish" data-action="n-add" data-meal="' + m.id + '">+ Add</button></div>' +
        (list.length ? '<ul class="dlist panel-card tight">' + list.map((e) => '<li data-id="' + e.id + '"><button type="button" class="drow" data-action="n-edit"><span class="dname">' + esc(e.name) + (e.estimate ? ' <em class="tag est">est.</em>' : '') +
          '<small>' + esc(amountText(e) + (e.brand ? ' · ' + e.brand : '')) + '</small><small>' + esc(macroLine(e.n)) + '</small></span><span class="chev">' + icon.next + '</span></button></li>').join('') + '</ul>' : '') + '</section>';
    });
    html += '<p class="hint center gap-top">Nutrition values come from product labels, Open Food Facts or estimates you confirm. They\'re for your own tracking, not medical advice.</p>';
    return html;
  }

  function trends() {
    const today = HT.today();
    const days = N.vs.period;
    const from = HT.addDays(today, -days + 1);
    const p = N.period(from, today);
    const t = D().targets;
    let html = head('trends') + '<div class="segmented gap-bottom">' + [[7, 'Week'], [30, 'Month'], [90, '3 months']].map((x) => '<button type="button" data-action="n-period" data-v="' + x[0] + '" aria-pressed="' + (x[0] === days) + '">' + x[1] + '</button>').join('') + '</div>';
    if (!p.days) return html + '<section class="empty"><h2>No food logged in this period</h2><p>Trends appear once you log food. Days without entries are left out rather than counted as zero.</p><button type="button" class="btn btn-primary btn-lg" data-action="n-add">' + icon.plus + '<span>Add food</span></button></section>';
    const avg = (k) => (p.avg[k] == null ? '—' : fmtN(k, p.avg[k]));
    html += '<p class="hint gap-bottom">Averages are per logged day (' + p.days + ' of ' + days + ' days had entries).</p>' +
      '<div class="tiles t2">' + '<div class="tile"><div class="tile-v">' + avg('kcal') + '</div><div class="tile-l">Avg calories' + (t.kcal ? ' · target ' + fmtN('kcal', t.kcal) : '') + '</div></div>' +
      '<div class="tile"><div class="tile-v">' + avg('protein') + '</div><div class="tile-l">Avg protein' + (t.protein ? ' · target ' + fmtN('protein', t.protein) : '') + '</div></div>' +
      '<div class="tile"><div class="tile-v">' + avg('carbs') + '</div><div class="tile-l">Avg carbohydrate</div></div>' + '<div class="tile"><div class="tile-v">' + avg('fat') + '</div><div class="tile-l">Avg fat</div></div></div>';
    const hits = [];
    if (p.hit.kcal != null) hits.push('<div class="frow"><span>Calories within 10% of target</span><b>' + p.hit.kcal + ' of ' + plural(p.days, 'logged day') + '</b></div>');
    if (p.hit.protein != null) hits.push('<div class="frow"><span>Protein target reached</span><b>' + p.hit.protein + ' of ' + plural(p.days, 'logged day') + '</b></div>');
    ['fibre', 'sugar', 'sodium'].forEach((k) => { if (p.avg[k] != null) hits.push('<div class="frow"><span>Avg ' + nutr(k)[1].toLowerCase() + '</span><b>' + fmtN(k, p.avg[k]) + '</b></div>'); });
    html += '<section class="panel-card"><h3>Targets</h3>' + (hits.length ? hits.join('') : '') + (t.kcal || t.protein ? '' : '<p class="muted">Set calorie and protein targets in Settings to see how often you reach them.</p>') + '</section>';

    // daily calories chart
    const logged = {};
    N.loggedDays(from, today).forEach((d) => { logged[d.date] = d.total.n.kcal; });
    const cols = [];
    const step = days > 31 ? 7 : 1;
    let peak = t.kcal || 0;
    for (let k = from; k <= today; k = HT.addDays(k, step)) {
      let v = null;
      if (step === 1) v = logged[k] != null ? logged[k] : null;
      else { const vals = []; for (let i = 0; i < 7; i++) { const kk = HT.addDays(k, i); if (logged[kk] != null) vals.push(logged[kk]); } v = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null; }
      if (v != null) peak = Math.max(peak, v);
      cols.push({ k, v });
    }
    html += '<section class="panel-card"><h3>' + (step === 1 ? 'Calories per day' : 'Average calories per logged day, by week') + '</h3><div class="bars' + (cols.length > 14 ? ' dense' : '') + '">' + cols.map((c, i) =>
      '<div class="bar-col' + (c.v == null ? ' muted-col' : '') + (i === cols.length - 1 ? ' now' : '') + '"><div class="bar-num">' + (c.v != null && cols.length <= 14 ? Math.round(c.v) : '') + '</div><div class="bar-track"><i class="' + (t.kcal && c.v != null && Math.abs(c.v - t.kcal) <= t.kcal * 0.1 ? 'full' : '') +
      '" style="height:' + (c.v != null && peak ? (c.v / peak) * 100 : 0) + '%"></i></div><span>' + (cols.length <= 14 || i % Math.ceil(cols.length / 8) === 0 ? (step === 1 && cols.length <= 7 ? HT.DAY_NAMES[HT.parseKey(c.k).getDay()].slice(0, 2) : shortDate(c.k).replace(' ', ' ')) : '') + '</span></div>').join('') + '</div>' +
      '<p class="hint">Faded bars = no food logged.' + (t.kcal ? ' Solid bars are within 10% of your calorie target.' : '') + '</p></section>';

    // weekly comparison with weight, workouts and supplements
    const W = HT.weight, H = HT.health;
    const weeks = [];
    const ws0 = HT.weekStart(today);
    for (let i = 0; i < Math.max(4, Math.ceil(days / 7)); i++) {
      const s = HT.addDays(ws0, -7 * i), e = HT.addDays(s, 6);
      const np = N.period(s, e > today ? today : e);
      const wd = W ? W.days().filter((d) => d.date >= s && d.date <= e) : [];
      weeks.push({
        s, np,
        wchange: wd.length >= 2 ? wd[wd.length - 1].kg - wd[0].kg : null,
        workouts: H ? H.workoutStats(s, e).count : null,
      });
    }
    html += '<section class="panel-card"><h3>Week by week</h3><div class="ntable-wrap"><table class="nweeks"><thead><tr><th>Week of</th><th>Days logged</th><th>Avg kcal</th><th>Avg protein</th><th>Weight change</th><th>Workouts</th></tr></thead><tbody>' +
      weeks.map((w) => '<tr><th>' + shortDate(w.s) + '</th><td>' + w.np.days + '</td><td>' + (w.np.avg.kcal != null ? Math.round(w.np.avg.kcal).toLocaleString() : '—') + '</td><td>' + (w.np.avg.protein != null ? Math.round(w.np.avg.protein) + ' g' : '—') + '</td>' +
        '<td>' + (w.wchange != null ? W.fmtDelta(w.wchange) : '—') + '</td><td>' + (w.workouts != null ? w.workouts : '—') + '</td></tr>').join('') + '</tbody></table></div>' +
      '<p class="hint">Weight change uses your first and last weigh-in days that week (needs two). This puts the numbers side by side; it doesn\'t prove one caused the other — water, salt and timing move the scale day to day.</p></section>';
    return html;
  }

  function foods() {
    const mine = D().foods.filter((f) => f.source !== 'off');
    const fav = D().foods.filter((f) => f.favourite);
    const scanned = D().foods.filter((f) => f.source === 'off' && !f.favourite);
    const row = (f) => '<li data-id="' + f.id + '"><button type="button" class="drow" data-action="n-food"><span class="dname">' + esc(f.name) + (f.favourite ? ' <span class="tag">★</span>' : '') +
      '<small>' + esc([f.brand, f.source === 'off' ? 'Open Food Facts' : f.source === 'label' ? 'From a label' : 'Your food', f.code].filter(Boolean).join(' · ')) + '</small></span><span class="chev">' + icon.next + '</span></button></li>';
    let html = head('foods') + '<div class="btn-row gap-bottom"><button type="button" class="btn btn-primary" data-action="n-newfood">' + icon.plus + '<span>New food</span></button><button type="button" class="btn" data-action="n-label">' + icon.label + '<span>Scan label</span></button></div>';
    if (!D().foods.length) return html + '<section class="empty"><h2>Your food database</h2><p>Foods you create, scan from a label or look up by barcode are kept here so you can log them again quickly — even offline.</p></section>';
    if (fav.length) html += '<h2 class="section-title">Favourites</h2><section class="panel-card tight"><ul class="dlist">' + fav.map(row).join('') + '</ul></section>';
    if (mine.length) html += '<h2 class="section-title">Your foods</h2><section class="panel-card tight"><ul class="dlist">' + mine.map(row).join('') + '</ul></section>';
    if (scanned.length) html += '<h2 class="section-title">Looked-up products</h2><section class="panel-card tight"><ul class="dlist">' + scanned.map(row).join('') + '</ul><p class="hint">Saved copies of Open Food Facts products, refreshed after 30 days.</p></section>';
    return html;
  }
  HT.actions['n-food'] = (el) => {
    const f = N.food(el.closest('[data-id]').dataset.id);
    if (!f) return;
    if (f.source === 'off') {
      sheet({
        title: f.name,
        html: '<p class="muted">' + esc([f.brand, f.code].filter(Boolean).join(' · ')) + '</p>' + nutrientTable(N.compute(f.basis, 1, N.units(f.basis)[0]) || {}, 'Per ' + (N.units(f.basis)[0] === 'serving' ? (f.basis.servingLabel || 'serving') : '100 ' + N.units(f.basis)[0]) + '. From Open Food Facts.') +
          '<div class="switch-row"><div><div class="sw-title">Favourite</div></div><label class="switch"><input type="checkbox" id="nfv"' + (f.favourite ? ' checked' : '') + '><span></span></label></div>' +
          '<div class="btn-row"><button type="button" class="btn btn-primary" data-log>Log it</button><button type="button" class="btn" data-copy>Make an editable copy</button></div>',
        footer: '<button type="button" class="btn btn-danger-ghost" data-del>Remove</button><button type="button" class="btn" data-close>Close</button>',
        onDelete: () => { D().foods = D().foods.filter((x) => x.id !== f.id); HT.toast('Removed'); },
        deleteLabel: 'Remove',
        onMount: (wrap) => {
          wrap.addEventListener('change', (e) => { if (e.target.id === 'nfv') { f.favourite = e.target.checked; HT.save(); } });
          wrap.addEventListener('click', (e) => {
            if (e.target.closest('[data-log]')) { HT.closeTopSheet(); setTimeout(() => N.openAmount(foodItem(f), {}), 230); }
            if (e.target.closest('[data-copy]')) { HT.closeTopSheet(); setTimeout(() => N.openFoodForm(Object.assign({}, f, { id: undefined, source: 'custom', code: '' }), {}, false), 230); }
          });
        },
      });
    } else N.openFoodForm(f, {}, false);
  };

  function recipes() {
    let html = head('recipes') + '<button type="button" class="btn btn-primary gap-bottom" data-action="n-recipe-new">' + icon.plus + '<span>New recipe</span></button>';
    if (!D().recipes.length) return html + '<section class="empty"><h2>No recipes yet</h2><p>Add ingredients and how many servings the recipe makes; the app works out nutrition per serving so you can log a serving in one tap.</p></section>';
    html += '<section class="panel-card tight"><ul class="dlist">' + D().recipes.map((rc) => {
      const per = N.recipeBasis(rc).perServing || {};
      return '<li data-id="' + rc.id + '"><div class="drow"><button type="button" class="dname linkrow" data-action="n-recipe-edit">' + esc(rc.name) + '<small>' + esc(plural(rc.ingredients.length, 'ingredient') + ' · ' + plural(rc.servings, 'serving')) + '</small><small>' + esc(macroLine(per)) + ' per serving</small></button>' +
        '<button type="button" class="btn btn-sm" data-action="n-recipe-log">' + icon.plus + '<span>Log</span></button></div></li>';
    }).join('') + '</ul></section>';
    return html;
  }

  HT.views.nutrition = (tab) => {
    if (tab === 'trends') return trends();
    if (tab === 'foods') return foods();
    if (tab === 'recipes') return recipes();
    return diary();
  };

  /* ---------- actions ---------- */

  const ctxNow = (el) => ({ date: HT.route.name === 'nutrition' ? N.vs.day || HT.today() : HT.today(), meal: (el && el.dataset && el.dataset.meal) || defaultMeal() });
  HT.actions['n-add'] = (el) => N.openPicker(ctxNow(el));
  HT.actions['n-scan'] = (el) => N.openScanner(ctxNow(el));
  HT.actions['n-photo'] = (el) => N.openPhoto(ctxNow(el));
  HT.actions['n-label'] = (el) => N.openFoodForm(null, ctxNow(el), true);
  HT.actions['n-quick'] = (el) => N.openQuick(ctxNow(el));
  HT.actions['n-newfood'] = () => N.openFoodForm(null, {}, false);
  HT.actions['n-settings'] = () => N.openSettings();
  HT.actions['n-edit'] = (el) => { const e = D().entries.find((x) => x.id === el.closest('[data-id]').dataset.id); if (e) N.editEntry(e); };
  HT.actions['n-recipe-new'] = () => N.openRecipe(null);
  HT.actions['n-recipe-edit'] = (el) => { const rc = N.recipe(el.closest('[data-id]').dataset.id); if (rc) N.openRecipe(rc); };
  HT.actions['n-recipe-log'] = (el) => { const rc = N.recipe(el.closest('[data-id]').dataset.id); if (rc) N.openAmount(recipeItem(rc), ctxNow(el)); };
  HT.actions['n-period'] = (el) => { N.vs.period = +el.dataset.v; HT.render(); };
  HT.actions['n-open'] = () => { location.hash = '#/nutrition'; };
  HT.actions['n-day'] = (el) => {
    const today = HT.today(), cur = N.vs.day || today, d = +el.dataset.d;
    N.vs.day = d === 0 ? today : HT.addDays(cur, d) > today ? today : HT.addDays(cur, d);
    HT.render();
  };

  /* ---------- Today widget ---------- */

  N.todayWidget = () => {
    const today = HT.today();
    const tot = N.dayTotal(today), t = D().targets, n = tot.n;
    const kcal = n.kcal || 0;
    const line = tot.count ? fmtN('kcal', kcal) + (t.kcal ? ' of ' + fmtN('kcal', t.kcal) : '') + ' · protein ' + fmtN('protein', n.protein || 0) + (t.protein ? ' of ' + fmtN('protein', t.protein) : '') : 'Nothing logged yet today';
    return '<section class="widget" data-widget="nutrition"><div class="widget-h"><h2 class="section-title">Nutrition</h2><a class="linkish" href="#/nutrition">Diary</a></div>' +
      '<div class="panel-card tight"><div class="wline"><span>' + esc(line) + '</span><button type="button" class="btn btn-sm" data-action="n-add">' + icon.plus + '<span>Add food</span></button></div>' +
      (t.kcal && tot.count ? '<div class="fbar gap-top' + (kcal > t.kcal ? ' over' : '') + '"><i style="width:' + Math.min(100, (kcal / t.kcal) * 100) + '%"></i></div>' : '') +
      '<div class="chips gap-top"><button type="button" class="chip" data-action="n-scan">' + icon.barcode + ' Scan</button><button type="button" class="chip" data-action="n-photo">' + icon.camera + ' Photo</button><button type="button" class="chip" data-action="n-quick">Quick add</button></div></div></section>';
  };

  /* ---------- link with Health daily metrics ----------
     On days with diary entries, the Health "Calories" and "Protein" metrics show the diary totals
     (read-only) instead of a separate number, so the same thing is never tracked twice. */
  if (HT.health) {
    const H = HT.health;
    const baseValue = H.metricValue, baseOpen = H.openMetric;
    const linked = (m) => m && (m.key === 'calories' || m.key === 'protein') && !m.trackerId;
    H.metricValue = (m, key) => {
      if (linked(m) && N.entriesOn(key).length) { const v = N.dayTotal(key).n[m.key === 'calories' ? 'kcal' : 'protein']; return v != null ? v : null; }
      return baseValue(m, key);
    };
    const toDiary = (key) => { N.vs.day = key; location.hash = '#/nutrition'; HT.toast('On days you log food, calories and protein come from the food diary'); };
    H.openMetric = (m, key) => {
      if (linked(m) && N.entriesOn(key).length) { toDiary(key); return; }
      return baseOpen(m, key);
    };
    const baseSet = H.setMetric;
    H.setMetric = (m, key, v) => {
      if (linked(m) && N.entriesOn(key).length) { toDiary(key); return; }
      return baseSet(m, key, v);
    };
  }
})();
