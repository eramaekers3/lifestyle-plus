import { useRef, useState } from 'react';
import { Icon, Sheet } from '../components/ui.jsx';
import CardStack from '../components/CardStack.jsx';
import { toast } from '../lib/toast.js';
import {
  useLists,
  useItems,
  addItem,
  toggleItem,
  removeItem,
  clearItems,
  restoreItems,
  uncheckAll,
  addPackingList,
  renameList,
  deleteList,
} from '../lib/lists.js';

export default function ListsView() {
  const { grocery, packing } = useLists();
  return (
    <>
      <header className="page-head">
        <h1>Lists</h1>
        <p>A grocery list you add to all week, and packing lists you can reuse trip after trip.</p>
      </header>
      <CardStack
        page="lists"
        cards={[
          { id: 'groceries', title: 'Groceries', node: <GroceryCard list={grocery} /> },
          { id: 'packing', title: 'Packing', node: <PackingCard lists={packing} /> },
        ]}
      />
    </>
  );
}

/* ---------- Groceries ---------- */

function GroceryCard({ list }) {
  const { todo, done, all } = useItems(list.id);
  const onList = (name) => all.some((i) => !i.done && i.text.toLowerCase() === name.toLowerCase());
  const recent = (list.recent || []).filter((r) => !onList(r)).slice(0, 12);

  const clear = () => {
    const snapshot = clearItems(list, done);
    toast(`Cleared ${done.length} item${done.length === 1 ? '' : 's'}`, { label: 'Undo', run: () => restoreItems(done, snapshot) });
  };

  return (
    <section className="card" aria-labelledby="gr-h">
      <div className="card-head">
        <h2 id="gr-h">Groceries</h2>
        <span className="meta">{todo.length ? `${todo.length} to get` : ''}</span>
      </div>
      <AddBar listId={list.id} items={all} placeholder="Add an item, like eggs" />
      {recent.length > 0 && (
        <div className="li-recent" aria-label="Add again">
          {recent.map((r) => (
            <button
              key={r}
              className="chip li-again"
              onClick={() => addItem(list.id, r, all)}
            >
              <Icon name="plus" size={13} /> {r}
            </button>
          ))}
        </div>
      )}
      <Items items={todo} />
      {!all.length && <p className="empty">Nothing on the list. Add things as you run out, then check them off in the store.</p>}
      {all.length > 0 && !todo.length && <p className="empty">Got everything.</p>}
      {done.length > 0 && (
        <>
          <div className="li-done-head">
            <span className="mini-h">In the cart · {done.length}</span>
            <button className="mini sun" onClick={clear}>Clear checked</button>
          </div>
          <Items items={done} />
        </>
      )}
    </section>
  );
}

/* ---------- Packing ---------- */

function PackingCard({ lists }) {
  const [open, setOpen] = useState(null); // list id
  const [making, setMaking] = useState(false);
  const current = lists.find((l) => l.id === open);
  return (
    <section className="card" aria-labelledby="pk-h">
      <div className="card-head">
        <h2 id="pk-h">Packing</h2>
        <button className="mini add-blk" onClick={() => setMaking(true)}>
          <Icon name="plus" size={14} /> New list
        </button>
      </div>
      {lists.length ? (
        <ul className="rows">
          {lists.map((l) => (
            <PackingRow key={l.id} list={l} onOpen={() => setOpen(l.id)} />
          ))}
        </ul>
      ) : (
        <p className="empty">Make one for a trip home, a game day or the gym bag. Reuse it next time.</p>
      )}
      {making && (
        <NewPackingSheet
          lists={lists}
          onClose={() => setMaking(false)}
          onMade={(id) => {
            setMaking(false);
            setOpen(id);
          }}
        />
      )}
      {current && <PackingSheet list={current} onClose={() => setOpen(null)} />}
    </section>
  );
}

function PackingRow({ list, onOpen }) {
  const { done, all } = useItems(list.id);
  const pct = all.length ? done.length / all.length : 0;
  return (
    <li className="row">
      <span className="li-ring" style={{ '--p': pct }} aria-hidden="true">
        {all.length > 0 && done.length === all.length && <Icon name="check" size={13} />}
      </span>
      <button className="row-title task-open" onClick={onOpen} aria-label={`Open “${list.name}”`}>
        <span className="title-line">{list.name}</span>
        <span className="task-meta">
          <span>{all.length ? `${done.length} of ${all.length} packed` : 'Empty'}</span>
        </span>
      </button>
      <Icon name="right" size={18} />
    </li>
  );
}

function NewPackingSheet({ lists, onClose, onMade }) {
  const [name, setName] = useState('');
  const [from, setFrom] = useState(null);
  return (
    <Sheet title="New packing list" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onMade(addPackingList(name, from ? from.items : []).id);
        }}
      >
        <label className="f">
          Name
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Thanksgiving at home" />
        </label>
        {lists.length > 0 && (
          <div className="f li-from">
            Start from
            <div className="chips">
              <button type="button" className="chip" aria-pressed={!from} onClick={() => setFrom(null)}>Blank</button>
              {lists.map((l) => (
                <CopyChip key={l.id} list={l} on={from && from.id === l.id} onPick={(items) => setFrom({ id: l.id, items })} />
              ))}
            </div>
          </div>
        )}
        <button className="btn wide" disabled={!name.trim()}>Make list</button>
      </form>
    </Sheet>
  );
}

function CopyChip({ list, on, onPick }) {
  const { all } = useItems(list.id);
  return (
    <button type="button" className="chip" aria-pressed={!!on} onClick={() => onPick([...all].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')))}>
      {list.name} <span className="muted-n">{all.length}</span>
    </button>
  );
}

function PackingSheet({ list, onClose }) {
  const { todo, done, all } = useItems(list.id);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState(list.name);
  const [confirm, setConfirm] = useState(false);

  return (
    <Sheet title={list.name} onClose={onClose}>
      {naming ? (
        <form
          className="inline li-rename"
          onSubmit={(e) => {
            e.preventDefault();
            renameList(list, name);
            setNaming(false);
          }}
        >
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn">Save</button>
        </form>
      ) : (
        <p className="sheet-sub">{all.length ? `${done.length} of ${all.length} packed` : 'Add everything you take on this kind of trip.'}</p>
      )}
      <AddBar listId={list.id} items={all} placeholder="Add an item, like charger" />
      <Items items={todo} />
      {all.length > 0 && !todo.length && <p className="empty">All packed.</p>}
      {done.length > 0 && (
        <>
          <div className="li-done-head">
            <span className="mini-h">Packed · {done.length}</span>
          </div>
          <Items items={done} />
        </>
      )}
      <div className="btn-row li-actions">
        <button className="btn ghost" disabled={!done.length} onClick={() => uncheckAll(all)}>Uncheck all</button>
        <button className="btn ghost" onClick={() => setNaming(true)}>Rename</button>
        {confirm ? (
          <button
            className="btn danger"
            onClick={() => {
              onClose();
              deleteList(list, all);
              toast(`Deleted “${list.name}”`);
            }}
          >
            Really delete
          </button>
        ) : (
          <button className="btn ghost" onClick={() => setConfirm(true)}>Delete</button>
        )}
      </div>
    </Sheet>
  );
}

/* ---------- Shared pieces ---------- */

/** The add box stays open and focused, so you can type item after item. */
function AddBar({ listId, items, placeholder }) {
  const [text, setText] = useState('');
  const ref = useRef(null);
  const submit = (e) => {
    e.preventDefault();
    const r = addItem(listId, text, items);
    if (!r) return;
    if (r.status === 'already') toast(`“${r.item.text}” is already on the list`);
    if (navigator.vibrate) navigator.vibrate(8);
    setText('');
    ref.current && ref.current.focus();
  };
  return (
    <form className="li-add" onSubmit={submit}>
      <input
        ref={ref}
        className="input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        enterKeyHint="done"
        autoCapitalize="sentences"
        aria-label="New item"
      />
      <button className="btn" disabled={!text.trim()} aria-label="Add">
        <Icon name="plus" size={18} />
      </button>
    </form>
  );
}

function Items({ items }) {
  if (!items.length) return null;
  return (
    <ul className="rows li-items">
      {items.map((i) => (
        <li key={i.id} className={`row li-row${i.done ? ' got' : ''}${!i.done && Date.now() - Date.parse(i.createdAt) < 1500 ? ' fresh' : ''}`}>
          <button className={`check${i.done ? ' on' : ''}`} onClick={() => toggleItem(i)} aria-label={i.done ? `Uncheck “${i.text}”` : `Check off “${i.text}”`}>
            {i.done && <Icon name="check" size={16} />}
          </button>
          <button className="row-title task-open" onClick={() => toggleItem(i)} tabIndex={-1} aria-hidden="true">
            {i.text}
          </button>
          <button className="x" onClick={() => removeItem(i)} aria-label={`Remove “${i.text}”`}>×</button>
        </li>
      ))}
    </ul>
  );
}
