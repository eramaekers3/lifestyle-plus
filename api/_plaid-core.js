// Plaid → lifestyle+ records. No network here (except through the `call` passed in), so it can be tested.
//
// What the app gets (all ordinary synced records, so every device sees them):
//   fin_item      one per bank login: institution, status, last sync. Never the access token.
//   fin_account   one per account: type, balances
//   fin_txn       one per transaction (Plaid's sign: positive = money out)
//   fin_holding   one per investment position
//   fin_snapshot  one per day: net worth and totals by account type, for the history chart
import { idFor } from '../src/lib/ids.js';

export const PLAID_HOSTS = {
  sandbox: 'https://sandbox.plaid.com',
  production: 'https://production.plaid.com',
};

const rec = (kind, id, data, deleted = false) => ({ id, kind, data: { ...data, id }, deleted });

export const accountRec = (itemId, institution, a, now) =>
  rec('fin_account', idFor(`fa:${a.account_id}`), {
    accountId: a.account_id,
    itemId,
    institution,
    name: a.name,
    officialName: a.official_name || '',
    mask: a.mask || '',
    type: a.type, // depository | credit | loan | investment | other
    subtype: a.subtype || '',
    current: a.balances.current,
    available: a.balances.available,
    limit: a.balances.limit,
    updatedAt: now,
  });

export const txnRec = (t) =>
  rec('fin_txn', idFor(`ft:${t.transaction_id}`), {
    txnId: t.transaction_id,
    accountId: t.account_id,
    date: t.authorized_date || t.date,
    amount: t.amount,
    name: t.name,
    merchant: t.merchant_name || '',
    cat: (t.personal_finance_category && t.personal_finance_category.primary) || 'OTHER',
    catDetail: (t.personal_finance_category && t.personal_finance_category.detailed) || '',
    pending: !!t.pending,
    logo: t.logo_url || '',
  });

export const removedTxnRec = (txnId) => rec('fin_txn', idFor(`ft:${txnId}`), { txnId }, true);

export function holdingRecs(itemId, holdings, securities) {
  const sec = new Map((securities || []).map((s) => [s.security_id, s]));
  return (holdings || []).map((h) => {
    const s = sec.get(h.security_id) || {};
    return rec('fin_holding', idFor(`fh:${h.account_id}:${h.security_id}`), {
      itemId,
      accountId: h.account_id,
      securityId: h.security_id,
      ticker: s.ticker_symbol || '',
      name: s.name || 'Unknown',
      secType: s.type || '',
      qty: h.quantity,
      price: h.institution_price,
      value: h.institution_value,
      cost: h.cost_basis,
    });
  });
}

/** Net worth from account balances. Credit cards and loans count against it. */
export function snapshotRec(accounts, date) {
  const t = { cash: 0, invest: 0, credit: 0, loans: 0, other: 0 };
  for (const a of accounts) {
    const v = Number(a.current) || 0;
    if (a.type === 'depository') t.cash += v;
    else if (a.type === 'investment') t.invest += v;
    else if (a.type === 'credit') t.credit += v;
    else if (a.type === 'loan') t.loans += v;
    else t.other += v;
  }
  const assets = t.cash + t.invest + t.other;
  const debts = t.credit + t.loans;
  const r2 = (v) => Math.round(v * 100) / 100;
  return rec('fin_snapshot', idFor(`fs:${date}`), {
    date,
    assets: r2(assets),
    debts: r2(debts),
    net: r2(assets - debts),
    cash: r2(t.cash),
    invest: r2(t.invest),
    credit: r2(t.credit),
    loans: r2(t.loans),
  });
}

/**
 * Pulls everything new for one bank login.
 *   call(path, body) → Plaid JSON (throws { code, message } on a Plaid error)
 * Returns { records, cursor, status, error }.
 */
export async function syncItem(call, item, now = new Date().toISOString()) {
  const out = [];
  let status = 'ok';
  let error = null;

  // Accounts and balances.
  let accounts = [];
  try {
    const r = await call('/accounts/get', { access_token: item.access_token });
    accounts = r.accounts || [];
    for (const a of accounts) out.push(accountRec(item.item_id, item.institution, a, now));
  } catch (e) {
    status = e.code === 'ITEM_LOGIN_REQUIRED' ? 'login' : 'error';
    error = e.message;
    return { records: [], cursor: item.cursor, status, error, accounts };
  }

  // Transactions, page by page, from where the last sync stopped.
  let cursor = item.cursor || null;
  try {
    for (let page = 0; page < 40; page++) {
      const r = await call('/transactions/sync', { access_token: item.access_token, cursor: cursor || undefined, count: 500 });
      for (const t of [...(r.added || []), ...(r.modified || [])]) out.push(txnRec(t));
      for (const t of r.removed || []) out.push(removedTxnRec(t.transaction_id));
      cursor = r.next_cursor;
      if (!r.has_more) break;
    }
  } catch (e) {
    // Brokerages often don't offer transactions; that's fine, holdings cover them.
    if (!/PRODUCTS_NOT_SUPPORTED|NO_ACCOUNTS|PRODUCT_NOT_READY|INVALID_PRODUCT/.test(e.code || '')) {
      status = 'partial';
      error = e.message;
    }
  }

  // Investment holdings, if this login has an investment account.
  if (accounts.some((a) => a.type === 'investment')) {
    try {
      const r = await call('/investments/holdings/get', { access_token: item.access_token });
      out.push(...holdingRecs(item.item_id, r.holdings, r.securities));
    } catch (e) {
      if (!/PRODUCTS_NOT_SUPPORTED|NO_INVESTMENT_ACCOUNTS|PRODUCT_NOT_READY|INVALID_PRODUCT|ADDITIONAL_CONSENT_REQUIRED/.test(e.code || '')) {
        status = 'partial';
        error = e.message;
      }
    }
  }

  return { records: out, cursor, status, error, accounts };
}

export const itemRec = (item, status, error, now) =>
  rec('fin_item', idFor(`fi:${item.item_id}`), {
    itemId: item.item_id,
    institution: item.institution,
    status,
    error: error || null,
    syncedAt: now,
  });
