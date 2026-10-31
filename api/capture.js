// POST /api/capture — add to your stack or grocery list from Siri (an iPhone Shortcut).
//   Header:  Authorization: Bearer <your lifestyle+ key>   (the same key as Apple Health)
//   Body:    { "text": "call the dentist" }                 → a backlog task
//            { "text": "milk, eggs and bread", "to": "groceries" } → grocery items
//            "…to my grocery list" at the end of the text also goes to groceries.
// Replies in plain text, so the Shortcut can show it and Siri can read it out.
import { bearer, hasDb, serverDb, userForKey } from './_server.js';
import { GROCERY_ID, groceryRecords, parseCapture, reply, splitItems, taskRecord } from './_capture-core.js';

const say = (res, status, text) => res.status(status).setHeader('Content-Type', 'text/plain; charset=utf-8').send(text);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return say(res, 405, 'Use POST.');
  if (!hasDb()) return say(res, 500, 'The server is missing its Supabase keys.');

  const db = serverDb();
  const who = await userForKey(db, bearer(req));
  if (who.error) return say(res, 401, who.error);

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = { text: body };
    }
  }
  const { where, text } = parseCapture(body && body.text, body && body.to);
  if (!text) return say(res, 400, 'I didn’t catch anything to add.');

  const now = new Date();
  const stamp = (r) => ({ ...r, user_id: who.userId, updated_at: now.toISOString(), deleted: false });
  let records;
  let message;

  if (where === 'groceries') {
    const { data, error } = await db
      .from('records')
      .select('data')
      .eq('user_id', who.userId)
      .eq('kind', 'listitem')
      .eq('deleted', false)
      .eq('data->>listId', GROCERY_ID);
    if (error) return say(res, 500, `Couldn’t read your list: ${error.message}`);
    const g = groceryRecords(splitItems(text), (data || []).map((r) => r.data), now);
    records = g.records;
    message = reply('groceries', g);
  } else {
    const { data, error } = await db
      .from('records')
      .select('data')
      .eq('user_id', who.userId)
      .eq('kind', 'task')
      .eq('deleted', false)
      .eq('data->>status', 'backlog');
    if (error) return say(res, 500, `Couldn’t read your stack: ${error.message}`);
    const task = taskRecord(text, (data || []).map((r) => r.data.order ?? 0), now);
    records = [task];
    message = reply('stack', { title: task.data.title });
  }

  if (records.length) {
    const { error } = await db.from('records').upsert(records.map(stamp));
    if (error) return say(res, 500, `Saving failed: ${error.message}`);
  }
  return say(res, 200, message);
}
