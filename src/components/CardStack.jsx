import { useState } from 'react';
import { saveSettings, useSettings } from '../store.js';
import { Icon, Sheet } from './ui.jsx';
import SortableList from './SortableList.jsx';

/**
 * A page's cards in your own order, each foldable down to its header line.
 *   page:  'body', 'stack', 'day', 'week' — where the layout is saved (in settings, so it syncs)
 *   cards: [{ id, title, node }] in the default order. A node can be null (that card has nothing to show).
 */
export default function CardStack({ page, cards }) {
  const { layout = {} } = useSettings();
  const mine = layout[page] || {};
  const folded = new Set(mine.folded || []);
  const [arranging, setArranging] = useState(false);

  const ordered = orderCards(cards, mine.order);
  const save = (changes) => saveSettings({ layout: { ...layout, [page]: { ...mine, ...changes } } });
  const toggle = (id) => {
    const next = new Set(folded);
    next.has(id) ? next.delete(id) : next.add(id);
    save({ folded: [...next] });
  };

  return (
    <>
      {ordered.map((c) =>
        c.node ? (
          <Fold key={c.id} title={c.title} folded={folded.has(c.id)} onToggle={() => toggle(c.id)}>
            {c.node}
          </Fold>
        ) : null
      )}
      <button className="link-btn arrange-btn" onClick={() => setArranging(true)}>
        <Icon name="grip" size={16} /> Arrange this page
      </button>
      {arranging && (
        <Sheet title="Arrange" onClose={() => setArranging(false)}>
          <p className="sheet-sub">Drag to reorder. Fold a card to keep just its title line; tap the title to open it again.</p>
          <SortableList
            items={ordered.map((c) => ({ id: c.id, title: c.title }))}
            onReorder={(list) => save({ order: list.map((c) => c.id) })}
            className="rows arrange-list"
            rowClass={() => 'row'}
          >
            {(c, grip) => (
              <>
                <span className="row-title">{c.title}</span>
                <button className="mini" aria-pressed={folded.has(c.id)} onClick={() => toggle(c.id)}>
                  {folded.has(c.id) ? 'Folded' : 'Open'}
                </button>
                {grip}
              </>
            )}
          </SortableList>
          <div className="btn-row">
            <button className="btn" onClick={() => setArranging(false)}>Done</button>
            <button className="btn ghost" onClick={() => save({ order: null, folded: [] })}>Reset</button>
          </div>
        </Sheet>
      )}
    </>
  );
}

/** Saved order first; cards that are new since then slot in where they'd be by default. */
function orderCards(cards, order) {
  if (!order || !order.length) return cards;
  const known = cards.filter((c) => order.includes(c.id)).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const out = [...known];
  cards.forEach((c, i) => {
    if (order.includes(c.id)) return;
    const prev = cards.slice(0, i).reverse().find((p) => order.includes(p.id));
    const at = prev ? out.indexOf(prev) + 1 : 0;
    out.splice(at, 0, c);
  });
  return out;
}

/** One card that can fold down to its header. Tapping the header (not its buttons) folds or opens it. */
function Fold({ title, folded, onToggle, children }) {
  return (
    <div
      className={`fold${folded ? ' folded' : ''}`}
      onClick={(e) => {
        const t = e.target;
        if (t.closest('.card-head') && !t.closest('button, a, input, select, label')) onToggle();
      }}
    >
      {children}
      <button className="fold-btn" onClick={onToggle} aria-expanded={!folded} aria-label={`${folded ? 'Open' : 'Fold'} ${title}`}>
        <Icon name="down" size={18} />
      </button>
    </div>
  );
}
