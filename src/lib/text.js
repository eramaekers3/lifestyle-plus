// Small text helpers shared across the app.

/** Lowercased and trimmed, for comparing names. */
export const norm = (s) => String(s || '').trim().toLowerCase();

/** "3 tasks", "1 task" */
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
