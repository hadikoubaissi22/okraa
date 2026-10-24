// Location + today's prayer times helpers
import { S, save, emit } from './store.js';
import { prayerTimes, guessMethod } from './prayer.js';
import { toHijri } from './hijri.js';
import { toast } from './ui.js';

export const CITIES = [
  ['مكة المكرمة', 21.4225, 39.8262], ['المدينة المنورة', 24.4672, 39.6111], ['الرياض', 24.7136, 46.6753], ['جدة', 21.5433, 39.1728],
  ['دبي', 25.2048, 55.2708], ['أبوظبي', 24.4539, 54.3773], ['الدوحة', 25.2854, 51.531], ['الكويت', 29.3759, 47.9774],
  ['المنامة', 26.2285, 50.586], ['مسقط', 23.588, 58.3829], ['صنعاء', 15.3694, 44.191],
  ['بيروت', 33.8938, 35.5018], ['طرابلس (لبنان)', 34.4367, 35.8497], ['صيدا', 33.5571, 35.3729], ['صور', 33.2705, 35.2038],
  ['النبطية', 33.3789, 35.4839], ['بعلبك', 34.0047, 36.211], ['زحلة', 33.8463, 35.902],
  ['دمشق', 33.5138, 36.2765], ['حلب', 36.2021, 37.1343], ['عمّان', 31.9454, 35.9284], ['القدس', 31.7683, 35.2137], ['غزة', 31.5017, 34.4668],
  ['بغداد', 33.3152, 44.3661], ['البصرة', 30.5085, 47.7804], ['النجف', 32.0259, 44.3462], ['كربلاء', 32.616, 44.0249],
  ['القاهرة', 30.0444, 31.2357], ['الإسكندرية', 31.2001, 29.9187], ['الخرطوم', 15.5007, 32.5599], ['طرابلس (ليبيا)', 32.8872, 13.1913],
  ['تونس', 36.8065, 10.1815], ['الجزائر', 36.7538, 3.0588], ['الرباط', 34.0209, -6.8416], ['الدار البيضاء', 33.5731, -7.5898], ['نواكشوط', 18.0735, -15.9582],
  ['إسطنبول', 41.0082, 28.9784], ['طهران', 35.6892, 51.389], ['كراتشي', 24.8607, 67.0011], ['جاكرتا', -6.2088, 106.8456], ['كوالالمبور', 3.139, 101.6869],
  ['لندن', 51.5074, -0.1278], ['باريس', 48.8566, 2.3522], ['برلين', 52.52, 13.405], ['ستوكهولم', 59.3293, 18.0686],
  ['نيويورك', 40.7128, -74.006], ['ديترويت', 42.3314, -83.0458], ['تورنتو', 43.6532, -79.3832], ['سيدني', -33.8688, 151.2093],
];

export function setCity(idx) {
  const [name, lat, lng] = CITIES[idx];
  const first = !S.location;
  S.location = { lat, lng, name };
  if (first) S.settings.method = guessMethod();
  save();
  emit('location');
}

export function requestLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { toast('المتصفح لا يدعم تحديد الموقع — اختر مدينتك من القائمة'); return resolve(false); }
    navigator.geolocation.getCurrentPosition((p) => {
      const first = !S.location;
      S.location = { lat: +p.coords.latitude.toFixed(4), lng: +p.coords.longitude.toFixed(4), name: 'موقعي الحالي' };
      if (first) S.settings.method = guessMethod();
      save();
      emit('location');
      toast('تم تحديد موقعك');
      resolve(true);
    }, (err) => {
      toast(err.code === 1 ? 'لم يُسمح بالوصول إلى الموقع — اختر مدينتك من القائمة' : 'تعذر تحديد الموقع — اختر مدينتك من القائمة');
      resolve(false);
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 6 * 3600e3 });
  });
}

export function timesFor(date) {
  const L = S.location;
  if (!L) return null;
  return prayerTimes(date, L.lat, L.lng, S.settings.method, S.settings.asr, toHijri(date).m === 9);
}

const ORDER = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
export function nextPrayer(now = new Date()) {
  const t = timesFor(now);
  if (!t) return null;
  for (const k of ORDER) if (t[k] > now) return { key: k, at: t[k], times: t };
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { key: 'fajr', at: timesFor(tomorrow).fajr, times: t, tomorrow: true };
}

// Fasting countdown target for Ramadan: imsak → iftar → next suhoor
export function fastingTarget(now = new Date()) {
  const t = timesFor(now);
  if (!t) return null;
  if (now < t.imsak) return { label: 'متبقٍ على الإمساك', at: t.imsak, t };
  if (now < t.maghrib) return { label: 'متبقٍ على الإفطار', at: t.maghrib, t };
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { label: 'متبقٍ على الإمساك (السحور)', at: timesFor(tomorrow).imsak, t };
}
