import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadApp } from './load.mjs';

const json = (x) => JSON.parse(JSON.stringify(x));

test('v7 data upgrades to v8: an empty schedule is added and nothing else changes', () => {
  const { HT } = loadApp();
  const v7 = {
    version: 7, trackers: [{ id: 't', name: 'Read', type: 'duration', target: 30 }], entries: { '2026-11-01': { t: 30 } },
    settings: { theme: 'dark', weekStart: 1 },
    finance: { transactions: [{ id: 'x', type: 'expense', amount: 12, date: '2026-11-01', category: 'Food' }] },
    weight: { entries: [{ date: '2026-11-01', kg: 80 }] },
    health: { workouts: [{ date: '2026-11-01', type: 'run', duration: 30 }], widgets: [{ id: 'nutrition', on: true }, { id: 'habits', on: false }] },
    nutrition: { targets: { kcal: 2500 }, entries: [{ date: '2026-11-01', name: 'Oats', meal: 'breakfast', basis: { perServing: { kcal: 150 } }, amount: 1, unit: 'serving' }] },
  };
  const before = JSON.stringify(v7);
  const out = HT.migrate(v7);
  assert.equal(JSON.stringify(v7), before, 'the input object is not modified');
  assert.equal(out.version, HT.VERSION);
  assert.deepEqual(json(out.schedule), { events: [] });
  assert.equal(out.trackers[0].name, 'Read');
  assert.equal(out.entries['2026-11-01'].t, 30);
  assert.equal(out.settings.theme, 'dark');
  assert.equal(out.finance.transactions[0].amount, 12);
  assert.equal(out.weight.entries[0].kg, 80);
  assert.equal(out.health.workouts[0].duration, 30);
  assert.equal(out.nutrition.targets.kcal, 2500);
  assert.equal(out.nutrition.entries[0].n.kcal, 150);
  // The saved dashboard order is kept; Agenda joins at the top, Recent activity at the end.
  const order = out.health.widgets.map((w) => w.id);
  assert.deepEqual(json(order.slice(0, 3)), ['agenda', 'nutrition', 'habits']);
  assert.equal(out.health.widgets.find((w) => w.id === 'habits').on, false);
  assert.equal(order[order.length - 1], 'recent');
});

test('schedule store: validation, add, edit, complete, delete', () => {
  const { HT } = loadApp();
  const S = HT.schedule;
  HT.data.schedule = HT.normalizeSchedule({ events: [
    { title: '', date: '2026-01-04' }, { title: 'Bad date', date: 'soon' },
    { title: 'Meeting', date: '2026-01-04', time: '14:00', end: '13:00', kind: 'event', done: true },
    { title: 'Call', date: '2026-01-04', kind: 'task', done: true, doneAt: '2026-11-04T09:00:00Z', priority: 1 },
  ] });
  const ev = HT.data.schedule.events;
  assert.equal(ev.length, 2, 'untitled and undated items are dropped');
  const meeting = ev.find((e) => e.title === 'Meeting');
  assert.equal(meeting.end, '', 'an end before the start is dropped');
  assert.equal(meeting.done, false, 'only tasks can be done');
  assert.equal(ev.find((e) => e.title === 'Call').priority, true);
  const t = HT.today();
  const task = S.save({ title: 'Pay bill', kind: 'task', date: t, priority: true });
  assert.equal(S.on(t).length, 1);
  S.toggleDone(task.id);
  assert.equal(S.event(task.id).done, true);
  assert.ok(S.event(task.id).doneAt);
  S.toggleDone(task.id);
  assert.equal(S.event(task.id).done, false);
  assert.equal(S.event(task.id).doneAt, null);
  S.save({ title: 'Pay phone bill', time: '09:30' }, S.event(task.id));
  assert.equal(S.event(task.id).title, 'Pay phone bill');
  assert.equal(S.event(task.id).time, '09:30');
  S.remove(task.id);
  assert.equal(S.event(task.id), undefined);
  assert.equal(HT.data.schedule.events.length, 2, 'deleting one item leaves the others');
});

test('priorities: open items first, then done, then overdue tasks; upcoming skips done items', () => {
  const { HT } = loadApp();
  const S = HT.schedule, t = HT.today();
  HT.data.schedule = HT.normalizeSchedule({ events: [
    { id: 'a', title: 'Done flagged', kind: 'task', date: t, priority: true, done: true },
    { id: 'b', title: 'Open task', kind: 'task', date: t },
    { id: 'c', title: 'Flagged event', kind: 'event', date: t, time: '15:00', priority: true },
    { id: 'd', title: 'Plain event', kind: 'event', date: t },
    { id: 'e', title: 'Late task', kind: 'task', date: HT.addDays(t, -3) },
    { id: 'f', title: 'Old done', kind: 'task', date: HT.addDays(t, -3), done: true },
    { id: 'g', title: 'Next week', kind: 'event', date: HT.addDays(t, 6) },
  ] });
  assert.deepEqual(json(S.priorities(t).map((e) => e.id)), ['c', 'b', 'a', 'e']);
  assert.deepEqual(json(S.upcoming(14).map((e) => e.id)), ['b', 'd', 'c', 'g']);
  assert.deepEqual(json(S.tasksOn(t)), { total: 2, done: 1 });
});

test('activity timeline reads every log once, newest first, with category filters', () => {
  const { HT } = loadApp();
  const S = HT.schedule, t = HT.today(), y = HT.addDays(t, -1);
  const read = HT.createTracker({ name: 'Read', type: 'boolean' });
  HT.setValue(read, y, 1);
  HT.weight.add({ date: t, time: '07:00', kg: 80 });
  HT.data.nutrition = HT.normalizeNutrition({ entries: [
    { date: t, time: '08:00', name: 'Eggs', meal: 'breakfast', basis: { perServing: { kcal: 150, protein: 12 } }, amount: 1, unit: 'serving' },
    { date: t, name: 'Toast', meal: 'breakfast', basis: { perServing: { kcal: 100 } }, amount: 1, unit: 'serving' },
  ] });
  HT.data.health = HT.normalizeHealth({ workouts: [{ date: y, time: '18:00', type: 'run', duration: 30 }], routines: [{ id: 'r', name: 'Vitamin D' }], intake: { [t]: { r: { s: 'taken' } } } });
  HT.finance.addTx({ type: 'income', amount: 500, date: t, source: 'Client' });
  HT.data.schedule = HT.normalizeSchedule({ events: [
    { title: 'Done task', kind: 'task', date: t, done: true }, { title: 'Open task', kind: 'task', date: t },
    { title: 'Tomorrow', kind: 'event', date: HT.addDays(t, 1) }, { title: 'Past event', kind: 'event', date: y, time: '12:00' },
  ] });
  const all = S.activity(y, t);
  const cats = (list) => list.map((a) => a.cat);
  assert.equal(all.filter((a) => a.cat === 'nutrition').length, 1, 'one row per meal, not per food');
  assert.match(all.find((a) => a.cat === 'nutrition').sub, /2 items · 250 kcal/);
  assert.ok(!all.some((a) => /Open task|Tomorrow/.test(a.title)), 'open tasks and future events are plans, not activity');
  assert.ok(all.some((a) => /Done task/.test(a.title)) && all.some((a) => /Past event/.test(a.title)));
  assert.deepEqual(json(Array.from(new Set(cats(all))).sort()), ['finance', 'habits', 'nutrition', 'supplements', 'tasks', 'weight', 'workouts']);
  assert.ok(all.findIndex((a) => a.date === t) < all.findIndex((a) => a.date === y), 'newest day first');
  assert.deepEqual(json(Array.from(new Set(cats(S.activity(y, t, ['weight', 'workouts']))))), ['weight', 'workouts']);
  // Reading never writes.
  const snapshot = JSON.stringify(HT.data);
  S.activity(HT.addDays(t, -30), t);
  assert.equal(JSON.stringify(HT.data), snapshot);
});

test('four bottom tabs; every older address still has a screen and a tab', () => {
  const { HT } = loadApp();
  const src = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('const TABS = ['), src.indexOf('];', src.indexOf('const TABS = [')));
  assert.deepEqual([...block.matchAll(/\['(\w+)', '([^']+)'\]/g)].map((m) => m[2]), ['Home', 'Schedule', 'Finance', 'More']);
  for (const name of ['home', 'today', 'habits', 'trackers', 'stats', 'tracker', 'health', 'weight', 'nutrition', 'strength', 'schedule', 'history', 'finance', 'fgoal', 'more', 'settings']) {
    assert.equal(typeof HT.views[name], 'function', name + ' has a screen');
  }
  const tabOf = new Function('return ' + src.slice(src.indexOf('const TAB_OF = ') + 15, src.indexOf('};', src.indexOf('const TAB_OF = ')) + 1))();
  assert.equal(tabOf.health, 'home');
  assert.equal(tabOf.nutrition, 'home');
  assert.equal(tabOf.history, 'schedule');
  assert.equal(tabOf.settings, 'more');
  assert.equal(tabOf.finance, 'finance');
});

test('every screen renders, with and without data', () => {
  const { HT } = loadApp();
  HT.route = { name: 'home' };
  const views = () => {
    const out = [];
    const S = HT.schedule;
    out.push(HT.views.home(), HT.views.habits(''), HT.views.habits('manage'));
    for (const m of ['month', 'week', 'day']) { S.vs.mode = m; out.push(HT.views.schedule('')); }
    for (const r of ['day', 'week', 'month']) { S.vs.tlRange = r; out.push(HT.views.schedule('timeline')); }
    out.push(HT.views.schedule('history'), HT.views.finance(''), HT.views.more(''), HT.views.more('archived'), HT.views.more('account'), HT.views.more('help'), HT.views.more('about'));
    for (const s of HT.SETTINGS_SECTIONS) out.push(HT.views.settings(s));
    out.push(HT.views.settings());
    return out;
  };
  views().forEach((h) => assert.ok(h.length > 100));
  const t = HT.today();
  const tr = HT.createTracker({ name: 'Walk', type: 'boolean' });
  HT.setValue(tr, t, 1);
  HT.setStatus(HT.createTracker({ name: 'Old habit', type: 'boolean' }).id, 'archived');
  HT.schedule.save({ title: 'Dentist', kind: 'event', date: t, time: '10:00' });
  HT.schedule.save({ title: 'Bills', kind: 'task', date: t, priority: true });
  const html = views().join('');
  assert.match(html, /Good (morning|afternoon|evening)/);
  assert.match(html, /Today's priorities|Today&#39;s priorities/);
  assert.match(html, /Dentist/);
  assert.match(html, /Old habit/, 'archived habits are listed under More');
  assert.match(HT.views.home(), /class="ov-stats"/);
  assert.match(HT.views.home(), /aria-label="Home sections"/);
});

test('the schedule is included in backups and survives a round trip', () => {
  const { HT, store } = loadApp();
  HT.schedule.save({ title: 'Trip', kind: 'event', date: '2026-12-20' });
  HT.save();
  assert.equal(JSON.parse(store.get('habits.data')).schedule.events[0].title, 'Trip');
  const exp = HT.exportData();
  assert.equal(exp.schedule.events[0].title, 'Trip');
  const back = HT.migrate(JSON.parse(JSON.stringify(exp)));
  assert.equal(back.schedule.events[0].title, 'Trip');
  HT.load();
  assert.equal(HT.data.schedule.events.length, 1);
});
