// App state, persistence, events and small shared helpers
const KEY = 'okraa.v2';

const DEFAULTS = {
  settings: {
    theme: 'emerald',      // emerald | night | light | sepia
    font: 'amiri',         // amiri | scheherazade | naskh
    fontSize: 30,
    mode: 'flow',          // flow (mushaf) | cards
    digits: 'ar',          // ar | en
    reciter: 'ar.alafasy',
    speed: 1,
    rep: 1,                // times each ayah is played (0 = endless)
    repSurah: false,
    basmala: true,
    follow: true,
    wakeLock: true,
    haptics: true,
    tafsir: 'ar.muyassar',
    hijriAdj: 0,
    method: 'MWL',
    asr: 'std',            // std | hanafi
    ramadan: 'auto',       // auto | on | off
  },
  lastRead: null,          // { i: global ayah index, k: 'surah' | 'juz' | 'page', t }
  player: { i: null },
  bookmarks: [],           // [{ i, t }]
  khatma: null,            // { start: 'YYYY-MM-DD', days, pos, done }
  khatmaDone: 0,
  days: [],                // 'YYYY-MM-DD' days with reading activity
  tasbeeh: { phrase: 0, target: 33, count: 0, total: 0 },
  location: null,          // { lat, lng, name }
};

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch {}
  const state = structuredClone(DEFAULTS);
  if (s) {
    Object.assign(state, s);
    state.settings = { ...DEFAULTS.settings, ...s.settings };
    state.tasbeeh = { ...DEFAULTS.tasbeeh, ...s.tasbeeh };
  } else {
    migrate(state);
  }
  return state;
}

// Carry over the reciter and position from the first version of the site
function migrate(state) {
  try {
    const r = localStorage.getItem('quran_reciter');
    if (r) state.settings.reciter = r;
    const juz = parseInt(localStorage.getItem('quran_juz'));
    const idx = parseInt(localStorage.getItem('quran_index')) || 0;
    if (juz >= 1 && juz <= 30) state.legacyJuz = { juz, idx };
  } catch {}
}

export const S = load();

let saveTimer;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 120);
}
let frozen = false;
function flush() {
  clearTimeout(saveTimer);
  if (frozen) return;
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {}
}
addEventListener('pagehide', flush);
addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());

// Replace all stored data (reset or import) — stops further writes until reload
export function replaceAll(data = null) {
  frozen = true;
  try { data ? localStorage.setItem(KEY, JSON.stringify(data)) : localStorage.removeItem(KEY); } catch {}
}

// --- Events ---
const bus = new EventTarget();
export const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));
export const on = (type, fn) => bus.addEventListener(type, (e) => fn(e.detail));

// --- DOM helpers ---
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
export const icon = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// --- Formatting ---
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export const num = (n) => S.settings.digits === 'ar' ? String(n).replace(/\d/g, (d) => AR_DIGITS[d]) : String(n);
export const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const daysBetween = (a, b) => Math.round((fromKey(dayKey(b)) - fromKey(dayKey(a))) / 864e5);

export function fmtTime(date) {
  let h = date.getHours();
  const m = pad(date.getMinutes());
  const pm = h >= 12;
  h = h % 12 || 12;
  return `${num(h)}:${num(m)} ${pm ? 'م' : 'ص'}`;
}

export function fmtCountdown(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return num(`${h ? h + ':' : ''}${pad(m)}:${pad(s)}`);
}

export const GREG_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export const WEEKDAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const fmtGreg = (d) => `${num(d.getDate())} ${GREG_MONTHS[d.getMonth()]} ${num(d.getFullYear())}`;

// Arabic plural-aware counters: plural(5, 'آية', 'آيتان', 'آيات')
export function plural(n, one, two, few, many = one) {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${num(n)} ${few}`;
  return `${num(n)} ${many}`;
}

export function haptic(ms = 8) {
  if (S.settings.haptics && navigator.vibrate) try { navigator.vibrate(ms); } catch {}
}

// Mark today as an active reading day (for streaks)
export function markActiveDay() {
  const k = dayKey();
  if (S.days[S.days.length - 1] !== k) {
    S.days.push(k);
    if (S.days.length > 400) S.days.splice(0, S.days.length - 400);
    save();
  }
}

export function streak() {
  const set = new Set(S.days);
  const d = new Date();
  if (!set.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
