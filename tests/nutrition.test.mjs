import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadApp } from './load.mjs';

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} is not close to ${b}`);
const json = (x) => JSON.parse(JSON.stringify(x));
const fixture = (code) => JSON.parse(readFileSync(new URL(`./fixtures/off-${code}.json`, import.meta.url), 'utf8'));

test('v4 data upgrades to v5 with an empty nutrition section and nothing else changed', () => {
  const { HT } = loadApp();
  const v4 = { version: 4, trackers: [{ id: 't', name: 'Walk', type: 'boolean' }], entries: { '2026-10-01': { t: 1 } },
    weight: { entries: [{ date: '2026-10-01', kg: 80 }] }, health: { workouts: [{ date: '2026-10-01', type: 'run', duration: 30 }] } };
  const out = HT.migrate(v4);
  assert.equal(out.version, 5);
  assert.equal(out.trackers[0].name, 'Walk');
  assert.equal(out.weight.entries[0].kg, 80);
  assert.equal(out.health.workouts[0].duration, 30);
  assert.deepEqual(json(out.nutrition.entries), []);
  assert.deepEqual(json(out.nutrition.meals.map((m) => m.name)), ['Breakfast', 'Lunch', 'Dinner', 'Snacks']);
  assert.equal(out.nutrition.targets.kcal, null);
});

test('Open Food Facts product maps to per-100 g and per-serving values with correct units', () => {
  const { HT } = loadApp();
  const N = HT.nutrition;
  const f = N.fromOFF(fixture('0068100084245').product, '0068100084245');
  assert.equal(f.name, 'Smooth Peanut Butter');
  assert.equal(f.brand, 'Kraft');
  assert.equal(f.basis.servingGrams, 15);
  assert.equal(f.basis.per100.kcal, 600);
  near(f.basis.per100.sodium, 433.33); // OFF gives grams; stored as mg
  near(f.basis.per100.calcium, 66.67);
  assert.equal(f.basis.per100.transfat, undefined, 'not listed stays missing');
  assert.equal(f.basis.perServing.kcal, 90);
  assert.ok(f.allergens.includes('peanuts'));
  // amounts
  assert.equal(N.compute(f.basis, 1, 'serving').kcal, 90);
  assert.equal(N.compute(f.basis, 30, 'g').kcal, 180);
  assert.deepEqual(json(N.units(f.basis)), ['serving', 'g']);
});

test('products without a serving size still work by weight; missing products are recognised', () => {
  const { HT } = loadApp();
  const N = HT.nutrition;
  const nutella = N.fromOFF(fixture('3017620422003').product, '3017620422003');
  assert.deepEqual(json(N.units(nutella.basis)), ['g']);
  near(N.compute(nutella.basis, 37, 'g').kcal, (539 * 37) / 100, 0.5);
  assert.equal(N.compute(nutella.basis, 1, 'serving'), null);
});

test('barcode check digits are validated before any lookup', () => {
  const { HT } = loadApp();
  const N = HT.nutrition;
  assert.equal(N.validGtin('3017620422003'), true);
  assert.equal(N.validGtin('0068100084245'), true);
  assert.equal(N.validGtin('0068100084246'), false);
  assert.equal(N.validGtin('12345'), false);
});

test('cached products are used without going online', async () => {
  const { HT, ctx } = loadApp();
  const N = HT.nutrition;
  let calls = 0;
  ctx.fetch = async () => { calls++; return { ok: true, status: 200, json: async () => fixture('0068100084245') }; };
  ctx.navigator.onLine = true;
  const first = await N.lookupBarcode('0068100084245');
  assert.equal(first.food.name, 'Smooth Peanut Butter');
  const again = await N.lookupBarcode('0068100084245');
  assert.equal(again.food.id, first.food.id);
  assert.equal(calls, 1);
  ctx.fetch = async () => ({ ok: false, status: 404, json: async () => ({ status: 0, status_verbose: 'product not found' }) });
  assert.deepEqual(json(await N.lookupBarcode('0000000000000')), { notFound: true });
  ctx.fetch = async () => { throw new Error('offline'); };
  await assert.rejects(N.lookupBarcode('3017620422003'), /reach Open Food Facts|offline/);
});

test('Canadian bilingual Nutrition Facts text is read into per-serving values', () => {
  const { HT } = loadApp();
  const label = `Nutrition Facts / Valeur nutritive
Per 3/4 cup (175 g) / pour 3/4 tasse (175 g)
Calories 110 % Daily Value* / % valeur quotidienne*
Fat / Lipides 3 g 4 %
Saturated / saturés 2 g
+ Trans / trans 0 g 10 %
Carbohydrate / Glucides 8 g
Fibre / Fibres 0 g 0 %
Sugars / Sucres 7 g 7 %
Protein / Protéines 14 g
Cholesterol / Cholestérol 15 mg
Sodium 65 mg 3 %
Potassium 250 mg 7 %
Calcium 150 mg 12 %
Iron / Fer 0,1 mg 1 %`;
  const p = HT.nutrition.parseLabel(label);
  assert.equal(p.servingAmount, 175);
  assert.equal(p.servingUnit, 'g');
  assert.match(p.servingLabel, /3 4 cup \(175 g\)|3\/4 cup/);
  assert.deepEqual(json(p.n), { kcal: 110, fat: 3, satfat: 2, transfat: 0, carbs: 8, fibre: 0, sugar: 7, protein: 14, chol: 15, sodium: 65, potassium: 250, calcium: 150, iron: 0.1 });
});

test('US-style labels and mL servings are read too; nothing is invented', () => {
  const { HT } = loadApp();
  const p = HT.nutrition.parseLabel(`Nutrition Facts
Serving size 1 cup (240mL)
Calories 150
Total Fat 8g 10%
Saturated Fat 5g
Total Carbohydrate 12g 4%
Total Sugars 12g
Protein 8g
Sodium 120mg 5%`);
  assert.equal(p.servingAmount, 240);
  assert.equal(p.servingUnit, 'ml');
  assert.equal(p.n.kcal, 150);
  assert.equal(p.n.fat, 8);
  assert.equal(p.n.satfat, 5);
  assert.equal(p.n.carbs, 12);
  assert.equal(p.n.sugar, 12);
  assert.equal(p.n.protein, 8);
  assert.equal(p.n.sodium, 120);
  assert.equal(p.n.fibre, undefined);
  assert.equal(p.n.iron, undefined);
  assert.deepEqual(json(HT.nutrition.parseLabel('blurry photo of a table').n), {});
});

test('LogMeal responses become editable estimates that rescale with grams', () => {
  const { HT } = loadApp();
  const N = HT.nutrition;
  const seg = { imageId: 7, segmentation_results: [
    { food_item_position: 1, recognition_results: [{ id: 306, name: 'french fries', prob: 0.81 }] },
    { food_item_position: 2, recognition_results: [{ id: 11, name: 'ketchup', prob: 0.4 }] },
  ] };
  const nut = { nutritional_info_per_item: [
    { food_item_position: 1, serving_size: 150, nutritional_info: { calories: 470, totalNutrients: {
      PROCNT: { label: 'Protein', quantity: 5.1, unit: 'g' }, CHOCDF: { label: 'Carbs', quantity: 62, unit: 'g' }, FAT: { label: 'Fat', quantity: 22, unit: 'g' }, NA: { label: 'Sodium', quantity: 0.4, unit: 'g' } } } },
  ] };
  const items = N.logmealItems(seg, nut);
  assert.equal(items.length, 2);
  assert.equal(items[0].name, 'french fries');
  assert.equal(items[0].unit, 'g');
  assert.equal(items[0].amount, 150);
  const at150 = N.compute(items[0].basis, 150, 'g');
  near(at150.kcal, 470, 0.05);
  near(at150.sodium, 400, 0.5); // 0.4 g reported → 400 mg
  near(N.compute(items[0].basis, 75, 'g').kcal, 235, 0.05);
  assert.equal(items[1].hasNutrition, false, 'no invented values for items LogMeal had no data for');
  assert.equal(items[1].unit, 'portion');
});

test('day totals keep track of foods that do not list a nutrient', () => {
  const { HT } = loadApp();
  const N = HT.nutrition;
  HT.data.nutrition = HT.normalizeNutrition({ entries: [
    { date: '2026-10-10', meal: 'breakfast', name: 'Oats', amount: 1, unit: 'serving', basis: { perServing: { kcal: 150, protein: 5, carbs: 27, fat: 3, fibre: 4 } } },
    { date: '2026-10-10', meal: 'lunch', name: 'Soup', amount: 1, unit: 'serving', basis: { perServing: { kcal: 200, protein: 10 } } },
    { date: '2026-10-11', meal: 'dinner', name: 'Rice', amount: 200, unit: 'g', basis: { per100: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 } } },
  ] });
  const t = N.dayTotal('2026-10-10');
  assert.equal(t.n.kcal, 350);
  assert.equal(t.n.protein, 15);
  assert.equal(t.missing.carbs, 1);
  assert.equal(t.missing.fibre, 1);
  assert.equal(N.dayTotal('2026-10-11').n.kcal, 260);
});

test('period averages count logged days only and report target hits', () => {
  const { HT } = loadApp();
  const N = HT.nutrition;
  HT.data.nutrition = HT.normalizeNutrition({ targets: { kcal: 2000, protein: 120 }, entries: [
    { date: '2026-10-01', name: 'A', amount: 1, unit: 'serving', basis: { perServing: { kcal: 2050, protein: 130 } } },
    { date: '2026-10-03', name: 'B', amount: 1, unit: 'serving', basis: { perServing: { kcal: 1500, protein: 90 } } },
  ] });
  const p = N.period('2026-10-01', '2026-10-07');
  assert.equal(p.days, 2);
  assert.equal(p.avg.kcal, 1775);
  assert.equal(p.hit.kcal, 1);
  assert.equal(p.hit.protein, 1);
});

test('recipes give nutrition per serving from their ingredients', () => {
  const { HT } = loadApp();
  const N = HT.nutrition;
  const d = HT.normalizeNutrition({ recipes: [{ name: 'Chili', servings: 4, ingredients: [
    { name: 'Beef', amount: 500, unit: 'g', basis: { per100: { kcal: 250, protein: 26 } } },
    { name: 'Beans', amount: 2, unit: 'serving', basis: { perServing: { kcal: 220, protein: 14, fibre: 12 } } },
  ] }] });
  const rc = d.recipes[0];
  assert.equal(rc.ingredients[0].n.kcal, 1250);
  const per = N.recipeBasis(rc).perServing;
  near(per.kcal, (1250 + 440) / 4);
  near(per.protein, (130 + 28) / 4);
  near(per.fibre, 6);
});

test('entries keep their own copy of the values when the food changes or is deleted', () => {
  const { HT } = loadApp();
  const N = HT.nutrition;
  const food = N.fromOFF(fixture('0068100084245').product, '0068100084245');
  HT.data.nutrition.foods.push(food);
  HT.data.nutrition.entries.push(HT.normalizeNutrition({ entries: [{ date: '2026-10-12', name: food.name, foodId: food.id, amount: 2, unit: 'serving', basis: food.basis }] }).entries[0]);
  food.basis.perServing.kcal = 999;
  HT.data.nutrition.foods = [];
  assert.equal(N.dayTotal('2026-10-12').n.kcal, 180);
});

test('Health "Calories" and "Protein" metrics read the food diary instead of a second number', () => {
  const { HT } = loadApp();
  const H = HT.health, key = '2026-10-15';
  const cal = H.metrics().find((m) => m.key === 'calories');
  H.setMetric(cal, key, 1800); // a manually typed value from before
  assert.equal(H.metricValue(cal, key), 1800);
  HT.data.nutrition.entries.push(HT.normalizeNutrition({ entries: [{ date: key, name: 'Lunch', amount: 1, unit: 'serving', basis: { perServing: { kcal: 640, protein: 42 } } }] }).entries[0]);
  assert.equal(H.metricValue(cal, key), 640);
  assert.equal(H.metricValue(H.metrics().find((m) => m.key === 'protein'), key), 42);
  assert.equal(H.metricValue(cal, '2026-10-16'), null);
});

test('backups include the food diary, foods and recipes but never the LogMeal token', () => {
  const { HT, store } = loadApp();
  store.set('habits.logmealToken', 'secret-token');
  HT.data.nutrition = HT.normalizeNutrition({
    targets: { kcal: 2200 }, meals: [{ id: 'pre', name: 'Pre-workout' }],
    foods: [{ name: 'My bar', source: 'label', basis: { perServing: { kcal: 210 }, servingGrams: 55 } }],
    entries: [{ date: '2026-10-20', meal: 'pre', name: 'My bar', amount: 1, unit: 'serving', basis: { perServing: { kcal: 210 } } }],
  });
  const backup = JSON.parse(JSON.stringify(HT.exportData()));
  assert.equal(JSON.stringify(backup).includes('secret-token'), false);
  const before = json(HT.data.nutrition);
  HT.resetData();
  assert.equal(HT.data.nutrition.entries.length, 0);
  HT.importData(backup);
  assert.deepEqual(json(HT.data.nutrition), before);
  assert.equal(HT.data.nutrition.entries[0].meal, 'pre');
});

test('bad nutrition data is cleaned on load', () => {
  const { HT } = loadApp();
  const d = HT.normalizeNutrition({
    targets: { kcal: -5, protein: 'abc' },
    foods: [{ name: '' }, { name: 'X', code: 'abc', image: 'javascript:alert(1)', basis: { per100: { kcal: -1, protein: 3 } } }],
    entries: [{ date: 'bad', name: 'Y' }, { date: '2026-10-01', name: 'Z', meal: 'nope', amount: -2, basis: { perServing: { kcal: 100 } } }],
  });
  assert.equal(d.targets.kcal, null);
  assert.equal(d.targets.protein, null);
  assert.equal(d.foods.length, 1);
  assert.equal(d.foods[0].code, '');
  assert.equal(d.foods[0].image, '');
  assert.deepEqual(json(d.foods[0].basis.per100), { protein: 3 });
  assert.equal(d.entries.length, 1);
  assert.equal(d.entries[0].meal, 'snacks');
  assert.equal(d.entries[0].amount, 1);
  assert.equal(d.entries[0].n.kcal, 100);
});
