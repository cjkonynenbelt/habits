/* Habits — Health & Fitness module. Self-contained like finance.js / weight.js:
   its own data (HT.data.health), maths and screens. Body weight is owned by weight.js and only read here.
   Daily metrics can be linked to an existing habit, in which case the habit's own entries are the
   single source of truth (nothing is copied). Nothing here recommends products or doses — it only
   records what the user enters.
   Hooks used by the rest of the app: HT.normalizeHealth (storage), H.widgetOrder / H.widget (Today),
   H.settingsHTML (Settings), H.reorder (drag-sorted lists). */
(function () {
  'use strict';
  const HT = window.HT;
  const esc = HT.esc, icon = HT.icon;
  const H = (HT.health = {});
  const D = () => HT.data.health;

  const hid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const num = (v) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : null; };
  const pos = (v) => { const n = num(v); return n != null && n > 0 ? n : null; };
  const nonneg = (v) => { const n = num(v); return n != null && n >= 0 ? n : null; };
  const r2 = (n) => Math.round(n * 100) / 100;
  const str = (v, max) => String(v == null ? '' : v).slice(0, max || 80);
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const arr = (v) => (Array.isArray(v) ? v : []);
  const isTime = (t) => typeof t === 'string' && /^\d{2}:\d{2}$/.test(t);
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const longDate = (key) => HT.parseKey(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const shortDate = (key) => HT.parseKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const money = (n) => (HT.finance && HT.data.finance ? HT.finance.money(n) : '$' + Number(n).toFixed(2));

  /* ---------- reference lists ---------- */

  const BUILTIN = [
    { key: 'weight', name: 'Body weight', icon: '⚖️', kind: 'weight', enabled: true },
    { key: 'water', name: 'Water', icon: '💧', kind: 'water', target: 2500, step: 250, enabled: true },
    { key: 'sleep', name: 'Sleep', icon: '😴', kind: 'duration', target: 480, enabled: true },
    { key: 'steps', name: 'Steps', icon: '🚶', kind: 'count', unit: 'steps', target: 10000, step: 1000, enabled: true },
    { key: 'exercise', name: 'Exercise', icon: '🏋️', kind: 'workout', enabled: true },
    { key: 'calories', name: 'Calories', icon: '🍽️', kind: 'count', unit: 'kcal', enabled: false },
    { key: 'protein', name: 'Protein', icon: '🥩', kind: 'quantity', unit: 'g', step: 10, enabled: false },
  ];
  const KINDS = ['weight', 'workout', 'water', 'duration', 'count', 'quantity', 'boolean'];
  const CUSTOM_KINDS = [['quantity', 'Amount that adds up (e.g. g, cups)'], ['count', 'Single number (e.g. kcal, resting HR)'], ['duration', 'Hours and minutes'], ['boolean', 'Yes / no']];
  const WIDGETS = [['habits', 'Today\'s habits'], ['weight', 'Body weight'], ['metrics', 'Health metrics and targets'], ['workout', 'Workout'], ['supplements', 'Supplement checklist'], ['shopping', 'Health purchases'], ['nutrition', 'Nutrition']];
  const ITEM_STATUS = [['research', 'Need to research'], ['want', 'Want to buy'], ['restock', 'Need to restock'], ['purchased', 'Purchased'], ['dropped', 'Not buying anymore']];
  const TO_BUY = ['research', 'want', 'restock'];
  const PRIORITY = [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']];
  const USAGE = [['', 'Not set'], ['try', 'Want to try'], ['regular', 'Use regularly']];
  const TIMES = [['', 'Any time'], ['morning', 'Morning'], ['midday', 'Midday'], ['afternoon', 'Afternoon'], ['evening', 'Evening'], ['bedtime', 'Bedtime']];
  const WTYPES = [['strength', 'Weight training', '🏋️', false], ['cardio', 'Cardio', '❤️', true], ['walk', 'Walk', '🚶', true], ['run', 'Run', '🏃', true], ['cycle', 'Cycling', '🚴', true], ['other', 'Other', '⭐', true]];
  const DEFAULT_CATS = ['Vitamins', 'Supplements', 'Protein', 'Fitness equipment', 'Other'];
  const label = (list, v) => { const x = list.find((o) => o[0] === v); return x ? x[1] : ''; };
  const wtype = (id) => WTYPES.find((t) => t[0] === id) || WTYPES[5];

  /* ---------- data shape ---------- */

  function normMetric(m, builtin) {
    const kind = builtin ? builtin.kind : KINDS.includes(m.kind) && m.kind !== 'weight' && m.kind !== 'workout' && m.kind !== 'water' ? m.kind : 'quantity';
    return {
      id: builtin ? 'm_' + builtin.key : str(m.id, 40) || hid('m'),
      key: builtin ? builtin.key : null,
      name: builtin ? builtin.name : str(m.name, 40).trim() || 'Metric',
      icon: builtin ? builtin.icon : str(m.icon, 8) || '📈',
      kind,
      unit: builtin ? builtin.unit || '' : kind === 'duration' || kind === 'boolean' ? '' : str(m.unit, 16),
      target: kind === 'weight' || kind === 'boolean' ? null : builtin && !('target' in m) ? builtin.target || null : pos(m.target),
      step: pos(m.step) || (builtin && builtin.step) || null,
      enabled: m.enabled !== undefined ? !!m.enabled : builtin ? !!builtin.enabled : true,
      trackerId: kind === 'weight' || kind === 'workout' ? null : typeof m.trackerId === 'string' && m.trackerId ? m.trackerId : null,
      order: Number.isFinite(Number(m.order)) ? Number(m.order) : 99,
    };
  }
  const normSets = (sets) => arr(sets).filter((s) => s && typeof s === 'object').slice(0, 50)
    .map((s) => ({ reps: pos(s.reps) != null ? Math.round(pos(s.reps)) : null, kg: pos(s.kg) }))
    .filter((s) => s.reps != null || s.kg != null);
  const normExercises = (ex) => arr(ex).filter((e) => e && str(e.name, 60).trim()).slice(0, 40)
    .map((e) => ({ name: str(e.name, 60).trim(), sets: normSets(e.sets) }));
  const normSchedule = (s) => {
    const x = obj(s);
    return {
      mode: ['daily', 'days', 'interval', 'asneeded'].includes(x.mode) ? x.mode : 'daily',
      days: arr(x.days).map(Number).filter((d) => d >= 0 && d <= 6),
      every: Math.max(2, Math.min(90, Math.round(Number(x.every)) || 2)),
    };
  };

  HT.normalizeHealth = (raw) => {
    const r = obj(raw);
    const stored = arr(r.metrics).filter((m) => m && typeof m === 'object');
    const metrics = BUILTIN.map((b, i) => normMetric(Object.assign({ order: i }, stored.find((m) => m.key === b.key) || {}), b));
    stored.filter((m) => !m.key).forEach((m) => metrics.push(normMetric(m, null)));
    const metricIds = new Set(metrics.map((m) => m.id));

    const daily = {};
    Object.keys(obj(r.daily)).forEach((k) => {
      if (!HT.isDateKey(k)) return;
      const day = {};
      Object.keys(obj(r.daily[k])).forEach((id) => { const v = nonneg(r.daily[k][id]); if (metricIds.has(id) && v != null && v > 0) day[id] = r2(v); });
      if (Object.keys(day).length) daily[k] = day;
    });

    const workouts = arr(r.workouts).filter((w) => w && HT.isDateKey(w.date)).map((w) => ({
      id: str(w.id, 40) || hid('wo'), date: w.date, time: isTime(w.time) ? w.time : '',
      type: WTYPES.some((t) => t[0] === w.type) ? w.type : 'other', name: str(w.name, 60).trim(),
      duration: pos(w.duration) != null ? Math.round(pos(w.duration)) : null, distance: pos(w.distance),
      exercises: normExercises(w.exercises), notes: str(w.notes, 400), templateId: w.templateId ? str(w.templateId, 40) : null,
      createdAt: w.createdAt || new Date().toISOString(),
    })).sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1));

    const templates = arr(r.templates).filter((t) => t && str(t.name).trim()).map((t) => ({
      id: str(t.id, 40) || hid('tp'), name: str(t.name, 60).trim(), type: WTYPES.some((x) => x[0] === t.type) ? t.type : 'other',
      duration: pos(t.duration) != null ? Math.round(pos(t.duration)) : null, distance: pos(t.distance), exercises: normExercises(t.exercises),
    }));

    const cats = Array.from(new Set(arr(r.categories).map((c) => str(c, 30).trim()).filter(Boolean)));
    const items = arr(r.items).filter((i) => i && str(i.name).trim()).map((i) => ({
      id: str(i.id, 40) || hid('it'), name: str(i.name, 80).trim(), category: str(i.category, 30).trim() || 'Other',
      usage: ['try', 'regular'].includes(i.usage) ? i.usage : '',
      status: ITEM_STATUS.some((s) => s[0] === i.status) ? i.status : 'want',
      priority: PRIORITY.some((p) => p[0] === i.priority) ? i.priority : 'medium',
      qty: pos(i.qty), estPrice: nonneg(i.estPrice), store: str(i.store, 60), link: /^https?:\/\//i.test(String(i.link || '')) ? str(i.link, 500) : '',
      notes: str(i.notes, 400), owned: !!i.owned, onHand: nonneg(i.onHand), unitLabel: str(i.unitLabel, 20),
      dailyUse: pos(i.dailyUse), lowAt: nonneg(i.lowAt), monthlyCost: nonneg(i.monthlyCost),
      purchases: arr(i.purchases).filter((p) => p && HT.isDateKey(p.date)).map((p) => ({
        id: str(p.id, 40) || hid('pu'), date: p.date, price: nonneg(p.price), qty: pos(p.qty), txId: p.txId ? str(p.txId, 40) : null,
      })),
      createdAt: i.createdAt || new Date().toISOString(),
    }));
    const itemIds = new Set(items.map((i) => i.id));

    const routines = arr(r.routines).filter((x) => x && str(x.name).trim()).map((x) => ({
      id: str(x.id, 40) || hid('rt'), name: str(x.name, 80).trim(), serving: str(x.serving, 80), schedule: normSchedule(x.schedule),
      startDate: HT.isDateKey(x.startDate) ? x.startDate : HT.today(), timeOfDay: TIMES.some((t) => t[0] === x.timeOfDay) ? x.timeOfDay : '',
      itemId: itemIds.has(x.itemId) ? x.itemId : null, perServing: pos(x.perServing), notes: str(x.notes, 300),
      status: x.status === 'paused' ? 'paused' : 'active',
      pauses: arr(x.pauses).filter((p) => p && HT.isDateKey(p.from)).map((p) => ({ from: p.from, to: HT.isDateKey(p.to) ? p.to : null })),
      createdAt: x.createdAt || new Date().toISOString(),
    }));
    const routineIds = new Set(routines.map((x) => x.id));
    const intake = {};
    Object.keys(obj(r.intake)).forEach((k) => {
      if (!HT.isDateKey(k)) return;
      const day = {};
      Object.keys(obj(r.intake[k])).forEach((id) => {
        const e = obj(r.intake[k][id]);
        if (routineIds.has(id) && (e.s === 'taken' || e.s === 'skipped')) day[id] = { s: e.s, d: nonneg(e.d) || 0 };
      });
      if (Object.keys(day).length) intake[k] = day;
    });

    const storedW = arr(r.widgets).filter((w) => w && WIDGETS.some((x) => x[0] === w.id));
    const widgets = storedW.map((w) => ({ id: w.id, on: w.on !== false }));
    WIDGETS.forEach((w) => { if (!widgets.some((x) => x.id === w[0])) widgets.push({ id: w[0], on: true }); });

    const s = obj(r.settings);
    return {
      metrics, daily, workouts, templates, items, routines, intake, widgets,
      categories: cats.length ? cats : DEFAULT_CATS.slice(),
      settings: {
        water: ['L', 'ml', 'oz'].includes(s.water) ? s.water : 'L',
        distance: s.distance === 'mi' ? 'mi' : 'km',
        lowDays: pos(s.lowDays) != null ? Math.round(pos(s.lowDays)) : 7,
        deductStock: s.deductStock !== false,
        financeOnPurchase: !!s.financeOnPurchase,
        healthHabits: arr(s.healthHabits).filter((x) => typeof x === 'string'),
        workoutHabit: typeof s.workoutHabit === 'string' && s.workoutHabit ? s.workoutHabit : null,
      },
    };
  };

  /* ---------- units ---------- */

  const ML_PER_OZ = 29.5735, KM_PER_MI = 1.60934;
  const waterOut = (ml) => { const u = D().settings.water; return u === 'ml' ? ml : u === 'oz' ? ml / ML_PER_OZ : ml / 1000; };
  const waterIn = (v) => { const u = D().settings.water; return u === 'ml' ? v : u === 'oz' ? v * ML_PER_OZ : v * 1000; };
  const fmtWater = (ml) => { const u = D().settings.water, v = waterOut(ml); return (u === 'ml' ? Math.round(v) : Math.round(v * 100) / 100).toLocaleString() + ' ' + (u === 'oz' ? 'fl oz' : u); };
  const distOut = (km) => (D().settings.distance === 'mi' ? km / KM_PER_MI : km);
  const distIn = (v) => (D().settings.distance === 'mi' ? v * KM_PER_MI : v);
  const fmtDist = (km) => (Math.round(distOut(km) * 100) / 100) + ' ' + D().settings.distance;
  const wUnit = () => (HT.weight ? HT.weight.unit() : 'kg');
  const liftOut = (kg) => (HT.weight ? HT.weight.toUnit(kg) : kg);
  const liftIn = (v) => (HT.weight ? HT.weight.fromUnit(v) : v);
  const fmtLift = (kg) => (Math.round(liftOut(kg) * 10) / 10) + ' ' + wUnit();
  H.units = { waterOut, waterIn, fmtWater, distOut, distIn, fmtDist };

  /* ---------- daily metrics ---------- */

  H.metrics = () => D().metrics.slice().sort((a, b) => a.order - b.order);
  H.metric = (id) => D().metrics.find((m) => m.id === id);
  const trackerOf = (m) => (m.trackerId ? HT.tracker(m.trackerId) : null);
  H.workoutsOn = (key) => D().workouts.filter((w) => w.date === key);

  /* The value for a day, or null when nothing was recorded. Linked metrics read the habit's entry. */
  H.metricValue = (m, key) => {
    const t = trackerOf(m);
    if (t) { const v = HT.value(t, key); return v > 0 ? v : null; }
    if (m.kind === 'weight') return HT.weight ? HT.weight.dayValue(key) : null;
    if (m.kind === 'workout') { const ws = H.workoutsOn(key); return ws.length ? ws.reduce((s, w) => s + (w.duration || 0), 0) : null; }
    const day = D().daily[key];
    return day && day[m.id] != null ? day[m.id] : null;
  };
  H.metricTarget = (m) => { const t = trackerOf(m); return t ? HT.goal(t) : m.target; };
  /* 0..1 progress toward the day's target, or null when there is no target to measure against. */
  H.metricProgress = (m, key) => {
    const t = trackerOf(m);
    if (t) return HT.progress(t, key);
    const v = H.metricValue(m, key);
    if (m.kind === 'weight') return null;
    if (m.kind === 'workout') return m.target ? Math.min(1, (v || 0) / m.target) : null;
    if (m.kind === 'boolean') return v ? 1 : 0;
    return m.target ? Math.min(1, (v || 0) / m.target) : null;
  };
  H.fmtMetric = (m, key) => {
    const t = trackerOf(m), v = H.metricValue(m, key);
    if (t) return HT.fmtProgress(t, v || 0);
    if (m.kind === 'weight') return v == null ? 'Not logged' : HT.weight.fmt(v);
    if (m.kind === 'workout') {
      const n = H.workoutsOn(key).length;
      return n ? plural(n, 'workout') + (v ? ' · ' + HT.dur(v) : '') + (m.target ? ' / ' + HT.dur(m.target) : '') : 'No workout logged' + (m.target ? ' · goal ' + HT.dur(m.target) : '');
    }
    if (m.kind === 'boolean') return v ? 'Done' : 'Not done';
    const f = (x) => (m.kind === 'water' ? fmtWater(x) : m.kind === 'duration' ? HT.dur(x) : HT.num(x) + (m.unit ? ' ' + m.unit : ''));
    if (m.target) return f(v || 0) + ' / ' + f(m.target);
    return v == null ? 'Not logged' : f(v);
  };
  H.setMetric = (m, key, v) => {
    const t = trackerOf(m);
    if (t) { HT.log(t, key, v == null ? 0 : v); return; }
    const day = (D().daily[key] = D().daily[key] || {});
    if (v == null || !(v > 0)) delete day[m.id];
    else day[m.id] = r2(v);
    if (!Object.keys(day).length) delete D().daily[key];
    HT.save();
  };

  /* ---------- workouts ---------- */

  H.workoutStats = (from, to) => {
    const ws = D().workouts.filter((w) => w.date >= from && w.date <= to);
    return { count: ws.length, minutes: ws.reduce((s, w) => s + (w.duration || 0), 0), km: ws.reduce((s, w) => s + (w.distance || 0), 0), days: new Set(ws.map((w) => w.date)).size };
  };
  /* Best performances found in the log: heaviest set and most reps per exercise, longest per cardio type. */
  H.records = () => {
    const lifts = {}, cardio = {};
    D().workouts.forEach((w) => {
      w.exercises.forEach((ex) => {
        const k = ex.name.toLowerCase();
        const rec = (lifts[k] = lifts[k] || { name: ex.name, heavy: null, reps: null });
        ex.sets.forEach((s) => {
          if (s.kg != null && (!rec.heavy || s.kg > rec.heavy.kg || (s.kg === rec.heavy.kg && (s.reps || 0) > (rec.heavy.reps || 0)))) rec.heavy = { kg: s.kg, reps: s.reps, date: w.date };
          if (s.reps != null && (!rec.reps || s.reps > rec.reps.reps)) rec.reps = { reps: s.reps, kg: s.kg, date: w.date };
        });
      });
      if (wtype(w.type)[3] && (w.distance || w.duration)) {
        const c = (cardio[w.type] = cardio[w.type] || { type: w.type, far: null, long: null });
        if (w.distance && (!c.far || w.distance > c.far.distance)) c.far = { distance: w.distance, date: w.date };
        if (w.duration && (!c.long || w.duration > c.long.duration)) c.long = { duration: w.duration, date: w.date };
      }
    });
    return { lifts: Object.values(lifts).filter((l) => l.heavy || l.reps), cardio: Object.values(cardio) };
  };
  const linkWorkoutHabit = (date) => {
    const t = D().settings.workoutHabit && HT.tracker(D().settings.workoutHabit);
    if (t && t.status === 'active' && HT.typeOf(t).mode === 'toggle' && !HT.isDone(t, date)) HT.setValue(t, date, 1);
  };

  /* ---------- supplements ---------- */

  H.routineDue = (x, key) => {
    if (key < x.startDate || x.schedule.mode === 'asneeded') return false;
    for (let i = 0; i < x.pauses.length; i++) { const p = x.pauses[i]; if (key >= p.from && (!p.to || key < p.to)) return false; }
    const f = x.schedule;
    if (f.mode === 'days') return f.days.includes(HT.parseKey(key).getDay());
    if (f.mode === 'interval') return HT.daysBetween(x.startDate, key) % f.every === 0;
    return true;
  };
  H.intakeOf = (x, key) => { const d = D().intake[key]; return d && d[x.id] ? d[x.id].s : null; };
  H.item = (id) => D().items.find((i) => i.id === id);
  H.setIntake = (x, key, state) => {
    const day = (D().intake[key] = D().intake[key] || {});
    const prev = day[x.id];
    const it = x.itemId ? H.item(x.itemId) : null;
    if (prev && prev.d && it && it.onHand != null) it.onHand = r2(it.onHand + prev.d); // undo the earlier stock deduction
    if (!state) delete day[x.id];
    else {
      let d = 0;
      if (state === 'taken' && D().settings.deductStock && it && it.onHand != null && x.perServing) { d = Math.min(it.onHand, x.perServing); it.onHand = r2(it.onHand - d); }
      day[x.id] = { s: state, d };
    }
    if (!Object.keys(day).length) delete D().intake[key];
    HT.save();
  };
  /* Logging consistency for scheduled days before today (plus today once logged). */
  H.routineConsistency = (x, from) => {
    const today = HT.today();
    let due = 0, taken = 0, skipped = 0;
    for (let k = from > x.startDate ? from : x.startDate; k <= today; k = HT.addDays(k, 1)) {
      if (!H.routineDue(x, k)) continue;
      const s = H.intakeOf(x, k);
      if (k === today && !s) continue;
      due++;
      if (s === 'taken') taken++; else if (s === 'skipped') skipped++;
    }
    return { due, taken, skipped, notLogged: due - taken - skipped };
  };
  const scheduleText = (x) => {
    const f = x.schedule;
    if (f.mode === 'asneeded') return 'As needed';
    if (f.mode === 'days') return f.days.slice().sort().map((d) => HT.DAY_NAMES[d]).join(', ') || 'No days chosen';
    if (f.mode === 'interval') return 'Every ' + f.every + ' days';
    return 'Daily';
  };

  /* ---------- inventory + purchases ---------- */

  /* Average units used per day: the user's figure, or what linked active routines use on schedule. */
  H.dailyUse = (it) => {
    if (it.dailyUse) return it.dailyUse;
    let use = 0;
    D().routines.forEach((x) => {
      if (x.itemId !== it.id || x.status !== 'active' || !x.perServing) return;
      const f = x.schedule;
      const perDay = f.mode === 'daily' ? 1 : f.mode === 'days' ? f.days.length / 7 : f.mode === 'interval' ? 1 / f.every : 0;
      use += x.perServing * perDay;
    });
    return use > 0 ? use : null;
  };
  H.daysLeft = (it) => { const u = H.dailyUse(it); return it.onHand != null && u ? Math.floor(it.onHand / u) : null; };
  H.isLow = (it) => {
    if (it.status === 'dropped' || it.onHand == null) return false;
    if (it.lowAt != null && it.onHand <= it.lowAt) return true;
    const days = H.daysLeft(it);
    return days != null && days <= D().settings.lowDays;
  };
  H.costs = () => {
    let toBuy = 0, toBuyCount = 0, unknown = 0, spent = 0, recurring = 0;
    D().items.forEach((it) => {
      if (TO_BUY.includes(it.status)) { toBuyCount++; if (it.estPrice != null) toBuy += it.estPrice * (it.qty || 1); else unknown++; }
      it.purchases.forEach((p) => { if (p.price != null) spent += p.price; });
      if (it.status !== 'dropped' && it.monthlyCost) recurring += it.monthlyCost;
    });
    return { toBuy: r2(toBuy), toBuyCount, unknown, spent: r2(spent), recurring: r2(recurring) };
  };
  H.spentBetween = (from, to) => r2(D().items.reduce((s, it) => s + it.purchases.filter((p) => p.date >= from && p.date <= to && p.price != null).reduce((a, p) => a + p.price, 0), 0));

  /* ---------- shared UI pieces ---------- */

  H.vs = { day: null, suppDay: null, period: '3M', status: 'tobuy', category: '', priority: '', sort: 'priority', allWorkouts: false };
  const TABS = [['', 'Overview'], ['weight', 'Weight'], ['nutrition', 'Nutrition'], ['daily', 'Daily'], ['workouts', 'Workouts'], ['supplements', 'Supplements'], ['shopping', 'Shopping']];
  H.subnav = (cur) => '<nav class="hsub" aria-label="Health sections">' + TABS.map((t) => {
    const href = t[0] === 'weight' ? '#/weight' : t[0] === 'nutrition' ? '#/nutrition' : '#/health' + (t[0] ? '/' + t[0] : '');
    return '<a href="' + href + '"' + (t[0] === cur ? ' aria-current="page"' : '') + '>' + t[1] + '</a>';
  }).join('') + '</nav>';
  H.head = (title, right) => '<header class="page-head"><div><div class="eyebrow">Health</div><h1>' + title + '</h1></div>' + (right || '') + '</header>';

  const opt = (v, l, cur) => '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(l) + '</option>';
  const select = (id, options, cur, extra) => '<select id="' + id + '"' + (extra || '') + '>' + options.map((o) => opt(o[0], o[1], cur)).join('') + '</select>';
  const field = (lab, input, optional) => '<label class="field"><span class="label">' + lab + (optional ? ' <em>optional</em>' : '') + '</span>' + input + '</label>';
  const numInput = (id, v, ph, step) => '<input id="' + id + '" type="number" inputmode="decimal" min="0" step="' + (step || 'any') + '" placeholder="' + esc(ph || '') + '" value="' + (v != null && v !== '' ? v : '') + '">';
  const textInput = (id, v, ph, max) => '<input id="' + id + '" type="text" maxlength="' + (max || 80) + '" autocomplete="off" placeholder="' + esc(ph || '') + '" value="' + esc(v || '') + '">';
  const switchRow = (id, title, hint, on) => '<div class="switch-row"><div><div class="sw-title">' + title + '</div>' + (hint ? '<div class="hint">' + hint + '</div>' : '') + '</div>' +
    '<label class="switch" data-nodrag><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span></span></label></div>';
  const val = (wrap, sel) => { const e = HT.$(sel, wrap); return e ? e.value.trim() : ''; };
  const tile = (v, l) => '<div class="tile"><div class="tile-v">' + v + '</div><div class="tile-l">' + l + '</div></div>';
  const round1 = (n) => Math.round(n * 10) / 10;

  /* A form sheet with a single in-flight guard so a double tap can't save twice.
     onSave / onDelete return false to keep the sheet open. */
  function formSheet(o) {
    return HT.openSheet({
      title: o.title,
      kind: o.kind,
      html: o.html,
      footer: (o.onDelete ? '<button type="button" class="btn btn-danger-ghost" data-del>' + (o.deleteLabel || 'Delete') + '</button>' : '<button type="button" class="btn" data-close>Cancel</button>') +
        '<button type="button" class="btn btn-primary" data-save>' + (o.saveLabel || 'Save') + '</button>',
      onMount: (wrap, close) => {
        let busy = false;
        if (o.onMount) o.onMount(wrap);
        // A closing sheet ignores further taps (see HT.openSheet); `busy` covers saves that wait on a dialog.
        const finish = (ok) => { if (ok !== false) { HT.save(); close(); HT.render(); } };
        const run = (fn) => {
          if (busy) return;
          const res = fn(wrap);
          if (res && typeof res.then === 'function') {
            busy = true;
            res.then((ok) => { busy = false; finish(ok); }, (err) => { busy = false; console.error(err); });
          } else finish(res);
        };
        wrap.addEventListener('click', (e) => {
          if (e.target.closest('[data-save]')) run(o.onSave);
          else if (e.target.closest('[data-del]')) run(o.onDelete);
        });
        if (o.enterSaves !== false) wrap.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') run(o.onSave); });
      },
    });
  }
  const dateNav = (action, key) => {
    const today = HT.today();
    return '<div class="hday"><button type="button" class="icon-btn" data-action="' + action + '" data-d="-1" aria-label="Previous day">' + icon.back + '</button>' +
      '<div class="hday-l"><b>' + (key === today ? 'Today' : key === HT.addDays(today, -1) ? 'Yesterday' : esc(longDate(key))) + '</b>' + (key === today ? '<span>' + esc(longDate(key)) + '</span>' : '<button type="button" class="linkish" data-action="' + action + '" data-d="0">Back to today</button>') + '</div>' +
      '<button type="button" class="icon-btn" data-action="' + action + '" data-d="1" aria-label="Next day"' + (key >= today ? ' disabled' : '') + '>' + icon.next + '</button></div>';
  };
  const shiftDay = (prop, d) => {
    const today = HT.today();
    const cur = H.vs[prop] || today;
    H.vs[prop] = +d === 0 ? today : HT.addDays(cur, +d) > today ? today : HT.addDays(cur, +d);
    HT.render();
  };

  /* ---------- metric rows (Daily screen + Today widget) ---------- */

  function metricRow(m, key, compact) {
    const t = trackerOf(m);
    const p = H.metricProgress(m, key);
    const v = H.metricValue(m, key);
    const done = p != null ? p >= 1 : v != null && m.kind !== 'weight';
    let ctl;
    if (t ? HT.typeOf(t).mode === 'toggle' : m.kind === 'boolean') ctl = '<button type="button" class="check" data-action="h-m-toggle" aria-pressed="' + (v ? 'true' : 'false') + '" aria-label="Toggle ' + esc(m.name) + '">' + icon.check + '</button>';
    else if (!t && (m.kind === 'water' || m.kind === 'quantity')) ctl = '<button type="button" class="qbtn" data-action="h-m-quick">+' + esc(m.kind === 'water' ? fmtWater(m.step || 250) : HT.num(m.step || 1) + (m.unit ? ' ' + m.unit : '')) + '</button>' +
      '<button type="button" class="rbtn" data-action="h-m-log" aria-label="Enter ' + esc(m.name) + '">' + icon.edit + '</button>';
    else ctl = '<button type="button" class="qbtn" data-action="h-m-log">' + (m.kind === 'weight' || m.kind === 'workout' ? (v == null ? 'Log' : 'Add') : v == null ? 'Log' : 'Edit') + '</button>';
    const sub = H.fmtMetric(m, key) + (t ? ' · from habit' : '');
    return '<li class="tcard' + (done ? ' done' : '') + '" data-id="' + m.id + '" data-date="' + key + '" style="--c:' + (t ? t.color : '#2b7a9e') + '">' +
      '<button type="button" class="tmain" data-action="h-m-log"><span class="ticon" aria-hidden="true">' + esc(t ? t.icon : m.icon) + '</span><span class="tinfo"><span class="tname">' + esc(m.name) + '</span>' +
      '<span class="tsub"><span class="tprog">' + (done && p != null ? '<b class="tick">✓</b> ' : '') + esc(sub) + '</span></span></span></button>' +
      '<div class="tctl" data-nodrag>' + ctl + '</div>' + (p != null ? '<div class="tbar"><i style="width:' + Math.round(p * 100) + '%"></i></div>' : '') + '</li>';
  }
  const metricCtx = (el) => { const li = el.closest('[data-id]'); return { m: H.metric(li.dataset.id), key: li.dataset.date || HT.today() }; };

  HT.actions['h-m-toggle'] = (el) => {
    const c = metricCtx(el), t = trackerOf(c.m);
    if (t) HT.log(t, c.key, HT.isDone(t, c.key) ? 0 : 1);
    else H.setMetric(c.m, c.key, H.metricValue(c.m, c.key) ? null : 1);
    HT.render();
  };
  HT.actions['h-m-quick'] = (el) => {
    const c = metricCtx(el);
    if (trackerOf(c.m)) { H.openMetric(c.m, c.key); return; }
    H.setMetric(c.m, c.key, (H.metricValue(c.m, c.key) || 0) + (c.m.step || (c.m.kind === 'water' ? 250 : 1)));
    HT.render();
  };
  HT.actions['h-m-log'] = (el) => { const c = metricCtx(el); H.openMetric(c.m, c.key); };

  /* Entry sheet for one metric on one day. Linked and derived metrics hand off to their owner. */
  H.openMetric = (m, key) => {
    const t = trackerOf(m);
    if (t) { if (HT.typeOf(t).mode === 'toggle') { HT.log(t, key, HT.isDone(t, key) ? 0 : 1); HT.render(); } else HT.openLog(t, key); return; }
    if (m.kind === 'weight') { HT.weight.openLog(null, key); return; }
    if (m.kind === 'workout') { H.openWorkout(null, null, key); return; }
    if (m.kind === 'boolean') { H.setMetric(m, key, H.metricValue(m, key) ? null : 1); HT.render(); return; }
    const cur = H.metricValue(m, key);
    const additive = m.kind === 'water' || m.kind === 'quantity';
    const unitName = m.kind === 'water' ? (D().settings.water === 'oz' ? 'fl oz' : D().settings.water) : m.unit;
    let mode = additive ? 'add' : 'set';
    let body = '<p class="muted gap-bottom">' + esc(key === HT.today() ? 'Today' : longDate(key)) + ' · now <b id="hm-now">' + esc(H.fmtMetric(m, key)) + '</b></p>';
    if (m.kind === 'duration') {
      body += '<div class="row2">' + field('Hours', '<input id="hm-h" type="number" inputmode="numeric" min="0" max="24" placeholder="0" value="' + (cur ? Math.floor(cur / 60) : '') + '">') +
        field('Minutes', '<input id="hm-min" type="number" inputmode="numeric" min="0" max="59" placeholder="0" value="' + (cur ? Math.round(cur % 60) : '') + '">') + '</div>';
    } else {
      if (additive) {
        const step = m.step || (m.kind === 'water' ? 250 : 1);
        body += '<div class="chips gap-bottom">' + [1, 2, 4].map((k) => '<button type="button" class="chip" data-add="' + step * k + '">+' + esc(m.kind === 'water' ? fmtWater(step * k) : HT.num(step * k) + ' ' + m.unit) + '</button>').join('') + '</div>' +
          '<div class="segmented gap-bottom" id="hm-mode"><button type="button" data-m="add" aria-pressed="true">Add</button><button type="button" data-m="set" aria-pressed="false">Set total</button></div>';
      }
      body += field('<span id="hm-label">' + (additive ? 'Add' : 'Value') + (unitName ? ' (' + esc(unitName) + ')' : '') + '</span>',
        '<input id="hm-val" type="number" inputmode="decimal" min="0" step="any" placeholder="0" value="' + (!additive && cur != null ? cur : '') + '">');
    }
    formSheet({
      title: m.name,
      html: body,
      onDelete: cur != null ? () => { H.setMetric(m, key, null); HT.toast(m.name + ' cleared'); } : null,
      deleteLabel: 'Clear',
      onMount: (wrap) => {
        const now = HT.$('#hm-now', wrap);
        wrap.addEventListener('click', (e) => {
          const add = e.target.closest('[data-add]');
          if (add) { H.setMetric(m, key, (H.metricValue(m, key) || 0) + Number(add.dataset.add)); now.textContent = H.fmtMetric(m, key); return; }
          const b = e.target.closest('#hm-mode [data-m]');
          if (b) {
            mode = b.dataset.m;
            HT.$$('#hm-mode [data-m]', wrap).forEach((x) => x.setAttribute('aria-pressed', x === b));
            HT.$('#hm-label', wrap).textContent = (mode === 'add' ? 'Add' : 'Total') + (unitName ? ' (' + unitName + ')' : '');
            const v = H.metricValue(m, key);
            HT.$('#hm-val', wrap).value = mode === 'set' && v != null ? round1(m.kind === 'water' ? waterOut(v) : v) : '';
          }
        });
        setTimeout(() => { const f = HT.$('#hm-val', wrap) || HT.$('#hm-h', wrap); if (f) f.focus(); }, 250);
      },
      onSave: (wrap) => {
        let v;
        if (m.kind === 'duration') {
          const h = val(wrap, '#hm-h'), mi = val(wrap, '#hm-min');
          if (h === '' && mi === '') return undefined; // nothing typed: just close
          const hh = num(h) || 0, mm = num(mi) || 0;
          if (hh < 0 || mm < 0 || mm >= 60 || hh > 24) { HT.toast('Enter hours (0–24) and minutes (0–59)'); return false; }
          v = hh * 60 + mm;
        } else {
          const raw = val(wrap, '#hm-val');
          if (raw === '') return undefined;
          const x = num(raw);
          if (x == null || x < 0) { HT.toast('Enter a number of 0 or more'); return false; }
          const base = m.kind === 'water' ? waterIn(x) : x;
          v = mode === 'add' ? (H.metricValue(m, key) || 0) + base : base;
        }
        H.setMetric(m, key, v);
        HT.toast(m.name + ' saved');
      },
    });
  };

  /* ---------- Daily screen ---------- */

  function daily() {
    const key = H.vs.day || HT.today();
    const list = H.metrics().filter((m) => m.enabled);
    let html = H.head('Daily log', '<button type="button" class="btn" data-action="h-metrics">' + icon.settings + '<span>Customize</span></button>') + H.subnav('daily') + dateNav('h-day', key);
    if (!list.length) return html + '<section class="empty"><h2>No metrics turned on</h2><p>Choose what you want to track each day — nothing is required.</p><button type="button" class="btn btn-primary btn-lg" data-action="h-metrics">Choose metrics</button></section>';
    html += '<ul class="tlist" data-sortable="metrics">' + list.map((m) => metricRow(m, key)).join('') + '</ul>' +
      '<p class="hint center">Press and hold to reorder. Track only what is useful — targets are optional.</p>';
    return html;
  }
  HT.actions['h-day'] = (el) => shiftDay('day', el.dataset.d);

  /* Customize metrics: enable, targets, link to an existing habit, add / remove custom ones. */
  HT.actions['h-metrics'] = () => {
    const habits = HT.sorted().filter((t) => t.status !== 'archived');
    const targetCell = (m) => {
      if (m.kind === 'weight' || m.kind === 'boolean') return '';
      if (m.kind === 'duration' || m.kind === 'workout') {
        const v = m.target;
        return '<div class="row2">' + field('Daily target hours', '<input data-tgt-h="' + m.id + '" type="number" inputmode="numeric" min="0" max="24" placeholder="—" value="' + (v ? Math.floor(v / 60) : '') + '">', true) +
          field('Minutes', '<input data-tgt-m="' + m.id + '" type="number" inputmode="numeric" min="0" max="59" placeholder="—" value="' + (v ? v % 60 : '') + '">') + '</div>';
      }
      const shown = m.target ? (m.kind === 'water' ? round1(waterOut(m.target)) : m.target) : '';
      const u = m.kind === 'water' ? (D().settings.water === 'oz' ? 'fl oz' : D().settings.water) : m.unit;
      return field('Daily target' + (u ? ' (' + esc(u) + ')' : ''), '<input data-tgt="' + m.id + '" type="number" inputmode="decimal" min="0" step="any" placeholder="No target" value="' + shown + '">', true);
    };
    const linkCell = (m) => (m.kind === 'weight' || m.kind === 'workout' || !habits.length ? '' :
      field('Use an existing habit instead', '<select data-link="' + m.id + '"><option value="">Don\'t link — track here</option>' + habits.map((t) => opt(t.id, t.icon + ' ' + t.name, m.trackerId || '')).join('') + '</select>', true));
    const row = (m) => '<div class="mrow" data-mid="' + m.id + '">' + switchRow('en-' + m.id, esc(m.icon + ' ' + m.name), m.key === 'weight' ? 'Uses your weigh-ins.' : m.key === 'exercise' ? 'Uses your workout log.' : m.key ? '' : 'Custom', m.enabled) +
      '<div class="mrow-body">' + targetCell(m) + linkCell(m) + (m.key ? '' : '<button type="button" class="btn btn-danger-ghost btn-sm" data-rm-metric="' + m.id + '">Remove metric</button>') + '</div></div>';
    const addForm = '<div class="madd"><h3>Add your own metric</h3>' + field('Name', textInput('nm-name', '', 'e.g. Resting heart rate', 40)) +
      '<div class="row2">' + field('Type', select('nm-kind', CUSTOM_KINDS, 'quantity')) + field('Unit', textInput('nm-unit', '', 'e.g. bpm', 16), true) + '</div>' +
      field('Daily target', numInput('nm-target', '', 'No target'), true) + '<button type="button" class="btn wide" data-add-metric>Add metric</button></div>';
    formSheet({
      title: 'Daily metrics',
      kind: 'sheet tall',
      enterSaves: false,
      html: '<p class="hint gap-bottom">Turn on only what you want to see. Linking to a habit reads and writes that habit\'s entries, so nothing is tracked twice.</p>' +
        H.metrics().map(row).join('') + addForm,
      onMount: (wrap) => {
        wrap.addEventListener('click', async (e) => {
          const rm = e.target.closest('[data-rm-metric]');
          if (rm) {
            const m = H.metric(rm.dataset.rmMetric);
            const days = Object.keys(D().daily).filter((k) => D().daily[k][m.id] != null).length;
            const ok = await HT.confirm({ title: 'Remove metric?', message: 'Remove <b>' + esc(m.name) + '</b>' + (days ? ' and its ' + plural(days, 'day') + ' of entries' : '') + '? To keep the history, just switch it off instead.', confirmLabel: 'Remove', danger: true });
            if (!ok) return;
            D().metrics = D().metrics.filter((x) => x.id !== m.id);
            Object.keys(D().daily).forEach((k) => { delete D().daily[k][m.id]; if (!Object.keys(D().daily[k]).length) delete D().daily[k]; });
            HT.save();
            rm.closest('.mrow').remove();
            HT.toast('Metric removed');
          } else if (e.target.closest('[data-add-metric]')) {
            const name = val(wrap, '#nm-name');
            if (!name) { HT.toast('Name the metric'); HT.$('#nm-name', wrap).focus(); return; }
            const kind = val(wrap, '#nm-kind');
            const tg = num(val(wrap, '#nm-target'));
            if (tg != null && tg < 0) { HT.toast('A target can\'t be negative'); return; }
            const m = normMetric({ name, kind, unit: val(wrap, '#nm-unit'), target: kind === 'duration' && tg ? tg * 60 : tg, enabled: true, order: D().metrics.length + 1 }, null);
            D().metrics.push(m);
            HT.save();
            const list = HT.$$('.mrow', wrap);
            list[list.length - 1].insertAdjacentHTML('afterend', row(m));
            ['#nm-name', '#nm-unit', '#nm-target'].forEach((s) => { HT.$(s, wrap).value = ''; });
            HT.toast(name + ' added');
          }
        });
      },
      onSave: (wrap) => {
        for (const m of D().metrics) {
          const box = HT.$('[data-mid="' + m.id + '"]', wrap);
          if (!box) continue;
          const en = HT.$('#en-' + m.id, wrap);
          m.enabled = en ? en.checked : m.enabled;
          const t = HT.$('[data-tgt="' + m.id + '"]', wrap);
          if (t) {
            const x = num(t.value.trim());
            if (x != null && x < 0) { HT.toast('Targets can\'t be negative'); return false; }
            m.target = x ? (m.kind === 'water' ? waterIn(x) : x) : null;
          }
          const th = HT.$('[data-tgt-h="' + m.id + '"]', wrap), tm = HT.$('[data-tgt-m="' + m.id + '"]', wrap);
          if (th) { const mins = (num(th.value) || 0) * 60 + (num(tm.value) || 0); m.target = mins > 0 ? mins : null; }
          const ln = HT.$('[data-link="' + m.id + '"]', wrap);
          if (ln) m.trackerId = ln.value || null;
        }
        HT.toast('Metrics saved');
      },
    });
  };

  /* ---------- workouts ---------- */

  H.openWorkout = (existing, template, date) => {
    const isTemplate = template === 'edit-template';
    const src = existing || (template && template !== 'edit-template' ? template : null);
    const state = {
      type: src ? src.type : 'strength',
      name: src ? src.name : '',
      exercises: src ? JSON.parse(JSON.stringify(src.exercises)) : [],
    };
    if (isTemplate) state.tpl = existing;
    const showDist = () => wtype(state.type)[3];
    const exHTML = () => state.exercises.map((ex, i) => '<div class="ex" data-ex="' + i + '"><div class="ex-head"><input type="text" data-exname="' + i + '" maxlength="60" placeholder="Exercise, e.g. Bench press" value="' + esc(ex.name) + '">' +
      '<button type="button" class="icon-btn" data-ex-rm="' + i + '" aria-label="Remove exercise">' + icon.x + '</button></div>' +
      '<div class="sets"><span class="sets-h">Set</span><span class="sets-h">Reps</span><span class="sets-h">Weight (' + wUnit() + ')</span><span></span>' +
      ex.sets.map((s, j) => '<span class="set-n">' + (j + 1) + '</span><input type="number" inputmode="numeric" min="0" data-reps="' + i + '-' + j + '" value="' + (s.reps != null ? s.reps : '') + '" aria-label="Reps, set ' + (j + 1) + '">' +
        '<input type="number" inputmode="decimal" min="0" step="any" data-kg="' + i + '-' + j + '" value="' + (s.kg != null ? round1(liftOut(s.kg)) : '') + '" aria-label="Weight, set ' + (j + 1) + '">' +
        '<button type="button" class="icon-btn sm" data-set-rm="' + i + '-' + j + '" aria-label="Remove set">' + icon.minus + '</button>').join('') +
      '</div><button type="button" class="btn btn-sm" data-set-add="' + i + '">' + icon.plus + '<span>Add set</span></button></div>').join('');
    const readEx = (wrap) => {
      state.exercises = state.exercises.map((ex, i) => ({
        name: val(wrap, '[data-exname="' + i + '"]'),
        sets: ex.sets.map((s, j) => ({ reps: pos(val(wrap, '[data-reps="' + i + '-' + j + '"]')), kg: (() => { const v = pos(val(wrap, '[data-kg="' + i + '-' + j + '"]')); return v != null ? liftIn(v) : null; })() })),
      }));
    };
    const base = existing && !isTemplate ? existing : src || {};
    const dateVal = existing && !isTemplate ? existing.date : date || HT.today();
    const html = '<div class="field"><span class="label">Activity</span><div class="chips" id="wo-types">' + WTYPES.map((t) =>
      '<button type="button" class="chip' + (t[0] === state.type ? ' on' : '') + '" data-wtype="' + t[0] + '">' + t[2] + ' ' + t[1] + '</button>').join('') + '</div></div>' +
      field(isTemplate ? 'Template name' : 'Name', textInput('wo-name', state.name, isTemplate ? 'e.g. Push day' : 'e.g. Push day, Morning walk', 60), !isTemplate) +
      (isTemplate ? '' : '<div class="row2">' + field('Date', '<input id="wo-date" type="date" max="' + HT.today() + '" value="' + dateVal + '">') + field('Time', '<input id="wo-time" type="time" value="' + esc(existing ? existing.time : '') + '">', true) + '</div>') +
      '<div class="row2">' + field('Duration (min)', numInput('wo-dur', base.duration, 'e.g. 45', '1'), true) +
      '<label class="field" id="wo-dist-f"' + (showDist() ? '' : ' hidden') + '><span class="label">Distance (' + D().settings.distance + ') <em>optional</em></span>' + numInput('wo-dist', base.distance ? round1(distOut(base.distance)) : '', '', 'any') + '</label></div>' +
      '<details class="wo-ex"' + (state.exercises.length ? ' open' : '') + '><summary>Exercise details <em>optional</em></summary><div id="wo-exlist">' + exHTML() + '</div>' +
      '<button type="button" class="btn wide" data-ex-add>' + icon.plus + '<span>Add exercise</span></button></details>' +
      (isTemplate ? '' : field('Notes', textInput('wo-notes', existing ? existing.notes : '', 'How it went', 400), true)) +
      (!existing && !isTemplate ? switchRow('wo-save-tpl', 'Also save as a template', 'Reuse this workout later in a couple of taps.', false) : '');
    formSheet({
      title: isTemplate ? (existing ? 'Edit template' : 'New template') : existing ? 'Edit workout' : template ? template.name : 'Log workout',
      kind: 'sheet tall',
      html,
      saveLabel: isTemplate ? 'Save template' : existing ? 'Save' : 'Log workout',
      onDelete: existing ? async () => {
        const ok = await HT.confirm({ title: isTemplate ? 'Delete template?' : 'Delete workout?', message: isTemplate ? 'Delete the <b>' + esc(existing.name) + '</b> template? Workouts already logged are kept.' : 'Delete this workout from ' + esc(longDate(existing.date)) + '? This can\'t be undone.', confirmLabel: 'Delete', danger: true });
        if (!ok) return false;
        if (isTemplate) D().templates = D().templates.filter((t) => t.id !== existing.id);
        else D().workouts = D().workouts.filter((w) => w.id !== existing.id);
        HT.toast(isTemplate ? 'Template deleted' : 'Workout deleted');
      } : null,
      onMount: (wrap) => {
        const redrawEx = () => { HT.$('#wo-exlist', wrap).innerHTML = exHTML(); };
        wrap.addEventListener('click', (e) => {
          let b;
          if ((b = e.target.closest('[data-wtype]'))) {
            state.type = b.dataset.wtype;
            HT.$$('[data-wtype]', wrap).forEach((x) => x.classList.toggle('on', x === b));
            HT.$('#wo-dist-f', wrap).hidden = !showDist();
          } else if (e.target.closest('[data-ex-add]')) { readEx(wrap); state.exercises.push({ name: '', sets: [{ reps: null, kg: null }] }); redrawEx(); const ins = HT.$$('[data-exname]', wrap); ins[ins.length - 1].focus(); }
          else if ((b = e.target.closest('[data-ex-rm]'))) { readEx(wrap); state.exercises.splice(+b.dataset.exRm, 1); redrawEx(); }
          else if ((b = e.target.closest('[data-set-add]'))) {
            readEx(wrap);
            const ex = state.exercises[+b.dataset.setAdd];
            const last = ex.sets[ex.sets.length - 1];
            ex.sets.push({ reps: last ? last.reps : null, kg: last ? last.kg : null });
            redrawEx();
          } else if ((b = e.target.closest('[data-set-rm]'))) { readEx(wrap); const p = b.dataset.setRm.split('-'); state.exercises[+p[0]].sets.splice(+p[1], 1); redrawEx(); }
        });
      },
      onSave: (wrap) => {
        readEx(wrap);
        const name = val(wrap, '#wo-name');
        if (isTemplate && !name) { HT.toast('Name the template'); return false; }
        const dur = val(wrap, '#wo-dur'), dist = val(wrap, '#wo-dist');
        if ((dur !== '' && !(num(dur) > 0)) || (dist !== '' && !(num(dist) > 0))) { HT.toast('Duration and distance must be more than 0, or left blank'); return false; }
        const fields = {
          type: state.type, name,
          duration: dur !== '' ? Math.round(num(dur)) : null,
          distance: showDist() && dist !== '' ? distIn(num(dist)) : null,
          exercises: normExercises(state.exercises),
        };
        if (isTemplate) {
          if (existing) Object.assign(existing, fields);
          else D().templates.push(Object.assign({ id: hid('tp') }, fields));
          HT.toast('Template saved');
          return;
        }
        const date = val(wrap, '#wo-date');
        if (!HT.isDateKey(date)) { HT.toast('Pick a date'); return false; }
        if (date > HT.today()) { HT.toast('That date is in the future'); return false; }
        Object.assign(fields, { date, time: val(wrap, '#wo-time'), notes: val(wrap, '#wo-notes') });
        if (existing) Object.assign(existing, fields);
        else {
          D().workouts.push(Object.assign({ id: hid('wo'), templateId: template && template.id ? template.id : null, createdAt: new Date().toISOString() }, fields));
          const tpl = HT.$('#wo-save-tpl', wrap);
          if (tpl && tpl.checked) D().templates.push({ id: hid('tp'), name: name || wtype(fields.type)[1], type: fields.type, duration: fields.duration, distance: fields.distance, exercises: fields.exercises });
          linkWorkoutHabit(date);
        }
        D().workouts.sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1));
        HT.data.health = HT.normalizeHealth(D());
        HT.toast(existing ? 'Workout updated' : 'Workout logged');
      },
    });
  };
  HT.actions['h-wo-log'] = (el) => H.openWorkout(null, null, el.dataset.date);
  HT.actions['h-wo-edit'] = (el) => { const w = D().workouts.find((x) => x.id === el.closest('[data-id]').dataset.id); if (w) H.openWorkout(w); };
  HT.actions['h-wo-tpl'] = (el) => { const t = D().templates.find((x) => x.id === el.dataset.id); if (t) H.openWorkout(null, t); };
  HT.actions['h-tpl-edit'] = (el) => { const t = D().templates.find((x) => x.id === el.closest('[data-id]').dataset.id); if (t) H.openWorkout(t, 'edit-template'); };
  HT.actions['h-tpl-new'] = () => H.openWorkout(null, 'edit-template');
  HT.actions['h-wo-all'] = () => { H.vs.allWorkouts = true; HT.render(); };

  const workoutLine = (w) => [w.duration ? HT.dur(w.duration) : '', w.distance ? fmtDist(w.distance) : '', w.exercises.length ? plural(w.exercises.length, 'exercise') : ''].filter(Boolean).join(' · ') || 'Logged';
  const workoutTitle = (w) => w.name || wtype(w.type)[1];

  function workouts() {
    const today = HT.today();
    let html = H.head('Workouts', '<button type="button" class="btn btn-primary" data-action="h-wo-log">' + icon.plus + '<span>Log workout</span></button>') + H.subnav('workouts');
    const tpls = D().templates;
    html += '<section class="panel-card"><div class="card-head"><h3>Quick log from a template</h3><button type="button" class="btn btn-sm" data-action="h-tpl-new">' + icon.plus + '<span>Template</span></button></div>' +
      (tpls.length ? '<div class="chips">' + tpls.map((t) => '<button type="button" class="chip" data-action="h-wo-tpl" data-id="' + t.id + '">' + wtype(t.type)[2] + ' ' + esc(t.name) + '</button>').join('') + '</div>' +
        '<ul class="dlist gap-top">' + tpls.map((t) => '<li data-id="' + t.id + '"><button type="button" class="drow" data-action="h-tpl-edit"><span class="dname">' + esc(t.name) + '<small>' + esc(wtype(t.type)[1] + (t.duration ? ' · ' + HT.dur(t.duration) : '') + (t.exercises.length ? ' · ' + plural(t.exercises.length, 'exercise') : '')) + '</small></span><span class="dval">Edit</span></button></li>').join('') + '</ul>'
        : '<p class="muted">Save a workout you repeat — like "Push day" or "Evening walk" — and log it again in two taps.</p>') + '</section>';

    const all = D().workouts;
    if (!all.length) return html + '<section class="empty"><div class="empty-mark">' + icon.health + '</div><h2>No workouts yet</h2><p>A quick entry is just the activity and how long — details like sets and distance are optional.</p></section>';

    const ws = HT.weekStart(today);
    const wk = H.workoutStats(ws, HT.addDays(ws, 6));
    const m30 = H.workoutStats(HT.addDays(today, -29), today);
    html += '<div class="tiles t3">' + tile(wk.count, 'This week') + tile(wk.minutes ? HT.dur(wk.minutes) : '—', 'Time this week') + tile(m30.count, 'Last 30 days') + '</div>';

    const cols = [];
    let peak = 0;
    for (let i = 7; i >= 0; i--) {
      const s = HT.addDays(ws, -7 * i), st = H.workoutStats(s, HT.addDays(s, 6));
      peak = Math.max(peak, st.minutes);
      cols.push({ s, st });
    }
    html += '<section class="panel-card"><h3>Last 8 weeks</h3><div class="bars">' + cols.map((c, i) =>
      '<div class="bar-col' + (i === 7 ? ' now' : '') + '"><div class="bar-num">' + (c.st.count || '') + '</div><div class="bar-track"><i class="' + (c.st.count ? 'full' : '') + '" style="height:' + (peak ? (c.st.minutes / peak) * 100 : 0) + '%"></i></div><span>' + shortDate(c.s).replace(/ /, ' ') + '</span></div>').join('') +
      '</div><p class="hint">Bar height is total time; the number is how many workouts. Weeks start ' + HT.DAY_NAMES[HT.data.settings.weekStart] + '.</p></section>';

    const rec = H.records();
    if (rec.lifts.length || rec.cardio.length) {
      html += '<section class="panel-card"><h3>Best performances</h3>' +
        rec.lifts.map((l) => '<div class="frow"><span>' + esc(l.name) + '</span><b>' + (l.heavy ? fmtLift(l.heavy.kg) + (l.heavy.reps ? ' × ' + l.heavy.reps : '') : '') +
          (l.reps && (!l.heavy || l.reps.reps !== l.heavy.reps) ? (l.heavy ? ' · ' : '') + l.reps.reps + ' reps' : '') + '</b></div>').join('') +
        rec.cardio.map((c) => '<div class="frow"><span>' + esc(wtype(c.type)[1]) + '</span><b>' + [c.far ? 'Longest ' + fmtDist(c.far.distance) : '', c.long ? 'Longest ' + HT.dur(c.long.duration) : ''].filter(Boolean).join(' · ') + '</b></div>').join('') +
        '<p class="hint">Taken from what you logged: heaviest set and most reps per exercise; longest distance and time per activity.</p></section>';
    }

    const list = all.slice().reverse();
    const shown = H.vs.allWorkouts ? list : list.slice(0, 15);
    html += '<section class="panel-card"><h3>History</h3><ul class="dlist">' + shown.map((w) => '<li data-id="' + w.id + '"><button type="button" class="drow" data-action="h-wo-edit">' +
      '<span class="ticon" aria-hidden="true">' + wtype(w.type)[2] + '</span><span class="dname">' + esc(workoutTitle(w)) + '<small>' + esc(longDate(w.date) + ' · ' + workoutLine(w)) + (w.notes ? ' · ' + esc(w.notes) : '') + '</small></span><span class="chev">' + icon.next + '</span></button></li>').join('') + '</ul>' +
      (list.length > shown.length ? '<button type="button" class="btn wide" data-action="h-wo-all">Show all ' + list.length + ' workouts</button>' : '') + '</section>';

    const habits = HT.sorted().filter((t) => t.status === 'active' && HT.typeOf(t).mode === 'toggle');
    if (habits.length) {
      html += '<section class="panel-card"><div class="field"><label class="label" for="h-wo-habit">When I log a workout, also mark this habit done</label>' +
        '<select id="h-wo-habit"><option value="">Don\'t mark any habit</option>' + habits.map((t) => opt(t.id, t.icon + ' ' + t.name, D().settings.workoutHabit || '')).join('') + '</select>' +
        '<p class="hint">The habit keeps its own record; deleting a workout later doesn\'t un-mark it.</p></div></section>';
    }
    return html;
  }

  /* ---------- supplements ---------- */

  function routineRow(x, key, compact) {
    const s = H.intakeOf(x, key), due = H.routineDue(x, key), past = key < HT.today();
    const it = x.itemId ? H.item(x.itemId) : null;
    const state = s === 'taken' ? 'Taken' : s === 'skipped' ? 'Skipped' : !due ? 'As needed / not scheduled' : past ? 'Not logged' : 'Not logged yet';
    const meta = [x.serving, label(TIMES, x.timeOfDay) && x.timeOfDay ? label(TIMES, x.timeOfDay) : '', !compact && it && it.onHand != null ? HT.num(it.onHand) + (it.unitLabel ? ' ' + it.unitLabel : '') + ' left' : ''].filter(Boolean).join(' · ');
    return '<li class="srow ' + (s || (due && past ? 'missed' : '')) + '" data-id="' + x.id + '" data-date="' + key + '"><div class="srow-t"><span class="tname">' + esc(x.name) + '</span><span class="srow-m">' + esc(meta || scheduleText(x)) + '</span>' +
      '<span class="srow-s">' + state + '</span></div><div class="srow-b">' +
      '<button type="button" class="btn btn-sm' + (s === 'taken' ? ' on' : '') + '" data-action="h-sp-set" data-s="taken" aria-pressed="' + (s === 'taken') + '">' + icon.check + '<span>Taken</span></button>' +
      '<button type="button" class="btn btn-sm' + (s === 'skipped' ? ' on' : '') + '" data-action="h-sp-set" data-s="skipped" aria-pressed="' + (s === 'skipped') + '">Skip</button></div></li>';
  }
  HT.actions['h-sp-set'] = (el) => {
    const li = el.closest('[data-id]');
    const x = D().routines.find((r) => r.id === li.dataset.id);
    const key = li.dataset.date;
    H.setIntake(x, key, H.intakeOf(x, key) === el.dataset.s ? null : el.dataset.s);
    HT.render();
  };
  HT.actions['h-sp-day'] = (el) => shiftDay('suppDay', el.dataset.d);

  function supplements() {
    const key = H.vs.suppDay || HT.today();
    const today = HT.today();
    const all = D().routines;
    let html = H.head('Supplements', '<button type="button" class="btn btn-primary" data-action="h-rt-new">' + icon.plus + '<span>Add</span></button>') + H.subnav('supplements');
    const note = '<p class="hint">A tracking log only: record what you take, using your product label or your clinician\'s advice. The app doesn\'t suggest products, doses or combinations.</p>';
    if (!all.length) return html + '<section class="empty"><div class="empty-mark">' + icon.health + '</div><h2>No routine yet</h2><p>Add the vitamins or supplements you currently use, then check them off each day. Nothing is scheduled unless you set it.</p>' +
      '<button type="button" class="btn btn-primary btn-lg" data-action="h-rt-new">' + icon.plus + '<span>Add to routine</span></button></section>' + note;
    const active = all.filter((x) => x.status === 'active');
    const due = active.filter((x) => H.routineDue(x, key) || H.intakeOf(x, key));
    const asNeeded = active.filter((x) => !H.routineDue(x, key) && !H.intakeOf(x, key) && x.schedule.mode === 'asneeded');
    html += dateNav('h-sp-day', key) + '<section class="panel-card"><h3>' + (key === today ? 'Today' : 'This day') + '</h3>' +
      (due.length ? '<ul class="slist">' + due.map((x) => routineRow(x, key)).join('') + '</ul>' : '<p class="muted">Nothing scheduled for this day.</p>') +
      (asNeeded.length ? '<h3 class="sp">As needed</h3><ul class="slist">' + asNeeded.map((x) => routineRow(x, key)).join('') + '</ul>' : '') + '</section>';

    // 14-day grid: ✓ taken, – skipped, ○ scheduled but not logged, blank = not scheduled
    const days = [];
    for (let i = 13; i >= 0; i--) days.push(HT.addDays(today, -i));
    html += '<section class="panel-card"><h3>Last 14 days</h3><div class="sgrid-wrap"><table class="sgrid"><thead><tr><th></th>' + days.map((d) => '<th>' + HT.parseKey(d).getDate() + '</th>').join('') + '</tr></thead><tbody>' +
      all.map((x) => '<tr><th>' + esc(x.name) + '</th>' + days.map((d) => {
        const s = H.intakeOf(x, d), dueD = H.routineDue(x, d);
        const c = s === 'taken' ? ['t', '✓', 'taken'] : s === 'skipped' ? ['s', '–', 'skipped'] : dueD && d < today ? ['m', '○', 'not logged'] : dueD ? ['p', '·', 'scheduled'] : ['n', '', 'not scheduled'];
        return '<td class="' + c[0] + '" title="' + esc(shortDate(d) + ': ' + c[2]) + '">' + c[1] + '</td>';
      }).join('') + '</tr>').join('') + '</tbody></table></div>' +
      '<div class="legend"><span>✓ Taken</span><span>– Skipped (you chose to)</span><span>○ Scheduled, nothing logged</span></div></section>';

    const from = HT.addDays(today, -29);
    const cons = all.map((x) => ({ x, c: H.routineConsistency(x, from) })).filter((o) => o.c.due >= 7);
    if (cons.length) {
      html += '<section class="panel-card"><h3>Last 30 days</h3>' + cons.map((o) => '<div class="frow"><span>' + esc(o.x.name) + '</span><b>' + o.c.taken + ' of ' + o.c.due + ' scheduled days logged as taken' +
        (o.c.skipped ? ' · ' + o.c.skipped + ' skipped' : '') + '</b></div>').join('') + '</section>';
    }
    html += '<section class="panel-card"><h3>Your routine</h3><ul class="dlist">' + all.map((x) => {
      const it = x.itemId ? H.item(x.itemId) : null;
      return '<li data-id="' + x.id + '"><button type="button" class="drow" data-action="h-rt-edit"><span class="dname">' + esc(x.name) + (x.status === 'paused' ? ' <em class="tag">paused</em>' : '') +
        '<small>' + esc([x.serving, scheduleText(x), label(TIMES, x.timeOfDay) && x.timeOfDay ? label(TIMES, x.timeOfDay) : '', it ? 'stock: ' + it.name : ''].filter(Boolean).join(' · ')) + '</small></span><span class="chev">' + icon.next + '</span></button></li>';
    }).join('') + '</ul></section>' + note;
    return html;
  }

  H.openRoutine = (existing) => {
    const x = existing || { name: '', serving: '', schedule: { mode: 'daily', days: [1, 3, 5], every: 2 }, timeOfDay: '', startDate: HT.today(), itemId: null, perServing: null, notes: '', status: 'active' };
    const sched = JSON.parse(JSON.stringify(x.schedule));
    if (!sched.days.length) sched.days = [1, 3, 5];
    const items = D().items.filter((i) => i.status !== 'dropped');
    const body = () => field('Name', textInput('rt-name', x.name, 'e.g. Vitamin D', 80)) +
      field('Serving, as written on the label', textInput('rt-serving', x.serving, 'e.g. 1 softgel', 80), true) +
      '<div class="row2">' + field('Schedule', select('rt-mode', [['daily', 'Every day'], ['days', 'Specific days'], ['interval', 'Every few days'], ['asneeded', 'As needed (not scheduled)']], sched.mode)) +
      field('Time of day', select('rt-time', TIMES, x.timeOfDay), true) + '</div>' +
      (sched.mode === 'days' ? '<div class="days gap-bottom">' + [1, 2, 3, 4, 5, 6, 0].map((d) => '<button type="button" data-day="' + d + '" aria-pressed="' + sched.days.includes(d) + '">' + HT.DAY_NAMES[d] + '</button>').join('') + '</div>' : '') +
      (sched.mode === 'interval' ? '<div class="inline-field gap-bottom">Every <input id="rt-every" type="number" inputmode="numeric" min="2" max="90" value="' + sched.every + '"> days from the start date</div>' : '') +
      field('Start date', '<input id="rt-start" type="date" value="' + x.startDate + '">') +
      (items.length ? '<div class="row2">' + field('Count stock from', '<select id="rt-item"><option value="">Don\'t track stock</option>' + items.map((i) => opt(i.id, i.name, x.itemId || '')).join('') + '</select>', true) +
        field('Units per serving', numInput('rt-per', x.perServing, 'e.g. 1'), true) + '</div><p class="hint gap-bottom">If set, logging "Taken" subtracts this from the item\'s on-hand count (and undoing it adds it back).</p>' : '') +
      field('Notes', textInput('rt-notes', x.notes, '', 300), true);
    formSheet({
      title: existing ? 'Edit routine item' : 'Add to routine',
      kind: 'sheet tall',
      html: body() + (existing ? '<button type="button" class="btn wide" data-pause>' + (x.status === 'paused' ? 'Resume' : 'Pause') + '</button>' : ''),
      onDelete: existing ? async () => {
        const logs = Object.keys(D().intake).filter((k) => D().intake[k][x.id]).length;
        const ok = await HT.confirm({ title: 'Remove from routine?', message: 'Remove <b>' + esc(x.name) + '</b>' + (logs ? ' and its ' + plural(logs, 'day') + ' of intake history' : '') + '? To keep the history, pause it instead.', confirmLabel: 'Remove', danger: true });
        if (!ok) return false;
        D().routines = D().routines.filter((r) => r.id !== x.id);
        Object.keys(D().intake).forEach((k) => { delete D().intake[k][x.id]; if (!Object.keys(D().intake[k]).length) delete D().intake[k]; });
        HT.toast('Removed from routine');
      } : null,
      deleteLabel: 'Remove',
      onMount: (wrap) => {
        wrap.addEventListener('change', (e) => {
          if (e.target.id !== 'rt-mode') return;
          const keep = { name: val(wrap, '#rt-name'), serving: val(wrap, '#rt-serving'), timeOfDay: val(wrap, '#rt-time'), startDate: val(wrap, '#rt-start') || x.startDate, notes: val(wrap, '#rt-notes') };
          if (HT.$('#rt-item', wrap)) { keep.itemId = val(wrap, '#rt-item') || null; keep.perServing = pos(val(wrap, '#rt-per')); }
          Object.assign(x, keep);
          sched.mode = e.target.value;
          HT.$('.panel-body', wrap).innerHTML = body() + (existing ? '<button type="button" class="btn wide" data-pause>' + (x.status === 'paused' ? 'Resume' : 'Pause') + '</button>' : '');
        });
        wrap.addEventListener('click', (e) => {
          const b = e.target.closest('[data-day]');
          if (b) { const d = +b.dataset.day, i = sched.days.indexOf(d); if (i >= 0) sched.days.splice(i, 1); else sched.days.push(d); b.setAttribute('aria-pressed', i < 0); return; }
          if (e.target.closest('[data-pause]')) {
            const today = HT.today();
            if (x.status === 'paused') { const p = x.pauses[x.pauses.length - 1]; if (p && !p.to) p.to = today; x.status = 'active'; }
            else { x.pauses.push({ from: today, to: null }); x.status = 'paused'; }
            HT.save();
            HT.closeTopSheet();
            HT.toast(x.status === 'paused' ? 'Paused — paused days aren\'t counted' : 'Resumed');
            HT.render();
          }
        });
      },
      onSave: (wrap) => {
        const name = val(wrap, '#rt-name');
        if (!name) { HT.toast('Enter a name'); HT.$('#rt-name', wrap).focus(); return false; }
        const mode = val(wrap, '#rt-mode');
        if (mode === 'days' && !sched.days.length) { HT.toast('Pick at least one day'); return false; }
        const fields = {
          name, serving: val(wrap, '#rt-serving'), timeOfDay: val(wrap, '#rt-time'), notes: val(wrap, '#rt-notes'),
          startDate: HT.isDateKey(val(wrap, '#rt-start')) ? val(wrap, '#rt-start') : x.startDate,
          schedule: { mode, days: sched.days, every: Math.max(2, Math.round(num(val(wrap, '#rt-every')) || sched.every)) },
          itemId: HT.$('#rt-item', wrap) ? val(wrap, '#rt-item') || null : x.itemId,
          perServing: HT.$('#rt-per', wrap) ? pos(val(wrap, '#rt-per')) : x.perServing,
        };
        if (existing) Object.assign(existing, fields);
        else D().routines.push(Object.assign({ id: hid('rt'), status: 'active', pauses: [], createdAt: new Date().toISOString() }, fields));
        HT.data.health = HT.normalizeHealth(D());
        HT.toast(existing ? 'Routine updated' : 'Added to routine');
      },
    });
  };
  HT.actions['h-rt-new'] = () => H.openRoutine(null);
  HT.actions['h-rt-edit'] = (el) => { const x = D().routines.find((r) => r.id === el.closest('[data-id]').dataset.id); if (x) H.openRoutine(x); };

  /* ---------- shopping + inventory ---------- */

  const PRIO_RANK = { high: 0, medium: 1, low: 2 };
  const itemCost = (it) => (it.estPrice != null ? it.estPrice * (it.qty || 1) : null);
  H.filteredItems = () => {
    const v = H.vs;
    let list = D().items.filter((it) => {
      if (v.status === 'tobuy' && !TO_BUY.includes(it.status)) return false;
      if (v.status !== 'tobuy' && v.status !== 'all' && it.status !== v.status) return false;
      if (v.category && it.category !== v.category) return false;
      if (v.priority && it.priority !== v.priority) return false;
      return true;
    });
    const by = {
      priority: (a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || a.name.localeCompare(b.name),
      cost: (a, b) => (itemCost(b) == null ? -1 : itemCost(b)) - (itemCost(a) == null ? -1 : itemCost(a)),
      name: (a, b) => a.name.localeCompare(b.name),
      recent: (a, b) => (a.createdAt < b.createdAt ? 1 : -1),
    }[v.sort] || (() => 0);
    return list.sort(by);
  };

  function itemRow(it) {
    const days = H.daysLeft(it), low = H.isLow(it);
    const cost = itemCost(it);
    const meta = [it.category, label(ITEM_STATUS, it.status), it.priority !== 'medium' ? label(PRIORITY, it.priority) + ' priority' : '', it.usage ? label(USAGE, it.usage) : '',
      cost != null ? 'est. ' + money(cost) + (it.qty > 1 ? ' for ' + HT.num(it.qty) : '') : '', it.store].filter(Boolean).join(' · ');
    const stock = it.onHand != null ? HT.num(it.onHand) + (it.unitLabel ? ' ' + it.unitLabel : '') + ' on hand' + (days != null ? ' · about ' + plural(days, 'day') : '') : '';
    const canBuy = it.status !== 'purchased' && it.status !== 'dropped';
    return '<li class="irow' + (low ? ' low' : '') + (it.status === 'dropped' ? ' dropped' : '') + '" data-id="' + it.id + '">' +
      (canBuy ? '<button type="button" class="check sm" data-action="h-it-buy" aria-label="Mark ' + esc(it.name) + ' purchased">' + icon.check + '</button>' : '<span class="irow-done" aria-hidden="true">' + (it.status === 'purchased' ? icon.check : '') + '</span>') +
      '<button type="button" class="irow-main" data-action="h-it-edit"><span class="tname">' + esc(it.name) + (low ? ' <em class="tag low">Running low</em>' : '') + '</span>' +
      '<span class="irow-m">' + esc(meta) + '</span>' + (stock ? '<span class="irow-m">' + esc(stock) + '</span>' : '') + '</button></li>';
  }

  function shopping() {
    const c = H.costs();
    const v = H.vs;
    let html = H.head('Health shopping') + H.subnav('shopping') +
      '<form class="quickadd" data-quickadd><input id="it-quick" type="text" maxlength="80" autocomplete="off" placeholder="Add an item, e.g. Magnesium" aria-label="New item name">' +
      '<button type="submit" class="btn btn-primary">' + icon.plus + '<span>Add</span></button></form>';
    if (!D().items.length) {
      return html + '<section class="empty"><div class="empty-mark">' + icon.health + '</div><h2>Nothing on the list</h2><p>Track vitamins, supplements, protein and gear you want, need to restock or already own. Prices and quantities are optional.</p></section>';
    }
    html += '<div class="tiles t3">' + tile(c.toBuyCount, 'To buy') + tile(c.toBuyCount ? money(c.toBuy) : '—', 'Est. to buy' + (c.unknown ? ' (' + c.unknown + ' unpriced)' : '')) +
      tile(c.spent ? money(c.spent) : '—', 'Spent') + '</div>' + (c.recurring ? '<p class="muted gap-bottom">Recurring costs: about ' + money(c.recurring) + ' / month</p>' : '');
    const low = D().items.filter(H.isLow);
    if (low.length) html += '<section class="panel-card warn"><h3>Running low</h3><ul class="ilist">' + low.map(itemRow).join('') + '</ul>' +
      '<p class="hint">Low when on-hand is at or under its threshold, or under ' + plural(D().settings.lowDays, 'day') + ' of supply (change in Settings).</p></section>';
    const cats = Array.from(new Set(D().categories.concat(D().items.map((i) => i.category))));
    html += '<div class="filters">' + select('if-status', [['tobuy', 'Still to buy'], ['all', 'All items']].concat(ITEM_STATUS), v.status, ' aria-label="Status"') +
      select('if-cat', [['', 'All categories']].concat(cats.map((x) => [x, x])), v.category, ' aria-label="Category"') +
      select('if-prio', [['', 'Any priority']].concat(PRIORITY), v.priority, ' aria-label="Priority"') +
      select('if-sort', [['priority', 'Sort: priority'], ['cost', 'Sort: est. cost'], ['name', 'Sort: name'], ['recent', 'Sort: newest']], v.sort, ' aria-label="Sort"') + '</div>';
    const list = H.filteredItems();
    html += '<section class="panel-card">' + (list.length ? '<ul class="ilist">' + list.map(itemRow).join('') + '</ul>' : '<p class="muted">No items match these filters.</p>') + '</section>';
    return html;
  }
  document.addEventListener('change', (e) => {
    const map = { 'if-status': 'status', 'if-cat': 'category', 'if-prio': 'priority', 'if-sort': 'sort' };
    if (map[e.target.id]) { H.vs[map[e.target.id]] = e.target.value; HT.render(); }
  });
  document.addEventListener('submit', (e) => {
    if (!e.target.matches || !e.target.matches('[data-quickadd]')) return;
    e.preventDefault();
    const input = HT.$('#it-quick');
    const name = input.value.trim();
    if (!name) { HT.toast('Type an item name'); input.focus(); return; }
    if (input.dataset.busy) return;
    input.dataset.busy = '1';
    D().items.push(HT.normalizeHealth({ items: [{ name, status: 'want', category: H.vs.category || 'Supplements', priority: 'medium' }] }).items[0]);
    HT.save();
    HT.toast(name + ' added');
    HT.render();
    const again = HT.$('#it-quick');
    if (again) again.focus();
  });

  H.openItem = (existing) => {
    const it = existing || { name: '', category: 'Supplements', usage: '', status: 'want', priority: 'medium', qty: null, estPrice: null, store: '', link: '', notes: '', owned: false, onHand: null, unitLabel: '', dailyUse: null, lowAt: null, monthlyCost: null, purchases: [] };
    const cats = Array.from(new Set(D().categories.concat(it.category ? [it.category] : [])));
    const derived = existing && !it.dailyUse ? H.dailyUse(it) : null;
    const html = field('Name', textInput('it-name', it.name, 'e.g. Vitamin D3', 80)) +
      '<div class="row2">' + field('Category', select('it-cat', cats.map((x) => [x, x]).concat([['__new', '+ New category…']]), it.category) + '<input id="it-cat-new" type="text" maxlength="30" placeholder="New category" hidden style="margin-top:8px">') +
      field('Status', select('it-status', ITEM_STATUS, it.status)) + '</div>' +
      '<div class="row2">' + field('Priority', select('it-prio', PRIORITY, it.priority)) + field('Use', select('it-usage', USAGE, it.usage)) + '</div>' +
      '<div class="row2">' + field('Quantity to buy', numInput('it-qty', it.qty, 'e.g. 1'), true) + field('Est. price each', numInput('it-est', it.estPrice, '$'), true) + '</div>' +
      '<div class="row2">' + field('Store or supplier', textInput('it-store', it.store, 'e.g. Costco', 60), true) + field('Monthly cost', numInput('it-monthly', it.monthlyCost, 'If recurring'), true) + '</div>' +
      field('Product link', '<input id="it-link" type="url" inputmode="url" maxlength="500" placeholder="https://" value="' + esc(it.link) + '">', true) +
      (it.link ? '<p class="gap-bottom"><a href="' + esc(it.link) + '" target="_blank" rel="noopener noreferrer">Open product link</a></p>' : '') +
      field('Notes', textInput('it-notes', it.notes, '', 400), true) +
      '<h3 class="sp">Inventory</h3>' + switchRow('it-owned', 'I currently own this', '', it.owned) +
      '<div class="row2">' + field('On hand', numInput('it-onhand', it.onHand, 'e.g. 60'), true) + field('Counted in', textInput('it-unit', it.unitLabel, 'e.g. capsules', 20), true) + '</div>' +
      '<div class="row2">' + field('Used per day', numInput('it-use', it.dailyUse, derived ? 'from routine: ' + HT.num(derived) : 'e.g. 1'), true) + field('Warn me at', numInput('it-low', it.lowAt, 'units left'), true) + '</div>' +
      (existing && H.daysLeft(it) != null ? '<p class="hint gap-bottom">About ' + plural(H.daysLeft(it), 'day') + ' of supply at the current rate.</p>' : '') +
      (it.purchases.length ? '<h3 class="sp">Purchases</h3><ul class="dlist">' + it.purchases.slice().reverse().map((p) => '<li><div class="drow"><span class="dname">' + esc(longDate(p.date)) + '<small>' +
        esc([p.qty ? 'qty ' + HT.num(p.qty) : '', p.txId ? 'also in Finance' : ''].filter(Boolean).join(' · ')) + '</small></span><span class="dval strong">' + (p.price != null ? money(p.price) : '—') + '</span>' +
        '<button type="button" class="icon-btn" data-rm-purchase="' + p.id + '" aria-label="Remove this purchase">' + icon.x + '</button></div></li>').join('') + '</ul>' : '') +
      (existing && it.status !== 'purchased' && it.status !== 'dropped' ? '<button type="button" class="btn btn-primary wide" data-buy-now>' + icon.check + '<span>Mark purchased…</span></button>' : '');
    formSheet({
      title: existing ? 'Edit item' : 'Add item',
      kind: 'sheet tall',
      html,
      enterSaves: false,
      onDelete: existing ? async () => {
        const ok = await HT.confirm({ title: 'Delete item?', message: 'Delete <b>' + esc(it.name) + '</b> and its purchase history? Routine entries that count stock from it will stop counting.', confirmLabel: 'Delete', danger: true });
        if (!ok) return false;
        D().items = D().items.filter((x) => x.id !== it.id);
        D().routines.forEach((x) => { if (x.itemId === it.id) x.itemId = null; });
        HT.toast('Item deleted');
      } : null,
      onMount: (wrap) => {
        wrap.addEventListener('change', (e) => {
          if (e.target.id === 'it-cat') { const n = HT.$('#it-cat-new', wrap); n.hidden = e.target.value !== '__new'; if (!n.hidden) n.focus(); }
        });
        wrap.addEventListener('click', async (e) => {
          const rm = e.target.closest('[data-rm-purchase]');
          if (rm) {
            const p = it.purchases.find((x) => x.id === rm.dataset.rmPurchase);
            const ok = await HT.confirm({ title: 'Remove purchase?', message: 'Remove the purchase from ' + esc(longDate(p.date)) + (p.txId ? ' and its Finance expense' : '') + '? Stock on hand isn\'t changed.', confirmLabel: 'Remove', danger: true });
            if (!ok) return;
            it.purchases = it.purchases.filter((x) => x.id !== p.id);
            if (p.txId && HT.finance) HT.finance.deleteTx(p.txId);
            HT.save();
            rm.closest('li').remove();
            HT.toast('Purchase removed');
          } else if (e.target.closest('[data-buy-now]')) {
            HT.closeTopSheet();
            setTimeout(() => H.openPurchase(it), 240);
          }
        });
      },
      onSave: (wrap) => {
        const name = val(wrap, '#it-name');
        if (!name) { HT.toast('Enter a name'); HT.$('#it-name', wrap).focus(); return false; }
        let category = val(wrap, '#it-cat');
        if (category === '__new') {
          category = val(wrap, '#it-cat-new');
          if (!category) { HT.toast('Name the new category'); return false; }
          if (!D().categories.includes(category)) D().categories.push(category);
        }
        const nums = { qty: '#it-qty', estPrice: '#it-est', monthlyCost: '#it-monthly', onHand: '#it-onhand', dailyUse: '#it-use', lowAt: '#it-low' };
        const fields = { name, category, status: val(wrap, '#it-status'), priority: val(wrap, '#it-prio'), usage: val(wrap, '#it-usage'), store: val(wrap, '#it-store'), notes: val(wrap, '#it-notes'), owned: HT.$('#it-owned', wrap).checked };
        for (const k of Object.keys(nums)) {
          const raw = val(wrap, nums[k]);
          if (raw !== '' && (num(raw) == null || num(raw) < 0)) { HT.toast('Numbers can\'t be negative'); HT.$(nums[k], wrap).focus(); return false; }
          fields[k] = raw === '' ? null : num(raw);
        }
        const link = val(wrap, '#it-link');
        if (link && !/^https?:\/\//i.test(link)) { HT.toast('Links need to start with http:// or https://'); return false; }
        fields.link = link;
        if (existing) Object.assign(existing, fields);
        else D().items.push(Object.assign({ id: hid('it'), purchases: [], createdAt: new Date().toISOString() }, fields));
        HT.data.health = HT.normalizeHealth(D());
        HT.toast(existing ? 'Item saved' : 'Item added');
      },
    });
  };

  H.openPurchase = (it) => {
    const fin = !!(HT.finance && HT.data.finance);
    formSheet({
      title: 'Purchased: ' + it.name,
      html: '<div class="row2">' + field('Price paid (total)', numInput('pu-price', itemCost(it) != null ? r2(itemCost(it)) : '', 'e.g. 24.99'), true) + field('Quantity', numInput('pu-qty', it.qty || 1, '1'), true) + '</div>' +
        field('Date', '<input id="pu-date" type="date" max="' + HT.today() + '" value="' + HT.today() + '">') +
        '<div class="row2">' + field('Add to on hand', numInput('pu-add', '', it.unitLabel ? 'e.g. 60 ' + it.unitLabel : 'units'), true) + field('Counted in', textInput('pu-unit', it.unitLabel, 'e.g. capsules', 20), true) + '</div>' +
        (fin ? switchRow('pu-fin', 'Also record as a Finance expense', 'Adds the price to Finance under "Health". Removing this purchase later removes it there too.', D().settings.financeOnPurchase) : ''),
      saveLabel: 'Mark purchased',
      onSave: (wrap) => {
        const price = val(wrap, '#pu-price'), qty = val(wrap, '#pu-qty'), add = val(wrap, '#pu-add');
        if ([price, qty, add].some((x) => x !== '' && (num(x) == null || num(x) < 0))) { HT.toast('Numbers can\'t be negative'); return false; }
        const date = val(wrap, '#pu-date');
        if (!HT.isDateKey(date) || date > HT.today()) { HT.toast('Pick a date that isn\'t in the future'); return false; }
        const p = { id: hid('pu'), date, price: price === '' ? null : r2(num(price)), qty: pos(qty), txId: null };
        const finOn = fin && HT.$('#pu-fin', wrap) && HT.$('#pu-fin', wrap).checked;
        if (fin) D().settings.financeOnPurchase = !!finOn;
        if (finOn && p.price) {
          const cats = HT.data.finance.categories.expense;
          if (!cats.includes('Health')) cats.push('Health');
          p.txId = HT.finance.addTx({ type: 'expense', amount: p.price, date, category: 'Health', source: it.name, note: 'From Health shopping' }).id;
        }
        it.purchases.push(p);
        it.status = 'purchased';
        it.owned = true;
        if (add !== '') it.onHand = r2((it.onHand || 0) + num(add));
        if (val(wrap, '#pu-unit')) it.unitLabel = val(wrap, '#pu-unit');
        HT.toast(it.name + ' marked purchased');
      },
    });
  };
  HT.actions['h-it-edit'] = (el) => { const it = H.item(el.closest('[data-id]').dataset.id); if (it) H.openItem(it); };
  HT.actions['h-it-new'] = () => H.openItem(null);
  HT.actions['h-it-buy'] = (el) => { const it = H.item(el.closest('[data-id]').dataset.id); if (it) H.openPurchase(it); };

  /* ---------- Overview ---------- */

  const PERIODS = [['1M', 30], ['3M', 91], ['6M', 182], ['1Y', 365]];
  function overview() {
    const today = HT.today();
    const days = PERIODS.find((p) => p[0] === H.vs.period)[1];
    const from = HT.addDays(today, -days + 1);
    let html = H.head('Health & fitness') + H.subnav('') +
      '<div class="hquick">' +
      '<button type="button" class="btn" data-action="w-log">⚖️<span>Log weight</span></button>' +
      '<button type="button" class="btn" data-action="h-wo-log">🏋️<span>Log workout</span></button>' +
      '<a class="btn" href="#/health/daily">💧<span>Daily log</span></a>' +
      '<a class="btn" href="#/health/supplements">💊<span>Supplements</span></a></div>' +
      '<div class="segmented gap-bottom" data-hset="period">' + PERIODS.map((p) => '<button type="button" data-action="h-period" data-v="' + p[0] + '" aria-pressed="' + (p[0] === H.vs.period) + '">' + p[0] + '</button>').join('') + '</div>' +
      '<p class="hint gap-bottom">Since ' + esc(longDate(from)) + '. Figures appear only once there is enough data; days without an entry are left out, not counted as zero.</p>';

    // Weight
    const W = HT.weight, wp = W ? W.period(from) : { days: 0 };
    const st = W ? W.stats() : null;
    html += '<section class="panel-card"><div class="card-head"><h3>Body weight</h3><a class="btn btn-sm" href="#/weight">Open</a></div>' +
      (!st ? '<p class="muted">No weigh-ins yet.</p>'
        : (wp.change != null ? '<div class="frow"><span>Change in this period</span><b>' + W.fmtDelta(wp.change) + '</b></div>' : '') +
          (wp.avg != null ? '<div class="frow"><span>Average</span><b>' + W.fmt(wp.avg) + ' <small>' + wp.days + ' days</small></b></div>' : '') +
          '<div class="frow"><span>Most recent</span><b>' + W.fmt(st.latest.kg) + ' <small>' + shortDate(st.latest.date) + '</small></b></div>' +
          (st.goal ? '<div class="frow"><span>Goal</span><b>' + (st.goal.reached ? 'Reached' : W.fmt(st.goal.toGo) + ' to go') + '</b></div>' : '') +
          (wp.change == null ? '<p class="hint">Weigh in on at least two days in this period to see a change.</p>' : '')) + '</section>';

    // Workouts
    const wo = H.workoutStats(from, today);
    // Per-week average only over the weeks since logging began, so a new log isn't diluted by empty months.
    const firstWo = D().workouts.length ? D().workouts[0].date : today;
    const weeks = Math.max(1, (HT.daysBetween(firstWo > from ? firstWo : from, today) + 1) / 7);
    html += '<section class="panel-card"><div class="card-head"><h3>Workouts</h3><a class="btn btn-sm" href="#/health/workouts">Open</a></div>' +
      (wo.count ? '<div class="frow"><span>Workouts</span><b>' + wo.count + ' <small>on ' + plural(wo.days, 'day') + '</small></b></div>' +
        (wo.minutes ? '<div class="frow"><span>Total time</span><b>' + HT.dur(wo.minutes) + '</b></div>' : '') +
        (weeks >= 2 ? '<div class="frow"><span>Average per week</span><b>' + round1(wo.count / weeks) + ' workouts <small>since ' + shortDate(firstWo > from ? firstWo : from) + '</small></b></div>' : '') +
        (wo.km ? '<div class="frow"><span>Distance</span><b>' + fmtDist(wo.km) + '</b></div>' : '')
        : '<p class="muted">No workouts logged in this period.</p>') + '</section>';

    // Daily metric averages (only metrics with enough logged days)
    const rows = [];
    H.metrics().filter((m) => m.enabled && ['water', 'duration', 'count', 'quantity'].includes(m.kind)).forEach((m) => {
      const vals = [];
      for (let k = from; k <= today; k = HT.addDays(k, 1)) { const v = H.metricValue(m, k); if (v != null) vals.push(v); }
      if (vals.length < 5) return;
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const shown = trackerOf(m) ? HT.fmtValue(trackerOf(m), avg) : m.kind === 'water' ? fmtWater(avg) : m.kind === 'duration' ? HT.dur(avg) : HT.num(Math.round(avg * 10) / 10) + (m.unit ? ' ' + m.unit : '');
      rows.push('<div class="frow"><span>' + esc(m.name) + '</span><b>' + esc(shown) + ' <small>avg on ' + vals.length + ' logged days</small></b></div>');
    });
    html += '<section class="panel-card"><div class="card-head"><h3>Daily averages</h3><a class="btn btn-sm" href="#/health/daily">Open</a></div>' +
      (rows.length ? rows.join('') : '<p class="muted">Averages appear once a metric has entries on at least 5 days in this period.</p>') + '</section>';

    // Health habits
    const hh = D().settings.healthHabits.map((id) => HT.tracker(id)).filter(Boolean);
    const habitRows = hh.map((t) => {
      let exp = 0, done = 0;
      for (let k = from > t.startDate ? from : t.startDate; k <= today; k = HT.addDays(k, 1)) {
        if (!HT.isExpected(t, k)) continue;
        const d = HT.isDone(t, k);
        if (k === today && !d) continue;
        exp++; if (d) done++;
      }
      return exp >= 7 ? '<div class="frow"><span>' + esc(t.icon + ' ' + t.name) + '</span><b>' + done + ' of ' + exp + ' scheduled days</b></div>'
        : '<div class="frow"><span>' + esc(t.icon + ' ' + t.name) + '</span><b><small>Not enough scheduled days yet</small></b></div>';
    });
    html += '<section class="panel-card"><div class="card-head"><h3>Health habits</h3><button type="button" class="btn btn-sm" data-action="h-pick-habits">Choose</button></div>' +
      (habitRows.length ? habitRows.join('') : '<p class="muted">Pick which of your habits are health-related to see their consistency here.</p>') + '</section>';

    // Supplements
    const cons = D().routines.map((x) => ({ x, c: H.routineConsistency(x, from) })).filter((o) => o.c.due >= 7);
    if (D().routines.length) {
      html += '<section class="panel-card"><div class="card-head"><h3>Supplement logging</h3><a class="btn btn-sm" href="#/health/supplements">Open</a></div>' +
        (cons.length ? cons.map((o) => '<div class="frow"><span>' + esc(o.x.name) + '</span><b>' + o.c.taken + ' of ' + o.c.due + ' days taken' + (o.c.skipped ? ' · ' + o.c.skipped + ' skipped' : '') + '</b></div>').join('')
          : '<p class="muted">Shown after 7 or more scheduled days in this period.</p>') + '</section>';
    }

    // Spending
    const c = H.costs();
    if (D().items.length) {
      const spent = H.spentBetween(from, today);
      html += '<section class="panel-card"><div class="card-head"><h3>Health spending</h3><a class="btn btn-sm" href="#/health/shopping">Open</a></div>' +
        '<div class="frow"><span>Spent in this period</span><b>' + money(spent) + '</b></div>' +
        '<div class="frow"><span>Spent all time</span><b>' + money(c.spent) + '</b></div>' +
        (c.recurring ? '<div class="frow"><span>Recurring</span><b>' + money(c.recurring) + ' / month</b></div>' : '') +
        (c.toBuyCount ? '<div class="frow"><span>Still to buy</span><b>' + plural(c.toBuyCount, 'item') + (c.toBuy ? ' · est. ' + money(c.toBuy) : '') + '</b></div>' : '') + '</section>';
    }
    return html;
  }
  HT.actions['h-period'] = (el) => { H.vs.period = el.dataset.v; HT.render(); };
  HT.actions['h-pick-habits'] = () => {
    const habits = HT.sorted().filter((t) => t.status !== 'archived');
    if (!habits.length) { HT.toast('Add a habit on the Today screen first'); return; }
    const sel = new Set(D().settings.healthHabits);
    formSheet({
      title: 'Health habits',
      html: '<p class="hint gap-bottom">These habits stay where they are; this only chooses which ones show up in the health overview.</p>' +
        habits.map((t) => switchRow('hh-' + t.id, esc(t.icon + ' ' + t.name), '', sel.has(t.id))).join(''),
      onSave: (wrap) => { D().settings.healthHabits = habits.filter((t) => HT.$('#hh-' + t.id, wrap).checked).map((t) => t.id); },
    });
  };

  HT.views.health = (tab) => {
    if (tab === 'daily') return daily();
    if (tab === 'workouts') return workouts();
    if (tab === 'supplements') return supplements();
    if (tab === 'shopping') return shopping();
    return overview();
  };

  /* ---------- Today widgets ---------- */

  H.widgetOrder = () => D().widgets.filter((w) => w.on).map((w) => w.id);
  const section = (id, title, inner, link) => '<section class="widget" data-widget="' + id + '"><div class="widget-h"><h2 class="section-title">' + title + '</h2>' + (link ? '<a class="linkish" href="' + link[0] + '">' + link[1] + '</a>' : '') + '</div>' + inner + '</section>';
  H.widget = (id) => {
    const today = HT.today();
    if (id === 'nutrition') return HT.nutrition ? HT.nutrition.todayWidget() : '';
    if (id === 'metrics') {
      const list = H.metrics().filter((m) => m.enabled && m.kind !== 'weight' && m.kind !== 'workout');
      if (!list.length) return '';
      return section('metrics', 'Health today', '<ul class="tlist">' + list.map((m) => metricRow(m, today, true)).join('') + '</ul>', ['#/health/daily', 'Daily log']);
    }
    if (id === 'workout') {
      const ws = H.workoutsOn(today);
      const tpls = D().templates.slice(0, 3);
      const inner = ws.length
        ? '<ul class="tlist">' + ws.map((w) => '<li class="trow" data-id="' + w.id + '"><button type="button" class="tmain" data-action="h-wo-edit"><span class="ticon" aria-hidden="true">' + wtype(w.type)[2] + '</span><span class="tinfo"><span class="tname">' + esc(workoutTitle(w)) + '</span><span class="tsub"><span class="tprog">' + esc(workoutLine(w)) + '</span></span></span><span class="chev">' + icon.next + '</span></button></li>').join('') + '</ul>'
        : '<div class="panel-card tight"><div class="wline"><span class="muted">No workout logged today</span><button type="button" class="btn btn-sm" data-action="h-wo-log">' + icon.plus + '<span>Log</span></button></div>' +
          (tpls.length ? '<div class="chips gap-top">' + tpls.map((t) => '<button type="button" class="chip" data-action="h-wo-tpl" data-id="' + t.id + '">' + wtype(t.type)[2] + ' ' + esc(t.name) + '</button>').join('') + '</div>' : '') + '</div>';
      return section('workout', 'Workout', inner, ['#/health/workouts', 'History']);
    }
    if (id === 'supplements') {
      const due = D().routines.filter((x) => x.status === 'active' && (H.routineDue(x, today) || H.intakeOf(x, today)));
      if (!due.length) return '';
      const left = due.filter((x) => !H.intakeOf(x, today)).length;
      return section('supplements', 'Supplements' + (left ? ' · ' + left + ' to log' : ''), '<div class="panel-card tight"><ul class="slist">' + due.map((x) => routineRow(x, today, true)).join('') + '</ul></div>', ['#/health/supplements', 'Routine']);
    }
    if (id === 'shopping') {
      const low = D().items.filter(H.isLow);
      const c = H.costs();
      if (!low.length && !c.toBuyCount) return '';
      return section('shopping', 'Health purchases', '<div class="panel-card tight">' + (low.length ? '<ul class="ilist">' + low.map(itemRow).join('') + '</ul>' : '') +
        (c.toBuyCount ? '<a class="wline" href="#/health/shopping"><span>' + plural(c.toBuyCount, 'item') + ' to buy' + (c.toBuy ? ' · est. ' + money(c.toBuy) : '') + '</span><span class="chev">' + icon.next + '</span></a>' : '') + '</div>', null);
    }
    return '';
  };

  /* ---------- Settings ---------- */

  H.settingsHTML = () => {
    const s = D().settings;
    const seg = (name, options, cur) => '<div class="segmented" data-hsetting="' + name + '">' + options.map((o) => '<button type="button" data-action="h-setting" data-v="' + o[0] + '" aria-pressed="' + (o[0] === cur) + '">' + o[1] + '</button>').join('') + '</div>';
    return '<h2 class="section-title">Today screen</h2><section class="panel-card"><p class="hint gap-bottom">Choose what appears on Today. Press and hold to reorder. Sections with nothing to show stay hidden.</p>' +
      '<ul class="tlist wlist" data-sortable="widgets">' + D().widgets.map((w) => '<li class="trow" data-id="' + w.id + '"><div class="wrow"><span class="grip" aria-hidden="true">⋮⋮</span><span class="tname">' + esc(label(WIDGETS, w.id)) + '</span>' +
        '<label class="switch" data-nodrag><input type="checkbox" data-widget-on="' + w.id + '"' + (w.on ? ' checked' : '') + ' aria-label="Show ' + esc(label(WIDGETS, w.id)) + '"><span></span></label></div></li>').join('') + '</ul></section>' +
      '<h2 class="section-title">Health</h2><section class="panel-card">' +
      '<div class="set-block"><div class="sw-title">Water unit</div>' + seg('water', [['L', 'Litres'], ['ml', 'ml'], ['oz', 'fl oz']], s.water) + '</div>' +
      '<div class="set-block"><div class="sw-title">Distance unit</div>' + seg('distance', [['km', 'km'], ['mi', 'miles']], s.distance) +
      '<div class="hint">Values are stored in ml and km, so switching units never changes what you logged.</div></div>' +
      '<div class="set-block"><div class="set-row tight"><div><div class="sw-title">Daily metrics and targets</div><div class="hint">' + esc(H.metrics().filter((m) => m.enabled).map((m) => m.name).join(', ') || 'None on') + '</div></div>' +
      '<button type="button" class="btn" data-action="h-metrics">Edit</button></div></div>' +
      '<div class="set-block">' + switchRow('hs-deduct', 'Count stock when I log a supplement', 'For routine items linked to a shopping item with a per-serving amount.', s.deductStock) + '</div>' +
      '<div class="set-block"><label class="field"><span class="label">Running-low warning (days of supply left)</span><input id="hs-lowdays" type="number" inputmode="numeric" min="1" max="120" value="' + s.lowDays + '"></label>' +
      '<p class="hint">Per-item thresholds in an item\'s Inventory section take effect too.</p></div></section>';
  };
  HT.actions['h-setting'] = (el) => { D().settings[el.parentNode.dataset.hsetting] = el.dataset.v; HT.save(); HT.render(); };
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset && t.dataset.widgetOn) {
      const w = D().widgets.find((x) => x.id === t.dataset.widgetOn);
      if (w) { w.on = t.checked; HT.save(); }
    } else if (t.id === 'hs-deduct') { D().settings.deductStock = t.checked; HT.save(); }
    else if (t.id === 'hs-lowdays') {
      const n = Math.round(num(t.value));
      if (!(n >= 1 && n <= 120)) { HT.toast('Enter 1 to 120 days'); t.value = D().settings.lowDays; return; }
      D().settings.lowDays = n; HT.save(); HT.toast('Saved');
    } else if (t.id === 'h-wo-habit') { D().settings.workoutHabit = t.value || null; HT.save(); HT.toast(t.value ? 'Linked' : 'Not linked'); }
  });

  /* Drag-sorted lists owned by this module. Returns true when handled. */
  H.reorder = (kind, ids) => {
    if (kind === 'widgets') {
      const byId = {};
      D().widgets.forEach((w) => { byId[w.id] = w; });
      D().widgets = ids.map((id) => byId[id]).filter(Boolean).concat(D().widgets.filter((w) => !ids.includes(w.id)));
    } else if (kind === 'metrics') {
      ids.forEach((id, i) => { const m = H.metric(id); if (m) m.order = i; });
      let n = ids.length;
      H.metrics().forEach((m) => { if (!ids.includes(m.id)) m.order = n++; });
    } else return false;
    HT.save();
    return true;
  };
})();
