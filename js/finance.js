/* Habits — Finance module. Self-contained: its own data (HT.data.finance), logic, screens.
   Everything is entered by hand and stored locally; nothing is ever sent anywhere.
   The habit tracker only touches this file through three small hooks:
   HT.normalizeFinance (storage), F.trackerField/readTrackerField (form), F.onHabitDone (logging). */
(function () {
  'use strict';
  const HT = window.HT;
  const esc = HT.esc, icon = HT.icon;
  const F = (HT.finance = {});

  const fid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const pos = (v) => Math.max(0, num(v));
  const r2 = (n) => Math.round(n * 100) / 100;
  const str = (v, max) => String(v == null ? '' : v).slice(0, max || 60);
  const D = () => HT.data.finance;

  const DEFAULT_CATS = {
    income: ['Job', 'Sales', 'Business', 'Investments', 'Other'],
    expense: ['Housing', 'Food', 'Fuel', 'Transport', 'Utilities', 'Entertainment', 'Business', 'Health', 'Other'],
    goal: ['Emergency fund', 'Down payment', 'Vehicle', 'Vacation', 'Business', 'General savings'],
  };
  F.CURRENCIES = ['CAD', 'USD', 'EUR', 'GBP', 'AUD', 'NZD', 'MXN', 'INR', 'JPY', 'CHF'];
  const ICONS = ['💰', '🏦', '🛟', '🏠', '🚗', '🛻', '✈️', '🏖️', '📈', '💼', '🎓', '💍', '💳', '🧾', '🏥', '👶', '🐕', '💻', '🎁', '⭐'];
  const TX_TYPES = ['income', 'expense', 'contribution', 'payment'];

  /* ---------- data shape ---------- */

  HT.normalizeFinance = (raw) => {
    const r = raw && typeof raw === 'object' ? raw : {};
    const arr = (v) => (Array.isArray(v) ? v : []);
    const cats = (kind) => {
      const src = r.categories && Array.isArray(r.categories[kind]) ? r.categories[kind] : DEFAULT_CATS[kind];
      return Array.from(new Set(src.map((c) => str(c, 30).trim()).filter(Boolean)));
    };
    const hist = (v) => arr(v).filter((p) => p && HT.isDateKey(p.date)).map((p) => ({ date: p.date, value: num(p.value) })).sort((a, b) => (a.date < b.date ? -1 : 1));
    const goals = arr(r.goals).filter((g) => g && typeof g === 'object').map((g) => ({
      id: str(g.id) || fid('g'),
      kind: g.kind === 'debt' ? 'debt' : 'savings',
      name: str(g.name) || 'Goal',
      icon: str(g.icon, 8) || '💰',
      color: /^#[0-9a-f]{6}$/i.test(g.color) ? g.color : HT.COLORS[0],
      category: str(g.category, 30),
      target: pos(g.target), current: pos(g.current), monthly: pos(g.monthly),
      original: pos(g.original), balance: pos(g.balance), rate: pos(g.rate), minPayment: pos(g.minPayment), extraPayment: pos(g.extraPayment),
      targetDate: HT.isDateKey(g.targetDate) ? g.targetDate : '',
      inNetWorth: !!g.inNetWorth,
      history: hist(g.history),
      createdAt: g.createdAt || new Date().toISOString(),
    }));
    const ids = new Set(goals.map((g) => g.id));
    return {
      currency: F.CURRENCIES.includes(r.currency) ? r.currency : 'CAD',
      goals,
      transactions: arr(r.transactions).filter((t) => t && TX_TYPES.includes(t.type) && num(t.amount) > 0 && HT.isDateKey(t.date)).map((t) => ({
        id: str(t.id) || fid('x'), type: t.type, amount: r2(num(t.amount)), date: t.date,
        category: str(t.category, 30), source: str(t.source), note: str(t.note, 200),
        goalId: ids.has(t.goalId) ? t.goalId : null, recurringId: t.recurringId ? str(t.recurringId) : null,
      })),
      recurring: arr(r.recurring).filter((x) => x && num(x.amount) > 0 && /^\d{4}-\d{2}$/.test(x.next)).map((x) => ({
        id: str(x.id) || fid('r'), amount: r2(num(x.amount)), category: str(x.category, 30), source: str(x.source),
        day: Math.min(31, Math.max(1, Math.round(num(x.day)) || 1)), next: x.next,
      })),
      budget: {
        income: pos(r.budget && r.budget.income),
        categories: (() => {
          const out = {}, src = (r.budget && r.budget.categories) || {};
          Object.keys(src).forEach((k) => { if (pos(src[k]) > 0) out[str(k, 30)] = pos(src[k]); });
          return out;
        })(),
      },
      accounts: arr(r.accounts).filter((a) => a && typeof a === 'object').map((a) => ({
        id: str(a.id) || fid('a'), kind: a.kind === 'liability' ? 'liability' : 'asset', name: str(a.name) || 'Account', amount: pos(a.amount),
      })),
      netWorthHistory: hist(r.netWorthHistory),
      categories: { income: cats('income'), expense: cats('expense'), goal: cats('goal') },
    };
  };

  /* ---------- formatting + dates ---------- */

  F.money = (n) => {
    n = num(n);
    const whole = Math.abs(n - Math.round(n)) < 0.005;
    const digits = whole ? 0 : 2;
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: D().currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
    } catch (err) {
      return '$' + n.toFixed(digits);
    }
  };
  const money = F.money;
  const pctText = (p) => (Math.round(p * 10) / 10) + '%';
  const monthName = (d) => d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const shortDate = (key) => HT.parseKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const addMonths = (n) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + n, 1); };
  const monthsUntil = (key) => {
    const a = new Date(), b = HT.parseKey(key);
    return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  };
  const monthRange = (ym) => [ym + '-01', HT.monthEnd(ym + '-01')];

  /* ---------- calculations (all estimates) ---------- */

  function payoff(balance, ratePct, payment) {
    if (balance <= 0) return { months: 0, interest: 0 };
    if (!(payment > 0)) return { months: null, interest: null };
    const r = ratePct / 1200;
    let b = balance, months = 0, interest = 0;
    while (b > 0.005 && months < 1200) {
      const i = b * r;
      if (payment <= i) return { months: null, interest: null }; // payment never catches the interest
      interest += i;
      b = b + i - payment;
      months++;
    }
    return { months, interest: r2(interest) };
  }
  function requiredPayment(balance, ratePct, months) {
    const n = Math.max(1, months), r = ratePct / 1200;
    return r > 0 ? (balance * r) / (1 - Math.pow(1 + r, -n)) : balance / n;
  }

  F.metrics = (g) => {
    const m = { debt: g.kind === 'debt' };
    if (m.debt) {
      m.done = g.balance <= 0;
      m.paid = Math.max(0, g.original - g.balance);
      m.remaining = g.balance;
      m.pct = g.original > 0 ? Math.min(100, (m.paid / g.original) * 100) : m.done ? 100 : 0;
      m.monthly = g.minPayment + g.extraPayment;
      const sim = payoff(g.balance, g.rate, m.monthly);
      m.months = sim.months;
      m.interest = g.rate > 0 ? sim.interest : null;
      m.required = g.targetDate && !m.done ? requiredPayment(g.balance, g.rate, monthsUntil(g.targetDate)) : null;
    } else {
      m.remaining = Math.max(0, g.target - g.current);
      m.done = g.target > 0 && m.remaining <= 0;
      m.pct = g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : 0;
      m.monthly = g.monthly;
      m.months = m.done ? 0 : g.monthly > 0 ? Math.ceil(m.remaining / g.monthly) : null;
      m.required = g.targetDate && !m.done ? m.remaining / Math.max(1, monthsUntil(g.targetDate)) : null;
    }
    m.estDate = m.months == null ? null : m.months === 0 ? 'Reached' : monthName(addMonths(m.months));
    return m;
  };

  const upsert = (list, value) => {
    const today = HT.today();
    const last = list[list.length - 1];
    if (last && last.date === today) last.value = value;
    else list.push({ date: today, value });
  };

  F.goal = (id) => D().goals.find((g) => g.id === id);
  F.goalValue = (g) => (g.kind === 'debt' ? g.balance : g.current);
  F.setGoalValue = (g, v) => {
    v = r2(Math.max(0, v));
    if (g.kind === 'debt') g.balance = v; else g.current = v;
    upsert(g.history, v);
    F.snapshot();
  };

  F.netWorth = () => {
    let assets = 0, liabilities = 0;
    D().accounts.forEach((a) => { if (a.kind === 'asset') assets += a.amount; else liabilities += a.amount; });
    D().goals.forEach((g) => {
      if (!g.inNetWorth) return;
      if (g.kind === 'debt') liabilities += g.balance; else assets += g.current;
    });
    return { assets, liabilities, value: assets - liabilities, any: D().accounts.length > 0 || D().goals.some((g) => g.inNetWorth) };
  };
  /* Keeps one net-worth point per day so the history chart builds up on its own. */
  F.snapshot = () => {
    const nw = F.netWorth();
    if (nw.any) upsert(D().netWorthHistory, r2(nw.value));
  };

  F.addTx = (tx) => {
    const t = Object.assign({ id: fid('x'), category: '', source: '', note: '', goalId: null, recurringId: null }, tx);
    D().transactions.push(t);
    const g = t.goalId && F.goal(t.goalId);
    if (g) F.setGoalValue(g, F.goalValue(g) + (g.kind === 'debt' ? -t.amount : t.amount));
    return t;
  };
  F.deleteTx = (id) => {
    const t = D().transactions.find((x) => x.id === id);
    if (!t) return;
    D().transactions = D().transactions.filter((x) => x.id !== id);
    const g = t.goalId && F.goal(t.goalId);
    if (g) F.setGoalValue(g, F.goalValue(g) + (g.kind === 'debt' ? t.amount : -t.amount));
  };

  /* Adds any monthly recurring expenses that have come due since the app was last opened. */
  F.postRecurring = () => {
    const today = HT.today();
    let changed = false;
    D().recurring.forEach((rule) => {
      for (let guard = 0; guard < 240; guard++) {
        const end = HT.monthEnd(rule.next + '-01');
        const date = rule.next + '-' + String(Math.min(rule.day, +end.slice(8))).padStart(2, '0');
        if (date > today) break;
        F.addTx({ type: 'expense', amount: rule.amount, date, category: rule.category, source: rule.source, recurringId: rule.id });
        const d = HT.parseKey(rule.next + '-01');
        rule.next = HT.dateKey(new Date(d.getFullYear(), d.getMonth() + 1, 1)).slice(0, 7);
        changed = true;
      }
    });
    if (changed) HT.save();
  };

  F.period = (from, to) => {
    const p = { income: 0, expense: 0, contribution: 0, payment: 0, byIncome: {}, byExpense: {} };
    D().transactions.forEach((t) => {
      if (t.date < from || t.date > to) return;
      p[t.type] += t.amount;
      if (t.type === 'income') p.byIncome[t.category || 'Other'] = (p.byIncome[t.category || 'Other'] || 0) + t.amount;
      if (t.type === 'expense') p.byExpense[t.category || 'Other'] = (p.byExpense[t.category || 'Other'] || 0) + t.amount;
    });
    p.saved = p.income - p.expense;
    p.rate = p.income > 0 ? (p.saved / p.income) * 100 : null;
    return p;
  };

  /* ---------- shared UI bits ---------- */

  F.vs = { range: 'month', type: 'all', from: '', to: '' };

  const opt = (v, label, cur) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>';
  const field = (label, input, optional) => '<label class="field"><span class="label">' + label + (optional ? ' <em>optional</em>' : '') + '</span>' + input + '</label>';
  const moneyInput = (id, v, ph) => '<input id="' + id + '" type="number" inputmode="decimal" min="0" step="any" placeholder="' + (ph || '0') + '" value="' + (v ? v : '') + '">';
  const textInput = (id, v, ph, max) => '<input id="' + id + '" type="text" maxlength="' + (max || 60) + '" autocomplete="off" placeholder="' + esc(ph || '') + '" value="' + esc(v || '') + '">';
  const dateInput = (id, v) => '<input id="' + id + '" type="date" value="' + esc(v || '') + '">';
  const switchRow = (id, title, hint, on) => '<div class="switch-row"><div><div class="sw-title">' + title + '</div><div class="hint">' + hint + '</div></div>' +
    '<label class="switch"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span></span></label></div>';
  const val = (wrap, sel) => { const e = HT.$(sel, wrap); return e ? e.value.trim() : ''; };
  const tile = (v, l, cls) => '<div class="tile"><div class="tile-v' + (cls ? ' ' + cls : '') + '">' + v + '</div><div class="tile-l">' + l + '</div></div>';
  const bar = (pct, color, cls) => '<div class="fbar' + (cls ? ' ' + cls : '') + '"' + (color ? ' style="--c:' + color + '"' : '') + '><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>';
  const DISCLAIMER = '<p class="hint">Dates, required amounts and interest are estimates for your own planning — not financial advice.</p>';

  const catSelect = (id, kind, cur) => {
    const cats = D().categories[kind].slice();
    if (cur && !cats.includes(cur)) cats.push(cur);
    return '<select id="' + id + '" data-newcat>' + cats.map((c) => opt(c, c, cur)).join('') + '<option value="__new">+ New category…</option></select>' +
      '<input id="' + id + '-new" type="text" maxlength="30" placeholder="New category name" hidden style="margin-top:8px">';
  };
  document.addEventListener('change', (e) => {
    if (!e.target.matches || !e.target.matches('[data-newcat]')) return;
    const input = e.target.nextElementSibling;
    input.hidden = e.target.value !== '__new';
    if (!input.hidden) input.focus();
  });
  const readCat = (wrap, id, kind) => {
    let c = val(wrap, '#' + id);
    if (c !== '__new') return c;
    c = val(wrap, '#' + id + '-new');
    if (!c) { HT.toast('Name the new category'); return null; }
    if (!D().categories[kind].includes(c)) D().categories[kind].push(c);
    return c;
  };

  /* A form sheet: onSave/onDelete return false to keep it open. */
  function formSheet(o) {
    return HT.openSheet({
      title: o.title,
      kind: o.kind,
      html: o.html,
      footer: (o.onDelete ? '<button type="button" class="btn btn-danger-ghost" data-del>Delete</button>' : '<button type="button" class="btn" data-close>Cancel</button>') +
        '<button type="button" class="btn btn-primary" data-save>' + (o.saveLabel || 'Save') + '</button>',
      onMount: (wrap, close) => {
        if (o.onMount) o.onMount(wrap);
        wrap.addEventListener('click', async (e) => {
          if (e.target.closest('[data-save]')) {
            if (o.onSave(wrap) !== false) { HT.save(); close(); HT.render(); }
          } else if (e.target.closest('[data-del]')) {
            if ((await o.onDelete(wrap)) !== false) { HT.save(); close(); HT.render(); }
          }
        });
      },
    });
  }

  function lineChart(points, color) {
    if (points.length < 2) return '';
    const W = 320, H = 110, p = 6;
    const vs = points.map((x) => x.value);
    let mn = Math.min.apply(null, vs), mx = Math.max.apply(null, vs);
    if (mn === mx) { mn -= 1; mx += 1; }
    const t0 = HT.parseKey(points[0].date).getTime();
    const span = Math.max(1, HT.parseKey(points[points.length - 1].date).getTime() - t0);
    const X = (d) => p + (W - 2 * p) * ((HT.parseKey(d).getTime() - t0) / span);
    const Y = (v) => H - p - (H - 2 * p) * ((v - mn) / (mx - mn));
    const d = points.map((x, i) => (i ? 'L' : 'M') + X(x.date).toFixed(1) + ' ' + Y(x.value).toFixed(1)).join(' ');
    const first = points[0], last = points[points.length - 1];
    return '<div class="line-chart"' + (color ? ' style="--c:' + color + '"' : '') + '><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="History chart">' +
      '<path class="lc-area" d="' + d + ' L' + (W - p) + ' ' + H + ' L' + p + ' ' + H + ' Z"/><path class="lc-line" d="' + d + '"/></svg>' +
      '<div class="lc-axis"><span>' + shortDate(first.date) + '<b>' + money(first.value) + '</b></span><span>' + shortDate(last.date) + '<b>' + money(last.value) + '</b></span></div></div>';
  }

  const TABS = [['', 'Overview'], ['activity', 'Activity'], ['budget', 'Budget'], ['networth', 'Net worth']];
  const subnav = (cur) => '<nav class="segmented fin-tabs" aria-label="Finance sections">' +
    TABS.map((t) => '<a href="#/finance' + (t[0] ? '/' + t[0] : '') + '"' + (t[0] === cur ? ' aria-current="page"' : '') + '>' + t[1] + '</a>').join('') + '</nav>';
  const head = (title) => '<header class="page-head"><div><div class="eyebrow">Finance</div><h1>' + title + '</h1></div></header>';

  /* ---------- Overview ---------- */

  function goalCard(g) {
    const m = F.metrics(g);
    const line = m.debt
      ? money(m.paid) + ' / ' + money(g.original) + ' paid'
      : money(g.current) + ' / ' + money(g.target);
    return '<li data-id="' + g.id + '" style="--c:' + g.color + '"><button type="button" class="gcard" data-action="f-open-goal">' +
      '<span class="ticon" aria-hidden="true">' + esc(g.icon) + '</span><span class="ginfo"><span class="grow"><span class="tname">' + esc(g.name) + '</span><span class="gpct">' + pctText(m.pct) + '</span></span>' +
      '<span class="gline">' + line + '</span>' + bar(m.pct) +
      '<span class="gsub">' + (m.done ? (m.debt ? 'Paid off' : 'Goal reached') : money(m.remaining) + ' remaining' + (m.estDate ? ' · est. ' + m.estDate : '')) + '</span></span></button></li>';
  }

  function overview() {
    const today = HT.today();
    const mr = monthRange(today.slice(0, 7));
    const month = F.period(mr[0], mr[1]);
    const year = F.period(today.slice(0, 4) + '-01-01', today.slice(0, 4) + '-12-31');
    const nw = F.netWorth();
    const savings = D().goals.filter((g) => g.kind === 'savings'), debts = D().goals.filter((g) => g.kind === 'debt');
    const rate = month.rate == null ? null : Math.round(month.rate);

    let html = head('Financial overview') + subnav('') +
      '<section class="fin-hero"><div class="fh-label">Net worth</div><div class="fh-value">' + (nw.any ? money(nw.value) : '—') + '</div>' +
      (nw.any ? '' : '<a class="fh-link" href="#/finance/networth">Add your assets and debts</a>') +
      '<div class="fh-row"><div><span>Income</span><b>' + money(month.income) + '</b></div><div><span>Expenses</span><b>' + money(month.expense) + '</b></div><div><span>Saved</span><b>' + money(month.saved) + '</b></div></div>' +
      '<div class="fh-rate"><div class="fh-rate-top"><span>Savings rate · ' + new Date().toLocaleDateString(undefined, { month: 'long' }) + '</span><b>' + (rate == null ? '—' : rate + '%') + '</b></div>' + bar(rate || 0) + '</div></section>' +
      '<div class="quick"><button type="button" class="btn" data-action="f-add-income">' + icon.plus + '<span>Income</span></button>' +
      '<button type="button" class="btn" data-action="f-add-expense">' + icon.minus + '<span>Expense</span></button></div>';

    html += '<h2 class="section-title">Financial goals</h2>';
    if (savings.length) html += '<ul class="glist">' + savings.map(goalCard).join('') + '</ul>';
    else html += '<p class="note">No savings goals yet. Add one to see your progress, the monthly amount you need, and an estimated finish date.</p>';
    if (debts.length) html += '<h2 class="section-title">Debt payoff</h2><ul class="glist">' + debts.map(goalCard).join('') + '</ul>';
    html += '<button type="button" class="btn btn-primary btn-lg wide" data-action="f-add-goal">' + icon.plus + '<span>Add Financial Goal</span></button>';

    const catRows = (obj) => Object.keys(obj).sort((a, b) => obj[b] - obj[a]).map((k) => '<div class="frow"><span>' + esc(k) + '</span><b>' + money(obj[k]) + '</b></div>').join('');
    html += '<h2 class="section-title">This month</h2><section class="panel-card">' +
      '<h3>Income</h3>' + (catRows(month.byIncome) || '<p class="muted">Nothing recorded yet.</p>') + '<div class="frow total"><span>Total</span><b>' + money(month.income) + '</b></div>' +
      '<h3 class="sp">Expenses</h3>' + (catRows(month.byExpense) || '<p class="muted">Nothing recorded yet.</p>') + '<div class="frow total"><span>Total</span><b>' + money(month.expense) + '</b></div>' +
      '<div class="frow total strong"><span>Saved</span><b class="' + (month.saved < 0 ? 'danger-text' : '') + '">' + money(month.saved) + '</b></div></section>';

    // Income vs expenses, last six months
    const cols = [];
    let peak = 0;
    for (let i = 5; i >= 0; i--) {
      const d = addMonths(-i), ym = HT.dateKey(d).slice(0, 7), r = monthRange(ym), p = F.period(r[0], r[1]);
      peak = Math.max(peak, p.income, p.expense);
      cols.push({ label: d.toLocaleDateString(undefined, { month: 'short' }), p });
    }
    if (peak > 0) {
      html += '<section class="panel-card"><h3>Income vs expenses</h3><div class="bars duo">' + cols.map((c, i) =>
        '<div class="bar-col' + (i === 5 ? ' now' : '') + '"><div class="duo-track"><i class="in" style="height:' + (c.p.income / peak) * 100 + '%"></i><i class="out" style="height:' + (c.p.expense / peak) * 100 + '%"></i></div><span>' + c.label + '</span></div>').join('') +
        '</div><div class="legend"><span><i class="lg in"></i>Income</span><span><i class="lg out"></i>Expenses</span></div></section>';
    }
    html += '<h2 class="section-title">This year</h2><div class="tiles t3">' + tile(money(year.income), 'Income') + tile(money(year.expense), 'Expenses') + tile(money(year.saved), 'Saved', year.saved < 0 ? 'danger-text' : '') + '</div>' +
      '<p class="hint center">Entered by hand and stored only on this device. No bank connections.</p>';
    return html;
  }

  /* ---------- Activity (finance history) ---------- */

  function activityRange() {
    const today = HT.today(), v = F.vs;
    if (v.range === 'week') { const ws = HT.weekStart(today); return [ws, HT.addDays(ws, 6)]; }
    if (v.range === 'year') return [today.slice(0, 4) + '-01-01', today.slice(0, 4) + '-12-31'];
    if (v.range === 'custom') {
      const a = v.from || HT.monthStart(today), b = v.to || today;
      return a <= b ? [a, b] : [b, a];
    }
    return monthRange(today.slice(0, 7));
  }
  const TX_META = {
    income: { label: 'Income', sign: '+', cls: 'in', ico: '↓' },
    expense: { label: 'Expense', sign: '−', cls: 'out', ico: '↑' },
    contribution: { label: 'Saved to goal', sign: '', cls: 'move', ico: '→' },
    payment: { label: 'Debt payment', sign: '', cls: 'move', ico: '→' },
    networth: { label: 'Net worth', sign: '', cls: 'nw', ico: '≡' },
  };
  function txTitle(t) {
    if (t.type === 'networth') return 'Net worth updated';
    const g = t.goalId && F.goal(t.goalId);
    if (g) return g.name;
    return t.source || t.category || TX_META[t.type].label;
  }

  function activity() {
    const v = F.vs, range = activityRange(), p = F.period(range[0], range[1]);
    const seg = (name, options, cur) => '<div class="segmented" data-fset="' + name + '">' + options.map((o) =>
      '<button type="button" data-action="f-filter" data-v="' + o[0] + '" aria-pressed="' + (o[0] === cur) + '">' + o[1] + '</button>').join('') + '</div>';

    let rows = D().transactions.filter((t) => t.date >= range[0] && t.date <= range[1]);
    const nwh = D().netWorthHistory;
    nwh.forEach((pt, i) => {
      if (pt.date < range[0] || pt.date > range[1]) return;
      rows.push({ id: null, type: 'networth', date: pt.date, amount: pt.value, delta: i ? pt.value - nwh[i - 1].value : null });
    });
    const groups = { income: ['income'], expense: ['expense'], goals: ['contribution', 'payment'], networth: ['networth'] };
    if (v.type !== 'all') rows = rows.filter((t) => groups[v.type].includes(t.type));
    rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    let list = '', lastDate = '';
    rows.forEach((t) => {
      const meta = TX_META[t.type];
      if (t.date !== lastDate) { list += (lastDate ? '</ul>' : '') + '<div class="date-head">' + shortDate(t.date) + '</div><ul class="dlist">'; lastDate = t.date; }
      const sub = t.type === 'networth'
        ? (t.delta == null ? 'First snapshot' : (t.delta >= 0 ? '+' : '−') + money(Math.abs(t.delta)) + ' since last update')
        : [meta.label, t.goalId || t.type === 'networth' ? '' : t.source ? t.category : '', t.note, t.recurringId ? 'Monthly' : ''].filter(Boolean).join(' · ');
      list += '<li data-id="' + (t.id || '') + '"><button type="button" class="drow txrow"' + (t.id ? ' data-action="f-edit-tx"' : ' disabled') + '><span class="txico ' + meta.cls + '">' + meta.ico + '</span>' +
        '<span class="dname">' + esc(txTitle(t)) + '<small>' + esc(sub) + '</small></span><span class="txamt ' + meta.cls + '">' + meta.sign + money(t.amount) + '</span></button></li>';
    });
    if (lastDate) list += '</ul>';

    return head('Activity') + subnav('activity') +
      seg('range', [['week', 'Week'], ['month', 'Month'], ['year', 'Year'], ['custom', 'Custom']], v.range) +
      (v.range === 'custom' ? '<div class="row2 gap-top">' + field('From', dateInput('f-from', range[0])) + field('To', dateInput('f-to', range[1])) + '</div>' : '') +
      '<p class="muted gap-top">' + shortDate(range[0]) + ' – ' + shortDate(range[1]) + '</p>' +
      '<div class="tiles t3 gap-top">' + tile(money(p.income), 'Income') + tile(money(p.expense), 'Expenses') + tile(money(p.saved), 'Saved', p.saved < 0 ? 'danger-text' : '') + '</div>' +
      (p.contribution || p.payment ? '<p class="muted">Put toward goals: ' + money(p.contribution) + ' · Debt payments: ' + money(p.payment) + '</p>' : '') +
      '<div class="chips gap-top" data-fset="type">' + [['all', 'All'], ['income', 'Income'], ['expense', 'Expenses'], ['goals', 'Goals & debt'], ['networth', 'Net worth']].map((o) =>
        '<button type="button" class="chip' + (o[0] === v.type ? ' on' : '') + '" data-action="f-filter" data-v="' + o[0] + '">' + o[1] + '</button>').join('') + '</div>' +
      '<section class="panel-card gap-top">' + (list || '<p class="note">Nothing recorded in this period.</p>') + '</section>' +
      '<div class="quick"><button type="button" class="btn" data-action="f-add-income">' + icon.plus + '<span>Income</span></button>' +
      '<button type="button" class="btn" data-action="f-add-expense">' + icon.minus + '<span>Expense</span></button></div>';
  }
  document.addEventListener('change', (e) => {
    if (e.target.id === 'f-from' || e.target.id === 'f-to') {
      F.vs[e.target.id === 'f-from' ? 'from' : 'to'] = e.target.value;
      HT.render();
    }
  });
  HT.actions['f-filter'] = (el) => { F.vs[el.parentNode.dataset.fset] = el.dataset.v; HT.render(); };

  /* ---------- Budget ---------- */

  function budget() {
    const b = D().budget, today = HT.today();
    const mr = monthRange(today.slice(0, 7)), p = F.period(mr[0], mr[1]);
    const cats = Object.keys(b.categories);
    const budgeted = cats.reduce((s, c) => s + b.categories[c], 0);
    let html = head(new Date().toLocaleDateString(undefined, { month: 'long' }) + ' budget') + subnav('budget');
    if (!cats.length && !b.income) {
      html += '<section class="empty"><h2>Plan the month</h2><p>Set what you expect to earn and a limit for each spending category. The app shows where you stand as you record expenses.</p>' +
        '<button type="button" class="btn btn-primary btn-lg" data-action="f-edit-budget">Set up budget</button></section>';
    } else {
      html += '<div class="tiles t3">' + tile(money(b.income), 'Planned income') + tile(money(budgeted), 'Budgeted') + tile(money(b.income - budgeted), 'Expected savings', b.income - budgeted < 0 ? 'danger-text' : '') + '</div>' +
        '<section class="panel-card"><h3>Spending by category</h3>';
      html += cats.map((c) => {
        const spent = p.byExpense[c] || 0, limit = b.categories[c], ratio = (spent / limit) * 100;
        const status = ratio > 100 ? ['over', 'Over budget'] : ratio >= 85 ? ['near', 'Near budget'] : ['under', 'Under budget'];
        return '<div class="brow"><div class="grow"><span class="tname">' + esc(c) + '</span><span class="bstat ' + status[0] + '">' + status[1] + '</span></div>' +
          '<div class="gline">' + money(spent) + ' / ' + money(limit) + (spent > limit ? ' · ' + money(spent - limit) + ' over' : ' · ' + money(limit - spent) + ' left') + '</div>' + bar(ratio, null, status[0]) + '</div>';
      }).join('') || '<p class="muted">No category limits yet.</p>';
      const other = Object.keys(p.byExpense).filter((c) => !b.categories[c]);
      if (other.length) {
        html += '<div class="brow"><div class="grow"><span class="tname">Not budgeted</span></div><div class="gline">' +
          other.map((c) => esc(c) + ' ' + money(p.byExpense[c])).join(' · ') + '</div></div>';
      }
      html += '</section><section class="panel-card"><div class="frow"><span>Actual income so far</span><b>' + money(p.income) + '</b></div><div class="frow"><span>Spent so far</span><b>' + money(p.expense) + ' / ' + money(budgeted) + '</b></div></section>' +
        '<button type="button" class="btn wide" data-action="f-edit-budget">' + icon.edit + '<span>Edit budget</span></button>';
    }
    if (D().recurring.length) {
      html += '<h2 class="section-title">Recurring expenses</h2><section class="panel-card"><ul class="dlist">' + D().recurring.map((r) =>
        '<li data-id="' + r.id + '"><div class="drow"><span class="dname">' + esc(r.source || r.category) + '<small>' + esc(r.category) + ' · monthly on day ' + r.day + '</small></span>' +
        '<span class="dval">' + money(r.amount) + '</span><button type="button" class="icon-btn" data-action="f-del-recurring" aria-label="Stop repeating">' + icon.x + '</button></div></li>').join('') + '</ul></section>';
    }
    return html;
  }
  HT.actions['f-edit-budget'] = () => {
    const b = D().budget;
    const cats = D().categories.expense.slice();
    Object.keys(b.categories).forEach((c) => { if (!cats.includes(c)) cats.push(c); });
    formSheet({
      title: 'Monthly budget',
      kind: 'sheet tall',
      html: field('Planned monthly income', moneyInput('b-income', b.income)) +
        '<div class="field"><span class="label">Monthly limit per category <em>leave blank to skip</em></span>' +
        cats.map((c, i) => '<div class="inline-row"><span>' + esc(c) + '</span><input type="number" inputmode="decimal" min="0" step="any" placeholder="—" data-cat="' + i + '" value="' + (b.categories[c] || '') + '"></div>').join('') +
        '</div><p class="hint">Add or remove categories in Settings → Finance.</p>',
      onSave: (wrap) => {
        b.income = r2(pos(val(wrap, '#b-income')));
        b.categories = {};
        HT.$$('[data-cat]', wrap).forEach((inp) => { if (pos(inp.value) > 0) b.categories[cats[+inp.dataset.cat]] = r2(pos(inp.value)); });
        HT.toast('Budget saved');
      },
    });
  };
  HT.actions['f-del-recurring'] = async (el) => {
    const id = el.closest('[data-id]').dataset.id;
    const ok = await HT.confirm({ title: 'Stop repeating?', message: 'This expense will no longer be added each month. Expenses already recorded stay in your history.', confirmLabel: 'Stop' });
    if (!ok) return;
    D().recurring = D().recurring.filter((r) => r.id !== id);
    HT.save();
    HT.render();
  };

  /* ---------- Net worth ---------- */

  function networth() {
    const nw = F.netWorth();
    const rows = (kind) => {
      const items = D().accounts.filter((a) => a.kind === kind).map((a) =>
        '<li data-id="' + a.id + '"><button type="button" class="drow" data-action="f-edit-account"><span class="dname">' + esc(a.name) + '</span><span class="dval strong">' + money(a.amount) + '</span></button></li>');
      D().goals.filter((g) => g.inNetWorth && (g.kind === 'debt') === (kind === 'liability')).forEach((g) => {
        items.push('<li data-id="' + g.id + '"><button type="button" class="drow" data-action="f-open-goal"><span class="dname">' + esc(g.name) + ' <em class="tag">goal</em></span><span class="dval strong">' + money(F.goalValue(g)) + '</span></button></li>');
      });
      return items.length ? '<ul class="dlist">' + items.join('') + '</ul>' : '<p class="muted">Nothing listed yet.</p>';
    };
    const chart = lineChart(D().netWorthHistory);
    return head('Net worth') + subnav('networth') +
      '<section class="fin-hero"><div class="fh-label">Net worth</div><div class="fh-value">' + (nw.any ? money(nw.value) : '—') + '</div>' +
      '<div class="fh-row two"><div><span>Assets</span><b>' + money(nw.assets) + '</b></div><div><span>Liabilities</span><b>' + money(nw.liabilities) + '</b></div></div></section>' +
      '<section class="panel-card"><div class="card-head"><h3>Assets</h3><button type="button" class="btn btn-sm" data-action="f-add-account" data-kind="asset">' + icon.plus + '<span>Add</span></button></div>' + rows('asset') +
      '<div class="frow total"><span>Total assets</span><b>' + money(nw.assets) + '</b></div></section>' +
      '<section class="panel-card"><div class="card-head"><h3>Liabilities</h3><button type="button" class="btn btn-sm" data-action="f-add-account" data-kind="liability">' + icon.plus + '<span>Add</span></button></div>' + rows('liability') +
      '<div class="frow total"><span>Total liabilities</span><b>' + money(nw.liabilities) + '</b></div></section>' +
      '<section class="panel-card"><h3>Net worth over time</h3>' + (chart || '<p class="muted">A chart appears here once your net worth has been updated on at least two different days.</p>') + '</section>' +
      '<p class="hint">Net worth = total assets − total liabilities. Update the amounts whenever they change; the app keeps one point per day for the chart.</p>';
  }
  function accountSheet(existing, kind) {
    const a = existing || { kind, name: '', amount: '' };
    formSheet({
      title: (existing ? 'Edit ' : 'Add ') + (a.kind === 'asset' ? 'asset' : 'liability'),
      html: field('Name', textInput('a-name', a.name, a.kind === 'asset' ? 'e.g. Savings account' : 'e.g. Credit card')) +
        field(a.kind === 'asset' ? 'Current value' : 'Amount owed', moneyInput('a-amt', a.amount)),
      onSave: (wrap) => {
        const name = val(wrap, '#a-name');
        if (!name) { HT.toast('Give it a name'); return false; }
        const amount = r2(pos(val(wrap, '#a-amt')));
        if (existing) Object.assign(existing, { name, amount });
        else D().accounts.push({ id: fid('a'), kind: a.kind, name, amount });
        F.snapshot();
      },
      onDelete: existing ? () => { D().accounts = D().accounts.filter((x) => x.id !== existing.id); F.snapshot(); } : null,
    });
  }
  HT.actions['f-add-account'] = (el) => accountSheet(null, el.dataset.kind);
  HT.actions['f-edit-account'] = (el) => accountSheet(D().accounts.find((a) => a.id === el.closest('[data-id]').dataset.id));

  /* ---------- income + expenses ---------- */

  F.openTx = (type, existing) => {
    const isIncome = type === 'income';
    const tx = existing || { amount: '', date: HT.today(), category: D().categories[type][0] || 'Other', source: '', note: '' };
    formSheet({
      title: (existing ? 'Edit ' : 'Add ') + type,
      html: field('Amount', moneyInput('x-amt', tx.amount)) + field('Date', dateInput('x-date', tx.date)) + field('Category', catSelect('x-cat', type, tx.category)) +
        field(isIncome ? 'Source' : 'Description', textInput('x-src', tx.source, isIncome ? 'e.g. Employer or client' : 'e.g. Groceries'), true) +
        field('Notes', textInput('x-note', tx.note, '', 200), true) +
        (!existing && !isIncome ? switchRow('x-rec', 'Repeat every month', 'Adds this expense automatically on the same day each month.') : ''),
      onMount: (wrap) => { if (!existing) setTimeout(() => HT.$('#x-amt', wrap).focus(), 250); },
      onSave: (wrap) => {
        const amount = r2(pos(val(wrap, '#x-amt')));
        if (!(amount > 0)) { HT.toast('Enter an amount'); return false; }
        const date = val(wrap, '#x-date') || HT.today();
        const category = readCat(wrap, 'x-cat', type);
        if (!category) return false;
        const data = { type, amount, date, category, source: val(wrap, '#x-src'), note: val(wrap, '#x-note') };
        if (existing) Object.assign(existing, data);
        else {
          const t = F.addTx(data);
          const rec = HT.$('#x-rec', wrap);
          if (rec && rec.checked) {
            const d = HT.parseKey(date);
            const rule = { id: fid('r'), amount, category, source: data.source, day: d.getDate(), next: HT.dateKey(new Date(d.getFullYear(), d.getMonth() + 1, 1)).slice(0, 7) };
            D().recurring.push(rule);
            t.recurringId = rule.id;
            F.postRecurring();
          }
        }
        HT.toast(isIncome ? 'Income saved' : 'Expense saved');
      },
      onDelete: existing ? () => { F.deleteTx(existing.id); HT.toast('Deleted'); } : null,
    });
  };
  HT.actions['f-add-income'] = () => F.openTx('income');
  HT.actions['f-add-expense'] = () => F.openTx('expense');
  HT.actions['f-edit-tx'] = (el) => {
    const t = D().transactions.find((x) => x.id === el.closest('[data-id]').dataset.id);
    if (!t) return;
    if (t.type === 'income' || t.type === 'expense') F.openTx(t.type, t);
    else F.openTransfer(F.goal(t.goalId), t);
  };

  /* Money put toward a savings goal, or a payment on a debt. */
  F.openTransfer = (g, existing) => {
    const debt = g ? g.kind === 'debt' : existing.type === 'payment';
    const tx = existing || { amount: g.kind === 'debt' ? g.minPayment + g.extraPayment : g.monthly, date: HT.today(), note: '' };
    formSheet({
      title: debt ? 'Debt payment' : 'Add to goal',
      html: (g ? '<p class="muted gap-bottom">' + esc(g.icon + ' ' + g.name) + ' · ' + (debt ? money(g.balance) + ' remaining' : money(g.current) + ' saved') + '</p>' : '') +
        field('Amount', moneyInput('x-amt', tx.amount)) + field('Date', dateInput('x-date', tx.date)) + field('Notes', textInput('x-note', tx.note, '', 200), true),
      saveLabel: existing ? 'Save' : debt ? 'Record payment' : 'Add',
      onSave: (wrap) => {
        const amount = r2(pos(val(wrap, '#x-amt')));
        if (!(amount > 0)) { HT.toast('Enter an amount'); return false; }
        if (existing) F.deleteTx(existing.id);
        F.addTx({ type: debt ? 'payment' : 'contribution', amount, date: val(wrap, '#x-date') || HT.today(), goalId: g ? g.id : null, note: val(wrap, '#x-note') });
        HT.toast(debt ? 'Payment recorded' : 'Added to goal');
      },
      onDelete: existing ? () => { F.deleteTx(existing.id); HT.toast('Removed'); } : null,
    });
  };

  /* ---------- goals ---------- */

  F.openGoal = (existing) => {
    const s = existing ? Object.assign({}, existing) : { kind: 'savings', name: '', icon: ICONS[0], color: HT.COLORS[0], category: D().categories.goal[0] || '', inNetWorth: false };
    const body = () => {
      const debt = s.kind === 'debt';
      let h = existing ? '' : '<div class="field"><span class="label">Goal type</span><div class="segmented" id="g-kind"><button type="button" data-k="savings" aria-pressed="' + !debt + '">Savings goal</button><button type="button" data-k="debt" aria-pressed="' + debt + '">Debt payoff</button></div></div>';
      h += field(debt ? 'Debt name' : 'Goal name', textInput('g-name', s.name, debt ? 'e.g. Truck loan' : 'e.g. Emergency fund'));
      if (debt) {
        h += '<div class="row2">' + field('Original balance', moneyInput('g-original', s.original)) + field('Current balance', moneyInput('g-balance', s.balance)) + '</div>' +
          '<div class="row2">' + field('Minimum payment / mo', moneyInput('g-min', s.minPayment)) + field('Extra payment / mo', moneyInput('g-extra', s.extraPayment), true) + '</div>' +
          '<div class="row2">' + field('Interest rate %', moneyInput('g-rate', s.rate, 'e.g. 6.9'), true) + field('Target payoff date', dateInput('g-date', s.targetDate), true) + '</div>';
      } else {
        h += field('Category', catSelect('g-cat', 'goal', s.category)) +
          '<div class="row2">' + field('Target amount', moneyInput('g-target', s.target)) + field('Current amount', moneyInput('g-current', s.current)) + '</div>' +
          '<div class="row2">' + field('Target date', dateInput('g-date', s.targetDate), true) + field('Monthly contribution', moneyInput('g-monthly', s.monthly), true) + '</div>';
      }
      h += '<div class="field"><span class="label">Icon</span><div class="icon-grid">' + ICONS.map((ic) => '<button type="button" data-icon="' + ic + '" aria-pressed="' + (ic === s.icon) + '">' + ic + '</button>').join('') + '</div></div>' +
        '<div class="field"><span class="label">Color</span><div class="swatches">' + HT.COLORS.map((c) => '<button type="button" data-color="' + c + '" style="--c:' + c + '" aria-pressed="' + (c === s.color) + '" aria-label="Color ' + c + '"></button>').join('') + '</div></div>' +
        switchRow('g-nw', 'Include in net worth', debt ? 'Counts this balance as a liability. Leave off if you list it under Net worth yourself.' : 'Counts the saved amount as an asset. Leave off if you list it under Net worth yourself.', s.inNetWorth);
      return h;
    };
    const read = (wrap) => {
      const n = (id) => r2(pos(val(wrap, id)));
      s.name = val(wrap, '#g-name');
      s.targetDate = val(wrap, '#g-date');
      s.inNetWorth = HT.$('#g-nw', wrap).checked;
      if (s.kind === 'debt') Object.assign(s, { original: n('#g-original'), balance: n('#g-balance'), minPayment: n('#g-min'), extraPayment: n('#g-extra'), rate: pos(val(wrap, '#g-rate')) });
      else Object.assign(s, { target: n('#g-target'), current: n('#g-current'), monthly: n('#g-monthly') });
    };
    formSheet({
      title: existing ? 'Edit goal' : 'New financial goal',
      kind: 'sheet tall',
      html: body(),
      saveLabel: existing ? 'Save changes' : 'Add goal',
      onMount: (wrap) => {
        wrap.addEventListener('click', (e) => {
          let b;
          if ((b = e.target.closest('#g-kind [data-k]'))) {
            read(wrap);
            s.kind = b.dataset.k;
            HT.$('.panel-body', wrap).innerHTML = body();
          } else if ((b = e.target.closest('[data-icon]'))) {
            s.icon = b.dataset.icon;
            HT.$$('[data-icon]', wrap).forEach((x) => x.setAttribute('aria-pressed', x === b));
          } else if ((b = e.target.closest('[data-color]'))) {
            s.color = b.dataset.color;
            HT.$$('[data-color]', wrap).forEach((x) => x.setAttribute('aria-pressed', x === b));
          }
        });
      },
      onSave: (wrap) => {
        read(wrap);
        if (!s.name) { HT.toast('Give the goal a name'); return false; }
        if (s.kind === 'debt') {
          if (!(s.original > 0)) { HT.toast('Enter the original balance'); return false; }
          if (s.balance > s.original) s.original = s.balance;
        } else {
          if (!(s.target > 0)) { HT.toast('Enter a target amount'); return false; }
          const c = readCat(wrap, 'g-cat', 'goal');
          if (c == null) return false;
          s.category = c;
        }
        const fin = D();
        let g;
        if (existing) { Object.assign(existing, s); g = existing; }
        else { fin.goals.push(Object.assign({ id: fid('g'), history: [], createdAt: new Date().toISOString() }, s)); g = fin.goals[fin.goals.length - 1]; }
        HT.data.finance = HT.normalizeFinance(fin);
        F.setGoalValue(F.goal(g.id), F.goalValue(F.goal(g.id)));
        HT.toast(existing ? 'Goal updated' : 'Goal added');
      },
    });
  };
  HT.actions['f-add-goal'] = () => F.openGoal(null);
  HT.actions['f-open-goal'] = (el) => { location.hash = '#/fgoal/' + el.closest('[data-id]').dataset.id; };

  HT.views.fgoal = (id) => {
    const g = F.goal(id);
    if (!g) return head('Goal not found') + '<a class="btn" href="#/finance">Back to Finance</a>';
    const m = F.metrics(g);
    const row = (label, value, strong) => '<div class="frow' + (strong ? ' strong' : '') + '"><span>' + label + '</span><b>' + value + '</b></div>';
    const dash = '—';
    let facts;
    if (m.debt) {
      facts = row('Original debt', money(g.original)) + row('Current balance', money(g.balance)) + row('Amount paid', money(m.paid)) + row('Percent paid', pctText(m.pct)) +
        row('Interest rate', g.rate ? g.rate + '%' : dash) + row('Monthly payment', m.monthly ? money(m.monthly) + (g.extraPayment ? ' (' + money(g.minPayment) + ' + ' + money(g.extraPayment) + ' extra)' : '') : dash) +
        row('Target payoff date', g.targetDate ? monthName(HT.parseKey(g.targetDate)) : dash) + row('Required for target date', m.required != null ? money(r2(m.required)) + ' / month' : dash) +
        row('Estimated payoff', m.estDate || (m.monthly ? 'Payment doesn\'t cover the interest' : dash), true) + (m.interest != null ? row('Estimated interest left to pay', money(m.interest)) : '');
    } else {
      facts = row('Current amount', money(g.current)) + row('Target amount', money(g.target)) + row('Percent complete', pctText(m.pct)) + row('Remaining', money(m.remaining)) +
        row('Target date', g.targetDate ? monthName(HT.parseKey(g.targetDate)) : dash) + row('Current contribution', g.monthly ? money(g.monthly) + ' / month' : dash) +
        row('Required for target date', m.required != null ? money(r2(m.required)) + ' / month' : dash) + row('Estimated completion', m.estDate || dash, true);
    }
    let pace = '';
    if (m.required != null && m.monthly > 0) {
      pace = m.monthly + 0.005 >= m.required
        ? '<p class="pace ok">On pace for your target date.</p>'
        : '<p class="pace behind">' + money(r2(m.required - m.monthly)) + ' / month short of your target date.</p>';
    }
    const txs = D().transactions.filter((t) => t.goalId === g.id).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
    const chart = lineChart(g.history, g.color);
    return '<div class="back-row"><a class="btn btn-ghost" href="#/finance">' + icon.back + '<span>Finance</span></a></div>' +
      '<header class="detail-head" style="--c:' + g.color + '"><span class="ticon" aria-hidden="true">' + esc(g.icon) + '</span><div><h1>' + esc(g.name) + '</h1><p class="muted">' +
      (m.debt ? 'Debt payoff' : 'Savings goal' + (g.category ? ' · ' + esc(g.category) : '')) + '</p></div></header>' +
      '<section class="panel-card" style="--c:' + g.color + '"><div class="gbig">' + (m.debt ? money(m.paid) + ' <small>/ ' + money(g.original) + ' paid</small>' : money(g.current) + ' <small>/ ' + money(g.target) + '</small>') + '</div>' +
      bar(m.pct, null, 'big') + '<div class="grow"><span class="muted">' + pctText(m.pct) + (m.debt ? ' paid' : ' complete') + '</span><span class="muted">' + money(m.remaining) + ' remaining</span></div>' + pace + '</section>' +
      '<div class="actions" data-id="' + g.id + '"><button type="button" class="btn" data-action="f-goal-add">' + icon.plus + '<span>' + (m.debt ? 'Payment' : 'Add money') + '</span></button>' +
      '<button type="button" class="btn" data-action="f-goal-edit">' + icon.edit + '<span>Edit</span></button>' +
      '<button type="button" class="btn btn-danger-ghost" data-action="f-goal-delete">' + icon.trash + '<span>Delete</span></button></div>' +
      '<section class="panel-card gap-top">' + facts + DISCLAIMER + '</section>' +
      '<section class="panel-card"><h3>' + (m.debt ? 'Balance over time' : 'Progress over time') + '</h3>' + (chart || '<p class="muted">A chart appears once the amount has changed on at least two different days.</p>') + '</section>' +
      '<section class="panel-card"><h3>' + (m.debt ? 'Recent payments' : 'Recent contributions') + '</h3>' + (txs.length ? '<ul class="dlist">' + txs.map((t) =>
        '<li data-id="' + t.id + '"><button type="button" class="drow" data-action="f-edit-tx"><span class="dname">' + shortDate(t.date) + (t.note ? '<small>' + esc(t.note) + '</small>' : '') + '</span><span class="dval strong">' + money(t.amount) + '</span></button></li>').join('') + '</ul>'
        : '<p class="muted">None yet.</p>') + '</section>';
  };
  const goalOf = (el) => F.goal(el.closest('[data-id]').dataset.id);
  HT.actions['f-goal-add'] = (el) => F.openTransfer(goalOf(el));
  HT.actions['f-goal-edit'] = (el) => F.openGoal(goalOf(el));
  HT.actions['f-goal-delete'] = async (el) => {
    const g = goalOf(el);
    const ok = await HT.confirm({ title: 'Delete goal?', message: 'This permanently deletes <b>' + esc(g.name) + '</b> and its progress history. Habits linked to it will be unlinked.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    D().goals = D().goals.filter((x) => x.id !== g.id);
    D().transactions = D().transactions.filter((t) => t.goalId !== g.id);
    HT.data.trackers.forEach((t) => { if (t.financeLink && t.financeLink.goalId === g.id) t.financeLink = null; });
    F.snapshot();
    HT.save();
    HT.toast('Goal deleted');
    location.hash = '#/finance';
  };

  HT.views.finance = (tab) => {
    F.postRecurring();
    if (tab === 'activity') return activity();
    if (tab === 'budget') return budget();
    if (tab === 'networth') return networth();
    return overview();
  };

  /* ---------- hooks used by the habit tracker ---------- */

  /* Extra field in the tracker form: optionally link a habit to a goal. */
  F.trackerField = (s) => {
    const goals = D().goals;
    if (!goals.length) return '';
    const link = s.financeLink || {};
    return '<div class="field"><span class="label">Link to a financial goal <em>optional</em></span><div class="row2"><select id="f-link-goal" aria-label="Financial goal"><option value="">Not linked</option>' +
      goals.map((g) => opt(g.id, g.icon + ' ' + g.name, link.goalId || '')).join('') + '</select>' + moneyInput('f-link-amt', link.amount, 'Amount') + '</div>' +
      '<p class="hint">When you complete this habit, the app asks whether to add this amount to the goal. Nothing is added unless you say yes.</p></div>';
  };
  F.readTrackerField = (wrap, s) => {
    const sel = HT.$('#f-link-goal', wrap);
    if (!sel) return;
    const amount = r2(pos(val(wrap, '#f-link-amt')));
    s.financeLink = sel.value && amount > 0 ? { goalId: sel.value, amount } : null;
  };
  F.onHabitDone = async (t, key) => {
    const link = t.financeLink, g = link && F.goal(link.goalId);
    if (!g) return;
    const debt = g.kind === 'debt';
    const ok = await HT.confirm({
      title: debt ? 'Record payment?' : 'Add to goal?',
      message: (debt ? 'Record a <b>' + money(link.amount) + '</b> payment on <b>' : 'Add <b>' + money(link.amount) + '</b> to <b>') + esc(g.name) + '</b>?',
      confirmLabel: debt ? 'Record' : 'Add',
    });
    if (!ok) return;
    F.addTx({ type: debt ? 'payment' : 'contribution', amount: link.amount, date: key, goalId: g.id, note: 'From habit: ' + t.name });
    HT.save();
    HT.toast(money(link.amount) + (debt ? ' paid on ' : ' added to ') + g.name);
  };

  /* Finance block on the Settings screen. */
  F.settingsHTML = () => {
    const c = D().categories;
    const row = (kind, title) => '<div class="set-row" data-kind="' + kind + '"><div><div class="sw-title">' + title + '</div><div class="hint">' + esc(c[kind].join(', ') || 'None') + '</div></div>' +
      '<button type="button" class="btn" data-action="f-cats">Edit</button></div>';
    return '<h2 class="section-title">Finance</h2><section class="panel-card">' +
      '<div class="set-row"><div><div class="sw-title">Currency</div><div class="hint">Used for every amount in Finance.</div></div><select id="f-currency" class="narrow" aria-label="Currency">' +
      F.CURRENCIES.map((x) => opt(x, x, D().currency)).join('') + '</select></div>' +
      row('income', 'Income categories') + row('expense', 'Expense and budget categories') + row('goal', 'Financial goal categories') + '</section>';
  };
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'f-currency') return;
    D().currency = e.target.value;
    HT.save();
    HT.toast('Currency set to ' + e.target.value);
  });
  HT.actions['f-cats'] = (el) => {
    const kind = el.closest('[data-kind]').dataset.kind;
    const list = D().categories[kind].slice();
    const body = () => '<ul class="dlist">' + list.map((c, i) => '<li><div class="drow"><span class="dname">' + esc(c) + '</span><button type="button" class="icon-btn" data-rm="' + i + '" aria-label="Remove ' + esc(c) + '">' + icon.x + '</button></div></li>').join('') + '</ul>' +
      '<div class="add-inline"><input id="c-new" type="text" maxlength="30" placeholder="New category"><button type="button" class="btn" data-addcat>Add</button></div>' +
      '<p class="hint">Removing a category doesn\'t change entries already recorded with it.</p>';
    formSheet({
      title: { income: 'Income categories', expense: 'Expense categories', goal: 'Goal categories' }[kind],
      html: body(),
      onMount: (wrap) => {
        const add = () => {
          const v = val(wrap, '#c-new');
          if (v && !list.includes(v)) list.push(v);
          HT.$('.panel-body', wrap).innerHTML = body();
        };
        wrap.addEventListener('click', (e) => {
          const rm = e.target.closest('[data-rm]');
          if (rm) { list.splice(+rm.dataset.rm, 1); HT.$('.panel-body', wrap).innerHTML = body(); }
          else if (e.target.closest('[data-addcat]')) add();
        });
        wrap.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'c-new') add(); });
      },
      onSave: (wrap) => {
        const pending = val(wrap, '#c-new');
        if (pending && !list.includes(pending)) list.push(pending);
        D().categories[kind] = list;
      },
    });
  };
})();
