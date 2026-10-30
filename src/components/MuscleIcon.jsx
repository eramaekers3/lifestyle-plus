// Small body figures with the worked muscles filled in: red for the main muscle, orange for helpers.
// Four figures cover every group: upper body from the front and back, legs from the front and back.

const mirror = (d) => d.replace(/([MLHVCSQTAZ])([^MLHVCSQTAZ]*)/gi, (m, cmd, args) => {
  // Mirror x coordinates across x = 20 (the figure's center line).
  const nums = args.trim().length ? args.trim().split(/[\s,]+/).map(Number) : [];
  const C = cmd.toUpperCase();
  if (C === 'H') return `${cmd}${nums.map((n) => 40 - n).join(' ')}`;
  if (C === 'V' || C === 'Z') return `${cmd}${args}`;
  return `${cmd}${nums.map((n, i) => (i % 2 === 0 ? 40 - n : n)).join(' ')}`;
});
const both = (d) => [d, mirror(d)];

// Upper body, front.
const FRONT = {
  neck: ['M17 2.5H23V6.5H17Z'],
  traps: ['M17 5.5L12.2 8H27.8L23 5.5Z'],
  delts: both('M12.2 8C7.4 7.6 4.6 10.4 4.8 15C6.6 14 8.6 13.6 10.6 14Z'),
  pecs: both('M12.2 8H19.6V16.6C17 17.7 13.6 17.3 11 15.7L10.6 14Z'),
  abs: ['M13.9 17.4C16.4 18.3 23.6 18.3 26.1 17.4L25.5 30.2C23 32.6 17 32.6 14.5 30.2Z'],
  obliques: both('M11 15.7C11.9 16.6 12.9 17.1 13.9 17.4L14.5 30.2C13.2 30.7 12.2 31.3 11.6 32.2C11 26.6 10.6 20.6 11 15.7Z'),
  biceps: both('M4.8 15C6.6 14 8.6 13.6 10.6 14L10.9 16.2C10.6 19.2 9.7 22.1 8.7 24.6H4.8C4 21.2 4 18.1 4.8 15Z'),
  forearms: both('M4.8 24.6H8.7C8.4 28.1 7.9 31.1 7.3 33.6H4.4C3.9 30.6 4 27.6 4.8 24.6Z'),
  hips: ['M11.6 32.2C14.5 33.9 25.5 33.9 28.4 32.2L28.6 36.5H11.4Z'],
};
const FRONT_LINES = 'M20 18V32M14.3 21.6H25.7M14.5 25.8H25.5';

// Upper body, back.
const BACK = {
  neck: ['M17 2.5H23V6.5H17Z'],
  traps: ['M17 5.5L12.2 8L16.2 12.6L20 19.5L23.8 12.6L27.8 8L23 5.5Z'],
  delts: both('M12.2 8C7.4 7.6 4.6 10.4 4.8 15C6.6 14 8.6 13.6 10.6 14Z'),
  lats: both('M12.2 8L10.6 14L11 15.7C11.2 21 11.6 26.6 12.6 30.6C15 31.6 17.6 31.9 19.6 31.9V19.5L16.2 12.6Z'),
  triceps: both('M4.8 15C6.6 14 8.6 13.6 10.6 14L10.9 16.2C10.6 19.2 9.7 22.1 8.7 24.6H4.8C4 21.2 4 18.1 4.8 15Z'),
  forearms: both('M4.8 24.6H8.7C8.4 28.1 7.9 31.1 7.3 33.6H4.4C3.9 30.6 4 27.6 4.8 24.6Z'),
  hips: ['M12.6 30.6C15 31.6 25 31.6 27.4 30.6L28.6 36.5H11.4Z'],
};
const BACK_LINES = 'M20 6.5V31.5';

// Legs, front.
const LEGS_FRONT = {
  hips: ['M8 3H32L32.6 9.2H7.4Z'],
  quads: both('M7.4 9.2H19.4L18.6 24C16.2 25.6 12.2 25.6 10 24C8.4 19.2 7.4 14.4 7.4 9.2Z'),
  shins: both('M10 24C12.2 25.6 16.2 25.6 18.6 24L17.6 34.4H11.8C10.7 31 10 27.6 10 24Z'),
  feet: both('M11.8 34.4H17.6L18.4 37.4H10.6Z'),
};
const LEGS_FRONT_LINES = 'M13.4 11.5C14.6 15.5 14.6 19.5 13.4 22.8M26.6 11.5C25.4 15.5 25.4 19.5 26.6 22.8';

// Legs, back.
const LEGS_BACK = {
  waist: ['M8.6 2.5H31.4L31.6 5H8.4Z'],
  glutes: both('M8.4 5H19.6V11.4C19.6 14.2 17.2 15.4 14 15.4C10.8 15.4 8.4 13.8 7.9 11.6C7.8 9.4 8 7.2 8.4 5Z'),
  hamstrings: both('M7.9 11.6C8.4 13.8 10.8 15.4 14 15.4C17.2 15.4 19.6 14.2 19.6 11.4L18.6 24C16.2 25.6 12.2 25.6 10 24C8.5 19.6 7.8 15.6 7.9 11.6Z'),
  calves: both('M10 24C12.2 25.6 16.2 25.6 18.6 24C19.1 27.8 18.4 31.4 17.6 34.4H11.8C10.6 31.2 10 27.6 10 24Z'),
  feet: both('M11.8 34.4H17.6L18.4 37.4H10.6Z'),
};
const LEGS_BACK_LINES = 'M14 16.6V23.6M26 16.6V23.6';

const FIGURES = {
  front: { parts: FRONT, lines: FRONT_LINES },
  back: { parts: BACK, lines: BACK_LINES },
  legsFront: { parts: LEGS_FRONT, lines: LEGS_FRONT_LINES },
  legsBack: { parts: LEGS_BACK, lines: LEGS_BACK_LINES },
};

// Which figure shows a group best, and which parts each muscle lights up on each figure.
const FIGURE_FOR = {
  chest: 'front', shoulders: 'front', biceps: 'front', forearms: 'front', core: 'front',
  back: 'back', triceps: 'back',
  quads: 'legsFront',
  hamstrings: 'legsBack', glutes: 'legsBack', calves: 'legsBack',
};
const PARTS = {
  front: { Chest: ['pecs'], Shoulders: ['delts'], Biceps: ['biceps'], Forearms: ['forearms'], Core: ['abs', 'obliques'], Back: ['traps'] },
  back: { Back: ['traps', 'lats'], Shoulders: ['delts'], Triceps: ['triceps'], Forearms: ['forearms'] },
  legsFront: { Quads: ['quads'], Calves: ['shins'] },
  legsBack: { Glutes: ['glutes'], Hamstrings: ['hamstrings'], Calves: ['calves'] },
};

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 *   group:   the muscle group to show (picks the figure)
 *   muscles: optional { Chest: 1, Triceps: 0.5 } — main muscles in red, helpers in orange.
 *            Without it, the whole group is shown in red.
 */
export default function MuscleIcon({ group, muscles, size = 22 }) {
  const fig = FIGURE_FOR[group];
  if (!fig) return null;
  const { parts, lines } = FIGURES[fig];
  const lit = {};
  const m = muscles || { [cap(group)]: 1 };
  for (const [muscle, w] of Object.entries(m)) {
    for (const p of PARTS[fig][muscle] || []) lit[p] = Math.max(lit[p] || 0, w);
  }
  // Make sure the group itself always shows, even if the map credits it as a helper only.
  if (!muscles) for (const p of PARTS[fig][cap(group)] || []) lit[p] = 1;

  return (
    <svg className={`mus-fig f-${fig}`} width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      {Object.entries(parts).map(([name, ds]) =>
        ds.map((d, i) => (
          <path key={name + i} d={d} className={lit[name] >= 1 ? 'hi' : lit[name] > 0 ? 'help' : 'base'} />
        ))
      )}
      <path d={lines} className="ln" />
    </svg>
  );
}
