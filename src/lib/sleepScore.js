// A nightly sleep score built to track Apple's Sleep Score (iOS / watchOS 26) as closely as possible.
// Apple doesn't let apps read its score, but it has said how it's built, out of 100:
//   Duration      50  — total sleep (40) plus enough deep (5) and REM (5) sleep
//   Bedtime       30  — when you fell asleep compared with the last 13 nights
//   Interruptions 20  — how often you woke up and how long you stayed awake
// Apple publishes the parts, not the exact curves, so the curves below are the tunable bit.
// Entering Apple's numbers for a few nights (in the night sheet) shows how far off each part is.

export const TUNE = {
  fullSleep: 470,      // Apple starts taking points off below 7h 50m
  short2h: 13,         // and two hours under that costs 13 of the 40
  shortRest: 27 / 240, // after that, the rest of the 40 runs out over the next 4 hours
  deepFull: 0.10, deepZero: 0.03, // deep sleep as a share of sleep: full 5 pts at 10%, none at 3%
  remFull: 0.18, remZero: 0.08,   // REM: full 5 pts at 18%, none at 8%
  bedFree: 30,         // falling asleep within 30 min of your usual time costs nothing
  bedPerPt: 7,         // then 1 point for every 7 minutes further off
  bedNights: 13,
  wakeMin: 2,          // awake stretches of 2 min or longer count as a wake-up
  perWake: 2,          // points per wake-up
  perAwakeMin: 0.15,   // points per minute awake in the middle of the night
};

export const LEVELS = [
  { min: 96, label: 'Very High', cls: 'vh' },
  { min: 81, label: 'High', cls: 'hi' },
  { min: 61, label: 'OK', cls: 'ok' },
  { min: 41, label: 'Low', cls: 'lo' },
  { min: 0, label: 'Very Low', cls: 'vl' },
];
export const levelFor = (score) => LEVELS.find((l) => score >= l.min);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ramp = (v, zero, full) => clamp((v - zero) / (full - zero), 0, 1);
// Clock minutes on a night's own axis, where 6pm the evening before is 0, so averages don't wrap at midnight.
const onAxis = (m) => (m >= 18 * 60 ? m - 18 * 60 : m + 6 * 60);

function durationPart(n) {
  const short = Math.max(0, TUNE.fullSleep - n.sleepMin);
  const lost = short <= 120 ? (TUNE.short2h * short) / 120 : TUNE.short2h + (short - 120) * TUNE.shortRest;
  const total = clamp(40 - lost, 0, 40);
  const st = n.stages || {};
  const staged = st.deep != null || st.rem != null || st.core != null;
  // Without Apple Watch stages there's nothing to judge deep or REM by, so they aren't marked down.
  const deepShare = staged ? (st.deep || 0) / n.sleepMin : null;
  const remShare = staged ? (st.rem || 0) / n.sleepMin : null;
  const deep = staged ? 5 * ramp(deepShare, TUNE.deepZero, TUNE.deepFull) : 5;
  const rem = staged ? 5 * ramp(remShare, TUNE.remZero, TUNE.remFull) : 5;
  return { pts: Math.round(total + deep + rem), total: Math.round(total), deep: Math.round(deep), rem: Math.round(rem), deepShare, remShare, staged };
}

function bedtimePart(n, prior) {
  const timed = prior.filter((p) => p && p.bedMin != null).slice(-TUNE.bedNights);
  if (n.bedMin == null || !timed.length) return { pts: 30, off: null, usual: null, nights: timed.length };
  const usualAxis = timed.reduce((a, p) => a + onAxis(p.bedMin), 0) / timed.length;
  const off = Math.round(onAxis(n.bedMin) - usualAxis); // + is later than usual
  const pts = clamp(30 - Math.max(0, Math.abs(off) - TUNE.bedFree) / TUNE.bedPerPt, 0, 30);
  return { pts: Math.round(pts), off, usual: Math.round(((usualAxis + 18 * 60) % 1440 + 1440) % 1440), nights: timed.length };
}

function interruptionsPart(n) {
  const segs = n.segs || [];
  let wakes = 0;
  let awake = 0;
  if (segs.length) {
    // Only awake time between falling asleep and the final wake-up counts.
    const asleep = segs.filter((s) => s[2] !== 'w');
    if (asleep.length) {
      const first = asleep[0][0];
      const last = Math.max(...asleep.map((s) => s[1]));
      for (const [a, b, c] of segs) {
        if (c !== 'w' || b <= first || a >= last) continue;
        const len = Math.min(b, last) - Math.max(a, first);
        awake += len;
        if (len >= TUNE.wakeMin) wakes++;
      }
    }
  } else if (n.stages && n.stages.awake) {
    awake = n.stages.awake;
  }
  const pts = clamp(20 - wakes * TUNE.perWake - awake * TUNE.perAwakeMin, 0, 20);
  return { pts: Math.round(pts), wakes, awake: Math.round(awake), estimated: !segs.length };
}

/**
 * Scores one night. `prior` is the nights before it (oldest first), used for bedtime consistency.
 * Returns null when there isn't enough sleep data to score.
 */
export function scoreNight(n, prior = []) {
  if (!n || !n.sleepMin) return null;
  const duration = durationPart(n);
  const bedtime = bedtimePart(n, prior);
  const interruptions = interruptionsPart(n);
  const score = clamp(duration.pts + bedtime.pts + interruptions.pts, 0, 100);
  return { score, level: levelFor(score), duration, bedtime, interruptions };
}

/** Scores for every night in `byDate` ({date: health record}), keyed by date. */
export function scoreAll(byDate) {
  const dates = Object.keys(byDate).sort();
  const out = {};
  dates.forEach((d, i) => {
    // The 13 nights before, but only ones from the last two weeks, like Apple's window.
    const from = new Date(`${d}T12:00:00Z`);
    from.setUTCDate(from.getUTCDate() - 14);
    const cut = from.toISOString().slice(0, 10);
    const prior = dates.slice(Math.max(0, i - TUNE.bedNights), i).filter((p) => p >= cut).map((p) => byDate[p]);
    const s = scoreNight(byDate[d], prior);
    if (s) out[d] = s;
  });
  return out;
}

/** How far this app's parts were from Apple's, averaged over the nights you entered Apple's numbers. */
export function compareWithApple(scores, apple) {
  const rows = apple.filter((a) => scores[a.date] && a.duration != null && a.bedtime != null && a.interruptions != null);
  if (!rows.length) return null;
  const gap = (k) => rows.reduce((s, a) => s + (scores[a.date][k].pts - a[k]), 0) / rows.length;
  const total = rows.reduce((s, a) => s + Math.abs(scores[a.date].score - (a.duration + a.bedtime + a.interruptions)), 0) / rows.length;
  return { nights: rows.length, duration: gap('duration'), bedtime: gap('bedtime'), interruptions: gap('interruptions'), total };
}
