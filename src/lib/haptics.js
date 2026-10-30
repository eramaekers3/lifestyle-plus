// Haptics.
//
// iPhone Safari (and home-screen web apps) ignore navigator.vibrate. The one thing that does make
// an iPhone tap is the system switch control: flipping an <input type="checkbox" switch> gives a
// light haptic on iOS 18 and later. So we keep a hidden switch and flip it, which only works while
// handling a tap. Android and other browsers get navigator.vibrate patterns instead.
//
//   haptic('tick')     a light tap (buttons, chips, tabs)
//   haptic('success')  a double tap (finishing something)
//   haptic('big')      three taps (level up, personal record)

const PATTERNS = { tick: [8], success: [10, 60, 14], big: [12, 70, 12, 70, 24] };
const TAPS = { tick: 1, success: 2, big: 3 };

let label = null;
function iosSwitch() {
  if (label) return label;
  if (typeof document === 'undefined') return null;
  label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  label.appendChild(input);
  document.body.appendChild(label);
  return label;
}

const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
let last = 0;

export function haptic(kind = 'tick') {
  const now = performance.now();
  if (kind === 'tick' && now - last < 40) return; // one tap per touch, even if two handlers ask
  last = now;
  if (canVibrate) {
    try {
      navigator.vibrate(PATTERNS[kind] || PATTERNS.tick);
    } catch {
      /* not allowed here */
    }
    return;
  }
  const l = iosSwitch();
  if (!l) return;
  l.click();
  // Extra taps for bigger moments. iOS may only honor the first if these land outside the tap.
  for (let i = 1; i < (TAPS[kind] || 1); i++) setTimeout(() => l.click(), i * 90);
}

// Things you tap that should tick. Finishing something calls haptic('success') itself.
const TAPPABLE = '.btn, .mini, .chip, .tab, .check, .icon-btn, .date-chip, .seg button, .fab, .swatch, .slide-check';

/** One listener for the whole app: a light tick whenever a button-like thing is tapped. */
export function installTapHaptics() {
  if (typeof document === 'undefined') return;
  document.addEventListener(
    'click',
    (e) => {
      const t = e.target instanceof Element && e.target.closest(TAPPABLE);
      if (t && !t.disabled) haptic('tick');
    },
    true
  );
}
