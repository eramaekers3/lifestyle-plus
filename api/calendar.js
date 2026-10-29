// POST /api/calendar  { url, from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
// The link travels in the request body, not the address, so it stays out of request logs.
import { handle } from './_calendar-core.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST.' });
    return;
  }
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  await handle(body, (status, data) => res.status(status).json(data));
}
