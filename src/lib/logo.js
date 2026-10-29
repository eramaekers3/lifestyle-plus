// The lifestyle+ mark: a solid heart with a white plus cut into its right side, over a dithered
// drop shadow like the app's cards.
// One drawing feeds the header logo, the app icons (scripts/make-icons.mjs) and the icon that's
// regenerated in the browser when you pick a new heart color.

export const HEART_COLORS = [
  { id: 'coral', name: 'Coral', hex: '#ff6f61' },
  { id: 'cherry', name: 'Cherry', hex: '#ee4b5a' },
  { id: 'rose', name: 'Rose', hex: '#ff86b8' },
  { id: 'sunflower', name: 'Sunflower', hex: '#ffcf5c' },
  { id: 'tangerine', name: 'Tangerine', hex: '#ff9f4a' },
  { id: 'lilac', name: 'Lilac', hex: '#bba9ff' },
  { id: 'sky', name: 'Sky', hex: '#7cc4ff' },
  { id: 'mint', name: 'Mint', hex: '#7fdca0' },
];
export const DEFAULT_HEART = HEART_COLORS[0].hex;
export const BG = '#262624';

const valid = (hex) => (/^#[0-9a-f]{6}$/i.test(hex || '') ? hex : DEFAULT_HEART);

// Heart in a 1024 box.
const HEART =
  'M512 836C468 806 168 620 168 384C168 262 258 178 360 178C430 178 484 214 512 270C540 214 594 178 664 178C766 178 856 262 856 384C856 620 556 806 512 836Z';
// The plus sits on the heart's right side, running right out to its edge.
const PX = 674;
const PY = 484;
const ARM = 160; // half length, to the outside of the rounded corners
const T = 56; // bar thickness before rounding
const ROUND = 18; // corner rounding (drawn as a stroke the same color as the fill)
const GAP = 34; // background showing between the plus and the heart
const a = ARM - ROUND / 2;
const plusPath = `M${PX - T / 2} ${PY - a}h${T}v${a - T / 2}h${a - T / 2}v${T}h${-(a - T / 2)}v${a - T / 2}h${-T}v${-(a - T / 2)}h${-(a - T / 2)}v${-T}h${a - T / 2}z`;

/**
 * SVG markup for the mark: a solid heart with a white plus cut into its right side, and a drop shadow.
 *   color:  heart color
 *   bg:     true for app icons (full square slate background); false for the header logo
 *   id:     prefix so several marks on one page don't share ids
 */
export function heartSVG(color, { bg = false, id = 'lp' } = {}) {
  const c = valid(color);
  const view = bg ? '0 0 1024 1024' : '150 160 740 740';
  const dy = bg ? 34 : 40;
  const heart = (fill) => `<path d="${HEART}" fill="${fill}" mask="url(#${id}-cut)"/>`;
  const plus = (fill) => `<path d="${plusPath}" fill="${fill}" stroke="${fill}" stroke-width="${ROUND}" stroke-linejoin="round"/>`;
  // Drop shadow: soft dark base plus a dither of black speckles, offset down and right.
  const shadow = (shape) => `<g transform="translate(26 ${dy})"><g opacity=".55">${shape('#0c0f14')}</g><g filter="url(#${id}-dither)">${shape('#000')}</g></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" width="100%" height="100%">
  <defs>
    <mask id="${id}-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
      <rect width="1024" height="1024" fill="#fff"/>
      <path d="${plusPath}" fill="#000" stroke="#000" stroke-width="${ROUND + GAP * 2}" stroke-linejoin="round"/>
    </mask>
    <filter id="${id}-dither" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch" result="n"/>
      <feColorMatrix in="n" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 2.2 -0.9" result="dots"/>
      <feComposite in="dots" in2="SourceGraphic" operator="in"/>
    </filter>
    <filter id="${id}-grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.6 0 0 0 -0.7"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
  </defs>
  ${bg ? `<rect width="1024" height="1024" fill="${BG}"/>` : ''}
  <g mask="url(#${id}-cut)">${shadow(heart)}</g>
  ${heart(c)}
  ${plus('#ffffff')}
  ${bg ? `<rect width="1024" height="1024" fill="#fff" opacity=".05" filter="url(#${id}-grain)"/>` : ''}
</svg>`;
}

/** Draws the app icon to a PNG data URL in the browser (for the live home-screen icon and tab icon). */
export function heartIconPNG(color, size = 180) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      canvas.getContext('2d').drawImage(img, 0, 0, size, size);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(heartSVG(color, { bg: true, id: 'ico' }))}`;
  });
}
