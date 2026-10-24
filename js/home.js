// Home dashboard
import { S, $, icon, num, on, fmtTime, fmtCountdown, fmtGreg, WEEKDAYS, streak, plural, dayKey } from './store.js';
import * as Q from './quran.js';
import { toHijri, HIJRI_MONTHS, ramadanInfo, upcoming } from './hijri.js';
import { PRAYER_NAMES } from './prayer.js';
import { nextPrayer, fastingTarget, requestLocation } from './times.js';
import { khatmaStatus, startKhatma } from './khatma.js';
import { readerHash } from './reader.js';
import { canInstall, promptInstall, share, toast } from './ui.js';

const view = $('#v-home');
let active = false, timer = null, renderedDay = '';

const QUICK = [
  ['الكهف', '#/surah/18', 'book'], ['يس', '#/surah/36', 'book'], ['الملك', '#/surah/67', 'book'], ['الرحمن', '#/surah/55', 'book'],
  ['الواقعة', '#/surah/56', 'book'], ['آية الكرسي', '#/surah/2/255', 'star'], ['خواتيم البقرة', '#/surah/2/285', 'star'], ['جزء عمّ', '#/juz/30', 'pages'],
];

export function show() {
  active = true;
  render();
  clearInterval(timer);
  timer = setInterval(tick, 1000);
}
export function leave() {
  active = false;
  clearInterval(timer);
}

function render() {
  const now = new Date();
  renderedDay = dayKey(now);
  const h = toHijri(now);
  view.innerHTML = `
    <div class="hero">
      <div class="grow">
        <div class="brand"><img src="icons/icon-192.png" alt="" width="40" height="40"><div><b>اقرأ</b><small>القرآن الكريم</small></div></div>
        <div class="hijri-big"><span class="gold">${num(h.d)}</span> ${HIJRI_MONTHS[h.m - 1]} ${num(h.y)}<span class="muted" style="font-size:.55em"> هـ</span></div>
        <div class="greg-line">${WEEKDAYS[now.getDay()]} • ${fmtGreg(now)}</div>
      </div>
      <a class="icon-btn" href="#/index/search" aria-label="بحث">${icon('search')}</a>
      <a class="icon-btn" href="#/settings" aria-label="الإعدادات">${icon('settings')}</a>
    </div>
    <div class="stack home-grid">
      ${installCard()}
      ${ramadanCard(now)}
      ${prayerCard(now)}
      ${continueCard()}
      ${khatmaCard()}
      ${fridayNote(now)}
      <div class="span">
        <div class="sec-title">${icon('star', 'sm')} وصول سريع</div>
        <div class="quick">${QUICK.map(([t, href, ic]) => `<a href="${href}" class="${t === 'الكهف' && now.getDay() === 5 ? 'hot' : ''}">${icon(ic, 'sm')}${t}</a>`).join('')}</div>
      </div>
      ${verseCard(now)}
      ${eventsCard(now)}
    </div>
    <footer class="footer">بُني بحب لخدمة كتاب الله • Powered By <b>Hadi Koubaissi</b></footer>`;
  tick();
}

function installCard() {
  if (!canInstall()) return '';
  return `<div class="card install-card span">
    <img src="icons/icon-192.png" alt="" width="52" height="52">
    <div class="grow"><b>ثبّت «اقرأ» على جهازك</b><div class="muted small">وصول أسرع من الشاشة الرئيسية ويعمل دون إنترنت</div></div>
    <button class="btn primary sm" data-act="install">${icon('download', 'sm')} تثبيت</button>
  </div>`;
}

function ramadanCard(now) {
  const r = ramadanInfo(now);
  if (!r.days) return '';
  if (r.inRamadan) {
    const lastTen = r.day >= 21;
    return `<div class="card ramadan-card span">
      <svg class="moon" aria-hidden="true"><use href="#i-moon"/></svg>
      <div class="row">
        <div class="grow"><div class="muted small">رمضان كريم 🌙</div><h2>اليوم ${num(r.day)} من رمضان</h2>
          <div class="muted small">${lastTen ? 'العشر الأواخر — تحرَّ ليلة القدر' : `متبقٍ ${plural(r.total - r.day, 'يوم واحد', 'يومان', 'أيام', 'يوماً')}`}</div></div>
        <div class="ring-wrap"><div class="ring" style="--p:${(r.day / r.total) * 100};--size:64px"></div><b>${num(r.day)}</b></div>
      </div>
      ${S.location ? `
        <div style="margin-top:12px"><div class="muted small" id="fastLabel">&nbsp;</div><div class="countdown" id="fastCd">--:--</div></div>
        <div class="kv" id="fastKv"></div>` : `
        <button class="btn block" style="margin-top:14px" data-act="locate">${icon('locate', 'sm')} حدد موقعك لعرض موعد الإفطار والإمساك</button>`}
      <div class="dua">${lastTen ? 'اللَّهُمَّ إِنَّكَ عَفُوٌّ تُحِبُّ العَفْوَ فَاعْفُ عَنِّي' : 'ذَهَبَ الظَّمَأُ، وَابْتَلَّتِ العُرُوقُ، وَثَبَتَ الأَجْرُ إِنْ شَاءَ اللهُ'}</div>
      <div class="row wrap" style="margin-top:12px"><a class="btn sm" href="#/prayer/imsakiya">${icon('calendar', 'sm')} إمساكية رمضان</a>${!S.khatma ? `<button class="btn sm primary" data-act="ramadan-khatma">${icon('flag', 'sm')} ختمة رمضان</button>` : ''}</div>
    </div>`;
  }
  if (r.daysLeft > 75) return '';
  return `<div class="card ramadan-card span">
    <svg class="moon" aria-hidden="true"><use href="#i-moon"/></svg>
    <div class="muted small">${toHijri(now).m === 8 ? 'اللهم بلّغنا رمضان' : 'استعد لشهر الخير'}</div>
    <h2>متبقٍ على رمضان ${plural(r.daysLeft, 'يوم واحد', 'يومان', 'أيام', 'يوماً')}</h2>
    <div class="muted small">يبدأ — بحسب تقويم أم القرى — يوم ${WEEKDAYS[r.start.getDay()]} ${fmtGreg(r.start)}</div>
    <div class="row wrap" style="margin-top:12px"><a class="btn sm" href="#/prayer/imsakiya">${icon('calendar', 'sm')} إمساكية رمضان ${num(r.year)}</a></div>
  </div>`;
}

function prayerCard(now) {
  if (!S.location) {
    return `<div class="card">
      <div class="card-title">${icon('mosque')} مواقيت الصلاة</div>
      <p class="muted small" style="margin-bottom:12px">حدد موقعك لعرض المواقيت والوقت المتبقي للصلاة القادمة — تُحسب على جهازك دون إنترنت.</p>
      <div class="row wrap"><button class="btn primary sm" data-act="locate">${icon('locate', 'sm')} استخدام موقعي</button><a class="btn sm" href="#/prayer">اختيار مدينة</a></div>
    </div>`;
  }
  const np = nextPrayer(now);
  const t = np.times;
  const keys = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
  return `<a class="card link" href="#/prayer">
    <div class="next-prayer">
      <div class="grow"><div class="muted small">الصلاة القادمة${S.location.name ? ` • ${S.location.name}` : ''}</div>
        <div class="name">${PRAYER_NAMES[np.key]} <span class="muted small">${fmtTime(np.at)}</span></div></div>
      <div class="countdown" style="font-size:1.6rem" id="npCd">--:--</div>
    </div>
    <div class="prayer-strip">${keys.map((k) => `<div class="${k === np.key && !np.tomorrow ? 'now' : ''}">${PRAYER_NAMES[k]}<b>${fmtTime(t[k]).replace(/ [صم]$/, '')}</b></div>`).join('')}</div>
  </a>`;
}

function continueCard() {
  const lr = S.lastRead;
  if (!lr) {
    return `<a class="card link continue" href="#/surah/1">
      <div class="grow"><div class="muted small">ابدأ رحلتك مع القرآن</div><div class="surah">سورة الفاتحة</div><div class="muted small">ابدأ القراءة من أول المصحف</div></div>
      <span class="go">${icon('left')}</span></a>`;
  }
  const s = Q.surahOf(lr.i);
  return `<a class="card link continue" href="${readerHash(lr.k || 'surah', lr.i)}">
    <div class="grow"><div class="muted small">تابع القراءة</div>
      <div class="surah">سورة ${Q.surahName(s)}</div>
      <div class="muted small">الآية ${num(Q.ayahOf(lr.i))} • الجزء ${num(Q.juzOf(lr.i))} • صفحة ${num(Q.pageOf(lr.i))}</div>
      <div class="preview" data-preview="${lr.i}">${Q.isReady() ? Q.text(lr.i) : '&nbsp;'}</div>
    </div>
    <span class="go">${icon('left')}</span></a>`;
}

function khatmaCard() {
  const k = khatmaStatus();
  const st = streak();
  if (!k) {
    return `<div class="card">
      <div class="card-title">${icon('flag')} الختمة والورد اليومي</div>
      <p class="muted small" style="margin-bottom:12px">ضع خطة لختم القرآن وسيقسّم «اقرأ» الورد اليومي عليك ويتابع تقدمك تلقائياً.</p>
      <div class="row wrap"><a class="btn primary sm" href="#/khatma">ابدأ ختمة</a>${st ? `<span class="muted small">${icon('fire', 'sm')} ${plural(st, 'يوم واحد', 'يومان', 'أيام', 'يوماً')} متتالية</span>` : ''}</div>
    </div>`;
  }
  return `<div class="card">
    <div class="row">
      <div class="ring-wrap"><div class="ring" style="--p:${k.pct}"></div><b>${num(Math.round(k.pct))}٪</b></div>
      <div class="grow">
        <div class="card-title" style="margin-bottom:2px">${icon('flag')} ورد اليوم ${k.doneToday ? '<span class="gold">✓</span>' : ''}</div>
        <div class="small">من صفحة ${num(k.todayFrom)} إلى ${num(k.target)}</div>
        <div class="muted tiny">${k.doneToday ? 'أتممت ورد اليوم — بارك الله فيك' : k.behind > 0 ? `متبقٍ ${plural(k.behind, 'صفحة واحدة', 'صفحتان', 'صفحات', 'صفحة')} لإتمام ورد اليوم` : ''}</div>
      </div>
    </div>
    <div class="row" style="margin-top:12px">
      <a class="btn primary sm" href="${readerHash('page', k.resumeAt)}">${icon('book', 'sm')} تابع الورد</a>
      <a class="btn sm" href="#/khatma">التفاصيل</a>
      <span class="spacer"></span>
      ${st ? `<span class="small gold">${icon('fire', 'sm')} ${num(st)}</span>` : ''}
    </div>
  </div>`;
}

function fridayNote(now) {
  if (now.getDay() !== 5) return '';
  return `<a class="card link span" href="#/surah/18" style="border-color:var(--border-strong)">
    <div class="row"><span class="tic" style="width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:var(--hl);color:var(--gold)">${icon('sun')}</span>
    <div class="grow"><b>جمعة مباركة</b><div class="muted small">لا تنسَ قراءة سورة الكهف والإكثار من الصلاة على النبي ﷺ</div></div>${icon('left')}</div>
  </a>`;
}

function verseCard(now) {
  const i = Q.dailyAyah(now);
  return `<div class="card span">
    <div class="card-title">${icon('star')} آية اليوم</div>
    <div class="verse" data-preview="${i}">${Q.isReady() ? Q.text(i) : '<span class="skeleton">ـــــــــــــــــــــــــــ</span>'}</div>
    <div class="verse-ref">سورة ${Q.surahName(Q.surahOf(i))} • ${num(Q.ayahOf(i))}</div>
    <div class="row" style="justify-content:center;margin-top:10px">
      <a class="btn sm" href="${readerHash('surah', i)}">${icon('book', 'sm')} اقرأ في السياق</a>
      <button class="btn sm" data-act="share-verse" data-i="${i}">${icon('share', 'sm')} مشاركة</button>
    </div>
  </div>`;
}

function eventsCard(now) {
  const list = upcoming(now, 3);
  if (!list.length) return '';
  return `<a class="card link span" href="#/calendar">
    <div class="card-title">${icon('calendar')} مناسبات قادمة</div>
    ${list.map((e) => `<div class="event-row${e.major ? ' major' : ''}"><div class="when">${e.days === 0 ? 'اليوم' : e.days === 1 ? 'غداً' : `بعد ${num(e.days)}<br>يوم`}</div><div class="grow"><b>${e.name}</b><div class="muted tiny">${fmtGreg(e.date)}</div></div></div>`).join('')}
  </a>`;
}

function tick() {
  if (!active || document.hidden) return;
  const now = new Date();
  if (dayKey(now) !== renderedDay) { render(); return; }
  const np = $('#npCd');
  if (np && S.location) {
    const p = nextPrayer(now);
    np.textContent = fmtCountdown(p.at - now);
    if (p.at - now < 1000) setTimeout(render, 1200);
  }
  const fc = $('#fastCd');
  if (fc && S.location) {
    const f = fastingTarget(now);
    fc.textContent = fmtCountdown(f.at - now);
    $('#fastLabel').textContent = f.label;
    const kv = $('#fastKv');
    if (!kv.childElementCount) kv.innerHTML = `<div><small>الإمساك</small><b>${fmtTime(f.t.imsak)}</b></div><div><small>الفجر</small><b>${fmtTime(f.t.fajr)}</b></div><div><small>الإفطار</small><b>${fmtTime(f.t.maghrib)}</b></div>`;
  }
}

view.addEventListener('click', async (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (!act) return;
  e.preventDefault();
  if (act === 'install') promptInstall();
  if (act === 'locate') requestLocation();
  if (act === 'ramadan-khatma') {
    const r = ramadanInfo();
    startKhatma(Math.max(1, r.total - r.day + 1));
    toast('بدأت ختمة رمضان — ورد اليوم جاهز');
  }
  if (act === 'share-verse') {
    const i = +e.target.closest('[data-i]').dataset.i;
    await Q.ready();
    share({ title: 'آية اليوم', text: `﴿${Q.text(i)}﴾ [${Q.surahName(Q.surahOf(i))}: ${num(Q.ayahOf(i))}]`, url: `${location.origin}${location.pathname}${readerHash('surah', i)}` });
  }
});

// Fill in Quran text once the data arrives
Q.ready().then(() => {
  view.querySelectorAll('[data-preview]').forEach((el) => { el.textContent = Q.text(+el.dataset.preview); });
}).catch(() => {});

for (const ev of ['location', 'khatma', 'installable', 'settings']) on(ev, () => active && render());
document.addEventListener('visibilitychange', () => active && !document.hidden && tick());
