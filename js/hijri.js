// Hijri calendar: Umm al-Qura via Intl, with a tabular fallback and a user day adjustment
import { S, num } from './store.js';

export const HIJRI_MONTHS = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];

let intl = null;
try {
  const f = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' });
  if (/islamic/.test(f.resolvedOptions().calendar)) intl = f;
} catch {}

// Kuwaiti (tabular) algorithm, used only when Intl lacks the Islamic calendar
function tabular(y, m, d) {
  const jd = Math.floor((Date.UTC(y, m, d) / 864e5) + 2440587.5) + 1;
  let l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  const j = Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) + Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const hm = Math.floor((24 * l) / 709);
  return { d: l - Math.floor((709 * hm) / 24), m: hm, y: 30 * n + j - 30 };
}

const cache = new Map();
// Hijri date of a local calendar day
export function toHijri(date, adj = S.settings.hijriAdj) {
  const y = date.getFullYear(), m = date.getMonth(), d = date.getDate() + adj;
  const key = `${y}-${m}-${d}`;
  let h = cache.get(key);
  if (!h) {
    if (intl) {
      const p = {};
      for (const part of intl.formatToParts(new Date(Date.UTC(y, m, d, 12)))) p[part.type] = part.value;
      h = { d: +p.day, m: +p.month, y: parseInt(p.year) };
    } else {
      const t = new Date(Date.UTC(y, m, d));
      h = tabular(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
    }
    cache.set(key, h);
  }
  return h;
}
export const clearHijriCache = () => cache.clear();

export const fmtHijri = (h, withYear = true) => `${num(h.d)} ${HIJRI_MONTHS[h.m - 1]}${withYear ? ` ${num(h.y)} هـ` : ''}`;

const addDays = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

// All gregorian days belonging to the Hijri month containing `date`
export function monthOf(date) {
  const h = toHijri(date);
  let first = addDays(date, 1 - h.d);
  // Guard against adjustment edge cases: walk to the real first day
  while (toHijri(first).m !== h.m) first = addDays(first, 1);
  while (toHijri(addDays(first, -1)).m === h.m) first = addDays(first, -1);
  const days = [];
  for (let d = first; toHijri(d).m === h.m && days.length < 31; d = addDays(d, 1)) days.push(d);
  return { y: h.y, m: h.m, days };
}
export const nextMonthDate = (month) => addDays(month.days[month.days.length - 1], 1);
export const prevMonthDate = (month) => addDays(month.days[0], -1);

// Islamic occasions by Hijri month/day
export const EVENTS = [
  { m: 1, d: 1, name: 'رأس السنة الهجرية' },
  { m: 1, d: 10, name: 'يوم عاشوراء' },
  { m: 3, d: 12, name: 'المولد النبوي الشريف' },
  { m: 7, d: 27, name: 'ذكرى الإسراء والمعراج' },
  { m: 8, d: 15, name: 'ليلة النصف من شعبان' },
  { m: 9, d: 1, name: 'بداية شهر رمضان المبارك', major: true },
  { m: 9, d: 21, name: 'بداية العشر الأواخر' },
  { m: 9, d: 27, name: 'ليلة السابع والعشرين (تُرجى فيها ليلة القدر)' },
  { m: 10, d: 1, name: 'عيد الفطر المبارك', major: true },
  { m: 12, d: 1, name: 'بداية العشر من ذي الحجة' },
  { m: 12, d: 8, name: 'يوم التروية' },
  { m: 12, d: 9, name: 'يوم عرفة' },
  { m: 12, d: 10, name: 'عيد الأضحى المبارك', major: true },
];
export const eventsOn = (h) => EVENTS.filter((e) => e.m === h.m && e.d === h.d);
export const isWhiteDay = (h) => h.d >= 13 && h.d <= 15;

// Upcoming occasions within the next ~year, nearest first
export function upcoming(from = new Date(), limit = 8) {
  const out = [];
  const seen = new Set();
  for (let n = 0; n < 390 && out.length < EVENTS.length; n++) {
    const d = addDays(from, n);
    for (const e of eventsOn(toHijri(d))) {
      if (seen.has(e.name)) continue;
      seen.add(e.name);
      out.push({ ...e, date: d, days: n });
    }
  }
  return out.slice(0, limit);
}

// Ramadan status: { inRamadan, day, daysLeft (to next Ramadan), start, end }
export function ramadanInfo(now = new Date()) {
  const h = toHijri(now);
  const mode = S.settings.ramadan;
  if (h.m === 9) {
    const m = monthOf(now);
    return { inRamadan: mode !== 'off', day: h.d, total: m.days.length, days: m.days, year: h.y };
  }
  for (let n = 1; n < 400; n++) {
    const d = addDays(now, n);
    const x = toHijri(d);
    if (x.m === 9 && x.d === 1) {
      const m = monthOf(d);
      return { inRamadan: mode === 'on', day: mode === 'on' ? 1 : 0, daysLeft: n, start: d, days: m.days, total: m.days.length, year: x.y };
    }
  }
  return { inRamadan: false };
}
