// Keeps taps lined up with what's on screen.
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
