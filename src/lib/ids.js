// Random ids for new records, and stable ids for records that must be unique
// (one week plan per week, one weigh-in per day), so two devices never make duplicates.

function h32(str, seed) {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function idFor(str) {
  const x = h32(str, 1) + h32(str, 7) + h32(str, 13) + h32(str, 29);
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

export const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : idFor(`${Math.random()}:${Date.now()}:${Math.random()}`);
