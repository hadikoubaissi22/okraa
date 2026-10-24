// Khatma (complete reading plan) and bookmarks
import { S, save, emit, dayKey, fromKey, daysBetween } from './store.js';
import { pageOf, TOTAL_AYAHS, PAGES } from './quran.js';

const TOTAL_PAGES = PAGES.length;

export function startKhatma(days, pos = 0) {
  S.khatma = { start: dayKey(), days, pos };
  save();
  emit('khatma');
}
export function stopKhatma() {
  S.khatma = null;
  save();
  emit('khatma');
}

// Advance the khatma when the reader moves forward sequentially (small jumps only)
export function touchKhatma(i, force = false) {
  const k = S.khatma;
  if (!k) return;
  if (!force && (i <= k.pos || pageOf(i) - pageOf(k.pos) > 2)) return;
  k.pos = i;
  save();
  emit('khatma');
}

export function completeKhatma() {
  if (!S.khatma) return false;
  S.khatmaDone = (S.khatmaDone || 0) + 1;
  S.khatma = null;
  save();
  emit('khatma');
  return true;
}

export function khatmaStatus(now = new Date()) {
  const k = S.khatma;
  if (!k) return null;
  const perDay = TOTAL_PAGES / k.days;
  const day = Math.min(k.days, Math.max(1, daysBetween(fromKey(k.start), now) + 1));
  const page = k.pos ? pageOf(k.pos) : 0;            // furthest page reached
  const target = Math.min(TOTAL_PAGES, Math.ceil(day * perDay));
  const todayFrom = Math.min(TOTAL_PAGES, Math.floor((day - 1) * perDay) + 1);
  return {
    day, days: k.days, page, target, todayFrom,
    perDay: Math.round(perDay * 10) / 10,
    pct: Math.min(100, Math.round((page / TOTAL_PAGES) * 1000) / 10),
    behind: Math.max(0, target - page),
    doneToday: page >= target,
    resumeAt: k.pos ? Math.min(k.pos + 1, TOTAL_AYAHS - 1) : 0,
    endDate: new Date(fromKey(k.start).getTime() + (k.days - 1) * 864e5),
  };
}

// --- Bookmarks ---
export const isBookmarked = (i) => S.bookmarks.some((b) => b.i === i);
export function toggleBookmark(i) {
  const at = S.bookmarks.findIndex((b) => b.i === i);
  if (at >= 0) S.bookmarks.splice(at, 1);
  else S.bookmarks.unshift({ i, t: Date.now() });
  save();
  emit('bookmarks');
  return at < 0;
}
