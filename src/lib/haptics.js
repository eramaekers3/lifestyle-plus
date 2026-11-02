// Haptics.
//
// iPhone Safari and home-screen web apps have no vibration API. The one thing that does make an
// iPhone tap is the system switch control: toggling an <input type="checkbox" switch> through its
// <label> gives a light haptic on iOS 18 and later, but only while handling a tap (a click). So for
// each haptic we make a fresh hidden switch, click its label, and throw it away.
// Android and other browsers get navigator.vibrate patterns instead.
//
//   haptic('tick')     a light tap (buttons, chips, tabs)
//   haptic('success')  a double tap (finishing something)
//   haptic('big')      three taps (level up, personal record)
//
// The phone's own "System Haptics" setting (Settings → Sounds & Haptics) has to be on.

const PATTERNS = { tick: [8], success: [10, 60, 14], big: [12, 70, 12, 70, 24] };
const TAPS = { tick: 1, success: 2, big: 3 };

const isIOS =
  typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
// iOS may expose navigator.vibrate as a do-nothing function, so never trust it there.
const canVibrate = !isIOS && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

let n = 0;
function iosTap() {
  if (typeof document === 'undefined') return;
  const id = `hx${++n}`;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.id = id;
  input.tabIndex = -1;
  const label = document.createElement('label');
  label.htmlFor = id;
  label.setAttribute('aria-hidden', 'true');
  label.style.display = 'none';
  label.appendChild(input);
  document.head.appendChild(label);
  try {
    label.click();
  } finally {
    label.remove();
  }
}

let last = 0;

export function haptic(kind = 'tick') {
  const now = performance.now();
  if (kind === 'tick') {
    if (now - last < 40) return; // one tick per touch, even if two handlers ask
    last = now;
  }
  if (canVibrate) {
    try {
      navigator.vibrate(PATTERNS[kind] || PATTERNS.tick);
    } catch {
      /* not allowed here */
    }
    return;
  }
  iosTap();
  // Extra taps for bigger moments. iOS may only honor the first if these land outside the tap.
  for (let i = 1; i < (TAPS[kind] || 1); i++) setTimeout(iosTap, i * 90);
}

// Anything you tap that should tick. Finishing something calls haptic('success') itself.
const TAPPABLE =
  'button, [role="button"], [role="switch"], [role="tab"], [role="checkbox"], a, label, select, summary, .chip, .check, ' +
  'input[type="checkbox"], input[type="radio"], input[type="range"], input[type="date"], input[type="time"]';

/** Also tick for anything styled as clickable (cursor: pointer) a few levels up from the tap. */
function looksTappable(el) {
  for (let i = 0; el && i < 4; i++, el = el.parentElement) {
    if (el === document.body) return false;
    if (getComputedStyle(el).cursor === 'pointer') return true;
  }
  return false;
}

/** One listener for the whole app: a light tick whenever a button-like thing is tapped. */
export function installTapHaptics() {
  if (typeof document === 'undefined') return;
  document.addEventListener(
    'click',
    (e) => {
      if (!e.isTrusted) return; // ignore our own label clicks
      if (!(e.target instanceof Element)) return;
      const t = e.target.closest(TAPPABLE) || (looksTappable(e.target) && e.target);
      if (t && !t.disabled && t.getAttribute('aria-disabled') !== 'true') haptic('tick');
    },
    true
  );
}
