import { useState } from 'react';
import { put, remove } from '../store.js';
import { Icon, Sheet } from './ui.jsx';
import { CAP, COINS, boughtThisWeek, buy, unbuy, useCoins, useRewards } from '../lib/coins.js';
import { cheer } from '../lib/game.js';
import { haptic } from '../lib/haptics.js';
import { toast } from '../lib/toast.js';
import { fmt, iso, todayISO } from '../lib/dates.js';

/** Coin balance in the top bar. Tap to open the rewards shop. */
export default function CoinBadge() {
  const c = useCoins();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`coin-badge${c.full ? ' full' : ''}`} onClick={() => setOpen(true)} aria-label={`${c.balance} coins. Open rewards`}>
        <Icon name="coin" size={17} />
        <b key={c.balance}>{c.balance}</b>
      </button>
      {open && <ShopSheet c={c} onClose={() => setOpen(false)} />}
    </>
  );
}

const when = (at) => {
  const d = iso(new Date(at));
  const t = new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(/\s/g, '');
  return d === todayISO() ? t : `${fmt(d, { weekday: 'short' })} ${t}`;
};

function ShopSheet({ c, onClose }) {
  const rewards = useRewards();
  const [editing, setEditing] = useState(false);
  const [editRow, setEditRow] = useState(null);

  const redeem = (r, e) => {
    const spend = buy(r);
    haptic('big');
    cheer(e.currentTarget, { text: `${r.emoji || ''} ${r.name}`.trim(), sub: `−${r.price} coins · enjoy it` });
    toast(`Unlocked: ${r.name}`, { label: 'Undo', run: () => unbuy(spend) });
  };

  return (
    <Sheet title="Rewards" onClose={onClose}>
      <div className="coin-head">
        <span className="coin-big"><Icon name="coin" size={30} /><b>{c.balance}</b></span>
        <span className="coin-stats">
          <span>+{c.today} today · +{c.week} this week</span>
          <span className="muted-n">Holds up to {CAP}</span>
        </span>
      </div>
      <div className="coin-cap" aria-hidden="true"><i style={{ width: `${(c.balance / CAP) * 100}%` }} /></div>
      {c.full ? (
        <p className="hint coin-warn">You’re at the cap, so new coins are being lost. Time to treat yourself.</p>
      ) : c.lostWeek > 0 ? (
        <p className="hint coin-warn">{c.lostWeek} coins lost at the cap this week.</p>
      ) : null}

      <div className="card-head" style={{ marginTop: 18 }}>
        <h3 className="mini-h" style={{ margin: 0, marginRight: 'auto' }}>Unlock</h3>
        <button className="mini" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit'}</button>
      </div>
      <ul className="rows reward-rows">
        {rewards.map((r) => {
          const n = boughtThisWeek(c.spends, r.id);
          const capped = r.perWeek && n >= r.perWeek;
          const short = r.price - c.balance;
          return (
            <li key={r.id} className="row reward-row">
              <span className="rw-emoji" aria-hidden="true">{r.emoji || '🎁'}</span>
              <span className="row-title">
                {r.name}
                <small>
                  {r.price} coins
                  {r.perWeek ? ` · ${n}/${r.perWeek} this week` : n ? ` · ${n} this week` : ''}
                </small>
              </span>
              {editing ? (
                <button className="mini" onClick={() => setEditRow(r)}>Edit</button>
              ) : (
                <button className="rw-go" disabled={capped || short > 0} onClick={(e) => redeem(r, e)}>
                  {capped ? 'Maxed' : short > 0 ? `${short} more` : 'Unlock'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {editing && (
        <button className="mini" style={{ marginTop: 8 }} onClick={() => setEditRow({ name: '', emoji: '', price: 30, perWeek: null })}>
          <Icon name="plus" size={14} /> Add reward
        </button>
      )}

      {c.spends.length > 0 && (
        <>
          <h3 className="mini-h">Unlocked lately</h3>
          <ul className="rows coin-log">
            {c.spends.slice(0, 6).map((s) => (
              <li key={s.id} className="row">
                <span className="rw-emoji small" aria-hidden="true">{s.emoji || '🎁'}</span>
                <span className="row-title">{s.name}</span>
                <span className="meta">−{s.price} · {when(s.at)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {c.events.length > 0 && (
        <>
          <h3 className="mini-h">Earned lately</h3>
          <ul className="rows coin-log">
            {c.events.slice(-8).reverse().map((e, i) => (
              <li key={`${e.at}${i}`} className="row">
                <span className="coin-plus">+{e.coins}</span>
                <span className="row-title">{e.label}</span>
                <span className="meta">{when(e.at)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="mini-h">How coins work</h3>
      <ul className="xp-rules">
        <li><b>+{COINS.taskBase}</b> finish a task, +{COINS.taskPer15} per 15 min of time needed (up to {COINS.taskMax})</li>
        <li><b>+{COINS.repeat}</b> finish a repeating task</li>
        <li><b>+{COINS.deepPer10}</b> every 10 minutes of deep work you log</li>
        <li><b>+{COINS.workout}</b> finish a workout in fit+, +{COINS.pr} per PR</li>
        <li><b>+{COINS.habit}</b> check off a habit</li>
        <li><b>+{COINS.shutdown}</b> do the evening shutdown</li>
      </ul>
      <p className="hint-quiet">Coins carry over week to week up to {CAP}. XP and your level don’t change when you spend.</p>

      {editRow && <RewardSheet r={editRow} onClose={() => setEditRow(null)} />}
    </Sheet>
  );
}

function RewardSheet({ r, onClose }) {
  const [f, setF] = useState({ ...r, price: String(r.price ?? ''), perWeek: r.perWeek ? String(r.perWeek) : '' });
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const price = Math.round(+f.price);
  const ok = f.name.trim() && price > 0;

  const save = (e) => {
    e.preventDefault();
    if (!ok) return;
    const perWeek = Math.round(+f.perWeek) > 0 ? Math.round(+f.perWeek) : null;
    put('reward', { ...r, name: f.name.trim(), emoji: f.emoji.trim(), price, perWeek, order: r.order ?? Date.now() });
    toast(r.id ? 'Reward saved' : 'Reward added');
    onClose();
  };

  return (
    <Sheet title={r.id ? 'Edit reward' : 'New reward'} onClose={onClose}>
      <form className="form-grid" onSubmit={save}>
        <label className="f full" htmlFor="rw-name">
          Reward
          <input id="rw-name" className="input" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Movie night" autoComplete="off" autoFocus={!r.id} />
        </label>
        <label className="f" htmlFor="rw-emoji">
          Emoji
          <input id="rw-emoji" className="input" value={f.emoji} onChange={(e) => set('emoji', e.target.value)} placeholder="🎬" maxLength={4} autoComplete="off" />
        </label>
        <label className="f" htmlFor="rw-price">
          Price (coins)
          <input id="rw-price" className="input" inputMode="numeric" value={f.price} onChange={(e) => set('price', e.target.value.replace(/\D/g, ''))} />
        </label>
        <label className="f full" htmlFor="rw-limit">
          Most per week
          <input id="rw-limit" className="input" inputMode="numeric" value={f.perWeek} onChange={(e) => set('perWeek', e.target.value.replace(/\D/g, ''))} placeholder="No limit" />
        </label>
        <p className="hint-quiet full">A good week earns around 200 coins. Price so a good week buys what you want, and an average week makes you choose.</p>
        <div className="btn-row full">
          <button className="btn" disabled={!ok}>{r.id ? 'Save' : 'Add reward'}</button>
          {r.id && (
            <button
              type="button"
              className={`btn ${confirmDel ? 'danger' : 'ghost'}`}
              onClick={() => {
                if (!confirmDel) return setConfirmDel(true);
                remove(r.id);
                toast('Reward deleted');
                onClose();
              }}
            >
              {confirmDel ? 'Tap again to delete' : 'Delete'}
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}
