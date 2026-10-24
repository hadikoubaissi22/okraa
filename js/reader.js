// Quran reader: renders a surah / juz / page in mushaf (flow) or cards mode
import { S, save, $, esc, icon, num, emit, on, plural, markActiveDay, haptic } from './store.js';
import * as Q from './quran.js';
import * as player from './player.js';
import { openSheet, closeSheet, sheetHead, toast, share, copy, keepAwake, setSetting, THEMES, FONTS } from './ui.js';
import { touchKhatma, completeKhatma, toggleBookmark, isBookmarked } from './khatma.js';

const view = $('#v-reader');
let R = { kind: 'surah', n: 1, from: 0, to: 7 };
let active = false, built = false;
let observer = null, endObserver = null, current = null, saveTimer = null;
let lastUserScroll = 0, lastY = 0, ticking = false;

const KIND_LABEL = { surah: 'سورة', juz: 'الجزء', page: 'صفحة' };
const unitTitle = (kind, n) => kind === 'surah' ? `سورة ${Q.surahName(n)}` : `${KIND_LABEL[kind]} ${num(n)}`;

export function readerHash(kind, i) {
  const s = Q.surahOf(i), a = Q.ayahOf(i);
  return kind === 'surah' ? `#/surah/${s}/${a}` : `#/${kind}/${Q.unitOf(kind, i)}/${s}-${a}`;
}
export const ayahLink = (i) => readerHash('surah', i);

function build() {
  view.innerHTML = `
    <header class="rbar">
      <a class="icon-btn" href="#/index" data-back aria-label="رجوع">${icon('back')}</a>
      <button class="icon-btn" data-act="search" aria-label="بحث">${icon('search')}</button>
      <div class="title" data-act="jump" role="button" tabindex="0" aria-label="انتقال سريع">
        <b id="rTitle">…</b><small id="rSub">&nbsp;</small>
      </div>
      <button class="icon-btn" data-act="locate" aria-label="الذهاب إلى الآية الحالية" title="الذهاب إلى الآية الحالية">${icon('locate')}</button>
      <button class="icon-btn" data-act="display" aria-label="إعدادات العرض">${icon('font')}</button>
      <i class="read-progress" id="rProg"></i>
    </header>
    <div class="reader" id="rBody"></div>`;
  view.addEventListener('click', onClick);
  initSwipe();
  built = true;
}

export async function openReader(kind, n, target = null, { follow = false } = {}) {
  if (!built) build();
  const body = $('#rBody');
  n = Math.min(Math.max(1, n | 0), Q.unitCount(kind));
  if (!Q.isReady()) {
    body.innerHTML = '<div class="spinner"></div>';
    try { await Q.ready(); }
    catch {
      body.innerHTML = `<div class="empty">${icon('info')}<p>تعذر تحميل نص المصحف. تحقق من اتصالك بالإنترنت ثم أعد المحاولة.</p><button class="btn" onclick="location.reload()">إعادة المحاولة</button></div>`;
      return;
    }
  }
  const [from, to] = Q.range(kind, n);
  const same = R.kind === kind && R.n === n && body.dataset.mode === S.settings.mode && body.childElementCount > 1;
  R = { kind, n, from, to };
  $('#rTitle').textContent = unitTitle(kind, n);
  if (!same) render();
  current = null;
  if (target != null && target >= from && target < to) {
    scrollToAyah(target, { flash: !follow, block: follow ? 'center' : 'start' });
    // Fonts can shift layout after first paint — settle on the target again
    document.fonts?.ready.then(() => { if (Date.now() - lastUserScroll > 1500) scrollToAyah(target, { flash: false, block: follow ? 'center' : 'start' }); });
  } else if (!same) {
    scrollTo({ top: 0, behavior: 'instant' });
  }
  updateSub(target ?? from);
  highlight(player.P.i);
}

export function enter() {
  active = true;
  document.body.classList.add('reading');
  addEventListener('scroll', onScroll, { passive: true });
  keepAwake(true);
}
export function leave() {
  active = false;
  document.body.classList.remove('reading', 'immersive');
  removeEventListener('scroll', onScroll);
  keepAwake(false);
  flushPosition();
}

// --- Rendering ---
const basmalaHTML = () => `<div class="basmala">${Q.text(0)}</div>`;

function surahHeader(s) {
  const [name, type, count] = Q.SURAHS[s - 1];
  return `<div class="sh">
      <div class="meta">${type === 'M' ? 'مكية' : 'مدنية'} • ${plural(count, 'آية واحدة', 'آيتان', 'آيات', 'آية')}</div>
      <h2>سورة ${name}</h2>
      <div class="meta">ترتيبها ${num(s)} • الجزء ${num(Q.juzOf(Q.gi(s)))} • صفحة ${num(Q.pageOf(Q.gi(s)))}</div>
    </div>${s !== 1 && s !== 9 ? basmalaHTML() : ''}`;
}

function render() {
  const { from, to, kind, n } = R;
  const flow = S.settings.mode === 'flow';
  const body = $('#rBody');
  const marks = new Set(S.bookmarks.map((b) => b.i));
  let h = '', open = false;
  const openP = () => { if (!open) { h += '<div class="mushaf">'; open = true; } };
  const closeP = () => { if (open) { h += '</div>'; open = false; } };

  if (kind === 'page') h += `<div class="pgsep">صفحة ${num(n)} • الجزء ${num(Q.juzOf(from))}</div>`;
  for (let i = from; i < to; i++) {
    const s = Q.surahOf(i), a = Q.ayahOf(i);
    if (a === 1) { closeP(); h += surahHeader(s); }
    else if (i === from) h += `<div class="surah-chip-wrap"><span class="surah-chip">سورة ${Q.surahName(s)}</span></div>`;
    if (i !== from && kind !== 'page' && Q.isPageStart(i)) {
      if (flow) openP();
      h += `<span class="pgsep">${num(Q.pageOf(i))}</span>`;
    }
    const hz = Q.isQuarterStart(i) ? `<span class="hz" title="${Q.quarterLabel(Q.quarterOf(i), num)}">۞</span>` : '';
    const an = `<span class="an${marks.has(i) ? ' bm' : ''}">${num(a)}</span>`;
    const sj = Q.SAJDA[i] ? ' sajda' : '';
    if (flow) {
      openP();
      h += `<span class="ay${sj}" data-i="${i}">${hz}${Q.text(i)} ${an}</span> `;
    } else {
      h += `<article class="ayc${sj}" data-i="${i}">
        <div class="head">${an}<span class="grow">${hz}${Q.SAJDA[i] ? 'سجدة • ' : ''}صفحة ${num(Q.pageOf(i))}</span>
          <button class="icon-btn" data-act="play-ayah" aria-label="استماع">${icon('play', 'fill sm')}</button>
          <button class="icon-btn" data-act="tafsir-inline" aria-label="التفسير">${icon('tafsir', 'sm')}</button>
          <button class="icon-btn" data-act="bookmark" aria-label="علامة">${icon('bookmark', 'sm')}</button>
        </div>
        <div class="txt">${Q.text(i)}</div>
      </article>`;
    }
  }
  closeP();

  if (to >= Q.TOTAL_AYAHS) h += `<div class="khatm" id="khatm">صدق الله العظيم</div>`;
  const max = Q.unitCount(kind);
  h += '<nav class="rnav">';
  if (n > 1) h += `<a href="#/${kind}/${n - 1}" data-unit="${n - 1}">${icon('right', 'sm')} ${unitTitle(kind, n - 1)}</a>`;
  if (n < max) h += `<a href="#/${kind}/${n + 1}" data-unit="${n + 1}">${unitTitle(kind, n + 1)} ${icon('left', 'sm')}</a>`;
  h += '</nav>';

  body.innerHTML = h;
  body.dataset.mode = S.settings.mode;
  observe();
}

export function rerender() {
  if (!built || !Q.isReady()) return;
  const keep = current;
  render();
  if (keep != null) scrollToAyah(keep, { flash: false, block: 'start' });
  highlight(player.P.i);
}

function el(i) { return $('#rBody')?.querySelector(`[data-i="${i}"]`); }

function scrollToAyah(i, { flash = true, block = 'start', smooth = false } = {}) {
  const e = el(i);
  if (!e) return;
  const bar = 70;
  const rect = e.getBoundingClientRect();
  let top = scrollY + rect.top - bar - 12;
  if (block === 'center') top = scrollY + rect.top - (innerHeight - rect.height) / 2;
  scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'instant' });
  if (flash) { e.classList.remove('flash'); void e.offsetWidth; e.classList.add('flash'); }
}

function highlight(i) {
  const body = $('#rBody');
  if (!body) return;
  body.querySelector('.cur')?.classList.remove('cur');
  if (i == null || !player.hasSession()) return;
  el(i)?.classList.add('cur');
}

// --- Position tracking ---
function observe() {
  observer?.disconnect();
  endObserver?.disconnect();
  const visible = new Set();
  observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const i = +e.target.dataset.i;
      if (e.isIntersecting) visible.add(i); else visible.delete(i);
    }
    if (visible.size) setCurrent(Math.min(...visible));
  }, { rootMargin: '-22% 0px -68% 0px' });
  $('#rBody').querySelectorAll('[data-i]').forEach((e) => observer.observe(e));

  const end = $('#khatm');
  if (end) {
    endObserver = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || !active || Date.now() - lastUserScroll > 3000) return;
      const k = S.khatma;
      if (k && Q.pageOf(k.pos) >= Q.PAGES.length - 2) {
        touchKhatma(Q.TOTAL_AYAHS - 1, true);
        if (completeKhatma()) celebrate();
      }
    });
    endObserver.observe(end);
  }
}

function setCurrent(i) {
  if (current === i) return;
  current = i;
  updateSub(i);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushPosition, 1200);
}

function flushPosition() {
  clearTimeout(saveTimer);
  if (current == null || !active) return;
  S.lastRead = { i: current, k: R.kind, t: Date.now() };
  save();
  markActiveDay();
  touchKhatma(current);
  emit('lastread', current);
}

function updateSub(i) {
  const sub = $('#rSub');
  if (!sub) return;
  const parts = [];
  if (R.kind !== 'surah') parts.push(`سورة ${Q.surahName(Q.surahOf(i))}`);
  if (R.kind !== 'juz') parts.push(`الجزء ${num(Q.juzOf(i))}`);
  parts.push(Q.quarterLabel(Q.quarterOf(i), num));
  if (R.kind !== 'page') parts.push(`صفحة ${num(Q.pageOf(i))}`);
  sub.textContent = parts.join(' • ');
}

function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const y = scrollY;
    const d = y - lastY;
    if (Math.abs(d) > 10) {
      // Only hide the bars for the reader's own scrolling, not programmatic jumps
      const byUser = Date.now() - lastUserScroll < 800;
      if (byUser || d < 0) document.body.classList.toggle('immersive', byUser && d > 0 && y > 160 && !player.P.playing);
      lastY = y;
    }
    const max = document.documentElement.scrollHeight - innerHeight;
    $('#rProg').style.width = `${max > 0 ? Math.min(100, (y / max) * 100) : 0}%`;
  });
}
for (const ev of ['wheel', 'touchmove', 'keydown', 'mousedown']) {
  addEventListener(ev, () => { if (active) lastUserScroll = Date.now(); }, { passive: true });
}

// --- Follow the recitation ---
on('ayah', (i) => {
  if (!active) return;
  if (i < R.from || i >= R.to) {
    if (S.settings.follow && player.P.playing !== false) {
      const n = Q.unitOf(R.kind, i);
      history.replaceState(history.state, '', readerHash(R.kind, i));
      openReader(R.kind, n, i, { follow: true });
    }
    return;
  }
  highlight(i);
  if (S.settings.follow && Date.now() - lastUserScroll > 4000) {
    const e = el(i);
    if (!e) return;
    const r = e.getBoundingClientRect();
    if (r.top < 90 || r.bottom > innerHeight - 140) scrollToAyah(i, { flash: false, block: 'center', smooth: true });
  }
});
on('player', () => { if (active) highlight(player.P.i); });

// --- Interactions ---
// Move to another surah/juz/page without growing the history stack
function swapUnit(kind, n, target = null) {
  history.replaceState(history.state, '', target != null ? readerHash(kind, target) : `#/${kind}/${n}`);
  openReader(kind, n, target);
}

function onClick(e) {
  const unit = e.target.closest('[data-unit]');
  if (unit) { e.preventDefault(); swapUnit(R.kind, +unit.dataset.unit); return; }
  const act = e.target.closest('[data-act]')?.dataset.act;
  const host = e.target.closest('[data-i]');
  if (act === 'jump') return jumpSheet();
  if (act === 'display') return displaySheet();
  if (act === 'search') { location.hash = '#/index/search'; return; }
  if (act === 'locate') {
    // The ayah being recited (or last played), otherwise the saved reading position
    const i = player.P.i ?? S.lastRead?.i;
    if (i == null) { toast('لا توجد آية حالية بعد — اضغط على أي آية للاستماع'); return; }
    lastUserScroll = 0; // let auto-follow resume
    if (i < R.from || i >= R.to) swapUnit(R.kind, Q.unitOf(R.kind, i), i);
    else scrollToAyah(i, { block: 'center', smooth: true });
    return;
  }
  if (!host) return;
  const i = +host.dataset.i;
  if (act === 'play-ayah') { player.play(i); return; }
  if (act === 'bookmark') { bookmark(i); return; }
  if (act === 'tafsir-inline') { inlineTafsir(host, i); return; }
  if (String(getSelection()).trim()) return;
  ayahSheet(i);
}

function bookmark(i) {
  const added = toggleBookmark(i);
  el(i)?.querySelector('.an')?.classList.toggle('bm', added);
  haptic(12);
  toast(added ? 'أُضيفت إلى العلامات' : 'أُزيلت من العلامات');
}

async function inlineTafsir(host, i) {
  let box = host.querySelector('.tf');
  if (box) { box.remove(); return; }
  box = document.createElement('div');
  box.className = 'tf';
  box.innerHTML = '<span class="muted small">جارٍ تحميل التفسير…</span>';
  host.append(box);
  try {
    const list = await Q.tafsir(S.settings.tafsir, Q.surahOf(i));
    const name = Q.TAFSIRS.find((t) => t[0] === S.settings.tafsir)?.[1] || '';
    box.innerHTML = `<b class="gold small">تفسير ${name}</b><br>${esc(list[Q.ayahOf(i) - 1] || '')}`;
  } catch {
    box.innerHTML = '<span class="muted small">تعذر تحميل التفسير — تحقق من الاتصال.</span>';
  }
}

const quoteText = (i) => `﴿${Q.text(i)}﴾ [${Q.surahName(Q.surahOf(i))}: ${num(Q.ayahOf(i))}]`;
const ayahUrl = (i) => `${location.origin}${location.pathname}${ayahLink(i)}`;

function ayahSheet(i) {
  const s = Q.surahOf(i), a = Q.ayahOf(i);
  const node = el(i);
  node?.classList.add('sel');
  const marked = isBookmarked(i);
  const hasKhatma = !!S.khatma;
  const body = openSheet(`
    ${sheetHead(`سورة ${Q.surahName(s)} • الآية ${num(a)}`, `الجزء ${num(Q.juzOf(i))} • صفحة ${num(Q.pageOf(i))}${Q.SAJDA[i] ? ' • موضع سجدة' : ''}`)}
    <div class="ayah-text">${Q.text(i)}</div>
    <div class="actions">
      <button class="action" data-a="play">${icon('play', 'fill')}استماع</button>
      <button class="action" data-a="tafsir">${icon('tafsir')}التفسير</button>
      <button class="action${marked ? ' on' : ''}" data-a="bm">${icon('bookmark')}${marked ? 'إزالة العلامة' : 'علامة'}</button>
      <button class="action" data-a="repeat">${icon('repeat')}تكرار للحفظ</button>
      <button class="action" data-a="copy">${icon('copy')}نسخ</button>
      <button class="action" data-a="share">${icon('share')}مشاركة</button>
      ${hasKhatma ? `<button class="action" data-a="khatma">${icon('flag')}موضع الختمة</button>` : ''}
      <button class="action" data-a="close" data-close>${icon('x')}إغلاق</button>
    </div>
    <div id="tfWrap" hidden>
      <div class="chips scroll" id="tfSrc">${Q.TAFSIRS.map(([id, name]) => `<button class="chip" data-tf="${id}" aria-pressed="${id === S.settings.tafsir}">${name}</button>`).join('')}</div>
      <div class="tafsir-box" id="tfBox"></div>
    </div>`, { onClose: () => node?.classList.remove('sel') });

  const loadTafsir = async () => {
    const box = body.querySelector('#tfBox');
    box.innerHTML = '<div class="spinner"></div>';
    try {
      const list = await Q.tafsir(S.settings.tafsir, s);
      box.textContent = list[a - 1] || '—';
    } catch {
      box.innerHTML = '<span class="muted">تعذر تحميل التفسير — تحقق من اتصالك بالإنترنت.</span>';
    }
  };

  body.onclick = (e) => {
    const tf = e.target.closest('[data-tf]');
    if (tf) {
      S.settings.tafsir = tf.dataset.tf; save();
      body.querySelectorAll('[data-tf]').forEach((b) => b.setAttribute('aria-pressed', b === tf));
      loadTafsir();
      return;
    }
    const b = e.target.closest('[data-a]');
    if (!b) return;
    switch (b.dataset.a) {
      case 'play': player.play(i); closeSheet(); break;
      case 'tafsir': {
        const w = body.querySelector('#tfWrap');
        w.hidden = !w.hidden;
        if (!w.hidden) { loadTafsir(); setTimeout(() => w.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50); }
        break;
      }
      case 'bm': {
        bookmark(i);
        const on = isBookmarked(i);
        b.classList.toggle('on', on);
        b.lastChild.textContent = on ? 'إزالة العلامة' : 'علامة';
        break;
      }
      case 'repeat':
        S.settings.rep = 0; save();
        player.refreshQueue();
        player.play(i);
        closeSheet();
        toast('تكرار الآية مستمر', { action: 'إيقاف التكرار', ms: 6000, onAction: () => { S.settings.rep = 1; save(); emit('player', player.P); } });
        break;
      case 'copy': copy(quoteText(i)); break;
      case 'share': share({ title: 'اقرأ — القرآن الكريم', text: quoteText(i), url: ayahUrl(i) }); break;
      case 'khatma': touchKhatma(i, true); toast('تم تعيين موضع الختمة هنا'); closeSheet(); break;
    }
  };
}

function jumpSheet() {
  const i = current ?? R.from;
  const body = openSheet(`
    ${sheetHead('انتقال سريع')}
    <div class="stack">
      <div class="seg" id="jKind">
        ${['surah', 'juz', 'page'].map((k) => `<button data-k="${k}" class="${k === R.kind ? 'on' : ''}">${{ surah: 'بالسورة', juz: 'بالجزء', page: 'بالصفحة' }[k]}</button>`).join('')}
      </div>
      <p class="muted small">يعرض الموضع الحالي (${Q.surahName(Q.surahOf(i))} ${num(Q.ayahOf(i))}) بالطريقة المختارة.</p>
      <div class="row">
        <input class="field" id="jPage" type="number" inputmode="numeric" min="1" max="604" placeholder="رقم الصفحة (١ - ٦٠٤)">
        <button class="btn primary" id="jGo">انتقال</button>
      </div>
      <div class="row">
        <input class="field" id="jRef" placeholder="مثال: ٢:٢٥٥ أو البقرة ٢٥٥">
        <button class="btn" id="jRefGo">انتقال</button>
      </div>
      <a class="btn block" href="#/index">${icon('list')} فهرس السور والأجزاء</a>
    </div>`);
  const go = (hash) => { closeSheet(true); history.replaceState({ inApp: true }, '', hash); dispatchEvent(new HashChangeEvent('hashchange')); };
  body.querySelector('#jKind').onclick = (e) => {
    const k = e.target.closest('[data-k]')?.dataset.k;
    if (k) go(readerHash(k, i));
  };
  body.querySelector('#jGo').onclick = () => {
    const p = +body.querySelector('#jPage').value;
    if (p >= 1 && p <= 604) go(`#/page/${p}`); else toast('أدخل رقم صفحة بين ١ و٦٠٤');
  };
  body.querySelector('#jRefGo').onclick = () => {
    const g = Q.parseRef(body.querySelector('#jRef').value);
    if (g != null) go(readerHash(R.kind, g)); else toast('لم يتم التعرف على الموضع');
  };
}

export function displaySheet() {
  const st = S.settings;
  const body = openSheet(`
    ${sheetHead('إعدادات العرض')}
    <div class="stack">
      <div class="font-preview" id="dPrev">${Q.isReady() ? Q.text(Q.gi(1, 2)) : 'ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ'}</div>
      <div class="setting col">
        <div class="row"><span class="label grow">حجم الخط</span><b class="gold" id="dSizeV">${num(st.fontSize)}</b></div>
        <input type="range" id="dSize" min="18" max="52" step="1" value="${st.fontSize}" aria-label="حجم الخط">
      </div>
      <div class="setting col">
        <span class="label">طريقة العرض</span>
        <div class="seg" id="dMode">
          <button data-v="flow" class="${st.mode === 'flow' ? 'on' : ''}">مصحف متصل</button>
          <button data-v="cards" class="${st.mode === 'cards' ? 'on' : ''}">آيات منفصلة</button>
        </div>
      </div>
      <div class="setting col">
        <span class="label">خط المصحف</span>
        <div class="chips" id="dFont">${Object.entries(FONTS).map(([k, f]) => `<button class="chip" data-v="${k}" aria-pressed="${st.font === k}">${f.name}</button>`).join('')}</div>
      </div>
      <div class="setting col">
        <span class="label">المظهر</span>
        <div class="theme-swatches" id="dTheme">${THEMES.map(([k, name, bg, fg]) => `<button data-v="${k}" class="${st.theme === k ? 'on' : ''}" style="background:${bg};color:${fg}">${name}</button>`).join('')}</div>
      </div>
      <label class="setting"><div class="grow"><div class="label">تتبع التلاوة</div><div class="hint">تمرير الصفحة تلقائياً مع الآية المسموعة</div></div><span class="switch"><input type="checkbox" id="dFollow" ${st.follow ? 'checked' : ''}><span></span></span></label>
      <label class="setting"><div class="grow"><div class="label">إبقاء الشاشة مضاءة</div><div class="hint">أثناء القراءة</div></div><span class="switch"><input type="checkbox" id="dWake" ${st.wakeLock ? 'checked' : ''}><span></span></span></label>
    </div>`);
  const size = body.querySelector('#dSize');
  size.oninput = () => {
    document.documentElement.style.setProperty('--qsize', size.value + 'px');
    body.querySelector('#dSizeV').textContent = num(size.value);
  };
  size.onchange = () => { setSetting('fontSize', +size.value); };
  body.querySelector('#dMode').onclick = (e) => {
    const v = e.target.closest('[data-v]')?.dataset.v;
    if (!v || v === S.settings.mode) return;
    body.querySelectorAll('#dMode button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    setSetting('mode', v);
    rerender();
  };
  body.querySelector('#dFont').onclick = (e) => {
    const v = e.target.closest('[data-v]')?.dataset.v;
    if (!v) return;
    body.querySelectorAll('#dFont .chip').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === v));
    setSetting('font', v);
  };
  body.querySelector('#dTheme').onclick = (e) => {
    const v = e.target.closest('[data-v]')?.dataset.v;
    if (!v) return;
    body.querySelectorAll('#dTheme button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    setSetting('theme', v);
  };
  body.querySelector('#dFollow').onchange = (e) => setSetting('follow', e.target.checked);
  body.querySelector('#dWake').onchange = (e) => { setSetting('wakeLock', e.target.checked); keepAwake(active); };
}

function celebrate() {
  haptic([30, 60, 30, 60, 80]);
  openSheet(`
    <div class="center stack" style="padding:10px 0 6px">
      <div style="font-size:3.2rem">🌙</div>
      <h3 style="font-family:var(--display);font-size:1.8rem;color:var(--gold)">ختمة مباركة</h3>
      <p>الحمد لله الذي بنعمته تتم الصالحات. أتممت ختمة القرآن الكريم — تقبّل الله منك.</p>
      <p class="muted small">عدد الختمات: ${num(S.khatmaDone)}</p>
      <a class="btn primary block" href="#/khatma">ابدأ ختمة جديدة</a>
    </div>`);
}

// Swipe between pages in page mode (RTL: swipe right = next page)
function initSwipe() {
  let x0 = 0, y0 = 0, t0 = 0;
  view.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); }, { passive: true });
  view.addEventListener('touchend', (e) => {
    if (R.kind !== 'page') return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2 || Date.now() - t0 > 600) return;
    const n = R.n + (dx > 0 ? 1 : -1);
    if (n < 1 || n > 604) return;
    swapUnit('page', n);
  }, { passive: true });
}

// Keyboard shortcuts while reading
addEventListener('keydown', (e) => {
  if (!active || e.target.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Space') { e.preventDefault(); player.P.i == null ? player.play(current ?? R.from) : player.toggle(); }
  else if (e.key === 'ArrowLeft') { if (player.hasSession()) player.next(); else if (R.n < Q.unitCount(R.kind)) swapUnit(R.kind, R.n + 1); }
  else if (e.key === 'ArrowRight') { if (player.hasSession()) player.prev(); else if (R.n > 1) swapUnit(R.kind, R.n - 1); }
  else if (e.key === '+' || e.key === '=') setSetting('fontSize', Math.min(52, S.settings.fontSize + 2));
  else if (e.key === '-') setSetting('fontSize', Math.max(18, S.settings.fontSize - 2));
});
