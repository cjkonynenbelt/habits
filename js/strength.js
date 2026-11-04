/* Habits — Strength training: exercise list, set logging, progress, personal records, history.

   Sessions are stored in the Health workout log (HT.data.health.workouts) as exercise entries
   linked by `exId` to HT.data.health.exercises. Nothing is kept twice, so the Workouts screen,
   the workout habit link and the Nutrition weekly table all keep seeing lifts logged here.
   Weights are stored in kg and shown in the Weight section's unit (kg or lb). */
(function () {
  'use strict';
  const HT = window.HT;
  const esc = HT.esc;
  const S = (HT.strength = {});
  const D = () => HT.data.health;

  const ico = (d) => '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  Object.assign(HT.icon, {
    dumbbell: ico('<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>'),
    trophy: ico('<path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5.5a2.5 2.5 0 0 0 2.7 3.7M16 6h2.5a2.5 2.5 0 0 1-2.7 3.7M12 13v3.5M9 20h6M10 16.5h4"/>'),
  });
  const icon = HT.icon;

  /* ---------- reference lists ---------- */

  S.GROUPS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Glutes', 'Core', 'Full body', 'Other'];
  // [name, muscle group, usually bodyweight]
  S.LIBRARY = [
    ['Bench Press', 'Chest'], ['Incline Bench Press', 'Chest'], ['Dumbbell Bench Press', 'Chest'], ['Incline Dumbbell Press', 'Chest'], ['Chest Fly', 'Chest'], ['Push-ups', 'Chest', true],
    ['Deadlift', 'Back'], ['Barbell Row', 'Back'], ['Pull-ups', 'Back', true], ['Chin-ups', 'Back', true], ['Lat Pulldown', 'Back'], ['Seated Cable Row', 'Back'], ['Dumbbell Row', 'Back'], ['T-Bar Row', 'Back'],
    ['Overhead Press', 'Shoulders'], ['Dumbbell Shoulder Press', 'Shoulders'], ['Lateral Raise', 'Shoulders'], ['Face Pull', 'Shoulders'], ['Rear Delt Fly', 'Shoulders'],
    ['Bicep Curls', 'Biceps'], ['Hammer Curls', 'Biceps'], ['Preacher Curls', 'Biceps'],
    ['Tricep Extensions', 'Triceps'], ['Tricep Pushdown', 'Triceps'], ['Skull Crushers', 'Triceps'], ['Close-Grip Bench Press', 'Triceps'], ['Dips', 'Triceps', true],
    ['Squat', 'Legs'], ['Front Squat', 'Legs'], ['Leg Press', 'Legs'], ['Romanian Deadlift', 'Legs'], ['Lunges', 'Legs'], ['Bulgarian Split Squat', 'Legs'], ['Leg Extension', 'Legs'], ['Leg Curl', 'Legs'], ['Calf Raise', 'Legs'],
    ['Hip Thrust', 'Glutes'], ['Glute Bridge', 'Glutes'],
    ['Hanging Leg Raise', 'Core', true], ['Cable Crunch', 'Core'], ['Ab Wheel Rollout', 'Core', true],
    ['Power Clean', 'Full body'], ['Kettlebell Swing', 'Full body'],
  ];

  /* ---------- small helpers ---------- */

  const str = (v, max) => String(v == null ? '' : v).slice(0, max || 80);
  const cleanName = (v) => str(v, 60).trim().replace(/\s+/g, ' ');
  const nkey = (v) => cleanName(v).toLowerCase();
  const xid = () => 'ex' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const libEntry = (name) => S.LIBRARY.find((l) => l[0].toLowerCase() === nkey(name));
  const libGroup = (name) => { const l = libEntry(name); return l ? l[1] : 'Other'; };
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const round1 = (n) => Math.round(n * 10) / 10;
  const unit = () => (HT.weight ? HT.weight.unit() : 'kg');
  const toU = (kg) => (HT.weight ? HT.weight.toUnit(kg) : kg);
  const fromU = (v) => (HT.weight ? HT.weight.fromUnit(v) : v);
  const fmtW = (kg) => (kg == null ? 'Bodyweight' : round1(toU(kg)).toLocaleString() + ' ' + unit());
  const fmtVol = (kg) => Math.round(toU(kg || 0)).toLocaleString() + ' ' + unit();
  const fmtSet = (kg, reps) => (kg == null ? (reps != null ? reps + ' reps' : '—') : fmtW(kg) + (reps != null ? ' × ' + reps : ''));
  const longDate = (key) => HT.parseKey(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const shortDate = (key) => HT.parseKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const nowTime = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

  /* ---------- data shape ----------
     Called from HT.normalizeHealth with the normalised health object and the raw input.
     Builds the exercise list and links every workout entry that has sets to an exercise
     (matching by id, then by name; unmatched lifts get an exercise of their own). */
  S.normalize = (out, raw) => {
    const list = [], ids = new Set(), names = new Map();
    (Array.isArray(raw && raw.exercises) ? raw.exercises : []).forEach((e) => {
      if (!e || typeof e !== 'object') return;
      const name = cleanName(e.name);
      if (!name || names.has(name.toLowerCase())) return;
      let id = str(e.id, 40);
      if (!id || ids.has(id)) id = xid();
      const ex = { id, name, group: S.GROUPS.includes(e.group) ? e.group : libGroup(name), createdAt: typeof e.createdAt === 'string' ? e.createdAt : new Date().toISOString() };
      ids.add(id);
      names.set(name.toLowerCase(), ex);
      list.push(ex);
    });
    const byId = new Map(list.map((e) => [e.id, e]));
    out.workouts.forEach((w) => w.exercises.forEach((x) => {
      let ex = (x.exId && byId.get(x.exId)) || names.get(nkey(x.name));
      if (!ex && x.sets.length) {
        const l = libEntry(x.name);
        ex = { id: xid(), name: l ? l[0] : cleanName(x.name), group: l ? l[1] : 'Other', createdAt: new Date().toISOString() };
        list.push(ex);
        byId.set(ex.id, ex);
        names.set(ex.name.toLowerCase(), ex);
      }
      if (ex) { x.exId = ex.id; x.name = ex.name; } else delete x.exId;
    }));
    out.exercises = list;
    return out;
  };

  /* ---------- calculations ---------- */

  /* Estimated one-rep max (Epley). Only from sets of 1–12 reps, where the formula is reasonable. */
  S.e1rm = (kg, reps) => (kg > 0 && reps >= 1 && reps <= 12 ? (reps === 1 ? kg : kg * (1 + reps / 30)) : null);

  S.exercises = () => D().exercises;
  S.exercise = (id) => D().exercises.find((e) => e.id === id) || null;
  S.findByName = (name) => D().exercises.find((e) => e.name.toLowerCase() === nkey(name)) || null;

  /* One exercise entry in one workout, with everything the screens need. */
  function summarize(w, x, i) {
    let top = null, topReps = null, e1 = null, best = null, volume = 0, reps = 0, maxReps = null;
    x.sets.forEach((s) => {
      if (s.reps) reps += s.reps;
      if (s.kg && s.reps) volume += s.kg * s.reps;
      if (s.kg != null && (top == null || s.kg > top || (s.kg === top && (s.reps || 0) > (topReps || 0)))) { top = s.kg; topReps = s.reps; }
      if (s.reps != null && (maxReps == null || s.reps > maxReps)) maxReps = s.reps;
      const e = S.e1rm(s.kg, s.reps);
      if (e != null && (e1 == null || e > e1)) { e1 = e; best = { kg: s.kg, reps: s.reps }; }
    });
    if (!best) best = top != null ? { kg: top, reps: topReps } : { kg: null, reps: maxReps };
    return { key: w.id + '.' + i, wid: w.id, i, exId: x.exId, name: x.name, date: w.date, time: w.time || '', sets: x.sets, notes: x.notes || '', top, topReps, e1rm: e1, best, volume, reps, maxReps, prs: [] };
  }

  /* All sessions (oldest first), with personal records flagged: a session sets a record when it
     beats every earlier session of that exercise. The first session is the baseline, not a record. */
  S.history = (exId) => {
    const list = [];
    D().workouts.forEach((w) => w.exercises.forEach((x, i) => {
      if (x.exId && x.sets.length && (!exId || x.exId === exId)) list.push(summarize(w, x, i));
    }));
    list.sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : a.date + a.time > b.date + b.time ? 1 : 0));
    const bests = {}, events = [];
    list.forEach((s) => {
      const b = bests[s.exId] || (bests[s.exId] = {});
      [['heavy', s.top], ['e1rm', s.e1rm], ['volume', s.volume || null], ['reps', s.maxReps]].forEach(([k, v]) => {
        if (v == null || !(v > 0)) return;
        if (b[k] != null && v > b[k] + 1e-9) { s.prs.push(k); events.push({ type: k, value: v, s }); }
        if (b[k] == null || v > b[k]) b[k] = v;
      });
    });
    return { list, events };
  };
  S.PR_LABEL = { heavy: 'Heaviest weight', e1rm: 'Best est. 1RM', volume: 'Highest volume', reps: 'Most reps' };
  const prList = (prs) => prs.map((k, n) => (n ? S.PR_LABEL[k].charAt(0).toLowerCase() + S.PR_LABEL[k].slice(1) : S.PR_LABEL[k])).join(', ');
  S.prValue = (ev) => (ev.type === 'heavy' ? fmtSet(ev.s.top, ev.s.topReps) : ev.type === 'e1rm' ? fmtW(ev.value) : ev.type === 'volume' ? fmtVol(ev.value) : ev.value + ' reps');

  const maxBy = (list, f) => list.reduce((best, s) => (f(s) != null && (best == null || f(s) > f(best)) ? s : best), null);

  /* Progress figures for one exercise, or null when it has never been logged. */
  S.stats = (exId) => {
    const { list } = S.history(exId);
    if (!list.length) return null;
    const first = list[0], last = list[list.length - 1], prev = list.length > 1 ? list[list.length - 2] : null;
    const heavy = maxBy(list, (s) => (s.top == null ? null : s.top + (s.topReps || 0) / 1e4));
    const bestE = maxBy(list, (s) => s.e1rm);
    const vol = maxBy(list, (s) => s.volume || null);
    const reps = maxBy(list, (s) => s.maxReps);
    // Compare like with like: estimated 1RM when both ends have one, else top weight, else reps.
    let metric = null, fv = null, lv = null;
    if (first.e1rm && last.e1rm) { metric = 'e1rm'; fv = first.e1rm; lv = last.e1rm; }
    else if (first.top && last.top) { metric = 'top'; fv = first.top; lv = last.top; }
    else if (first.maxReps && last.maxReps) { metric = 'reps'; fv = first.maxReps; lv = last.maxReps; }
    return {
      list, first, last, prev,
      sessions: list.length,
      totalReps: list.reduce((a, s) => a + s.reps, 0),
      totalVolume: list.reduce((a, s) => a + s.volume, 0),
      heaviest: heavy ? { kg: heavy.top, reps: heavy.topReps, date: heavy.date } : null,
      bestE1rm: bestE ? { kg: bestE.e1rm, date: bestE.date, set: bestE.best } : null,
      bestSet: bestE ? { kg: bestE.best.kg, reps: bestE.best.reps, date: bestE.date } : heavy ? { kg: heavy.top, reps: heavy.topReps, date: heavy.date } : reps ? { kg: null, reps: reps.maxReps, date: reps.date } : null,
      bestVolume: vol ? { kg: vol.volume, date: vol.date } : null,
      mostReps: reps ? { reps: reps.maxReps, date: reps.date } : null,
      improvement: metric && list.length > 1 ? { metric, pct: ((lv - fv) / fv) * 100, from: first.date } : null,
      bodyweight: list.every((s) => s.top == null),
    };
  };

  /* Totals for the dashboard. */
  S.summary = () => {
    const { list, events } = S.history();
    const workouts = new Set(list.map((s) => s.wid));
    return { list, events, sessions: list.length, workouts: workouts.size, volume: list.reduce((a, s) => a + s.volume, 0) };
  };

  /* Sets collapsed into rows of identical weight and reps: [{kg, reps, n}]. */
  S.collapse = (sets) => {
    const rows = [];
    sets.forEach((s) => {
      const last = rows[rows.length - 1];
      if (last && last.kg === s.kg && last.reps === s.reps) last.n++;
      else rows.push({ kg: s.kg, reps: s.reps, n: 1 });
    });
    return rows;
  };
  S.setsText = (sets) => S.collapse(sets).map((r) => (r.n > 1 ? r.n + '×' : '') + (r.reps != null ? r.reps : '?') + (r.kg != null ? ' @ ' + fmtW(r.kg) : r.n > 1 ? '' : ' reps')).join(', ');

  /* ---------- changing data ---------- */

  const findEntry = (wid, i) => { const w = D().workouts.find((x) => x.id === wid); return w && w.exercises[i] ? { w, x: w.exercises[i] } : null; };
  S.entryByKey = (key) => { const p = String(key).split('.'); return findEntry(p[0], +p[1]); };
  const sortWorkouts = () => D().workouts.sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : a.date + a.time > b.date + b.time ? 1 : 0));
  /* A workout left with nothing in it (no exercises, time, distance, name or notes) is removed. */
  const dropIfEmpty = (w) => {
    if (!w.exercises.length && !w.duration && !w.distance && !w.notes && !w.name) D().workouts = D().workouts.filter((x) => x !== w);
  };
  /* The strength entry for an exercise on a date, if one was already logged. */
  S.entryOn = (exId, date) => {
    for (let k = D().workouts.length - 1; k >= 0; k--) {
      const w = D().workouts[k];
      if (w.date !== date) continue;
      const i = w.exercises.findIndex((x) => x.exId === exId);
      if (i >= 0) return { w, i, key: w.id + '.' + i };
    }
    return null;
  };

  S.addExercise = (name, group) => {
    const n = cleanName(name);
    if (!n) return { error: 'Enter a name' };
    if (S.findByName(n)) return { error: 'You already have ' + S.findByName(n).name, existing: S.findByName(n) };
    const ex = { id: xid(), name: n, group: S.GROUPS.includes(group) ? group : libGroup(n), createdAt: new Date().toISOString() };
    D().exercises.push(ex);
    return { ex };
  };
  S.updateExercise = (ex, name, group) => {
    const n = cleanName(name);
    if (!n) return { error: 'Enter a name' };
    const other = S.findByName(n);
    if (other && other.id !== ex.id) return { error: 'You already have ' + other.name };
    ex.name = n;
    ex.group = S.GROUPS.includes(group) ? group : ex.group;
    D().workouts.forEach((w) => w.exercises.forEach((x) => { if (x.exId === ex.id) x.name = n; }));
    return { ex };
  };
  /* Removes the exercise and its own logged sets. Other exercises, times and notes in the same
     workouts are kept; a workout is only removed if nothing else is left in it. */
  S.deleteExercise = (ex) => {
    D().workouts.slice().forEach((w) => {
      const before = w.exercises.length;
      w.exercises = w.exercises.filter((x) => x.exId !== ex.id);
      if (w.exercises.length !== before) dropIfEmpty(w);
    });
    D().exercises = D().exercises.filter((e) => e.id !== ex.id);
  };

  /* Save a session. `key` is the entry being edited (or null for a new one).
     Returns { key, merged } for the saved entry. */
  S.saveSession = (exId, date, sets, notes, key) => {
    const ex = S.exercise(exId);
    if (!ex) throw new Error('Unknown exercise');
    let cur = key ? S.entryByKey(key) : null;
    if (cur && cur.w.date === date) {
      cur.x.sets = sets.slice(0, 50);
      if (notes) cur.x.notes = notes; else delete cur.x.notes;
      cur.x.name = ex.name;
      return { key: cur.w.id + '.' + cur.w.exercises.indexOf(cur.x), merged: false };
    }
    if (cur) { // moved to another date
      cur.w.exercises.splice(cur.w.exercises.indexOf(cur.x), 1);
      dropIfEmpty(cur.w);
    }
    const there = S.entryOn(exId, date);
    if (there) {
      const x = there.w.exercises[there.i];
      x.sets = x.sets.concat(sets).slice(0, 50);
      if (notes) x.notes = x.notes ? str(x.notes + ' · ' + notes, 300) : notes;
      return { key: there.key, merged: true };
    }
    let w = null;
    for (let k = D().workouts.length - 1; k >= 0; k--) if (D().workouts[k].date === date && D().workouts[k].type === 'strength') { w = D().workouts[k]; break; }
    if (!w) {
      w = { id: 'wo' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date, time: date === HT.today() ? nowTime() : '', type: 'strength', name: '', duration: null, distance: null, exercises: [], notes: '', templateId: null, createdAt: new Date().toISOString() };
      D().workouts.push(w);
      sortWorkouts();
    }
    const x = { name: ex.name, sets: sets.slice(0, 50), exId };
    if (notes) x.notes = notes;
    w.exercises.push(x);
    if (!key && HT.health && HT.health.linkWorkoutHabit) HT.health.linkWorkoutHabit(date);
    return { key: w.id + '.' + (w.exercises.length - 1), merged: false };
  };
  S.deleteSession = (key) => {
    const cur = S.entryByKey(key);
    if (!cur) return false;
    cur.w.exercises.splice(cur.w.exercises.indexOf(cur.x), 1);
    dropIfEmpty(cur.w);
    return true;
  };

  /* Read and check set rows: [{w, r, n}] as typed (strings, in the display unit). */
  S.parseRows = (rows) => {
    const sets = [];
    for (let k = 0; k < rows.length; k++) {
      const r = rows[k];
      const w = String(r.w == null ? '' : r.w).trim(), reps = String(r.r == null ? '' : r.r).trim(), n = String(r.n == null ? '' : r.n).trim();
      if (w === '' && reps === '') continue;
      const rv = Number(reps), wv = w === '' ? 0 : Number(w), nv = n === '' ? 1 : Number(n);
      if (reps === '' || !Number.isInteger(rv) || rv < 1 || rv > 999) return { error: 'Enter whole-number reps (1–999) for row ' + (k + 1) };
      if (!Number.isFinite(wv) || wv < 0 || wv >= 2000) return { error: 'Weight in row ' + (k + 1) + ' must be a number, or blank for bodyweight' };
      if (!Number.isInteger(nv) || nv < 1 || nv > 20) return { error: 'Sets in row ' + (k + 1) + ' must be a whole number from 1 to 20' };
      for (let j = 0; j < nv; j++) sets.push({ reps: rv, kg: wv > 0 ? fromU(wv) : null });
    }
    if (!sets.length) return { error: 'Enter the reps for at least one set' };
    if (sets.length > 50) return { error: 'That\'s more than 50 sets — split it into two sessions' };
    return { sets };
  };

  /* ---------- sheets ---------- */

  function sheet(o) {
    return HT.openSheet({
      title: o.title, kind: o.kind || 'sheet', html: o.html,
      footer: o.footer != null ? o.footer : (o.onDelete ? '<button type="button" class="btn btn-danger-ghost" data-del>' + (o.deleteLabel || 'Delete') + '</button>' : '<button type="button" class="btn" data-close>Cancel</button>') +
        (o.onSave ? '<button type="button" class="btn btn-primary" data-save>' + (o.saveLabel || 'Save') + '</button>' : ''),
      onMount: (wrap, close) => {
        let busy = false;
        const finish = (res) => { if (res !== false) { HT.save(); close(); HT.render(); if (typeof res === 'function') res(); } };
        const run = (fn) => {
          if (busy || !fn) return;
          const res = fn(wrap);
          if (res && typeof res.then === 'function') { busy = true; res.then((ok) => { busy = false; finish(ok); }, (err) => { busy = false; console.error(err); }); }
          else finish(res);
        };
        wrap.addEventListener('click', (e) => {
          if (e.target.closest('[data-save]')) run(o.onSave);
          else if (e.target.closest('[data-del]')) run(o.onDelete);
        });
        if (o.onSave) wrap.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'search') { e.preventDefault(); run(o.onSave); } });
        if (o.onMount) o.onMount(wrap, close);
      },
    });
  }
  const groupSelect = (id, cur) => '<select id="' + id + '">' + S.GROUPS.map((g) => '<option' + (g === cur ? ' selected' : '') + '>' + g + '</option>').join('') + '</select>';
  const then = (fn) => setTimeout(fn, 230); // after the closing sheet's animation

  /* Pick an exercise to log: yours first, then the library, or create one. */
  S.openPicker = (date) => {
    const draw = (q) => {
      const k = nkey(q);
      const mine = D().exercises.filter((e) => !k || e.name.toLowerCase().includes(k));
      const lib = S.LIBRARY.filter((l) => !S.findByName(l[0]) && (!k || l[0].toLowerCase().includes(k)));
      const recent = k ? [] : recentExercises(5);
      let h = '';
      if (recent.length) h += '<div class="st-plabel">Recent</div><div class="chips">' + recent.map((e) => '<button type="button" class="chip" data-pick="' + e.id + '">' + esc(e.name) + '</button>').join('') + '</div>';
      if (mine.length) {
        h += '<div class="st-plabel">Your exercises</div><ul class="dlist">' + S.GROUPS.map((g) => mine.filter((e) => e.group === g).map((e) =>
          '<li><button type="button" class="drow" data-pick="' + e.id + '"><span class="dname">' + esc(e.name) + '<small>' + esc(g) + '</small></span><span class="chev">' + icon.next + '</span></button></li>').join('')).join('') + '</ul>';
      }
      if (lib.length) {
        h += '<div class="st-plabel">Exercise library</div><ul class="dlist">' + lib.map((l) =>
          '<li><button type="button" class="drow" data-lib="' + esc(l[0]) + '"><span class="dname">' + esc(l[0]) + '<small>' + esc(l[1]) + '</small></span><span class="dval">Add</span></button></li>').join('') + '</ul>';
      }
      if (k && !S.findByName(q) && !libEntry(q)) {
        h += '<div class="st-create"><div class="st-plabel">New exercise “' + esc(cleanName(q)) + '”</div><div class="st-create-row">' + groupSelect('st-pgroup', libGroup(q)) +
          '<button type="button" class="btn btn-primary" data-create>' + icon.plus + '<span>Create</span></button></div></div>';
      }
      if (!h) h = '<p class="muted">No matches.</p>';
      return h;
    };
    sheet({
      title: 'Log a lift', kind: 'sheet tall',
      html: '<input id="st-q" type="search" autocomplete="off" placeholder="Search or name a new exercise" aria-label="Search exercises"><div id="st-plist" class="gap-top">' + draw('') + '</div>',
      footer: '<button type="button" class="btn" data-close>Close</button>',
      onMount: (wrap, close) => {
        const q = HT.$('#st-q', wrap);
        q.addEventListener('input', () => { HT.$('#st-plist', wrap).innerHTML = draw(q.value); });
        const open = (ex) => { close(); then(() => S.openLog(ex.id, { date })); };
        wrap.addEventListener('click', (e) => {
          let b;
          if ((b = e.target.closest('[data-pick]'))) { const ex = S.exercise(b.dataset.pick); if (ex) open(ex); }
          else if ((b = e.target.closest('[data-lib]'))) { const l = libEntry(b.dataset.lib); const r = S.addExercise(l[0], l[1]); HT.save(); open(r.ex || r.existing); }
          else if (e.target.closest('[data-create]')) {
            const r = S.addExercise(q.value, HT.$('#st-pgroup', wrap).value);
            if (r.error && !r.existing) { HT.toast(r.error); return; }
            HT.save();
            open(r.ex || r.existing);
          }
        });
      },
    });
  };

  /* Add exercises (custom or several from the library at once), or edit one. */
  S.openExerciseForm = (existing) => {
    const lib = () => S.LIBRARY.filter((l) => !S.findByName(l[0]));
    const libHTML = () => S.GROUPS.map((g) => {
      const items = lib().filter((l) => l[1] === g);
      return items.length ? '<div class="st-plabel">' + g + '</div><div class="chips">' + items.map((l) => '<button type="button" class="chip" data-libpick="' + esc(l[0]) + '" aria-pressed="false">' + esc(l[0]) + '</button>').join('') + '</div>' : '';
    }).join('');
    const stats = existing ? S.stats(existing.id) : null;
    sheet({
      title: existing ? 'Edit exercise' : 'Add exercises', kind: 'sheet tall',
      html: '<label class="field"><span class="label">' + (existing ? 'Name' : 'Custom exercise') + (existing ? '' : ' <em>optional</em>') + '</span><input id="st-name" type="text" maxlength="60" autocomplete="off" placeholder="e.g. Cable Fly" value="' + esc(existing ? existing.name : '') + '"></label>' +
        '<label class="field"><span class="label">Muscle group</span>' + groupSelect('st-group', existing ? existing.group : 'Other') + '</label>' +
        (existing ? '' : (lib().length ? '<div class="field"><span class="label">From the library</span><p class="hint">Tap to select as many as you like.</p>' + libHTML() + '</div>' : '')),
      saveLabel: existing ? 'Save' : 'Add',
      onDelete: existing ? async () => {
        const n = stats ? stats.sessions : 0;
        const ok = await HT.confirm({
          title: 'Delete ' + esc(existing.name) + '?',
          message: n ? 'This also deletes its <b>' + plural(n, 'logged session') + '</b>. Other exercises, times and notes in those workouts are kept. This can\'t be undone.' : 'It has no logged sessions.',
          confirmLabel: 'Delete', danger: true,
        });
        if (!ok) return false;
        S.deleteExercise(existing);
        HT.toast(existing.name + ' deleted');
        return () => { location.hash = '#/strength/exercises'; };
      } : null,
      onMount: (wrap) => {
        if (existing) return;
        const name = HT.$('#st-name', wrap), group = HT.$('#st-group', wrap);
        name.addEventListener('input', () => { const l = libEntry(name.value); if (l) group.value = l[1]; });
        wrap.addEventListener('click', (e) => {
          const b = e.target.closest('[data-libpick]');
          if (b) { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); b.classList.toggle('on', on); }
        });
      },
      onSave: (wrap) => {
        const name = HT.$('#st-name', wrap).value, group = HT.$('#st-group', wrap).value;
        if (existing) {
          const r = S.updateExercise(existing, name, group);
          if (r.error) { HT.toast(r.error); return false; }
          HT.toast('Saved');
          return;
        }
        const picks = HT.$$('[data-libpick][aria-pressed="true"]', wrap).map((b) => libEntry(b.dataset.libpick));
        if (!cleanName(name) && !picks.length) { HT.toast('Type a name or pick from the library'); return false; }
        let added = 0;
        if (cleanName(name)) {
          const r = S.addExercise(name, group);
          if (r.error) { HT.toast(r.error); return false; }
          added++;
        }
        picks.forEach((l) => { if (!S.addExercise(l[0], l[1]).error) added++; });
        HT.toast(plural(added, 'exercise') + ' added');
      },
    });
  };

  /* Log or edit one exercise session. opts: { date, key } */
  S.openLog = (exId, opts) => {
    const o = opts || {};
    const ex = S.exercise(exId);
    if (!ex) return;
    const today = HT.today();
    let key = o.key || null;
    let date = o.date && HT.isDateKey(o.date) && o.date <= today ? o.date : today;
    let alreadyNote = '';
    if (!key) {
      const there = S.entryOn(exId, date);
      if (there) { key = there.key; alreadyNote = 'Already logged on this date — you\'re editing that session.'; }
    }
    const cur = key ? S.entryByKey(key) : null;
    if (key && !cur) { HT.toast('That session no longer exists'); return; }
    if (cur) date = cur.w.date;
    const hist = S.history(exId).list;
    const lastBefore = (d) => hist.filter((s) => s.key !== key && s.date <= d).pop() || null;
    const toRows = (sets) => S.collapse(sets).map((r) => ({ w: r.kg != null ? String(round1(toU(r.kg))) : '', r: r.reps != null ? String(r.reps) : '', n: String(r.n) }));
    const last = lastBefore(date);
    let rows = cur ? toRows(cur.x.sets) : last ? toRows(last.sets) : [{ w: '', r: '', n: '1' }];
    const prefilled = !cur && !!last;
    const bw = libEntry(ex.name) && libEntry(ex.name)[2];

    const rowHTML = (r, i) => '<div class="st-row" data-row="' + i + '">' +
      '<input type="number" inputmode="decimal" min="0" step="any" data-f="w" value="' + esc(r.w) + '" placeholder="' + (bw ? '+0' : '0') + '" aria-label="Weight, row ' + (i + 1) + '">' +
      '<input type="number" inputmode="numeric" min="1" step="1" data-f="r" value="' + esc(r.r) + '" placeholder="0" aria-label="Reps, row ' + (i + 1) + '">' +
      '<input type="number" inputmode="numeric" min="1" max="20" step="1" data-f="n" value="' + esc(r.n) + '" aria-label="Sets, row ' + (i + 1) + '">' +
      '<button type="button" class="icon-btn sm" data-rm="' + i + '" aria-label="Remove row ' + (i + 1) + '"' + (rows.length === 1 ? ' disabled' : '') + '>' + icon.minus + '</button></div>';
    const read = (wrap) => { rows = HT.$$('#st-rows .st-row', wrap).map((el) => ({ w: HT.$('[data-f="w"]', el).value, r: HT.$('[data-f="r"]', el).value, n: HT.$('[data-f="n"]', el).value })); };
    const lastHTML = (d) => {
      const l = lastBefore(d);
      return l ? '<div class="st-last"><div><span>Last time · ' + esc(shortDate(l.date)) + '</span><b>' + esc(S.setsText(l.sets)) + '</b></div><button type="button" class="btn btn-sm" data-repeat>Use</button></div>' : '';
    };
    const live = (wrap) => {
      read(wrap);
      const p = S.parseRows(rows);
      const el = HT.$('#st-live', wrap);
      if (p.error) { el.textContent = ''; return; }
      const s = summarize({ id: 'x', date }, { sets: p.sets }, 0);
      el.innerHTML = plural(p.sets.length, 'set') + ' · ' + s.reps + ' reps' + (s.volume ? ' · ' + fmtVol(s.volume) + ' volume' : '') + (s.e1rm ? ' · est. 1RM ' + fmtW(s.e1rm) : '');
    };

    sheet({
      title: cur ? 'Edit session' : ex.name, kind: 'sheet tall',
      html: (cur ? '<div class="st-loghead"><b>' + esc(ex.name) + '</b><span>' + esc(ex.group) + '</span></div>' : '<div class="st-loghead"><span>' + esc(ex.group) + '</span></div>') +
        (alreadyNote ? '<p class="hint gap-bottom">' + alreadyNote + '</p>' : '') +
        '<label class="field"><span class="label">Date</span><input id="st-date" type="date" max="' + today + '" value="' + date + '"></label>' +
        '<div id="st-lastbox">' + (cur ? '' : lastHTML(date)) + '</div>' +
        '<div class="st-sets"><div class="st-row st-rowh"><span>Weight (' + unit() + ')</span><span>Reps</span><span>Sets</span><span></span></div><div id="st-rows">' + rows.map(rowHTML).join('') + '</div></div>' +
        '<button type="button" class="btn wide" data-addrow>' + icon.plus + '<span>Add set</span></button>' +
        '<p class="st-live" id="st-live" aria-live="polite"></p>' +
        '<p class="hint">' + (prefilled ? 'Prefilled from your last session — change what\'s different. ' : '') + 'Use Sets for repeats of the same weight and reps. Leave weight blank for bodyweight' + (bw ? ', or enter added weight' : '') + '.</p>' +
        '<label class="field gap-top"><span class="label">Notes <em>optional</em></span><input id="st-notes" type="text" maxlength="300" autocomplete="off" placeholder="e.g. paused reps, felt strong" value="' + esc(cur ? cur.x.notes || '' : '') + '"></label>',
      saveLabel: cur ? 'Save' : 'Log',
      onDelete: cur ? async () => {
        const ok = await HT.confirm({ title: 'Delete session?', message: 'Delete ' + esc(ex.name) + ' from ' + esc(longDate(cur.w.date)) + '? This can\'t be undone.', confirmLabel: 'Delete', danger: true });
        if (!ok) return false;
        S.deleteSession(key);
        HT.toast('Session deleted');
      } : null,
      onMount: (wrap) => {
        const redraw = () => { HT.$('#st-rows', wrap).innerHTML = rows.map(rowHTML).join(''); live(wrap); };
        live(wrap);
        wrap.addEventListener('input', (e) => { if (e.target.closest('.st-row')) live(wrap); });
        HT.$('#st-date', wrap).addEventListener('change', (e) => { if (!cur && HT.isDateKey(e.target.value)) { date = e.target.value; HT.$('#st-lastbox', wrap).innerHTML = lastHTML(date); } });
        wrap.addEventListener('click', (e) => {
          let b;
          if (e.target.closest('[data-addrow]')) {
            read(wrap);
            const l = rows[rows.length - 1];
            rows.push({ w: l ? l.w : '', r: l ? l.r : '', n: '1' });
            redraw();
            const ins = HT.$$('#st-rows .st-row:last-child [data-f="w"]', wrap);
            if (ins[0]) ins[0].focus();
          } else if ((b = e.target.closest('[data-rm]'))) {
            read(wrap);
            if (rows.length > 1) { rows.splice(+b.dataset.rm, 1); redraw(); }
          } else if (e.target.closest('[data-repeat]')) {
            const l = lastBefore(HT.$('#st-date', wrap).value || date);
            if (l) { rows = toRows(l.sets); redraw(); }
          }
        });
      },
      onSave: (wrap) => {
        read(wrap);
        const d = HT.$('#st-date', wrap).value;
        if (!HT.isDateKey(d)) { HT.toast('Pick a date'); return false; }
        if (d > HT.today()) { HT.toast('That date is in the future'); return false; }
        const p = S.parseRows(rows);
        if (p.error) { HT.toast(p.error); return false; }
        const notes = str(HT.$('#st-notes', wrap).value, 300).trim();
        const res = S.saveSession(exId, d, p.sets, notes, key);
        const saved = S.history(exId).list.find((s) => s.key === res.key);
        if (saved && saved.prs.length) {
          S.vs.flash = { key: res.key, at: Date.now() };
          HT.toast('New personal record · ' + prList(saved.prs));
        } else HT.toast(res.merged ? 'Added to your session on ' + shortDate(d) : cur ? 'Session updated' : ex.name + ' logged');
      },
    });
  };

  /* Read-only view of one session with Edit / Delete. */
  S.openSession = (key) => {
    const cur = S.entryByKey(key);
    if (!cur) return;
    const s = S.history(cur.x.exId).list.find((x) => x.key === key);
    if (!s) return;
    sheet({
      title: s.name,
      html: '<p class="muted gap-bottom">' + esc(longDate(s.date)) + (s.time ? ' · ' + esc(s.time) : '') + '</p>' +
        (s.prs.length ? '<div class="st-prline">' + icon.trophy + '<span>Personal record · ' + prList(s.prs) + '</span></div>' : '') +
        '<table class="st-table"><thead><tr><th>Set</th><th>Weight</th><th>Reps</th><th>Est. 1RM</th></tr></thead><tbody>' +
        s.sets.map((x, j) => { const e = S.e1rm(x.kg, x.reps); return '<tr' + (x.kg === s.best.kg && x.reps === s.best.reps ? ' class="best"' : '') + '><td>' + (j + 1) + '</td><td>' + esc(fmtW(x.kg)) + '</td><td>' + (x.reps != null ? x.reps : '—') + '</td><td>' + (e ? esc(fmtW(e)) : '—') + '</td></tr>'; }).join('') +
        '</tbody></table>' +
        '<div class="frow"><span>Best set</span><b>' + esc(fmtSet(s.best.kg, s.best.reps)) + '</b></div>' +
        '<div class="frow"><span>Total reps</span><b>' + s.reps + '</b></div>' +
        (s.volume ? '<div class="frow"><span>Volume</span><b>' + esc(fmtVol(s.volume)) + '</b></div>' : '') +
        (s.notes ? '<div class="frow"><span>Notes</span><b class="st-notes">' + esc(s.notes) + '</b></div>' : ''),
      footer: '<button type="button" class="btn btn-danger-ghost" data-del>Delete</button><button type="button" class="btn btn-primary" data-edit>Edit</button>',
      onDelete: async () => {
        const ok = await HT.confirm({ title: 'Delete session?', message: 'Delete ' + esc(s.name) + ' from ' + esc(longDate(s.date)) + '? This can\'t be undone.', confirmLabel: 'Delete', danger: true });
        if (!ok) return false;
        S.deleteSession(key);
        HT.toast('Session deleted');
      },
      onMount: (wrap, close) => {
        wrap.addEventListener('click', (e) => { if (e.target.closest('[data-edit]')) { close(); then(() => S.openLog(s.exId, { key })); } });
      },
    });
  };

  /* ---------- screens ---------- */

  S.vs = { metric: 'e1rm', range: '3M', sel: null, hEx: '', hFrom: '', hTo: '', hLimit: 40, flash: null };
  const SUB = [['', 'Overview'], ['exercises', 'Exercises'], ['history', 'History'], ['records', 'Records']];
  const logBtn = '<button type="button" class="btn btn-primary" data-action="st-log">' + icon.plus + '<span>Log lift</span></button>';
  const head = (cur, right) => (HT.health ? HT.health.head('Strength', right == null ? logBtn : right) + HT.health.subnav('strength') : '<header class="page-head"><div><div class="eyebrow">Health</div><h1>Strength</h1></div>' + logBtn + '</header>') +
    (cur == null ? '' : '<div class="segmented gap-bottom" role="tablist">' + SUB.map((t) => '<a href="#/strength' + (t[0] ? '/' + t[0] : '') + '"' + (t[0] === cur ? ' aria-current="page"' : '') + '>' + t[1] + '</a>').join('') + '</div>');
  const cell = (label, value, sub, cls) => '<div class="st-cell"><div class="st-l">' + label + '</div><div class="st-v' + (cls ? ' ' + cls : '') + '">' + value + '</div>' + (sub ? '<div class="st-s">' + sub + '</div>' : '') + '</div>';
  const pct = (p) => (p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(round1(p)) + '%';
  const pctCls = (p) => (p > 0.05 ? 'up' : p < -0.05 ? 'down' : '');
  const prTag = (s) => (s.prs.length ? '<em class="tag pr">PR</em>' : '');
  const exLink = (id) => '#/strength/' + encodeURIComponent(id);
  /* The session just saved with a new record, for ~10 seconds after saving. */
  const flashKey = () => (S.vs.flash && Date.now() - S.vs.flash.at < 10000 ? S.vs.flash.key : null);

  function recentExercises(n) {
    const seen = new Set(), out = [];
    const list = S.history().list;
    for (let k = list.length - 1; k >= 0 && out.length < n; k--) {
      const s = list[k];
      if (seen.has(s.exId)) continue;
      seen.add(s.exId);
      const ex = S.exercise(s.exId);
      if (ex) out.push(Object.assign({ lastSession: s }, ex));
    }
    return out;
  }

  /* Tiny trend line for the highlights list. */
  const spark = (vals) => {
    if (vals.length < 2) return '';
    const W = 72, Hh = 24, lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), span = hi - lo || 1;
    const pts = vals.map((v, i) => (i * (W - 4) / (vals.length - 1) + 2).toFixed(1) + ',' + (Hh - 3 - ((v - lo) / span) * (Hh - 6)).toFixed(1));
    return '<svg class="st-spark" width="' + W + '" height="' + Hh + '" viewBox="0 0 ' + W + ' ' + Hh + '" aria-hidden="true"><polyline points="' + pts.join(' ') + '"/><circle cx="' + pts[pts.length - 1].split(',')[0] + '" cy="' + pts[pts.length - 1].split(',')[1] + '" r="2.5"/></svg>';
  };

  function overview() {
    const sum = S.summary();
    if (!sum.sessions) {
      return head('') + '<section class="empty"><div class="empty-mark">' + icon.dumbbell + '</div><h2>Track your strength</h2>' +
        '<p>Log the weight, reps and sets for each exercise. Your progress, estimated 1RM and personal records are worked out from what you log.</p>' +
        '<div class="btn-row st-center"><button type="button" class="btn btn-primary btn-lg" data-action="st-log">' + icon.plus + '<span>Log your first lift</span></button>' +
        '<button type="button" class="btn btn-lg" data-action="st-ex-new">Choose exercises</button></div></section>';
    }
    const today = HT.today(), ws = HT.weekStart(today);
    const week = sum.list.filter((s) => s.date >= ws);
    let html = head('') + '<div class="st-grid st-g4">' + cell('Workouts', sum.workouts.toLocaleString()) + cell('Exercises tracked', D().exercises.length) +
      cell('Total volume', fmtVol(sum.volume)) + cell('This week', plural(new Set(week.map((s) => s.wid)).size, 'workout'), week.length ? plural(week.length, 'exercise') + ' logged' : 'Nothing logged yet') + '</div>';

    const recent = recentExercises(5);
    html += '<h2 class="section-title">Log again</h2><section class="panel-card tight"><ul class="dlist">' + recent.map((e) =>
      '<li><div class="drow"><a class="dname linkrow" href="' + exLink(e.id) + '">' + esc(e.name) + '<small>' + esc(shortDate(e.lastSession.date) + ' · ' + S.setsText(e.lastSession.sets)) + '</small></a>' +
      '<button type="button" class="btn btn-sm" data-action="st-log-ex" data-id="' + e.id + '">' + icon.plus + '<span>Log</span></button></div></li>').join('') + '</ul></section>';

    // weekly activity
    const cols = [];
    let peak = 0;
    for (let i = 11; i >= 0; i--) {
      const s = HT.addDays(ws, -7 * i), e = HT.addDays(s, 6);
      const ss = sum.list.filter((x) => x.date >= s && x.date <= e);
      const v = ss.reduce((a, x) => a + x.volume, 0);
      peak = Math.max(peak, v);
      cols.push({ s, v, n: new Set(ss.map((x) => x.wid)).size });
    }
    html += '<h2 class="section-title">Weekly activity</h2><section class="panel-card"><div class="bars dense st-bars">' + cols.map((c, i) =>
      '<div class="bar-col' + (i === cols.length - 1 ? ' now' : '') + (c.n ? '' : ' muted-col') + '"><div class="bar-num">' + (c.n || '') + '</div><div class="bar-track"><i class="' + (c.n ? 'full' : '') + '" style="height:' + (peak ? Math.max(c.n ? 4 : 0, (c.v / peak) * 100) : c.n ? 4 : 0) + '%"></i></div><span>' + (i % 3 === 2 || i === cols.length - 1 ? shortDate(c.s) : '') + '</span></div>').join('') +
      '</div><p class="hint">Last 12 weeks. Bar height is volume lifted (weight × reps); the number is workouts that week.</p></section>';

    // progression highlights
    const hl = D().exercises.map((e) => ({ e, st: S.stats(e.id) })).filter((x) => x.st && x.st.sessions >= 2)
      .sort((a, b) => (a.st.last.date < b.st.last.date ? 1 : -1)).slice(0, 4);
    if (hl.length) {
      html += '<h2 class="section-title">Progress</h2><section class="panel-card tight"><ul class="dlist">' + hl.map((x) => {
        const st = x.st, imp = st.improvement;
        const series = st.list.slice(-12).map((s) => (imp && imp.metric === 'e1rm' ? s.e1rm : imp && imp.metric === 'reps' ? s.maxReps : s.top)).filter((v) => v != null);
        const now = imp && imp.metric === 'e1rm' ? 'Est. 1RM ' + fmtW(st.last.e1rm) : imp && imp.metric === 'reps' ? st.last.maxReps + ' reps' : fmtSet(st.last.top, st.last.topReps);
        return '<li><a class="drow st-hl" href="' + exLink(x.e.id) + '"><span class="dname">' + esc(x.e.name) + '<small>' + esc(now) + '</small></span>' + spark(series) +
          '<span class="dval st-pct ' + (imp ? pctCls(imp.pct) : '') + '">' + (imp ? pct(imp.pct) : '—') + '</span></a></li>';
      }).join('') + '</ul><p class="hint">Change since each exercise\'s first logged session.</p></section>';
    }

    // recent records
    const evs = sum.events.slice(-5).reverse();
    html += '<div class="widget-h"><h2 class="section-title">Recent personal records</h2><a class="linkish" href="#/strength/records">All records</a></div>';
    html += evs.length ? '<section class="panel-card tight"><ul class="dlist">' + evs.map(prRow).join('') + '</ul></section>'
      : '<section class="panel-card"><p class="muted">Records appear when you beat an earlier session — a heavier weight, more reps, more volume or a higher estimated 1RM.</p></section>';
    return html;
  }
  const prRow = (ev) => {
    const fresh = HT.addDays(HT.today(), -7) <= ev.s.date;
    return '<li><button type="button" class="drow" data-action="st-session" data-key="' + ev.s.key + '"><span class="st-pricon' + (fresh ? ' fresh' : '') + '">' + icon.trophy + '</span><span class="dname">' + esc(ev.s.name) +
      '<small>' + esc(S.PR_LABEL[ev.type] + ' · ' + shortDate(ev.s.date)) + '</small></span><span class="dval strong">' + esc(S.prValue(ev)) + (fresh ? '<em class="tag pr">New</em>' : '') + '</span></button></li>';
  };

  function exercisesTab() {
    let html = head('exercises', '<button type="button" class="btn btn-primary" data-action="st-ex-new">' + icon.plus + '<span>Add exercise</span></button>');
    const list = D().exercises;
    if (!list.length) return html + '<section class="empty"><div class="empty-mark">' + icon.dumbbell + '</div><h2>No exercises yet</h2><p>Pick from the library — Bench Press, Squat, Deadlift and more — or create your own.</p><button type="button" class="btn btn-primary btn-lg" data-action="st-ex-new">' + icon.plus + '<span>Add exercises</span></button></section>';
    const all = S.history().list;
    S.GROUPS.forEach((g) => {
      const items = list.filter((e) => e.group === g).sort((a, b) => a.name.localeCompare(b.name));
      if (!items.length) return;
      html += '<h2 class="section-title">' + g + '</h2><section class="panel-card tight"><ul class="dlist">' + items.map((e) => {
        const ss = all.filter((s) => s.exId === e.id), l = ss[ss.length - 1];
        return '<li><a class="drow" href="' + exLink(e.id) + '"><span class="dname">' + esc(e.name) + '<small>' + (l ? esc(plural(ss.length, 'session') + ' · last ' + shortDate(l.date)) : 'Not logged yet') + '</small></span>' +
          '<span class="dval">' + (l ? esc(fmtSet(l.top, l.top != null ? null : l.maxReps)) : '') + '</span><span class="chev">' + icon.next + '</span></a></li>';
      }).join('') + '</ul></section>';
    });
    return html;
  }

  const RANGES = [['1M', 30], ['3M', 91], ['6M', 182], ['1Y', 365], ['All', 0]];
  const METRICS = [['e1rm', 'Est. 1RM'], ['top', 'Top weight'], ['volume', 'Volume'], ['reps', 'Best reps']];

  function exercisePage(id) {
    const ex = S.exercise(id);
    if (!ex) return head(null) + '<section class="empty"><h2>Exercise not found</h2><p>It may have been deleted.</p><a class="btn" href="#/strength/exercises">All exercises</a></section>';
    const st = S.stats(id);
    let html = head(null, '<button type="button" class="btn btn-primary" data-action="st-log-ex" data-id="' + ex.id + '">' + icon.plus + '<span>Log</span></button>') +
      '<div class="st-exhead"><a class="btn btn-ghost" href="#/strength/exercises">' + icon.back + '<span>Exercises</span></a><button type="button" class="btn btn-sm" data-action="st-ex-edit" data-id="' + ex.id + '">' + icon.edit + '<span>Edit</span></button></div>' +
      '<div class="st-title"><h2>' + esc(ex.name) + '</h2><span class="tag">' + esc(ex.group) + '</span></div>';
    if (!st) return html + '<section class="empty"><div class="empty-mark">' + icon.dumbbell + '</div><h2>No sessions yet</h2><p>Log a session to see your progress, estimated 1RM and records for this exercise.</p><button type="button" class="btn btn-primary btn-lg" data-action="st-log-ex" data-id="' + ex.id + '">' + icon.plus + '<span>Log ' + esc(ex.name) + '</span></button></section>';
    const imp = st.improvement;
    html += '<div class="st-grid">' +
      cell('Current working weight', esc(st.bodyweight ? st.last.maxReps + ' reps' : fmtSet(st.last.top, st.last.topReps)), esc(shortDate(st.last.date))) +
      cell('Previous session', st.prev ? esc(st.bodyweight ? st.prev.maxReps + ' reps' : fmtSet(st.prev.top, st.prev.topReps)) : '—', st.prev ? esc(shortDate(st.prev.date)) : 'Log again to compare') +
      cell('All-time heaviest', st.heaviest ? esc(fmtSet(st.heaviest.kg, st.heaviest.reps)) : '—', st.heaviest ? esc(shortDate(st.heaviest.date)) : 'Bodyweight only') +
      cell('Best set', st.bestSet ? esc(fmtSet(st.bestSet.kg, st.bestSet.reps)) : '—', st.bestSet ? esc(shortDate(st.bestSet.date)) : '') +
      cell('Estimated 1RM', st.last.e1rm ? esc(fmtW(st.last.e1rm)) : '—', st.bestE1rm ? 'Best ' + esc(fmtW(st.bestE1rm.kg)) : 'Needs a weighted set of 1–12 reps') +
      cell('Improvement', imp ? pct(imp.pct) : '—', imp ? esc((imp.metric === 'e1rm' ? 'Est. 1RM' : imp.metric === 'top' ? 'Top weight' : 'Reps') + ' since ' + shortDate(imp.from)) : 'Needs two sessions', imp ? pctCls(imp.pct) : '') +
      cell('Sessions', st.sessions.toLocaleString()) + cell('Total reps', st.totalReps.toLocaleString()) + cell('Total volume', esc(fmtVol(st.totalVolume))) + '</div>';

    const metrics = METRICS.filter((m) => (st.bodyweight ? m[0] === 'reps' : true));
    if (!metrics.some((m) => m[0] === S.vs.metric)) S.vs.metric = metrics[0][0];
    html += '<section class="panel-card"><div class="card-head"><h3>Progress over time</h3></div>' +
      (metrics.length > 1 ? '<div class="segmented st-seg">' + metrics.map((m) => '<button type="button" data-action="st-metric" data-v="' + m[0] + '" aria-pressed="' + (m[0] === S.vs.metric) + '">' + m[1] + '</button>').join('') + '</div>' : '') +
      '<div class="segmented st-seg">' + RANGES.map((r) => '<button type="button" data-action="st-range" data-v="' + r[0] + '" aria-pressed="' + (r[0] === S.vs.range) + '">' + r[0] + '</button>').join('') + '</div>' +
      '<div id="st-chart" class="w-chart st-chart" data-ex="' + ex.id + '"></div>' +
      '<p class="hint">' + (S.vs.metric === 'e1rm' ? 'Estimated 1RM uses the Epley formula on your best set of 1–12 reps each session. It\'s an estimate, not a tested max.' : S.vs.metric === 'volume' ? 'Volume is weight × reps added up across the session.' : S.vs.metric === 'top' ? 'The heaviest weight you lifted each session.' : 'The most reps you did in one set each session.') + '</p></section>';

    html += '<section class="panel-card"><h3>Personal records</h3>' +
      '<div class="frow"><span>Heaviest weight</span><b>' + (st.heaviest ? esc(fmtSet(st.heaviest.kg, st.heaviest.reps)) + '<small>' + esc(shortDate(st.heaviest.date)) + '</small>' : '—') + '</b></div>' +
      '<div class="frow"><span>Best est. 1RM</span><b>' + (st.bestE1rm ? esc(fmtW(st.bestE1rm.kg)) + '<small>' + esc(shortDate(st.bestE1rm.date)) + '</small>' : '—') + '</b></div>' +
      '<div class="frow"><span>Highest-volume session</span><b>' + (st.bestVolume ? esc(fmtVol(st.bestVolume.kg)) + '<small>' + esc(shortDate(st.bestVolume.date)) + '</small>' : '—') + '</b></div>' +
      '<div class="frow"><span>Most reps in a set</span><b>' + (st.mostReps ? st.mostReps.reps + '<small>' + esc(shortDate(st.mostReps.date)) + '</small>' : '—') + '</b></div></section>';

    html += '<h2 class="section-title">Sessions</h2><section class="panel-card tight"><ul class="dlist">' + st.list.slice().reverse().map(sessionRow).join('') + '</ul></section>';
    requestAnimationFrame(S.drawChart);
    return html;
  }
  const sessionRow = (s, withName) => '<li><button type="button" class="drow' + (flashKey() === s.key ? ' st-flash' : '') + '" data-action="st-session" data-key="' + s.key + '"><span class="dname">' + (withName === true ? esc(s.name) : esc(longDate(s.date))) + prTag(s) +
    '<small>' + esc(S.setsText(s.sets)) + '</small>' + (s.notes ? '<small>' + esc(s.notes) + '</small>' : '') + '</span><span class="dval">' + (s.volume ? esc(fmtVol(s.volume)) : esc(s.reps + ' reps')) + '</span><span class="chev">' + icon.next + '</span></button></li>';

  function historyTab() {
    const v = S.vs;
    let html = head('history');
    const all = S.history().list;
    if (!all.length) return html + '<section class="empty"><h2>No sessions yet</h2><p>Every lift you log shows up here, newest first.</p><button type="button" class="btn btn-primary btn-lg" data-action="st-log">' + icon.plus + '<span>Log a lift</span></button></section>';
    const used = D().exercises.filter((e) => all.some((s) => s.exId === e.id)).sort((a, b) => a.name.localeCompare(b.name));
    if (v.hEx && !used.some((e) => e.id === v.hEx)) v.hEx = '';
    html += '<section class="panel-card st-filters"><label class="field"><span class="label">Exercise</span><select id="st-hex"><option value="">All exercises</option>' + used.map((e) => '<option value="' + e.id + '"' + (e.id === v.hEx ? ' selected' : '') + '>' + esc(e.name) + '</option>').join('') + '</select></label>' +
      '<div class="row2"><label class="field"><span class="label">From</span><input id="st-hfrom" type="date" value="' + esc(v.hFrom) + '" max="' + HT.today() + '"></label><label class="field"><span class="label">To</span><input id="st-hto" type="date" value="' + esc(v.hTo) + '" max="' + HT.today() + '"></label></div>' +
      (v.hEx || v.hFrom || v.hTo ? '<button type="button" class="linkish" data-action="st-hclear">Clear filters</button>' : '') + '</section>';
    const list = all.filter((s) => (!v.hEx || s.exId === v.hEx) && (!v.hFrom || s.date >= v.hFrom) && (!v.hTo || s.date <= v.hTo)).reverse();
    if (!list.length) return html + '<p class="note center">No sessions match these filters.</p>';
    const shown = list.slice(0, v.hLimit);
    html += '<p class="hint gap-bottom">' + plural(list.length, 'session') + ' · ' + fmtVol(list.reduce((a, s) => a + s.volume, 0)) + ' volume</p>';
    let day = null, open = false;
    shown.forEach((s) => {
      if (s.date !== day) {
        if (open) html += '</ul></section>';
        day = s.date;
        html += '<h2 class="section-title">' + esc(longDate(s.date)) + '</h2><section class="panel-card tight"><ul class="dlist">';
        open = true;
      }
      html += sessionRow(s, true);
    });
    if (open) html += '</ul></section>';
    if (list.length > shown.length) html += '<button type="button" class="btn wide gap-top" data-action="st-hmore">Show more (' + (list.length - shown.length) + ' older)</button>';
    return html;
  }

  function recordsTab() {
    let html = head('records');
    const { list, events } = S.history();
    if (!list.length) return html + '<section class="empty"><div class="empty-mark">' + icon.trophy + '</div><h2>No records yet</h2><p>Log a few sessions. Each time you beat an earlier one, it shows up here.</p></section>';
    const since = HT.addDays(HT.today(), -30);
    const fresh = events.filter((e) => e.s.date >= since).reverse();
    html += '<h2 class="section-title">New in the last 30 days</h2>' + (fresh.length ? '<section class="panel-card tight"><ul class="dlist">' + fresh.slice(0, 12).map(prRow).join('') + '</ul></section>' : '<section class="panel-card"><p class="muted">No new records in the last 30 days.</p></section>');
    html += '<h2 class="section-title">All-time bests</h2>';
    D().exercises.map((e) => ({ e, st: S.stats(e.id) })).filter((x) => x.st).sort((a, b) => a.e.name.localeCompare(b.e.name)).forEach((x) => {
      const st = x.st;
      html += '<a class="panel-card st-rec" href="' + exLink(x.e.id) + '"><div class="st-rec-h"><b>' + esc(x.e.name) + '</b><span class="chev">' + icon.next + '</span></div><div class="st-rec-g">' +
        '<div><span>Heaviest</span><b>' + (st.heaviest ? esc(fmtSet(st.heaviest.kg, st.heaviest.reps)) : '—') + '</b></div>' +
        '<div><span>Best est. 1RM</span><b>' + (st.bestE1rm ? esc(fmtW(st.bestE1rm.kg)) : '—') + '</b></div>' +
        '<div><span>Most reps</span><b>' + (st.mostReps ? st.mostReps.reps : '—') + '</b></div>' +
        '<div><span>Top volume</span><b>' + (st.bestVolume ? esc(fmtVol(st.bestVolume.kg)) : '—') + '</b></div></div></a>';
    });
    return html;
  }

  let lastArg = null;
  window.addEventListener('hashchange', () => { if (location.hash.indexOf('#/strength') !== 0) lastArg = null; });
  HT.views.strength = (arg) => {
    let html = !arg ? overview() : arg === 'exercises' ? exercisesTab() : arg === 'history' ? historyTab() : arg === 'records' ? recordsTab() : exercisePage(arg);
    // A new personal record gets a banner under the tabs for a few seconds after saving.
    const fk = flashKey();
    const fs = fk ? S.history().list.find((s) => s.key === fk && s.prs.length) : null;
    if (fs) {
      const banner = '<div class="st-prbanner" role="status">' + icon.trophy + '<div><b>New personal record · ' + esc(fs.name) + '</b><span>' + esc(fs.prs.map((k) => S.PR_LABEL[k] + ' ' + S.prValue({ type: k, value: k === 'e1rm' ? fs.e1rm : k === 'volume' ? fs.volume : k === 'reps' ? fs.maxReps : fs.top, s: fs })).join(' · ')) + '</span></div></div>';
      const exh = html.indexOf('<div class="st-exhead">'), seg = html.indexOf('class="segmented gap-bottom"');
      const at = exh >= 0 ? exh : seg >= 0 ? html.indexOf('</div>', seg) + 6 : 0;
      html = html.slice(0, at) + banner + html.slice(at);
    }
    // Fade in only when arriving on a screen, not on every re-render (filters, chart toggles).
    const enter = lastArg !== (arg || '');
    lastArg = arg || '';
    return '<div class="st-page' + (enter ? ' st-enter' : '') + '">' + html + '</div>';
  };

  /* ---------- chart ---------- */

  S.series = (exId, metric, from) => {
    const byDay = new Map();
    S.history(exId).list.forEach((s) => {
      if (from && s.date < from) return;
      const v = metric === 'e1rm' ? s.e1rm : metric === 'top' ? s.top : metric === 'volume' ? (s.volume || null) : s.maxReps;
      if (v == null) return;
      const d = byDay.get(s.date);
      if (!d || v > d.v) byDay.set(s.date, { date: s.date, v, s });
    });
    return Array.from(byDay.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
  };
  const rangeFrom = () => { const r = RANGES.find((x) => x[0] === S.vs.range) || RANGES[1]; return r[1] ? HT.addDays(HT.today(), -r[1] + 1) : ''; };
  const fmtMetric = (metric, v) => (metric === 'reps' ? v + ' reps' : metric === 'volume' ? fmtVol(v) : fmtW(v));

  S.drawChart = () => {
    const box = HT.$('#st-chart');
    if (!box) return;
    const exId = box.dataset.ex, metric = S.vs.metric;
    const all = S.series(exId, metric, '');
    const pts = S.series(exId, metric, rangeFrom());
    if (pts.length < 2) {
      box.innerHTML = '<p class="note">' + (all.length < 2 ? (all.length ? 'Log this exercise on one more day to see a chart.' : 'No sessions with this measure yet.') : 'Fewer than two sessions in this period — pick a longer range.') + '</p>';
      return;
    }
    const AX = 48;
    const cw = Math.max(120, box.clientWidth - AX);
    const Wd = Math.max(cw, pts.length * 28);
    const Hh = window.innerWidth >= 900 ? 280 : 210, padT = 14, padB = 26, padX = 14;
    const vals = pts.map((p) => (metric === 'reps' ? p.v : toU(p.v)));
    let lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    const pad = Math.max(1, (hi - lo) * 0.15);
    lo = Math.max(0, lo - pad); hi += pad;
    const t0 = HT.parseKey(pts[0].date).getTime(), span = Math.max(1, HT.parseKey(pts[pts.length - 1].date).getTime() - t0);
    const X = (key) => padX + (Wd - 2 * padX) * ((HT.parseKey(key).getTime() - t0) / span);
    const Y = (v) => padT + (Hh - padT - padB) * (1 - (v - lo) / (hi - lo));
    const xy = pts.map((p, i) => [X(p.date), Y(vals[i])]);
    let line = 'M' + xy.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
    const base = Hh - padB;
    const area = line + ' L' + xy[xy.length - 1][0].toFixed(1) + ' ' + base + ' L' + xy[0][0].toFixed(1) + ' ' + base + ' Z';
    let grid = '', axis = '';
    for (let i = 0; i < 4; i++) {
      const v = lo + ((hi - lo) * i) / 3, y = Y(v);
      grid += '<line class="wc-grid" x1="0" x2="' + Wd + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>';
      axis += '<span style="top:' + y.toFixed(1) + 'px">' + (Math.abs(v) >= 1000 ? Math.round(v / 100) / 10 + 'k' : Math.round(v)) + '</span>';
    }
    let labels = '', lastX = 1e9;
    xy.slice().reverse().forEach((p, r) => {
      const i = xy.length - 1 - r;
      if (lastX - p[0] < 62) return;
      lastX = p[0];
      const anchor = p[0] < 24 ? 'start' : p[0] > Wd - 24 ? 'end' : 'middle';
      labels += '<text class="wc-x" x="' + p[0].toFixed(1) + '" y="' + (Hh - 7) + '" text-anchor="' + anchor + '">' + shortDate(pts[i].date) + '</text>';
    });
    const sel = S.vs.sel != null && pts[S.vs.sel] ? S.vs.sel : pts.length - 1;
    const dots = xy.map((p, i) => '<circle class="wc-dot' + (pts[i].s.prs.length ? ' st-prdot' : '') + (i === sel ? ' sel' : '') + '" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (i === sel ? 5.5 : 3.5) + '"/>' +
      '<circle class="wc-hit" data-i="' + i + '" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="14"/>').join('');
    const readout = (i) => { const p = pts[i]; return '<b>' + esc(fmtMetric(metric, p.v)) + '</b> · ' + esc(longDate(p.date)) + ' · ' + esc(S.setsText(p.s.sets)) + (p.s.prs.length ? ' · PR' : ''); };
    const firstV = pts[0].v, lastV = pts[pts.length - 1].v;
    const change = firstV ? ((lastV - firstV) / firstV) * 100 : null;
    box.innerHTML = '<div class="wc-read" id="st-read" aria-live="polite">' + readout(sel) + '</div><div class="wc-wrap" style="height:' + Hh + 'px"><div class="wc-axis" style="width:' + AX + 'px">' + axis + '</div>' +
      '<div class="wc-scroll"><svg width="' + Wd + '" height="' + Hh + '" viewBox="0 0 ' + Wd + ' ' + Hh + '" role="img" aria-label="' + esc((METRICS.find((m) => m[0] === metric) || ['', ''])[1]) + ' over time, ' + pts.length + ' sessions">' +
      grid + '<path class="wc-area" d="' + area + '"/><path class="wc-line" d="' + line + '"/>' + dots + labels + '</svg></div></div>' +
      '<div class="legend"><span>' + (metric === 'reps' ? 'Reps' : metric === 'volume' ? 'Volume (' + unit() + ')' : 'Weight (' + unit() + ')') + ' · ' + plural(pts.length, 'session') + '</span>' +
      (change != null ? '<span class="st-pct ' + pctCls(change) + '">' + pct(change) + ' in this period</span>' : '') + '<span><i class="lg st-lg-pr"></i>Personal record</span>' + (Wd > cw ? '<span>Scroll sideways for more</span>' : '') + '</div>';
    const scroller = HT.$('.wc-scroll', box);
    scroller.scrollLeft = scroller.scrollWidth;
    const pick = (e) => {
      const hit = e.target.closest && e.target.closest('.wc-hit');
      if (!hit) return;
      const i = +hit.dataset.i;
      S.vs.sel = i;
      HT.$$('.wc-dot', box).forEach((d, n) => { d.classList.toggle('sel', n === i); d.setAttribute('r', n === i ? 5.5 : 3.5); });
      HT.$('#st-read', box).innerHTML = readout(i);
    };
    scroller.addEventListener('click', pick);
    scroller.addEventListener('pointerover', pick);
  };
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (HT.route && HT.route.name === 'strength') S.drawChart(); }, 150);
  });

  /* ---------- actions ---------- */

  HT.actions['st-log'] = () => S.openPicker();
  HT.actions['st-log-ex'] = (el) => S.openLog(el.dataset.id);
  HT.actions['st-ex-new'] = () => S.openExerciseForm(null);
  HT.actions['st-ex-edit'] = (el) => { const ex = S.exercise(el.dataset.id); if (ex) S.openExerciseForm(ex); };
  HT.actions['st-session'] = (el) => S.openSession(el.dataset.key);
  HT.actions['st-metric'] = (el) => { S.vs.metric = el.dataset.v; S.vs.sel = null; HT.render(); };
  HT.actions['st-range'] = (el) => { S.vs.range = el.dataset.v; S.vs.sel = null; HT.render(); };
  HT.actions['st-hmore'] = () => { S.vs.hLimit += 40; HT.render(); };
  HT.actions['st-hclear'] = () => { S.vs.hEx = ''; S.vs.hFrom = ''; S.vs.hTo = ''; HT.render(); };
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!t || !t.id || !HT.route || HT.route.name !== 'strength') return;
    if (t.id === 'st-hex') { S.vs.hEx = t.value; S.vs.hLimit = 40; HT.render(); }
    else if (t.id === 'st-hfrom' || t.id === 'st-hto') {
      if (t.value && !HT.isDateKey(t.value)) return;
      S.vs[t.id === 'st-hfrom' ? 'hFrom' : 'hTo'] = t.value;
      if (S.vs.hFrom && S.vs.hTo && S.vs.hFrom > S.vs.hTo) { HT.toast('"From" is after "To" — swapped them'); const x = S.vs.hFrom; S.vs.hFrom = S.vs.hTo; S.vs.hTo = x; }
      S.vs.hLimit = 40;
      HT.render();
    }
  });
})();
