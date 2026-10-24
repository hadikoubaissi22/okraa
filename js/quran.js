// Quran text, structure lookups, search, audio and tafsir sources
import { SURAHS, JUZ, HIZB, PAGES, SAJDA, TOTAL_AYAHS } from './meta.js';
export { SURAHS, JUZ, HIZB, PAGES, SAJDA, TOTAL_AYAHS };

let T = null, loading = null;
// Fetch JSON with a couple of quick retries for flaky connections
async function getJSON(url, tries = 3) {
  for (let k = 1; ; k++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch (e) {
      if (k >= tries) throw e;
      await new Promise((res) => setTimeout(res, 600 * k));
    }
  }
}
export function ready() {
  return loading ||= getJSON('data/quran.json')
    .then((t) => (T = t))
    .catch((e) => { loading = null; throw e; });
}
export const isReady = () => !!T;
export const text = (i) => T[i];

// Largest index k with arr[k] <= i
function floorIndex(arr, i) {
  let lo = 0, hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arr[mid] <= i) lo = mid; else hi = mid - 1;
  }
  return lo;
}
const STARTS = SURAHS.map((s) => s[3]);
const HIZB_SET = new Set(HIZB);
const PAGE_SET = new Set(PAGES);

export const surahOf = (i) => floorIndex(STARTS, i) + 1;
export const ayahOf = (i) => i - STARTS[surahOf(i) - 1] + 1;
export const pageOf = (i) => floorIndex(PAGES, i) + 1;
export const juzOf = (i) => floorIndex(JUZ, i) + 1;
export const quarterOf = (i) => floorIndex(HIZB, i); // 0..239
export const isQuarterStart = (i) => HIZB_SET.has(i);
export const isPageStart = (i) => PAGE_SET.has(i);
export const gi = (s, a = 1) => STARTS[s - 1] + a - 1;
export const surahName = (s) => SURAHS[s - 1][0];
export const surahCount = (s) => SURAHS[s - 1][2];

export function range(kind, n) {
  const list = kind === 'juz' ? JUZ : kind === 'page' ? PAGES : STARTS;
  return [list[n - 1], list[n] ?? TOTAL_AYAHS];
}
export const unitOf = (kind, i) => kind === 'juz' ? juzOf(i) : kind === 'page' ? pageOf(i) : surahOf(i);
export const unitCount = (kind) => kind === 'juz' ? 30 : kind === 'page' ? PAGES.length : 114;

const QUARTER_NAMES = ['الحزب', 'ربع الحزب', 'نصف الحزب', 'ثلاثة أرباع الحزب'];
export const quarterLabel = (q, num) => `${QUARTER_NAMES[q % 4]} ${num(Math.floor(q / 4) + 1)}`;

export const JUZ_NAMES = ['الم', 'سيقول', 'تلك الرسل', 'لن تنالوا', 'والمحصنات', 'لا يحب الله', 'وإذا سمعوا', 'ولو أننا', 'قال الملأ', 'واعلموا', 'يعتذرون', 'وما من دابة', 'وما أبرئ', 'ربما', 'سبحان الذي', 'قال ألم', 'اقترب للناس', 'قد أفلح', 'وقال الذين', 'أمن خلق', 'اتل ما أوحي', 'ومن يقنت', 'وما لي', 'فمن أظلم', 'إليه يرد', 'حم', 'قال فما خطبكم', 'قد سمع الله', 'تبارك الذي', 'عم'];

// --- Search ---
export const normalize = (t) => t
  .replace(/[ً-ٰٟۖ-ۭـ]/g, '')
  .replace(/[ٱأإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
  .replace(/\s+/g, ' ').trim();

let searchIndex = null;
const loadSearch = () => searchIndex ||= getJSON('data/search.json').catch((e) => { searchIndex = null; throw e; });
export const preloadSearch = () => loadSearch().catch(() => {});

const SURAH_NORM = SURAHS.map((s) => normalize(s[0]));
export function findSurahs(q) {
  const n = normalize(q).replace(/^سوره\s*/, '');
  if (!n) return [];
  return SURAH_NORM.map((name, k) => [name, k + 1]).filter(([name]) => name.includes(n) || name.replace(/^ال/, '').startsWith(n)).map(([, s]) => s);
}

export async function searchAyahs(q, limit = 120) {
  const idx = await loadSearch();
  const n = normalize(q);
  const items = [];
  let total = 0;
  if (n.length < 2) return { total, items };
  for (let i = 0; i < idx.length; i++) {
    if (idx[i].includes(n)) { total++; if (items.length < limit) items.push(i); }
  }
  return { total, items };
}

// "2:255", "٢:٢٥٥", "البقرة 255" -> global index
export function parseRef(q) {
  const t = q.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).trim();
  let m = t.match(/^(\d{1,3})\s*[:：.\s]\s*(\d{1,3})$/);
  if (m) {
    const s = +m[1], a = +m[2];
    if (s >= 1 && s <= 114 && a >= 1 && a <= surahCount(s)) return gi(s, a);
  }
  m = t.match(/^(.+?)\s+(\d{1,3})$/);
  if (m) {
    const [s] = findSurahs(m[1]);
    const a = +m[2];
    if (s && a >= 1 && a <= surahCount(s)) return gi(s, a);
  }
  return null;
}

// --- Audio ---
export const RECITERS = [
  ['ar.alafasy', 'مشاري راشد العفاسي', 128],
  ['ar.abdulbasitmurattal', 'عبد الباسط عبد الصمد (مرتل)', 192],
  ['ar.abdulsamad', 'عبد الباسط عبد الصمد (مجود)', 64],
  ['ar.husary', 'محمود خليل الحصري', 128],
  ['ar.husarymujawwad', 'محمود خليل الحصري (مجود)', 128],
  ['ar.minshawi', 'محمد صديق المنشاوي', 128],
  ['ar.minshawimujawwad', 'محمد صديق المنشاوي (مجود)', 64],
  ['ar.mahermuaiqly', 'ماهر المعيقلي', 128],
  ['ar.abdurrahmaansudais', 'عبد الرحمن السديس', 192],
  ['ar.saoodshuraym', 'سعود الشريم', 64],
  ['ar.shaatree', 'أبو بكر الشاطري', 128],
  ['ar.ahmedajamy', 'أحمد بن علي العجمي', 128],
  ['ar.hudhaify', 'علي الحذيفي', 128],
  ['ar.muhammadayyoub', 'محمد أيوب', 128],
  ['ar.muhammadjibreel', 'محمد جبريل', 128],
  ['ar.abdullahbasfar', 'عبد الله بصفر', 192],
  ['ar.hanirifai', 'هاني الرفاعي', 192],
  ['ar.aymanswoaid', 'أيمن سويد', 64],
];
const RECITER_MAP = Object.fromEntries(RECITERS.map((r) => [r[0], r]));
export const reciterName = (id) => (RECITER_MAP[id] || RECITERS[0])[1];
export function audioUrl(id, i) {
  const r = RECITER_MAP[id] || RECITERS[0];
  return `https://cdn.islamic.network/quran/audio/${r[2]}/${r[0]}/${i + 1}.mp3`;
}

// --- Tafsir ---
export const TAFSIRS = [
  ['ar.muyassar', 'الميسر'],
  ['ar.jalalayn', 'الجلالين'],
  ['ar.waseet', 'الوسيط'],
  ['ar.baghawi', 'البغوي'],
  ['ar.qurtubi', 'القرطبي'],
];
const tafsirCache = new Map();
export function tafsir(edition, s) {
  const key = `${edition}/${s}`;
  if (!tafsirCache.has(key)) {
    tafsirCache.set(key, fetch(`https://api.alquran.cloud/v1/surah/${s}/${edition}`)
      .then((r) => r.json())
      .then((j) => { if (j.code !== 200) throw new Error(j.status); return j.data.ayahs.map((a) => a.text); })
      .catch((e) => { tafsirCache.delete(key); throw e; }));
  }
  return tafsirCache.get(key);
}

// Hand-picked verses for the "verse of the day" card: [surah, ayah]
const DAILY = [[2, 255], [2, 286], [3, 8], [13, 28], [39, 53], [94, 5], [2, 186], [65, 3], [3, 191], [20, 114], [25, 74], [14, 7], [2, 152], [40, 60], [29, 69], [2, 153], [3, 139], [12, 87], [9, 51], [17, 82], [33, 41], [57, 4], [59, 22], [112, 1], [2, 183], [2, 185], [97, 3], [28, 24], [21, 87], [7, 23], [3, 173], [11, 88], [18, 10], [23, 118], [66, 8], [3, 26], [49, 13], [16, 97], [6, 162], [2, 201], [42, 19], [67, 2], [93, 5], [55, 13], [31, 17], [8, 46], [22, 77], [41, 30], [24, 35], [3, 159]];
export function dailyAyah(date = new Date()) {
  const n = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 864e5) + date.getFullYear() * 7;
  const [s, a] = DAILY[n % DAILY.length];
  return gi(s, a);
}
