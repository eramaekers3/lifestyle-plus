# lifestyle+

A personal life app for iPhone, installed from Safari to the Home Screen.
The center of it is planning, based on Cal Newport's approach:

1. **Plan the week.** Pick the three things that matter this week and write notes about when the work happens.
2. **Time-block the day.** Give every hour a job on the day timeline. Tap empty space to add a block, tap a block to edit it. When the day goes off plan, just re-block the rest of it.
3. **Pull, don't push.** Tasks wait in the **backlog**. Only a few (3 by default) sit in **Now**. When you finish one, a slot opens and you pull the next.

Also included: habits with streaks, weigh-ins with a trend line, and a workout logger.

## Run it on your computer

You need Node.js 18 or newer.

```bash
npm install
npm run dev
```

Open the address it prints. `npm run dev` also prints a **Network** address: open that in Safari on your
iPhone (same Wi-Fi) to try it on your phone.

The app starts with sample data. Tap **Clear it** at the top to start fresh.

## Set up the database (Supabase)

Without this, everything saves on the device only. With it, your phone and laptop stay in sync.

1. Create a free project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor → New query**, paste the contents of `supabase/schema.sql`, and press **Run**.
3. Go to **Project Settings → API**. Copy the **Project URL** and the **anon public** key.
4. Copy `.env.example` to `.env` and paste the two values in.
5. Restart `npm run dev`. Open **Settings** (top right) and create an account.

Supabase sends a confirmation email by default. Confirm it, then sign in from the app.
To skip that step for a personal app, turn off **Authentication → Providers → Email → Confirm email**.

Sample data is never uploaded. It's removed from the device when you sign in.

## Connect Apple Calendar (read-only)

Your Apple Calendar events show on the day timeline as striped blocks, so you can plan around them.

1. On your iPhone, open **Calendar** and tap **Calendars** at the bottom.
2. Tap the **ⓘ** next to an iCloud calendar, turn on **Public Calendar**, tap **Share Link…** and **Copy**.
3. In lifestyle+, open **Settings → Apple Calendar**, paste the link and tap **Add**.

The link is fetched by a small server function (`api/calendar.js`) because Apple doesn't let web pages read it
directly. It only accepts iCloud links. Anyone with a public calendar link can read that calendar, so keep it private.
`npm run dev` serves the same function locally.

## Connect Apple Health (iPhone Shortcut)

Websites can't read Apple Health, so an iPhone Shortcut reads your weight, steps, sleep and workouts and
sends them to `api/health.js`, which saves them to your account. You need to be signed in to sync first.

**One-time database step:** run the `health_tokens` part at the bottom of `supabase/schema.sql` in the
Supabase SQL Editor.

**Get your key:** in lifestyle+, open Settings → Apple Health → Create health key. Copy the key and the address.

**Build the Shortcut** (Shortcuts app → + → name it "Send to lifestyle+"):

1. Add **Find Health Samples**. Type: **Steps**. Filter: **Start Date is in the last 7 days**.
   Leave **Group By** off for steps, and add **Source** as a sixth part of the line (`…|Unit|Source`), so
   lifestyle+ can remove steps counted by both your iPhone and Apple Watch, like the Health app does.
2. Add **Repeat with Each** (it uses the Health Samples automatically).
3. Inside the repeat, add a **Text** action and build this line, with no spaces:
   `steps|` **Start Date** `|` **End Date** `|` **Value** `|` **Unit**
   For each bold part, insert the **Repeat Item** variable, tap it, and pick that property. For Start Date
   and End Date, also set **Date Format → ISO 8601**.
4. Repeat steps 1–3 three more times:
   - Type **Weight**, line starts with `weight|` (no Group By)
   - Type **Sleep** (may be called Sleep Analysis), line starts with `sleep|`
   - Type **Workouts**, line starts with `workout|`, and for Value pick the property that names the
     workout (shown as Workout Type or Type). Leave Unit empty.
5. After the four repeats, add a **Text** action with the four **Repeat Results** variables, one per line.
6. Add **Get Contents of URL**. URL: the address from Settings. Method: **POST**.
   Headers: `Authorization` = `Bearer YOUR-KEY`. Request Body: **JSON**, add a Text field named `lines`
   set to the Text from step 5.
7. Optional: add **Show Result** so you can see "Saved … days" when it runs.

Run it once and allow access to Health when asked. Then make it automatic: Shortcuts → **Automation** →
**+** → **Alarm → Is Stopped** (or a time of day) → **Run Immediately** → choose the shortcut.
iPhones block Health data while locked, so pick a moment when you're usually holding your phone.

## Put it on your iPhone

The Home Screen app needs a real web address (https). The easiest host is Vercel:

1. Push this folder to a GitHub repo.
2. At [vercel.com](https://vercel.com), import the repo. It detects Vite automatically.
3. Under **Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Deploy, then open the site in **Safari** on your iPhone.
5. Tap **Share → Add to Home Screen**.

It now opens full screen like a normal app, works offline, and syncs when it's back online.

> iPhone keeps Home Screen apps' storage separate from Safari, so sign in again inside the installed app.

## How the data works

Every task, block, habit check, weigh-in and workout is one row in a single `records` table
(`kind` says what it is, `data` holds the fields). Changes save to the phone first, so the app is instant and
works offline. Every few seconds after a change, and when the app opens, it pushes your changes and pulls
changes from your other devices. If the same thing changed in two places, the newer edit wins.

Row Level Security means only your account can read or write your rows.

## Project map

```
src/
  App.jsx                 tabs, header, capture button
  store.js                local storage + Supabase sync + sign in
  seed.js                 sample data
  lib/model.js            rules for the stack, time blocks and habits
  lib/dates.js            date helpers (weeks start Monday)
  views/PlanView.jsx      Day / Week switcher
  views/DayView.jsx       Now stack + time-block timeline + habit chips
  views/WeekView.jsx      weekly plan + week at a glance
  views/StackView.jsx     Now, backlog, done
  views/HabitsView.jsx    streaks and 14-day grid
  views/BodyView.jsx      weight trend and workouts
  components/             timeline, sheets, flip clock
  styles.css              all styling
public/
  manifest.webmanifest    Home Screen app settings
  sw.js                   offline support
  icons/                  app icons
supabase/schema.sql       database table and security rules
```

## Ideas for next steps

- Drag blocks to move or resize them
- A shutdown ritual at the end of the day: review the stack, block tomorrow, done
- Pull Google Calendar events into the day as fixed blocks
- Quarterly plan above the weekly plan
- Push notifications when a block starts
