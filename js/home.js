/* Habits — Home: one place for habits and health. Home itself is the daily dashboard (HT.views.today in
   views.js, also reachable as #/home); this file adds the shared section bar that ties the habit and
   health screens together, the overview figures under the daily ring, and the quick "Log" sheet.
   It stores nothing of its own. */
(function () {
  'use strict';
  const HT = window.HT;
  const esc = HT.esc;
  const Hm = (HT.home = {});

  HT.views.home = () => HT.views.today();

  /* Secondary navigation shown on every Home screen. Each entry opens an existing screen. */
  Hm.SECTIONS = [
    ['home', 'Today', '#/home'], ['habits', 'Habits', '#/habits'], ['nutrition', 'Nutrition', '#/nutrition'], ['workouts', 'Workouts', '#/health/workouts'],
    ['strength', 'Strength', '#/strength'], ['weight', 'Weight', '#/weight'], ['daily', 'Daily log', '#/health/daily'], ['supplements', 'Supplements', '#/health/supplements'],
    ['health', 'Insights', '#/health'],
  ];
  HT.homeNav = (cur) => '<nav class="hsub" aria-label="Home sections">' + Hm.SECTIONS.map((t) => '<a href="' + t[2] + '"' + (t[0] === cur ? ' aria-current="page"' : '') + '>' + t[1] + '</a>').join('') + '</nav>';

  /* Four small figures under the daily ring: calories, water (or protein), workouts and tasks. */
  const cell = (href, label, value, sub, pct, state) => '<a class="ov-cell" href="' + href + '"><span class="ov-l">' + label + '</span><span class="ov-v">' + value + '</span>' +
    '<span class="ov-s">' + (sub || '&nbsp;') + '</span><span class="ov-bar' + (state ? ' ' + state : '') + '"><i style="width:' + Math.max(0, Math.min(100, pct || 0)) + '%"></i></span></a>';
  Hm.overviewStats = (key) => {
    const N = HT.nutrition, H = HT.health, S = HT.schedule;
    const out = [];
    if (N && HT.data.nutrition) {
      const n = N.dayTotal(key).n, t = N.targets();
      const kcal = Math.round(n.kcal || 0);
      out.push(cell('#/nutrition', 'Calories', kcal.toLocaleString(), t.kcal ? 'of ' + Math.round(t.kcal).toLocaleString() : 'kcal today', t.kcal ? (kcal / t.kcal) * 100 : 0, t.kcal && kcal > t.kcal * 1.1 ? 'over' : ''));
    }
    const wm = H && HT.data.health ? HT.data.health.metrics.find((m) => m.kind === 'water' && m.enabled) : null;
    if (wm) {
      const v = H.metricValue(wm, key) || 0, tg = H.metricTarget(wm);
      out.push(cell('#/health/daily', 'Water', esc(H.units.fmtWater(v)), tg ? 'of ' + esc(H.units.fmtWater(tg)) : 'today', tg ? (v / tg) * 100 : 0));
    } else if (N && HT.data.nutrition) {
      const p = N.dayTotal(key).n.protein || 0, tp = N.targets().protein;
      out.push(cell('#/nutrition', 'Protein', Math.round(p) + ' g', tp ? 'of ' + Math.round(tp) + ' g' : 'today', tp ? (p / tp) * 100 : 0));
    }
    if (H && HT.data.health) {
      const today = H.workoutsOn(key).length;
      const ws = HT.weekStart(key), week = H.workoutStats(ws, HT.addDays(ws, 6)).count;
      out.push(cell('#/health/workouts', 'Workouts', today ? String(today) : '—', today ? 'today · ' + week + ' this week' : week + ' this week', today ? 100 : 0, today ? 'done' : ''));
    }
    if (S && HT.data.schedule) {
      const t = S.tasksOn(key);
      out.push(cell('#/schedule', 'Tasks', t.total ? t.done + ' / ' + t.total : '—', t.total ? (t.total - t.done ? (t.total - t.done) + ' to do' : 'all done') : 'none today', t.total ? (t.done / t.total) * 100 : 0, t.total && t.done === t.total ? 'done' : ''));
    }
    return out.length ? '<div class="ov-stats">' + out.join('') + '</div>' : '';
  };

  /* Quick "Log" sheet: the most common entries from anywhere in the app, two taps away. */
  const QUICK = [
    ['🍽️', 'Food', 'n-add', () => HT.nutrition], ['💧', 'Water', 'home-water', () => HT.health && HT.data.health.metrics.some((m) => m.kind === 'water' && m.enabled)],
    ['🏋️', 'Workout', 'h-wo-log', () => HT.health], ['📈', 'Lift', 'st-log', () => HT.strength], ['⚖️', 'Weight', 'w-log', () => HT.weight],
    ['💊', 'Supplements', 'home-supps', () => HT.health], ['☑️', 'Task', 'sc-new-task', () => HT.schedule], ['📌', 'Event', 'sc-new', () => HT.schedule],
    ['✅', 'New habit', 'add-tracker', () => true], ['🧾', 'Expense', 'f-add-expense', () => HT.finance], ['💵', 'Income', 'f-add-income', () => HT.finance],
  ];
  HT.actions['home-quick'] = () => {
    const items = QUICK.filter((q) => q[3]());
    HT.openSheet({
      title: 'Log or add',
      html: '<div class="qa-grid">' + items.map((q) => '<button type="button" class="qa-btn" data-qa="' + q[2] + '"><span class="qa-i" aria-hidden="true">' + q[0] + '</span><span>' + q[1] + '</span></button>').join('') + '</div>',
      onMount: (wrap, close) => {
        wrap.addEventListener('click', (e) => {
          const b = e.target.closest('[data-qa]');
          if (!b) return;
          const fn = HT.actions[b.dataset.qa];
          close();
          if (fn) setTimeout(() => fn(b), 230); // let this sheet close before the next one opens
        });
      },
    });
  };
  HT.actions['home-water'] = () => {
    const H = HT.health, wm = HT.data.health.metrics.find((m) => m.kind === 'water' && m.enabled);
    if (!H || !wm) return;
    const key = HT.today();
    H.setMetric(wm, key, (H.metricValue(wm, key) || 0) + (wm.step || 250));
    HT.toast('Water: ' + H.units.fmtWater(H.metricValue(wm, key)) + ' today');
    HT.render();
  };
  HT.actions['home-supps'] = () => { if (HT.health) HT.health.vs.suppDay = null; location.hash = '#/health/supplements'; };
})();
