// Secondary pages: prayer times, more/tools, khatma, tasbeeh, qibla, settings
import { S, save, $, esc, icon, num, on, emit, fmtTime, fmtCountdown, fmtGreg, WEEKDAYS, haptic, plural, streak, replaceAll, dayKey } from './store.js';
import * as Q from './quran.js';
import { METHODS, PRAYER_NAMES, qiblaBearing, distanceToKaaba } from './prayer.js';
import { CITIES, setCity, requestLocation, timesFor, nextPrayer } from './times.js';
import { toHijri, fmtHijri, ramadanInfo, HIJRI_MONTHS } from './hijri.js';
import { khatmaStatus, startKhatma, stopKhatma } from './khatma.js';
import { readerHash } from './reader.js';
import { openSheet, closeSheet, sheetHead, toast, setSetting, THEMES, FONTS, canInstall, promptInstall, isStandalone } from './ui.js';
import * as player from './player.js';

const VERSION = '2.0.0';
let timer = null;
const stopTimer = () => { clearInterval(timer); timer = null; };

const back = (href = '#/more') => `<a class="icon-btn" href="${href}" data-back aria-label="رجوع">${icon('back')}</a>`;

// ================= Prayer =================
const prayerView = $('#v-prayer');

export const prayer = {
  show(arg) {
    renderPrayer();
    stopTimer();
    timer = setInterval(() => {
      const el = $('#ppCd');
      if (!el || document.hidden) return;
      const np = nextPrayer();
      el.textContent = fmtCountdown(np.at - new Date());
    }, 1000);
    if (arg === 'imsakiya') setTimeout(() => $('#imsakiya')?.scrollIntoView({ block: 'start' }), 80);
  },
  leave: stopTimer,
};

function locationPicker() {
  return `
    <div class="row wrap">
      <button class="btn primary sm" data-act="gps">${icon('locate', 'sm')} استخدام موقعي الحالي</button>
    </div>
    <select class="field" data-act="city" style="margin-top:10px" aria-label="اختر مدينة">
      <option value="">— أو اختر مدينة —</option>
      ${CITIES.map((c, k) => `<option value="${k}" ${S.location?.name === c[0] ? 'selected' : ''}>${c[0]}</option>`).join('')}
    </select>`;
}

function renderPrayer() {
  const L = S.location;
  if (!L) {
    prayerView.innerHTML = `
      <div class="vhead"><h1>مواقيت الصلاة</h1></div>
      <div class="card stack">
        <div class="empty" style="padding:10px">${icon('pin')}<p>حدد موقعك لحساب مواقيت الصلاة واتجاه القبلة.<br><span class="small">تُحسب المواقيت على جهازك ولا يُرسل موقعك إلى أي خادم.</span></p></div>
        ${locationPicker()}
      </div>`;
    return;
  }
  const now = new Date();
  const t = timesFor(now);
  const np = nextPrayer(now);
  const keys = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
  if (toHijri(now).m === 9) keys.unshift('imsak');
  const ram = ramadanInfo(now);

  prayerView.innerHTML = `
    <div class="vhead"><h1>مواقيت الصلاة</h1><a class="btn sm" href="#/qibla">${icon('compass', 'sm')} القبلة</a></div>
    <div class="card ramadan-card">
      <div class="muted small">${icon('pin', 'sm')} ${esc(L.name || `${L.lat}, ${L.lng}`)} • ${fmtHijri(toHijri(now))}</div>
      <div class="row" style="margin-top:6px">
        <div class="grow"><div class="muted small">الصلاة القادمة</div><div style="font-size:1.6rem;font-weight:700">${PRAYER_NAMES[np.key]} <span class="muted" style="font-size:1rem">${fmtTime(np.at)}</span></div></div>
        <div class="countdown" id="ppCd">${fmtCountdown(np.at - now)}</div>
      </div>
    </div>
    <div class="card prayer-list" style="margin-top:14px">
      ${keys.map((k) => {
        const cls = k === np.key && !np.tomorrow ? 'next' : t[k] < now ? 'past' : '';
        return `<div class="p ${cls}"><span class="grow">${PRAYER_NAMES[k]}</span><b>${fmtTime(t[k])}</b></div>`;
      }).join('')}
    </div>

    ${ram.days ? imsakiya(ram) : ''}

    <div class="sec-title">${icon('settings', 'sm')} إعدادات الحساب</div>
    <div class="card">
      <div class="setting col">
        <span class="label">طريقة الحساب</span>
        <select class="field" data-act="method">${Object.entries(METHODS).map(([k, m]) => `<option value="${k}" ${S.settings.method === k ? 'selected' : ''}>${m.name}</option>`).join('')}</select>
      </div>
      <div class="setting col">
        <span class="label">حساب العصر</span>
        <div class="seg" data-act="asr">
          <button data-v="std" class="${S.settings.asr === 'std' ? 'on' : ''}">الجمهور</button>
          <button data-v="hanafi" class="${S.settings.asr === 'hanafi' ? 'on' : ''}">الحنفي</button>
        </div>
      </div>
      <div class="setting col"><span class="label">الموقع</span>${locationPicker()}</div>
    </div>
    <p class="muted tiny center" style="margin-top:12px">المواقيت محسوبة فلكياً وقد تختلف دقائق عن تقويم بلدك الرسمي. الإمساك قبل الفجر بعشر دقائق.</p>`;
}

function imsakiya(ram) {
  if (!S.location) return '';
  const todayK = dayKey();
  const rows = ram.days.map((d, k) => {
    const t = timesFor(d);
    return `<tr class="${dayKey(d) === todayK ? 'today' : ''}"><td>${num(k + 1)}</td><td>${WEEKDAYS[d.getDay()].replace('ال', '')} ${num(d.getDate())}/${num(d.getMonth() + 1)}</td><td>${fmtTime(t.imsak).slice(0, -2)}</td><td>${fmtTime(t.fajr).slice(0, -2)}</td><td>${fmtTime(t.dhuhr).slice(0, -2)}</td><td>${fmtTime(t.maghrib).slice(0, -2)}</td><td>${fmtTime(t.isha).slice(0, -2)}</td></tr>`;
  }).join('');
  return `
    <div class="sec-title" id="imsakiya">${icon('moon', 'sm')} إمساكية رمضان ${num(ram.year)} هـ</div>
    <div class="card tight">
      <div class="table-wrap"><table class="imsakiya">
        <thead><tr><th>اليوم</th><th>التاريخ</th><th>الإمساك</th><th>الفجر</th><th>الظهر</th><th>المغرب</th><th>العشاء</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
}

prayerView.addEventListener('click', async (e) => {
  const act = e.target.closest('[data-act]');
  if (!act) return;
  if (act.dataset.act === 'gps') { if (await requestLocation()) renderPrayer(); }
  if (act.dataset.act === 'asr') {
    const v = e.target.closest('[data-v]')?.dataset.v;
    if (v) { S.settings.asr = v; save(); emit('settings', 'asr'); renderPrayer(); }
  }
});
prayerView.addEventListener('change', (e) => {
  const act = e.target.dataset.act;
  if (act === 'city' && e.target.value !== '') { setCity(+e.target.value); renderPrayer(); }
  if (act === 'method') { S.settings.method = e.target.value; save(); emit('settings', 'method'); renderPrayer(); }
});

// ================= More =================
const moreView = $('#v-more');
export const more = {
  show() {
    const k = khatmaStatus();
    const tools = [
      ['#/khatma', 'flag', 'الختمة', k ? `${num(Math.round(k.pct))}٪ — اليوم ${num(k.day)} من ${num(k.days)}` : 'خطة ختم وورد يومي'],
      ['#/index/bookmarks', 'bookmark', 'العلامات', S.bookmarks.length ? plural(S.bookmarks.length, 'علامة واحدة', 'علامتان', 'علامات', 'علامة') : 'الآيات المحفوظة'],
      ['#/tasbeeh', 'beads', 'المسبحة', `المجموع ${num(S.tasbeeh.total)}`],
      ['#/qibla', 'compass', 'اتجاه القبلة', 'بوصلة نحو الكعبة المشرفة'],
      ['#/prayer/imsakiya', 'moon', 'إمساكية رمضان', 'مواعيد الإمساك والإفطار'],
      ['#/calendar', 'calendar', 'التقويم الهجري', 'المناسبات وتحويل التاريخ'],
      ['#/settings', 'settings', 'الإعدادات', 'المظهر والخط والقارئ'],
    ];
    moreView.innerHTML = `
      <div class="vhead"><h1>المزيد</h1></div>
      <div class="stat-grid">
        <div class="stat"><b>${num(streak())}</b><small>أيام متتالية</small></div>
        <div class="stat"><b>${num(S.khatmaDone || 0)}</b><small>ختمات مكتملة</small></div>
        <div class="stat"><b>${num(S.days.length)}</b><small>أيام قراءة</small></div>
      </div>
      <div class="sec-title">الأدوات</div>
      <div class="tools">
        ${tools.map(([href, ic, t, sub]) => `<a class="tool" href="${href}"><span class="tic">${icon(ic)}</span><b>${t}</b><small>${sub}</small></a>`).join('')}
        ${canInstall() ? `<button class="tool" data-act="install"><span class="tic">${icon('phone')}</span><b>تثبيت التطبيق</b><small>على الشاشة الرئيسية</small></button>` : ''}
        <button class="tool" data-act="about"><span class="tic">${icon('info')}</span><b>عن التطبيق</b><small>الإصدار ${num(VERSION)}</small></button>
      </div>
      <footer class="footer">Powered By <b>Hadi Koubaissi</b></footer>`;
  },
};
moreView.addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'install') promptInstall();
  if (act === 'about') aboutSheet();
});

function aboutSheet() {
  openSheet(`
    ${sheetHead('عن «اقرأ»')}
    <div class="stack">
      <div class="row"><img src="icons/icon-192.png" width="56" height="56" style="border-radius:16px" alt=""><div><b style="font-family:var(--display);font-size:1.5rem;color:var(--gold)">اقرأ</b><div class="muted small">الإصدار ${num(VERSION)}${isStandalone() ? ' • مثبّت' : ''}</div></div></div>
      <p class="small">تطبيق ويب لقراءة القرآن الكريم والاستماع إليه، يعمل على جميع الأجهزة ويمكن تثبيته واستخدامه دون إنترنت.</p>
      <div class="small muted">
        • نص المصحف: مشروع تنزيل (رسم عثماني)<br>
        • التلاوات والتفاسير: AlQuran.cloud و Islamic Network CDN<br>
        • التقويم: أم القرى • المواقيت: خوارزمية PrayTimes
      </div>
      <p class="center">Powered By <b class="gold">Hadi Koubaissi</b></p>
    </div>`);
}

// ================= Khatma =================
const khatmaView = $('#v-khatma');
let planDays = 30, fromHere = false;
export const khatma = {
  show() { renderKhatma(); },
};

function renderKhatma() {
  const k = khatmaStatus();
  if (!k) {
    const ram = ramadanInfo();
    const ramDays = ram.inRamadan ? Math.max(1, ram.total - ram.day + 1) : 0;
    const opts = [3, 7, 10, 15, 20, 30, 40, 60, 90];
    khatmaView.innerHTML = `
      <div class="vhead">${back()}<h1>ختمة جديدة</h1></div>
      ${ramDays ? `<div class="card ramadan-card" style="margin-bottom:14px"><h2 style="font-size:1.3rem">ختمة رمضان</h2><p class="small muted">أتمّ الختمة قبل نهاية الشهر: ${plural(ramDays, 'يوم واحد', 'يومان', 'أيام', 'يوماً')} — نحو ${num(Math.ceil(604 / ramDays))} صفحة يومياً.</p><button class="btn primary sm" style="margin-top:10px" data-days="${ramDays}" data-act="start">ابدأ ختمة رمضان</button></div>` : ''}
      <div class="card stack">
        <div class="label">في كم يوماً تريد أن تختم؟</div>
        <div class="chips" id="kDays">${opts.map((d) => `<button class="chip" data-d="${d}" aria-pressed="${d === planDays}">${num(d)} يوماً</button>`).join('')}</div>
        <div class="stat-grid" id="kInfo"></div>
        <label class="setting" style="border:0;padding:0"><div class="grow"><div class="label">ابدأ من موضع قراءتي الحالي</div><div class="hint">${S.lastRead ? `سورة ${Q.surahName(Q.surahOf(S.lastRead.i))} — الآية ${num(Q.ayahOf(S.lastRead.i))}` : 'من سورة الفاتحة'}</div></div><span class="switch"><input type="checkbox" id="kHere" ${fromHere ? 'checked' : ''} ${S.lastRead ? '' : 'disabled'}><span></span></span></label>
        <button class="btn primary block" data-act="start">${icon('flag', 'sm')} ابدأ الختمة</button>
      </div>
      <p class="muted tiny center" style="margin-top:12px">يتقدم موضع الختمة تلقائياً أثناء القراءة المتتابعة أو الاستماع، ويمكنك تعيينه يدوياً من خيارات أي آية.</p>`;
    updatePlanInfo();
    return;
  }
  const juzDone = Q.JUZ.filter((s, j) => k.page >= Q.pageOf((Q.JUZ[j + 1] ?? Q.TOTAL_AYAHS) - 1)).length;
  khatmaView.innerHTML = `
    <div class="vhead">${back()}<h1>ختمتي</h1></div>
    <div class="card center">
      <div class="ring-wrap" style="margin:6px auto 10px"><div class="ring" style="--p:${k.pct};--size:150px"></div><b style="font-size:1.8rem">${num(k.pct)}٪</b></div>
      <div class="muted small">اليوم ${num(k.day)} من ${num(k.days)} • تنتهي ${fmtGreg(k.endDate)}</div>
      <div style="margin:14px 0 6px;font-size:1.1rem">ورد اليوم: <b class="gold">صفحة ${num(k.todayFrom)} ← ${num(k.target)}</b></div>
      <div class="muted small">${k.doneToday ? 'أتممت ورد اليوم ✓' : `متبقٍ ${plural(k.behind, 'صفحة واحدة', 'صفحتان', 'صفحات', 'صفحة')}`}</div>
      <div class="progress" style="margin:16px 0 4px"><i style="width:${k.pct}%"></i></div>
      <div class="row" style="justify-content:space-between" ><span class="tiny muted">موضعك: صفحة ${num(k.page || 1)}</span><span class="tiny muted">${num(k.perDay)} صفحة/يوم</span></div>
      <a class="btn primary block" style="margin-top:16px" href="${readerHash('page', k.resumeAt)}">${icon('book', 'sm')} تابع الورد</a>
    </div>
    <div class="stat-grid" style="margin-top:14px">
      <div class="stat"><b>${num(juzDone)}</b><small>أجزاء مكتملة</small></div>
      <div class="stat"><b>${num(streak())}</b><small>أيام متتالية</small></div>
      <div class="stat"><b>${num(S.khatmaDone || 0)}</b><small>ختمات سابقة</small></div>
    </div>
    <div class="sec-title">الأجزاء</div>
    <div class="juz-grid" style="grid-template-columns:repeat(auto-fill,minmax(64px,1fr))">
      ${Q.JUZ.map((s, j) => { const done = j < juzDone; return `<a class="juz-card center${done ? ' done' : ''}" href="#/juz/${j + 1}" style="padding:10px 4px"><div class="n">${done ? icon('check', 'sm') : num(j + 1)}</div></a>`; }).join('')}
    </div>
    <button class="btn danger block" style="margin-top:20px" data-act="stop">${icon('trash', 'sm')} إلغاء الختمة الحالية</button>`;
}

function updatePlanInfo() {
  const info = $('#kInfo');
  if (!info) return;
  const ppd = 604 / planDays;
  info.innerHTML = `
    <div class="stat"><b>${num(Math.ceil(ppd))}</b><small>صفحة يومياً</small></div>
    <div class="stat"><b>${num(Math.round((30 / planDays) * 10) / 10)}</b><small>جزء يومياً</small></div>
    <div class="stat"><b>${num(Math.ceil(ppd / 5))}</b><small>صفحات بعد كل صلاة</small></div>`;
}

khatmaView.addEventListener('click', (e) => {
  const d = e.target.closest('[data-d]');
  if (d) {
    planDays = +d.dataset.d;
    khatmaView.querySelectorAll('#kDays .chip').forEach((c) => c.setAttribute('aria-pressed', c === d));
    updatePlanInfo();
    return;
  }
  const act = e.target.closest('[data-act]');
  if (!act) return;
  if (act.dataset.act === 'start') {
    const days = +(act.dataset.days || planDays);
    fromHere = $('#kHere')?.checked;
    startKhatma(days, fromHere && S.lastRead ? S.lastRead.i : 0);
    toast('بدأت الختمة — وفقك الله');
    renderKhatma();
  }
  if (act.dataset.act === 'stop') {
    openSheet(`${sheetHead('إلغاء الختمة؟')}<p class="muted">سيُحذف تقدم الختمة الحالية. لا يمكن التراجع.</p><div class="row" style="margin-top:16px"><button class="btn danger" id="kStop">نعم، إلغاء</button><button class="btn" data-close>تراجع</button></div>`)
      .querySelector('#kStop').onclick = () => { stopKhatma(); closeSheet(); renderKhatma(); };
  }
});

// ================= Tasbeeh =================
const tasbeehView = $('#v-tasbeeh');
const PHRASES = ['سُبْحَانَ اللهِ', 'الحَمْدُ لِلَّهِ', 'اللهُ أَكْبَرُ', 'لَا إِلَهَ إِلَّا اللهُ', 'أَسْتَغْفِرُ اللهَ', 'سُبْحَانَ اللهِ وَبِحَمْدِهِ', 'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللهِ', 'اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَآلِ مُحَمَّدٍ'];
const TARGETS = [33, 34, 100, 1000, 0];

export const tasbeeh = {
  show() {
    const T = S.tasbeeh;
    tasbeehView.innerHTML = `
      <div class="vhead">${back()}<h1>المسبحة</h1><button class="icon-btn" data-act="reset" aria-label="تصفير">${icon('reset')}</button></div>
      <div class="chips scroll" id="tPh">${PHRASES.map((p, k) => `<button class="chip" data-p="${k}" aria-pressed="${k === T.phrase}">${p}</button>`).join('')}</div>
      <div class="tasbeeh-phrase" id="tPhrase" style="margin-top:18px">${PHRASES[T.phrase]}</div>
      <button class="bead" id="tBead" aria-label="تسبيح"><span class="count" id="tCount">${num(T.count)}</span><span class="of" id="tOf"></span></button>
      <div class="chips" id="tTg" style="justify-content:center">${TARGETS.map((t) => `<button class="chip" data-t="${t}" aria-pressed="${t === T.target}">${t ? num(t) : '∞'}</button>`).join('')}</div>
      <p class="center muted small" style="margin-top:16px">مجموع التسبيحات: <b class="gold" id="tTotal">${num(T.total)}</b></p>
      <p class="center muted tiny">اضغط الدائرة أو زر المسافة للتسبيح • تهتز عند إتمام العدد</p>`;
    updateBead();
  },
};

function updateBead() {
  const T = S.tasbeeh;
  $('#tCount').textContent = num(T.count);
  $('#tOf').textContent = T.target ? `من ${num(T.target)}` : '';
  $('#tBead').style.setProperty('--p', T.target ? (T.count / T.target) * 100 : (T.count % 100));
  $('#tTotal').textContent = num(T.total);
}

function count() {
  const T = S.tasbeeh;
  T.count++; T.total++;
  if (T.target && T.count >= T.target) {
    haptic([60, 40, 60]);
    const bead = $('#tBead');
    bead.classList.remove('pulse'); void bead.offsetWidth; bead.classList.add('pulse');
    toast(`أتممت ${num(T.target)} — ${PHRASES[T.phrase]}`);
    T.count = 0;
  } else haptic(10);
  save();
  updateBead();
}

tasbeehView.addEventListener('click', (e) => {
  if (e.target.closest('#tBead')) return count();
  const T = S.tasbeeh;
  const p = e.target.closest('[data-p]');
  if (p) {
    T.phrase = +p.dataset.p; T.count = 0; save();
    tasbeehView.querySelectorAll('[data-p]').forEach((b) => b.setAttribute('aria-pressed', b === p));
    $('#tPhrase').textContent = PHRASES[T.phrase];
    updateBead();
  }
  const t = e.target.closest('[data-t]');
  if (t) {
    T.target = +t.dataset.t; T.count = 0; save();
    tasbeehView.querySelectorAll('[data-t]').forEach((b) => b.setAttribute('aria-pressed', b === t));
    updateBead();
  }
  if (e.target.closest('[data-act="reset"]')) { T.count = 0; save(); updateBead(); toast('تم التصفير'); }
});
addEventListener('keydown', (e) => {
  if (tasbeehView.hidden || e.target.closest('input, textarea, select')) return;
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); count(); }
});

// ================= Qibla =================
const qiblaView = $('#v-qibla');
let orientationHandler = null, aligned = false;
export const qibla = {
  show() { renderQibla(); },
  leave() {
    if (orientationHandler) {
      removeEventListener('deviceorientationabsolute', orientationHandler);
      removeEventListener('deviceorientation', orientationHandler);
      orientationHandler = null;
    }
  },
};

function renderQibla() {
  const L = S.location;
  if (!L) {
    qiblaView.innerHTML = `<div class="vhead">${back()}<h1>اتجاه القبلة</h1></div>
      <div class="card stack"><div class="empty" style="padding:10px">${icon('compass')}<p>حدد موقعك لمعرفة اتجاه القبلة</p></div>${locationPicker()}</div>`;
    return;
  }
  const bearing = qiblaBearing(L.lat, L.lng);
  const dirs = ['ش', 'ق', 'ج', 'غ'];
  qiblaView.innerHTML = `
    <div class="vhead">${back()}<h1>اتجاه القبلة</h1></div>
    <div class="card center">
      <div class="compass" id="qCompass">
        <div class="dial" id="qDial">${dirs.map((d, k) => `<span class="${k === 0 ? 'n' : ''}" style="rotate:${k * 90}deg">${d}</span>`).join('')}</div>
        <div class="needle" id="qNeedle" style="transform:rotate(${bearing}deg)"><div class="kaaba"></div></div>
        <div class="center"></div>
      </div>
      <div style="font-size:2rem;font-weight:700" class="gold">${num(Math.round(bearing))}°</div>
      <div class="muted small">من الشمال باتجاه عقارب الساعة • المسافة إلى مكة ${num(distanceToKaaba(L.lat, L.lng).toLocaleString('en'))} كم</div>
      <p class="small" id="qHint" style="margin-top:12px">ضع الجهاز بشكل مسطح بعيداً عن المعادن.</p>
      <button class="btn primary" id="qStart" style="margin-top:10px">${icon('compass', 'sm')} تفعيل البوصلة</button>
    </div>`;
  $('#qStart').onclick = () => startCompass(bearing);
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission !== 'function') startCompass(bearing, true);
}

async function startCompass(bearing, silent = false) {
  try {
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') { toast('لم يُسمح بالوصول إلى البوصلة'); return; }
    }
  } catch { return; }
  qibla.leave();
  let got = false;
  orientationHandler = (e) => {
    let heading = null;
    if (typeof e.webkitCompassHeading === 'number') heading = e.webkitCompassHeading;
    else if (e.absolute && e.alpha != null) heading = 360 - e.alpha;
    if (heading == null) return;
    got = true;
    const dial = $('#qDial'), needle = $('#qNeedle');
    if (!dial) return;
    dial.style.transform = `rotate(${-heading}deg)`;
    needle.style.transform = `rotate(${bearing - heading}deg)`;
    const diff = Math.abs(((bearing - heading + 540) % 360) - 180);
    const ok = diff < 4;
    $('#qCompass').classList.toggle('aligned', ok);
    $('#qHint').textContent = ok ? 'أنت باتجاه القبلة ✓' : 'أدر الجهاز حتى يشير السهم إلى الأعلى';
    if (ok && !aligned) haptic(40);
    aligned = ok;
  };
  addEventListener('deviceorientationabsolute', orientationHandler);
  addEventListener('deviceorientation', orientationHandler);
  $('#qStart').hidden = true;
  setTimeout(() => {
    if (!got && $('#qHint')) {
      $('#qHint').textContent = 'لا تتوفر بوصلة في هذا الجهاز — استخدم الزاوية الموضحة مع اتجاه الشمال.';
      if (!silent) $('#qStart').hidden = false;
    }
  }, 2000);
}

// ================= Settings =================
const settingsView = $('#v-settings');
export const settings = {
  show() { renderSettings(); },
};

const toggleRow = (key, label, hint = '') => `
  <label class="setting"><div class="grow"><div class="label">${label}</div>${hint ? `<div class="hint">${hint}</div>` : ''}</div>
  <span class="switch"><input type="checkbox" data-key="${key}" ${S.settings[key] ? 'checked' : ''}><span></span></span></label>`;

function renderSettings() {
  const st = S.settings;
  settingsView.innerHTML = `
    <div class="vhead">${back()}<h1>الإعدادات</h1></div>

    <div class="sec-title">المظهر</div>
    <div class="card">
      <div class="theme-swatches" data-group="theme">${THEMES.map(([k, name, bg, fg]) => `<button data-v="${k}" class="${st.theme === k ? 'on' : ''}" style="background:${bg};color:${fg}">${name}</button>`).join('')}</div>
      <div class="setting col" style="margin-top:8px">
        <span class="label">خط المصحف</span>
        <div class="chips" data-group="font">${Object.entries(FONTS).map(([k, f]) => `<button class="chip" data-v="${k}" aria-pressed="${st.font === k}">${f.name}</button>`).join('')}</div>
      </div>
      <div class="setting col">
        <div class="row"><span class="label grow">حجم خط المصحف</span><b class="gold" id="sSizeV">${num(st.fontSize)}</b></div>
        <input type="range" id="sSize" min="18" max="52" value="${st.fontSize}" aria-label="حجم الخط">
        <div class="font-preview">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div>
      </div>
      <div class="setting col">
        <span class="label">طريقة عرض المصحف</span>
        <div class="seg" data-group="mode"><button data-v="flow" class="${st.mode === 'flow' ? 'on' : ''}">مصحف متصل</button><button data-v="cards" class="${st.mode === 'cards' ? 'on' : ''}">آيات منفصلة</button></div>
      </div>
      <div class="setting col">
        <span class="label">الأرقام</span>
        <div class="seg" data-group="digits"><button data-v="ar" class="${st.digits === 'ar' ? 'on' : ''}">٠١٢٣</button><button data-v="en" class="${st.digits === 'en' ? 'on' : ''}">0123</button></div>
      </div>
    </div>

    <div class="sec-title">التلاوة</div>
    <div class="card">
      <div class="setting col"><span class="label">القارئ الافتراضي</span>
        <select class="field" id="sReciter">${Q.RECITERS.map(([id, name]) => `<option value="${id}" ${st.reciter === id ? 'selected' : ''}>${name}</option>`).join('')}</select></div>
      ${toggleRow('basmala', 'البسملة في بداية السور', 'تشغيل البسملة قبل الآية الأولى من كل سورة')}
      ${toggleRow('follow', 'تتبع الآية المسموعة', 'تمرير المصحف تلقائياً أثناء التلاوة')}
    </div>

    <div class="sec-title">القراءة</div>
    <div class="card">
      ${toggleRow('wakeLock', 'إبقاء الشاشة مضاءة', 'أثناء القراءة في المصحف')}
      ${toggleRow('haptics', 'الاهتزاز', 'في المسبحة والتنبيهات')}
      <div class="setting col"><span class="label">التفسير الافتراضي</span>
        <div class="chips" data-group="tafsir">${Q.TAFSIRS.map(([id, name]) => `<button class="chip" data-v="${id}" aria-pressed="${st.tafsir === id}">${name}</button>`).join('')}</div></div>
    </div>

    <div class="sec-title">التقويم ورمضان</div>
    <div class="card">
      <div class="setting col"><span class="label">ضبط التاريخ الهجري</span>
        <div class="seg" data-group="hijriAdj">${[-2, -1, 0, 1, 2].map((v) => `<button data-v="${v}" class="${st.hijriAdj === v ? 'on' : ''}">${v > 0 ? '+' : ''}${num(v)}</button>`).join('')}</div>
        <div class="hint">اليوم: ${fmtHijri(toHijri(new Date()))}</div></div>
      <div class="setting col"><span class="label">وضع رمضان</span>
        <div class="seg" data-group="ramadan"><button data-v="auto" class="${st.ramadan === 'auto' ? 'on' : ''}">تلقائي</button><button data-v="on" class="${st.ramadan === 'on' ? 'on' : ''}">دائماً</button><button data-v="off" class="${st.ramadan === 'off' ? 'on' : ''}">إيقاف</button></div>
        <div class="hint">يُظهر بطاقة الإفطار والإمساك وأدعية رمضان في الرئيسية</div></div>
    </div>

    <div class="sec-title">البيانات</div>
    <div class="card">
      <div class="setting"><div class="grow"><div class="label">نسخة احتياطية</div><div class="hint">العلامات والختمة والإعدادات</div></div>
        <button class="btn sm" data-act="export">${icon('download', 'sm')} تصدير</button>
        <label class="btn sm">استيراد<input type="file" accept="application/json" id="sImport" hidden></label></div>
      <div class="setting"><div class="grow"><div class="label">تحميل البحث للعمل دون إنترنت</div><div class="hint">فهرس البحث في نص القرآن (~٢٠٠ ك.ب)</div></div>
        <button class="btn sm" data-act="offline-search">تحميل</button></div>
      <div class="setting"><div class="grow"><div class="label danger" style="color:var(--danger)">مسح جميع البيانات</div><div class="hint">إعادة التطبيق إلى حالته الأولى</div></div>
        <button class="btn sm danger" data-act="reset">مسح</button></div>
    </div>
    <footer class="footer">اقرأ ${num(VERSION)} • Powered By <b>Hadi Koubaissi</b></footer>`;
}

settingsView.addEventListener('click', async (e) => {
  const grp = e.target.closest('[data-group]');
  const v = e.target.closest('[data-v]')?.dataset.v;
  if (grp && v != null) {
    const key = grp.dataset.group;
    const value = key === 'hijriAdj' ? +v : v;
    setSetting(key, value);
    renderSettings();
    return;
  }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'export') {
    const blob = new Blob([JSON.stringify({ app: 'okraa', v: 2, data: S }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `okraa-backup-${dayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  if (act === 'offline-search') {
    try { await Q.searchAyahs('الله', 1); toast('أصبح البحث متاحاً دون إنترنت'); }
    catch { toast('تعذر التحميل — تحقق من الاتصال'); }
  }
  if (act === 'reset') {
    openSheet(`${sheetHead('مسح جميع البيانات؟')}<p class="muted">ستُحذف العلامات والختمة والإعدادات وموضع القراءة.</p><div class="row" style="margin-top:16px"><button class="btn danger" id="sReset">مسح</button><button class="btn" data-close>تراجع</button></div>`)
      .querySelector('#sReset').onclick = () => { replaceAll(); location.replace(location.pathname); };
  }
});

settingsView.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset.key) { setSetting(t.dataset.key, t.checked); if (t.dataset.key === 'basmala') player.refreshQueue(); }
  if (t.id === 'sReciter') { player.setReciter(t.value); toast('تم تغيير القارئ'); }
  if (t.id === 'sSize') setSetting('fontSize', +t.value);
  if (t.id === 'sImport' && t.files[0]) {
    try {
      const j = JSON.parse(await t.files[0].text());
      if (j.app !== 'okraa' || !j.data?.settings) throw new Error('bad');
      replaceAll(j.data);
      toast('تم الاستيراد — جارٍ إعادة التحميل');
      setTimeout(() => location.reload(), 800);
    } catch { toast('ملف غير صالح'); }
  }
});
settingsView.addEventListener('input', (e) => {
  if (e.target.id === 'sSize') {
    document.documentElement.style.setProperty('--qsize', e.target.value + 'px');
    $('#sSizeV').textContent = num(e.target.value);
  }
});

// Shared location changes refresh dependent pages
on('location', () => {
  if (!prayerView.hidden) renderPrayer();
  if (!qiblaView.hidden) renderQibla();
});
for (const v of [qiblaView]) v.addEventListener('change', (e) => { if (e.target.dataset.act === 'city' && e.target.value !== '') setCity(+e.target.value); });
qiblaView.addEventListener('click', (e) => { if (e.target.closest('[data-act="gps"]')) requestLocation(); });
