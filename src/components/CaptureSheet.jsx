import { useState } from 'react';
import { Sheet, Icon } from './ui.jsx';
import { addTask } from '../lib/model.js';

/** Fast capture: type, press return, repeat. Everything lands in the backlog. */
export default function CaptureSheet({ onClose }) {
  const [title, setTitle] = useState('');
  const [added, setAdded] = useState([]);
  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    addTask(title);
    setAdded((a) => [title.trim(), ...a].slice(0, 5));
    setTitle('');
  };
  return (
    <Sheet title="Capture" onClose={onClose}>
      <p className="sheet-sub">Get it out of your head. It waits in the backlog until you pull it.</p>
      <form className="inline" onSubmit={submit}>
        <input
          id="capture-title"
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing?"
          autoFocus
          autoComplete="off"
          enterKeyHint="done"
        />
        <button className="btn">Add</button>
      </form>
      {added.length > 0 && (
        <ul className="captured">
          {added.map((t, i) => (
            <li key={`${t}-${i}`}>
              <Icon name="check" size={14} /> {t}
            </li>
          ))}
        </ul>
      )}
      <button className="btn ghost wide" onClick={onClose}>
        Done
      </button>
    </Sheet>
  );
}
