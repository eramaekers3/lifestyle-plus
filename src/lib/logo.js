// The lifestyle+ mark: a glass heart with a white glass plus cut into its right side, each with a
// soft drop shadow, styled to sit with iOS 26's dark Liquid Glass home-screen icons.
// One drawing feeds the header logo, the loading screen, the app icons in public/icons and the
// icon that's regenerated in the browser when you pick a new heart color.

export const HEART_COLORS = [
  { id: 'glass', name: 'Glass', hex: '#c8c8cc' },
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

const valid = (hex) => (/^#[0-9a-f]{6}$/i.test(hex || '') ? hex : DEFAULT_HEART);

// Shapes in a 1024 box.
const HEART =
  'M500 846C458 811 178 650 158 440C143 292 244 196 362 196C430 196 478 232 500 280C522 232 570 196 638 196C756 196 857 292 842 440C822 650 542 811 500 846Z';
// The plus is drawn as a thin cross with a round stroke, which rounds its outer corners.
const PLUS = 'M720 530h36v102h102v36h-102v102h-36v-102h-102v-36h102z';

/**
 * SVG markup for the mark.
 *   color:     heart color (any color; the glass shading is laid over it)
 *   bg:        true for app icons (full square near-black tile); false for the in-app logo
 *   id:        prefix so several marks on one page don't share ids
 *   heartFill: optional raw fill for the heart (the loading screen passes a CSS variable)
 */
export function heartSVG(color, { bg = false, id = 'lp', heartFill } = {}) {
  const c = valid(color);
  const fill = heartFill || c;
  const view = bg ? '0 0 1024 1024' : '120 136 790 790';
  const heart = (attrs) => `<path d="${HEART}" ${attrs}/>`;
  const plus = (width, attrs) => `<path d="${PLUS}" stroke-width="${width}" stroke-linejoin="round" ${attrs}/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" width="100%" height="100%">
  <defs>
    <linearGradient id="${id}-tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0b0c"/><stop offset="1" stop-color="#000"/></linearGradient>
    <linearGradient id="${id}-tileRim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset=".25" stop-color="#fff" stop-opacity=".04"/><stop offset=".8" stop-color="#fff" stop-opacity=".02"/><stop offset="1" stop-color="#fff" stop-opacity=".08"/></linearGradient>
    <linearGradient id="${id}-shade" x1=".15" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".45" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient>
    <linearGradient id="${id}-sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".3" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="${id}-rim" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset=".5" stop-color="#fff" stop-opacity=".15"/><stop offset="1" stop-color="#fff" stop-opacity=".5"/></linearGradient>
    <linearGradient id="${id}-plus" x1="0" y1="0" x2=".5" y2="1"><stop offset="0" stop-color="#f6f6f8"/><stop offset="1" stop-color="#cdcdd2"/></linearGradient>
    <mask id="${id}-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
      <rect width="1024" height="1024" fill="#fff"/>
      ${plus(120, 'fill="#000" stroke="#000"')}
    </mask>
    <clipPath id="${id}-hc">${heart('')}</clipPath>
    <filter id="${id}-shadow" x="-30%" y="-30%" width="160%" height="170%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="18"/><feOffset dy="16" result="b"/>
      <feFlood flood-color="#000" flood-opacity=".6"/><feComposite in2="b" operator="in" result="s"/>
      <feMerge><feMergeNode in="s"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="${id}-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
  </defs>
  ${bg ? `<rect width="1024" height="1024" fill="url(#${id}-tile)"/><rect x="6" y="6" width="1012" height="1012" rx="226" fill="none" stroke="url(#${id}-tileRim)" stroke-width="12"/>` : ''}
  <g filter="url(#${id}-shadow)"><g mask="url(#${id}-cut)">
    ${heart(`style="fill:${fill}" opacity=".85"`)}
    <g clip-path="url(#${id}-hc)">
      ${heart(`fill="url(#${id}-shade)"`)}
      ${heart(`fill="url(#${id}-sheen)"`)}
      ${heart(`fill="none" stroke="#000" stroke-opacity=".3" stroke-width="44" transform="translate(0 20)" filter="url(#${id}-soft)"`)}
      ${heart(`fill="none" stroke="url(#${id}-rim)" stroke-width="12"`)}
    </g>
  </g></g>
  <g filter="url(#${id}-shadow)">
    ${plus(60, 'fill="#fff" stroke="#fff"')}
    ${plus(46, `fill="url(#${id}-plus)" stroke="url(#${id}-plus)" transform="translate(0 4)"`)}
  </g>
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
