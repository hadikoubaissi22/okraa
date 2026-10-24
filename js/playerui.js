// Mini player bar + playback options sheet
import { S, save, $, icon, num, on, emit, markActiveDay } from './store.js';
import * as Q from './quran.js';
import * as player from './player.js';
import { openSheet, sheetHead, toast, isSheetOpen, sheetBody } from './ui.js';
import { touchKhatma } from './khatma.js';
import { readerHash } from './reader.js';

const mini = $('#mini');
const playBtn = $('#miniPlay');
const P = player.P;
let sheetOpen = false;

export function updateMini() {
  const reading = document.body.classList.contains('reading');
  const visible = player.hasSession() || (reading && Q.isReady());
  mini.hidden = !visible;
  document.body.classList.toggle('has-mini', visible);
  if (!visible) return;
  const i = P.i ?? null;
  if (i != null) {
    const s = Q.surahOf(i);
    $('#miniTitle').textContent = P.basmala ? `سورة ${Q.surahName(s)} • البسملة` : `سورة ${Q.surahName(s)} • الآية ${num(Q.ayahOf(i))}`;
  } else {
    $('#miniTitle').textContent = 'استمع إلى التلاوة';
  }
  const badges = [];
  if (S.settings.rep !== 1) badges.push(S.settings.rep === 0 ? 'تكرار ∞' : `تكرار ×${num(S.settings.rep)}`);
  if (S.settings.repSurah) badges.push('تكرار السورة');
  if (S.settings.speed !== 1) badges.push(`${num(S.settings.speed)}×`);
  if (P.sleepEnd) badges.push('مؤقت');
  $('#miniSub').innerHTML = `${Q.reciterName(S.settings.reciter)}${badges.map((b) => `<span class="badge">${b}</span>`).join('')}`;
  playBtn.innerHTML = icon(P.playing ? 'pause' : 'play', 'fill');
  playBtn.setAttribute('aria-label', P.playing ? 'إيقاف مؤقت' : 'تشغيل');
  playBtn.classList.toggle('loading', P.loading && P.playing !== false);
}

playBtn.onclick = () => {
  if (P.i == null && document.body.classList.contains('reading')) {
    const first = document.querySelector('#rBody [data-i]');
    player.play(first ? +first.dataset.i : 0);
  } else player.toggle();
};
$('#miniNext').onclick = () => player.next();
$('#miniPrev').onclick = () => player.prev();
$('#miniMore').onclick = () => playerSheet();
const info = $('#miniInfo');
info.onclick = () => {
  if (P.i == null) return playerSheet();
  const reading = document.body.classList.contains('reading');
  if (!reading) location.hash = readerHash(S.lastRead?.k || 'surah', P.i);
  else playerSheet();
};
info.onkeydown = (e) => { if (e.key === 'Enter') info.click(); };

const bar = $('#miniBar');
bar.onclick = (e) => {
  const r = bar.getBoundingClientRect();
  player.seek(Math.min(1, Math.max(0, (r.right - e.clientX) / r.width)));
};

on('player', () => { updateMini(); if (sheetOpen) refreshSheet(); });
on('ptime', ({ t, d }) => { bar.firstElementChild.style.width = d ? `${(t / d) * 100}%` : '0'; });
on('heard', (i) => { touchKhatma(i); markActiveDay(); });
on('player-error', () => toast('تعذر تشغيل التلاوة — تحقق من اتصالك بالإنترنت'));
on('khatm', () => toast('صدق الله العظيم — اكتملت التلاوة'));

// --- Options sheet ---
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75];
const REPS = [1, 2, 3, 5, 10, 0];
const SLEEP = [[0, 'إيقاف'], [15, '١٥ د'], [30, '٣٠ د'], [60, 'ساعة'], ['surah', 'نهاية السورة']];

function sheetHTML() {
  const st = S.settings;
  const sleepLeft = P.sleepEnd > 0 ? Math.max(1, Math.round((P.sleepEnd - Date.now()) / 60000)) : 0;
  return `
    ${sheetHead('التلاوة', P.i != null ? `سورة ${Q.surahName(Q.surahOf(P.i))} • الآية ${num(Q.ayahOf(P.i))}` : '')}
    <div class="stack">
      <div class="setting col"><span class="label">${icon('headphones', 'sm')} القارئ</span>
        <select class="field" id="pReciter">${Q.RECITERS.map(([id, name]) => `<option value="${id}" ${st.reciter === id ? 'selected' : ''}>${name}</option>`).join('')}</select></div>
      <div class="setting col"><span class="label">${icon('speed', 'sm')} سرعة التلاوة</span>
        <div class="chips" id="pSpeed">${SPEEDS.map((v) => `<button class="chip" data-v="${v}" aria-pressed="${st.speed === v}">${num(v)}×</button>`).join('')}</div></div>
      <div class="setting col"><span class="label">${icon('repeat', 'sm')} تكرار كل آية <span class="muted small">(للحفظ)</span></span>
        <div class="chips" id="pRep">${REPS.map((v) => `<button class="chip" data-v="${v}" aria-pressed="${st.rep === v}">${v === 0 ? '∞' : v === 1 ? 'بدون' : `${num(v)} مرات`}</button>`).join('')}</div></div>
      <label class="setting"><div class="grow"><div class="label">تكرار السورة كاملة</div><div class="hint">العودة لأول السورة عند انتهائها</div></div><span class="switch"><input type="checkbox" id="pRepSurah" ${st.repSurah ? 'checked' : ''}><span></span></span></label>
      <div class="setting col"><span class="label">${icon('timer', 'sm')} مؤقت النوم ${sleepLeft ? `<span class="gold small">— متبقٍ ${num(sleepLeft)} د</span>` : P.sleepEnd === -1 ? '<span class="gold small">— حتى نهاية السورة</span>' : ''}</span>
        <div class="chips" id="pSleep">${SLEEP.map(([v, l]) => `<button class="chip" data-v="${v}" aria-pressed="${(v === 0 && !P.sleepEnd) || (v === 'surah' && P.sleepEnd === -1)}">${l}</button>`).join('')}</div></div>
      <label class="setting"><div class="grow"><div class="label">البسملة في بداية السور</div></div><span class="switch"><input type="checkbox" id="pBasmala" ${st.basmala ? 'checked' : ''}><span></span></span></label>
      <label class="setting"><div class="grow"><div class="label">تتبع الآية في المصحف</div></div><span class="switch"><input type="checkbox" id="pFollow" ${st.follow ? 'checked' : ''}><span></span></span></label>
      ${player.hasSession() ? `<button class="btn block" id="pStop">${icon('x', 'sm')} إيقاف التلاوة وإخفاء المشغل</button>` : ''}
    </div>`;
}

function refreshSheet() {
  if (!isSheetOpen()) { sheetOpen = false; return; }
  const body = sheetBody();
  const y = body.scrollTop;
  body.innerHTML = sheetHTML();
  body.scrollTop = y;
}

export function playerSheet() {
  const body = openSheet(sheetHTML(), { onClose: () => { sheetOpen = false; } });
  sheetOpen = true;
  body.onclick = (e) => {
    const chip = e.target.closest('[data-v]');
    if (!chip) { if (e.target.closest('#pStop')) { player.stop(); updateMini(); refreshSheet(); } return; }
    const grp = chip.parentElement.id;
    const v = chip.dataset.v;
    if (grp === 'pSpeed') player.setSpeed(+v);
    if (grp === 'pRep') { S.settings.rep = +v; save(); emit('player', P); }
    if (grp === 'pSleep') { player.setSleep(v === 'surah' ? 'surah' : +v); if (v !== '0') toast('تم ضبط مؤقت النوم'); }
  };
  body.onchange = (e) => {
    const t = e.target;
    if (t.id === 'pReciter') player.setReciter(t.value);
    if (t.id === 'pRepSurah') { S.settings.repSurah = t.checked; save(); player.refreshQueue(); emit('player', P); }
    if (t.id === 'pBasmala') { S.settings.basmala = t.checked; save(); player.refreshQueue(); }
    if (t.id === 'pFollow') { S.settings.follow = t.checked; save(); }
  };
}
