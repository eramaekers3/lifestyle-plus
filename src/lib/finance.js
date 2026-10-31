// Money: bank accounts through Plaid (via /api/plaid), and the numbers worked out from them.
//
// Every transaction gets a kind:
//   spend     money going out to buy things (refunds count against it)
//   income    paychecks and other money coming in
//   giving    donations and charity (counted separately from spending)
//   invest    money moved into investment or retirement accounts
//   transfer  money moving between your own accounts, credit card payments; left out of stats
//   ignore    you said to leave it out
// Plaid's category decides by default; you can change any transaction, or every one from a merchant.
import { useMemo, useSyncExternalStore } from 'react';
import { put, remove, sync, useKind } from '../store.js';
import { supabase } from '../supabase.js';
import { idFor } from './ids.js';
import { detectRecurring } from './subscriptions.js';
import { norm } from './text.js';

export const KINDS = [
  { id: 'spend', label: 'Spending' },
  { id: 'income', label: 'Income' },
  { id: 'giving', label: 'Giving' },
  { id: 'invest', label: 'Investing' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'ignore', label: 'Leave out' },
];

const CAT_LABELS = {
  FOOD_AND_DRINK: 'Food & drink',
  GENERAL_MERCHANDISE: 'Shopping',
  ENTERTAINMENT: 'Entertainment',
  TRANSPORTATION: 'Transportation',
  TRAVEL: 'Travel',
  RENT_AND_UTILITIES: 'Bills & utilities',
  PERSONAL_CARE: 'Personal care',
  MEDICAL: 'Health',
  HOME_IMPROVEMENT: 'Home',
  GENERAL_SERVICES: 'Services',
  GOVERNMENT_AND_NON_PROFIT: 'Government & nonprofit',
  BANK_FEES: 'Fees',
  LOAN_PAYMENTS: 'Loan payments',
  TRANSFER_IN: 'Transfers in',
  TRANSFER_OUT: 'Transfers out',
  INCOME: 'Income',
  OTHER: 'Other',
};
export const catLabel = (c) => CAT_LABELS[c] || 'Other';
export const CAT_COLORS = {
  FOOD_AND_DRINK: '#ff9a4a', GENERAL_MERCHANDISE: '#7cc4ff', ENTERTAINMENT: '#bba9ff', TRANSPORTATION: '#5fd3c6',
  TRAVEL: '#ff86b8', RENT_AND_UTILITIES: '#ffcf5c', PERSONAL_CARE: '#e6c79c', MEDICAL: '#ff8a7a',
  HOME_IMPROVEMENT: '#c9d36a', GENERAL_SERVICES: '#9fb4ff', GOVERNMENT_AND_NON_PROFIT: '#7fdca0', BANK_FEES: '#ff5a6e', OTHER: '#8f97b9',
};

export const merchantOf = (t) => t.merchant || t.name;

/** Plaid's best guess at a transaction's kind. */
export function defaultKind(t, acct) {
  const d = t.catDetail || '';
  if (/DONATIONS/.test(d)) return 'giving';
  if (acct && acct.type === 'investment') return 'transfer';
  if (/TRANSFER_OUT_INVESTMENT|TRANSFER_OUT_RETIREMENT|INVESTMENT_AND_RETIREMENT/.test(d)) return t.amount > 0 ? 'invest' : 'transfer';
  if (t.cat === 'INCOME') return 'income';
  // Money sent to a brokerage counts as investing even when the bank just calls it a transfer.
  if (t.amount > 0 && /robinhood|fidelity|vanguard|schwab|webull|e\*?trade|acorns|betterment|wealthfront|coinbase|stash|m1 fin|public\.com/i.test(`${t.name} ${t.merchant}`)) return 'invest';
  if (t.cat === 'TRANSFER_IN' || t.cat === 'TRANSFER_OUT') return 'transfer';
  if (/CREDIT_CARD_PAYMENT/.test(d)) return 'transfer';
  return 'spend';
}

/** Everything money-related, with your own choices applied. */
export function useFinance() {
  const accounts = useKind('fin_account');
  const items = useKind('fin_item');
  const txns = useKind('fin_txn');
  const holdings = useKind('fin_holding');
  const snapshots = useKind('fin_snapshot');
  const overrides = useKind('fin_override');
  const rules = useKind('fin_rule');
  const subs = useKind('fin_sub');
  return useMemo(() => {
    const acctById = Object.fromEntries(accounts.map((a) => [a.accountId, a]));
    const byTxn = new Map(overrides.map((o) => [o.txnId, o]));
    const byMerchant = new Map(rules.map((r) => [r.merchant, r]));
    const list = txns
      .filter((t) => acctById[t.accountId])
      .map((t) => {
        const acct = acctById[t.accountId];
        const o = byTxn.get(t.txnId);
        const r = byMerchant.get(norm(merchantOf(t)));
        const kind = (o && o.kind) || (r && r.kind) || defaultKind(t, acct);
        return { ...t, kind, account: acct, overridden: !!o, ruled: !o && !!r };
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);
    // Repeating charges and paychecks; each of their transactions gets a `repeat` tag.
    const recurring = detectRecurring(list, subs);
    const repeatOf = new Map();
    for (const r of recurring) for (const id of r.txnIds) repeatOf.set(id, r);
    for (let i = 0; i < list.length; i++) {
      const r = repeatOf.get(list[i].txnId);
      if (r) list[i] = { ...list[i], repeat: r };
    }
    return {
      recurring,
      hiddenRecurring: subs.filter((d) => d.state === 'no'),
      accounts: [...accounts].sort((a, b) => (a.institution || '').localeCompare(b.institution || '') || (a.name || '').localeCompare(b.name || '')),
      items,
      txns: list,
      holdings,
      snapshots: [...snapshots].sort((a, b) => a.date.localeCompare(b.date)),
    };
  }, [accounts, items, txns, holdings, snapshots, overrides, rules, subs]);
}

/** Change one transaction's kind, or every transaction from its merchant. kind=null resets. */
export function setTxnKind(t, kind, allFromMerchant = false) {
  if (allFromMerchant) {
    const m = norm(merchantOf(t));
    const id = idFor(`fr:${m}`);
    if (kind) put('fin_rule', { id, merchant: m, kind });
    else remove(id);
    const o = idFor(`fo:${t.txnId}`);
    remove(o);
    return;
  }
  const id = idFor(`fo:${t.txnId}`);
  if (kind) put('fin_override', { id, txnId: t.txnId, kind });
  else remove(id);
}

/* ---------- Totals ---------- */

export const money = (v, cents = false) => {
  const n = Number(v) || 0;
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
};

/** Sum of a kind in a date range, in positive dollars (spending refunds subtract). */
export function total(txns, kind, from, to) {
  let s = 0;
  for (const t of txns) {
    if (t.kind !== kind || t.date < from || t.date > to) continue;
    s += kind === 'income' ? -t.amount : t.amount;
  }
  return Math.round(s * 100) / 100;
}

export const monthRange = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return [`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`];
};
export const addMonths = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/* ---------- Talking to the server ---------- */

let state = { syncing: false, error: null, lastSync: null };
try {
  state.lastSync = Number(localStorage.getItem('lifestyleplus.finSync')) || null;
} catch {
  /* storage unavailable */
}
const listeners = new Set();
const setState = (c) => {
  state = { ...state, ...c };
  listeners.forEach((l) => l());
};
export const useBankSync = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state
  );

async function api(body) {
  if (!supabase) throw new Error('Sign in first, so your banks are tied to your account.');
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Sign in first, so your banks are tied to your account.');
  const res = await fetch('/api/plaid', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone, ...body }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || 'Couldn’t reach the bank service.');
  return out;
}

const SYNC_EVERY = 4 * 60 * 60 * 1000;

/** Pulls new balances and transactions. Without force, at most every 4 hours. */
export async function syncBanks(force = false) {
  if (state.syncing) return;
  if (!force && state.lastSync && Date.now() - state.lastSync < SYNC_EVERY) return;
  setState({ syncing: true, error: null });
  try {
    await api({ action: 'sync' });
    const now = Date.now();
    try {
      localStorage.setItem('lifestyleplus.finSync', String(now));
    } catch {
      /* storage unavailable */
    }
    setState({ syncing: false, lastSync: now });
    await sync();
  } catch (e) {
    setState({ syncing: false, error: e.message });
  }
}

/* ---------- Plaid Link (the bank sign-in window) ---------- */

const LINK_KEY = 'lifestyleplus.plaidLink';
let scriptP = null;
function loadLink() {
  if (window.Plaid) return Promise.resolve(window.Plaid);
  scriptP =
    scriptP ||
    new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
      s.onload = () => resolve(window.Plaid);
      s.onerror = () => reject(new Error('Couldn’t load the bank sign-in. Check your connection.'));
      document.head.appendChild(s);
    });
  return scriptP;
}

const redirectUri = () => `${window.location.origin}/`;

function openLink(token, { received } = {}) {
  return loadLink().then(
    (Plaid) =>
      new Promise((resolve, reject) => {
        const handler = Plaid.create({
          token,
          ...(received ? { receivedRedirectUri: received } : {}),
          onSuccess: async (publicToken, meta) => {
            try {
              setState({ syncing: true, error: null });
              const isUpdate = !!sessionStorageGet('lifestyleplus.plaidUpdate');
              if (!isUpdate) await api({ action: 'exchange', publicToken, institution: meta.institution });
              else await api({ action: 'sync' });
              sessionStorageSet('lifestyleplus.plaidUpdate', '');
              setState({ syncing: false, lastSync: Date.now() });
              await sync();
              resolve(meta.institution && meta.institution.name);
            } catch (e) {
              setState({ syncing: false, error: e.message });
              reject(e);
            }
          },
          onExit: (err) => (err ? reject(new Error(err.display_message || err.error_message || 'The bank sign-in closed.')) : resolve(null)),
        });
        handler.open();
      })
  );
}

const sessionStorageGet = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const sessionStorageSet = (k, v) => {
  try {
    if (v) localStorage.setItem(k, v);
    else localStorage.removeItem(k);
  } catch {
    /* storage unavailable */
  }
};

/** Opens the bank sign-in. itemId reconnects a bank whose login expired. Resolves with the bank's name. */
export async function connectBank(itemId = null) {
  const { linkToken } = await api({ action: 'link', redirectUri: redirectUri(), ...(itemId ? { itemId } : {}) });
  // Banks like Capital One send you to their own site and back; the token is needed again on return.
  sessionStorageSet(LINK_KEY, linkToken);
  sessionStorageSet('lifestyleplus.plaidUpdate', itemId ? '1' : '');
  return openLink(linkToken);
}

/** After a bank's own sign-in page sends you back here, finish connecting. */
export function resumeBankSignIn() {
  if (!/[?&]oauth_state_id=/.test(window.location.search)) return null;
  const token = sessionStorageGet(LINK_KEY);
  const received = window.location.href;
  window.history.replaceState(null, '', `${window.location.pathname}#money`);
  if (!token) return Promise.reject(new Error('Start connecting the bank again from this same browser.'));
  return openLink(token, { received });
}

export async function removeBank(itemId) {
  await api({ action: 'remove', itemId });
  await sync();
}
