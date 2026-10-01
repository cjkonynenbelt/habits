# Habits — daily habit tracker + personal finance

A private, installable web app for tracking daily habits and personal finance goals.
It is a plain static site (HTML, CSS, JavaScript — no build step, no server, no account), made to be
hosted for free on GitHub Pages and used mainly from a phone.

**All data stays in your browser.** Nothing is sent anywhere; there are no analytics, no bank
connections and no third-party scripts.

## What's in it

**Habits**

- **Today** — date, completion ring, and every tracker due today with one-tap logging
- **Seven tracker types** — Yes/No, Number, Quantity, Duration, Time, Counter, Percentage
- **Custom everything** — name, description, icon, colour, goal, unit (or your own), schedule,
  start date, reminder, and whether it counts toward the daily %
- **Schedules** — every day, weekdays, weekends, specific days, or every N days
- **Streaks** — current, best, total completions, completion rate (off days never break a streak)
- **History** — monthly calendar; tap any day to see or correct what was recorded
- **Stats** — this week / this month overview, plus a detail page per tracker
- **Reorder** — press and hold a tracker, then drag
- **Pause / archive / delete** — archived trackers keep their history

**Finance** (a separate section)

- **Overview** — net worth, this month's income / expenses / saved, savings rate
- **Savings goals and debt payoff** — progress, remaining, required monthly amount, estimated finish date
- **Income and expenses** — manual entries, your own categories, optional monthly recurring expenses
- **Budget** — planned income and per-category limits with under / near / over status
- **Net worth** — assets and liabilities with a history chart
- **Activity** — everything in one list, filtered by week, month, year or a custom range
- **Optional habit link** — a habit such as "Save $20" can offer to add that amount to a goal

**Everywhere**

- Light / dark / system theme
- Export, import and backup as one JSON file (habits + finance)
- Works offline and installs to the home screen (PWA)

## Project structure

```
habit-tracker/
├── index.html              App shell
├── manifest.webmanifest    PWA manifest (name, icons, colours)
├── sw.js                   Service worker — offline cache
├── .nojekyll               Tells GitHub Pages to serve files as-is
├── css/
│   └── app.css             Design system and all styles
├── js/
│   ├── core.js             Data: storage, tracker types, schedules, streaks, stats
│   ├── ui.js               Helpers: icons, sheets/dialogs, toasts, drag-to-reorder
│   ├── views.js            Habit screens and the tracker form
│   ├── finance.js          The whole Finance section (data, maths, screens)
│   └── app.js              Routing, navigation, theme, reminders, startup
├── icons/                  App icons (192, 512, maskable, Apple touch)
├── dev/
│   └── serve.ps1           Optional local preview server (not used by GitHub Pages)
└── README.md
```

## Put it on GitHub Pages

You only do this once. It is free.

### 1. Create a repository

1. Sign in at <https://github.com> (create a free account if you don't have one).
2. Click **+** (top right) → **New repository**.
3. Name it, for example, `habits`. Set it to **Public** (GitHub Pages on a free account needs a public
   repository — your habit and finance data is *not* in the repository, only the app's code is).
4. Click **Create repository**.

### 2. Put the project in the repository

**Easiest (no tools needed):**

1. On the new repository page click **uploading an existing file**.
2. Open the `habit-tracker` folder on your computer, select **everything inside it**
   (`index.html`, `sw.js`, `manifest.webmanifest`, `css`, `js`, `icons`, …) and drag it into the browser.
   Upload the *contents* of the folder, not the folder itself, so `index.html` sits at the top level.
3. Click **Commit changes**.

**Or with Git** (install it from <https://git-scm.com> first), from inside the `habit-tracker` folder:

```bash
git init
git add .
git commit -m "Habits app"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/habits.git
git push -u origin main
```

### 3. Turn on GitHub Pages

1. In the repository go to **Settings** → **Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Choose branch **main** and folder **/ (root)**, then **Save**.
4. Wait a minute or two and refresh. The page shows your address:
   `https://YOUR-USERNAME.github.io/habits/`

No other deployment configuration is needed.

### 4. Open it on your phone and add it to the home screen

**iPhone**

1. Open the address in **Safari** (it must be Safari).
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. Open **Habits** from the home screen from now on. It runs full screen and works offline.

**Android**

1. Open the address in Chrome.
2. Tap the **⋮** menu → **Install app** (or **Add to Home screen**).

> **Install first, then add your trackers.** On iPhone the home-screen app keeps its own storage,
> separate from Safari. Anything you create in the Safari tab will not appear in the installed app
> (use Settings → Export in Safari and Import in the app to move it across).

## Using the app

- **Add a tracker** — tap **Add Tracker**, pick a type, set a goal, save. The "Quick start" chips
  fill in common ones.
- **Log** — tap the circle (Yes/No), **+ / −** (Counter), the **+amount** button (Quantity, Duration),
  or **Log** to type a value. The pencil lets you type an exact amount or set the total.
- **Details** — tap a tracker's name for streaks, charts and its calendar. Tap any past day there to fix it.
- **Reorder** — press and hold a tracker for about half a second, then drag.
- **Finance** — add goals with **Add Financial Goal**, record money with **Income** / **Expense**,
  and list what you own and owe under **Net worth**.
- **Back up** — Settings → **Back up** (or **Export**) saves a `habits-backup-DATE.json` file.
  **Import** restores it. Do this now and then, and always before clearing browser data or changing phones.

## Limitations (because this is a static site with no server)

- **Data lives in one browser on one device.** There is no sync between phone and computer. Move data
  with Export → Import. Clearing Safari/Chrome website data deletes it — keep a backup.
- **iPhone storage.** Safari can clear data for sites that haven't been opened for a while. Apps added
  to the Home Screen are not subject to that, which is another reason to install it.
- **Reminders are best-effort.** With no server there is nothing to push a notification while the app is
  closed. Reminders are checked while the app is open and whenever you return to it; on opening, the app
  shows any reminder you missed. On iPhone, notifications only work at all after adding to the Home Screen
  (iOS 16.4+). For an alarm that must fire, also set one in the phone's Clock or Reminders app.
- **Finance figures are estimates** (payoff dates, interest, required monthly amounts) for your own planning,
  not financial advice. Everything is typed in by hand; the app never connects to a bank.
- **One budget.** The monthly budget is a single plan applied to the current month, not a separate
  budget per month.

## Updating the app later

Upload the changed files to the repository (or `git push`). Also change the version on the first line of
code in `sw.js` (`const CACHE = 'habits-v1'` → `'habits-v2'`) so phones fetch the new files. Open the app
twice after updating: the first open downloads the update, the second one shows it. Your data is not affected.

## Data format

One JSON object, saved in the browser's `localStorage` under `habits.data` and used as-is for export/import:

```json
{
  "version": 2,
  "trackers": [],
  "entries": { "2026-10-01": { "trackerId": 3 } },
  "settings": {},
  "finance": { "currency": "CAD", "goals": [], "transactions": [], "recurring": [],
               "budget": {}, "accounts": [], "netWorthHistory": [], "categories": {} }
}
```

`version` lets future releases migrate older data (see `MIGRATIONS` in `js/core.js`; version 1 backups,
from before Finance existed, still import). New tracker types are added with `HT.registerType` in `js/core.js`.

## Preview locally (optional)

Windows PowerShell, from the `habit-tracker` folder:

```bash
powershell -ExecutionPolicy Bypass -File dev/serve.ps1
```

Then open <http://localhost:8095>. On localhost the offline cache is off unless you add `?sw` to the address.
