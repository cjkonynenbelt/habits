/* Habits — More: settings, profile, data, archived items and help, grouped in one menu. Each row opens an
   existing screen or a settings section (HT.views.settings(section) in views.js). Stores nothing itself. */
(function () {
  'use strict';
  const HT = window.HT;
  const esc = HT.esc, icon = HT.icon;
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const head = (eyebrow, title, right) => '<header class="page-head"><div><div class="eyebrow">' + eyebrow + '</div><h1>' + title + '</h1></div>' + (right || '') + '</header>';
  const back = '<div class="back-row"><a class="btn btn-ghost" href="#/more">' + icon.back + '<span>More</span></a></div>';

  /* [icon, title, description, href | action] */
  const row = (r) => {
    const inner = '<span class="mi-ico" aria-hidden="true">' + r[0] + '</span><span class="mr-t"><span class="mr-n">' + esc(r[1]) + '</span>' + (r[2] ? '<span class="mr-d">' + esc(r[2]) + '</span>' : '') + '</span><span class="chev">' + icon.next + '</span>';
    return '<li>' + (r[3].charAt(0) === '#' ? '<a class="more-row" href="' + r[3] + '">' + inner + '</a>' : '<button type="button" class="more-row" data-action="' + r[3] + '">' + inner + '</button>') + '</li>';
  };
  const group = (title, rows) => '<h2 class="section-title">' + title + '</h2><section class="panel-card tight"><ul class="more-list">' + rows.filter(Boolean).map(row).join('') + '</ul></section>';

  function menu() {
    const archived = HT.data.trackers.filter((t) => t.status !== 'active').length + (HT.data.health ? HT.data.health.routines.filter((r) => r.status === 'paused').length : 0);
    const p = HT.data.nutrition && HT.data.nutrition.profile;
    return head('More', 'More') +
      '<div class="more-grid">' +
      group('You', [
        HT.micros ? [icon.user, 'Profile', p && p.sex && (p.age || p.birth) ? 'Age, sex, height, activity and goal' : 'Add your age, sex and height', 'mi-profile'] : null,
        HT.micros ? [icon.target, 'Nutrition targets', 'Calories, macros, vitamins and minerals', '#/nutrition/targets'] : null,
        [icon.lock, 'Account & storage', 'No sign-in — your data stays on this device', '#/more/account'],
      ]) +
      group('Customize', [
        [icon.grid, 'Home dashboard', 'Choose and order the sections on Home', '#/settings/home'],
        [icon.palette, 'Appearance', 'Light, dark or follow the system', '#/settings/appearance'],
        [icon.bell, 'Notifications', 'Habit and weigh-in reminders', '#/settings/reminders'],
        [icon.today, 'Habit preferences', 'Order, daily completion, start of the week', '#/settings/habits'],
        [icon.health, 'Health & units', 'Weight, water and distance units, metrics, stock', '#/settings/health'],
        HT.finance ? [icon.finance, 'Finance settings', 'Currency and categories', '#/settings/finance'] : null,
      ]) +
      group('Manage', [
        [icon.trackers, 'All habits', 'Edit, pause, archive or reorder', '#/habits/manage'],
        [icon.archive, 'Archived & paused', archived ? plural(archived, 'item') : 'Nothing archived', '#/more/archived'],
        HT.health ? [icon.pill, 'Supplement routine', 'Schedules and supplement facts', '#/health/supplements'] : null,
        HT.health ? [icon.cart, 'Health shopping list', 'Vitamins, gear and restocking', '#/health/shopping'] : null,
        HT.nutrition ? [icon.food, 'Foods & recipes', 'Your saved foods and recipes', '#/nutrition/foods'] : null,
      ]) +
      group('Data', [
        [icon.download, 'Backup, export & import', HT.data.meta.lastBackup ? 'Last backup ' + new Date(HT.data.meta.lastBackup).toLocaleDateString() : 'No backup yet', '#/settings/data'],
        [icon.phone, 'Install on your phone', 'Add to the Home Screen and use offline', '#/settings/install'],
      ]) +
      group('Help', [
        [icon.help, 'Help & tips', 'Where things are and how to use them', '#/more/help'],
        [icon.info, 'About', 'Version and how your data is handled', '#/more/about'],
      ]) + '</div>';
  }

  function archived() {
    const st = (s) => HT.data.trackers.filter((t) => t.status === s);
    const tRow = (t) => '<li class="trow" data-id="' + t.id + '" style="--c:' + t.color + '"><button type="button" class="tmain" data-action="open-tracker"><span class="ticon" aria-hidden="true">' + esc(t.icon) + '</span>' +
      '<span class="tinfo"><span class="tname">' + esc(t.name) + '</span><span class="tsub"><span class="tprog">' + plural(HT.entryCount(t.id), 'day') + ' of history kept</span></span></span></button>' +
      '<div class="tctl"><button type="button" class="btn btn-sm" data-action="' + (t.status === 'archived' ? 'archive-tracker' : 'pause-tracker') + '">' + (t.status === 'archived' ? 'Restore' : 'Resume') + '</button></div></li>';
    const arch = st('archived'), paused = st('paused');
    const routines = HT.data.health ? HT.data.health.routines.filter((r) => r.status === 'paused') : [];
    let html = back + head('More', 'Archived & paused');
    if (!arch.length && !paused.length && !routines.length) return html + '<section class="empty"><h2>Nothing archived</h2><p>Habits you archive or pause, and supplements you pause, are kept here with their history so you can bring them back.</p></section>';
    if (arch.length) html += '<h2 class="section-title first">Archived habits</h2><ul class="tlist off">' + arch.map(tRow).join('') + '</ul>';
    if (paused.length) html += '<h2 class="section-title">Paused habits</h2><ul class="tlist off">' + paused.map(tRow).join('') + '</ul>';
    if (routines.length) html += '<h2 class="section-title">Paused supplements</h2><section class="panel-card tight"><ul class="dlist">' + routines.map((r) => '<li data-id="' + r.id + '"><button type="button" class="drow" data-action="h-rt-edit"><span class="dname">' + esc(r.name) + '<small>Paused — open to resume</small></span><span class="chev">' + icon.next + '</span></button></li>').join('') + '</ul></section>';
    return html + '<p class="hint">Archived habits don\'t appear on Home and don\'t count as missed. Their history stays in Schedule → History.</p>';
  }

  function account() {
    let bytes = 0;
    try { bytes = (localStorage.getItem('habits.data') || '').length; } catch (e) { /* storage blocked */ }
    const d = HT.data, n = (x) => (x ? x.length : 0);
    const rows = [
      ['Habits', n(d.trackers)], ['Days with habit entries', Object.keys(d.entries).length], ['Events and tasks', d.schedule ? n(d.schedule.events) : 0],
      ['Food diary entries', d.nutrition ? n(d.nutrition.entries) : 0], ['Workouts', d.health ? n(d.health.workouts) : 0], ['Weigh-ins', d.weight ? n(d.weight.entries) : 0],
      ['Transactions', d.finance ? n(d.finance.transactions) : 0],
    ];
    return back + head('More', 'Account & storage') +
      '<section class="panel-card"><h3>Account</h3><p class="muted">There is no account or sign-in. Everything you enter is saved in this browser on this device only and is never sent to a server.</p>' +
      '<p class="hint">Online lookups you turn on (Open Food Facts, meal photos) send only what they need — a barcode, search words or a photo.</p></section>' +
      '<section class="panel-card"><h3>Stored on this device</h3>' + rows.map((r) => '<div class="frow"><span>' + r[0] + '</span><b>' + r[1].toLocaleString() + '</b></div>').join('') +
      '<div class="frow"><span>Space used</span><b>' + (bytes > 1e6 ? (bytes / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1000)) + ' KB') + '</b></div>' +
      (HT.storageOK ? '' : '<p class="danger-text">Saving is failing — storage may be full. Export a backup now.</p>') + '</section>' +
      '<a class="btn wide" href="#/settings/data">Backup, export & import</a>';
  }

  const HELP = [
    ['Getting around', 'The bar at the bottom has four tabs. <b>Home</b> is today: habits, food, water, workouts and supplements, with a section bar to open Habits, Nutrition, Workouts, Strength, Weight, the Daily log, Supplements and Insights. <b>Schedule</b> has your calendar, a timeline of everything you logged, and history. <b>Finance</b> is money only. <b>More</b> holds settings, your profile, data and help.'],
    ['Logging fast', 'Tap <b>Log</b> at the top of Home to add food, water, a workout, a lift, a weigh-in, supplements, a task, an event, a habit or a transaction from one place. Habit cards on Home log with one tap.'],
    ['Plans vs. what you did', 'Events and tasks you add live in Schedule → Calendar. Priorities and open tasks for today show on Home. Everything you actually logged — from every section — appears in Schedule → Timeline; you can filter it by category.'],
    ['Fixing a past day', 'Schedule → History shows each day\'s habits; tap one to correct it. The day also lists workouts, meals, weigh-ins and supplements, each linking to where you can edit it.'],
    ['Customizing Home', 'More → Home dashboard lets you switch sections on or off and press-and-hold to reorder them.'],
    ['Your data', 'It stays on this device. Back up from More → Backup, export & import, and keep the file somewhere safe (Files, iCloud, email). Importing a backup replaces what is on the device.'],
    ['Reminders', 'There is no server, so reminders only arrive while the app is open or was used recently. Missed reminders show when you open the app. For anything that must alert you, also set a phone alarm.'],
    ['Something not working?', 'Close the app completely and open it again — updates load on the next open. If a problem stays, back up your data first, then check the project page on GitHub.'],
  ];
  function help() {
    return back + head('More', 'Help & tips') + HELP.map((h, i) => '<details class="panel-card help-item"' + (i === 0 ? ' open' : '') + '><summary>' + h[0] + '</summary><p>' + h[1] + '</p></details>').join('') +
      '<p class="hint center"><a class="linkish" href="https://github.com/cjkonynenbelt/habits" target="_blank" rel="noopener">Project page on GitHub</a></p>';
  }
  function about() {
    return back + head('More', 'About') + '<section class="panel-card"><div class="frow"><span>App</span><b>Habits</b></div><div class="frow"><span>Data format</span><b>v' + HT.VERSION + '</b></div>' +
      '<div class="frow"><span>Works offline</span><b>Yes, once installed</b></div></section>' +
      '<section class="panel-card"><h3>Good to know</h3><p class="muted">Nutrition, vitamin and finance figures are estimates for your own tracking — not medical or financial advice. Reference values for nutrients come from the Dietary Reference Intakes (US National Academies, also used by Health Canada).</p></section>';
  }

  HT.views.more = (sub) => {
    if (sub === 'archived') return archived();
    if (sub === 'account') return account();
    if (sub === 'help') return help();
    if (sub === 'about') return about();
    return menu();
  };
})();
