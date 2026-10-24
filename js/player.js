// Ayah-by-ayah recitation player: double-buffered for near-gapless playback,
// repeat/memorization modes, sleep timer and lock-screen (Media Session) controls.
import { S, save, emit, num } from './store.js';
import { audioUrl, surahOf, ayahOf, surahName, range, reciterName, TOTAL_AYAHS } from './quran.js';

const mk = () => { const a = new Audio(); a.preload = 'auto'; return a; };
let A = mk(), B = mk();
let cur = null;             // { i, b } — b: basmala intro before the ayah
let plays = 0;              // how many times the current ayah has played
let sleepTimer = null;

export const P = {
  i: S.player.i,            // current ayah (global index)
  playing: false,
  loading: false,
  basmala: false,
  sleepEnd: 0,              // timestamp, or -1 for "end of surah"
};

const keyOf = (it) => `${S.settings.reciter}|${it.b ? 'b' : it.i}`;
const srcOf = (it) => audioUrl(S.settings.reciter, it.b ? 0 : it.i);
const needsBasmala = (i) => {
  const s = surahOf(i);
  return S.settings.basmala && s !== 1 && s !== 9 && ayahOf(i) === 1;
};

function set(patch) {
  Object.assign(P, patch);
  emit('player', P);
}

function nextItem(it) {
  if (it.b) return { i: it.i };
  let n = it.i + 1;
  if (S.settings.repSurah) {
    const [from, to] = range('surah', surahOf(it.i));
    if (n >= to) n = from;
  }
  if (n >= TOTAL_AYAHS) return null;
  return { i: n, b: needsBasmala(n) };
}

function preload() {
  const nx = cur && nextItem(cur);
  if (!nx) return;
  const k = keyOf(nx);
  if (B.dataset.k !== k) {
    B.src = srcOf(nx);
    B.dataset.k = k;
  }
}

function start(it) {
  const prev = A;
  cur = it;
  plays = 0;
  const k = keyOf(it);
  if (B.dataset.k === k) { [A, B] = [B, A]; }
  else { A.src = srcOf(it); A.dataset.k = k; }
  if (prev !== A) prev.pause();
  A.defaultPlaybackRate = A.playbackRate = S.settings.speed;
  A.volume = 1;
  if (A.currentTime) A.currentTime = 0;
  const changed = P.i !== it.i;
  set({ i: it.i, basmala: !!it.b, loading: true });
  if (changed) { S.player.i = it.i; save(); emit('ayah', it.i); }
  A.play().catch((e) => { if (e.name !== 'AbortError') set({ playing: false, loading: false }); });
  updateMediaSession();
  preload();
}

// --- Public API ---
export const hasSession = () => cur != null || P.playing;

export function play(i = P.i ?? 0) {
  start({ i, b: needsBasmala(i) });
}
export function toggle() {
  if (P.playing) pause();
  else if (cur && A.src) { A.play().catch(() => {}); }
  else play();
}
export function pause() { A.pause(); }
export function stop() {
  A.pause();
  cur = null;
  set({ playing: false, loading: false });
}
export function next() {
  if (P.i == null) return;
  if (P.i + 1 < TOTAL_AYAHS) play(P.i + 1);
}
export function prev() {
  if (P.i == null) return;
  if (A.currentTime > 3 && !P.basmala) { A.currentTime = 0; return; }
  if (P.i > 0) play(P.i - 1);
}
export function seek(fraction) {
  if (A.duration) A.currentTime = A.duration * fraction;
}
export function setSpeed(v) {
  S.settings.speed = v; save();
  for (const el of [A, B]) el.defaultPlaybackRate = el.playbackRate = v;
  emit('player', P);
}
export function setReciter(id) {
  S.settings.reciter = id; save();
  B.removeAttribute('src'); B.dataset.k = '';
  if (cur) {
    const wasPlaying = P.playing;
    const at = cur;
    A.pause();
    if (wasPlaying) start(at);
    else { cur = null; }
  }
  updateMediaSession();
  emit('player', P);
}
export function refreshQueue() {
  B.dataset.k = '';
  preload();
}

export function setSleep(minutes) {
  clearTimeout(sleepTimer);
  if (minutes === 'surah') set({ sleepEnd: -1 });
  else if (minutes > 0) {
    set({ sleepEnd: Date.now() + minutes * 60000 });
    sleepTimer = setTimeout(fadeOut, minutes * 60000);
  } else set({ sleepEnd: 0 });
}
function fadeOut() {
  const steps = 20;
  let n = 0;
  const id = setInterval(() => {
    A.volume = Math.max(0, 1 - ++n / steps);
    if (n >= steps) { clearInterval(id); pause(); A.volume = 1; set({ sleepEnd: 0 }); }
  }, 150);
}

// --- Element events (only the active element reports) ---
function onEnded() {
  if (!cur) return;
  if (!cur.b) {
    plays++;
    emit('heard', cur.i);
    const rep = S.settings.rep;
    if (rep === 0 || plays < rep) { A.currentTime = 0; A.play().catch(() => {}); return; }
  }
  const nx = nextItem(cur);
  if (P.sleepEnd === -1 && nx && !nx.b && surahOf(nx.i) !== surahOf(cur.i)) {
    set({ playing: false, sleepEnd: 0 });
    return;
  }
  if (!nx) {
    set({ playing: false });
    emit('khatm');
    return;
  }
  start(nx);
}

for (const el of [A, B]) {
  el.addEventListener('ended', () => el === A && onEnded());
  el.addEventListener('playing', () => el === A && set({ playing: true, loading: false }));
  el.addEventListener('waiting', () => el === A && set({ loading: true }));
  el.addEventListener('pause', () => el === A && !A.ended && set({ playing: false, loading: false }));
  el.addEventListener('error', () => {
    if (el !== A || !el.getAttribute('src')) return;
    set({ playing: false, loading: false });
    emit('player-error');
  });
  el.addEventListener('timeupdate', () => el === A && emit('ptime', { t: A.currentTime, d: A.duration || 0 }));
}

// --- Media Session (lock screen / headset controls) ---
function updateMediaSession() {
  if (!('mediaSession' in navigator) || P.i == null) return;
  const s = surahOf(P.i);
  navigator.mediaSession.metadata = new MediaMetadata({
    title: `سورة ${surahName(s)} — الآية ${num(ayahOf(P.i))}`,
    artist: reciterName(S.settings.reciter),
    album: 'اقرأ — القرآن الكريم',
    artwork: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  });
}
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  const h = (a, fn) => { try { ms.setActionHandler(a, fn); } catch {} };
  h('play', () => toggle());
  h('pause', () => pause());
  h('nexttrack', () => next());
  h('previoustrack', () => prev());
  h('stop', () => stop());
}
