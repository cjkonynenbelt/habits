/* Habits — Weight module. Self-contained like finance.js: own data (HT.data.weight), maths, screens.
   Weights are always stored in kilograms and converted for display, so switching lb/kg loses nothing.
   A day can hold several weigh-ins (each with a time); charts and trends use each day's average.
   Hooks used by the rest of the app: HT.normalizeWeight (storage), W.todayWidget (Today),
   W.settingsHTML (Settings), W.reminderDue (reminder check), W.dayValue / W.openLog (Health). */
(function () {
  'use strict';
  const HT = window.HT;
  const esc = HT.esc, icon = HT.icon;
  const W = (HT.weight = {});
  const LB_PER_KG = 2.20462;
  W.LB_PER_KG = LB_PER_KG;

  const D = () => HT.data.weight;
  const wid = () => 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const kgOrNull = (v) => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) && n > 0 ? Math.round(n * 10000) / 10000 : null; };
  const isTime = (t) => typeof t === 'string' && /^\d{2}:\d{2}$/.test(t);
  const order = (a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : (a.time || '') < (b.time || '') ? -1 : (a.time || '') > (b.time || '') ? 1 : 0);

  HT.normalizeWeight = (raw) => {
    const r = raw && typeof raw === 'object' ? raw : {};
    const rem = r.reminder && typeof r.reminder === 'object' ? r.reminder : {};
    const seen = new Set();
    const entries = (Array.isArray(r.entries) ? r.entries : [])
      .filter((e) => e && HT.isDateKey(e.date) && kgOrNull(e.kg) != null)
      .map((e) => ({ id: typeof e.id === 'string' && e.id ? e.id : wid(), date: e.date, time: isTime(e.time) ? e.time : '', kg: kgOrNull(e.kg), note: String(e.note || '').slice(0, 200) }))
      .filter((e) => { const k = e.id; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort(order);
    return {
      unit: r.unit === 'kg' ? 'kg' : 'lb',
      goal: kgOrNull(r.goal),
      start: kgOrNull(r.start), // optional override; otherwise the first day's weight
      entries,
      reminder: { enabled: !!rem.enabled, time: isTime(rem.time) ? rem.time : '07:00' },
    };
  };

  /* ---------- units + formatting ---------- */

  W.unit = () => D().unit;
  const toUnit = (kg) => (D().unit === 'lb' ? kg * LB_PER_KG : kg);
  const fromUnit = (v) => (D().unit === 'lb' ? v / LB_PER_KG : v);
  W.toUnit = toUnit;
  W.fromUnit = fromUnit;
  const fmt = (kg) => toUnit(kg).toFixed(1) + ' ' + D().unit;
  W.fmt = fmt;
  const inputValue = (kg) => (kg == null ? '' : String(Math.round(toUnit(kg) * 10) / 10));
  /* A change, e.g. "−4.6 lb". Differences are taken on the displayed (rounded) scale. */
  const fmtDelta = (kgDiff) => {
    const v = Math.round(toUnit(kgDiff) * 10) / 10;
    return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1) + ' ' + D().unit;
  };
  W.fmtDelta = fmtDelta;
  const arrow = (kgDiff) => { const v = Math.round(toUnit(kgDiff) * 10); return v < 0 ? '↓' : v > 0 ? '↑' : '→'; };
  const longDate = (key) => HT.parseKey(key).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  const shortDate = (key) => HT.parseKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const fmtTime = (t) => { if (!isTime(t)) return ''; const p = t.split(':'); return new Date(2000, 0, 1, +p[0], +p[1]).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };
  const nowTime = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

  /* ---------- calculations ---------- */

  /* One value per day: the average of that day's weigh-ins. */
  W.days = () => {
    const out = [];
    D().entries.forEach((e) => {
      const last = out[out.length - 1];
      if (last && last.date === e.date) { last.list.push(e); last.kg = last.list.reduce((s, x) => s + x.kg, 0) / last.list.length; }
      else out.push({ date: e.date, kg: e.kg, list: [e] });
    });
    return out;
  };
  W.dayValue = (key) => { const d = W.days().find((x) => x.date === key); return d ? d.kg : null; };
  W.latest = () => D().entries[D().entries.length - 1] || null;

  W.stats = () => {
    const days = W.days(), today = HT.today();
    if (!days.length) return null;
    const first = days[0], last = days[days.length - 1];
    const start = D().start != null ? D().start : first.kg;
    const atOrBefore = (key) => { let hit = null; days.forEach((x) => { if (x.date <= key) hit = x; }); return hit; };
    const changeSince = (n) => { const ref = atOrBefore(HT.addDays(today, -n)); return ref && ref !== last ? last.kg - ref.kg : null; };
    const average = (n, min) => {
      const from = HT.addDays(today, -n + 1);
      const xs = days.filter((x) => x.date >= from);
      return xs.length >= min ? xs.reduce((s, x) => s + x.kg, 0) / xs.length : null;
    };
    const span = HT.daysBetween(first.date, last.date);
    const s = {
      count: D().entries.length, days: days.length, first, last, latest: W.latest(), start,
      total: last.kg - start,
      change7: changeSince(7), change30: changeSince(30),
      avg7: average(7, 2), avg30: average(30, 3),
      low: days.length >= 2 ? days.reduce((m, x) => (x.kg < m.kg ? x : m)) : null,
      high: days.length >= 2 ? days.reduce((m, x) => (x.kg > m.kg ? x : m)) : null,
      weekly: span >= 14 ? (last.kg - first.kg) / (span / 7) : null,
      goal: null,
    };
    const goal = D().goal;
    if (goal != null) {
      const needed = start - goal; // positive = losing, negative = gaining
      const done = start - last.kg;
      const reached = needed > 0 ? last.kg <= goal : needed < 0 ? last.kg >= goal : true;
      s.goal = {
        kg: goal, reached,
        direction: needed > 0 ? 'lose' : needed < 0 ? 'gain' : 'keep',
        toGo: Math.abs(last.kg - goal),
        pct: reached ? 100 : Math.max(0, Math.min(100, (done / needed) * 100)),
      };
    }
    return s;
  };

  /* Summary of the days between `from` and today (inclusive): needs 2 days for a change, 3 for an average. */
  W.period = (from) => {
    const days = W.days().filter((d) => d.date >= from);
    if (!days.length) return { days: 0 };
    const vals = days.map((d) => d.kg);
    return {
      days: days.length,
      change: days.length >= 2 ? vals[vals.length - 1] - vals[0] : null,
      avg: days.length >= 3 ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
      low: days.length >= 2 ? Math.min.apply(null, vals) : null,
      high: days.length >= 2 ? Math.max.apply(null, vals) : null,
    };
  };

  /* Trailing 7-day average of daily values (a gentler view of normal day-to-day swings). */
  W.rolling = (days, key) => {
    const from = HT.addDays(key, -6);
    const xs = days.filter((d) => d.date >= from && d.date <= key);
    return xs.length >= 2 ? xs.reduce((s, x) => s + x.kg, 0) / xs.length : null;
  };

  W.reminderDue = (hm) => {
    const r = D().reminder, today = HT.today();
    return r.enabled && r.time <= hm && !D().entries.some((x) => x.date === today);
  };

  /* Adds a weigh-in. Returns false (and adds nothing) for an exact repeat of an existing entry. */
  W.add = (fields) => {
    const e = { id: wid(), date: fields.date, time: isTime(fields.time) ? fields.time : '', kg: kgOrNull(fields.kg), note: String(fields.note || '').slice(0, 200) };
    if (e.kg == null || !HT.isDateKey(e.date)) return false;
    if (D().entries.some((x) => x.date === e.date && x.time === e.time && Math.abs(x.kg - e.kg) < 0.0005)) return false;
    D().entries.push(e);
    D().entries.sort(order);
    return e;
  };

  /* ---------- view state ---------- */

  W.vs = { range: '1M', all: false, sel: null };
  const RANGES = [['1W', 7], ['1M', 30], ['3M', 91], ['6M', 182], ['1Y', 365], ['All', 0]];
  const rangeFrom = () => { const days = RANGES.find((r) => r[0] === W.vs.range)[1]; return days ? HT.addDays(HT.today(), -days + 1) : ''; };

  /* ---------- Today widget ---------- */

  W.todayWidget = () => {
    const s = W.stats(), today = HT.today();
    const loggedToday = D().entries.some((e) => e.date === today);
    let body;
    if (!loggedToday) {
      body = '<div class="wquick"><span class="ticon" aria-hidden="true">⚖️</span><label class="wquick-l" for="w-quick-val">' +
        (s ? 'Weigh-in today<small>Last: ' + fmt(s.latest.kg) + ', ' + shortDate(s.latest.date) + '</small>' : 'Log your first weigh-in') + '</label>' +
        '<input id="w-quick-val" type="number" inputmode="decimal" step="0.1" min="0" placeholder="' + (s ? inputValue(s.latest.kg) : '0.0') + '" aria-label="Weight in ' + D().unit + '">' +
        '<span class="wquick-u">' + D().unit + '</span><button type="button" class="btn btn-primary" data-action="w-quick">Log</button></div>' +
        (s ? '<button type="button" class="wquick-link" data-action="w-open">See weight history</button>' : '');
      return '<section class="widget" data-widget="weight"><h2 class="section-title">Weight</h2><div class="panel-card tight">' + body + '</div></section>';
    }
    const sub = s.change7 != null ? arrow(s.change7) + ' ' + fmtDelta(s.change7).replace(/^[+−]/, '') + ' over 7 days' : 'Logged today';
    const goalBit = s.goal ? (s.goal.reached ? ' · goal reached' : ' · ' + fmt(s.goal.toGo) + ' to goal') : '';
    return '<section class="widget" data-widget="weight"><h2 class="section-title">Weight</h2><ul class="tlist"><li class="trow" style="--c:#5f6670"><button type="button" class="tmain" data-action="w-open">' +
      '<span class="ticon" aria-hidden="true">⚖️</span><span class="tinfo"><span class="tname">' + esc(fmt(s.latest.kg)) + '</span><span class="tsub"><span class="tprog">' + esc(sub + goalBit) + '</span></span></span>' +
      '<span class="chev">' + icon.next + '</span></button></li></ul></section>';
  };
  /* Kept for older callers. */
  W.todayCard = W.todayWidget;

  const quickLog = () => {
    const input = HT.$('#w-quick-val');
    if (!input) return;
    const v = Number(input.value);
    if (!(input.value !== '' && v > 0 && v < 2000)) { HT.toast('Enter your weight in ' + D().unit); input.focus(); return; }
    const added = W.add({ date: HT.today(), time: nowTime(), kg: fromUnit(v) });
    if (!added) { HT.toast('That weigh-in is already logged'); return; }
    HT.save();
    HT.toast('Weight logged: ' + fmt(added.kg));
    HT.render();
  };
  HT.actions['w-quick'] = quickLog;
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target && e.target.id === 'w-quick-val') quickLog(); });
  HT.actions['w-open'] = () => { location.hash = '#/weight'; };

  /* ---------- Weight screen ---------- */

  const tile = (v, l, cls) => '<div class="tile"><div class="tile-v' + (cls ? ' ' + cls : '') + '">' + v + '</div><div class="tile-l">' + l + '</div></div>';
  const row = (label, value) => '<div class="frow"><span>' + label + '</span><b>' + value + '</b></div>';
  const logBtn = '<button type="button" class="btn btn-primary" data-action="w-log">' + icon.plus + '<span>Log Weight</span></button>';

  HT.views.weight = () => {
    const s = W.stats();
    const head = HT.health
      ? HT.health.head('Weight', s ? logBtn : '') + HT.health.subnav('weight')
      : '<header class="page-head"><div><div class="eyebrow">Weight</div><h1>Weight</h1></div>' + (s ? logBtn : '') + '</header>';
    if (!s) {
      return head + '<section class="empty"><div class="empty-mark">' + icon.weight + '</div><h2>Start tracking your weight</h2>' +
        '<p>Log your first weigh-in to start seeing your progress and trends.</p>' +
        '<button type="button" class="btn btn-primary btn-lg" data-action="w-log">' + icon.plus + '<span>Log Weight</span></button></section>';
    }
    const g = s.goal;
    const dash = '—';
    const change = (v) => (v == null ? dash : fmtDelta(v));
    const todayDay = s.last.date === HT.today() && s.last.list.length > 1 ? s.last : null;

    let html = head + '<section class="panel-card w-now"><div class="w-now-top"><div><div class="tile-l">Most recent weight</div><div class="w-big">' + fmt(s.latest.kg) + '</div>' +
      '<div class="muted">' + longDate(s.latest.date) + (s.latest.time ? ' at ' + fmtTime(s.latest.time) : '') + '</div>' +
      (todayDay ? '<div class="hint">Today\'s average ' + fmt(todayDay.kg) + ' across ' + todayDay.list.length + ' weigh-ins</div>' : '') + '</div>' +
      '<button type="button" class="btn btn-sm" data-action="w-goal">' + (g ? 'Edit goal' : 'Set goal') + '</button></div>';
    if (g) {
      html += '<div class="fbar big"><i style="width:' + g.pct + '%"></i></div><div class="grow"><span class="w-togo">' +
        (g.reached ? 'Goal reached' : fmt(g.toGo) + ' to ' + (g.direction === 'gain' ? 'gain' : g.direction === 'lose' ? 'lose' : 'goal')) + '</span><span class="muted">' +
        (Math.round(g.pct * 10) / 10) + '% of the way · goal ' + fmt(g.kg) + '</span></div>';
    } else {
      html += '<p class="hint">A goal is optional. Set one to see progress, whether you want to lose, gain or hold steady.</p>';
    }
    html += '</section><div class="tiles w-tiles">' + tile(fmt(s.start), 'Starting') + tile(g ? fmt(g.kg) : dash, 'Goal') + tile(s.days >= 2 ? fmtDelta(s.total) : dash, 'Total change') +
      tile(change(s.change7), '7-day change') + tile(change(s.change30), '30-day change') + tile(s.count, s.count === 1 ? 'Weigh-in' : 'Weigh-ins') + '</div>';

    const p = W.period(rangeFrom());
    const periodLine = [];
    if (p.change != null) periodLine.push('Change ' + fmtDelta(p.change));
    if (p.avg != null) periodLine.push('Average ' + fmt(p.avg));
    if (p.low != null) periodLine.push('Range ' + toUnit(p.low).toFixed(1) + '–' + fmt(p.high));
    html += '<section class="panel-card"><div class="card-head"><h3>Weight over time</h3></div><div class="segmented w-ranges">' +
      RANGES.map((r) => '<button type="button" data-action="w-range" data-v="' + r[0] + '" aria-pressed="' + (r[0] === W.vs.range) + '">' + r[0] + '</button>').join('') +
      '</div><div id="w-chart" class="w-chart"></div>' +
      (periodLine.length ? '<p class="muted w-period">' + periodLine.join(' · ') + ' <span class="hint">(' + p.days + ' days with weigh-ins)</span></p>' : '') +
      '<p class="hint">Day-to-day readings swing with water, food and timing. The dashed 7-day average shows the underlying direction better than any single weigh-in.</p></section>';

    const trends = [];
    if (s.avg7 != null) trends.push(row('7-day average', fmt(s.avg7)));
    if (s.avg30 != null) trends.push(row('30-day average', fmt(s.avg30)));
    if (s.low) trends.push(row('Lowest day', fmt(s.low.kg) + ' <small>' + shortDate(s.low.date) + '</small>'));
    if (s.high) trends.push(row('Highest day', fmt(s.high.kg) + ' <small>' + shortDate(s.high.date) + '</small>'));
    if (s.days >= 2) trends.push(row('Total change', fmtDelta(s.total)));
    if (s.weekly != null) trends.push(row('Average weekly change', fmtDelta(s.weekly) + ' / week'));
    html += '<section class="panel-card"><h3>Trends</h3>' + (trends.length ? trends.join('') : '<p class="muted">Trends appear after a few days of weigh-ins.</p>') + '</section>';

    const list = D().entries.slice().reverse();
    const shown = W.vs.all ? list : list.slice(0, 14);
    html += '<section class="panel-card"><h3>History</h3><ul class="dlist">' + shown.map((e) =>
      '<li data-id="' + e.id + '"><button type="button" class="drow" data-action="w-edit"><span class="dname">' + fmt(e.kg) + '<small>' + longDate(e.date) + (e.time ? ' · ' + fmtTime(e.time) : '') + (e.note ? ' · ' + esc(e.note) : '') + '</small></span>' +
      '<span class="chev">' + icon.next + '</span></button></li>').join('') + '</ul>' +
      (list.length > shown.length ? '<button type="button" class="btn wide" data-action="w-all">Show all ' + list.length + ' weigh-ins</button>' : '') +
      '<p class="hint">Tap a weigh-in to edit or delete it. Days with several weigh-ins use their average in the chart and trends. Weight data stays on this device.</p></section>';

    requestAnimationFrame(W.drawChart);
    return html;
  };

  HT.actions['w-range'] = (el) => { W.vs.range = el.dataset.v; W.vs.sel = null; HT.render(); };
  HT.actions['w-all'] = () => { W.vs.all = true; HT.render(); };

  /* ---------- chart ---------- */

  W.drawChart = () => {
    const box = HT.$('#w-chart');
    if (!box) return;
    const allDays = W.days();
    const pts = allDays.filter((d) => d.date >= rangeFrom());
    if (pts.length < 2) {
      box.innerHTML = '<p class="note">' + (allDays.length < 2
        ? 'Weigh in on one more day and your graph will appear here.'
        : 'Not enough weigh-ins in this period to draw a graph. Pick a longer range.') + '</p>';
      return;
    }
    const AX = 44; // fixed y-axis column, so labels stay put while the plot scrolls
    const cw = Math.max(120, box.clientWidth - AX);
    const Wd = Math.max(cw, pts.length * 26);
    const H = window.innerWidth >= 900 ? 300 : 220, padT = 14, padB = 26, padX = 14;
    const vals = pts.map((p) => toUnit(p.kg));
    const avgs = pts.map((p) => { const a = W.rolling(allDays, p.date); return a == null ? null : toUnit(a); });
    const every = vals.concat(avgs.filter((a) => a != null));
    let lo = Math.min.apply(null, every), hi = Math.max.apply(null, every);
    const goal = D().goal != null ? toUnit(D().goal) : null;
    const pad = Math.max(0.5, (hi - lo) * 0.12);
    lo -= pad; hi += pad;
    const t0 = HT.parseKey(pts[0].date).getTime(), span = Math.max(1, HT.parseKey(pts[pts.length - 1].date).getTime() - t0);
    const X = (key) => padX + (Wd - 2 * padX) * ((HT.parseKey(key).getTime() - t0) / span);
    const Y = (v) => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
    const xy = pts.map((p, i) => [X(p.date), Y(vals[i])]);

    // Smooth line that never overshoots the readings.
    const smooth = (P) => {
      let d = 'M' + P[0][0].toFixed(1) + ' ' + P[0][1].toFixed(1);
      for (let i = 1; i < P.length; i++) {
        const mx = ((P[i - 1][0] + P[i][0]) / 2).toFixed(1);
        d += ' C' + mx + ' ' + P[i - 1][1].toFixed(1) + ' ' + mx + ' ' + P[i][1].toFixed(1) + ' ' + P[i][0].toFixed(1) + ' ' + P[i][1].toFixed(1);
      }
      return d;
    };
    const line = smooth(xy);
    const base = H - padB;
    const area = line + ' L' + xy[xy.length - 1][0].toFixed(1) + ' ' + base + ' L' + xy[0][0].toFixed(1) + ' ' + base + ' Z';
    const avgPts = pts.map((p, i) => (avgs[i] == null ? null : [xy[i][0], Y(avgs[i])])).filter(Boolean);
    const avgLine = avgPts.length >= 2 ? '<path class="wc-trend" d="' + smooth(avgPts) + '"/>' : '';

    let grid = '', axis = '';
    for (let i = 0; i < 4; i++) {
      const v = lo + ((hi - lo) * i) / 3, y = Y(v);
      grid += '<line class="wc-grid" x1="0" x2="' + Wd + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>';
      axis += '<span style="top:' + y.toFixed(1) + 'px">' + v.toFixed(1) + '</span>';
    }
    let goalLine = '';
    if (goal != null && goal > lo && goal < hi) {
      goalLine = '<line class="wc-goal" x1="0" x2="' + Wd + '" y1="' + Y(goal).toFixed(1) + '" y2="' + Y(goal).toFixed(1) + '"/>';
    }
    // Date labels: always the newest reading, then as many earlier ones as fit without touching.
    let labels = '', lastX = 1e9;
    xy.slice().reverse().forEach((p, r) => {
      const i = xy.length - 1 - r;
      if (lastX - p[0] < 62) return;
      lastX = p[0];
      const anchor = p[0] < 24 ? 'start' : p[0] > Wd - 24 ? 'end' : 'middle';
      labels += '<text class="wc-x" x="' + p[0].toFixed(1) + '" y="' + (H - 7) + '" text-anchor="' + anchor + '">' + shortDate(pts[i].date) + '</text>';
    });
    const sel = W.vs.sel != null && pts[W.vs.sel] ? W.vs.sel : pts.length - 1;
    const dots = xy.map((p, i) => '<circle class="wc-dot' + (i === sel ? ' sel' : '') + '" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (i === sel ? 5.5 : 3.5) + '"/>' +
      '<circle class="wc-hit" data-i="' + i + '" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="14"/>').join('');
    const readout = (i) => {
      const d = pts[i];
      const notes = d.list.map((e) => e.note).filter(Boolean);
      return '<b>' + fmt(d.kg) + '</b> · ' + longDate(d.date) + (d.list.length > 1 ? ' · average of ' + d.list.length + ' weigh-ins' : d.list[0].time ? ' · ' + fmtTime(d.list[0].time) : '') +
        (avgs[i] != null ? ' · 7-day avg ' + fmt(fromUnit(avgs[i])) : '') + (notes.length ? ' · ' + esc(notes.join('; ')) : '');
    };

    box.innerHTML = '<div class="wc-read" id="w-read" aria-live="polite">' + readout(sel) + '</div><div class="wc-wrap" style="height:' + H + 'px"><div class="wc-axis" style="width:' + AX + 'px">' + axis + '</div>' +
      '<div class="wc-scroll"><svg width="' + Wd + '" height="' + H + '" viewBox="0 0 ' + Wd + ' ' + H + '" role="img" aria-label="Weight over time in ' + D().unit + ', ' + pts.length + ' days">' +
      grid + goalLine + '<path class="wc-area" d="' + area + '"/>' + avgLine + '<path class="wc-line" d="' + line + '"/>' + dots + labels + '</svg></div></div>' +
      '<div class="legend"><span><i class="lg wl-line"></i>Daily weight (' + D().unit + ')</span>' + (avgLine ? '<span><i class="lg wl-trend"></i>7-day average</span>' : '') + (goalLine ? '<span><i class="lg wl-goal"></i>Goal</span>' : '') +
      (Wd > cw ? '<span>Scroll sideways for more</span>' : '') + '</div>';
    const scroller = HT.$('.wc-scroll', box);
    scroller.scrollLeft = scroller.scrollWidth; // newest readings first in view
    const pick = (e) => {
      const hit = e.target.closest && e.target.closest('.wc-hit');
      if (!hit) return;
      const i = +hit.dataset.i;
      if (i === W.vs.sel) return;
      W.vs.sel = i;
      HT.$$('.wc-dot', box).forEach((d, n) => { d.classList.toggle('sel', n === i); d.setAttribute('r', n === i ? 5.5 : 3.5); });
      HT.$('#w-read', box).innerHTML = readout(i);
    };
    scroller.addEventListener('click', pick);
    scroller.addEventListener('pointerover', pick);
  };
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (HT.route && HT.route.name === 'weight') W.drawChart(); }, 150);
  });

  /* ---------- log / edit a weigh-in ---------- */

  W.openLog = (existing, presetDate) => {
    const last = W.latest();
    const unit = D().unit;
    const date0 = existing ? existing.date : presetDate || HT.today();
    HT.openSheet({
      title: existing ? 'Edit weigh-in' : 'Log weight',
      html: '<label class="field"><span class="label">Weight (' + unit + ')</span><input id="w-val" class="w-input" type="number" inputmode="decimal" min="0" step="0.1" placeholder="' +
        (last ? inputValue(last.kg) : unit === 'lb' ? '185.4' : '84.0') + '" value="' + (existing ? inputValue(existing.kg) : '') + '"></label>' +
        '<div class="row2"><label class="field"><span class="label">Date</span><input id="w-date" type="date" max="' + HT.today() + '" value="' + date0 + '"></label>' +
        '<label class="field"><span class="label">Time <em>optional</em></span><input id="w-time" type="time" value="' + (existing ? existing.time : date0 === HT.today() ? nowTime() : '') + '"></label></div>' +
        '<p class="hint" id="w-same-day"></p>' +
        '<label class="field"><span class="label">Note <em>optional</em></span><input id="w-note" type="text" maxlength="200" autocomplete="off" placeholder="e.g. After workout" value="' + esc(existing ? existing.note : '') + '"></label>',
      footer: (existing ? '<button type="button" class="btn btn-danger-ghost" data-del>Delete</button>' : '<button type="button" class="btn" data-close>Cancel</button>') +
        '<button type="button" class="btn btn-primary" data-save>Save</button>',
      onMount: (wrap, close) => {
        const $ = (s) => HT.$(s, wrap);
        let busy = false;
        if (!existing) setTimeout(() => $('#w-val').focus(), 250);
        const sameDay = () => {
          const others = D().entries.filter((e) => e.date === $('#w-date').value && (!existing || e.id !== existing.id));
          $('#w-same-day').textContent = others.length
            ? 'Already logged that day: ' + others.map((e) => fmt(e.kg) + (e.time ? ' at ' + fmtTime(e.time) : '')).join(', ') + '. This is saved as another weigh-in; the day uses their average.'
            : '';
        };
        sameDay();
        $('#w-date').addEventListener('change', sameDay);
        const finish = (msg) => { HT.save(); close(); HT.toast(msg); HT.render(); };
        const save = () => {
          if (busy) return;
          const v = Number($('#w-val').value);
          if (!($('#w-val').value !== '' && v > 0 && v < 2000)) { HT.toast('Enter your weight'); $('#w-val').focus(); return; }
          const date = $('#w-date').value;
          if (!HT.isDateKey(date)) { HT.toast('Pick a date'); return; }
          if (date > HT.today()) { HT.toast('That date is in the future'); return; }
          busy = true;
          const data = { date, time: $('#w-time').value, kg: fromUnit(v), note: $('#w-note').value.trim() };
          if (existing) {
            const e = D().entries.find((x) => x.id === existing.id);
            Object.assign(e, { date, time: isTime(data.time) ? data.time : '', kg: kgOrNull(data.kg), note: data.note.slice(0, 200) });
            D().entries.sort(order);
          } else if (!W.add(data)) {
            busy = false;
            HT.toast('That weigh-in is already logged');
            return;
          }
          W.vs.sel = null;
          finish(existing ? 'Weigh-in updated' : 'Weight logged');
        };
        wrap.addEventListener('click', async (e) => {
          if (e.target.closest('[data-save]')) save();
          else if (e.target.closest('[data-del]')) {
            const ok = await HT.confirm({ title: 'Delete weigh-in?', message: 'Delete <b>' + fmt(existing.kg) + '</b> from ' + longDate(existing.date) + '? This can\'t be undone.', confirmLabel: 'Delete', danger: true });
            if (!ok) return;
            D().entries = D().entries.filter((x) => x.id !== existing.id);
            W.vs.sel = null;
            finish('Weigh-in deleted');
          }
        });
        wrap.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') save(); });
      },
    });
  };
  HT.actions['w-log'] = (el) => W.openLog(null, el && el.dataset && el.dataset.date);
  HT.actions['w-edit'] = (el) => {
    const e = D().entries.find((x) => x.id === el.closest('[data-id]').dataset.id);
    if (e) W.openLog(e);
  };

  /* ---------- goal ---------- */

  HT.actions['w-goal'] = () => {
    const first = W.days()[0], unit = D().unit;
    HT.openSheet({
      title: 'Weight goal',
      html: '<label class="field"><span class="label">Goal weight (' + unit + ')</span><input id="w-goal" class="w-input" type="number" inputmode="decimal" min="0" step="0.1" placeholder="e.g. ' + (unit === 'lb' ? '175' : '80') + '" value="' + inputValue(D().goal) + '"></label>' +
        '<label class="field"><span class="label">Starting weight (' + unit + ') <em>optional</em></span><input id="w-start" type="number" inputmode="decimal" min="0" step="0.1" placeholder="' + (first ? inputValue(first.kg) : '') + '" value="' + inputValue(D().start) + '"></label>' +
        '<p class="hint">Leave the starting weight blank to use your first day of weigh-ins' + (first ? ' (' + fmt(first.kg) + ')' : '') + '. Progress works whether the goal is to lose, gain or maintain.</p>',
      footer: (D().goal != null ? '<button type="button" class="btn btn-danger-ghost" data-clear>Remove goal</button>' : '<button type="button" class="btn" data-close>Cancel</button>') +
        '<button type="button" class="btn btn-primary" data-save>Save</button>',
      onMount: (wrap, close) => {
        const read = (sel) => { const v = HT.$(sel, wrap).value; return v === '' ? null : kgOrNull(fromUnit(Number(v))); };
        wrap.addEventListener('click', (e) => {
          if (e.target.closest('[data-save]')) {
            const goal = read('#w-goal');
            if (goal == null) { HT.toast('Enter a goal weight'); return; }
            D().goal = goal;
            D().start = read('#w-start');
          } else if (e.target.closest('[data-clear]')) {
            D().goal = null;
          } else return;
          HT.save();
          close();
          HT.render();
        });
      },
    });
  };

  /* ---------- Settings block ---------- */

  W.settingsHTML = () => {
    const d = D();
    return '<h2 class="section-title">Weight</h2><section class="panel-card">' +
      '<div class="set-block"><div class="sw-title">Unit</div><div class="segmented" data-wset="unit">' +
      ['lb', 'kg'].map((u) => '<button type="button" data-action="w-unit" data-v="' + u + '" aria-pressed="' + (d.unit === u) + '">' + u + '</button>').join('') +
      '</div><div class="hint">Weights are stored in kg and only converted for display (1 kg = 2.20462 lb), so switching never changes what you logged. Lifted weights in workouts use this unit too.</div></div>' +
      '<div class="set-block"><div class="set-row tight"><div><div class="sw-title">Goal weight</div><div class="hint">' + (d.goal != null ? fmt(d.goal) : 'Not set — optional') + '</div></div>' +
      '<button type="button" class="btn" data-action="w-goal">' + (d.goal != null ? 'Edit' : 'Set') + '</button></div></div>' +
      '<div class="set-block"><div class="switch-row plain"><div><div class="sw-title">Weigh-in reminder</div><div class="hint">Reminds you if you haven\'t logged your weight yet that day. Same limits as habit reminders.</div></div>' +
      '<label class="switch"><input type="checkbox" id="w-rem"' + (d.reminder.enabled ? ' checked' : '') + '><span></span></label></div>' +
      (d.reminder.enabled ? '<label class="field"><span class="label">Remind me at</span><input id="w-rem-time" type="time" value="' + d.reminder.time + '"></label>' : '') + '</div></section>';
  };
  HT.actions['w-unit'] = (el) => { D().unit = el.dataset.v; HT.save(); HT.render(); };
  document.addEventListener('change', (e) => {
    if (e.target.id === 'w-rem') {
      D().reminder.enabled = e.target.checked;
      HT.save();
      if (e.target.checked && HT.enableNotifications) HT.enableNotifications(true);
      HT.render();
    } else if (e.target.id === 'w-rem-time' && e.target.value) {
      D().reminder.time = e.target.value;
      HT.save();
    }
  });
})();
