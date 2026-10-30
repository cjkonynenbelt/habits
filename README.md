# Habits — daily habit tracker + personal finance

A private, installable web app for tracking daily habits and personal finance goals.
It is a plain static site (HTML, CSS, JavaScript — no build step, no server, no account), made to be
hosted for free on GitHub Pages and used mainly from a phone.

**All data stays in your browser.** There are no accounts, analytics or bank connections. The only
outside services are optional Nutrition features: barcode lookups and product search on Open Food Facts
(only the barcode or search words are sent), meal-photo recognition on LogMeal (only if you add your own
token), and two libraries downloaded from jsDelivr the first time you scan a barcode or a label.

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

**Health & fitness** (the Health tab: Overview · Weight · Daily · Workouts · Supplements · Shopping)

- **Weight** — quick weigh-in from Today; date, time and an optional note; several weigh-ins a day are kept
  and averaged for that day. Graph for 1W / 1M / 3M / 6M / 1Y / All with a 7-day average line, tap-to-read
  points, change / average / range for the selected period, optional goal that works for losing, gaining or holding.
  lb or kg (stored in kg, so switching never changes your data). Optional weigh-in reminder.
- **Daily log** — water, sleep (hours + minutes), steps, exercise, calories, protein, body weight and your own
  metrics. Turn each on or off, set optional targets, reorder, review and edit past days. A metric can be linked
  to an existing habit, which then stays the single record (nothing is tracked twice).
- **Workouts** — quick entry (activity + minutes) or full detail: distance, exercises with sets, reps and weight,
  notes. Reusable templates, 8-week chart, this-week / 30-day totals, best performances from your own log,
  and an optional "also mark this habit done".
- **Supplements** — your routine (name, serving as on the label, schedule, time of day), a daily Taken / Skip
  checklist, a 14-day history that separates "skipped" from "not logged", pause or remove. Tracking only: the app
  never suggests products, doses or combinations.
- **Shopping & inventory** — vitamins, supplements, protein and gear with category, status (research / want /
  restock / purchased / not buying), priority, quantity, estimated price, store, link, notes, try-vs-regular,
  stock on hand, days of supply, running-low warnings, actual price paid, recurring monthly cost. Filter and sort;
  marking an item purchased can optionally add a Finance expense.
- **Overview** — weight change and average, workout frequency and time, daily averages, chosen health habits,
  supplement logging and health spending for 1M / 3M / 6M / 1Y, shown only when there is enough data.
- **Today screen widgets** — habits, weight, health metrics, workout, supplement checklist and health purchases;
  choose and reorder them in Settings → Today screen.

**Nutrition** (Health → Nutrition)

- **Diary** — breakfast, lunch, dinner, snacks and your own meal categories; each entry shows serving, calories,
  protein, carbohydrate and fat. Edit, delete, duplicate, move between meals, log past days.
- **Dashboard** — calories eaten / left, protein, carbohydrate, fat, fibre, sugars, sodium and any other nutrients
  the foods list. Targets are optional and set by you.
- **Barcode scanner** — phone camera (or a photo, or typing the number) → Open Food Facts product: name, brand,
  serving, nutrition, ingredients, allergens. Choose how much you had; products are cached for 30 days and can be
  favourited. Not found → scan its label, search, or enter it yourself.
- **Nutrition label scanner** — photograph a Canadian (or US) Nutrition Facts table; text recognition runs on the
  phone and fills an editable form you confirm before saving to your foods.
- **Photograph your meal** — with your own LogMeal token, recognised foods and estimated grams appear as an
  editable list (rename, change grams, remove, add) that you confirm before saving. Without a token you build the
  meal by hand from your foods, recipes or quick add. Photo entries are marked as estimates.
- **Recipes** — ingredients, quantities and servings → nutrition per serving; log a serving in one tap.
- **Trends** — week / month / 3 months: averages per logged day, how often calorie and protein targets were met,
  and a week-by-week table next to weight change and workouts.
- Health's "Calories" and "Protein" metrics read the food diary on days you log food, so nothing is entered twice.

**Everywhere**

- Light / dark / system theme
- Export, import and backup as one JSON file (habits + finance + weight + health)
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
│   ├── weight.js           Body weight (data, maths, screen, graph, Today widget)
│   ├── health.js           Health & fitness: daily metrics, workouts, supplements, shopping, overview, widgets
│   ├── nutrition.js        Food diary, Open Food Facts, barcode / label / meal-photo scanning, recipes, trends
│   └── app.js              Routing, navigation, theme, reminders, startup
├── icons/                  App icons (192, 512, maskable, Apple touch)
├── tests/                  Node tests for the data logic (no dependencies)
├── package.json            Only holds the "npm test" script; there is no build step
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

## Setting up meal-photo recognition (optional)

1. Create an account at <https://logmeal.com/api> (30-day free trial with all features, then a paid plan).
2. In LogMeal, get an **APIUser** token — their docs say image recognition only works with APIUser tokens, and
   nutrition values need the trial or their Monitor plan or higher.
3. In Habits: Health → Nutrition → Settings → paste it into "LogMeal API token" and save.

The token is stored only on that device, sent only to LogMeal with a meal photo, and never put in backups —
so add it again on each device. Because there is no server, the token lives in your browser rather than on a
server; anyone with access to your unlocked phone could read it, so use a token you can revoke.

## Limitations (because this is a static site with no server)

- **Nutrition values are estimates for your own tracking**, not clinically verified data or medical advice.
  Open Food Facts is a community database; check products against the package.
- **Open Food Facts name search is unreliable from browsers.** Their service often refuses name searches from web
  pages ("busy"), while barcode lookups keep working. The app says so and falls back to your own foods.
- **Barcode scanning on iPhone** uses a downloaded decoder (iPhone Safari has no built-in one); the first scan needs a
  connection. Label text recognition downloads about 7 MB the first time.

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
code in `sw.js` (currently `const CACHE = 'habits-v4'` → next `'habits-v5'`, and so on) so phones fetch the new files. Open the app
twice after updating: the first open downloads the update, the second one shows it. Your data is not affected.

## Data format

One JSON object, saved in the browser's `localStorage` under `habits.data` and used as-is for export/import:

```json
{
  "version": 5,
  "trackers": [],
  "entries": { "2026-10-01": { "trackerId": 3 } },
  "settings": {},
  "finance": { "currency": "CAD", "goals": [], "transactions": [], "recurring": [],
               "budget": {}, "accounts": [], "netWorthHistory": [], "categories": {} },
  "weight": { "unit": "lb", "goal": null, "start": null, "reminder": {},
              "entries": [{ "date": "2026-10-03", "time": "07:10", "kg": 84.0961, "note": "" }] },
  "health": { "metrics": [], "daily": { "2026-10-03": { "m_water": 1500 } }, "workouts": [], "templates": [],
              "items": [], "routines": [], "intake": { "2026-10-03": { "routineId": { "s": "taken", "d": 1 } } },
              "widgets": [], "categories": [], "settings": {} }
}
```

`version` lets future releases migrate older data (see `MIGRATIONS` in `js/core.js`; version 1 backups,
from before Finance existed, still import; version 3 → 4 only adds the empty `health` section).
Stored units: weight kg, water ml, distance km, sleep and workout time in minutes. New tracker types are added with `HT.registerType` in `js/core.js`.

## Preview locally (optional)

Windows PowerShell, from the `habit-tracker` folder:

```bash
powershell -ExecutionPolicy Bypass -File dev/serve.ps1
```

Then open <http://localhost:8095>. On localhost the offline cache is off unless you add `?sw` to the address.

## Tests

The data logic (migrations, weight maths, units, daily metrics, workouts, supplements, inventory, costs,
export/import) is covered by tests that load the real app scripts in Node. Node 20 or newer, no install needed:

```bash
npm test
```
