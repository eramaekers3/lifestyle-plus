// GET /api/media?q=dune&type=all|movie|show   → { results: [...], source }
// GET /api/media?ref=tmdb:movie:438631          → { item }
// GET /api/media?episodes=tvmaze:44778           → { episodes: [{ s, e, t, d }] }
// Search for a movie or show to add to the Watch list. See _media-core.js for where results come from.
import { handle } from './_media-core.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET.' });
  // Titles don't change much, so let the edge keep answers for a while (episode lists for a few hours,
  // so new episodes of a running show turn up the same day).
  res.setHeader('Cache-Control', req.query && req.query.episodes ? 'public, s-maxage=14400' : 'public, s-maxage=86400, stale-while-revalidate=604800');
  await handle(req.query || {}, (status, data) => {
    if (status !== 200) res.setHeader('Cache-Control', 'no-store');
    res.status(status).json(data);
  });
}
