// Movie and TV lookups for the Watch list.
//
// With a free TMDB key in the TMDB_TOKEN environment variable (the "API Read Access Token" from
// themoviedb.org → Settings → API), searches use TMDB, which covers both movies and shows well.
// Without one it still works, keylessly: TVmaze for shows and Apple's iTunes catalog for movies.
//
// Every result comes back in one shape:
//   { ref, type: 'movie'|'show', title, year, poster, overview, genres: [], runtime?, seasons?,
//     people: [], credit, source }
// `ref` (like "tmdb:movie:603") is what you send back to get full details.

const TMDB = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/w342';
const token = () => process.env.TMDB_TOKEN || process.env.TMDB_API_KEY || '';
export const hasTmdb = () => !!token();

const MOVIE_GENRES = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama',
  10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance',
  878: 'Sci-fi', 10770: 'TV movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
};
const TV_GENRES = {
  10759: 'Action & adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama',
  10751: 'Family', 10762: 'Kids', 9648: 'Mystery', 10763: 'News', 10764: 'Reality', 10765: 'Sci-fi & fantasy',
  10766: 'Soap', 10767: 'Talk', 10768: 'War & politics', 37: 'Western',
};

const yearOf = (d) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);
const stripTags = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const clip = (s, n = 600) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

async function getJson(url, headers = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: ctrl.signal });
    if (!res.ok) throw Object.assign(new Error(`Lookup failed (${res.status})`), { status: res.status });
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/* ---------- TMDB ---------- */

function tmdbGet(path) {
  const k = token();
  // A long token is the v4 "Read Access Token"; a short one is the older v3 API key.
  if (k.length > 40) return getJson(`${TMDB}${path}`, { Authorization: `Bearer ${k}` });
  return getJson(`${TMDB}${path}${path.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(k)}`);
}

function fromTmdb(r, kind) {
  const type = kind === 'tv' ? 'show' : 'movie';
  const table = kind === 'tv' ? TV_GENRES : MOVIE_GENRES;
  return {
    ref: `tmdb:${kind}:${r.id}`,
    type,
    title: r.title || r.name || 'Untitled',
    year: yearOf(r.release_date || r.first_air_date),
    poster: r.poster_path ? `${TMDB_IMG}${r.poster_path}` : null,
    overview: clip(stripTags(r.overview)),
    genres: r.genres ? r.genres.map((g) => g.name) : (r.genre_ids || []).map((g) => table[g]).filter(Boolean),
    score: r.vote_count > 20 ? Math.round(r.vote_average * 10) / 10 : null,
    source: 'TMDB',
  };
}

async function tmdbSearch(q, type) {
  const enc = encodeURIComponent(q);
  if (type === 'movie') return (await tmdbGet(`/search/movie?query=${enc}&include_adult=false`)).results.map((r) => fromTmdb(r, 'movie'));
  if (type === 'show') return (await tmdbGet(`/search/tv?query=${enc}&include_adult=false`)).results.map((r) => fromTmdb(r, 'tv'));
  const data = await tmdbGet(`/search/multi?query=${enc}&include_adult=false`);
  return data.results.filter((r) => r.media_type === 'movie' || r.media_type === 'tv').map((r) => fromTmdb(r, r.media_type));
}

async function tmdbDetails(kind, id) {
  const r = await tmdbGet(`/${kind}/${id}?append_to_response=credits`);
  const out = fromTmdb(r, kind);
  const cast = ((r.credits && r.credits.cast) || []).slice(0, 5).map((c) => c.name);
  if (kind === 'movie') {
    const directors = ((r.credits && r.credits.crew) || []).filter((c) => c.job === 'Director').map((c) => c.name);
    return { ...out, runtime: r.runtime || null, credit: directors.length ? `Directed by ${directors.join(', ')}` : '', people: cast };
  }
  const creators = (r.created_by || []).map((c) => c.name);
  return {
    ...out,
    seasons: r.number_of_seasons || null,
    episodes: r.number_of_episodes || null,
    runtime: (r.episode_run_time && r.episode_run_time[0]) || null,
    ended: r.status === 'Ended' || r.status === 'Canceled',
    credit: creators.length ? `Created by ${creators.join(', ')}` : '',
    people: cast,
  };
}

/* ---------- Keyless: TVmaze (shows) and iTunes (movies) ---------- */

function fromMaze(s) {
  return {
    ref: `tvmaze:${s.id}`,
    type: 'show',
    title: s.name || 'Untitled',
    year: yearOf(s.premiered),
    poster: s.image ? (s.image.medium || s.image.original).replace(/^http:/, 'https:') : null,
    overview: clip(stripTags(s.summary)),
    genres: s.genres || [],
    runtime: s.averageRuntime || s.runtime || null,
    ended: s.status === 'Ended',
    score: s.rating && s.rating.average ? s.rating.average : null,
    source: 'TVmaze',
  };
}

function fromItunes(m) {
  return {
    ref: `itunes:${m.trackId}`,
    type: 'movie',
    title: m.trackName || 'Untitled',
    year: yearOf(m.releaseDate),
    // Apple serves any size by changing the number in the address.
    poster: m.artworkUrl100 ? m.artworkUrl100.replace('100x100bb', '342x513bb') : null,
    overview: clip(stripTags(m.longDescription || m.shortDescription)),
    genres: m.primaryGenreName ? [m.primaryGenreName] : [],
    runtime: m.trackTimeMillis ? Math.round(m.trackTimeMillis / 60000) : null,
    credit: m.artistName ? `Directed by ${m.artistName}` : '',
    people: [],
    source: 'iTunes',
  };
}

async function mazeSearch(q) {
  const data = await getJson(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`);
  return data.map((d) => fromMaze(d.show));
}

async function itunesSearch(q) {
  const data = await getJson(`https://itunes.apple.com/search?media=movie&entity=movie&limit=15&country=US&term=${encodeURIComponent(q)}`);
  // The same film is often listed more than once (different editions); keep the first of each.
  const seen = new Set();
  return (data.results || []).map(fromItunes).filter((m) => {
    const k = `${m.title.toLowerCase()}|${m.year}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function keylessSearch(q, type) {
  const jobs = [];
  if (type !== 'show') jobs.push(itunesSearch(q));
  if (type !== 'movie') jobs.push(mazeSearch(q));
  const settled = await Promise.allSettled(jobs);
  const lists = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
  if (!lists.length) throw settled[0].reason;
  // Alternate movies and shows so both show up near the top.
  const out = [];
  for (let i = 0; i < Math.max(...lists.map((l) => l.length)); i++) lists.forEach((l) => l[i] && out.push(l[i]));
  return out;
}

async function mazeDetails(id) {
  const s = await getJson(`https://api.tvmaze.com/shows/${id}?embed[]=cast&embed[]=seasons`);
  const emb = s._embedded || {};
  return {
    ...fromMaze(s),
    seasons: (emb.seasons || []).filter((x) => x.number > 0).length || null,
    people: (emb.cast || []).slice(0, 5).map((c) => c.person && c.person.name).filter(Boolean),
    credit: s.network ? s.network.name : s.webChannel ? s.webChannel.name : '',
  };
}

async function itunesDetails(id) {
  const data = await getJson(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&country=US`);
  const m = (data.results || [])[0];
  if (!m) throw Object.assign(new Error('Not found'), { status: 404 });
  return fromItunes(m);
}

/* ---------- Entry points ---------- */

export async function search(q, type = 'all') {
  const query = String(q || '').trim().slice(0, 100);
  if (query.length < 2) return [];
  const kind = ['movie', 'show'].includes(type) ? type : 'all';
  const results = hasTmdb() ? await tmdbSearch(query, kind) : await keylessSearch(query, kind);
  return results.slice(0, 20);
}

export async function details(ref) {
  const [src, a, b] = String(ref || '').split(':');
  if (src === 'tmdb' && (a === 'movie' || a === 'tv') && /^\d+$/.test(b) && hasTmdb()) return tmdbDetails(a, b);
  if (src === 'tvmaze' && /^\d+$/.test(a)) return mazeDetails(a);
  if (src === 'itunes' && /^\d+$/.test(a)) return itunesDetails(a);
  throw Object.assign(new Error('Unknown title'), { status: 400 });
}

/** GET /api/media?q=…&type=all|movie|show  or  ?ref=tmdb:movie:603 */
export async function handle(params, send) {
  try {
    if (params.ref) return send(200, { item: await details(params.ref) });
    return send(200, { results: await search(params.q, params.type), source: hasTmdb() ? 'TMDB' : 'TVmaze + iTunes' });
  } catch (e) {
    const status = e.status === 404 || e.status === 400 ? e.status : 502;
    return send(status, { error: status === 502 ? 'The movie database didn’t answer. Try again in a moment.' : e.message });
  }
}
