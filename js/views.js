/* Habits — screens. Each view returns an HTML string; HT.actions holds the click handlers. */
(function () {
  'use strict';
  const HT = window.HT;
  const esc = HT.esc, icon = HT.icon;

  HT.views = {};
  HT.actions = {};
  HT.vs = { histMonth: null, histDate: null, tcalMonth: null }; // view state

  /* ---------- small helpers ---------- */

  const fmtLong = (key) => HT.parseKey(key).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const fmtShort = (key) => HT.parseKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const monthLabel = (ym) => new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const shiftMonth = (ym, n) => {
    const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1);
    return HT.dateKey(d).slice(0, 7);
  };
  const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
  const iconBox = (t) => '<span class="ticon" aria-hidden="true">' + esc(t.icon) + '</span>';
  const tile = (value, label) => '<div class="tile"><div class="tile-v">' + value + '</div><div class="tile-l">' + label + '</div></div>';
  const pageHead = (eyebrow, title, right) =>
    '<header class="page-head"><div><div class="eyebrow">' + eyebrow + '</div><h1>' + title + '</h1></div>' + (right || '') + '</header>';
  const addBtn = '<button type="button" class="btn btn-primary" data-action="add-tracker">' + icon.plus + '<span>Add Tracker</span></button>';

  /* ---------- tracker card (Today + detail) ---------- */

  function quickLabel(t) {
    return '+' + HT.num(HT.stepOf(t)) + (t.type === 'duration' ? 'm' : '');
  }
  function controls(t, key) {
    const mode = HT.typeOf(t).mode;
    if (mode === 'toggle') {
      return '<button type="button" class="check" data-action="toggle" aria-pressed="' + HT.isDone(t, key) + '" aria-label="Toggle ' + esc(t.name) + '">' + icon.check + '</button>';
    }
    if (mode === 'step') {
      return '<button type="button" class="rbtn" data-action="dec" aria-label="Decrease ' + esc(t.name) + '">' + icon.minus + '</button>' +
        '<button type="button" class="rbtn rbtn-fill" data-action="inc" aria-label="Increase ' + esc(t.name) + '">' + icon.plus + '</button>';
    }
    if (mode === 'add') {
      return '<button type="button" class="qbtn" data-action="quick" aria-label="Add ' + esc(HT.fmtValue(t, HT.stepOf(t))) + '">' + quickLabel(t) + '</button>' +
        '<button type="button" class="rbtn" data-action="log" aria-label="Enter amount for ' + esc(t.name) + '">' + icon.edit + '</button>';
    }
    return '<button type="button" class="qbtn" data-action="log">Log</button>';
  }
  function subline(t, key) {
    const st = HT.stats(t);
    return '<span class="tprog">' + (HT.isDone(t, key) ? '<b class="tick">✓</b> ' : '') + esc(HT.fmtProgress(t, HT.value(t, key))) + '</span>' +
      (st.current >= 2 ? '<span class="tstreak">' + icon.flame + st.current + '</span>' : '');
  }
  function card(t, key) {
    return '<li class="tcard' + (HT.isDone(t, key) ? ' done' : '') + '" data-id="' + t.id + '" data-date="' + key + '" style="--c:' + t.color + '">' +
      '<button type="button" class="tmain" data-action="open-tracker">' + iconBox(t) +
      '<span class="tinfo"><span class="tname">' + esc(t.name) + '</span><span class="tsub">' + subline(t, key) + '</span></span></button>' +
      '<div class="tctl" data-nodrag>' + controls(t, key) + '</div>' +
      '<div class="tbar"><i style="width:' + Math.round(HT.progress(t, key) * 100) + '%"></i></div></li>';
  }
  /* Update cards in place so progress bars and checks animate instead of jumping. */
  function patchCards(id, key) {
    const t = HT.tracker(id);
    HT.$$('.tcard[data-id="' + id + '"][data-date="' + key + '"]').forEach((li) => {
      const done = HT.isDone(t, key);
      if (done && !li.classList.contains('done')) {
        li.classList.add('pop');
        setTimeout(() => li.classList.remove('pop'), 450);
      }
      li.classList.toggle('done', done);
      HT.$('.tsub', li).innerHTML = subline(t, key);
      HT.$('.tbar i', li).style.width = Math.round(HT.progress(t, key) * 100) + '%';
      const chk = HT.$('.check', li);
      if (chk) chk.setAttribute('aria-pressed', done);
    });
  }

  /* ---------- Today ---------- */

  const RING = 2 * Math.PI * 30;
  function summaryText(s) {
    return {
      pct: s.total ? s.pct + '%' : '–',
      line: s.total ? s.done + ' / ' + s.total + ' habits completed' : 'No habits scheduled today',
      head: !s.total ? 'Nothing due' : s.done === s.total ? 'All done' : s.pct + '% complete',
    };
  }
  function patchSummary() {
    const box = HT.$('#summary');
    if (!box) return;
    const s = HT.daySummary(HT.today()), tx = summaryText(s);
    HT.$('.ring-fg', box).style.strokeDashoffset = RING * (1 - s.ratio);
    HT.$('.ring-pct', box).textContent = tx.pct;
    HT.$('.sum-head', box).textContent = tx.head;
    HT.$('.sum-line', box).textContent = tx.line;
    HT.$('.sum-bar i', box).style.width = s.ratio * 100 + '%';
    box.classList.toggle('complete', s.total > 0 && s.done === s.total);
  }

  const TEMPLATES = [
    { name: 'Drink water', icon: '💧', color: '#2b7a9e', type: 'quantity', target: 3, unit: 'liters', step: 0.5 },
    { name: 'Workout', icon: '🏋️', color: '#c8474d', type: 'boolean' },
    { name: 'Read', icon: '📖', color: '#7353c4', type: 'duration', target: 30, unit: 'minutes' },
    { name: 'Walk', icon: '🚶', color: '#2f7d5b', type: 'number', target: 10000, unit: 'steps' },
    { name: 'Sleep', icon: '😴', color: '#3d63c9', type: 'time', target: 8, unit: 'hours' },
    { name: 'Sales calls', icon: '📞', color: '#d0722b', type: 'counter', target: 20, unit: 'times' },
    { name: 'Meditate', icon: '🧘', color: '#5d7d2f', type: 'duration', target: 10, unit: 'minutes' },
    { name: 'Take vitamins', icon: '💊', color: '#b24f9a', type: 'boolean' },
  ];
  const templateChips = () =>
    '<div class="chips">' + TEMPLATES.map((tp, i) => '<button type="button" class="chip" data-action="template" data-i="' + i + '">' + tp.icon + ' ' + esc(tp.name) + '</button>').join('') + '</div>';

  HT.views.today = () => {
    const key = HT.today();
    const d = HT.parseKey(key);
    const head = pageHead('Today', d.toLocaleDateString(undefined, { weekday: 'long' }) + ', ' + d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }));
    const addRow = '<button type="button" class="add-row" data-action="add-tracker">' + icon.plus + '<span>Add Tracker</span></button>';

    if (!HT.data.trackers.length) {
      return head + '<section class="empty"><div class="empty-mark">' + icon.today + '</div><h2>Start with one habit</h2>' +
        '<p>Create a tracker for anything you want to do daily — a checkbox, a number, minutes, a counter.</p>' +
        '<button type="button" class="btn btn-primary btn-lg" data-action="add-tracker">' + icon.plus + '<span>Add Tracker</span></button>' +
        '<p class="empty-sub">Or start from an idea</p>' + templateChips() + '</section>';
    }

    let list = HT.sorted().filter((t) => t.status === 'active' && t.startDate <= key);
    const sort = HT.data.settings.sort;
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'incomplete') list.sort((a, b) => HT.isDone(a, key) - HT.isDone(b, key));
    const due = list.filter((t) => HT.isExpected(t, key));
    const off = list.filter((t) => !HT.isExpected(t, key));
    const s = HT.daySummary(key), tx = summaryText(s);

    let html = head +
      '<section class="summary' + (s.total > 0 && s.done === s.total ? ' complete' : '') + '" id="summary">' +
      '<div class="ring"><svg viewBox="0 0 72 72" width="84" height="84"><circle class="ring-bg" cx="36" cy="36" r="30"/>' +
      '<circle class="ring-fg" cx="36" cy="36" r="30" stroke-dasharray="' + RING + '" style="stroke-dashoffset:' + RING * (1 - s.ratio) + '"/></svg>' +
      '<span class="ring-pct">' + tx.pct + '</span></div>' +
      '<div class="sum-text"><div class="sum-head">' + tx.head + '</div><div class="sum-line">' + tx.line + '</div>' +
      '<div class="sum-bar"><i style="width:' + s.ratio * 100 + '%"></i></div></div></section>';

    if (due.length) {
      html += '<ul class="tlist"' + (sort === 'manual' ? ' data-sortable' : '') + '>' + due.map((t) => card(t, key)).join('') + '</ul>';
    } else {
      html += '<p class="note">Nothing is scheduled for today. Enjoy the day off.</p>';
    }
    html += addRow;
    if (off.length) {
      html += '<h2 class="section-title">Not scheduled today</h2><ul class="tlist off">' + off.map((t) => card(t, key)).join('') + '</ul>';
    }
    if (sort === 'manual' && due.length > 1) html += '<p class="hint center">Press and hold a tracker to reorder</p>';
    return html;
  };

  /* ---------- logging ---------- */

  /* Single entry point for every value change, so feedback + refresh stay consistent. */
  HT.log = (t, key, value) => {
    const wasDone = HT.isDone(t, key);
    const dayBefore = HT.daySummary(key);
    HT.setValue(t, key, value);
    if (!wasDone && HT.isDone(t, key)) {
      if (navigator.vibrate) navigator.vibrate(15);
      const s = HT.daySummary(key);
      if (key === HT.today() && s.total && s.done === s.total && dayBefore.done < dayBefore.total) HT.toast('Everything done for today');
    }
    HT.afterLog(t.id, key);
    if (!wasDone && HT.isDone(t, key) && t.financeLink && HT.finance) HT.finance.onHabitDone(t, key);
  };
  HT.afterLog = (id, key) => {
    if (HT.route.name === 'today' && HT.data.settings.sort !== 'incomplete') {
      patchCards(id, key);
      patchSummary();
    } else {
      HT.render();
    }
  };

  const cardCtx = (el) => {
    const li = el.closest('[data-id]');
    return { t: HT.tracker(li.dataset.id), key: li.dataset.date || HT.today() };
  };
  HT.actions['toggle'] = (el) => { const c = cardCtx(el); HT.log(c.t, c.key, HT.isDone(c.t, c.key) ? 0 : 1); };
  HT.actions['inc'] = (el) => { const c = cardCtx(el); HT.log(c.t, c.key, HT.value(c.t, c.key) + HT.stepOf(c.t)); };
  HT.actions['dec'] = (el) => { const c = cardCtx(el); HT.log(c.t, c.key, HT.value(c.t, c.key) - HT.stepOf(c.t)); };
  HT.actions['quick'] = (el) => { const c = cardCtx(el); HT.log(c.t, c.key, HT.value(c.t, c.key) + HT.stepOf(c.t)); };
  HT.actions['log'] = (el) => { const c = cardCtx(el); HT.openLog(c.t, c.key); };
  HT.actions['open-tracker'] = (el) => { location.hash = '#/tracker/' + el.closest('[data-id]').dataset.id; };

  HT.openLog = (t, key) => {
    const ty = HT.typeOf(t);
    const additive = ty.mode === 'add' || ty.mode === 'step';
    const step = HT.stepOf(t);
    const unitName = ty.id === 'duration' ? 'minutes' : t.unit || 'amount';
    let mode = additive ? 'add' : 'set';
    let body = '<div class="log-now" style="--c:' + t.color + '">' + iconBox(t) +
      '<div><div class="log-val" id="log-val"></div><div class="muted">' + (key === HT.today() ? 'Today' : esc(fmtLong(key))) + '</div></div></div>';

    if (ty.input === 'hm') {
      body += '<div class="row2"><label class="field"><span class="label">Hours</span><input id="log-h" type="number" inputmode="numeric" min="0" max="24" placeholder="0"></label>' +
        '<label class="field"><span class="label">Minutes</span><input id="log-m" type="number" inputmode="numeric" min="0" max="59" placeholder="0"></label></div>';
    } else if (ty.input === 'percent') {
      body += '<input id="log-range" class="range" type="range" min="0" max="100" step="1" aria-label="Percent">' +
        '<label class="field"><span class="label">Percent</span><input id="log-n" type="number" inputmode="decimal" min="0" max="100" step="any"></label>';
    } else {
      if (additive) {
        const mult = ty.mode === 'step' ? [1, 5, 10] : [1, 2, 4];
        body += '<div class="chips">' + mult.map((m) => '<button type="button" class="chip" data-add="' + HT.round(step * m) + '">+' + esc(HT.fmtValue(t, HT.round(step * m))) + '</button>').join('') +
          '<button type="button" class="chip" data-fill>Fill to goal</button></div>' +
          '<div class="segmented" id="log-mode"><button type="button" data-m="add" aria-pressed="true">Add</button><button type="button" data-m="set" aria-pressed="false">Set total</button></div>';
      }
      body += '<label class="field"><span class="label" id="log-label"></span><input id="log-n" type="number" inputmode="decimal" min="0" step="any" placeholder="0"></label>';
    }

    HT.openSheet({
      title: t.name,
      html: body,
      footer: '<button type="button" class="btn" data-clear>Clear</button><button type="button" class="btn btn-primary" data-save>Save</button>',
      onMount: (wrap, close) => {
        const $ = (s) => HT.$(s, wrap);
        const n = $('#log-n'), label = $('#log-label');
        const show = () => { $('#log-val').textContent = HT.fmtProgress(t, HT.value(t, key)); };
        const setLabel = () => {
          if (label) label.textContent = mode === 'add' ? 'Add (' + unitName + ')' : 'Total (' + unitName + ')';
        };
        show();
        setLabel();
        const cur = HT.value(t, key);
        if (ty.input === 'hm') {
          if (cur) { $('#log-h').value = Math.floor(cur + 1e-9); $('#log-m').value = Math.round((cur % 1) * 60); }
        } else if (ty.input === 'percent') {
          n.value = cur || '';
          $('#log-range').value = cur;
          $('#log-range').addEventListener('input', (e) => { n.value = e.target.value; });
          n.addEventListener('input', () => { $('#log-range').value = n.value || 0; });
        } else if (!additive && cur) {
          n.value = cur;
        }

        wrap.addEventListener('click', (e) => {
          const add = e.target.closest('[data-add]');
          if (add) { HT.log(t, key, HT.value(t, key) + Number(add.dataset.add)); show(); return; }
          if (e.target.closest('[data-fill]')) { HT.log(t, key, Math.max(HT.value(t, key), HT.goal(t))); close(); return; }
          const m = e.target.closest('#log-mode [data-m]');
          if (m) {
            mode = m.dataset.m;
            HT.$$('#log-mode [data-m]', wrap).forEach((b) => b.setAttribute('aria-pressed', b === m));
            n.value = mode === 'set' && HT.value(t, key) ? HT.value(t, key) : '';
            setLabel();
            n.focus();
            return;
          }
          if (e.target.closest('[data-clear]')) { HT.log(t, key, 0); close(); return; }
          if (e.target.closest('[data-save]')) save();
        });
        const save = () => {
          let v;
          if (ty.input === 'hm') {
            v = (Number($('#log-h').value) || 0) + (Number($('#log-m').value) || 0) / 60;
          } else if (n.value === '') {
            close();
            return;
          } else {
            const x = Number(n.value);
            if (!Number.isFinite(x) || x < 0) { HT.toast('Enter a number of 0 or more'); return; }
            v = mode === 'add' ? HT.value(t, key) + x : x;
          }
          HT.log(t, key, v);
          close();
        };
        wrap.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') save(); });
      },
    });
  };

  /* ---------- calendar ---------- */

  function calendar(ym, cellClass, action, selected) {
    const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
    const ws = HT.data.settings.weekStart;
    const lead = (new Date(y, m - 1, 1).getDay() - ws + 7) % 7;
    const days = new Date(y, m, 0).getDate();
    const today = HT.today();
    let html = '<div class="cal"><div class="cal-head"><button type="button" class="icon-btn" data-action="' + action + '-month" data-d="-1" aria-label="Previous month">' + icon.back + '</button>' +
      '<div class="cal-title">' + monthLabel(ym) + '</div>' +
      '<button type="button" class="icon-btn" data-action="' + action + '-month" data-d="1" aria-label="Next month">' + icon.next + '</button></div><div class="cal-grid">';
    for (let i = 0; i < 7; i++) html += '<div class="cal-dow">' + HT.DAY_NAMES[(i + ws) % 7].slice(0, 2) + '</div>';
    for (let i = 0; i < lead; i++) html += '<div></div>';
    for (let d = 1; d <= days; d++) {
      const key = ym + '-' + String(d).padStart(2, '0');
      const cls = cellClass(key);
      html += '<button type="button" class="cal-day s-' + cls + (key === today ? ' is-today' : '') + (key === selected ? ' is-sel' : '') +
        '" data-action="' + action + '-day" data-date="' + key + '" aria-label="' + esc(fmtLong(key)) + ', ' + cls + '"><span>' + d + '</span></button>';
    }
    return html + '</div></div>';
  }
  const legend = '<div class="legend"><span><i class="lg s-complete"></i>Completed</span><span><i class="lg s-partial"></i>Partial</span>' +
    '<span><i class="lg s-missed"></i>Missed</span><span><i class="lg s-none"></i>Nothing scheduled</span></div>';

  /* ---------- History ---------- */

  HT.views.history = () => {
    const today = HT.today();
    const vs = HT.vs;
    if (!vs.histDate) vs.histDate = today;
    if (!vs.histMonth) vs.histMonth = vs.histDate.slice(0, 7);
    const key = vs.histDate;
    const isFuture = key > today;

    const rows = HT.sorted().filter((t) => HT.isExpected(t, key) || HT.value(t, key) > 0);
    const s = HT.daySummary(key);
    let detail = '<section class="panel-card"><div class="day-head"><div><h2>' + esc(fmtLong(key)) + '</h2><div class="muted">' +
      (isFuture ? plural(rows.length, 'habit') + ' scheduled' : s.total ? s.pct + '% · ' + s.done + ' / ' + s.total + ' completed' : 'No habits scheduled') + '</div></div></div>';
    if (rows.length) {
      detail += '<ul class="dlist">' + rows.map((t) => {
        const done = HT.isDone(t, key), v = HT.value(t, key);
        const extra = !HT.isExpected(t, key) ? ' <em class="tag">extra</em>' : '';
        return '<li data-id="' + t.id + '" data-date="' + key + '" style="--c:' + t.color + '"><button type="button" class="drow' + (done ? ' done' : '') + '"' +
          (isFuture ? ' disabled' : ' data-action="day-edit"') + '>' + iconBox(t) + '<span class="dname">' + esc(t.name) + extra + '</span>' +
          '<span class="dval">' + (isFuture ? '' : HT.typeOf(t).mode === 'toggle' ? (done ? '' : '—') : esc(HT.fmtProgress(t, v))) + '</span>' +
          '<span class="dcheck">' + (done ? icon.check : '') + '</span></button></li>';
      }).join('') + '</ul>' + (isFuture ? '' : '<p class="hint">Tap a habit to change what was recorded for this day.</p>');
    } else {
      detail += '<p class="note">Nothing was scheduled or recorded.</p>';
    }
    detail += '</section>';

    return pageHead('History', 'Calendar', vs.histMonth !== today.slice(0, 7) || key !== today ? '<button type="button" class="btn" data-action="hist-today">Today</button>' : '') +
      '<section class="panel-card">' + calendar(vs.histMonth, HT.dayStatus, 'hist', key) + legend + '</section>' + detail;
  };
  HT.actions['hist-month'] = (el) => { HT.vs.histMonth = shiftMonth(HT.vs.histMonth, +el.dataset.d); HT.render(); };
  HT.actions['hist-day'] = (el) => { HT.vs.histDate = el.dataset.date; HT.render(); };
  HT.actions['hist-today'] = () => { HT.vs.histDate = HT.today(); HT.vs.histMonth = HT.today().slice(0, 7); HT.render(); };
  HT.actions['day-edit'] = (el) => {
    const c = cardCtx(el);
    if (HT.typeOf(c.t).mode === 'toggle') HT.log(c.t, c.key, HT.isDone(c.t, c.key) ? 0 : 1);
    else HT.openLog(c.t, c.key);
  };

  /* ---------- Stats overview ---------- */

  function barChart(cols) {
    return '<div class="bars">' + cols.map((c) =>
      '<div class="bar-col' + (c.muted ? ' muted-col' : '') + (c.now ? ' now' : '') + '"><div class="bar-num">' + (c.top || '') + '</div><div class="bar-track"><i class="' + (c.full ? 'full' : '') +
      '" style="height:' + Math.max(0, Math.min(100, c.pct || 0)) + '%"></i></div><span>' + c.label + '</span></div>').join('') + '</div>';
  }

  HT.views.stats = () => {
    const today = HT.today();
    if (!HT.data.trackers.length) {
      return pageHead('Stats', 'Overview') + '<p class="note">Add a tracker and your weekly and monthly progress will show up here.</p>';
    }
    const ws = HT.weekStart(today), we = HT.addDays(ws, 6);
    const week = HT.rangeSummary(ws, we);
    const ms = HT.monthStart(today), me = HT.monthEnd(today);
    const month = HT.rangeSummary(ms, me);

    const weekCols = [];
    for (let i = 0; i < 7; i++) {
      const k = HT.addDays(ws, i), s = HT.daySummary(k), future = k > today;
      weekCols.push({ label: HT.DAY_NAMES[HT.parseKey(k).getDay()].slice(0, 2), pct: future ? 0 : s.pct, full: !future && s.total > 0 && s.done === s.total,
        muted: future || !s.total, now: k === today, top: future || !s.total ? '' : s.pct });
    }

    const live = HT.sorted().filter((t) => t.status !== 'archived');
    const withStats = live.map((t) => ({ t, st: HT.stats(t) }));
    const streaks = withStats.filter((x) => x.st.current > 0).sort((a, b) => b.st.current - a.st.current).slice(0, 5);
    const best = live.map((t) => ({ t, p: week.perTracker[t.id] })).filter((x) => x.p && x.p.expected)
      .sort((a, b) => b.p.done / b.p.expected - a.p.done / a.p.expected || b.p.done - a.p.done).slice(0, 5);
    const longest = HT.data.trackers.reduce((mx, t) => Math.max(mx, HT.stats(t).best), 0);

    const listRow = (t, right) => '<li data-id="' + t.id + '" style="--c:' + t.color + '"><button type="button" class="drow" data-action="open-tracker">' + iconBox(t) +
      '<span class="dname">' + esc(t.name) + '</span>' + right + '</button></li>';

    let strip = '';
    for (let k = ms; k <= me; k = HT.addDays(k, 1)) strip += '<i class="sq s-' + HT.dayStatus(k) + '" title="' + esc(fmtShort(k)) + '"></i>';

    return pageHead('Stats', 'Overview') +
      '<h2 class="section-title">This week</h2>' +
      '<div class="tiles t3">' + tile(week.expected ? week.pct + '%' : '–', 'Completion') + tile(week.done, 'Completed') + tile(week.missed, 'Missed') + '</div>' +
      '<section class="panel-card"><h3>Daily completion</h3>' + barChart(weekCols) + '</section>' +
      '<section class="panel-card"><h3>Current streaks</h3>' + (streaks.length
        ? '<ul class="dlist">' + streaks.map((x) => listRow(x.t, '<span class="dval streak">' + icon.flame + plural(x.st.current, 'day') + '</span>')).join('') + '</ul>'
        : '<p class="note">No active streaks yet. Complete a habit to start one.</p>') + '</section>' +
      '<section class="panel-card"><h3>Best performing this week</h3>' + (best.length
        ? '<ul class="dlist">' + best.map((x) => listRow(x.t, '<span class="dval">' + x.p.done + ' / ' + x.p.expected + '</span>' +
          '<span class="mini"><i style="width:' + Math.round((x.p.done / x.p.expected) * 100) + '%"></i></span>')).join('') + '</ul>'
        : '<p class="note">Nothing has been due yet this week.</p>') + '</section>' +
      '<h2 class="section-title">This month</h2>' +
      '<div class="tiles t4">' + tile(month.expected ? month.pct + '%' : '–', 'Completion') + tile(month.done, 'Completed') + tile(month.missed, 'Missed') +
      tile(longest, 'Longest streak') + '</div>' +
      '<section class="panel-card"><h3>Daily consistency</h3><p class="muted">' +
      (month.days ? month.perfectDays + ' of ' + plural(month.days, 'day') + ' fully completed' : 'No scheduled days yet this month') +
      '</p><div class="strip">' + strip + '</div>' + legend + '</section>';
  };

  /* ---------- Trackers list ---------- */

  const describe = (t) => {
    const ty = HT.typeOf(t);
    const parts = [ty.label];
    if (ty.hasTarget) parts.push(HT.fmtValue(t, HT.goal(t)));
    parts.push(HT.describeFrequency(t));
    if (t.startDate > HT.today()) parts.push('Starts ' + fmtShort(t.startDate));
    return parts.join(' · ');
  };

  HT.views.trackers = () => {
    const all = HT.sorted();
    const group = (status) => all.filter((t) => t.status === status);
    const row = (t) => '<li class="trow" data-id="' + t.id + '" style="--c:' + t.color + '"><button type="button" class="tmain" data-action="open-tracker">' + iconBox(t) +
      '<span class="tinfo"><span class="tname">' + esc(t.name) + '</span><span class="tsub"><span class="tprog">' + esc(describe(t)) + '</span></span></span>' +
      '<span class="chev">' + icon.next + '</span></button></li>';
    const active = group('active'), paused = group('paused'), archived = group('archived');
    let html = pageHead('Trackers', 'Your trackers', addBtn);
    if (!all.length) return html + '<p class="note">No trackers yet. Add one to get started.</p>' + templateChips();
    html += '<h2 class="section-title">Active</h2>' + (active.length
      ? '<ul class="tlist" data-sortable>' + active.map(row).join('') + '</ul>' + (active.length > 1 ? '<p class="hint center">Press and hold to reorder</p>' : '')
      : '<p class="note">No active trackers.</p>');
    if (paused.length) html += '<h2 class="section-title">Paused</h2><ul class="tlist off">' + paused.map(row).join('') + '</ul>';
    if (archived.length) html += '<h2 class="section-title">Archived</h2><ul class="tlist off">' + archived.map(row).join('') + '</ul>';
    return html;
  };

  /* ---------- Tracker detail ---------- */

  function trackerDayClass(t) {
    const today = HT.today();
    return (key) => {
      if (key > today) return 'future';
      const v = HT.value(t, key), done = v >= HT.goal(t);
      if (done) return 'complete';
      if (v > 0) return 'partial';
      if (!HT.isExpected(t, key)) return 'none';
      return key === today ? 'pending' : 'missed';
    };
  }

  HT.views.tracker = (id) => {
    const t = HT.tracker(id);
    if (!t) return pageHead('Trackers', 'Not found') + '<p class="note">This tracker no longer exists.</p><a class="btn" href="#/trackers">Back to trackers</a>';
    const today = HT.today();
    const ty = HT.typeOf(t), st = HT.stats(t), goal = HT.goal(t);
    if (!HT.vs.tcalMonth) HT.vs.tcalMonth = today.slice(0, 7);

    const week = [];
    for (let i = 6; i >= 0; i--) {
      const k = HT.addDays(today, -i), v = HT.value(t, k);
      week.push({ label: HT.DAY_NAMES[HT.parseKey(k).getDay()].slice(0, 2), pct: (v / goal) * 100, full: v >= goal, muted: !HT.isExpected(t, k) && !v, now: k === today,
        top: ty.mode === 'toggle' ? '' : v ? HT.num(ty.id === 'time' ? v : v) : '' });
    }
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const ym = shiftMonth(today.slice(0, 7), -i);
      let exp = 0, done = 0;
      const end = HT.monthEnd(ym + '-01');
      for (let k = ym + '-01'; k <= end && k <= today; k = HT.addDays(k, 1)) {
        if (!HT.isExpected(t, k)) continue;
        const d = HT.isDone(t, k);
        if (k === today && !d) continue;
        exp++;
        if (d) done++;
      }
      const pct = exp ? Math.round((done / exp) * 100) : 0;
      months.push({ label: new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1).toLocaleDateString(undefined, { month: 'short' }), pct, full: exp > 0 && done === exp, muted: !exp, top: exp ? pct : '', now: i === 0 });
    }

    const badge = t.status === 'active' ? '' : '<span class="badge">' + (t.status === 'paused' ? 'Paused' : 'Archived') + '</span>';
    let html = '<div class="back-row"><a class="btn btn-ghost" href="#/trackers">' + icon.back + '<span>Trackers</span></a></div>' +
      '<header class="detail-head" style="--c:' + t.color + '">' + iconBox(t) + '<div><h1>' + esc(t.name) + badge + '</h1>' +
      (t.description ? '<p class="desc">' + esc(t.description) + '</p>' : '') + '<p class="muted">' + esc(describe(t)) +
      (t.reminder.enabled ? ' · Reminder ' + esc(t.reminder.time) : '') + (t.counts ? '' : ' · Not counted in daily %') + '</p></div></header>' +
      '<div class="actions" data-id="' + t.id + '">' +
      '<button type="button" class="btn" data-action="edit-tracker">' + icon.edit + '<span>Edit</span></button>' +
      (t.status === 'archived' ? '' : '<button type="button" class="btn" data-action="pause-tracker">' + (t.status === 'paused' ? icon.play + '<span>Resume</span>' : icon.pause + '<span>Pause</span>') + '</button>') +
      '<button type="button" class="btn" data-action="archive-tracker">' + icon.archive + '<span>' + (t.status === 'archived' ? 'Restore' : 'Archive') + '</span></button>' +
      '<button type="button" class="btn btn-danger-ghost" data-action="delete-tracker">' + icon.trash + '<span>Delete</span></button></div>';

    if (t.status === 'active' && t.startDate <= today) {
      html += '<h2 class="section-title">Today' + (HT.isExpected(t, today) ? '' : ' <em class="tag">not scheduled</em>') + '</h2><ul class="tlist">' + card(t, today) + '</ul>';
    }
    html += '<div class="tiles t4">' + tile(st.current, 'Current streak') + tile(st.best, 'Best streak') + tile(st.total, 'Completions') + tile(st.expected ? st.rate + '%' : '–', 'Completion rate') + '</div>';

    if (ty.mode !== 'toggle') {
      const ratio = Math.min(100, Math.round((st.average / goal) * 100));
      html += '<section class="panel-card"><h3>Goal vs actual</h3><div class="gva"><div><div class="tile-v">' + esc(HT.fmtValue(t, st.average)) + '</div><div class="tile-l">Average per scheduled day</div></div>' +
        '<div><div class="tile-v">' + esc(HT.fmtValue(t, goal)) + '</div><div class="tile-l">Goal</div></div></div>' +
        '<div class="sum-bar big" style="--c:' + t.color + '"><i style="width:' + ratio + '%"></i></div><p class="muted">' +
        (st.expected ? 'Your average is ' + ratio + '% of the goal.' : 'No completed days to average yet.') + '</p></section>';
    }
    html += '<section class="panel-card" style="--c:' + t.color + '"><h3>Last 7 days</h3>' + barChart(week) + '</section>' +
      '<section class="panel-card" data-id="' + t.id + '"><h3>History</h3>' + calendar(HT.vs.tcalMonth, trackerDayClass(t), 'tcal', null) + legend +
      '<p class="hint">Tap a day to add or correct an entry.</p></section>' +
      '<section class="panel-card" style="--c:' + t.color + '"><h3>Monthly completion rate</h3>' + barChart(months) + '</section>';
    return html;
  };

  HT.actions['tcal-month'] = (el) => { HT.vs.tcalMonth = shiftMonth(HT.vs.tcalMonth, +el.dataset.d); HT.render(); };
  HT.actions['tcal-day'] = (el) => {
    const t = HT.tracker(el.closest('[data-id]').dataset.id), key = el.dataset.date;
    if (key > HT.today()) { HT.toast('That day hasn\'t happened yet'); return; }
    if (HT.typeOf(t).mode === 'toggle') HT.log(t, key, HT.isDone(t, key) ? 0 : 1);
    else HT.openLog(t, key);
  };
  const actionTracker = (el) => HT.tracker(el.closest('[data-id]').dataset.id);
  HT.actions['edit-tracker'] = (el) => HT.openForm(actionTracker(el));
  HT.actions['pause-tracker'] = (el) => {
    const t = actionTracker(el);
    HT.setStatus(t.id, t.status === 'paused' ? 'active' : 'paused');
    HT.toast(t.status === 'paused' ? 'Paused — it won\'t count as missed' : 'Resumed');
    HT.render();
  };
  HT.actions['archive-tracker'] = (el) => {
    const t = actionTracker(el);
    HT.setStatus(t.id, t.status === 'archived' ? 'active' : 'archived');
    HT.toast(t.status === 'archived' ? 'Archived — history is kept' : 'Restored');
    HT.render();
  };
  HT.actions['delete-tracker'] = async (el) => {
    const t = actionTracker(el);
    const n = HT.entryCount(t.id);
    const ok = await HT.confirm({
      title: 'Delete tracker?',
      message: 'This permanently deletes <b>' + esc(t.name) + '</b>' + (n ? ' and its ' + plural(n, 'day') + ' of history' : '') +
        '. This can\'t be undone.' + (t.status !== 'archived' ? ' To hide it but keep the history, archive it instead.' : ''),
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    HT.deleteTracker(t.id);
    HT.toast('Tracker deleted');
    location.hash = '#/trackers';
  };

  /* ---------- Add / edit form ---------- */

  HT.actions['add-tracker'] = () => HT.openForm(null);
  HT.actions['template'] = (el) => HT.openForm(null, TEMPLATES[+el.dataset.i]);

  HT.openForm = (existing, preset) => {
    const isNew = !existing;
    const s = HT.normalizeTracker(Object.assign({ name: '', icon: HT.ICONS[0], color: HT.COLORS[0], type: 'boolean', target: '', startDate: HT.today() }, existing || {}, preset || {}));
    if (isNew && !preset) s.name = '';
    let customUnit = !HT.UNITS.includes(s.unit) && s.unit !== '';
    let targetTouched = !isNew || !!preset;

    const opt = (v, label, cur) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>';
    const sw = (id, on) => '<label class="switch"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span></span></label>';

    const body = () => {
      const ty = HT.types[s.type];
      let h = '';
      if (isNew) {
        h += '<div class="field"><span class="label">Quick start</span><div class="chips">' +
          TEMPLATES.map((tp, i) => '<button type="button" class="chip" data-tpl="' + i + '">' + tp.icon + ' ' + esc(tp.name) + '</button>').join('') + '</div></div>';
      }
      h += '<label class="field"><span class="label">Name</span><input id="f-name" type="text" maxlength="60" autocomplete="off" placeholder="e.g. Drink water" value="' + esc(s.name) + '"></label>' +
        '<label class="field"><span class="label">Description <em>optional</em></span><input id="f-desc" type="text" maxlength="200" autocomplete="off" placeholder="Why it matters, or a note" value="' + esc(s.description) + '"></label>' +
        '<div class="field"><span class="label">Tracker type</span><div class="type-grid">' +
        HT.typeOrder.map((id) => '<button type="button" class="type-opt" data-type="' + id + '" aria-pressed="' + (id === s.type) + '"><b>' + HT.types[id].label + '</b><small>' + esc(HT.types[id].example) + '</small></button>').join('') +
        '</div>' + (!isNew && HT.entryCount(s.id) ? '<p class="hint">Changing the type keeps the numbers already recorded.</p>' : '') + '</div>';

      if (ty.hasTarget) {
        h += '<div class="row2"><label class="field"><span class="label">' + (ty.targetLabel || 'Daily goal') + '</span>' +
          '<input id="f-target" type="number" inputmode="decimal" min="0" step="any" value="' + (targetTouched ? s.target : ty.defaultTarget) + '"></label>';
        if (!ty.fixedUnit) {
          h += '<label class="field"><span class="label">Unit</span><select id="f-unit">' + HT.UNITS.filter((u) => u !== '%').map((u) => opt(u, u, customUnit ? '' : s.unit)).join('') +
            opt('', 'no unit', customUnit ? '~' : s.unit) + opt('__custom', 'Custom…', customUnit ? '__custom' : '') + '</select></label>';
        }
        h += '</div>';
        if (customUnit && !ty.fixedUnit) {
          h += '<label class="field"><span class="label">Custom unit</span><input id="f-unit-custom" type="text" maxlength="16" autocapitalize="off" placeholder="e.g. reps, cups, laps" value="' + esc(HT.UNITS.includes(s.unit) ? '' : s.unit) + '"></label>';
        }
        if (ty.mode === 'add' || ty.mode === 'step') {
          h += '<label class="field"><span class="label">' + (ty.mode === 'step' ? 'Each tap adds' : 'Quick-add amount') + ' <em>optional</em></span>' +
            '<input id="f-step" type="number" inputmode="decimal" min="0" step="any" placeholder="' + (ty.mode === 'step' ? 1 : 'auto') + '" value="' + (s.step || '') + '"></label>';
        }
      }
      h += '<div class="field"><span class="label">Icon</span><div class="icon-grid">' +
        HT.ICONS.map((ic) => '<button type="button" data-icon="' + ic + '" aria-pressed="' + (ic === s.icon) + '">' + ic + '</button>').join('') + '</div></div>' +
        '<div class="field"><span class="label">Color</span><div class="swatches">' +
        HT.COLORS.map((c) => '<button type="button" data-color="' + c + '" style="--c:' + c + '" aria-pressed="' + (c === s.color) + '" aria-label="Color ' + c + '"></button>').join('') + '</div></div>' +
        '<div class="field"><label class="label" for="f-freq">Frequency</label><select id="f-freq">' +
        opt('daily', 'Every day', s.frequency.mode) + opt('weekdays', 'Weekdays (Mon–Fri)', s.frequency.mode) + opt('weekends', 'Weekends (Sat–Sun)', s.frequency.mode) +
        opt('days', 'Specific days of the week', s.frequency.mode) + opt('interval', 'Custom: every few days', s.frequency.mode) + '</select>';
      if (s.frequency.mode === 'days') {
        h += '<div class="days">' + [1, 2, 3, 4, 5, 6, 0].map((d) => '<button type="button" data-day="' + d + '" aria-pressed="' + s.frequency.days.includes(d) + '">' + HT.DAY_NAMES[d] + '</button>').join('') + '</div>';
      }
      if (s.frequency.mode === 'interval') {
        h += '<div class="inline-field">Every <input id="f-every" type="number" inputmode="numeric" min="2" max="365" value="' + s.frequency.every + '"> days, counted from the start date</div>';
      }
      h += '</div><label class="field"><span class="label">Start date</span><input id="f-start" type="date" value="' + s.startDate + '"></label>' +
        '<div class="switch-row"><div><div class="sw-title">Reminder</div><div class="hint">Alerts only while the app is open or recently used — see Settings.</div></div>' + sw('f-rem', s.reminder.enabled) + '</div>' +
        (s.reminder.enabled ? '<label class="field"><span class="label">Remind me at</span><input id="f-rem-time" type="time" value="' + s.reminder.time + '"></label>' : '') +
        '<div class="switch-row"><div><div class="sw-title">Count toward daily completion</div><div class="hint">Turn off for habits you want to log without affecting your daily %.</div></div>' + sw('f-counts', s.counts) + '</div>';
      if (HT.finance) h += HT.finance.trackerField(s);
      return h;
    };

    HT.openSheet({
      kind: 'sheet tall',
      title: isNew ? 'New tracker' : 'Edit tracker',
      html: body(),
      footer: '<button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn btn-primary" data-save>' + (isNew ? 'Add tracker' : 'Save changes') + '</button>',
      onMount: (wrap, close) => {
        const $ = (sel) => HT.$(sel, wrap);
        const read = () => {
          const g = (id) => $(id);
          s.name = g('#f-name').value.trim();
          s.description = g('#f-desc').value.trim();
          if (g('#f-target')) { s.target = Number(g('#f-target').value); }
          if (g('#f-unit') && g('#f-unit').value !== '__custom') s.unit = g('#f-unit').value;
          if (g('#f-unit-custom')) s.unit = g('#f-unit-custom').value.trim();
          if (g('#f-step')) s.step = Number(g('#f-step').value) || null;
          if (g('#f-every')) s.frequency.every = Number(g('#f-every').value) || 2;
          if (g('#f-start').value) s.startDate = g('#f-start').value;
          s.reminder.enabled = g('#f-rem').checked;
          if (g('#f-rem-time') && g('#f-rem-time').value) s.reminder.time = g('#f-rem-time').value;
          s.counts = g('#f-counts').checked;
          if (HT.finance) HT.finance.readTrackerField(wrap, s);
        };
        const redraw = () => {
          const bodyEl = $('.panel-body'), top = bodyEl.scrollTop;
          bodyEl.innerHTML = body();
          bodyEl.scrollTop = top;
        };
        const setType = (id) => {
          const ty = HT.types[id];
          s.type = id;
          s.target = ty.defaultTarget;
          s.unit = ty.defaultUnit;
          s.step = null;
          customUnit = false;
          targetTouched = false;
        };

        wrap.addEventListener('input', (e) => { if (e.target.id === 'f-target') targetTouched = true; });
        wrap.addEventListener('change', (e) => {
          const id = e.target.id;
          if (id === 'f-unit') { read(); customUnit = e.target.value === '__custom'; if (customUnit) s.unit = ''; redraw(); if (customUnit) $('#f-unit-custom').focus(); }
          if (id === 'f-freq') { read(); s.frequency.mode = e.target.value; if (s.frequency.mode === 'days' && !s.frequency.days.length) s.frequency.days = [1, 3, 5]; redraw(); }
          if (id === 'f-rem') { read(); redraw(); }
        });
        wrap.addEventListener('click', (e) => {
          const hit = (sel) => e.target.closest(sel);
          let b;
          if ((b = hit('[data-tpl]'))) {
            const tp = TEMPLATES[+b.dataset.tpl];
            read();
            setType(tp.type);
            Object.assign(s, { name: tp.name, icon: tp.icon, color: tp.color, target: tp.target || 1, unit: tp.unit || '', step: tp.step || null });
            targetTouched = true;
            redraw();
          } else if ((b = hit('[data-type]'))) {
            if (b.dataset.type !== s.type) { read(); setType(b.dataset.type); redraw(); }
          } else if ((b = hit('[data-icon]'))) {
            s.icon = b.dataset.icon;
            HT.$$('[data-icon]', wrap).forEach((x) => x.setAttribute('aria-pressed', x === b));
          } else if ((b = hit('[data-color]'))) {
            s.color = b.dataset.color;
            HT.$$('[data-color]', wrap).forEach((x) => x.setAttribute('aria-pressed', x === b));
          } else if ((b = hit('[data-day]'))) {
            const d = +b.dataset.day, i = s.frequency.days.indexOf(d);
            if (i >= 0) s.frequency.days.splice(i, 1); else s.frequency.days.push(d);
            b.setAttribute('aria-pressed', i < 0);
          } else if (hit('[data-save]')) {
            read();
            const ty = HT.types[s.type];
            if (!s.name) { HT.toast('Give your tracker a name'); $('#f-name').focus(); return; }
            if (ty.hasTarget && !(s.target > 0)) { HT.toast('Enter a goal greater than 0'); $('#f-target').focus(); return; }
            if (s.type === 'percentage' && s.target > 100) { HT.toast('A percentage goal can\'t be over 100'); return; }
            if (s.frequency.mode === 'days' && !s.frequency.days.length) { HT.toast('Pick at least one day'); return; }
            const saved = isNew ? HT.createTracker(s) : HT.updateTracker(s.id, s);
            if (saved.reminder.enabled && HT.enableNotifications) HT.enableNotifications(true);
            close();
            HT.toast(isNew ? 'Tracker added' : 'Changes saved');
            HT.render();
          }
        });
      },
    });
  };

  /* ---------- Settings ---------- */

  HT.views.settings = () => {
    const st = HT.data.settings;
    const seg = (name, options, cur) => '<div class="segmented" data-setting="' + name + '">' +
      options.map((o) => '<button type="button" data-action="set-setting" data-v="' + o[0] + '" aria-pressed="' + (String(o[0]) === String(cur)) + '">' + o[1] + '</button>').join('') + '</div>';
    const days = Object.keys(HT.data.entries).length;
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    const notifOn = st.notifications && perm === 'granted';
    let notif;
    if (perm === 'unsupported') notif = '<p class="note">This browser doesn\'t support notifications here. On iPhone, add the app to your Home Screen first, then open it from there.</p>';
    else if (perm === 'denied') notif = '<p class="note">Notifications are blocked for this site. Allow them in your browser or phone settings, then come back.</p>';
    else notif = '<div class="set-row"><div><div class="sw-title">Notifications</div><div class="hint">' + (notifOn ? 'On for trackers that have a reminder time.' : 'Off') + '</div></div>' +
      '<button type="button" class="btn" data-action="' + (notifOn ? 'notif-off' : 'notif-on') + '">' + (notifOn ? 'Turn off' : 'Turn on') + '</button></div>' +
      (notifOn ? '<div class="set-row"><div class="hint">Check that alerts reach you.</div><button type="button" class="btn" data-action="notif-test">Send test</button></div>' : '');

    return pageHead('Settings', 'Settings') +
      '<h2 class="section-title">Appearance</h2><section class="panel-card">' + seg('theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], st.theme) + '</section>' +

      '<h2 class="section-title">Trackers</h2><section class="panel-card">' +
      '<div class="set-block"><div class="sw-title">Order on Today</div>' + seg('sort', [['manual', 'My order'], ['incomplete', 'Unfinished first'], ['name', 'A–Z']], st.sort) +
      '<div class="hint">“My order” is the order you set by pressing and holding a tracker and dragging it.</div></div>' +
      '<div class="set-block"><div class="sw-title">Daily completion</div>' + seg('completion', [['binary', 'Completed only'], ['partial', 'Partial credit']], st.completion) +
      '<div class="hint">' + (st.completion === 'binary' ? 'The daily % counts only habits that reached their goal.' : 'The daily % gives partial credit — 2 L of a 3 L goal counts as 67%.') + '</div></div>' +
      '<div class="set-block"><div class="sw-title">Week starts on</div>' + seg('weekStart', [[0, 'Sunday'], [1, 'Monday']], st.weekStart) + '</div></section>' +

      (HT.finance ? HT.finance.settingsHTML() : '') +

      '<h2 class="section-title">Reminders</h2><section class="panel-card">' + notif +
      '<p class="hint">This app has no server, so it can only alert you while it is open or was used recently — your phone may not deliver a reminder if the app has been closed for a while. ' +
      'When you open the app it will always show any reminders you missed. For an alarm that must fire, also set one in your phone\'s Clock or Reminders app.</p></section>' +

      '<h2 class="section-title">Data</h2><section class="panel-card">' +
      '<p class="muted">' + plural(HT.data.trackers.length, 'tracker') + ' · ' + plural(days, 'day') + ' of entries · finance data · stored only on this device' +
      (HT.storageOK ? '' : ' · <b class="danger-text">saving is failing</b>') + '</p>' +
      '<div class="set-row"><div><div class="sw-title">Back up</div><div class="hint">' + (HT.data.meta.lastBackup ? 'Last backup ' + esc(fmtShort(HT.data.meta.lastBackup.slice(0, 10))) : 'No backup yet') + '. Save the file to Files, iCloud or email.</div></div>' +
      '<button type="button" class="btn btn-primary" data-action="backup">Back up</button></div>' +
      '<div class="set-row"><div><div class="sw-title">Export data</div><div class="hint">Download everything as a JSON file.</div></div><button type="button" class="btn" data-action="export">Export</button></div>' +
      '<div class="set-row"><div><div class="sw-title">Import data</div><div class="hint">Restore from a backup file. Replaces what is here.</div></div>' +
      '<button type="button" class="btn" data-action="import">Import</button><input type="file" id="import-file" accept="application/json,.json" hidden></div>' +
      '<div class="set-row"><div><div class="sw-title">Reset all data</div><div class="hint">Delete every tracker, entry and finance record on this device.</div></div><button type="button" class="btn btn-danger-ghost" data-action="reset">Reset</button></div></section>' +

      '<h2 class="section-title">Install</h2><section class="panel-card"><p class="muted"><b>iPhone:</b> open this page in Safari, tap Share, then “Add to Home Screen”. ' +
      '<b>Android:</b> open the browser menu and tap “Install app”. Once installed it opens full screen and works offline.</p>' +
      '<p class="hint">Your data lives in this browser only. The Home Screen app keeps its own separate data from Safari, so install first, then add your trackers — and back up now and then.</p></section>' +
      '<p class="hint center">Habits · data format v' + HT.VERSION + '</p>';
  };

  HT.actions['set-setting'] = (el) => {
    const name = el.parentNode.dataset.setting;
    HT.data.settings[name] = name === 'weekStart' ? Number(el.dataset.v) : el.dataset.v;
    HT.save();
    if (name === 'theme') HT.applyTheme();
    HT.render();
  };

  const backupFile = () => {
    const name = 'habits-backup-' + HT.today() + '.json';
    return new File([JSON.stringify(HT.exportData(), null, 2)], name, { type: 'application/json' });
  };
  const markBackup = () => { HT.data.meta.lastBackup = new Date().toISOString(); HT.save(); HT.render(); };
  const download = (file) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  HT.actions['export'] = () => { download(backupFile()); markBackup(); HT.toast('Backup file downloaded'); };
  HT.actions['backup'] = async () => {
    const file = backupFile();
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Habits backup' });
        markBackup();
      } catch (err) {
        if (err && err.name !== 'AbortError') { download(file); markBackup(); }
      }
    } else {
      download(file);
      markBackup();
      HT.toast('Backup file downloaded');
    }
  };
  HT.actions['import'] = () => {
    const input = HT.$('#import-file');
    input.value = '';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      let parsed, checked;
      try {
        parsed = JSON.parse(await file.text());
        checked = HT.migrate(parsed);
      } catch (err) {
        HT.toast(err instanceof SyntaxError ? 'That file isn\'t valid JSON.' : err.message);
        return;
      }
      const ok = await HT.confirm({
        title: 'Restore backup?',
        message: 'The backup has <b>' + plural(checked.trackers.length, 'tracker') + '</b> and <b>' + plural(Object.keys(checked.entries).length, 'day') +
          '</b> of entries. It will replace everything currently in the app.',
        confirmLabel: 'Restore',
      });
      if (!ok) return;
      HT.importData(parsed);
      HT.applyTheme();
      HT.render();
      HT.toast('Backup restored');
    };
    input.click();
  };
  HT.actions['reset'] = async () => {
    const ok = await HT.confirm({
      title: 'Reset all data?',
      message: 'This deletes <b>every tracker, all history and all finance data</b> on this device. It can\'t be undone — export a backup first if you might want it back.',
      confirmLabel: 'Delete everything',
      danger: true,
    });
    if (!ok) return;
    HT.resetData();
    HT.applyTheme();
    HT.toast('All data cleared');
    location.hash = '#/today';
    HT.render();
  };
})();
