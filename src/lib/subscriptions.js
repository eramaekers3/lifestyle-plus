// Finds charges (and paychecks) that repeat: the same place, about the same amount, on a steady schedule.
//
// How it works:
//   1. Group transactions by place (store numbers and card-reader prefixes stripped, so
//      "SPOTIFY USA 1234" and "Spotify" land together) and by direction (money out or in).
//   2. Inside each place, group amounts that match within a little (taxes and fx wobble a few cents).
//   3. Look at the days between charges. If they line up with a weekly, every-2-weeks, monthly,
//      every-3-months or yearly rhythm, that's a repeating charge.
//   4. If the same place keeps the same rhythm but the amount moved (a price increase), the two runs are
//      joined into one, and the old price is kept so the app can say "was $9.99".
//
// You can confirm one ("Yes, it's a subscription") or hide it ("Not a subscription"). That choice is a
// synced record (fin_sub) keyed by place + direction + rhythm, so it survives price changes.
import { put, remove } from '../store.js';
import { idFor } from './ids.js';
import { addDays, todayISO } from './dates.js';

export const CADENCES = [
  { id: 'weekly', label: 'Weekly', every: 'every week', days: 7, min: 6, max: 8, need: 4, strict: true },
  { id: 'biweekly', label: 'Every 2 weeks', every: 'every 2 weeks', days: 14, min: 12, max: 16, need: 4, strict: true },
  { id: 'monthly', label: 'Monthly', every: 'every month', days: 30.44, min: 26, max: 35, need: 2 },
  { id: 'quarterly', label: 'Every 3 months', every: 'every 3 months', days: 91.3, min: 80, max: 100, need: 2 },
  { id: 'yearly', label: 'Yearly', every: 'every year', days: 365.25, min: 350, max: 380, need: 2 },
];

const dayNum = (iso) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5);
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** "SQ *BLUE BOTTLE #1234 SAN FRANCISCO" → "blue bottle". Used only to group, never shown. */
export function placeKey(t) {
  let s = String(t.merchant || t.name || '').toLowerCase();
  s = s.replace(/^(sq|tst|sp|pp|paypal|py|ach|pos|dd|ppd)\s*\*\s*/, ''); // card-reader / processor prefixes
  s = s.replace(/[#*]/g, ' ').replace(/\b\d{3,}\b/g, ' ').replace(/\b(www\.|\.com|\.net|inc|llc|co)\b/g, ' ');
  s = s.replace(/[^a-z0-9&' ]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.split(' ').slice(0, 3).join(' ') || 'unknown';
}

const close = (a, b) => Math.abs(a - b) <= Math.max(0.25, 0.02 * Math.max(a, b));
// Paychecks move with hours worked, so income from one place groups even when amounts differ a lot.
const closePay = (a, b) => Math.abs(a - b) <= 0.4 * Math.max(a, b);

/** Groups amounts that are about the same. */
function amountGroups(txns, match = close) {
  const groups = [];
  for (const t of [...txns].sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount))) {
    const v = Math.abs(t.amount);
    const g = groups.find((g) => match(g.avg, v));
    if (g) {
      g.txns.push(t);
      g.avg = g.txns.reduce((s, x) => s + Math.abs(x.amount), 0) / g.txns.length;
    } else groups.push({ avg: v, txns: [t] });
  }
  return groups.map((g) => g.txns.sort((a, b) => a.date.localeCompare(b.date)));
}

/** Which rhythm a run of dates follows, or null. */
function cadenceOf(dates) {
  const days = [...new Set(dates.map(dayNum))].sort((a, b) => a - b);
  if (days.length < 2) return null;
  const gaps = days.slice(1).map((d, i) => d - days[i]);
  const mid = median(gaps);
  for (const c of CADENCES) {
    if (mid < c.min || mid > c.max || days.length < c.need) continue;
    // Most gaps should fit. Monthly and longer may skip one period (a gap of about twice the rhythm);
    // weekly and every-2-weeks can't, or the two get mixed up with each other.
    const fits = gaps.filter((g) => (g >= c.min && g <= c.max) || (!c.strict && g >= c.min * 2 && g <= c.max * 2)).length;
    if (fits / gaps.length >= (c.strict ? 0.85 : 0.75)) return c;
  }
  return null;
}

/** The next date it should show up. Monthly and longer keep the same day of the month. */
function nextDate(last, c) {
  if (c.days < 28) return addDays(last, c.days);
  const months = Math.round(c.days / 30.44);
  const [y, m, d] = last.split('-').map(Number);
  const end = new Date(y, m - 1 + months + 1, 0).getDate();
  const t = new Date(y, m - 1 + months, Math.min(d, end));
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

/**
 * Every repeating charge and repeating income in txns (already given kinds by useFinance).
 * decisions: fin_sub records. Returns series, newest-first within active ones.
 */
export function detectRecurring(txns, decisions = [], today = todayISO()) {
  const decided = new Map(decisions.map((d) => [d.key, d.state]));
  const places = new Map();
  for (const t of txns) {
    if (t.pending || t.kind === 'transfer' || t.kind === 'ignore' || !t.amount) continue;
    const dir = t.amount > 0 ? 'out' : 'in';
    const k = `${dir}:${placeKey(t)}`;
    if (!places.has(k)) places.set(k, []);
    places.get(k).push(t);
  }

  const out = [];
  for (const [pk, list] of places) {
    if (list.length < 2) continue;
    const runs = [];
    const isPay = pk.startsWith('in:') && list.every((t) => t.kind === 'income');
    for (const g of amountGroups(list, isPay ? closePay : close)) {
      const c = cadenceOf(g.map((t) => t.date));
      if (c) runs.push({ c, txns: g });
    }
    // Join runs at the same place and rhythm where one picks up as the other stops (a price change).
    runs.sort((a, b) => a.txns[0].date.localeCompare(b.txns[0].date));
    const joined = [];
    for (const r of runs) {
      const prev = joined.find((j) => j.c.id === r.c.id);
      const gap = prev ? dayNum(r.txns[0].date) - dayNum(prev.txns.at(-1).date) : null;
      if (prev && gap >= r.c.min && gap <= r.c.max * 1.5) {
        prev.oldAmount = Math.abs(prev.txns.at(-1).amount);
        prev.changedOn = r.txns[0].date;
        prev.txns.push(...r.txns);
      } else joined.push({ ...r, txns: [...r.txns] });
    }

    for (const r of joined) {
      const { c } = r;
      const ts = r.txns;
      const last = ts.at(-1);
      const key = `${pk}:${c.id}`;
      const state = decided.get(key) || null;
      if (state === 'no') continue;
      // Pay that varies: use the average of the last three.
      const recent = ts.slice(-3);
      const amount = isPay ? Math.round((recent.reduce((a, t) => a + Math.abs(t.amount), 0) / recent.length) * 100) / 100 : Math.abs(last.amount);
      const next = nextDate(last.date, c);
      // Late by more than a quarter of its rhythm (at least 5 days): probably cancelled.
      const grace = Math.max(5, Math.round(c.days * 0.25));
      const active = dayNum(today) <= dayNum(next) + grace;
      out.push({
        id: idFor(`fs:${key}`),
        key,
        dir: pk.startsWith('in:') ? 'in' : 'out',
        name: last.merchant || last.name,
        amount,
        varies: isPay && ts.some((t) => !close(Math.abs(t.amount), amount)),
        oldAmount: !isPay && r.oldAmount && !close(r.oldAmount, amount) ? r.oldAmount : null,
        changedOn: r.changedOn || null,
        cadence: c,
        perMonth: Math.round(((amount * 30.44) / c.days) * 100) / 100,
        perYear: Math.round(((amount * 365.25) / c.days) * 100) / 100,
        count: ts.length,
        first: ts[0].date,
        last: last.date,
        next,
        active,
        sure: state === 'yes' || ts.length >= 3,
        confirmed: state === 'yes',
        kind: last.kind,
        cat: last.cat,
        accountName: last.account && last.account.name,
        txnIds: ts.map((t) => t.txnId),
      });
    }
  }
  return out.sort((a, b) => b.active - a.active || a.next.localeCompare(b.next));
}

/** state: 'yes' (it's a subscription), 'no' (hide it), null (back to automatic). */
export function decideRecurring(s, state) {
  if (state) put('fin_sub', { id: s.id, key: s.key, name: s.name, state });
  else remove(s.id);
}
