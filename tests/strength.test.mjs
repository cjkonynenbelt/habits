import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadApp } from './load.mjs';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} is not close to ${b}`);
const json = (x) => JSON.parse(JSON.stringify(x));
const LB = 2.20462;

function fresh() {
  const app = loadApp();
  const { HT } = app;
  const S = HT.strength;
  HT.data.weight.unit = 'kg'; // the default depends on the device's region
  const bench = S.addExercise('Bench Press', 'Chest').ex;
  const squat = S.addExercise('Squat', 'Legs').ex;
  return { ...app, S, bench, squat, D: () => HT.data.health };
}
const sets = (...rows) => rows.flatMap(([kg, reps, n = 1]) => Array.from({ length: n }, () => ({ kg, reps })));

test('Health is the second tab in the bottom navigation and every destination is kept', () => {
  const src = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('const TABS = ['), src.indexOf('];', src.indexOf('const TABS = [')));
  const ids = [...block.matchAll(/\['(\w+)', '[^']+'\]/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['today', 'health', 'finance', 'history', 'stats', 'trackers', 'settings']);
  assert.ok(src.includes("r.name === 'strength' ? 'health'"), 'Strength pages highlight the Health tab');
});

test('v5 data upgrades to v6: lifts logged by name get exercises, nothing else changes', () => {
  const { HT } = loadApp();
  const v5 = {
    version: 5,
    trackers: [{ id: 't', name: 'Gym', type: 'boolean' }], entries: { '2026-10-01': { t: 1 } },
    weight: { entries: [{ date: '2026-10-01', kg: 80 }] },
    nutrition: { entries: [] },
    health: {
      workouts: [
        { id: 'w1', date: '2026-10-01', type: 'strength', duration: 50, notes: 'good', exercises: [{ name: 'bench press', sets: [{ reps: 5, kg: 100 }] }, { name: 'Stretching', sets: [] }] },
        { id: 'w2', date: '2026-10-03', type: 'strength', exercises: [{ name: 'Bench  Press', sets: [{ reps: 5, kg: 102.5 }] }, { name: 'Cable Fly', sets: [{ reps: 12, kg: 15 }] }] },
        { id: 'w3', date: '2026-10-04', type: 'run', duration: 30, distance: 5, exercises: [] },
      ],
      routines: [{ id: 'r1', name: 'Creatine' }],
    },
  };
  const out = HT.migrate(v5);
  assert.equal(out.version, HT.VERSION);
  const ex = out.health.exercises;
  assert.deepEqual(json(ex.map((e) => [e.name, e.group])), [['Bench Press', 'Chest'], ['Cable Fly', 'Other']]);
  const [w1, w2, w3] = out.health.workouts;
  assert.equal(w1.exercises[0].exId, ex[0].id);
  assert.equal(w1.exercises[0].name, 'Bench Press');
  assert.equal(w2.exercises[0].exId, ex[0].id, 'same lift with different spacing/case links to one exercise');
  assert.equal(w1.exercises[1].exId, undefined, 'an exercise with no sets is left as a plain note');
  assert.equal(w1.duration, 50);
  assert.equal(w1.notes, 'good');
  assert.equal(w3.distance, 5);
  assert.equal(out.health.routines[0].name, 'Creatine');
  assert.equal(out.trackers[0].name, 'Gym');
  assert.equal(out.weight.entries.length, 1);
  // normalising again changes nothing (ids stay put, no duplicates)
  const again = HT.normalizeHealth(json(out.health));
  assert.deepEqual(json(again.exercises), json(out.health.exercises));
  assert.deepEqual(json(again.workouts), json(out.health.workouts));
});

test('estimated 1RM uses Epley on 1–12 reps only', () => {
  const { S } = fresh();
  near(S.e1rm(100, 5), 100 * (1 + 5 / 30));
  assert.equal(S.e1rm(140, 1), 140);
  assert.equal(S.e1rm(60, 13), null);
  assert.equal(S.e1rm(null, 10), null);
  assert.equal(S.e1rm(0, 5), null);
});

test('set rows expand by the Sets count, convert units and reject bad input', () => {
  const { HT, S } = fresh();
  const p = S.parseRows([{ w: '100', r: '5', n: '3' }, { w: '', r: '', n: '1' }, { w: '', r: '12', n: '' }]);
  assert.equal(p.sets.length, 4);
  assert.deepEqual(json(p.sets[0]), { reps: 5, kg: 100 });
  assert.deepEqual(json(p.sets[3]), { reps: 12, kg: null }, 'blank weight = bodyweight');
  HT.data.weight.unit = 'lb';
  near(S.parseRows([{ w: '225', r: '5', n: '1' }]).sets[0].kg, 225 / LB, 1e-3);
  HT.data.weight.unit = 'kg';
  assert.match(S.parseRows([{ w: '100', r: '', n: '1' }]).error, /reps/);
  assert.match(S.parseRows([{ w: '100', r: '5.5', n: '1' }]).error, /whole-number reps/);
  assert.match(S.parseRows([{ w: '-5', r: '5', n: '1' }]).error, /Weight/);
  assert.match(S.parseRows([{ w: '100', r: '5', n: '0' }]).error, /Sets/);
  assert.match(S.parseRows([{ w: '100', r: '5', n: '21' }]).error, /Sets/);
  assert.match(S.parseRows([{ w: '', r: '', n: '1' }]).error, /at least one set/);
  assert.match(S.parseRows(Array.from({ length: 3 }, () => ({ w: '50', r: '5', n: '20' }))).error, /50 sets/);
});

test('logging creates one strength workout per day, merges repeats, and ticks the workout habit', () => {
  const { HT, S, bench, squat, D } = fresh();
  HT.data.trackers.push(HT.normalizeTracker({ id: 'gym', name: 'Gym', type: 'boolean', startDate: '2026-01-01' }));
  D().settings.workoutHabit = 'gym';
  const a = S.saveSession(bench.id, '2026-11-01', sets([100, 5, 3]), 'felt good', null);
  const b = S.saveSession(squat.id, '2026-11-01', sets([140, 3, 2]), '', null);
  assert.equal(D().workouts.length, 1);
  const w = D().workouts[0];
  assert.equal(w.type, 'strength');
  assert.deepEqual(json(w.exercises.map((x) => [x.name, x.sets.length, x.exId])), [['Bench Press', 3, bench.id], ['Squat', 2, squat.id]]);
  assert.equal(w.exercises[0].notes, 'felt good');
  assert.ok(HT.isDone(HT.tracker('gym'), '2026-11-01'), 'linked habit marked done');
  const c = S.saveSession(bench.id, '2026-11-01', sets([90, 8]), 'back-off', null);
  assert.equal(c.merged, true);
  assert.equal(c.key, a.key);
  assert.equal(w.exercises[0].sets.length, 4);
  assert.equal(w.exercises[0].notes, 'felt good · back-off');
  assert.notEqual(b.key, a.key);
  assert.ok(S.entryOn(squat.id, '2026-11-01'));
});

test('editing a session updates it; moving the date keeps other exercises and removes empty workouts', () => {
  const { S, bench, squat, D } = fresh();
  const a = S.saveSession(bench.id, '2026-11-01', sets([100, 5]), '', null);
  S.saveSession(squat.id, '2026-11-01', sets([140, 3]), '', null);
  const e = S.saveSession(bench.id, '2026-11-01', sets([105, 5]), 'heavier', a.key);
  assert.equal(e.key, a.key);
  assert.equal(S.entryByKey(a.key).x.sets[0].kg, 105);
  const moved = S.saveSession(bench.id, '2026-10-30', sets([105, 5]), '', a.key);
  assert.equal(D().workouts.length, 2);
  assert.equal(S.entryByKey(moved.key).w.date, '2026-10-30');
  const nov1 = D().workouts.find((w) => w.date === '2026-11-01');
  assert.deepEqual(json(nov1.exercises.map((x) => x.name)), ['Squat'], 'squat stays on Nov 1');
  // moving the only exercise of a workout away removes that empty workout
  S.saveSession(bench.id, '2026-10-29', sets([105, 5]), '', moved.key);
  assert.ok(!D().workouts.some((w) => w.date === '2026-10-30'));
});

test('deleting a session or an exercise never touches unrelated records', () => {
  const { HT, S, bench, squat, D } = fresh();
  D().workouts.push({ id: 'mix', date: '2026-10-20', time: '', type: 'strength', name: 'Leg day', duration: 60, distance: null, notes: 'n', templateId: null, createdAt: 'x',
    exercises: [{ name: 'Bench Press', exId: bench.id, sets: sets([80, 10]) }, { name: 'Squat', exId: squat.id, sets: sets([120, 5]) }] });
  S.saveSession(bench.id, '2026-10-22', sets([85, 10]), '', null);
  S.saveSession(squat.id, '2026-10-23', sets([125, 5]), '', null);
  D().workouts.push({ id: 'run', date: '2026-10-24', time: '', type: 'run', name: '', duration: 30, distance: 5, notes: '', templateId: null, createdAt: 'x', exercises: [] });
  const before = S.history(squat.id).list.length;
  S.deleteExercise(bench);
  assert.equal(S.exercise(bench.id), null);
  assert.equal(S.history(bench.id).list.length, 0);
  assert.equal(S.history(squat.id).list.length, before, 'squat sessions untouched');
  const mix = D().workouts.find((w) => w.id === 'mix');
  assert.ok(mix, 'a workout with other content survives');
  assert.equal(mix.duration, 60);
  assert.deepEqual(json(mix.exercises.map((x) => x.name)), ['Squat']);
  assert.ok(!D().workouts.some((w) => w.date === '2026-10-22'), 'bench-only workout removed');
  assert.ok(D().workouts.some((w) => w.id === 'run'));
  const sq = S.entryOn(squat.id, '2026-10-23');
  assert.equal(S.deleteSession(sq.key), true);
  assert.equal(S.history(squat.id).list.length, before - 1);
  assert.equal(S.deleteSession('nope.0'), false);
  HT.save();
});

test('progress stats come only from logged sets', () => {
  const { S, bench } = fresh();
  assert.equal(S.stats(bench.id), null, 'no history = no stats');
  S.saveSession(bench.id, '2026-09-01', sets([80, 8, 3]), '', null);
  S.saveSession(bench.id, '2026-10-01', sets([90, 6, 2], [95, 3]), '', null);
  S.saveSession(bench.id, '2026-11-01', sets([100, 5, 3]), '', null);
  const st = S.stats(bench.id);
  assert.equal(st.sessions, 3);
  assert.equal(st.last.top, 100);
  assert.equal(st.last.topReps, 5);
  assert.equal(st.prev.top, 95);
  assert.deepEqual(json(st.heaviest), { kg: 100, reps: 5, date: '2026-11-01' });
  assert.equal(st.totalReps, 24 + 15 + 15);
  assert.equal(st.totalVolume, 80 * 24 + 90 * 12 + 95 * 3 + 100 * 15);
  near(st.last.e1rm, 100 * (1 + 5 / 30));
  assert.deepEqual(json(st.bestSet), { kg: 100, reps: 5, date: '2026-11-01' });
  const first = 80 * (1 + 8 / 30), last = 100 * (1 + 5 / 30);
  assert.equal(st.improvement.metric, 'e1rm');
  near(st.improvement.pct, ((last - first) / first) * 100);
  assert.deepEqual(json(st.bestVolume), { kg: 1920, date: '2026-09-01' });
  assert.deepEqual(json(st.mostReps), { reps: 8, date: '2026-09-01' });
});

test('bodyweight exercises track reps', () => {
  const { S } = fresh();
  const pu = S.addExercise('Pull-ups').ex;
  assert.equal(pu.group, 'Back', 'library group is used');
  S.saveSession(pu.id, '2026-10-01', sets([null, 8, 3]), '', null);
  S.saveSession(pu.id, '2026-10-08', sets([null, 10], [null, 9, 2]), '', null);
  const st = S.stats(pu.id);
  assert.equal(st.bodyweight, true);
  assert.equal(st.heaviest, null);
  assert.equal(st.totalVolume, 0);
  assert.equal(st.improvement.metric, 'reps');
  near(st.improvement.pct, 25);
  assert.equal(S.setsText(st.last.sets), '10 reps, 2×9');
});

test('personal records: the first session is the baseline; only beating it counts', () => {
  const { S, bench } = fresh();
  S.saveSession(bench.id, '2026-10-01', sets([100, 5]), '', null);
  S.saveSession(bench.id, '2026-10-05', sets([100, 5]), '', null); // equal — not a record
  S.saveSession(bench.id, '2026-10-09', sets([105, 3]), '', null); // heavier, but a lower est. 1RM than 100×5
  S.saveSession(bench.id, '2026-10-12', sets([90, 12, 4]), '', null); // higher est. 1RM, volume and reps
  const { list, events } = S.history(bench.id);
  assert.deepEqual(json(list.map((s) => s.prs)), [[], [], ['heavy'], ['e1rm', 'volume', 'reps']]);
  assert.equal(events.length, 4);
  assert.equal(events[0].type, 'heavy');
  assert.equal(events[0].value, 105);
});

test('renaming updates every session; duplicate names are refused', () => {
  const { S, bench, D } = fresh();
  S.saveSession(bench.id, '2026-10-01', sets([100, 5]), '', null);
  assert.match(S.addExercise('  squat ').error, /already have Squat/);
  assert.match(S.updateExercise(bench, 'SQUAT', 'Chest').error, /already have/);
  assert.equal(S.updateExercise(bench, 'Flat Bench', 'Chest').ex.name, 'Flat Bench');
  assert.equal(D().workouts[0].exercises[0].name, 'Flat Bench');
  assert.match(S.addExercise('   ').error, /name/);
});

test('saved lifts survive a reload, a backup round trip and the old Workouts form', () => {
  const { HT, S, bench, store } = fresh();
  S.saveSession(bench.id, '2026-10-01', sets([100, 5, 3]), 'note', null);
  HT.save();
  const saved = store.get('habits.data');
  HT.load();
  assert.equal(HT.data.version, HT.VERSION);
  assert.equal(HT.strength.history(bench.id).list.length, 1);
  assert.equal(HT.data.health.workouts[0].exercises[0].notes, 'note');
  assert.deepEqual(json(HT.data), JSON.parse(saved), 'reload gives identical data');
  const back = HT.migrate(json(HT.exportData()));
  assert.deepEqual(json(back.health.exercises), json(HT.data.health.exercises));
  assert.deepEqual(json(back.health.workouts), json(HT.data.health.workouts));
  // the Workouts form re-normalises the whole health object after saving
  HT.data.health = HT.normalizeHealth(HT.data.health);
  assert.equal(HT.data.health.workouts[0].exercises[0].exId, bench.id);
  assert.equal(HT.data.health.workouts[0].exercises[0].notes, 'note');
});

test('chart series take the best value per day and respect the range', () => {
  const { S, bench } = fresh();
  S.saveSession(bench.id, '2026-08-01', sets([80, 5]), '', null);
  S.saveSession(bench.id, '2026-10-01', sets([90, 5]), '', null);
  S.saveSession(bench.id, '2026-10-01', sets([95, 2]), '', null); // merged into the same day
  const all = S.series(bench.id, 'top', '');
  assert.deepEqual(json(all.map((p) => [p.date, p.v])), [['2026-08-01', 80], ['2026-10-01', 95]]);
  assert.equal(S.series(bench.id, 'top', '2026-09-01').length, 1);
  assert.equal(S.series(bench.id, 'volume', '')[1].v, 90 * 5 + 95 * 2);
});

test('the screens render with and without data', () => {
  const { HT, S, bench } = fresh();
  for (const arg of [null, 'exercises', 'history', 'records', bench.id, 'missing']) assert.equal(typeof HT.views.strength(arg), 'string');
  S.saveSession(bench.id, '2026-10-01', sets([100, 5]), '', null);
  S.saveSession(bench.id, '2026-10-08', sets([105, 5]), '', null);
  const ov = HT.views.strength(null);
  assert.ok(ov.includes('Bench Press'));
  assert.ok(ov.includes('Recent personal records'));
  const page = HT.views.strength(bench.id);
  assert.ok(page.includes('Current working weight') && page.includes('Estimated 1RM') && page.includes('Improvement'));
  assert.ok(HT.views.strength('records').includes('All-time bests'));
  assert.ok(HT.health.subnav('strength').includes('href="#/strength" aria-current="page"'));
});
