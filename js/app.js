/* Habits — boot: routing, navigation, theme, reminders, service worker. */
(function () {
  'use strict';
  const HT = window.HT;

  const TABS = [
    ['today', 'Today'],
    ['finance', 'Finance'],
    ['history', 'History'],
    ['stats', 'Stats'],
    ['trackers', 'Trackers'],
    ['settings', 'Settings'],
  ];

  /* ---------- theme ---------- */
  HT.applyTheme = () => {
    const theme = HT.data.settings.theme;
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
    else root.removeAttribute('data-theme');
    try { localStorage.setItem('habits.theme', theme); } catch (err) { /* private mode */ }
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    const meta = HT.$('meta[name="theme-color"]');
    if (meta && bg) meta.setAttribute('content', bg);
  };
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => HT.applyTheme();
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  /* ---------- routing ---------- */
  HT.route = { name: 'today', arg: null };
  let renderedDay = null;

  function parseHash() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    const name = HT.views[parts[0]] ? parts[0] : 'today';
    return { name, arg: parts[1] ? decodeURIComponent(parts[1]) : null };
  }

  HT.render = () => {
    const r = HT.route;
    renderedDay = HT.today();
    HT.$('#view').innerHTML = HT.views[r.name](r.arg);
    const tab = r.name === 'tracker' ? 'trackers' : r.name === 'fgoal' ? 'finance' : r.name;
    HT.$$('#nav a').forEach((a) => {
      if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  };

  function onRoute() {
    const next = parseHash();
    const changed = next.name !== HT.route.name || next.arg !== HT.route.arg;
    HT.route = next;
    if (changed && next.name === 'tracker') HT.vs.tcalMonth = null;
    HT.closeAllSheets();
    HT.render();
    if (changed) window.scrollTo(0, 0);
  }

  function buildNav() {
    HT.$('#nav').innerHTML = '<div class="brand"><span class="brand-mark">' + HT.icon.today + '</span>Habits</div>' +
      TABS.map((t) => '<a href="#/' + t[0] + '" data-tab="' + t[0] + '">' + HT.icon[t[0]] + '<span>' + t[1] + '</span></a>').join('');
  }

  /* ---------- events ---------- */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    if (HT.justDragged()) { e.preventDefault(); return; }
    const fn = HT.actions[el.dataset.action];
    if (fn) fn(el, e);
  });
  document.addEventListener('sorted', (e) => HT.reorder(e.detail.ids));

  /* ---------- reminders ----------
     There is no server, so reminders are checked by the page itself: every 30 seconds while the
     app is open, and whenever it comes back to the foreground. */
  const canNotify = () => 'Notification' in window && Notification.permission === 'granted' && HT.data.settings.notifications;

  async function showNotification(title, body) {
    const opts = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'habits-reminder' };
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
      if (reg && reg.showNotification) await reg.showNotification(title, opts);
      else new Notification(title, opts);
      return true;
    } catch (err) {
      console.warn('Notification failed', err);
      return false;
    }
  }

  HT.enableNotifications = async (quiet) => {
    if (!('Notification' in window)) {
      if (!quiet) HT.toast('Notifications aren\'t available in this browser');
      return false;
    }
    let perm = Notification.permission;
    if (perm === 'default') {
      try { perm = await Notification.requestPermission(); } catch (err) { perm = 'denied'; }
    }
    HT.data.settings.notifications = perm === 'granted';
    HT.save();
    if (!quiet) HT.toast(perm === 'granted' ? 'Notifications on' : 'Notifications are blocked for this site');
    if (HT.route.name === 'settings') HT.render();
    return perm === 'granted';
  };
  HT.actions['notif-on'] = () => HT.enableNotifications(false);
  HT.actions['notif-off'] = () => { HT.data.settings.notifications = false; HT.save(); HT.render(); };
  HT.actions['notif-test'] = async () => {
    const ok = await showNotification('Habits', 'Notifications are working.');
    HT.toast(ok ? 'Test sent' : 'Couldn\'t show a notification here');
  };

  function checkReminders() {
    const today = HT.today();
    const now = new Date();
    const hm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    let log = HT.data.meta.notified;
    if (!log || log.date !== today || !Array.isArray(log.ids)) log = HT.data.meta.notified = { date: today, ids: [] };
    const due = HT.data.trackers.filter((t) =>
      t.status === 'active' && t.reminder.enabled && t.reminder.time <= hm && !log.ids.includes(t.id) && HT.isExpected(t, today) && !HT.isDone(t, today));
    if (!due.length) return;
    due.forEach((t) => log.ids.push(t.id));
    HT.save();
    const names = due.map((t) => t.icon + ' ' + t.name).join(', ');
    if (document.visibilityState !== 'visible' && canNotify()) showNotification('Habit reminder', names);
    else HT.toast('Reminder: ' + names);
  }

  function tick() {
    if (renderedDay && renderedDay !== HT.today()) {
      // Midnight passed while the app was open — move every screen on to the new day.
      HT.vs.histDate = null;
      HT.vs.histMonth = null;
      if (!HT.$('#overlay-root').children.length) HT.render();
    }
    checkReminders();
  }

  /* ---------- boot ---------- */
  HT.load();
  HT.applyTheme();
  buildNav();
  HT.route = parseHash();
  HT.render();
  window.addEventListener('hashchange', onRoute);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
  setInterval(tick, 30000);
  setTimeout(checkReminders, 1500);
  if (HT.loadError) HT.toast('Saved data could not be read. Import a backup from Settings.');

  // Ask the browser not to evict our data under storage pressure.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // Offline support. On localhost the worker is opt-in (?sw) so edits show up immediately.
  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if ('serviceWorker' in navigator && (!isLocal || location.search.includes('sw'))) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker failed', err));
    });
  }
})();
