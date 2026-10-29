// POST /api/canvas  { token, host, from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
// Reads your Canvas planner with your own access token and returns what you've submitted, so
// lifestyle+ can check finished work off. The token travels in the request body, is only ever sent
// to your school's Canvas, and is never stored or logged here.
//   → { name, items: [{ assignmentId, title, submitted, missing, due }] }

const okHost = (h) => /^[a-z0-9.-]+$/i.test(h || '') && (h.endsWith('.instructure.com') || h.endsWith('.edu'));
const MAX_PAGES = 12;

async function canvasGet(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'manual' });
  if (res.status === 401) throw Object.assign(new Error('Canvas didn’t accept that token. It may have expired, or your school may not allow student tokens.'), { status: 401 });
  if (res.status >= 300 && res.status < 400) throw Object.assign(new Error('Canvas redirected the request, so the token may be for a different school.'), { status: 400 });
  if (!res.ok) throw Object.assign(new Error(`Canvas didn’t respond (error ${res.status}). Try again in a minute.`), { status: 502 });
  return { data: await res.json(), next: /<([^>]+)>;\s*rel="next"/.exec(res.headers.get('link') || '')?.[1] };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const { token, host, from, to } = body || {};
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!token || !okHost(host) || !dateRe.test(from || '') || !dateRe.test(to || '')) {
    return res.status(400).json({ error: 'Send a Canvas token, your Canvas address, and a from and to date.' });
  }
  const base = `https://${host}/api/v1`;
  try {
    const me = await canvasGet(`${base}/users/self`, token);
    const items = [];
    let url = `${base}/planner/items?per_page=100&start_date=${from}&end_date=${to}`;
    for (let page = 0; url && page < MAX_PAGES; page++) {
      // Only follow pagination links back to the same Canvas.
      if (new URL(url).host !== host) break;
      const { data, next } = await canvasGet(url, token);
      for (const it of data || []) {
        const p = it.plannable || {};
        const assignmentId = p.assignment_id || (it.plannable_type === 'assignment' ? it.plannable_id : null);
        if (!assignmentId) continue;
        const s = it.submissions || {};
        items.push({
          assignmentId: String(assignmentId),
          title: p.title || p.name || '',
          submitted: !!(s.submitted || s.graded || s.excused) || !!(it.planner_override && it.planner_override.marked_complete),
          missing: !!s.missing,
          due: it.plannable_date || null,
        });
      }
      url = next;
    }
    res.status(200).json({ name: me.data && (me.data.short_name || me.data.name), items });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong reading Canvas.' });
  }
}
