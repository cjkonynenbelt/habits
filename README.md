# Habits — habits, health, schedule and money in one app

A private, installable personal management app: habits, health and fitness, a calendar with tasks, and
personal finance.
It is a plain static site (HTML, CSS, JavaScript — no build step, no server, no account), made to be
hosted for free on GitHub Pages and used mainly from a phone.

**All data stays in your browser.** There are no accounts, analytics or bank connections. The only
outside services are optional Nutrition features: barcode lookups and product search on Open Food Facts
(only the barcode or search words are sent), meal-photo recognition on LogMeal (only if you add your own
token), and two libraries downloaded from jsDelivr the first time you scan a barcode or a label.

## How it's organised

Four tabs at the bottom (a sidebar on desktop):

| Tab | What's there |
| --- | --- |
| **Home** | Today's dashboard — greeting, daily completion ring, calories / water / workouts / tasks, agenda (priorities and what's next), habits, health and recent activity. A section bar opens **Habits**, **Nutrition**, **Workouts**, **Strength**, **Weight**, **Daily log**, **Supplements** and **Insights** (the health overview). **Log** at the top adds food, water, a workout, a lift, a weigh-in, supplements, a task, an event, a habit or a transaction. |
| **Schedule** | **Calendar** (month / week / day, add and edit events and tasks), **Timeline** (everything you logged, by day / week / month, filterable by category) and **History** (habit calendar with every day's log and links to each full history). |
| **Finance** | Overview, goals, income, expenses, budget, net worth and activity — money only. |
| **More** | Profile and nutrition targets, account and storage, Home dashboard, appearance, notifications, habit and health preferences, finance settings, all habits, archived and paused items, supplement routine, health shopping list, foods and recipes, backup / export / import, install, help and about. |

Older links (#/today, #/health, #/trackers, #/stats, #/history, #/settings) still open their screens.

## What's in it

**Habits** (Home → Habits)

- **Home** — every habit due today with one-tap logging, under the daily overview
- **Seven tracker types** — Yes/No, Number, Quantity, Duration, Time, Counter, Percentage
- **Custom everything** — name, description, icon, colour, goal, unit (or your own), schedule,
  start date, reminder, and whether it counts toward the daily %
- **Schedules** — every day, weekdays, weekends, specific days, or every N days
- **Streaks** — current, best, total completions, completion rate (off days never break a streak)
- **History** — Schedule → History: monthly calendar; tap any day to see or correct what was recorded
- **Progress** — this week / this month overview, plus a detail page per habit; **Manage** lists all habits
- **Reorder** — press and hold a tracker, then drag
- **Pause / archive / delete** — archived trackers keep their history

**Schedule** (its own tab)

- **Events and tasks** — title, date, all day or start / end time, priority flag, notes. Tasks can be ticked off.
- **Home agenda** — today's priorities (flagged items and today's tasks, then overdue tasks) and what's coming up.
- **Calendar** — month grid with event and task dots (habit-complete days in green), week list, day agenda plus
  what you logged that day.
- **Timeline** — habits, completed tasks and past events, workouts, meals (one row per meal), weigh-ins,
  supplements taken, daily-log values and money, newest first. Tap a row to open it on that day. It reads
  the existing logs; nothing is copied.

**Finance** (its own tab)

- **Overview** — net worth, this month's income / expenses / saved, savings rate
- **Savings goals and debt payoff** — progress, remaining, required monthly amount, estimated finish date
- **Income and expenses** — manual entries, your own categories, optional monthly recurring expenses
- **Budget** — planned income and per-category limits with under / near / over status
- **Net worth** — assets and liabilities with a history chart
- **Activity** — everything in one list, filtered by week, month, year or a custom range
- **Optional habit link** — a habit such as "Save $20" can offer to add that amount to a goal

**Health & fitness** (Home → Nutrition, Workouts, Strength, Weight, Daily log, Supplements, Insights; the shopping list is under More)

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
- **Strength training** (Health → Strength: Overview · Exercises · History · Records)
  - Exercises: a library of 40+ common lifts (Bench Press, Squat, Deadlift, Overhead Press, Barbell Row,
    Pull-ups, Lat Pulldown, Bicep Curls, Tricep Extensions, Leg Press, Romanian Deadlift…) or your own,
    organised by muscle group; rename, regroup or delete.
  - Logging: pick an exercise, then weight × reps × sets in rows (different weights in one session are separate
    rows). Prefilled from your last session; any date; optional notes; edit or delete later. Blank weight =
    bodyweight. Logging the same exercise twice on one day adds to that day's session.
  - Each exercise: current working weight, previous session, all-time heaviest, best set, estimated 1RM
    (Epley, from sets of 1–12 reps), improvement since your first session, sessions, total reps and volume,
    and a tap-to-read chart (est. 1RM, top weight, volume or reps) for 1M / 3M / 6M / 1Y / All.
  - Personal records are detected automatically (heaviest weight, best est. 1RM, highest volume, most reps in a
    set) whenever a session beats every earlier one; new ones are announced on saving and tagged PR.
  - History by day, filterable by exercise and date range; open any session for its sets.
  - Sessions are saved in the same workout log as Workouts (no second copy), so they count everywhere workouts do.
- **Supplements** — your routine (name, serving as on the label, schedule, time of day), a daily Taken / Skip
  checklist, a 14-day history that separates "skipped" from "not logged", pause or remove. Tracking only: the app
  never suggests products, doses or combinations.
- **Shopping & inventory** — vitamins, supplements, protein and gear with category, status (research / want /
  restock / purchased / not buying), priority, quantity, estimated price, store, link, notes, try-vs-regular,
  stock on hand, days of supply, running-low warnings, actual price paid, recurring monthly cost. Filter and sort;
  marking an item purchased can optionally add a Finance expense.
- **Overview** — weight change and average, workout frequency and time, daily averages, chosen health habits,
  supplement logging and health spending for 1M / 3M / 6M / 1Y, shown only when there is enough data.
- **Home sections** — agenda, habits, weight, health metrics, workout, supplement checklist, health purchases,
  nutrition and recent activity; choose and reorder them in More → Home dashboard.

**Nutrition** (Home → Nutrition)

- **Diary** — breakfast, lunch, dinner, snacks and your own meal categories; each entry shows serving, calories,
  protein, carbohydrate and fat. Edit, delete, duplicate, move between meals, log past days.
- **Dashboard** — calories eaten / left, protein, carbohydrate, fat and fibre, eight key vitamins and minerals,
  water (one-tap +250 ml from the Health water log) and today's supplements to tick off, all on the diary page.
  The Health overview has a "Nutrition today" card too.
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

**Vitamins & minerals** (Home → Nutrition → Vitamins)

- **28 nutrients** — vitamins A, C, D, E, K (K1 and K2 when listed), B1, B2, B3, B5, B6, B7, B9, B12, choline;
  calcium, magnesium, zinc, iron, potassium, sodium, phosphorus, selenium, copper, manganese, iodine, chromium,
  molybdenum, chloride. Each shows consumed, target, %, remaining, upper limit and status (below / met / above a
  limit / no data). Tap one to see every food and supplement it came from and its share.
- **All sources, counted once** — food diary entries plus supplements marked Taken in Health → Supplements. Add
  "Supplement facts" to a supplement (amount per serving from the label, in µg / mg / g, or IU where the
  conversion is fixed: vitamin D, and A or E with the form chosen). The amounts are copied onto each day it's
  taken, so later label edits don't rewrite history unless you tick "Also update past days".
- **Unknown is not zero** — a food that doesn't list a nutrient is shown as unknown, and the screen says how many
  foods didn't list it.
- **Upper limits by source** — total-intake limits (zinc, iron, vitamin D, …) use food + supplements; limits that
  apply only to supplements (magnesium, vitamin E, niacin, folic acid, preformed vitamin A) count supplements only.
  Sodium uses the CDRR (2,300 mg), which is a long-term risk level, not a toxicity limit.
- **Alerts** — over a limit, supplements pushing a total over, two supplements with the same nutrient, often below
  target, often over. Informational only; the app never suggests changing a dose.
- **History** — 7D / 30D / 90D / 1Y / custom dates, daily / weekly / monthly averages, a chart per nutrient with
  target and limit lines, often-short and often-over lists, and a period table. Days with nothing logged are left out.

**Nutrition targets** (More → Nutrition targets, or Nutrition → Settings)

- **Profile** — sex, age (or birth date), height (ft/in or cm), activity level and goal; body weight comes from the
  Weight log.
- **Recommended values** — Dietary Reference Intakes (US National Academies, also used by Health Canada) for your
  age group and sex, each labelled RDA, AI, UL or CDRR with its source. Calories use the IOM Estimated Energy
  Requirement (age, sex, height, weight, activity; −15% for fat loss, +10% for muscle gain); protein is
  0.85 g/kg (age 14–18) or 0.8 g/kg (19+), or 1.6 g/kg for muscle gain / fat loss (sports guideline); fat 30% and
  carbohydrate the rest of calories within the AMDR. Height and weight don't change vitamin or mineral targets.
- **Your own values** — edit any target or upper limit; clear it to go back. "Use my custom values" switches
  between yours and the recommendations; "Restore recommended defaults" clears them. Targets only change
  comparisons, never what you logged.

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
│   ├── views.js            Home dashboard, habit screens and form, History, Settings sections
│   ├── finance.js          The whole Finance section (data, maths, screens)
│   ├── weight.js           Body weight (data, maths, screen, graph, Today widget)
│   ├── health.js           Health & fitness: daily metrics, workouts, supplements, shopping, overview, widgets
│   ├── nutrition.js        Food diary, Open Food Facts, barcode / label / meal-photo scanning, recipes, trends
│   ├── strength.js         Strength training: exercise list, set logging, progress charts, records, history
│   ├── micros.js           Vitamins & minerals: daily totals from food + supplements, targets, profile, alerts, history
│   ├── schedule.js         Schedule: events and tasks, calendar, activity timeline, Home agenda
│   ├── home.js             Home: section bar, daily overview figures, quick "Log" sheet
│   ├── more.js             More: menu, archived items, account & storage, help, about
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
> (use More → Backup, export & import in Safari, then Import in the app to move it across).

## Using the app

- **Add a habit** — on Home tap **Add habit** (or **Log → New habit**), pick a type, set a goal, save. The
  "Quick start" chips fill in common ones.
- **Log** — tap the circle (Yes/No), **+ / −** (Counter), the **+amount** button (Quantity, Duration),
  or **Log** to type a value. The pencil lets you type an exact amount or set the total.
- **Details** — tap a habit's name for streaks, charts and its calendar. Tap any past day there to fix it.
- **Reorder** — press and hold a habit for about half a second, then drag. Home sections are reordered in More → Home dashboard.
- **Plan** — Schedule → **Add** for an event or task; flag it as a priority to see it at the top of Home.
- **Finance** — add goals with **Add Financial Goal**, record money with **Income** / **Expense**,
  and list what you own and owe under **Net worth**.
- **Back up** — More → **Backup, export & import** saves a `habits-backup-DATE.json` file.
  **Import** restores it. Do this now and then, and always before clearing browser data or changing phones.

## Setting up meal-photo recognition (optional)

1. Create an account at <https://logmeal.com/api> (30-day free trial with all features, then a paid plan).
2. In LogMeal, get an **APIUser** token — their docs say image recognition only works with APIUser tokens, and
   nutrition values need the trial or their Monitor plan or higher.
3. In Habits: Home → Nutrition → Settings → paste it into "LogMeal API token" and save.

The token is stored only on that device, sent only to LogMeal with a meal photo, and never put in backups —
so add it again on each device. Because there is no server, the token lives in your browser rather than on a
server; anyone with access to your unlocked phone could read it, so use a token you can revoke.

## Limitations (because this is a static site with no server)

- **Nutrition values are estimates for your own tracking**, not clinically verified data or medical advice.
  Open Food Facts is a community database; check products against the package.
- **Vitamin and mineral totals are only as complete as the labels.** Canadian labels must list only potassium,
  calcium and iron, so most foods leave other vitamins unknown; totals are then a minimum. Open Food Facts stores
  vitamin A without saying whether it was µg RAE or IU, and folate without saying DFE or folic acid. Food labels
  don't separate preformed vitamin A, added niacin or folic acid, so those supplement-only limits count supplements only.
- **Reference values** cover healthy people aged 14+; pregnancy, breastfeeding and medical conditions aren't covered.
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
code in `sw.js` (currently `const CACHE = 'habits-v7'` → next `'habits-v8'`, and so on) so phones fetch the new files. Open the app
twice after updating: the first open downloads the update, the second one shows it. Your data is not affected.

## Data format

One JSON object, saved in the browser's `localStorage` under `habits.data` and used as-is for export/import:

```json
{
  "version": 8,
  "trackers": [],
  "entries": { "2026-10-01": { "trackerId": 3 } },
  "settings": {},
  "schedule": { "events": [{ "id": "ev…", "title": "Dentist", "kind": "event", "date": "2026-11-06", "time": "10:30", "end": "11:15",
                "priority": false, "done": false, "doneAt": null, "notes": "" }] },
  "finance": { "currency": "CAD", "goals": [], "transactions": [], "recurring": [],
               "budget": {}, "accounts": [], "netWorthHistory": [], "categories": {} },
  "weight": { "unit": "lb", "goal": null, "start": null, "reminder": {},
              "entries": [{ "date": "2026-10-03", "time": "07:10", "kg": 84.0961, "note": "" }] },
  "health": { "metrics": [], "daily": { "2026-10-03": { "m_water": 1500 } }, "workouts": [], "templates": [],
              "items": [], "routines": [{ "id": "rt…", "name": "Vitamin D", "facts": { "rows": [{ "k": "vitd", "a": 1000, "u": "iu" }], "mult": 1 } }],
              "intake": { "2026-10-03": { "routineId": { "s": "taken", "d": 1, "n": { "vitd": 25 }, "ul": { "vitd": 25 } } } },
              "widgets": [], "categories": [], "settings": {},
              "exercises": [{ "id": "ex…", "name": "Bench Press", "group": "Chest" }] }
}
```

`version` lets future releases migrate older data (see `MIGRATIONS` in `js/core.js`; version 1 backups,
from before Finance existed, still import; version 3 → 4 only adds the empty `health` section; 5 → 6 builds
the strength exercise list from lifts already in the workout log; 6 → 7 moves an old sodium "target", which was
always a limit, to `nutrition.limits.sodium`; 7 → 8 only adds the empty `schedule` section, and Home's two new
sections, Agenda and Recent activity, are added to `health.widgets` without changing a saved order). `nutrition` also holds `profile`, custom `targets` / `limits`
and `useCustom`. Vitamins and minerals are stored per food in the units listed in `N.NUTRIENTS` (vitamin A µg RAE,
folate µg DFE). A strength session is an entry in
`health.workouts[].exercises` with `exId` pointing at `health.exercises`, its `sets` (`reps`, `kg`) and optional `notes`.
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
