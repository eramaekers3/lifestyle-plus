// Exit animations for things React removes instantly (sheets, toasts). When one unmounts, a copy
// of it is left in place just long enough to animate out, so every sheet closes the same way no
// matter which button closed it.

const reduced = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Leaves a non-interactive copy of `node` where it was and animates it out.
 *   parts: [[selector or null for the node itself, keyframes, options], ...]
 */
export function ghostOut(node, parts) {
  if (!node || reduced() || typeof document === 'undefined') return;
  const ghost = node.cloneNode(true);
  ghost.setAttribute('aria-hidden', 'true');
  ghost.removeAttribute('id');
  ghost.style.pointerEvents = 'none';
  ghost.classList.add('ghost');
  document.body.appendChild(ghost);
  // Keep the copy scrolled where the real one was.
  const scrolled = node.querySelectorAll ? [...node.querySelectorAll('.sheet')] : [];
  ghost.querySelectorAll('.sheet').forEach((el, i) => scrolled[i] && (el.scrollTop = scrolled[i].scrollTop));
  let longest = 0;
  for (const [sel, frames, opts] of parts) {
    const el = sel ? ghost.querySelector(sel) : ghost;
    if (!el) continue;
    const from = el.style.transform;
    const kf = typeof frames === 'function' ? frames(from) : frames;
    el.animate(kf, { fill: 'forwards', ...opts });
    longest = Math.max(longest, (opts.duration || 0) + (opts.delay || 0));
  }
  setTimeout(() => ghost.remove(), longest + 40);
}

/** How a sheet leaves: the panel drops away with a little lean, the backdrop fades. */
export function sheetOut(scrim) {
  ghostOut(scrim, [
    // Only the backdrop fades; the panel stays solid while it drops, so nothing ghosts over the page.
    [
      null,
      [
        { backgroundColor: 'rgba(14, 17, 22, 0.55)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' },
        { backgroundColor: 'rgba(14, 17, 22, 0)', backdropFilter: 'blur(0px)', WebkitBackdropFilter: 'blur(0px)' },
      ],
      { duration: 280, easing: 'ease-out' },
    ],
    [
      '.sheet',
      (from) => [
        { transform: from || 'none', opacity: 1 },
        { transform: `${from || ''} translateY(min(45%, 320px)) scale(0.97)`, opacity: 1, offset: 0.7 },
        { transform: `${from || ''} translateY(min(60%, 420px)) scale(0.96)`, opacity: 0 },
      ],
      { duration: 280, easing: 'cubic-bezier(.55,0,.75,.2)' },
    ],
  ]);
}

/** How a toast leaves: sinks and shrinks. */
export function toastOut(el) {
  ghostOut(el, [[null, [{ opacity: 1, transform: 'translate(-50%, 0) scale(1)' }, { opacity: 0, transform: 'translate(-50%, 14px) scale(0.9)' }], { duration: 220, easing: 'cubic-bezier(.55,0,.75,.2)' }]]);
}
