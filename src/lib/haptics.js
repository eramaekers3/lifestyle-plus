// Haptics.
//
// iPhone Safari and home-screen web apps have no vibration API. The one thing that makes an
// iPhone tap is the system switch control (<input type="checkbox" switch>). Since iOS 26.5 it
// only taps when a real finger flips it; flipping it from code (the old trick) does nothing.
//
// So every button carries an invisible <label> laid over it, wrapping a hidden switch. Your
// finger lands on that label, iOS flips the switch (tap), and the click carries on to the
// button underneath as normal. Tested on iOS 27 (fit+ /haptics-test.html, method E).
//
// Because iOS only allows that one tap, at the moment of the touch, haptic('success') and
// haptic('big') can't add extra taps there; they still vibrate on Android.
//
//   haptic('tick')     a light tap
//   haptic('success')  a double tap (finishing something)
//   haptic('big')      three taps (level up, personal record)
//
// The phone's own "System Haptics" setting (Settings → Sounds & Haptics) has to be on.

const PATTERNS = { tick: [8], success: [10, 60, 14], big: [12, 70, 12, 70, 24] };

const isIOS =
  typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
// iOS may expose navigator.vibrate as a do-nothing function, so never trust it there.
const canVibrate = !isIOS && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

let last = 0;

export function haptic(kind = 'tick') {
  if (!canVibrate) return; // iPhone: handled by the switch laid over each button
  const now = performance.now();
  if (kind === 'tick') {
    if (now - last < 40) return; // one tick per touch, even if two handlers ask
    last = now;
  }
  try {
    navigator.vibrate(PATTERNS[kind] || PATTERNS.tick);
  } catch {
    /* not allowed here */
  }
}

// What gets a tap. Links and labels are left alone: a label laid inside them would stop a link
// opening, and labels already flip their own controls.
const HOSTS = 'button, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], .chip, summary';

function makeOverlay() {
  const label = document.createElement('label');
  label.className = 'hx';
  label.setAttribute('aria-hidden', 'true');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  // The label passes the tap to the switch as a second click; keep that one to ourselves so the
  // button doesn't run twice.
  input.addEventListener('click', (e) => e.stopPropagation());
  label.appendChild(input);
  return label;
}

function dress(root) {
  root.querySelectorAll(HOSTS).forEach((el) => {
    if (el.closest('a, label, input, select, textarea, .hx')) return;
    const kid = el.lastElementChild;
    if (kid && kid.classList.contains('hx')) return;
    const old = el.querySelector(':scope > .hx');
    if (old) {
      el.appendChild(old); // keep it last so it sits on top
      return;
    }
    if (getComputedStyle(el).position === 'static') el.classList.add('hx-host');
    el.appendChild(makeOverlay());
  });
}

/** iPhone: lay a tap-making switch over every button, now and as new ones appear. Android: tick on tap. */
export function installTapHaptics() {
  if (typeof document === 'undefined') return;

  if (isIOS) {
    let queued = false;
    const run = () => {
      queued = false;
      dress(document.body);
    };
    const queue = () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(run);
      }
    };
    new MutationObserver((list) => {
      // Ignore our own additions.
      if (list.every((m) => [...m.addedNodes].every((n) => n.nodeType === 1 && n.classList.contains('hx')))) return;
      queue();
    }).observe(document.body, { childList: true, subtree: true });
    queue();
    return;
  }

  if (!canVibrate) return;
  document.addEventListener(
    'click',
    (e) => {
      if (!e.isTrusted || !(e.target instanceof Element)) return;
      const t = e.target.closest(HOSTS + ', a, label, select, input[type="checkbox"], input[type="radio"]');
      if (t && !t.disabled && t.getAttribute('aria-disabled') !== 'true') haptic('tick');
    },
    true
  );
}
