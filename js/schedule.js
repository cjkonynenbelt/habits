/* Habits — Schedule: calendar events and tasks, plus an activity timeline. Self-contained like the other
   modules. It owns one small store (HT.data.schedule.events). Everything else it shows — habits, workouts,
   meals, weigh-ins, supplements, daily metrics, money — is read straight from the existing logs, never copied.

   Hooks used elsewhere: HT.normalizeSchedule (storage), S.activity (History / Home), S.agendaWidget and
   S.recentWidget (Home dashboard), S.head (Schedule pages). */
(function () {
  'use strict';
  const HT = window.HT;
  const esc = HT.esc, icon = HT.icon;
  const S = (HT.schedule = {});
  const D = () => HT.data.schedule;

  const sid = () => 'ev' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const str = (v, max) => String(v == null ? '' : v).slice(0, max || 120);
  const arr = (v) => (Array.isArray(v) ? v : []);
  const isTime = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const longDate = (key) => HT.parseKey(key).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const shortDay = (key) => HT.parseKey(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const monthLabel = (ym) => new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const shiftMonth = (ym, n) => HT.dateKey(new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)).slice(0, 7);
  const fmtTime = (hm) => {
    if (!hm) return '';
    const d = new Date(2000, 0, 1, +hm.slice(0, 2), +hm.slice(3, 5));
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };
  S.fmtTime = fmtTime;
  const nowHM = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

  /* ---------- storage ---------- */

  const normEvent = (e) => {
    const kind = e.kind === 'task' ? 'task' : 'event';
    const time = isTime(e.time) ? e.time : '';
    const end = time && isTime(e.end) && e.end > time ? e.end : '';
    return {
      id: str(e.id, 40) || sid(), title: str(e.title, 120).trim(), kind, date: e.date, time, end,
      notes: str(e.notes, 500), priority: !!e.priority,
      done: kind === 'task' && !!e.done, doneAt: kind === 'task' && e.done && typeof e.doneAt === 'string' ? e.doneAt : null,
      createdAt: typeof e.createdAt === 'string' ? e.createdAt : new Date().toISOString(),
    };
  };
  const order = (a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : (a.time || '') < (b.time || '') ? -1 : (a.time || '') > (b.time || '') ? 1 : a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);
  HT.normalizeSchedule = (raw) => {
    const r = raw && typeof raw === 'object' ? raw : {};
    const events = arr(r.events).filter((e) => e && typeof e === 'object' && HT.isDateKey(e.date) && str(e.title).trim()).map(normEvent).sort(order);
    return { events };
  };
  S.normEvent = normEvent;

  /* ---------- queries + changes ---------- */

  S.event = (id) => D().events.find((e) => e.id === id);
  S.on = (key) => D().events.filter((e) => e.date === key).sort(order);
  S.between = (from, to) => D().events.filter((e) => e.date >= from && e.date <= to).sort(order);
  /* Next events and open tasks from today on. */
  S.upcoming = (days, limit) => {
    const today = HT.today(), to = HT.addDays(today, days || 14);
    return D().events.filter((e) => e.date >= today && e.date <= to && !e.done).sort(order).slice(0, limit || 8);
  };
  /* Today's priorities: flagged items today, then open tasks today, then overdue open tasks. */
  S.priorities = (key) => {
    key = key || HT.today();
    const today = D().events.filter((e) => e.date === key && (e.priority || e.kind === 'task'));
    const overdue = key === HT.today() ? D().events.filter((e) => e.kind === 'task' && !e.done && e.date < key) : [];
    return today.sort((a, b) => (a.done - b.done) || (b.priority - a.priority) || order(a, b)).concat(overdue.sort(order));
  };
  S.tasksOn = (key) => { const t = D().events.filter((e) => e.date === key && e.kind === 'task'); return { total: t.length, done: t.filter((e) => e.done).length }; };
  S.save = (fields, existing) => {
    const clean = normEvent(Object.assign({}, existing || {}, fields));
    if (existing) Object.assign(existing, clean);
    else D().events.push(clean);
    D().events.sort(order);
    HT.save();
    return existing || clean;
  };
  S.remove = (id) => { D().events = D().events.filter((e) => e.id !== id); HT.save(); };
  S.toggleDone = (id) => {
    const e = S.event(id);
    if (!e || e.kind !== 'task') return null;
    e.done = !e.done;
    e.doneAt = e.done ? new Date().toISOString() : null;
    HT.save();
    return e;
  };

  /* ---------- activity from the existing logs ---------- */

  S.CATS = [
    ['habits', 'Habits', '✅'], ['tasks', 'Tasks & events', '📌'], ['workouts', 'Workouts', '🏋️'], ['nutrition', 'Meals', '🍽️'],
    ['weight', 'Weight', '⚖️'], ['supplements', 'Supplements', '💊'], ['daily', 'Daily log', '💧'], ['finance', 'Money', '💰'],
  ];
  /* Every logged thing in [from, to], newest first. Each item: { cat, date, time, title, sub, go } where
     `go` is the screen to open ({ route, date }). Nothing here is stored — it's read from each module. */
  S.activity = (from, to, cats) => {
    const want = (c) => !cats || cats.includes(c);
    const out = [];
    const push = (o) => out.push(o);
    if (want('habits')) {
      Object.keys(HT.data.entries).forEach((k) => {
        if (k < from || k > to) return;
        Object.keys(HT.data.entries[k]).forEach((id) => {
          const t = HT.tracker(id);
          if (!t) return;
          const v = HT.value(t, k), done = HT.isDone(t, k);
          push({ cat: 'habits', date: k, time: '', title: t.icon + ' ' + t.name, sub: done ? (HT.typeOf(t).mode === 'toggle' ? 'Completed' : 'Completed · ' + HT.fmtProgress(t, v)) : HT.fmtProgress(t, v), done, go: { route: '#/tracker/' + t.id } });
        });
      });
    }
    if (want('tasks')) {
      D().events.forEach((e) => {
        if (e.date < from || e.date > to) return;
        if (e.kind === 'task' && !e.done) return; // open tasks are plans, not activity
        if (e.kind === 'event' && (e.date > HT.today() || (e.date === HT.today() && e.time && e.time > nowHM()))) return; // not happened yet
        push({ cat: 'tasks', date: e.date, time: e.time, title: (e.kind === 'task' ? '☑️ ' : '📌 ') + e.title, sub: e.kind === 'task' ? 'Task completed' : (e.time ? fmtTime(e.time) + (e.end ? '–' + fmtTime(e.end) : '') : 'All day') + ' · event', done: e.kind === 'task', go: { route: '#/schedule', date: e.date, ev: e.id } });
      });
    }
    const H = HT.health, hd = HT.data.health;
    if (H && hd) {
      if (want('workouts')) hd.workouts.forEach((w) => {
        if (w.date < from || w.date > to) return;
        push({ cat: 'workouts', date: w.date, time: w.time, title: H.wtypeIcon(w.type) + ' ' + H.workoutTitle(w), sub: H.workoutLine(w), go: { route: '#/health/workouts' } });
      });
      if (want('supplements')) Object.keys(hd.intake).forEach((k) => {
        if (k < from || k > to) return;
        Object.keys(hd.intake[k]).forEach((id) => {
          const e = hd.intake[k][id], r = hd.routines.find((x) => x.id === id);
          if (!r || e.s !== 'taken') return;
          push({ cat: 'supplements', date: k, time: '', title: '💊 ' + r.name, sub: 'Taken' + (r.serving ? ' · ' + r.serving : ''), go: { route: '#/health/supplements', date: k } });
        });
      });
      if (want('daily')) Object.keys(hd.daily).forEach((k) => {
        if (k < from || k > to) return;
        Object.keys(hd.daily[k]).forEach((id) => {
          const m = H.metric(id);
          if (!m) return;
          push({ cat: 'daily', date: k, time: '', title: (m.icon || '•') + ' ' + m.name, sub: H.fmtMetric(m, k), go: { route: '#/health/daily', date: k } });
        });
      });
    }
    if (want('nutrition') && HT.nutrition && HT.data.nutrition) {
      const N = HT.nutrition, groups = {};
      HT.data.nutrition.entries.forEach((e) => { if (e.date >= from && e.date <= to) (groups[e.date + '|' + e.meal] = groups[e.date + '|' + e.meal] || []).push(e); });
      Object.keys(groups).forEach((g) => {
        const list = groups[g], tot = N.total(list), meal = HT.data.nutrition.meals.find((m) => m.id === list[0].meal);
        const times = list.map((e) => e.time).filter(Boolean).sort();
        push({ cat: 'nutrition', date: list[0].date, time: times[0] || '', title: '🍽️ ' + (meal ? meal.name : 'Meal'), sub: plural(list.length, 'item') + ' · ' + N.fmtN('kcal', tot.n.kcal || 0) + (tot.n.protein != null ? ' · ' + N.fmtN('protein', tot.n.protein) + ' protein' : ''), go: { route: '#/nutrition', date: list[0].date } });
      });
    }
    if (want('weight') && HT.weight && HT.data.weight) {
      HT.data.weight.entries.forEach((e) => {
        if (e.date < from || e.date > to) return;
        push({ cat: 'weight', date: e.date, time: e.time || '', title: '⚖️ Weigh-in', sub: HT.weight.fmt(e.kg) + (e.note ? ' · ' + e.note : ''), go: { route: '#/weight' } });
      });
    }
    if (want('finance') && HT.finance && HT.data.finance) {
      HT.data.finance.transactions.forEach((t) => {
        if (t.date < from || t.date > to) return;
        const label = t.type === 'income' ? 'Income' : t.type === 'expense' ? 'Expense' : 'Saved to goal';
        push({ cat: 'finance', date: t.date, time: '', title: (t.type === 'income' ? '💵 ' : t.type === 'expense' ? '🧾 ' : '🏦 ') + (t.source || t.category || label), sub: label + ' · ' + HT.finance.money(t.amount) + (t.category && t.source ? ' · ' + t.category : ''), go: { route: '#/finance/activity' } });
      });
    }
    // Newest first; within a day, timed items by time (latest first), untimed after them.
    return out.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : (b.time || '') < (a.time || '') ? -1 : (b.time || '') > (a.time || '') ? 1 : 0));
  };
  /* Opens the screen an activity row points at, on that row's day where the screen supports it. */
  HT.actions['sc-go'] = (el) => {
    const route = el.dataset.route, date = el.dataset.date;
    if (date) {
      if (route === '#/nutrition' && HT.nutrition) HT.nutrition.vs.day = date;
      if (route === '#/health/daily' && HT.health) HT.health.vs.day = date;
      if (route === '#/health/supplements' && HT.health) HT.health.vs.suppDay = date;
      if (route === '#/schedule') { S.vs.date = date; S.vs.month = date.slice(0, 7); S.vs.mode = 'day'; }
      if (route === '#/schedule/history') { HT.vs.histDate = date; HT.vs.histMonth = date.slice(0, 7); }
    }
    if (location.hash === route) HT.render(); else location.hash = route;
  };
  const actRow = (a, showDate) => '<li><button type="button" class="act-row" data-action="sc-go" data-route="' + esc(a.go.route) + '"' + (a.go.date ? ' data-date="' + a.go.date + '"' : '') + '>' +
    '<span class="act-time">' + (a.time ? esc(fmtTime(a.time)) : showDate ? '' : '<span class="act-nt">Any time</span>') + (showDate ? '<small>' + esc(shortDay(a.date)) + '</small>' : '') + '</span>' +
    '<span class="act-main"><span class="act-title">' + esc(a.title) + '</span><span class="act-sub">' + esc(a.sub) + '</span></span><span class="chev">' + icon.next + '</span></button></li>';
  S.actRow = actRow;

  /* Activity for one day (used by History), optionally without some categories. */
  S.dayActivity = (key, exclude) => {
    const cats = S.CATS.map((c) => c[0]).filter((c) => !(exclude || []).includes(c));
    const list = S.activity(key, key, cats);
    if (!list.length) return '';
    return '<section class="panel-card"><h3>Also logged this day</h3><ul class="act-list">' + list.map((a) => actRow(a, false)).join('') + '</ul></section>';
  };

  /* ---------- event / task sheet ---------- */

  S.openEvent = (existing, preset) => {
    const e = existing || Object.assign({ title: '', kind: 'event', date: S.vs.date || HT.today(), time: '', end: '', notes: '', priority: false }, preset || {});
    let kind = e.kind;
    const allDay = !e.time;
    const html = '<div class="segmented gap-bottom" id="ev-kind"><button type="button" data-k="event" aria-pressed="' + (kind === 'event') + '">Event</button><button type="button" data-k="task" aria-pressed="' + (kind === 'task') + '">Task</button></div>' +
      '<label class="field"><span class="label">Title</span><input id="ev-title" type="text" maxlength="120" autocomplete="off" placeholder="' + (kind === 'task' ? 'e.g. Call the bank' : 'e.g. Dentist') + '" value="' + esc(e.title) + '"></label>' +
      '<label class="field"><span class="label">Date</span><input id="ev-date" type="date" value="' + e.date + '"></label>' +
      '<div class="switch-row"><div><div class="sw-title">All day</div><div class="hint">Turn off to set a time.</div></div><label class="switch"><input type="checkbox" id="ev-allday"' + (allDay ? ' checked' : '') + '><span></span></label></div>' +
      '<div class="row2" id="ev-times"' + (allDay ? ' hidden' : '') + '><label class="field"><span class="label">Starts</span><input id="ev-time" type="time" value="' + (e.time || '09:00') + '"></label>' +
      '<label class="field"><span class="label">Ends <em>optional</em></span><input id="ev-end" type="time" value="' + (e.end || '') + '"></label></div>' +
      '<div class="switch-row"><div><div class="sw-title">Priority</div><div class="hint">Shows under Today\'s priorities on Home.</div></div><label class="switch"><input type="checkbox" id="ev-pri"' + (e.priority ? ' checked' : '') + '><span></span></label></div>' +
      '<label class="field"><span class="label">Notes <em>optional</em></span><textarea id="ev-notes" rows="3" maxlength="500">' + esc(e.notes) + '</textarea></label>' +
      (existing && existing.kind === 'task' ? '<p class="hint">' + (existing.done ? 'Completed' + (existing.doneAt ? ' ' + esc(new Date(existing.doneAt).toLocaleDateString()) : '') : 'Not done yet') + '</p>' : '');
    HT.openSheet({
      title: existing ? (existing.kind === 'task' ? 'Edit task' : 'Edit event') : 'New ' + kind,
      kind: 'sheet tall',
      html,
      footer: (existing ? '<button type="button" class="btn btn-danger-ghost" data-del>Delete</button>' : '<button type="button" class="btn" data-close>Cancel</button>') +
        '<button type="button" class="btn btn-primary" data-save>' + (existing ? 'Save' : 'Add') + '</button>',
      onMount: (wrap, close) => {
        const $ = (s) => HT.$(s, wrap);
        wrap.addEventListener('change', (ev) => { if (ev.target.id === 'ev-allday') $('#ev-times').hidden = ev.target.checked; });
        wrap.addEventListener('click', async (ev) => {
          const k = ev.target.closest('#ev-kind [data-k]');
          if (k) { kind = k.dataset.k; HT.$$('#ev-kind [data-k]', wrap).forEach((b) => b.setAttribute('aria-pressed', b === k)); $('#ev-title').placeholder = kind === 'task' ? 'e.g. Call the bank' : 'e.g. Dentist'; return; }
          if (ev.target.closest('[data-del]')) {
            const ok = await HT.confirm({ title: 'Delete ' + existing.kind + '?', message: 'Delete <b>' + esc(existing.title) + '</b> on ' + esc(longDate(existing.date)) + '? This can\'t be undone.', confirmLabel: 'Delete', danger: true });
            if (!ok) return;
            S.remove(existing.id);
            close();
            HT.toast((existing.kind === 'task' ? 'Task' : 'Event') + ' deleted');
            HT.render();
            return;
          }
          if (!ev.target.closest('[data-save]')) return;
          const title = $('#ev-title').value.trim();
          if (!title) { HT.toast('Give it a title'); $('#ev-title').focus(); return; }
          const date = $('#ev-date').value;
          if (!HT.isDateKey(date)) { HT.toast('Pick a date'); return; }
          const timed = !$('#ev-allday').checked;
          const time = timed ? $('#ev-time').value : '', end = timed ? $('#ev-end').value : '';
          if (timed && !isTime(time)) { HT.toast('Pick a start time, or switch on All day'); return; }
          if (end && end <= time) { HT.toast('The end time must be after the start'); return; }
          const fields = { title, kind, date, time, end, priority: $('#ev-pri').checked, notes: $('#ev-notes').value.trim() };
          if (kind === 'event') { fields.done = false; fields.doneAt = null; }
          S.save(fields, existing);
          close();
          HT.toast(existing ? 'Saved' : (kind === 'task' ? 'Task' : 'Event') + ' added for ' + (date === HT.today() ? 'today' : shortDay(date)));
          HT.render();
        });
        wrap.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.tagName === 'INPUT' && ev.target.type !== 'checkbox') HT.$('[data-save]', wrap).click(); });
      },
    });
  };

  /* ---------- shared pieces ---------- */

  S.vs = { tab: '', mode: 'month', date: null, month: null, tlRange: 'week', tlDate: null, cats: null };
  const TABS = [['', 'Calendar'], ['timeline', 'Timeline'], ['history', 'History']];
  S.head = (cur) => '<header class="page-head"><div><div class="eyebrow">Schedule</div><h1>' + (cur === 'timeline' ? 'Activity timeline' : cur === 'history' ? 'History' : 'Calendar') + '</h1></div>' +
    '<button type="button" class="btn btn-primary" data-action="sc-new">' + icon.plus + '<span>Add</span></button></header>' +
    '<nav class="segmented gap-bottom" aria-label="Schedule sections">' + TABS.map((t) => '<a href="#/schedule' + (t[0] ? '/' + t[0] : '') + '"' + (t[0] === cur ? ' aria-current="page"' : '') + '>' + t[1] + '</a>').join('') + '</nav>';

  const evRow = (e, opts) => {
    opts = opts || {};
    const overdue = e.kind === 'task' && !e.done && e.date < HT.today();
    const when = e.time ? fmtTime(e.time) + (e.end ? '–' + fmtTime(e.end) : '') : e.kind === 'task' ? 'Task' : 'All day';
    return '<li class="ev-row' + (e.done ? ' done' : '') + '" data-id="' + e.id + '">' +
      (e.kind === 'task' ? '<button type="button" class="ev-check" data-action="sc-done" aria-pressed="' + e.done + '" aria-label="' + (e.done ? 'Mark not done: ' : 'Mark done: ') + esc(e.title) + '">' + icon.check + '</button>' : '<span class="ev-dot" aria-hidden="true"></span>') +
      '<button type="button" class="ev-main" data-action="sc-edit"><span class="ev-title">' + esc(e.title) + (e.priority ? ' <span class="tag pri">Priority</span>' : '') + (overdue ? ' <span class="tag late">Overdue</span>' : '') + '</span>' +
      '<span class="ev-sub">' + esc((opts.date ? shortDay(e.date) + ' · ' : '') + when) + (e.notes ? ' · ' + esc(e.notes.slice(0, 60)) : '') + '</span></button></li>';
  };
  S.evRow = evRow;

  HT.actions['sc-new'] = () => S.openEvent(null);
  HT.actions['sc-new-task'] = () => S.openEvent(null, { kind: 'task', date: HT.today() });
  HT.actions['sc-new-on'] = (el) => S.openEvent(null, { date: el.dataset.date });
  HT.actions['sc-edit'] = (el) => { const e = S.event(el.closest('[data-id]').dataset.id); if (e) S.openEvent(e); };
  HT.actions['sc-done'] = (el) => {
    const e = S.toggleDone(el.closest('[data-id]').dataset.id);
    if (!e) return;
    if (e.done && navigator.vibrate) navigator.vibrate(12);
    HT.toast(e.done ? 'Task done' : 'Marked not done');
    HT.render();
  };

  /* ---------- Calendar ---------- */

  function monthGrid(ym, sel) {
    const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
    const ws = HT.data.settings.weekStart;
    const lead = (new Date(y, m - 1, 1).getDay() - ws + 7) % 7;
    const days = new Date(y, m, 0).getDate();
    const today = HT.today();
    const from = ym + '-01', to = ym + '-' + String(days).padStart(2, '0');
    const evs = {};
    S.between(from, to).forEach((e) => { (evs[e.date] = evs[e.date] || []).push(e); });
    let html = '<div class="cal sc-cal"><div class="cal-head"><button type="button" class="icon-btn" data-action="sc-month" data-d="-1" aria-label="Previous month">' + icon.back + '</button>' +
      '<div class="cal-title">' + monthLabel(ym) + '</div><button type="button" class="icon-btn" data-action="sc-month" data-d="1" aria-label="Next month">' + icon.next + '</button></div><div class="cal-grid">';
    for (let i = 0; i < 7; i++) html += '<div class="cal-dow">' + HT.DAY_NAMES[(i + ws) % 7].slice(0, 2) + '</div>';
    for (let i = 0; i < lead; i++) html += '<div></div>';
    for (let d = 1; d <= days; d++) {
      const key = ym + '-' + String(d).padStart(2, '0');
      const list = evs[key] || [];
      const st = key <= today ? HT.dayStatus(key) : 'future';
      html += '<button type="button" class="cal-day sc-day' + (key === today ? ' is-today' : '') + (key === sel ? ' is-sel' : '') + ' h-' + st + '" data-action="sc-day" data-date="' + key + '" aria-label="' + esc(longDate(key)) + (list.length ? ', ' + plural(list.length, 'item') : '') + '">' +
        '<span>' + d + '</span><i class="sc-dots">' + list.slice(0, 3).map((e) => '<b class="' + (e.kind === 'task' ? (e.done ? 'td' : 't') : 'e') + '"></b>').join('') + '</i></button>';
    }
    return html + '</div></div>';
  }
  const dayAgenda = (key) => {
    const list = S.on(key);
    return '<div class="card-head"><h3>' + (key === HT.today() ? 'Today' : esc(longDate(key))) + '</h3><button type="button" class="btn btn-sm" data-action="sc-new-on" data-date="' + key + '">' + icon.plus + '<span>Add</span></button></div>' +
      (list.length ? '<ul class="ev-list">' + list.map((e) => evRow(e)).join('') + '</ul>' : '<p class="muted">Nothing planned.</p>');
  };

  function calendarView() {
    const today = HT.today();
    if (!S.vs.date) S.vs.date = today;
    if (!S.vs.month) S.vs.month = S.vs.date.slice(0, 7);
    const mode = S.vs.mode, key = S.vs.date;
    let html = S.head('') + '<div class="sc-bar"><div class="segmented" role="group" aria-label="Calendar view">' + [['month', 'Month'], ['week', 'Week'], ['day', 'Day']].map((m) => '<button type="button" data-action="sc-mode" data-v="' + m[0] + '" aria-pressed="' + (mode === m[0]) + '">' + m[1] + '</button>').join('') + '</div>' +
      (key !== today || S.vs.month !== today.slice(0, 7) ? '<button type="button" class="btn btn-sm" data-action="sc-today">Today</button>' : '') + '</div>';
    if (mode === 'month') {
      html += '<div class="sc-split"><section class="panel-card">' + monthGrid(S.vs.month, key) +
        '<div class="legend"><span><i class="lg sc-lg-e"></i>Event</span><span><i class="lg sc-lg-t"></i>Task</span><span><i class="lg sc-lg-h"></i>All habits done</span></div></section>' +
        '<div><section class="panel-card">' + dayAgenda(key) + '</section>';
      const up = S.upcoming(30, 9).filter((e) => e.date !== key).slice(0, 8);
      html += '<section class="panel-card"><h3>Upcoming</h3>' + (up.length ? '<ul class="ev-list">' + up.map((e) => evRow(e, { date: true })).join('') + '</ul>' : '<p class="muted">Nothing planned in the next 30 days.</p>') + '</section></div></div>';
      return html;
    }
    if (mode === 'week') {
      const ws = HT.weekStart(key);
      html += '<div class="hday"><button type="button" class="icon-btn" data-action="sc-shift" data-d="-7" aria-label="Previous week">' + icon.back + '</button>' +
        '<div class="hday-l"><b>' + esc(shortDay(ws)) + ' – ' + esc(shortDay(HT.addDays(ws, 6))) + '</b><span>' + (ws === HT.weekStart(today) ? 'This week' : '&nbsp;') + '</span></div>' +
        '<button type="button" class="icon-btn" data-action="sc-shift" data-d="7" aria-label="Next week">' + icon.next + '</button></div><section class="panel-card tight sc-week">';
      for (let i = 0; i < 7; i++) {
        const d = HT.addDays(ws, i), list = S.on(d), s = d <= today ? HT.daySummary(d) : null;
        html += '<div class="sc-wday' + (d === today ? ' is-today' : '') + '"><button type="button" class="sc-wd-l" data-action="sc-day-open" data-date="' + d + '"><b>' + HT.parseKey(d).toLocaleDateString(undefined, { weekday: 'short' }) + '</b><span>' + HT.parseKey(d).getDate() + '</span></button>' +
          '<div class="sc-wd-r">' + (list.length ? '<ul class="ev-list">' + list.map((e) => evRow(e)).join('') + '</ul>' : '<button type="button" class="sc-free" data-action="sc-new-on" data-date="' + d + '">Free · add</button>') +
          (s && s.total ? '<div class="sc-hab">Habits ' + s.done + ' / ' + s.total + '</div>' : '') + '</div></div>';
      }
      return html + '</section>';
    }
    // Day
    html += '<div class="hday"><button type="button" class="icon-btn" data-action="sc-shift" data-d="-1" aria-label="Previous day">' + icon.back + '</button>' +
      '<div class="hday-l"><b>' + (key === today ? 'Today' : esc(longDate(key))) + '</b><span>' + (key === today ? esc(longDate(key)) : '&nbsp;') + '</span></div>' +
      '<button type="button" class="icon-btn" data-action="sc-shift" data-d="1" aria-label="Next day">' + icon.next + '</button></div>' +
      '<section class="panel-card">' + dayAgenda(key) + '</section>';
    if (key <= today) {
      const s = HT.daySummary(key), act = S.activity(key, key, S.CATS.map((c) => c[0]).filter((c) => c !== 'tasks'));
      html += '<section class="panel-card"><div class="card-head"><h3>What you logged</h3><button type="button" class="btn btn-sm" data-action="sc-go" data-route="#/schedule/history" data-date="' + key + '">History</button></div>' +
        (s.total ? '<p class="muted gap-bottom">Habits: ' + s.done + ' of ' + s.total + ' done</p>' : '') +
        (act.length ? '<ul class="act-list">' + act.map((a) => actRow(a, false)).join('') + '</ul>' : '<p class="muted">Nothing logged on this day.</p>') + '</section>';
    }
    return html;
  }
  HT.actions['sc-mode'] = (el) => { S.vs.mode = el.dataset.v; HT.render(); };
  HT.actions['sc-day'] = (el) => { S.vs.date = el.dataset.date; HT.render(); };
  HT.actions['sc-day-open'] = (el) => { S.vs.date = el.dataset.date; S.vs.mode = 'day'; HT.render(); };
  HT.actions['sc-month'] = (el) => { S.vs.month = shiftMonth(S.vs.month, +el.dataset.d); HT.render(); };
  HT.actions['sc-shift'] = (el) => { S.vs.date = HT.addDays(S.vs.date, +el.dataset.d); S.vs.month = S.vs.date.slice(0, 7); HT.render(); };
  HT.actions['sc-today'] = () => { S.vs.date = HT.today(); S.vs.month = S.vs.date.slice(0, 7); HT.render(); };

  /* ---------- Timeline ---------- */

  S.tlBounds = () => {
    const key = S.vs.tlDate || HT.today(), r = S.vs.tlRange;
    if (r === 'day') return { from: key, to: key, label: key === HT.today() ? 'Today' : longDate(key) };
    if (r === 'month') { const from = key.slice(0, 7) + '-01'; return { from, to: HT.monthEnd(from), label: monthLabel(key.slice(0, 7)) }; }
    const from = HT.weekStart(key);
    return { from, to: HT.addDays(from, 6), label: shortDay(from) + ' – ' + shortDay(HT.addDays(from, 6)) };
  };
  function timelineView() {
    const b = S.tlBounds(), today = HT.today();
    const cats = S.vs.cats || S.CATS.map((c) => c[0]);
    const all = S.activity(b.from, b.to > today ? today : b.to);
    const list = all.filter((a) => cats.includes(a.cat));
    const count = {};
    all.forEach((a) => { count[a.cat] = (count[a.cat] || 0) + 1; });
    let html = S.head('timeline') + '<div class="sc-bar"><div class="segmented" role="group" aria-label="Period">' + [['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map((r) => '<button type="button" data-action="sc-tl-range" data-v="' + r[0] + '" aria-pressed="' + (S.vs.tlRange === r[0]) + '">' + r[1] + '</button>').join('') + '</div></div>' +
      '<div class="hday"><button type="button" class="icon-btn" data-action="sc-tl-shift" data-d="-1" aria-label="Previous">' + icon.back + '</button><div class="hday-l"><b>' + esc(b.label) + '</b><span>' + plural(list.length, 'entry').replace('entrys', 'entries') + '</span></div>' +
      '<button type="button" class="icon-btn" data-action="sc-tl-shift" data-d="1" aria-label="Next"' + (b.to >= today ? ' disabled' : '') + '>' + icon.next + '</button></div>' +
      '<div class="chips sc-filters gap-bottom" role="group" aria-label="Show categories">' + S.CATS.map((c) => '<button type="button" class="chip' + (cats.includes(c[0]) ? ' on' : '') + '" data-action="sc-tl-cat" data-v="' + c[0] + '" aria-pressed="' + cats.includes(c[0]) + '">' + c[2] + ' ' + c[1] + (count[c[0]] ? ' <small>' + count[c[0]] + '</small>' : '') + '</button>').join('') + '</div>';
    if (!list.length) return html + '<section class="empty"><h2>' + (all.length ? 'Nothing in the chosen categories' : 'Nothing logged in this period') + '</h2><p>' + (all.length ? 'Turn more categories on above.' : 'Habits, workouts, meals, weigh-ins, supplements, tasks and money you log will appear here in order.') + '</p></section>';
    const byDay = {};
    list.forEach((a) => { (byDay[a.date] = byDay[a.date] || []).push(a); });
    html += Object.keys(byDay).sort().reverse().map((d) => '<h2 class="section-title tl-day">' + esc(d === today ? 'Today' : longDate(d)) + '<small>' + plural(byDay[d].length, 'entry').replace('entrys', 'entries') + '</small></h2>' +
      '<section class="panel-card tight"><ul class="act-list">' + byDay[d].map((a) => actRow(a, false)).join('') + '</ul></section>').join('');
    return html;
  }
  HT.actions['sc-tl-range'] = (el) => { S.vs.tlRange = el.dataset.v; HT.render(); };
  HT.actions['sc-tl-shift'] = (el) => {
    const d = +el.dataset.d, key = S.vs.tlDate || HT.today(), r = S.vs.tlRange;
    let next = r === 'day' ? HT.addDays(key, d) : r === 'week' ? HT.addDays(key, 7 * d) : shiftMonth(key.slice(0, 7), d) + '-01';
    if (next > HT.today()) next = HT.today();
    S.vs.tlDate = next;
    HT.render();
  };
  HT.actions['sc-tl-cat'] = (el) => {
    const all = S.CATS.map((c) => c[0]);
    let cats = S.vs.cats || all.slice();
    const v = el.dataset.v;
    cats = cats.includes(v) ? cats.filter((c) => c !== v) : cats.concat([v]);
    S.vs.cats = cats.length ? cats : all.slice();
    HT.render();
  };

  HT.views.schedule = (tab) => {
    S.vs.tab = tab || '';
    if (tab === 'timeline') return timelineView();
    if (tab === 'history') return HT.views.history();
    return calendarView();
  };

  /* ---------- Home widgets ---------- */

  S.agendaWidget = () => {
    const today = HT.today();
    const pri = S.priorities(today);
    const later = D().events.filter((e) => !e.done && (e.date > today || (e.date === today && !pri.includes(e)))).sort(order).slice(0, 4);
    const inner = '<div class="panel-card tight ag-card">' +
      '<div class="ag-col"><h3>Today\'s priorities</h3>' + (pri.length ? '<ul class="ev-list">' + pri.slice(0, 5).map((e) => evRow(e, { date: e.date !== today })).join('') + '</ul>'
        : '<p class="muted">No priorities set. <button type="button" class="linkish" data-action="sc-new-task">Add a task</button></p>') + '</div>' +
      '<div class="ag-col"><h3>Coming up</h3>' + (later.length ? '<ul class="ev-list">' + later.map((e) => evRow(e, { date: e.date !== today })).join('') + '</ul>' : '<p class="muted">Nothing else planned.</p>') + '</div></div>';
    return '<section class="widget" data-widget="agenda"><div class="widget-h"><h2 class="section-title">Agenda</h2><a class="linkish" href="#/schedule">Calendar</a></div>' + inner + '</section>';
  };
  S.recentWidget = () => {
    const today = HT.today();
    const list = S.activity(HT.addDays(today, -2), today).slice(0, 6);
    if (!list.length) return '';
    return '<section class="widget" data-widget="recent"><div class="widget-h"><h2 class="section-title">Recent activity</h2><a class="linkish" href="#/schedule/timeline">Timeline</a></div>' +
      '<section class="panel-card tight"><ul class="act-list">' + list.map((a) => actRow(a, a.date !== today)).join('') + '</ul></section></section>';
  };
})();
