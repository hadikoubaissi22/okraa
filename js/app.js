// اقرأ — app entry: routing, view lifecycle, service worker
import { S, save, $, $$, on } from './store.js';
import * as Q from './quran.js';
import { applyTheme, toast, isSheetOpen, closeSheet } from './ui.js';
import * as reader from './reader.js';
import * as home from './home.js';
import * as indexView from './indexview.js';
import * as calendar from './calendar.js';
import { prayer, more, khatma, tasbeeh, qibla, settings } from './pages.js';
import { updateMini } from './playerui.js';

applyTheme();

// Carry the reading position over from the first version of the site
if (S.legacyJuz) {
  const { juz, idx } = S.legacyJuz;
  const i = Math.min(Q.JUZ[juz - 1] + idx, (Q.JUZ[juz] ?? Q.TOTAL_AYAHS) - 1);
  S.lastRead = { i, k: 'juz', t: Date.now() };
  delete S.legacyJuz;
  save();
}

// Start loading the Quran text right away (served from cache after first visit)
Q.ready().catch(() => {});

const VIEWS = {
  home: { show: home.show, leave: home.leave, title: 'اقرأ — القرآن الكريم' },
  index: { show: indexView.show, title: 'المصحف — اقرأ' },
  calendar: { show: calendar.show, title: 'التقويم الهجري — اقرأ' },
  prayer: { ...prayer, title: 'مواقيت الصلاة — اقرأ' },
  more: { ...more, title: 'المزيد — اقرأ' },
  khatma: { ...khatma, title: 'الختمة — اقرأ' },
  tasbeeh: { ...tasbeeh, title: 'المسبحة — اقرأ' },
  qibla: { ...qibla, title: 'القبلة — اقرأ' },
  settings: { ...settings, title: 'الإعدادات — اقرأ' },
};
const READER_KINDS = ['surah', 'juz', 'page'];
const scrollMemory = {};
let current = null;

function parseTarget(kind, n, seg) {
  if (!seg) return null;
  if (kind === 'surah') return Q.gi(n, Math.min(Math.max(1, +seg || 1), Q.surahCount(n)));
  const [s, a] = seg.split('-').map(Number);
  if (s >= 1 && s <= 114 && a >= 1 && a <= Q.surahCount(s)) return Q.gi(s, a);
  return null;
}

async function route() {
  if (isSheetOpen()) closeSheet(true);
  const [name = '', arg, extra] = location.hash.replace(/^#\/?/, '').split('/');
  const isReader = READER_KINDS.includes(name);
  const viewName = isReader ? 'reader' : (VIEWS[name] ? name : 'home');

  if (current && current !== viewName) {
    scrollMemory[current] = scrollY;
    if (current === 'reader') reader.leave();
    else VIEWS[current].leave?.();
  }
  const changed = current !== viewName;
  const section = $(`#v-${viewName}`);
  if (changed) {
    $$('.view').forEach((v) => { v.hidden = v !== section; });
    section.classList.remove('enter');
    void section.offsetWidth;
    section.classList.add('enter');
  }
  const tab = section.dataset.tab;
  $$('.tabbar a').forEach((a) => {
    const on = a.dataset.tab === tab;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  current = viewName;

  if (isReader) {
    reader.enter();
    updateMini();
    const max = Q.unitCount(name);
    const n = Math.min(Math.max(1, parseInt(arg) || 1), max);
    const target = parseTarget(name, n, extra);
    await reader.openReader(name, n, target);
    document.title = `${name === 'surah' ? `سورة ${Q.surahName(n)}` : name === 'juz' ? `الجزء ${n}` : `صفحة ${n}`} — اقرأ`;
  } else {
    VIEWS[viewName].show(arg);
    document.title = VIEWS[viewName].title;
    if (changed) scrollTo({ top: scrollMemory[viewName] || 0, behavior: 'instant' });
    updateMini();
  }
}

// The entry the app was opened on is the root; every later entry is marked as in-app
// so "back" buttons know they can safely use history.back()
if (!history.state) history.replaceState({ root: true }, '');
addEventListener('hashchange', () => {
  if (!history.state) history.replaceState({ inApp: true }, '');
  route();
});

// Links inside the bottom sheet replace the sheet's history entry; back buttons use history when possible
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (a.closest('#sheet')) {
    e.preventDefault();
    closeSheet(true);
    history.replaceState({ inApp: true }, '', a.getAttribute('href'));
    route();
    return;
  }
  if (a.hasAttribute('data-back') && history.state?.inApp) {
    e.preventDefault();
    history.back();
    return;
  }
  // Re-tapping the active tab scrolls to top
  if (a.closest('.tabbar') && a.getAttribute('href') === location.hash) {
    e.preventDefault();
    scrollTo({ top: 0, behavior: 'smooth' });
  }
});

on('settings', (k) => {
  if (k === 'digits' && current === 'reader') reader.rerender();
});

addEventListener('offline', () => toast('أنت غير متصل — المصحف متاح للقراءة دون إنترنت'));
addEventListener('online', () => toast('عاد الاتصال بالإنترنت'));

route();

// --- Service worker (offline + install) ---
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
  addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      const offerUpdate = (w) => toast('يتوفر إصدار جديد من التطبيق', { action: 'تحديث', ms: 15000, onAction: () => w.postMessage('skipWaiting') });
      if (reg.waiting && hadController) offerUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => { if (w.state === 'installed' && hadController) offerUpdate(w); });
      });
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    } catch {}
  });
}
