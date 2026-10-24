// Shared UI: toasts, bottom sheet, theming, install prompt, wake lock
import { S, save, $, emit, esc, icon } from './store.js';

// --- Toasts ---
export function toast(msg, { action, onAction, ms = 3200 } = {}) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action)}</button>` : ''}`;
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 260); };
  if (action) el.querySelector('button').onclick = () => { onAction?.(); close(); };
  $('#toasts').append(el);
  setTimeout(close, ms);
}

// --- Bottom sheet (closes with back button, Escape, scrim tap or swipe down) ---
const sheet = $('#sheet'), body = $('#sheetBody'), scrim = $('#scrim');
let onClose = null, viaHistory = false;

export function openSheet(html, opts = {}) {
  const wasOpen = sheet.classList.contains('on');
  onClose?.();
  onClose = opts.onClose || null;
  body.innerHTML = html;
  body.scrollTop = 0;
  sheet.classList.add('on');
  scrim.classList.add('on');
  if (!wasOpen) {
    history.pushState({ sheet: true }, '');
    viaHistory = true;
  }
  requestAnimationFrame(() => (body.querySelector('[autofocus]') || sheet).focus?.({ preventScroll: true }));
  return body;
}

export function closeSheet(fromPop = false) {
  if (!sheet.classList.contains('on')) return;
  sheet.classList.remove('on');
  scrim.classList.remove('on');
  const fn = onClose; onClose = null; fn?.();
  if (viaHistory && !fromPop) { viaHistory = false; history.back(); }
  viaHistory = false;
}
export const isSheetOpen = () => sheet.classList.contains('on');
export const sheetBody = () => body;

addEventListener('popstate', () => { if (sheet.classList.contains('on')) closeSheet(true); });
scrim.addEventListener('click', () => closeSheet());
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
sheet.tabIndex = -1;

// Swipe down on the grip (or the top of the content) to dismiss
(() => {
  let y0 = null, dy = 0;
  const startDrag = (e) => {
    if (e.target.closest('#sheetGrip') || body.scrollTop <= 0) { y0 = e.touches[0].clientY; dy = 0; }
  };
  sheet.addEventListener('touchstart', startDrag, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    if (dy > 0 && (body.scrollTop <= 0 || e.target.closest('#sheetGrip'))) {
      sheet.classList.add('dragging');
      sheet.style.transform = `translateY(${dy}px)`;
    }
  }, { passive: true });
  sheet.addEventListener('touchend', () => {
    if (y0 == null) return;
    sheet.classList.remove('dragging');
    sheet.style.transform = '';
    if (dy > 110) closeSheet();
    y0 = null;
  });
})();

export const sheetHead = (title, sub = '') => `
  <div class="sheet-head">
    <div class="grow"><h3>${title}</h3>${sub ? `<div class="muted small">${sub}</div>` : ''}</div>
    <button class="icon-btn" data-close aria-label="إغلاق">${icon('x')}</button>
  </div>`;
body.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });

// --- Theme & fonts ---
const THEME_COLORS = { emerald: '#06140e', night: '#000000', light: '#f5f2ea', sepia: '#f1e7d0' };
export const THEMES = [
  ['emerald', 'زمردي', 'linear-gradient(135deg,#143427,#06140e)', '#d9b44a'],
  ['night', 'ليلي', 'linear-gradient(135deg,#1a1a1a,#000)', '#d9b44a'],
  ['light', 'فاتح', 'linear-gradient(135deg,#fff,#ece6d6)', '#9c7614'],
  ['sepia', 'ورقي', 'linear-gradient(135deg,#f9f1df,#e9dcbd)', '#8f5f12'],
];
export const FONTS = {
  amiri: { name: 'أميري قرآن', family: "'Amiri Quran', 'Amiri', serif" },
  scheherazade: { name: 'شهرزاد', family: "'Scheherazade New', 'Amiri Quran', serif", css: 'family=Scheherazade+New:wght@400;700' },
  naskh: { name: 'نسخ', family: "'Noto Naskh Arabic', 'Amiri Quran', serif", css: 'family=Noto+Naskh+Arabic:wght@400;600' },
};
const loadedFonts = new Set();

export function applyTheme() {
  const st = S.settings;
  const root = document.documentElement;
  root.dataset.theme = st.theme;
  root.style.setProperty('--qsize', st.fontSize + 'px');
  const f = FONTS[st.font] || FONTS.amiri;
  if (f.css && !loadedFonts.has(st.font)) {
    loadedFonts.add(st.font);
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?${f.css}&display=swap`;
    document.head.append(l);
  }
  root.style.setProperty('--quran-font', f.family);
  document.querySelector('meta[name="theme-color"]').content = THEME_COLORS[st.theme] || THEME_COLORS.emerald;
}

export function setSetting(key, value) {
  S.settings[key] = value;
  save();
  applyTheme();
  emit('settings', key);
}

// --- Install (PWA) ---
let deferredPrompt = null;
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const canInstall = () => !isStandalone() && (!!deferredPrompt || isIOS());

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  emit('installable', true);
});
addEventListener('appinstalled', () => {
  deferredPrompt = null;
  emit('installable', false);
  toast('تم تثبيت التطبيق بنجاح ✨');
});

export async function promptInstall() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') deferredPrompt = null;
    emit('installable', !!deferredPrompt);
    return;
  }
  openSheet(`
    ${sheetHead('تثبيت التطبيق على جهازك')}
    <div class="stack">
      ${isIOS() ? `
        <div class="setting"><span class="num-star">١</span><div class="grow">اضغط على زر <b>المشاركة</b> ${icon('share', 'sm')} في شريط Safari</div></div>
        <div class="setting"><span class="num-star">٢</span><div class="grow">اختر <b>«إضافة إلى الشاشة الرئيسية»</b></div></div>
        <div class="setting"><span class="num-star">٣</span><div class="grow">اضغط <b>«إضافة»</b> — سيظهر «اقرأ» كتطبيق مستقل يعمل دون إنترنت</div></div>
      ` : `
        <div class="setting"><span class="num-star">١</span><div class="grow">افتح قائمة المتصفح <b>⋮</b></div></div>
        <div class="setting"><span class="num-star">٢</span><div class="grow">اختر <b>«تثبيت التطبيق»</b> أو <b>«إضافة إلى الشاشة الرئيسية»</b></div></div>
      `}
    </div>`);
}

// --- Screen wake lock while reading ---
let wakeLock = null, wantWake = false;
export async function keepAwake(on) {
  wantWake = on && S.settings.wakeLock;
  try {
    if (wantWake && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!wantWake && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {}
}
document.addEventListener('visibilitychange', () => { if (wantWake && document.visibilityState === 'visible') keepAwake(true); });

export async function share({ title, text, url }) {
  try {
    if (navigator.share) { await navigator.share({ title, text, url }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  await copy(text + (url ? `\n${url}` : ''));
}
export async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('تم النسخ'); }
  catch { toast('تعذر النسخ'); }
}
