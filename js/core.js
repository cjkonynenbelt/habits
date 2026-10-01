/* Habits — data layer: dates, tracker types, storage, schedule + streak logic.
   Everything lives on the global HT namespace. No network access anywhere. */
(function () {
  'use strict';

  const HT = (window.HT = {});
  const STORAGE_KEY = 'habits.data';
  HT.VERSION = 2; // 1 = habits only, 2 = habits + finance

  /* ---------- dates (always local time, keyed as YYYY-MM-DD) ---------- */

  const pad = (n) => String(n).padStart(2, '0');
  HT.dateKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  HT.parseKey = (k) => {
    const p = k.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  };
  HT.today = () => HT.dateKey(new Date());
  HT.addDays = (k, n) => {
    const d = HT.parseKey(k);
    d.setDate(d.getDate() + n);
    return HT.dateKey(d);
  };
  HT.daysBetween = (a, b) => Math.round((HT.parseKey(b) - HT.parseKey(a)) / 864e5);
  HT.isDateKey = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k);

  /* ---------- number formatting ---------- */

  HT.round = (n) => Math.round(n * 1000) / 1000;
  HT.num = (n) => HT.round(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
  HT.dur = (minutes) => {
    const m = Math.round(minutes);
    if (m < 60) return m + ' min';
    const h = Math.floor(m / 60), r = m % 60;
    return r ? h + 'h ' + r + 'm' : h + 'h';
  };

  const UNIT_SHORT = { liters: 'L', minutes: 'min', hours: 'h' };
  HT.withUnit = (n, unit) => {
    if (unit === 'dollars') return '$' + HT.num(n);
    if (unit === '%') return HT.num(n) + '%';
    if (!unit) return HT.num(n);
    return HT.num(n) + ' ' + (UNIT_SHORT[unit] || unit);
  };

  /* ---------- tracker types ----------
     To add a type later, call HT.registerType with:
       id, label, example      – shown in the type picker
       mode                    – how it is logged: 'toggle' | 'set' | 'add' | 'step'
       hasTarget, defaultTarget, defaultUnit, fixedUnit, targetLabel
       input                   – log-sheet input: 'number' | 'hm' | 'percent'
       fmt(value, tracker)     – optional custom value formatting              */

  HT.types = {};
  HT.typeOrder = [];
  HT.registerType = (def) => {
    HT.types[def.id] = def;
    if (!HT.typeOrder.includes(def.id)) HT.typeOrder.push(def.id);
  };

  HT.registerType({
    id: 'boolean', label: 'Yes / No', example: 'Workout — done or not',
    mode: 'toggle', hasTarget: false, defaultTarget: 1, defaultUnit: '',
  });
  HT.registerType({
    id: 'number', label: 'Number', example: 'Push-ups — enter today\'s total',
    mode: 'set', input: 'number', hasTarget: true, defaultTarget: 100, defaultUnit: 'times',
  });
  HT.registerType({
    id: 'quantity', label: 'Quantity', example: 'Water — add amounts through the day',
    mode: 'add', input: 'number', hasTarget: true, defaultTarget: 3, defaultUnit: 'liters',
  });
  HT.registerType({
    id: 'duration', label: 'Duration', example: 'Read — log minutes',
    mode: 'add', input: 'number', hasTarget: true, defaultTarget: 30, defaultUnit: 'minutes',
    fixedUnit: true, targetLabel: 'Goal (minutes)',
    fmt: (v) => HT.dur(v),
  });
  HT.registerType({
    id: 'time', label: 'Time', example: 'Sleep — hours and minutes',
    mode: 'set', input: 'hm', hasTarget: true, defaultTarget: 8, defaultUnit: 'hours',
    fixedUnit: true, targetLabel: 'Goal (hours)',
    fmt: (v) => (v ? HT.dur(v * 60) : '0h'),
  });
  HT.registerType({
    id: 'counter', label: 'Counter', example: 'Sales calls — tap + and −',
    mode: 'step', input: 'number', hasTarget: true, defaultTarget: 20, defaultUnit: 'times',
  });
  HT.registerType({
    id: 'percentage', label: 'Percentage', example: 'Productivity — 0 to 100%',
    mode: 'set', input: 'percent', hasTarget: true, defaultTarget: 100, defaultUnit: '%',
    fixedUnit: true, targetLabel: 'Goal (%)',
  });

  HT.UNITS = ['times', 'minutes', 'hours', 'liters', 'km', 'miles', 'pages', 'dollars', 'steps', 'calories', '%'];

  HT.typeOf = (t) => HT.types[t.type] || HT.types.boolean;
  HT.goal = (t) => (HT.typeOf(t).hasTarget ? (t.target > 0 ? t.target : 1) : 1);

  HT.fmtValue = (t, v) => {
    const ty = HT.typeOf(t);
    if (ty.mode === 'toggle') return v >= 1 ? 'Done' : 'Not done';
    if (ty.fmt) return ty.fmt(v, t);
    return HT.withUnit(v, t.unit);
  };
  HT.fmtProgress = (t, v) => {
    const ty = HT.typeOf(t);
    if (ty.mode === 'toggle') return v >= 1 ? 'Done' : 'Not done';
    const g = HT.goal(t);
    if (ty.fmt) return ty.fmt(v, t) + ' / ' + ty.fmt(g, t);
    if (t.unit === 'dollars' || t.unit === '%') return HT.withUnit(v, t.unit) + ' / ' + HT.withUnit(g, t.unit);
    return HT.num(v) + ' / ' + HT.withUnit(g, t.unit);
  };

  /* A sensible quick-add amount for a goal (3 → 0.5, 30 → 5, 10000 → 1000). */
  HT.niceStep = (target) => {
    const raw = (target > 0 ? target : 1) / 8;
    const steps = [];
    for (let e = -2; e <= 6; e++) [1, 2.5, 5].forEach((b) => steps.push(HT.round(b * Math.pow(10, e))));
    let best = steps[0];
    steps.forEach((s) => {
      if (Math.abs(Math.log(s / raw)) < Math.abs(Math.log(best / raw))) best = s;
    });
    return best;
  };
  HT.stepOf = (t) => {
    if (t.step > 0) return t.step;
    return HT.typeOf(t).mode === 'step' ? 1 : HT.niceStep(HT.goal(t));
  };

  /* ---------- state ---------- */

  const uid = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function defaultSettings() {
    return { theme: 'system', sort: 'manual', completion: 'binary', weekStart: 0, notifications: false };
  }
  function emptyData() {
    return {
      version: HT.VERSION,
      trackers: [],
      entries: {},
      settings: defaultSettings(),
      finance: HT.normalizeFinance ? HT.normalizeFinance(null) : null, // shape lives in finance.js
      meta: { lastBackup: null, notified: {} },
    };
  }

  HT.normalizeTracker = (raw, index) => {
    const r = raw && typeof raw === 'object' ? raw : {};
    const type = HT.types[r.type] ? r.type : 'boolean';
    const ty = HT.types[type];
    const f = r.frequency && typeof r.frequency === 'object' ? r.frequency : {};
    const modes = ['daily', 'weekdays', 'weekends', 'days', 'interval'];
    const rem = r.reminder && typeof r.reminder === 'object' ? r.reminder : {};
    const target = Number(r.target);
    const step = Number(r.step);
    return {
      id: typeof r.id === 'string' && r.id ? r.id : uid(),
      name: String(r.name || 'Untitled').slice(0, 60),
      description: String(r.description || '').slice(0, 200),
      icon: String(r.icon || '✅').slice(0, 8),
      color: /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : HT.COLORS[0],
      type,
      target: ty.hasTarget ? (target > 0 ? target : ty.defaultTarget) : 1,
      unit: ty.fixedUnit ? ty.defaultUnit : ty.hasTarget ? String(r.unit == null ? ty.defaultUnit : r.unit).slice(0, 16) : '',
      step: step > 0 ? step : null,
      frequency: {
        mode: modes.includes(f.mode) ? f.mode : 'daily',
        days: Array.isArray(f.days) ? f.days.map(Number).filter((d) => d >= 0 && d <= 6) : [],
        every: Math.max(2, Math.min(365, Math.round(Number(f.every)) || 2)),
      },
      startDate: HT.isDateKey(r.startDate) ? r.startDate : HT.today(),
      reminder: { enabled: !!rem.enabled, time: /^\d{2}:\d{2}$/.test(rem.time) ? rem.time : '09:00' },
      counts: r.counts !== false,
      // Optional link to a finance goal: completing the habit offers to add this amount.
      financeLink: r.financeLink && typeof r.financeLink.goalId === 'string' && Number(r.financeLink.amount) > 0
        ? { goalId: r.financeLink.goalId, amount: Number(r.financeLink.amount) } : null,
      status: ['active', 'paused', 'archived'].includes(r.status) ? r.status : 'active',
      pauses: Array.isArray(r.pauses)
        ? r.pauses.filter((p) => p && HT.isDateKey(p.from)).map((p) => ({ from: p.from, to: HT.isDateKey(p.to) ? p.to : null }))
        : [],
      archivedAt: HT.isDateKey(r.archivedAt) ? r.archivedAt : null,
      order: Number.isFinite(Number(r.order)) ? Number(r.order) : index || 0,
      createdAt: r.createdAt || new Date().toISOString(),
    };
  };

  /* Bring any older/foreign data up to the current shape. Add a step per version bump. */
  const MIGRATIONS = {
    1: (data) => { data.finance = data.finance || null; data.version = 2; },
  };
  HT.migrate = (input) => {
    if (!input || typeof input !== 'object' || !Array.isArray(input.trackers)) {
      throw new Error('This file is not a Habits backup.');
    }
    const data = JSON.parse(JSON.stringify(input));
    data.version = Number(data.version) || 1;
    if (data.version > HT.VERSION) throw new Error('This backup was made by a newer version of the app.');
    while (data.version < HT.VERSION) {
      const step = MIGRATIONS[data.version];
      if (!step) throw new Error('Cannot upgrade this backup.');
      step(data);
    }
    const out = emptyData();
    out.trackers = data.trackers.map(HT.normalizeTracker);
    const ids = new Set(out.trackers.map((t) => t.id));
    const entries = data.entries && typeof data.entries === 'object' && !Array.isArray(data.entries) ? data.entries : {};
    Object.keys(entries).forEach((k) => {
      if (!HT.isDateKey(k) || !entries[k] || typeof entries[k] !== 'object') return;
      const day = {};
      Object.keys(entries[k]).forEach((id) => {
        const v = Number(entries[k][id]);
        if (ids.has(id) && v > 0 && Number.isFinite(v)) day[id] = HT.round(v);
      });
      if (Object.keys(day).length) out.entries[k] = day;
    });
    const s = data.settings && typeof data.settings === 'object' ? data.settings : {};
    const d = defaultSettings();
    out.settings = {
      theme: ['system', 'light', 'dark'].includes(s.theme) ? s.theme : d.theme,
      sort: ['manual', 'incomplete', 'name'].includes(s.sort) ? s.sort : d.sort,
      completion: ['binary', 'partial'].includes(s.completion) ? s.completion : d.completion,
      weekStart: s.weekStart === 1 ? 1 : 0,
      notifications: !!s.notifications,
    };
    out.finance = HT.normalizeFinance(data.finance);
    const m = data.meta && typeof data.meta === 'object' ? data.meta : {};
    out.meta = { lastBackup: m.lastBackup || null, notified: m.notified && typeof m.notified === 'object' ? m.notified : {} };
    return out;
  };

  HT.COLORS = ['#2f7d5b', '#2b7a9e', '#3d63c9', '#7353c4', '#b24f9a', '#c8474d', '#d0722b', '#b8922a', '#5d7d2f', '#5f6670'];
  HT.ICONS = ['✅', '💧', '🏋️', '🏃', '🚶', '🚴', '🧘', '📖', '📚', '✍️', '💼', '📞', '💰', '💊', '🥗', '🍎', '🚫', '😴', '⏰', '🌅',
    '🧠', '🎯', '💻', '🎸', '🎨', '🧹', '🦷', '🚿', '🙏', '❤️', '🌱', '☀️', '🌙', '📵', '🧊', '☕', '🐕', '👨‍👩‍👧', '📝', '⭐'];

  HT.data = emptyData();
  HT.storageOK = true;

  HT.load = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) HT.data = HT.migrate(JSON.parse(raw));
    } catch (err) {
      console.error('Could not read saved data', err);
      HT.loadError = err;
      // Keep the unreadable copy so the next save doesn't destroy it.
      try { localStorage.setItem(STORAGE_KEY + '.unreadable', localStorage.getItem(STORAGE_KEY)); } catch (e) { /* ignore */ }
    }
    if (!HT.data.finance) HT.data.finance = HT.normalizeFinance(null);
  };
  HT.save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(HT.data));
      HT.storageOK = true;
    } catch (err) {
      HT.storageOK = false;
      console.error('Could not save', err);
      if (HT.toast) HT.toast('Could not save — browser storage is full or blocked.');
    }
  };

  HT.exportData = () => ({
    app: 'habits',
    version: HT.VERSION,
    exportedAt: new Date().toISOString(),
    trackers: HT.data.trackers,
    entries: HT.data.entries,
    settings: HT.data.settings,
    finance: HT.data.finance,
  });
  HT.importData = (obj) => {
    const next = HT.migrate(obj); // throws before anything is replaced
    next.meta.lastBackup = HT.data.meta.lastBackup;
    HT.data = next;
    HT.save();
  };
  HT.resetData = () => {
    HT.data = emptyData();
    HT.save();
  };

  /* ---------- trackers ---------- */

  HT.sorted = () => HT.data.trackers.slice().sort((a, b) => a.order - b.order);
  HT.tracker = (id) => HT.data.trackers.find((t) => t.id === id);

  HT.createTracker = (fields) => {
    const orders = HT.data.trackers.map((t) => t.order);
    const t = HT.normalizeTracker(Object.assign({}, fields, { id: uid(), order: orders.length ? Math.max.apply(null, orders) + 1 : 0 }));
    HT.data.trackers.push(t);
    HT.save();
    return t;
  };
  HT.updateTracker = (id, fields) => {
    const i = HT.data.trackers.findIndex((t) => t.id === id);
    if (i < 0) return null;
    const cur = HT.data.trackers[i];
    HT.data.trackers[i] = HT.normalizeTracker(Object.assign({}, cur, fields, { id: cur.id }), cur.order);
    HT.save();
    return HT.data.trackers[i];
  };
  HT.deleteTracker = (id) => {
    HT.data.trackers = HT.data.trackers.filter((t) => t.id !== id);
    Object.keys(HT.data.entries).forEach((k) => {
      delete HT.data.entries[k][id];
      if (!Object.keys(HT.data.entries[k]).length) delete HT.data.entries[k];
    });
    HT.save();
  };
  HT.entryCount = (id) => Object.keys(HT.data.entries).filter((k) => HT.data.entries[k][id] > 0).length;

  /* Pausing/archiving records date ranges so those days never count as missed. */
  HT.setStatus = (id, status) => {
    const t = HT.tracker(id);
    if (!t || t.status === status) return;
    const today = HT.today();
    const closePause = () => {
      const last = t.pauses[t.pauses.length - 1];
      if (last && !last.to) last.to = today;
    };
    if (t.status === 'paused') closePause();
    if (t.status === 'archived' && t.archivedAt) {
      if (t.archivedAt < today) t.pauses.push({ from: t.archivedAt, to: today });
      t.archivedAt = null;
    }
    if (status === 'paused') t.pauses.push({ from: today, to: null });
    if (status === 'archived') t.archivedAt = today;
    t.status = status;
    HT.save();
  };

  /* visibleIds: the new order of a subset; they keep the slots that subset already occupied. */
  HT.reorder = (visibleIds) => {
    const all = HT.sorted();
    const set = new Set(visibleIds);
    const slots = [];
    all.forEach((t, i) => { if (set.has(t.id)) slots.push(i); });
    const result = all.slice();
    visibleIds.forEach((id, n) => {
      const t = HT.tracker(id);
      if (t && slots[n] != null) result[slots[n]] = t;
    });
    result.forEach((t, i) => { t.order = i; });
    HT.save();
  };

  /* ---------- entries ---------- */

  HT.value = (t, key) => {
    const day = HT.data.entries[key];
    return (day && day[t.id]) || 0;
  };
  HT.setValue = (t, key, v) => {
    v = HT.round(Math.max(0, Number(v) || 0));
    if (t.type === 'percentage') v = Math.min(100, v);
    if (v > 0) {
      (HT.data.entries[key] = HT.data.entries[key] || {})[t.id] = v;
    } else if (HT.data.entries[key]) {
      delete HT.data.entries[key][t.id];
      if (!Object.keys(HT.data.entries[key]).length) delete HT.data.entries[key];
    }
    HT.save();
    return v;
  };
  HT.isDone = (t, key) => HT.value(t, key) >= HT.goal(t);
  HT.progress = (t, key) => Math.min(1, HT.value(t, key) / HT.goal(t));

  /* ---------- schedule ---------- */

  HT.isScheduled = (t, key) => {
    if (key < t.startDate) return false;
    const f = t.frequency;
    const dow = HT.parseKey(key).getDay();
    if (f.mode === 'weekdays') return dow >= 1 && dow <= 5;
    if (f.mode === 'weekends') return dow === 0 || dow === 6;
    if (f.mode === 'days') return f.days.includes(dow);
    if (f.mode === 'interval') return HT.daysBetween(t.startDate, key) % f.every === 0;
    return true;
  };
  /* Expected = scheduled, and not paused/archived on that day. */
  HT.isExpected = (t, key) => {
    if (!HT.isScheduled(t, key)) return false;
    if (t.archivedAt && key >= t.archivedAt) return false;
    for (let i = 0; i < t.pauses.length; i++) {
      const p = t.pauses[i];
      if (key >= p.from && (!p.to || key < p.to)) return false;
    }
    return true;
  };

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  HT.DAY_NAMES = DAY_NAMES;
  HT.describeFrequency = (t) => {
    const f = t.frequency;
    if (f.mode === 'weekdays') return 'Weekdays';
    if (f.mode === 'weekends') return 'Weekends';
    if (f.mode === 'days') {
      if (f.days.length === 7) return 'Every day';
      return f.days.slice().sort().map((d) => DAY_NAMES[d]).join(', ') || 'No days selected';
    }
    if (f.mode === 'interval') return 'Every ' + f.every + ' days';
    return 'Every day';
  };

  /* ---------- day + range summaries ---------- */

  HT.daySummary = (key) => {
    const items = HT.data.trackers.filter((t) => t.counts && HT.isExpected(t, key));
    let done = 0, partial = 0;
    items.forEach((t) => {
      const p = HT.progress(t, key);
      if (p >= 1) done++;
      partial += p;
    });
    const total = items.length;
    const ratio = total ? (HT.data.settings.completion === 'partial' ? partial / total : done / total) : 0;
    return { total, done, any: partial > 0, pct: Math.round(ratio * 100), ratio };
  };

  /* 'future' | 'none' | 'complete' | 'partial' | 'pending' (today, nothing yet) | 'missed' */
  HT.dayStatus = (key) => {
    const today = HT.today();
    if (key > today) return 'future';
    const s = HT.daySummary(key);
    if (!s.total) return 'none';
    if (s.done === s.total) return 'complete';
    if (s.any) return 'partial';
    return key === today ? 'pending' : 'missed';
  };

  /* Totals for a date range. Today's unfinished habits are still open, so they are not "missed". */
  HT.rangeSummary = (from, to) => {
    const today = HT.today();
    const end = to > today ? today : to;
    const out = { expected: 0, done: 0, missed: 0, credit: 0, days: 0, perfectDays: 0, perTracker: {} };
    for (let key = from; key <= end; key = HT.addDays(key, 1)) {
      let dayExp = 0, dayDone = 0;
      HT.data.trackers.forEach((t) => {
        if (!t.counts || !HT.isExpected(t, key)) return;
        const done = HT.isDone(t, key);
        dayExp++;
        if (done) dayDone++;
        if (key === today && !done) return;
        const pt = (out.perTracker[t.id] = out.perTracker[t.id] || { expected: 0, done: 0 });
        pt.expected++;
        out.expected++;
        out.credit += HT.progress(t, key);
        if (done) { out.done++; pt.done++; } else out.missed++;
      });
      if (dayExp) {
        out.days++;
        if (dayDone === dayExp) out.perfectDays++;
      }
    }
    const ratio = out.expected ? (HT.data.settings.completion === 'partial' ? out.credit : out.done) / out.expected : 0;
    out.pct = Math.round(ratio * 100);
    return out;
  };

  /* ---------- per-tracker stats ----------
     Streaks count consecutive *expected* days that were completed. Days that are not
     scheduled (or are paused) are skipped, never counted as a break. An unfinished
     today doesn't break the streak either — it's still in progress. */
  HT.stats = (t) => {
    const today = HT.today();
    const goal = HT.goal(t);
    let run = 0, best = 0, total = 0, expected = 0, doneExpected = 0, sum = 0;
    const logged = Object.keys(HT.data.entries).filter((k) => HT.data.entries[k][t.id] > 0);
    logged.forEach((k) => { if (HT.data.entries[k][t.id] >= goal) total++; });
    if (t.startDate <= today) {
      for (let key = t.startDate; key <= today; key = HT.addDays(key, 1)) {
        if (!HT.isExpected(t, key)) continue;
        const v = HT.value(t, key);
        const done = v >= goal;
        if (key === today && !done) { sum += 0; continue; }
        expected++;
        sum += v;
        if (done) {
          doneExpected++;
          run++;
          if (run > best) best = run;
        } else run = 0;
      }
    }
    return {
      current: run,
      best,
      total,
      expected,
      rate: expected ? Math.round((doneExpected / expected) * 100) : 0,
      average: expected ? sum / expected : 0,
    };
  };

  HT.weekStart = (key) => {
    const d = HT.parseKey(key);
    const diff = (d.getDay() - HT.data.settings.weekStart + 7) % 7;
    return HT.addDays(key, -diff);
  };
  HT.monthStart = (key) => key.slice(0, 8) + '01';
  HT.monthEnd = (key) => {
    const d = HT.parseKey(key);
    return HT.dateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  };
})();
