import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load.mjs';

const LB = 2.20462;
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} is not close to ${b}`);
const lbToKg = (lb) => lb / LB;
const json = (x) => JSON.parse(JSON.stringify(x));

test('version 3 data (habits + finance + weight) migrates to v4 without losing anything', () => {
  const { HT } = loadApp();
  const v3 = {
    version: 3,
    trackers: [{ id: 't1', name: 'Workout', type: 'boolean', startDate: '2026-10-01' }],
    entries: { '2026-10-02': { t1: 1 } },
    settings: { theme: 'dark' },
    finance: { currency: 'CAD', goals: [{ id: 'g1', kind: 'savings', name: 'Fund', target: 1000, current: 250 }] },
    weight: { unit: 'lb', goal: lbToKg(175), entries: [{ id: 'w1', date: '2026-10-01', kg: lbToKg(190) }, { id: 'w2', date: '2026-10-03', kg: lbToKg(188), note: 'ok' }] },
  };
  const out = HT.migrate(v3);
  assert.equal(out.version, 4);
  assert.deepEqual(json(out.trackers.map((t) => t.name)), ['Workout']);
  assert.deepEqual(json(out.entries), { '2026-10-02': { t1: 1 } });
  assert.equal(out.finance.goals[0].current, 250);
  assert.equal(out.weight.entries.length, 2);
  assert.equal(out.weight.entries[1].note, 'ok');
  assert.equal(out.weight.entries[0].time, '');
  assert.ok(out.health.metrics.some((m) => m.key === 'water'));
  assert.equal(out.settings.theme, 'dark');
});

test('a version 1 backup still upgrades all the way', () => {
  const { HT } = loadApp();
  const out = HT.migrate({ version: 1, trackers: [{ id: 'a', name: 'Old', type: 'boolean' }], entries: {} });
  assert.equal(out.version, 4);
  assert.equal(out.trackers[0].name, 'Old');
  assert.ok(out.finance && out.weight && out.health);
});

test('saved data in the browser is upgraded on load and kept', () => {
  const { HT, store } = loadApp();
  store.set('habits.data', JSON.stringify({ version: 3, trackers: [{ id: 'x', name: 'Stretch', type: 'boolean' }], entries: {}, weight: { entries: [{ date: '2026-10-01', kg: 80 }] } }));
  HT.load();
  assert.equal(HT.data.version, 4);
  assert.equal(HT.data.trackers[0].name, 'Stretch');
  assert.equal(HT.data.weight.entries[0].kg, 80);
  assert.ok(HT.data.health.widgets.length === 6);
});

test('weight goal maths: losing, gaining and the example from the brief', () => {
  const { HT } = loadApp();
  HT.data.weight = HT.normalizeWeight({ unit: 'lb', goal: lbToKg(175), entries: [{ date: '2026-09-01', kg: lbToKg(190) }, { date: HT.today(), kg: lbToKg(183) }] });
  let s = HT.weight.stats();
  near(s.goal.pct, (7 / 15) * 100, 0.01); // weights are stored to 0.0001 kg
  near(s.goal.toGo * LB, 8, 0.001);
  assert.equal(s.goal.direction, 'lose');
  assert.equal(s.goal.reached, false);
  near(s.total * LB, -7, 0.001);

  HT.data.weight = HT.normalizeWeight({ unit: 'lb', goal: lbToKg(180), entries: [{ date: '2026-09-01', kg: lbToKg(160) }, { date: HT.today(), kg: lbToKg(165) }] });
  s = HT.weight.stats();
  near(s.goal.pct, 25, 0.01);
  assert.equal(s.goal.direction, 'gain');
  HT.data.weight.entries[1].kg = lbToKg(158); // moved away from the goal
  assert.equal(HT.weight.stats().goal.pct, 0);
  HT.data.weight.entries[1].kg = lbToKg(181);
  assert.equal(HT.weight.stats().goal.reached, true);
});

test('several weigh-ins on one day are kept and averaged for the day', () => {
  const { HT } = loadApp();
  HT.data.weight = HT.normalizeWeight({ unit: 'kg', entries: [] });
  const W = HT.weight;
  assert.ok(W.add({ date: '2026-10-05', time: '07:00', kg: 80 }));
  assert.ok(W.add({ date: '2026-10-05', time: '21:00', kg: 81 }));
  assert.equal(W.add({ date: '2026-10-05', time: '21:00', kg: 81 }), false, 'exact repeat is rejected');
  assert.equal(HT.data.weight.entries.length, 2);
  near(W.dayValue('2026-10-05'), 80.5);
  assert.equal(W.days().length, 1);
  assert.equal(W.latest().time, '21:00');
});

test('switching lb/kg only changes display, never the stored kilograms', () => {
  const { HT } = loadApp();
  HT.data.weight = HT.normalizeWeight({ unit: 'lb', entries: [{ date: '2026-10-01', kg: 84.0961 }] });
  const before = json(HT.data.weight.entries);
  assert.equal(HT.weight.fmt(84.0961), '185.4 lb');
  HT.data.weight.unit = 'kg';
  assert.equal(HT.weight.fmt(84.0961), '84.1 kg');
  assert.deepEqual(json(HT.data.weight.entries), before);
});

test('period summary needs two days for a change and three for an average', () => {
  const { HT } = loadApp();
  const t = HT.today();
  HT.data.weight = HT.normalizeWeight({ entries: [{ date: HT.addDays(t, -2), kg: 80 }, { date: t, kg: 79 }] });
  let p = HT.weight.period(HT.addDays(t, -6));
  near(p.change, -1);
  assert.equal(p.avg, null);
  HT.weight.add({ date: HT.addDays(t, -1), kg: 79.6 });
  p = HT.weight.period(HT.addDays(t, -6));
  near(p.avg, (80 + 79.6 + 79) / 3);
});

test('water is stored in ml and shown in the chosen unit; targets give progress', () => {
  const { HT } = loadApp();
  const H = HT.health, key = '2026-10-10';
  const water = H.metrics().find((m) => m.key === 'water');
  H.setMetric(water, key, 1250);
  assert.equal(HT.data.health.daily[key][water.id], 1250);
  near(H.metricProgress(water, key), 0.5); // default target 2500 ml
  assert.equal(H.fmtMetric(water, key), '1.25 L / 2.5 L');
  HT.data.health.settings.water = 'oz';
  assert.equal(H.units.fmtWater(1250), '42.27 fl oz');
  assert.equal(HT.data.health.daily[key][water.id], 1250);
  H.setMetric(water, key, null);
  assert.equal(HT.data.health.daily[key], undefined, 'clearing removes the empty day');
});

test('sleep is hours and minutes; metrics without a target show no progress bar', () => {
  const { HT } = loadApp();
  const H = HT.health, key = '2026-10-10';
  const sleep = H.metrics().find((m) => m.key === 'sleep');
  H.setMetric(sleep, key, 450);
  assert.equal(H.fmtMetric(sleep, key), '7h 30m / 8h');
  near(H.metricProgress(sleep, key), 450 / 480);
  const kcal = H.metrics().find((m) => m.key === 'calories');
  assert.equal(H.metricProgress(kcal, key), null);
  assert.equal(H.fmtMetric(kcal, key), 'Not logged');
});

test('a metric linked to a habit reads and writes the habit, with no duplicate record', () => {
  const { HT } = loadApp();
  const H = HT.health, key = HT.today();
  const t = HT.createTracker({ name: 'Drink water', type: 'quantity', target: 3, unit: 'liters', startDate: HT.addDays(key, -3) });
  const water = H.metrics().find((m) => m.key === 'water');
  water.trackerId = t.id;
  H.setMetric(water, key, 2);
  assert.equal(HT.value(t, key), 2);
  assert.equal(HT.data.health.daily[key], undefined);
  near(H.metricProgress(water, key), 2 / 3);
  assert.equal(H.metricValue(water, key), 2);
});

test('exercise metric comes from the workout log; workout stats and records', () => {
  const { HT } = loadApp();
  const H = HT.health, d = HT.data.health;
  d.workouts.push(
    { id: 'a', date: '2026-10-01', time: '', type: 'strength', name: 'Push', duration: 50, distance: null, notes: '', exercises: [{ name: 'Bench press', sets: [{ reps: 8, kg: 60 }, { reps: 5, kg: 70 }, { reps: 12, kg: 40 }] }] },
    { id: 'b', date: '2026-10-03', time: '', type: 'run', name: '', duration: 30, distance: 5, notes: '', exercises: [] },
    { id: 'c', date: '2026-10-08', time: '', type: 'run', name: '', duration: 40, distance: 7.2, notes: '', exercises: [] },
  );
  const ex = H.metrics().find((m) => m.key === 'exercise');
  assert.equal(H.metricValue(ex, '2026-10-03'), 30);
  assert.equal(H.metricValue(ex, '2026-10-02'), null);
  const st = H.workoutStats('2026-10-01', '2026-10-07');
  assert.equal(st.count, 2);
  assert.equal(st.minutes, 80);
  const rec = H.records();
  const bench = rec.lifts.find((l) => l.name === 'Bench press');
  assert.equal(bench.heavy.kg, 70);
  assert.equal(bench.reps.reps, 12);
  const run = rec.cardio.find((c) => c.type === 'run');
  assert.equal(run.far.distance, 7.2);
  assert.equal(run.long.duration, 40);
});

test('supplement intake: taken deducts stock, undo restores it, skipped differs from not logged', () => {
  const { HT } = loadApp();
  const H = HT.health;
  HT.data.health = HT.normalizeHealth({
    items: [{ id: 'i1', name: 'Vitamin D', status: 'purchased', owned: true, onHand: 30, unitLabel: 'softgels' }],
    routines: [{ id: 'r1', name: 'Vitamin D', serving: '1 softgel', schedule: { mode: 'daily' }, startDate: HT.addDays(HT.today(), -9), itemId: 'i1', perServing: 1 }],
  });
  const x = HT.data.health.routines[0], it = H.item('i1');
  const t = HT.today();
  H.setIntake(x, t, 'taken');
  assert.equal(it.onHand, 29);
  H.setIntake(x, t, 'taken'); // re-saving the same state doesn't double count
  assert.equal(it.onHand, 29);
  H.setIntake(x, t, 'skipped');
  assert.equal(it.onHand, 30);
  H.setIntake(x, t, null);
  assert.equal(H.intakeOf(x, t), null);
  H.setIntake(x, HT.addDays(t, -1), 'taken');
  H.setIntake(x, HT.addDays(t, -2), 'skipped');
  const c = H.routineConsistency(x, HT.addDays(t, -9));
  assert.deepEqual(json(c), { due: 9, taken: 1, skipped: 1, notLogged: 7 }); // today not logged yet, so not counted
  assert.equal(H.routineDue({ ...x, schedule: { mode: 'asneeded', days: [], every: 2 }, pauses: [] }, t), false);
});

test('inventory: days of supply, running-low rules and cost totals', () => {
  const { HT } = loadApp();
  const H = HT.health;
  HT.data.health = HT.normalizeHealth({
    items: [
      { id: 'a', name: 'Magnesium', status: 'purchased', onHand: 10, dailyUse: 2 },
      { id: 'b', name: 'Fish oil', status: 'purchased', onHand: 50, lowAt: 60 },
      { id: 'c', name: 'Creatine', status: 'want', qty: 2, estPrice: 30 },
      { id: 'd', name: 'Bands', status: 'research' },
      { id: 'e', name: 'Protein', status: 'purchased', monthlyCost: 45, purchases: [{ date: '2026-10-01', price: 52.5 }] },
      { id: 'f', name: 'Old', status: 'dropped', onHand: 0, lowAt: 5, monthlyCost: 20 },
    ],
    routines: [{ id: 'r', name: 'Fish oil', schedule: { mode: 'days', days: [1, 3, 5] }, itemId: 'b', perServing: 2 }],
  });
  assert.equal(H.daysLeft(H.item('a')), 5);
  assert.equal(H.isLow(H.item('a')), true); // 5 days is within the 7-day default
  near(H.dailyUse(H.item('b')), (2 * 3) / 7);
  assert.equal(H.isLow(H.item('b')), true); // under its own threshold
  assert.equal(H.isLow(H.item('f')), false); // not buying anymore
  const c = H.costs();
  assert.equal(c.toBuyCount, 2);
  assert.equal(c.toBuy, 60);
  assert.equal(c.unknown, 1);
  assert.equal(c.spent, 52.5);
  assert.equal(c.recurring, 45);
  assert.equal(H.spentBetween('2026-10-01', '2026-10-31'), 52.5);
  assert.equal(H.spentBetween('2026-11-01', '2026-11-30'), 0);
});

test('shopping filters and sorting', () => {
  const { HT } = loadApp();
  const H = HT.health;
  HT.data.health = HT.normalizeHealth({
    items: [
      { name: 'Cheap', status: 'want', priority: 'low', estPrice: 5, category: 'Vitamins' },
      { name: 'Pricey', status: 'restock', priority: 'high', estPrice: 80, category: 'Protein' },
      { name: 'Bought', status: 'purchased', priority: 'high', category: 'Protein' },
    ],
  });
  H.vs.status = 'tobuy'; H.vs.category = ''; H.vs.priority = ''; H.vs.sort = 'priority';
  assert.deepEqual(json(H.filteredItems().map((i) => i.name)), ['Pricey', 'Cheap']);
  H.vs.sort = 'cost';
  assert.deepEqual(json(H.filteredItems().map((i) => i.name)), ['Pricey', 'Cheap']);
  H.vs.status = 'all'; H.vs.category = 'Protein'; H.vs.sort = 'name';
  assert.deepEqual(json(H.filteredItems().map((i) => i.name)), ['Bought', 'Pricey']);
  H.vs.status = 'purchased'; H.vs.category = '';
  assert.deepEqual(json(H.filteredItems().map((i) => i.name)), ['Bought']);
});

test('health data is cleaned on load: bad values and orphan references are dropped', () => {
  const { HT } = loadApp();
  const h = HT.normalizeHealth({
    daily: { '2026-10-01': { m_water: -5, m_steps: 'abc', nope: 3 }, 'bad-date': { m_water: 100 } },
    workouts: [{ date: 'x' }, { date: '2026-10-01', type: 'teleport', duration: -10, exercises: [{ name: '', sets: [] }] }],
    items: [{ name: '' }, { name: 'Zinc', link: 'javascript:alert(1)', estPrice: -3 }],
    routines: [{ name: 'Zinc', itemId: 'missing' }],
    intake: { '2026-10-01': { ghost: { s: 'taken' } } },
    widgets: [{ id: 'shopping', on: false }, { id: 'bogus' }],
  });
  assert.deepEqual(json(h.daily), {});
  assert.equal(h.workouts.length, 1);
  assert.equal(h.workouts[0].type, 'other');
  assert.equal(h.workouts[0].duration, null);
  assert.equal(h.workouts[0].exercises.length, 0);
  assert.equal(h.items.length, 1);
  assert.equal(h.items[0].link, '');
  assert.equal(h.items[0].estPrice, null);
  assert.equal(h.routines[0].itemId, null);
  assert.deepEqual(json(h.intake), {});
  assert.equal(h.widgets[0].id, 'shopping');
  assert.equal(h.widgets[0].on, false);
  assert.equal(h.widgets.length, 6);
});

test('export then import keeps every section, including health', () => {
  const { HT } = loadApp();
  const H = HT.health;
  HT.createTracker({ name: 'Read', type: 'boolean' });
  HT.weight.add({ date: '2026-10-01', time: '07:05', kg: 82.3, note: 'morning' });
  H.setMetric(H.metrics().find((m) => m.key === 'steps'), '2026-10-01', 8421);
  HT.data.health.items.push(HT.normalizeHealth({ items: [{ name: 'Omega-3', estPrice: 19.99 }] }).items[0]);
  const backup = json(HT.exportData());
  assert.ok(backup.health && backup.weight && backup.finance);
  const before = json({ t: HT.data.trackers, w: HT.data.weight, h: HT.data.health, f: HT.data.finance });
  HT.resetData();
  assert.equal(HT.data.health.items.length, 0);
  HT.importData(backup);
  assert.deepEqual(json({ t: HT.data.trackers, w: HT.data.weight, h: HT.data.health, f: HT.data.finance }), before);
});

test('drag-reordering Today widgets and metrics is saved', () => {
  const { HT } = loadApp();
  const H = HT.health;
  assert.equal(H.reorder('widgets', ['weight', 'habits']), true);
  assert.deepEqual(json(HT.data.health.widgets.slice(0, 3).map((w) => w.id)), ['weight', 'habits', 'metrics']);
  H.reorder('metrics', ['m_steps', 'm_water']);
  assert.deepEqual(json(H.metrics().slice(0, 2).map((m) => m.id)), ['m_steps', 'm_water']);
  assert.equal(H.reorder('something-else', []), false);
});

test('existing habit logic is unchanged: streaks skip unscheduled days', () => {
  const { HT } = loadApp();
  const t = HT.today();
  const tr = HT.createTracker({ name: 'MWF', type: 'boolean', startDate: HT.addDays(t, -21), frequency: { mode: 'days', days: [1, 3, 5] } });
  for (let k = tr.startDate; k < t; k = HT.addDays(k, 1)) if (HT.isExpected(tr, k)) HT.setValue(tr, k, 1);
  const st = HT.stats(tr);
  assert.ok(st.current >= 8);
  assert.equal(st.rate, 100);
});
