import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load.mjs';

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} is not close to ${b}`);
const json = (x) => JSON.parse(JSON.stringify(x));

/* A day of food (built through the real normaliser) plus supplement routines. */
function setup(HT, { entries = [], routines = [], profile = { sex: 'm', age: 18, heightCm: 195.6, activity: 'active', goal: 'maintain' } } = {}) {
  HT.data.nutrition = HT.normalizeNutrition({ entries, profile });
  HT.data.health = HT.normalizeHealth({ routines });
  return { M: HT.micros, H: HT.health, N: HT.nutrition };
}
const food = (id, date, n, extra = {}) => Object.assign({ id, date, name: id, meal: 'lunch', basis: { perServing: n }, amount: 1, unit: 'serving' }, extra);
const supp = (id, name, rows, mult = 1) => ({ id, name, schedule: { mode: 'daily' }, startDate: '2026-01-01', facts: { rows, mult } });

test('food and supplement amounts add up once, with a breakdown by source', () => {
  const { HT } = loadApp();
  const t = HT.today();
  const { M, H } = setup(HT, {
    entries: [food('Spinach', t, { kcal: 40, magnesium: 150 }), food('Almonds', t, { kcal: 160, magnesium: 50 }), food('Rice', t, { kcal: 200 })],
    routines: [supp('mg', 'Magnesium glycinate', [{ k: 'magnesium', a: 200, u: 'mg' }])],
  });
  H.setIntake(HT.data.health.routines[0], t, 'taken');
  const x = M.day(t).n.magnesium;
  assert.equal(x.food, 200);
  assert.equal(x.supp, 200);
  assert.equal(x.total, 400, '200 mg food + 200 mg supplement = 400 mg');
  assert.equal(x.foodUnknown, 1, 'rice does not list magnesium: unknown, not zero');
  assert.deepEqual(json(x.src.map((s) => [s.kind, s.name, s.v])), [['supp', 'Magnesium glycinate', 200], ['food', 'Spinach', 150], ['food', 'Almonds', 50]]);
  // Marking it taken again doesn't add it twice.
  H.setIntake(HT.data.health.routines[0], t, 'taken');
  assert.equal(M.day(t).n.magnesium.total, 400);
  // Skipped / not logged supplements don't count.
  H.setIntake(HT.data.health.routines[0], t, 'skipped');
  assert.equal(M.day(t).n.magnesium.total, 200);
});

test('nothing listed means unknown; vitamin K uses the total or K1 + K2, never both', () => {
  const { HT } = loadApp();
  const t = HT.today();
  const { M } = setup(HT, { entries: [food('Bread', t, { kcal: 80 })] });
  const d = M.day(t);
  assert.equal(d.n.vitk.total, null);
  assert.equal(M.status(d.n.vitk, M.target('vitk')), 'unknown');
  assert.equal(M.val({ vitk1: 80, vitk2: 20 }, 'vitk'), 100);
  assert.equal(M.val({ vitk: 90, vitk1: 80, vitk2: 20 }, 'vitk'), 90, 'the listed total wins, so K1/K2 are not added again');
  assert.equal(M.val({}, 'vitk'), null);
  // A supplement listing only K2 counts toward vitamin K.
  setup(HT, { entries: [food('Kale', t, { vitk1: 120 })], routines: [supp('k2', 'K2', [{ k: 'vitk2', a: 100, u: 'µg' }])] });
  HT.health.setIntake(HT.data.health.routines[0], t, 'taken');
  assert.equal(M.day(t).n.vitk.total, 220);
});

test('unit conversions: mass units, IU only with a fixed conversion, DFE vs folic acid', () => {
  const { HT } = loadApp();
  const M = HT.micros;
  assert.equal(M.convert('magnesium', 0.2, 'g').v, 200);
  assert.equal(M.convert('magnesium', 200000, 'µg').v, 200);
  assert.equal(M.convert('selenium', 0.055, 'mg').v, 55);
  assert.equal(M.convert('vitd', 1000, 'iu').v, 25, '1000 IU vitamin D = 25 µg');
  assert.equal(M.convert('vitd', 0.025, 'mg').v, 25);
  // Vitamin A: retinol 0.3 µg RAE/IU; supplemental beta-carotene 0.15 µg RAE/IU and not preformed (doesn't count toward the UL).
  assert.deepEqual(json(M.convert('vita', 5000, 'iu_pre')), { v: 1500, ul: 1500 });
  assert.deepEqual(json(M.convert('vita', 5000, 'iu_bc')), { v: 750, ul: 0 });
  assert.deepEqual(json(M.convert('vita', 900, 'rae_mix')), { v: 900, ul: 900 });
  // Vitamin E: synthetic IU is 0.45 mg for intake but 0.9 mg toward the UL.
  assert.deepEqual(json(M.convert('vite', 400, 'iu_syn')), { v: 180, ul: 360 });
  assert.deepEqual(json(M.convert('vite', 100, 'iu_nat')), { v: 67, ul: 67 });
  assert.deepEqual(json(M.convert('b9', 400, 'fa')), { v: 680, ul: 400 });
  near(M.convert('b9', 680, 'dfe').ul, 400);
  // Incompatible units are refused rather than guessed.
  assert.equal(M.convert('magnesium', 100, 'iu'), null);
  assert.equal(M.convert('vita', 100, 'mg'), null);
  assert.equal(M.convert('zinc', -1, 'mg'), null);
  assert.ok(!M.units('zinc').some((u) => u[0] === 'iu'));
  // Facts × servings per dose.
  const f = M.factsN(M.normFacts({ rows: [{ k: 'vitd', a: 1000, u: 'iu' }, { k: 'zinc', a: 10, u: 'mg' }], mult: 2 }));
  assert.deepEqual(json(f.n), { vitd: 50, zinc: 20 });
});

test('supplement facts are copied when taken: later label edits keep history unless applied', () => {
  const { HT } = loadApp();
  const t = HT.today(), y = HT.addDays(t, -1);
  const { M, H } = setup(HT, { routines: [supp('d', 'Vitamin D', [{ k: 'vitd', a: 25, u: 'µg' }])] });
  const x = HT.data.health.routines[0];
  H.setIntake(x, y, 'taken');
  x.facts = M.normFacts({ rows: [{ k: 'vitd', a: 50, u: 'µg' }] });
  H.setIntake(x, t, 'taken');
  assert.equal(M.day(y).n.vitd.total, 25, 'yesterday keeps the amount it was logged with');
  assert.equal(M.day(t).n.vitd.total, 50);
  assert.equal(M.applyFactsToPast(x), 2);
  assert.equal(M.day(y).n.vitd.total, 50);
  // A routine without facts counts as "no facts", not as zero.
  setup(HT, { routines: [{ id: 'fo', name: 'Fish oil', schedule: { mode: 'daily' } }] });
  H.setIntake(HT.data.health.routines[0], t, 'taken');
  const dd = M.day(t);
  assert.equal(dd.logged, true);
  assert.equal(dd.n.vitd.total, null);
  assert.equal(dd.n.vitd.suppNoFacts, 1);
});

test('editing and deleting food or supplement entries updates totals at once', () => {
  const { HT } = loadApp();
  const t = HT.today();
  const { M, H, N } = setup(HT, {
    entries: [food('Yogurt', t, { calcium: 300 }, { basis: { per100: { calcium: 120 } }, amount: 250, unit: 'g' })],
    routines: [supp('ca', 'Calcium', [{ k: 'calcium', a: 500, u: 'mg' }])],
  });
  assert.equal(M.day(t).n.calcium.total, 300);
  const e = HT.data.nutrition.entries[0];
  Object.assign(e, { amount: 500, n: N.compute(e.basis, 500, 'g') }); // what the edit sheet saves
  assert.equal(M.day(t).n.calcium.total, 600);
  H.setIntake(HT.data.health.routines[0], t, 'taken');
  assert.equal(M.day(t).n.calcium.total, 1100);
  HT.data.nutrition.entries = []; // entry deleted
  assert.equal(M.day(t).n.calcium.total, 500);
  assert.equal(M.day(t).n.calcium.food, null);
  H.setIntake(HT.data.health.routines[0], t, null); // supplement un-logged
  assert.equal(M.day(t).logged, false);
});

test('reference values follow age group and sex; height and goal never change vitamins', () => {
  const { HT } = loadApp();
  const { M } = setup(HT);
  let d = M.defaults();
  assert.equal(d.magnesium.target, 410);
  assert.equal(d.magnesium.type, 'RDA');
  assert.equal(d.magnesium.ul, 350);
  assert.equal(d.magnesium.ulBasis, 'supp');
  assert.equal(d.calcium.target, 1300, '14–18 group');
  assert.equal(d.vitk.type, 'AI');
  assert.equal(d.vitk.ul, null, 'no UL established');
  assert.equal(d.sodium.ulType, 'CDRR');
  assert.equal(d.fibre.target, 38);
  assert.match(d.magnesium.cat, /Males 14–18/);
  const vit = JSON.stringify(M.KEYS.map((k) => [d[k].target, d[k].ul]));
  HT.data.nutrition.profile = M.normProfile({ sex: 'm', age: 18, heightCm: 150, activity: 'sedentary', goal: 'gain' });
  assert.equal(JSON.stringify(M.KEYS.map((k) => [M.defaults()[k].target, M.defaults()[k].ul])), vit);
  HT.data.nutrition.profile = M.normProfile({ sex: 'f', age: 18 });
  d = M.defaults();
  assert.equal(d.magnesium.target, 360);
  assert.equal(d.iron.target, 15);
  HT.data.nutrition.profile = M.normProfile({ sex: 'm', age: 25 });
  assert.equal(M.defaults().calcium.target, 1000, '19–30 group');
  // Without sex: values that are the same for both sexes still apply; others wait for it.
  HT.data.nutrition.profile = M.normProfile({ age: 18 });
  d = M.defaults();
  assert.equal(d.vitd.target, 15);
  assert.equal(d.magnesium.target, null);
  assert.deepEqual(json(d.magnesium.needs), ['sex']);
  assert.equal(d.magnesium.ul, 350, 'upper limits do not depend on sex');
  HT.data.nutrition.profile = M.normProfile({ sex: 'm', age: 12 });
  assert.deepEqual(json(M.defaults().zinc.needs), ['under14']);
});

test('calories use the EER equation with height and weight; protein uses g per kg', () => {
  const { HT } = loadApp();
  const { M, N } = setup(HT);
  let d = M.defaults();
  assert.equal(d.kcal.target, null, 'needs a weigh-in');
  assert.deepEqual(json(d.kcal.needs), ['weight']);
  HT.weight.add({ date: HT.today(), kg: 90 });
  d = M.defaults();
  const eer = 88.5 - 61.9 * 18 + 1.26 * (26.7 * 90 + 903 * 1.956) + 25;
  assert.equal(d.kcal.target, Math.round(eer / 10) * 10);
  assert.equal(d.protein.target, Math.round(90 * 0.85));
  assert.equal(d.protein.type, 'RDA');
  near(d.fat.target, (d.kcal.target * 0.3) / 9, 1);
  assert.ok(d.carbs.target >= (d.kcal.target * 0.45) / 4 - 1 && d.carbs.target <= (d.kcal.target * 0.65) / 4 + 1);
  HT.data.nutrition.profile.goal = 'gain';
  d = M.defaults();
  assert.equal(d.kcal.target, Math.round((eer * 1.1) / 10) * 10);
  assert.equal(d.protein.target, Math.round(90 * 1.6));
  assert.equal(d.protein.type, 'Guideline');
  assert.equal(N.targets().kcal, d.kcal.target, 'the diary uses the same targets');
});

test('custom targets change comparisons only, can be switched off and restored', () => {
  const { HT } = loadApp();
  const t = HT.today();
  const { M } = setup(HT, { entries: [food('Seeds', t, { magnesium: 250 })] });
  const before = JSON.stringify(HT.data.nutrition.entries);
  let tg = M.target('magnesium');
  assert.equal(M.status(M.day(t).n.magnesium, tg), 'below');
  HT.data.nutrition.targets.magnesium = 250;
  tg = M.target('magnesium');
  assert.equal(tg.type, 'Custom');
  assert.equal(tg.target, 250);
  assert.equal(M.status(M.day(t).n.magnesium, tg), 'within');
  assert.equal(M.day(t).n.magnesium.total, 250, 'intake unchanged');
  assert.equal(JSON.stringify(HT.data.nutrition.entries), before);
  HT.data.nutrition.useCustom = false;
  assert.equal(M.target('magnesium').target, 410);
  HT.data.nutrition.useCustom = true;
  HT.data.nutrition.limits.zinc = 20;
  assert.equal(M.target('zinc').ul, 20);
  assert.equal(M.target('zinc').ulType, 'Custom limit');
  // Persisted through normalisation (reload / backup).
  HT.data.nutrition.targets.vitd = 50;
  const back = HT.migrate(JSON.parse(JSON.stringify(HT.data)));
  assert.equal(back.nutrition.targets.vitd, 50);
  assert.equal(back.nutrition.limits.zinc, 20);
  assert.equal(back.nutrition.profile.sex, 'm');
});

test('upper-limit alerts: totals, supplements pushing over, supplement-only limits, overlaps', () => {
  const { HT } = loadApp();
  const t = HT.today();
  const { M, H } = setup(HT, {
    entries: [food('Oysters', t, { zinc: 30, magnesium: 500, vita: 2500 })],
    routines: [
      supp('z', 'Zinc', [{ k: 'zinc', a: 15, u: 'mg' }]),
      supp('mv', 'Multivitamin', [{ k: 'zinc', a: 5, u: 'mg' }, { k: 'magnesium', a: 100, u: 'mg' }, { k: 'vita', a: 5000, u: 'iu_bc' }]),
    ],
  });
  HT.data.health.routines.forEach((x) => H.setIntake(x, t, 'taken'));
  const al = M.alerts(t);
  const z = al.find((a) => a.k === 'zinc' && a.lvl === 'over');
  assert.ok(z, 'zinc over the 34 mg UL');
  assert.match(z.text, /Supplements push Zinc above the 34 mg upper limit: 30 mg from food \+ 20 mg from supplements = 50 mg/);
  assert.ok(!al.some((a) => a.k === 'magnesium' && a.lvl === 'over'), 'food magnesium does not count toward the supplement-only UL');
  assert.ok(!al.some((a) => a.k === 'vita' && a.lvl === 'over'), 'beta-carotene and food vitamin A do not count toward the preformed UL');
  assert.ok(al.some((a) => a.lvl === 'overlap' && a.k === 'zinc' && /Zinc, Multivitamin/.test(a.text)));
  assert.equal(M.status(M.day(t).n.zinc, M.target('zinc')), 'over');
  // Supplemental magnesium above 350 mg is flagged even with little food.
  setup(HT, { routines: [supp('m', 'Magnesium', [{ k: 'magnesium', a: 400, u: 'mg' }])] });
  H.setIntake(HT.data.health.routines[0], t, 'taken');
  assert.ok(M.alerts(t).some((a) => a.k === 'magnesium' && a.lvl === 'over' && /from supplements/.test(a.text)));
});

test('patterns: consistently low and regularly over use only logged days that list the nutrient', () => {
  const { HT } = loadApp();
  const t = HT.today();
  const entries = [];
  for (let i = 0; i < 8; i++) entries.push(food('Day' + i, HT.addDays(t, -i), { vitc: 20, sodium: 3000 }));
  const { M } = setup(HT, { entries });
  const al = M.alerts(t);
  assert.ok(al.some((a) => a.lvl === 'low' && a.k === 'vitc' && /8 of the last 8 logged days/.test(a.text)));
  assert.ok(al.some((a) => a.lvl === 'over' && a.k === 'sodium' && /CDRR on 8 of the last 8/.test(a.text)));
  assert.ok(!al.some((a) => a.k === 'vitk'), 'no data, no alert');
});

test('history: only logged days, daily / weekly / monthly averages', () => {
  const { HT } = loadApp();
  const t = HT.today();
  const { M } = setup(HT, { entries: [food('a', t, { iron: 10 }), food('b', t, { iron: 4 }), food('c', HT.addDays(t, -2), { iron: 6 }), food('d', HT.addDays(t, -40), { kcal: 100 })] });
  const days = M.range(HT.addDays(t, -6), t);
  assert.equal(days.length, 2, 'days without entries are skipped, not zero');
  const daily = M.series('iron', days, 'day');
  assert.deepEqual(json(daily.map((p) => p.v)), [6, 14]);
  const month = M.series('iron', M.range(HT.addDays(t, -60), t), 'month');
  assert.ok(month.every((p) => p.v > 0), 'a day with no iron data is left out of the average');
  const week = M.series('iron', days, 'week');
  assert.equal(week.reduce((s, p) => s + p.n, 0), 2);
});

test('v6 data upgrades to v7: sodium target becomes a limit, everything else kept', () => {
  const { HT } = loadApp();
  const v6 = {
    version: 6, trackers: [{ id: 't', name: 'Walk', type: 'boolean' }], entries: {},
    nutrition: { targets: { kcal: 2400, protein: 150, sodium: 2000, sugar: 50 }, entries: [food('Oats', '2026-11-01', { kcal: 150, iron: 2 })] },
    health: { routines: [{ id: 'r', name: 'Vitamin D' }], intake: { '2026-11-01': { r: { s: 'taken' } } } },
  };
  const out = HT.migrate(v6);
  assert.equal(out.version, HT.VERSION);
  assert.equal(out.nutrition.targets.kcal, 2400);
  assert.equal(out.nutrition.targets.protein, 150);
  assert.equal(out.nutrition.targets.sodium, null);
  assert.equal(out.nutrition.limits.sodium, 2000);
  assert.equal(out.nutrition.targets.sugar, 50);
  assert.equal(out.nutrition.entries[0].n.iron, 2);
  assert.equal(out.health.intake['2026-11-01'].r.s, 'taken');
  assert.equal(out.health.routines[0].facts, null);
  assert.equal(out.nutrition.useCustom, true);
  // Custom macros still drive the diary.
  HT.data = out;
  assert.equal(HT.nutrition.targets().kcal, 2400);
  assert.equal(HT.nutrition.targets().sodium, 2000);
});

test('facts and taken-day snapshots survive save, reload and a backup round trip', () => {
  const { HT, store } = loadApp();
  const t = HT.today();
  const { H } = setup(HT, { routines: [supp('d', 'D3', [{ k: 'vitd', a: 1000, u: 'iu' }, { k: 'bogus', a: 1, u: 'mg' }, { k: 'zinc', a: -3, u: 'mg' }])] });
  const x = HT.data.health.routines[0];
  assert.deepEqual(json(x.facts.rows), [{ k: 'vitd', a: 1000, u: 'iu' }], 'unknown nutrients and negative amounts dropped');
  H.setIntake(x, t, 'taken');
  HT.save();
  const raw = JSON.parse(store.get('habits.data'));
  assert.equal(raw.health.intake[t].d.n.vitd, 25);
  HT.load();
  assert.equal(HT.micros.day(t).n.vitd.total, 25);
  const back = HT.migrate(JSON.parse(JSON.stringify(HT.data)));
  assert.equal(back.health.intake[t].d.n.vitd, 25);
  assert.deepEqual(json(back.health.routines[0].facts), json(x.facts));
});

test('Open Food Facts vitamins and minerals map to the right units', () => {
  const { HT } = loadApp();
  const f = HT.nutrition.fromOFF({ product_name: 'Fortified cereal', nutriments: { 'energy-kcal_100g': 380, 'vitamin-b12_100g': 0.0000025, 'magnesium_100g': 0.12, 'folates_100g': 0.0004, 'vitamin-a_100g': 0.0003, 'copper_100g': 0.00045 } }, '');
  const p = f.basis.per100;
  near(p.b12, 2.5);
  near(p.magnesium, 120);
  near(p.b9, 400);
  near(p.vita, 300);
  near(p.copper, 0.45, 0.001);
  assert.equal(p.zinc, undefined);
  const n = HT.nutrition.compute(f.basis, 30, 'g');
  near(n.copper, 0.135, 0.0002, 'small amounts keep their decimals when scaled');
});

test('Vitamins, Targets, Diary and Health screens render with and without data', () => {
  const { HT } = loadApp();
  const t = HT.today();
  const { M, H } = setup(HT, { entries: [food('Salmon', t, { kcal: 300, protein: 30, vitd: 12, sodium: 500 })], routines: [supp('d', 'D3', [{ k: 'vitd', a: 25, u: 'µg' }])] });
  H.setIntake(HT.data.health.routines[0], t, 'taken');
  HT.route = { name: 'nutrition' };
  let html = HT.views.nutrition('micros');
  assert.match(html, /Vitamin D/);
  assert.match(html, /Where it came from/);
  assert.match(html, /Molybdenum/);
  M.vs.mode = 'history';
  html = HT.views.nutrition('micros');
  assert.match(html, /Averages for this period/);
  M.vs.range = 'custom'; M.vs.from = HT.addDays(t, -3); M.vs.to = t;
  assert.match(HT.views.nutrition('micros'), /type="date"/);
  M.vs.mode = 'day';
  html = HT.views.nutrition('targets');
  assert.match(html, /Nutrition targets/);
  assert.match(html, /RDA/);
  assert.match(html, /Use my custom values/);
  html = HT.views.nutrition('');
  assert.match(html, /Vitamins &amp; minerals|Vitamins & minerals/);
  assert.match(html, /Water &amp; supplements|Water & supplements/);
  assert.match(HT.views.health(''), /Nutrition today/);
  // Empty state
  setup(HT, {});
  assert.match(HT.views.nutrition('micros'), /Nothing logged on this day/);
});

test('Nutrition is near the front of the Home section bar', () => {
  const { HT } = loadApp();
  const nav = HT.health.subnav('');
  const order = Array.from(nav.matchAll(/>([^<]+)<\/a>/g)).map((m) => m[1]);
  assert.deepEqual(order.slice(0, 3), ['Today', 'Habits', 'Nutrition']);
  assert.match(nav, /aria-current="page">Insights/, 'the Health overview is highlighted as Insights');
});
