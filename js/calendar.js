// Hijri calendar view
import { S, save, $, icon, num, on, fmtGreg, GREG_MONTHS, WEEKDAYS, dayKey, emit } from './store.js';
import { toHijri, fmtHijri, monthOf, nextMonthDate, prevMonthDate, eventsOn, isWhiteDay, upcoming, HIJRI_MONTHS, clearHijriCache } from './hijri.js';
import { openSheet, sheetHead } from './ui.js';
import { timesFor } from './times.js';
import { PRAYER_NAMES } from './prayer.js';
import { fmtTime } from './store.js';

const view = $('#v-calendar');
let anchor = new Date(), selected = new Date();
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5]; // Saturday first

export function show() {
  anchor = new Date();
  selected = new Date();
  render();
}

function render() {
  const month = monthOf(anchor);
  const todayK = dayKey();
  const first = month.days[0], last = month.days[month.days.length - 1];
  const gregRange = first.getMonth() === last.getMonth()
    ? `${GREG_MONTHS[first.getMonth()]} ${num(first.getFullYear())}`
    : `${GREG_MONTHS[first.getMonth()]} – ${GREG_MONTHS[last.getMonth()]} ${num(last.getFullYear())}`;
  const lead = WEEK_ORDER.indexOf(first.getDay());

  let cells = WEEK_ORDER.map((d) => `<div class="wd">${WEEKDAYS[d].replace('ال', '')}</div>`).join('');
  cells += '<div></div>'.repeat(lead);
  for (const d of month.days) {
    const h = toHijri(d);
    const cls = ['d'];
    if (dayKey(d) === todayK) cls.push('today');
    if (dayKey(d) === dayKey(selected)) cls.push('sel');
    if (d.getDay() === 5) cls.push('fri');
    if (isWhiteDay(h)) cls.push('white');
    if (eventsOn(h).length) cls.push('ev');
    if (h.m === 9) cls.push('ramadan');
    cells += `<button class="${cls.join(' ')}" data-k="${dayKey(d)}" aria-label="${fmtHijri(h)} — ${fmtGreg(d)}"><b>${num(h.d)}</b><small>${num(d.getDate())}${d.getDate() === 1 ? ' ' + GREG_MONTHS[d.getMonth()].slice(0, 3) : ''}</small></button>`;
  }

  const sh = toHijri(selected);
  const evs = eventsOn(sh);
  const st = timesFor(selected);
  view.innerHTML = `
    <div class="vhead"><h1>التقويم الهجري</h1>
      <button class="btn sm" data-act="today">اليوم</button>
      <button class="icon-btn" data-act="adjust" aria-label="ضبط التاريخ">${icon('settings')}</button></div>
    <div class="card">
      <div class="cal-head">
        <button class="icon-btn" data-act="prev" aria-label="الشهر السابق">${icon('right')}</button>
        <div class="grow"><h2>${HIJRI_MONTHS[month.m - 1]} ${num(month.y)} هـ</h2><small>${gregRange} • ${num(month.days.length)} يوماً</small></div>
        <button class="icon-btn" data-act="next" aria-label="الشهر التالي">${icon('left')}</button>
      </div>
      <div class="cal" id="calGrid">${cells}</div>
      <div class="legend">
        <span><i style="background:var(--gold)"></i>اليوم</span>
        <span><i style="background:var(--gold);border-radius:50%;width:7px;height:7px"></i>مناسبة</span>
        <span><i style="background:color-mix(in srgb, var(--surface-2) 70%, var(--text) 10%)"></i>الأيام البيض</span>
        <span class="gold">الجمعة</span>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="card-title">${icon('calendar')} ${WEEKDAYS[selected.getDay()]} ${fmtHijri(sh)}</div>
      <div class="muted small">${fmtGreg(selected)}${S.settings.hijriAdj ? ` • تعديل ${num(Math.abs(S.settings.hijriAdj))} يوم ${S.settings.hijriAdj > 0 ? 'إضافة' : 'طرح'}` : ''}</div>
      ${evs.map((e) => `<div class="event-row${e.major ? ' major' : ''}" style="padding-bottom:0;border:0"><div class="when">${icon('star', 'sm')}</div><b class="grow">${e.name}</b></div>`).join('')}
      ${isWhiteDay(sh) ? '<div class="muted small" style="margin-top:8px">من الأيام البيض (يُستحب صيامها)</div>' : ''}
      ${st ? `<div class="prayer-strip">${['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].map((k) => `<div>${PRAYER_NAMES[k]}<b>${fmtTime(st[k]).replace(/ [صم]$/, '')}</b></div>`).join('')}</div>` : ''}
    </div>

    <div class="sec-title">${icon('star', 'sm')} المناسبات القادمة</div>
    <div class="card tight">${upcoming(new Date(), 13).map((e) => `
      <div class="event-row${e.major ? ' major' : ''}">
        <div class="when">${e.days === 0 ? 'اليوم' : e.days === 1 ? 'غداً' : `بعد ${num(e.days)}<br>يوم`}</div>
        <div class="grow"><b>${e.name}</b><div class="muted tiny">${fmtHijri(toHijri(e.date))} • ${WEEKDAYS[e.date.getDay()]} ${fmtGreg(e.date)}</div></div>
      </div>`).join('')}</div>

    <div class="sec-title">${icon('reset', 'sm')} تحويل التاريخ</div>
    <div class="card">
      <label class="small muted" for="convDate">اختر تاريخاً ميلادياً</label>
      <input class="field" type="date" id="convDate" value="${dayKey(selected)}" style="margin-top:6px">
      <div id="convOut" class="hijri-big" style="font-size:1.4rem;margin-top:10px">${fmtHijri(sh)}</div>
    </div>
    <p class="muted tiny center" style="margin-top:14px">التقويم مبني على حساب أم القرى، وقد يختلف يوماً عن رؤية الهلال في بلدك — يمكنك ضبطه من زر الإعدادات أعلاه.</p>`;
}

view.addEventListener('click', (e) => {
  const day = e.target.closest('[data-k]');
  if (day) {
    const [y, m, d] = day.dataset.k.split('-').map(Number);
    selected = new Date(y, m - 1, d);
    render();
    return;
  }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'prev') { anchor = prevMonthDate(monthOf(anchor)); render(); }
  if (act === 'next') { anchor = nextMonthDate(monthOf(anchor)); render(); }
  if (act === 'today') { anchor = new Date(); selected = new Date(); render(); }
  if (act === 'adjust') adjustSheet();
});

view.addEventListener('change', (e) => {
  if (e.target.id !== 'convDate' || !e.target.value) return;
  const [y, m, d] = e.target.value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  $('#convOut').textContent = `${WEEKDAYS[date.getDay()]} ${fmtHijri(toHijri(date))}`;
});

export function adjustSheet() {
  const body = openSheet(`
    ${sheetHead('ضبط التاريخ الهجري', 'لمطابقة إعلان رؤية الهلال في بلدك')}
    <div class="seg" id="adj">${[-2, -1, 0, 1, 2].map((v) => `<button data-v="${v}" class="${S.settings.hijriAdj === v ? 'on' : ''}">${v > 0 ? '+' : ''}${num(v)}</button>`).join('')}</div>
    <p class="muted small" style="margin-top:12px">اليوم بعد الضبط: <b class="gold" id="adjOut">${fmtHijri(toHijri(new Date()))}</b></p>`);
  body.querySelector('#adj').onclick = (e) => {
    const v = e.target.closest('[data-v]')?.dataset.v;
    if (v == null) return;
    S.settings.hijriAdj = +v;
    save();
    clearHijriCache();
    body.querySelectorAll('#adj button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    body.querySelector('#adjOut').textContent = fmtHijri(toHijri(new Date()));
    emit('settings', 'hijriAdj');
  };
}

on('settings', (k) => { if (!view.hidden && (k === 'hijriAdj' || k === 'digits')) render(); });
