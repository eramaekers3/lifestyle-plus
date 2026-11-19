// Keeps taps lined up with what's on screen, and makes sure taps made while typing go through.
//
// On iPhone home-screen apps, the keyboard pushes the page up to make room. When it closes,
// iOS sometimes draws the page back in place but keeps reading taps as if it were still pushed
// up — so a tap lands on the button above or below the one you pressed (you see that other
// button do its press animation) until something re-scrolls the page, like changing tabs.
// After the keyboard closes, and when the app comes back to the front, this nudges the page
// so iOS re-measures where everything is.

const TYPING = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="button"]):not([type="submit"]), textarea, select, [contenteditable]';

export function installViewportFix({ windowScrolls = true } = {}) {
  if (typeof window === 'undefined') return;
  installTapWhileTyping();
  const vv = window.visualViewport;
  let timer = 0;

  const realign = () => {
    const a = document.activeElement;
    if (a && a.matches && a.matches(TYPING)) return; // still typing: the keyboard is meant to be up
    if (vv && window.innerHeight - vv.height > 120) return; // keyboard still on its way down
    if (!windowScrolls) {
      // The page scrolls inside its own box, so the window itself should never be moved.
      window.scrollTo(0, 0);
      return;
    }
    const x = window.scrollX;
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    // A real (if tiny) scroll is what makes iOS re-measure; scrolling to the same spot is ignored.
    window.scrollTo(x, y < max ? y + 1 : Math.max(0, y - 1));
    window.scrollTo(x, y);
  };

  const soon = (ms) => {
    clearTimeout(timer);
    timer = setTimeout(realign, ms);
  };

  // Keyboard closing: right after the field loses focus, and again once it has finished sliding away.
  document.addEventListener('focusout', () => soon(80));
  if (vv) {
    let open = false;
    vv.addEventListener('resize', () => {
      const now = window.innerHeight - vv.height > 120;
      if (open && !now) soon(60);
      open = now;
    });
  }
  // Back from another app or the lock screen.
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && soon(120));
  window.addEventListener('pageshow', () => soon(120));
}

// Taps that land while you're typing.
//
// With a text box open, the first thing a tap does is take the focus out of it. On the journal
// and end-of-day pages that closes the box — an empty note folds away, an edited line turns back
// into text, the keyboard drops — and everything below jumps up before the tap finishes. The
// button you pressed still plays its press animation, but by the time the tap completes it has
// moved out from under your finger, so nothing happens.
//
// So when you tap a button while typing, the box keeps focus until the tap has gone through, and
// only then lets go (unless the button moved you into another box).
const TAPPABLE = 'button, [role="button"], [role="radio"], [role="tab"], [role="switch"], [role="checkbox"], [role="option"], summary, .chip, label, a[href]';

function installTapWhileTyping() {
  let release = 0;
  document.addEventListener(
    'mousedown',
    (e) => {
      const field = document.activeElement;
      if (!field || !field.matches || !field.matches(TYPING)) return;
      const t = e.target instanceof Element ? e.target.closest(TAPPABLE) : null;
      if (!t || field.contains(t) || t.contains(field)) return;
      if (t.matches('label') && t.control && t.control.matches(TYPING)) return; // a label for another box: let it move there
      e.preventDefault(); // keep the box (and the page under the finger) still until the tap lands
      clearTimeout(release);
      const letGo = () => {
        clearTimeout(release);
        window.removeEventListener('click', afterClick);
        if (document.activeElement === field) field.blur();
      };
      const afterClick = () => setTimeout(letGo, 0); // after the button's own click has run
      window.addEventListener('click', afterClick, { once: true });
      release = setTimeout(letGo, 600); // the tap never finished (finger slid off)
    },
    true
  );
}
