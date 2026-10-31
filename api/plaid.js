// POST /api/plaid   Authorization: Bearer <Supabase session token>
//   { action: 'link', redirectUri?, itemId? }    → { linkToken }   (itemId = fix a login that needs reconnecting)
//   { action: 'exchange', publicToken, institution } → connects a bank, then syncs it
//   { action: 'sync' }                            → pulls new balances, transactions and holdings for every bank
//   { action: 'remove', itemId }                  → disconnects a bank and removes its data
//
// Bank access tokens live only in the plaid_items table, which has no policies for signed-in users:
// only this server (with the service key) can read it. The app only ever sees the records below.
import { bearer, serverDb, userFor } from './_server.js';
import { PLAID_HOSTS, syncItem, itemRec, snapshotRec } from './_plaid-core.js';
import { idFor } from '../src/lib/ids.js';

export const config = { maxDuration: 60 };

const PLAID_ENV = process.env.PLAID_ENV || 'production';
const HOST = PLAID_HOSTS[PLAID_ENV] || PLAID_HOSTS.production;

async function plaid(path, body) {
  const res = await fetch(HOST + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: process.env.PLAID_CLIENT_ID, secret: process.env.PLAID_SECRET, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.display_message || data.error_message || `Plaid error ${res.status}`);
    err.code = data.error_code;
    throw err;
  }
  return data;
}

const localDate = (tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'America/Chicago' }).format(new Date());

async function save(db, userId, records) {
  const now = new Date().toISOString();
  const rows = records.map((r) => ({ ...r, user_id: userId, updated_at: now }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from('records').upsert(rows.slice(i, i + 500));
    if (error) throw new Error(`Saving failed: ${error.message}`);
  }
}

/** Syncs some (or all) of a person's banks and writes today's net worth. */
async function syncAll(db, userId, items, tz) {
  const now = new Date().toISOString();
  const summary = [];
  for (const item of items) {
    const r = await syncItem(plaid, item, now);
    // Sold positions disappear from Plaid's list, so clear holdings this bank no longer reports.
    const keep = new Set(r.records.filter((x) => x.kind === 'fin_holding').map((x) => x.id));
    if (r.accounts.some((a) => a.type === 'investment') && r.status !== 'error' && r.status !== 'login') {
      const { data: old } = await db.from('records').select('id, data').eq('user_id', userId).eq('kind', 'fin_holding').eq('deleted', false).eq('data->>itemId', item.item_id);
      for (const o of old || []) if (!keep.has(o.id)) r.records.push({ id: o.id, kind: 'fin_holding', data: o.data, deleted: true });
    }
    await save(db, userId, [...r.records, itemRec(item, r.status, r.error, now)]);
    if (r.cursor !== item.cursor) await db.from('plaid_items').update({ cursor: r.cursor, updated_at: now }).eq('item_id', item.item_id);
    summary.push({ institution: item.institution, status: r.status, saved: r.records.length });
  }
  const { data: accts } = await db.from('records').select('data').eq('user_id', userId).eq('kind', 'fin_account').eq('deleted', false);
  await save(db, userId, [snapshotRec((accts || []).map((a) => a.data), localDate(tz))]);
  return summary;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
    return res.status(500).json({ error: 'Plaid isn’t set up yet: add PLAID_CLIENT_ID and PLAID_SECRET in Vercel.' });
  }
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in first.' });
  const db = serverDb();
  const user = await userFor(db, token);
  if (!user) return res.status(401).json({ error: 'Sign in again, then try.' });

  let body = req.body;
  if (typeof body === 'string') body = JSON.parse(body || '{}');
  const { action } = body || {};

  try {
    if (action === 'link') {
      const base = {
        client_name: 'lifestyle+',
        user: { client_user_id: user.id },
        country_codes: ['US'],
        language: 'en',
        ...(body.redirectUri ? { redirect_uri: body.redirectUri } : {}),
      };
      if (body.itemId) {
        // Update mode: sign back in to a bank whose login expired.
        const { data: row } = await db.from('plaid_items').select('access_token').eq('user_id', user.id).eq('item_id', body.itemId).maybeSingle();
        if (!row) return res.status(404).json({ error: 'That bank isn’t connected.' });
        const r = await plaid('/link/token/create', { ...base, access_token: row.access_token });
        return res.status(200).json({ linkToken: r.link_token });
      }
      const r = await plaid('/link/token/create', {
        ...base,
        products: ['transactions'],
        optional_products: ['investments'],
        transactions: { days_requested: 730 },
      });
      return res.status(200).json({ linkToken: r.link_token });
    }

    if (action === 'exchange') {
      const r = await plaid('/item/public_token/exchange', { public_token: body.publicToken });
      const institution = (body.institution && body.institution.name) || 'Bank';
      const item = { item_id: r.item_id, access_token: r.access_token, institution, cursor: null };
      const { error } = await db.from('plaid_items').upsert({ ...item, user_id: user.id, updated_at: new Date().toISOString() });
      if (error) {
        return res.status(500).json({
          error: /plaid_items/.test(error.message) ? 'The database isn’t set up for banks yet. Run the plaid_items part of supabase/schema.sql in Supabase.' : error.message,
        });
      }
      const summary = await syncAll(db, user.id, [item], body.tz);
      return res.status(200).json({ ok: true, summary });
    }

    if (action === 'sync') {
      const { data: items, error } = await db.from('plaid_items').select('item_id, access_token, institution, cursor').eq('user_id', user.id);
      if (error) return res.status(500).json({ error: error.message });
      if (!items || !items.length) return res.status(200).json({ ok: true, summary: [] });
      const summary = await syncAll(db, user.id, items, body.tz);
      return res.status(200).json({ ok: true, summary });
    }

    if (action === 'remove') {
      const { data: row } = await db.from('plaid_items').select('access_token').eq('user_id', user.id).eq('item_id', body.itemId).maybeSingle();
      if (row) {
        await plaid('/item/remove', { access_token: row.access_token }).catch(() => {});
        await db.from('plaid_items').delete().eq('item_id', body.itemId).eq('user_id', user.id);
      }
      // Remove this bank's accounts, holdings and its transactions from the app.
      const now = new Date().toISOString();
      const { data: accts } = await db.from('records').select('id, data').eq('user_id', user.id).eq('kind', 'fin_account').eq('data->>itemId', body.itemId);
      const ids = (accts || []).map((a) => a.data.accountId);
      const gone = (accts || []).map((a) => a.id);
      if (ids.length) {
        for (const kind of ['fin_txn', 'fin_holding']) {
          const { data: rows } = await db.from('records').select('id').eq('user_id', user.id).eq('kind', kind).in('data->>accountId', ids);
          gone.push(...(rows || []).map((r) => r.id));
        }
      }
      gone.push(idFor(`fi:${body.itemId}`));
      for (let i = 0; i < gone.length; i += 500) {
        await db.from('records').update({ deleted: true, updated_at: now }).eq('user_id', user.id).in('id', gone.slice(i, i + 500));
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    console.log('plaid error', action, e.code || '', e.message);
    return res.status(502).json({ error: e.message, code: e.code || null });
  }
}
