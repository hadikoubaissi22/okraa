// Mushaf index: surahs, ajza', bookmarks and full-text search
import { S, $, esc, icon, num, on, plural } from './store.js';
import * as Q from './quran.js';
import { readerHash } from './reader.js';
import { toggleBookmark, khatmaStatus } from './khatma.js';
import { toast } from './ui.js';

const view = $('#v-index');
let tab = 'surah', built = false, query = '', searchTimer = null, searchSeq = 0;

function build() {
  view.innerHTML = `
    <div class="index-sticky">
      <div class="vhead"><h1>المصحف الشريف</h1>
        <a class="btn sm" href="#/page/1">${icon('pages', 'sm')} تصفح بالصفحات</a></div>
      <div class="search">${icon('search')}
        <input class="field" id="ixQ" type="search" enterkeyhint="search" autocomplete="off" placeholder="ابحث عن سورة أو كلمة أو موضع مثل ٢:٢٥٥" aria-label="بحث">
      </div>
      <div class="seg" id="ixTabs" style="margin-top:10px">
        <button data-t="surah">السور</button><button data-t="juz">الأجزاء</button><button data-t="bm">العلامات</button>
      </div>
    </div>
    <div id="ixBody" style="padding-top:8px"></div>`;
  const q = $('#ixQ');
  q.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { query = q.value.trim(); renderBody(); }, 180);
  });
  q.addEventListener('focus', () => Q.preloadSearch(), { once: true });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const g = Q.parseRef(q.value);
      if (g != null) location.hash = readerHash('surah', g);
    }
  });
  $('#ixTabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-t]')?.dataset.t;
    if (!t) return;
    tab = t;
    history.replaceState(history.state, '', t === 'surah' ? '#/index' : `#/index/${t === 'bm' ? 'bookmarks' : t}`);
    renderBody();
  });
  $('#ixBody').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      e.preventDefault();
      toggleBookmark(+del.dataset.del);
      renderBody();
      toast('أُزيلت العلامة');
    }
  });
  built = true;
}

export function show(arg) {
  if (!built) build();
  if (arg === 'juz') tab = 'juz';
  else if (arg === 'bookmarks') tab = 'bm';
  else if (arg === 'search') { tab = tab || 'surah'; setTimeout(() => $('#ixQ').focus(), 60); }
  else if (!arg) tab = 'surah';
  renderBody();
}

function renderBody() {
  view.querySelectorAll('#ixTabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
  const body = $('#ixBody');
  if (query) return renderSearch(body);
  if (tab === 'surah') body.innerHTML = surahList();
  else if (tab === 'juz') body.innerHTML = juzList();
  else renderBookmarks(body);
}

let surahHTML = '';
function surahList() {
  if (surahHTML) return surahHTML;
  surahHTML = `<div class="surah-grid">${Q.SURAHS.map(([name, type, count, start], k) => `
    <a class="list-item surah-item" href="#/surah/${k + 1}">
      <span class="num-star">${num(k + 1)}</span>
      <div class="grow"><div class="name">${name}</div><div class="sub">${type === 'M' ? 'مكية' : 'مدنية'} • ${plural(count, 'آية واحدة', 'آيتان', 'آيات', 'آية')}</div></div>
      <div class="ar-end">صفحة ${num(Q.pageOf(start))}<br>الجزء ${num(Q.juzOf(start))}</div>
    </a>`).join('')}</div>`;
  return surahHTML;
}

function juzList() {
  const k = khatmaStatus();
  return `<div class="juz-grid">${Q.JUZ.map((start, j) => {
    const end = (Q.JUZ[j + 1] ?? Q.TOTAL_AYAHS) - 1;
    const done = k && k.page >= Q.pageOf(end);
    return `<a class="juz-card${done ? ' done' : ''}" href="#/juz/${j + 1}">
      <div class="row"><span class="n grow">الجزء ${num(j + 1)}</span>${done ? `<span class="gold">${icon('check', 'sm')}</span>` : ''}</div>
      <div class="nm">${Q.JUZ_NAMES[j]}</div>
      <div class="from">${Q.surahName(Q.surahOf(start))} ${num(Q.ayahOf(start))} • صفحة ${num(Q.pageOf(start))}</div>
    </a>`;
  }).join('')}</div>`;
}

async function renderBookmarks(body) {
  const lr = S.lastRead;
  if (!S.bookmarks.length && !lr) {
    body.innerHTML = `<div class="empty">${icon('bookmark')}<p>لا توجد علامات بعد.<br>اضغط على أي آية أثناء القراءة واختر «علامة».</p></div>`;
    return;
  }
  await Q.ready().catch(() => {});
  const item = (i, label, del) => `
    <a class="result" href="${readerHash('surah', i)}">
      <div class="row"><span class="ref grow">${label} • سورة ${Q.surahName(Q.surahOf(i))} • الآية ${num(Q.ayahOf(i))}</span>
      ${del ? `<button class="icon-btn" data-del="${i}" aria-label="حذف العلامة">${icon('trash', 'sm')}</button>` : ''}</div>
      <div class="t">${Q.isReady() ? Q.text(i) : ''}</div>
    </a>`;
  body.innerHTML = (lr ? item(lr.i, 'آخر قراءة', false) : '') + S.bookmarks.map((b) => item(b.i, 'علامة', true)).join('');
}

async function renderSearch(body) {
  const seq = ++searchSeq;
  const surahs = Q.findSurahs(query);
  const ref = Q.parseRef(query);
  let h = '';
  if (ref != null) {
    h += `<a class="list-item" href="${readerHash('surah', ref)}"><span class="num-star">${icon('left', 'sm')}</span><div class="grow"><div class="title">الانتقال إلى سورة ${Q.surahName(Q.surahOf(ref))} — الآية ${num(Q.ayahOf(ref))}</div></div></a>`;
  }
  if (surahs.length) {
    h += `<div class="sec-title">السور</div>` + surahs.slice(0, 8).map((s) => `<a class="list-item surah-item" href="#/surah/${s}"><span class="num-star">${num(s)}</span><div class="grow"><div class="name">${Q.surahName(s)}</div></div></a>`).join('');
  }
  body.innerHTML = h + '<div class="spinner"></div>';
  try {
    const [{ total, items }] = await Promise.all([Q.searchAyahs(query), Q.ready()]);
    if (seq !== searchSeq) return;
    if (!total) {
      body.innerHTML = h + (h ? '' : `<div class="empty">${icon('search')}<p>لا توجد نتائج لـ«${esc(query)}»</p></div>`);
      return;
    }
    body.innerHTML = h + `<div class="sec-title">الآيات — ${plural(total, 'نتيجة واحدة', 'نتيجتان', 'نتائج', 'نتيجة')}${total > items.length ? ` (أول ${num(items.length)})` : ''}</div>` +
      items.map((i) => `<a class="result" href="${readerHash('surah', i)}"><div class="ref">سورة ${Q.surahName(Q.surahOf(i))} • ${num(Q.ayahOf(i))}</div><div class="t">${Q.text(i)}</div></a>`).join('');
  } catch {
    if (seq === searchSeq) body.innerHTML = h + `<div class="empty"><p>تعذر تحميل فهرس البحث — تحقق من الاتصال.</p></div>`;
  }
}

on('settings', (k) => { if (k === 'digits') { surahHTML = ''; if (built) renderBody(); } });
on('bookmarks', () => { if (built && tab === 'bm' && !view.hidden) renderBody(); });
