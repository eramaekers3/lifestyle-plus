// The lifestyle+ mark: a heart with a white plus, drawn like the rest of the app — a raised
// "button edge" under it, a dithered offset shadow, and a little film grain.
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
const shade = (hex, k) =>
  '#' +
  [1, 3, 5]
    .map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0'))
    .join('');

// Heart in a 1024 box, sitting a little high so the edge and shadow below it stay centered.
const HEART =
  'M512 836C468 806 168 620 168 384C168 262 258 178 360 178C430 178 484 214 512 270C540 214 594 178 664 178C766 178 856 262 856 384C856 620 556 806 512 836Z';
// Plus, centered in the body of the heart.
const PX = 512;
const PY = 470;
const ARM = 138; // half length
const T = 74; // thickness
const plusPath = (dy = 0) =>
  `M${PX - T / 2} ${PY - ARM + dy}h${T}v${ARM - T / 2}h${ARM - T / 2}v${T}h${-(ARM - T / 2)}v${ARM - T / 2}h${-T}v${-(ARM - T / 2)}h${-(ARM - T / 2)}v${-T}h${ARM - T / 2}z`;

/**
 * SVG markup for the mark.
 *   color:  heart color
 *   bg:     true for app icons (full square slate background + grain); false for the header logo
 *   id:     prefix so several marks on one page don't share filter ids
 */
export function heartSVG(color, { bg = false, id = 'lp' } = {}) {
  const c = valid(color);
  const edge = shade(c, 0.66);
  const lift = bg ? 30 : 46; // the "button edge" depth; deeper on the small logo so it reads
  const view = bg ? '0 0 1024 1024' : '140 150 760 760';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" width="100%" height="100%">
  <defs>
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
    <clipPath id="${id}-heart"><path d="${HEART}"/></clipPath>
  </defs>
  ${bg ? `<rect width="1024" height="1024" fill="${BG}"/>` : ''}
  <g transform="translate(34 ${lift + 30})">
    <path d="${HEART}" fill="#0c0f14" opacity=".38"/>
    <path d="${HEART}" fill="#000" filter="url(#${id}-dither)"/>
  </g>
  <path d="${HEART}" transform="translate(0 ${lift})" fill="${edge}"/>
  <path d="${HEART}" fill="${c}"/>
  <g clip-path="url(#${id}-heart)">
    <rect x="140" y="150" width="760" height="720" fill="#fff" opacity=".22" filter="url(#${id}-grain)"/>
    <path d="M168 384C168 262 258 178 360 178C430 178 484 214 512 270" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="22" stroke-linecap="round" transform="translate(40 40) scale(.93)"/>
  </g>
  <path d="${plusPath(16)}" fill="${shade(c, 0.5)}" opacity=".55" stroke-linejoin="round" stroke="${shade(c, 0.5)}" stroke-width="18"/>
  <path d="${plusPath()}" fill="#fff" stroke="#fff" stroke-width="22" stroke-linejoin="round"/>
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
