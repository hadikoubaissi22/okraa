// Prayer times (PrayTimes.org algorithm) and Qibla direction — computed locally, works offline
const DEG = Math.PI / 180;
const sin = (d) => Math.sin(d * DEG), cos = (d) => Math.cos(d * DEG), tan = (d) => Math.tan(d * DEG);
const asin = (x) => Math.asin(x) / DEG, acos = (x) => Math.acos(x) / DEG, atan2 = (y, x) => Math.atan2(y, x) / DEG;
const acot = (x) => Math.atan(1 / x) / DEG;
const fix = (a, b) => { a -= b * Math.floor(a / b); return a < 0 ? a + b : a; };

// fajr/isha: angle in degrees, or minutes after maghrib when isha is a string like '90 min'
export const METHODS = {
  MWL: { name: 'رابطة العالم الإسلامي', fajr: 18, isha: 17 },
  Egypt: { name: 'الهيئة المصرية العامة للمساحة', fajr: 19.5, isha: 17.5 },
  Makkah: { name: 'أم القرى (مكة المكرمة)', fajr: 18.5, isha: '90 min' },
  Karachi: { name: 'جامعة العلوم الإسلامية بكراتشي', fajr: 18, isha: 18 },
  ISNA: { name: 'الجمعية الإسلامية لأمريكا الشمالية', fajr: 15, isha: 15 },
  Dubai: { name: 'الإمارات (دبي)', fajr: 18.2, isha: 18.2 },
  Kuwait: { name: 'الكويت', fajr: 18, isha: 17.5 },
  Qatar: { name: 'قطر', fajr: 18, isha: '90 min' },
  Turkey: { name: 'رئاسة الشؤون الدينية التركية', fajr: 18, isha: 17 },
  Tehran: { name: 'معهد الجيوفيزياء بجامعة طهران', fajr: 17.7, isha: 14, maghrib: 4.5 },
  Jafari: { name: 'المذهب الجعفري (مؤسسة ليفا - قم)', fajr: 16, isha: 14, maghrib: 4 },
};

// Suggest a calculation method from the device time zone
export function guessMethod() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const map = {
    'Asia/Riyadh': 'Makkah', 'Asia/Aden': 'Makkah', 'Asia/Bahrain': 'Makkah', 'Africa/Cairo': 'Egypt',
    'Asia/Karachi': 'Karachi', 'Asia/Kolkata': 'Karachi', 'Asia/Dhaka': 'Karachi', 'Asia/Dubai': 'Dubai',
    'Asia/Muscat': 'Dubai', 'Asia/Kuwait': 'Kuwait', 'Asia/Qatar': 'Qatar', 'Europe/Istanbul': 'Turkey',
    'Asia/Tehran': 'Tehran', 'Asia/Amman': 'Egypt', 'Asia/Damascus': 'Egypt', 'Asia/Baghdad': 'MWL',
    'Africa/Khartoum': 'Egypt', 'Africa/Tripoli': 'Egypt', 'Africa/Algiers': 'MWL', 'Africa/Casablanca': 'MWL', 'Africa/Tunis': 'MWL',
  };
  if (map[tz]) return map[tz];
  if (tz.startsWith('America/')) return 'ISNA';
  return 'MWL';
}

function julian(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

function sunPosition(jd) {
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * D, 360);
  const q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * sin(g) + 0.020 * sin(2 * g), 360);
  const e = 23.439 - 0.00000036 * D;
  const RA = atan2(cos(e) * sin(L), cos(L)) / 15;
  return { decl: asin(sin(e) * sin(L)), eqt: q / 15 - fix(RA, 24) };
}

/**
 * Prayer times for a local date.
 * Returns Date objects: imsak, fajr, sunrise, dhuhr, asr, maghrib, isha
 */
export function prayerTimes(date, lat, lng, methodKey = 'MWL', asrMode = 'std', ramadan = false) {
  const method = METHODS[methodKey] || METHODS.MWL;
  const y = date.getFullYear(), mo = date.getMonth(), dd = date.getDate();
  const base = new Date(y, mo, dd);
  const tz = -new Date(y, mo, dd, 12).getTimezoneOffset() / 60;
  const jDate = julian(y, mo + 1, dd) - lng / (15 * 24);

  const midDay = (t) => fix(12 - sunPosition(jDate + t).eqt, 24);
  const sunAngleTime = (angle, t, ccw) => {
    const { decl } = sunPosition(jDate + t);
    const v = acos((-sin(angle) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat))) / 15;
    return midDay(t) + (ccw ? -v : v);
  };
  const asrTime = (factor, t) => {
    const { decl } = sunPosition(jDate + t);
    return sunAngleTime(-acot(factor + tan(Math.abs(lat - decl))), t);
  };

  const ishaMin = typeof method.isha === 'string' ? parseFloat(method.isha) + (ramadan && methodKey === 'Makkah' ? 30 : 0) : null;
  // Two passes: the first estimate refines the sun position used by the second
  let t = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, maghrib: 18, isha: 18 };
  for (let pass = 0; pass < 2; pass++) {
    const p = (k) => (isNaN(t[k]) ? 12 : t[k]) / 24;
    t = {
      fajr: sunAngleTime(method.fajr, p('fajr'), true),
      sunrise: sunAngleTime(0.833, p('sunrise'), true),
      dhuhr: midDay(p('dhuhr')),
      asr: asrTime(asrMode === 'hanafi' ? 2 : 1, p('asr')),
      sunset: sunAngleTime(0.833, p('sunset')),
      maghrib: method.maghrib ? sunAngleTime(method.maghrib, p('maghrib')) : null,
      isha: ishaMin == null ? sunAngleTime(method.isha, p('isha')) : null,
    };
    t.maghrib ??= t.sunset;
    t.isha ??= t.maghrib + ishaMin / 60;
  }

  // High latitude safety: angle-based night portions
  const night = fix(t.sunrise - t.sunset, 24);
  const fajrMax = (method.fajr / 60) * night;
  if (isNaN(t.fajr) || fix(t.sunrise - t.fajr, 24) > fajrMax) t.fajr = t.sunrise - fajrMax;
  if (ishaMin == null) {
    const ishaMax = (method.isha / 60) * night;
    if (isNaN(t.isha) || fix(t.isha - t.sunset, 24) > ishaMax) t.isha = t.sunset + ishaMax;
  }
  t.imsak = t.fajr - 10 / 60;

  const out = {};
  for (const k of ['imsak', 'fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']) {
    const h = t[k] + tz - lng / 15;
    out[k] = new Date(base.getTime() + Math.round(h * 60) * 60000);
  }
  return out;
}

export const PRAYER_NAMES = { imsak: 'الإمساك', fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };

// Kaaba bearing from north, in degrees
export function qiblaBearing(lat, lng) {
  const kLat = 21.422487, kLng = 39.826206;
  const dL = (kLng - lng) * DEG;
  const y = Math.sin(dL);
  const x = Math.cos(lat * DEG) * Math.tan(kLat * DEG) - Math.sin(lat * DEG) * Math.cos(dL);
  return fix(Math.atan2(y, x) / DEG, 360);
}

export function distanceToKaaba(lat, lng) {
  const kLat = 21.422487 * DEG, kLng = 39.826206 * DEG, a1 = lat * DEG;
  const d = Math.acos(Math.sin(a1) * Math.sin(kLat) + Math.cos(a1) * Math.cos(kLat) * Math.cos(kLng - lng * DEG));
  return Math.round(d * 6371);
}
