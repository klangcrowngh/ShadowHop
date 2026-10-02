// Звук: короткие записи (assets/sfx, Kenney CC0 + синтезированные всплески и свист)
// и тихий фон на WebAudio — ветер, вода рядом с рекой, дождь в руинах.
//   * у каждого звука несколько вариантов, при каждом проигрывании — случайный
//     вариант и чуть другая высота, чтобы не надоедало;
//   * далёкие события тише (громкость передаёт main.js);
//   * при паузе звук замирает вместе с игрой.
// AudioContext создаётся по первому касанию (иначе браузер не даст звук).

const BANKS = {
  step_grass: 5, step_wood: 5, bump: 3, thud: 3, plank_fall: 3, punch: 3, grab: 2,
  metal: 3, crush: 3, wood_heavy: 2, bell: 1, tick: 4, clank: 3, creak: 3, draw: 3, slice: 2, cloth: 4,
  splash: 3, whoosh: 2, fall: 1,
  loop_saw: 1, loop_gear: 1, loop_thorn: 1, loop_cart: 1,
  puff: 2, whistle: 2, drown: 2,
  // кабан: хрюканье и фырканье (80 CC0 creature SFX — rubberduck)
  boar_grunt: 5, boar_snort: 1,
  // капкан и катафалк: 100 CC0 metal and wood SFX — rubberduck
  trap_spring: 2, trap_snap: 2, hearse_squeak: 2, hearse_clack: 4,
  // болото (Swamp Environment Audio — LokiF, CC0), в mp3: записи длинные
  swamp_atmo: 1, swamp_bubble: 2, swamp_cricket: 1, swamp_cicada: 1, swamp_bug: 1, swamp_beast: 1,
  // лесопилка: гул механизма (Steamboat Engine — Spring Spring) и цепи лебёдки (bart), CC0
  mill_engine: 1, mill_chain: 5,
  // руины: капающая вода (Independent.nu), ворона (zeroisnotnull), стая ворон (IgnasD), CC0
  ruins_drip: 1, ruins_caw: 1, ruins_crows: 3,
};
const extOf = (name) => (/^(swamp|mill|ruins)_/.test(name) ? 'mp3' : 'wav');

// Постоянный фон зоны (петля) по её «extra»
// [петля, громкость, срез верхов (Гц) — чтобы звучало издалека]
const BEDS = { frogs: ['swamp_atmo', 0.7], clank: ['mill_engine', 0.45, 420], ruins: ['ruins_drip', 0.6], graveyard: ['swamp_cricket', 0.35] };
let bed = null;  // { name, src, gain }

// Случайные звуки зоны поверх фона: [имя, вес, громкость]
const CRITTERS = {
  frogs: [['swamp_bubble', 4, 0.8], ['swamp_cricket', 2, 0.55], ['swamp_cicada', 1.5, 0.45], ['swamp_bug', 1.5, 0.5], ['swamp_beast', 0.8, 0.5]],
  // [имя, вес, громкость, высота]
  clank: [['mill_chain', 3, 0.55], ['clank', 2, 0.4, 0.7], ['creak', 2, 0.4, 0.8], ['wood_heavy', 1, 0.45, 0.6]],
  ruins: [['ruins_caw', 3, 0.45], ['ruins_crows', 1.5, 0.3], ['creak', 1, 0.3, 0.7], ['crush', 1, 0.2, 0.55]],  // осыпаются камни
  // кладбище: вороны, далёкий колокол, скрип кованой калитки
  // кладбище: сова, вороны, далёкий колокол, редкий волчий вой вдали (owl и wolf — синтез,
  // см. SYNTH_CRITTERS); скрип калиток даёт сама ловушка-ворота
  graveyard: [['owl', 3, 0.22], ['ruins_caw', 1.5, 0.3], ['bell', 0.8, 0.12, 0.5], ['ruins_crows', 0.6, 0.18], ['wolf', 0.5, 0.1]],
};
let critterT = 2;

const MASTER = 0.4;  // общий уровень
const MUSIC = 0.12;  // фоновая музыка — тихо, под звуками

// Фоновая музыка: «Bleeding out» (HaelDB, OpenGameArt, CC0) по кругу.
// Играет через <audio> (потоком, без распаковки в память), подключённый к общему миксу.
let music = null;
let musicGain = null;

// Постоянный голос опасности на дороге: цикл, громче по мере приближения, с той стороны, где она
const HAZARD_LOOPS = {
  saw: ['loop_saw', 0.29, 1.0],
  gear: ['loop_gear', 0.23, 1.0],   // уровни выровнены по средней громкости с пилой
  thorn: ['loop_thorn', 0.65, 1.0],
  cart: ['loop_cart', 0.27, 1.0],
  log: ['loop_thorn', 0.9, 0.75],     // бревно — глухой деревянный перекат
  mud: ['loop_thorn', 0.7, 0.85],    // болотный ком — вязкий чавкающий перекат
  drum: ['loop_thorn', 0.85, 0.6],   // каменный барабан — низкий грохот по мостовой
};
let hazType = null;  // какая опасность ближе всего (её голос и играет)
let hazLoop = null;
let noiseBuf = null;  // розовый шум — для фона и мягкого плеска  // { name, src, gain, pan, vol }

let ctx = null;
let master, fxBus, ambBus;
let muted = false;
let paused = false;
const raw = {};      // имя -> [ArrayBuffer] (скачано заранее)
const buffers = {};  // имя -> [AudioBuffer]
let zoneSound = null;
const amb = {};
let extraTimer = 3;
let scuttleT = 0;
let lastHazard = Infinity;
let out = null;

try { muted = localStorage.getItem('shadowhop.muted') === '1'; } catch { /* нет хранилища */ }

export const isMuted = () => muted;

export function setMuted(v) {
  muted = v;
  try { localStorage.setItem('shadowhop.muted', v ? '1' : '0'); } catch { /* ignore */ }
  if (master) master.gain.setTargetAtTime(v ? 0 : MASTER, ctx.currentTime, 0.05);
  if (music && !musicGain) music.muted = v;
}

// Звук молчит, пока игра на паузе или приложение скрыто (свёрнуто, экран
// заблокирован) — в любом состоянии игры, а не только в забеге
let hidden = false;
function applyState() {
  if (!ctx) return;
  if (paused || hidden) { ctx.suspend(); music?.pause(); }
  else { ctx.resume(); music?.play().catch(() => {}); }
}

// Пауза: звук замирает, после паузы продолжается с того же места
export function setPaused(v) {
  paused = v;
  applyState();
}

export function setHidden(v) {
  if (hidden === v) return;
  hidden = v;
  applyState();
}

// Файлы скачиваются заранее (без AudioContext), декодируются при первом касании
export async function preload() {
  await Promise.all(Object.entries(BANKS).map(async ([name, n]) => {
    raw[name] = await Promise.all([...Array(n).keys()].map((k) =>
      fetch(`assets/sfx/${name}_${k}.${extOf(name)}`).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)));
  }));
  if (ctx) decodeAll();
}

function decodeAll() {
  for (const [name, list] of Object.entries(raw)) {
    if (buffers[name]) continue;
    buffers[name] = [];
    for (const ab of list) {
      if (!ab) continue;
      // decodeAudioData забирает буфер — отдаём копию
      ctx.decodeAudioData(ab.slice(0)).then((b) => buffers[name].push(b)).catch(() => {});
    }
  }
}

export function unlock() {
  if (ctx) { if (ctx.state !== 'running' && !paused && !hidden) ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 3;
  comp.connect(ctx.destination);
  master = ctx.createGain();
  master.gain.value = muted ? 0 : MASTER;
  master.connect(comp);
  fxBus = gain(1.0, master);
  ambBus = gain(0.25, master);  // фон — едва слышный, под эффектами

  const noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
  const d = noise.getChannelData(0);
  // «розоватый» шум — мягче белого, без шипения
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.997 * b0 + w * 0.029591;
    b1 = 0.985 * b1 + w * 0.032534;
    b2 = 0.95 * b2 + w * 0.048056;
    d[i] = (b0 + b1 + b2 + w * 0.04) * 2.2;
  }
  noiseBuf = noise;
  amb.wind = noiseLayer(noise, 'lowpass', 450, 0.5);
  amb.water = noiseLayer(noise, 'bandpass', 900, 0.7);
  amb.rain = rainLayer();
  amb.howl = noiseLayer(noise, 'bandpass', 450, 9);  // воющий ветер (кладбище): узкая полоса шума плавает по частоте
  decodeAll();
  if (zoneSound) setZone(zoneSound);
  startMusic();
}

function startMusic() {
  if (music) return;
  music = new Audio('assets/music/bleeding_out.mp3');
  music.loop = true;
  music.preload = 'auto';
  try {
    const src = ctx.createMediaElementSource(music);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0;
    src.connect(musicGain).connect(master);
    musicGain.gain.setTargetAtTime(MUSIC, ctx.currentTime + 0.3, 2.5);  // плавно проявляется
  } catch {
    music.volume = MUSIC * MASTER;  // без WebAudio-графа — просто громкость элемента
  }
  if (!paused && !hidden) music.play().catch(() => {});
}

// --- строительные блоки -------------------------------------------------------
function gain(v, to) {
  const g = ctx.createGain();
  g.gain.value = v;
  g.connect(to);
  return g;
}

// Дождь: настоящая запись ливня — первые 12 с «Storm & Siren» (TinyWorlds, CC0),
// закольцованы с плавным стыком. Пока файл не скачан, слой молчит.
function rainLayer() {
  const g = gain(0, ambBus);
  fetch('assets/sfx/rain_loop.mp3')
    .then((r) => r.arrayBuffer())
    .then((ab) => ctx.decodeAudioData(ab))
    .then((buf) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(g);
      src.start(0, Math.random() * buf.duration);
    })
    .catch(() => {});
  return { gain: g };
}

function noiseLayer(buf, type, freq, q) {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = gain(0, ambBus);
  src.connect(f).connect(g);
  src.start(0, Math.random() * 2);
  return { filter: f, gain: g };
}

// Один звук из банка: случайный вариант, лёгкий разброс высоты
function sample(name, vol = 1, { rate = 1, delay = 0, spread = 0.06, pan = 0, bus = out ?? fxBus } = {}) {
  const list = buffers[name];
  if (!list?.length) return;
  const s = ctx.createBufferSource();
  s.buffer = list[Math.floor(Math.random() * list.length)];
  s.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * spread);
  const g = ctx.createGain();
  g.gain.value = vol;
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    s.connect(g).connect(p).connect(bus);
  } else {
    s.connect(g).connect(bus);
  }
  s.start(ctx.currentTime + delay);
}

// Мягкий плеск волны: глухой шум с плавной атакой, без пузырей
function slosh(vol, { delay = 0, dur = 0.4, from = 900, to = 260 } = {}) {
  if (!noiseBuf) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 0.6;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(out ?? fxBus);
  s.start(t, Math.random() * 2, dur + 0.05);
}

// Пар: «пшик» — белый шум в полосе 3–6 кГц, резкая атака, короткое плато и спад;
// полоса чуть сползает вниз, как у стравливаемого клапана
let whiteBuf = null;
function steam(vol, dur, delay = 0) {
  if (!ctx) return;
  if (!whiteBuf) {
    whiteBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = whiteBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = whiteBuf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1800;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.9;
  bp.frequency.setValueAtTime(5200, t);
  bp.frequency.exponentialRampToValueAtTime(3400, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.setValueAtTime(vol, t + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(hp).connect(bp).connect(g).connect(out ?? fxBus);
  s.start(t, Math.random() * 1.5, dur + 0.05);
}

// Стон призрака: два расстроенных тона с дрожанием, глиссандо вверх и вниз, приглушённые
function moan(vol, dur = 1.3) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  lp.Q.value = 2;
  lp.connect(g).connect(out ?? fxBus);
  const f0 = 250 + Math.random() * 80;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.5;
  const depth = ctx.createGain();
  depth.gain.value = 6;
  lfo.connect(depth);
  for (const det of [0, 1]) {
    const o = ctx.createOscillator();
    o.type = det ? 'triangle' : 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * 1.25, t + dur * 0.4);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.7, t + dur);
    o.detune.value = det * 18;
    depth.connect(o.frequency);
    o.connect(lp);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  lfo.start(t);
  lfo.stop(t + dur + 0.05);
}

// --- публичный API ----------------------------------------------------------
export function setZone(sound) {
  zoneSound = sound;
  if (!ctx) return;
  const t = ctx.currentTime;
  amb.wind.filter.frequency.setTargetAtTime(sound.wind * 0.7, t, 1.5);
  amb.wind.gain.gain.setTargetAtTime(0.035, t, 1.5);
  amb.rain.gain.gain.setTargetAtTime(sound.extra === 'rain' ? 0.9 : 0, t, 2);
  if (sound.extra !== 'graveyard') amb.howl.gain.gain.setTargetAtTime(0, t, 2);
}

// Синтезированные голоса фона: ton — тон с плавным глиссандо и мягкой атакой
function ton(f0, f1, dur, vol, { delay = 0, pan = 0, type = 'sine', vib = 0, lp = 1200 } = {}) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  if (vib) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5;
    const d = ctx.createGain();
    d.gain.value = vib;
    lfo.connect(d).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lp;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.08, dur * 0.3));
  g.gain.setValueAtTime(vol, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  o.connect(f).connect(g).connect(p).connect(ambBus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const SYNTH_CRITTERS = {
  // сова: «у-ху… у-ху-ху», низкие мягкие ноты с лёгким спадом
  owl: (vol, pan) => {
    const f = 380 + Math.random() * 50;
    ton(f, f * 0.93, 0.32, vol, { pan, lp: 900 });
    ton(f * 1.05, f * 0.9, 0.5, vol, { pan, delay: 0.42, lp: 900 });
    if (Math.random() < 0.6) {
      ton(f, f * 0.94, 0.22, vol * 0.8, { pan, delay: 1.2, lp: 900 });
      ton(f * 1.04, f * 0.9, 0.45, vol * 0.9, { pan, delay: 1.48, lp: 900 });
    }
  },
  // далёкий волчий вой: долгое глиссандо вверх и вниз с дрожанием, приглушённое
  wolf: (vol, pan) => {
    const f = 330 + Math.random() * 60;
    ton(f, f * 1.6, 1.1, vol, { pan, vib: 6, lp: 700, type: 'triangle' });
    ton(f * 1.6, f * 1.1, 1.6, vol, { pan, delay: 1.05, vib: 8, lp: 700, type: 'triangle' });
  },
};

// Фон зоны: плавно сменить петлю при смене зоны (когда её буфер уже декодирован)
function ensureBed() {
  const spec = BEDS[zoneSound?.extra];
  const want = spec?.[0] ?? null;
  if ((bed?.name ?? null) === want) return;
  if (want && !buffers[want]?.[0]) return;
  if (bed) {
    const old = bed;
    old.gain.gain.setTargetAtTime(0, ctx.currentTime, 1.5);
    setTimeout(() => { try { old.src.stop(); } catch { /* уже остановлен */ } }, 6000);
    bed = null;
  }
  if (!want) return;
  const buf = buffers[want][0];
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = ctx.createGain();
  g.gain.value = 0;
  if (spec[2]) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = spec[2];
    src.connect(f).connect(g).connect(ambBus);
  } else {
    src.connect(g).connect(ambBus);
  }
  src.start(0, Math.random() * buf.duration);
  g.gain.setTargetAtTime(spec[1], ctx.currentTime, 2);
  bed = { name: want, src, gain: g };
}

// Запустить цикл опасности текущей зоны (когда его буфер уже декодирован)
function ensureHazardLoop() {
  const spec = HAZARD_LOOPS[hazType];
  if (!spec) {  // у этой опасности нет постоянного голоса (кабан) — старый затихает
    hazLoop?.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    return;
  }
  if (hazLoop?.name === spec[0]) return;
  const buf = buffers[spec[0]]?.[0];
  if (!buf) return;
  if (hazLoop) {
    const old = hazLoop;
    old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    setTimeout(() => { try { old.src.stop(); } catch { /* уже остановлен */ } }, 2000);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.playbackRate.value = spec[2];
  const gainN = ctx.createGain();
  gainN.gain.value = 0;
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (pan) src.connect(gainN).connect(pan).connect(fxBus);
  else src.connect(gainN).connect(fxBus);
  src.start(0, Math.random() * buf.duration);
  hazLoop = { name: spec[0], src, gain: gainN, pan, vol: spec[1] };
}

// Каждый кадр: близость опасности и воды (в клетках), тревога паука 0..1
let lastProj = Infinity;
const FLYBY = {
  spear: () => sample('whoosh', 0.55, { rate: 0.75 }),
  dart: () => sample('whistle', 0.45),
  bolt: () => { sample('whoosh', 0.5, { rate: 1.4 }); sample('whistle', 0.15, { rate: 0.7 }); },
  stone: () => { sample('whoosh', 0.5, { rate: 0.6 }); sample('whoosh', 0.3, { rate: 0.55, delay: 0.09 }); },
};

let runT = 0;

export function update(dt, { hazard, hazardDx = 0, hazardType = null, proj = Infinity, projType = null, water, danger, run = 0, runX = 0 }) {
  if (!ctx || !zoneSound || paused) return;
  const t = ctx.currentTime;
  if (hazardType) hazType = hazardType;
  ensureHazardLoop();

  ensureBed();

  // живность зоны: случайный звук слева или справа
  const critters = CRITTERS[zoneSound.extra];
  if (critters) {
    critterT -= dt;
    if (critterT <= 0) {
      critterT = 3 + Math.random() * 5;
      let r = Math.random() * critters.reduce((s, c) => s + c[1], 0);
      const c = critters.find((x) => (r -= x[1]) <= 0) ?? critters[0];
      const vol = c[2] * (0.6 + Math.random() * 0.4), pan = (Math.random() * 2 - 1) * 0.8;
      if (SYNTH_CRITTERS[c[0]]) SYNTH_CRITTERS[c[0]](vol, pan);
      else sample(c[0], vol, { bus: ambBus, pan, rate: c[3] ?? 1, spread: 0.06 });
    }
  }
  if (zoneSound.extra === 'graveyard') {  // ветер воет: полоса плавает, порывы то нарастают, то стихают
    const s = ctx.currentTime;
    amb.howl.filter.frequency.setTargetAtTime(420 + 160 * Math.sin(s * 0.23) + 80 * Math.sin(s * 0.61 + 1), t, 0.3);
    amb.howl.gain.gain.setTargetAtTime(0.1 + 0.09 * (0.5 + 0.5 * Math.sin(s * 0.17)) * (0.6 + 0.4 * Math.sin(s * 0.43)), t, 0.5);
  }
  if (hazLoop && HAZARD_LOOPS[hazType]?.[0] === hazLoop.name) {
    const k = Math.max(0, 1 - hazard / 5);
    hazLoop.gain.gain.setTargetAtTime(hazLoop.vol * k ** 1.5, t, 0.08);
    hazLoop.pan?.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, hazardDx / 3)), t, 0.08);
  }
  amb.water.gain.gain.setTargetAtTime(0.09 * Math.max(0, 1 - water / 3), t, 0.3);

  // порывы ветра
  if (Math.random() < dt * 0.4) amb.wind.gain.gain.setTargetAtTime(0.018 + Math.random() * 0.035, t, 1.2);

  if (proj < 1.4 && lastProj >= 1.4 && projType) FLYBY[projType]?.();
  lastProj = proj;

  // опасность проносится рядом с героем — свист (и лязг у металлических)
  if (hazard < 1.3 && lastHazard >= 1.3) {
    const k = 1 - hazard / 1.3;
    // проезд мимо — негромко: опасность и так слышно по постоянному звуку
    const soft = 0.5;
    sample('whoosh', (0.25 + 0.3 * k) * soft, { rate: 0.8 });
    if (hazType === 'saw' || hazType === 'gear') sample('clank', (0.12 + 0.15 * k) * soft, { rate: 1.3 });
    else if (hazType === 'log') sample('wood_heavy', (0.15 + 0.15 * k) * soft, { rate: 0.7 });
    else if (hazType === 'boar') { sample('boar_snort', 0.35 + 0.2 * k, { rate: 0.8 }); sample('boar_grunt', 0.24 + 0.14 * k, { rate: 0.8, delay: 0.12 }); }
    else sample('crush', (0.08 + 0.1 * k) * soft, { rate: 0.8 });
  }
  lastHazard = hazard;

  // паук бежит (выбегает к герою или утаскивает его во тьму): частый топот лап,
  // стихает по мере удаления и слышен с его стороны
  if (run > 0) {
    runT -= dt;
    if (runT <= 0) {
      runT = 0.045 + Math.random() * 0.03;
      const pan = runX / 4;
      sample('tick', 0.45 * run, { rate: 1.6, spread: 0.2, pan });
      if (Math.random() < 0.35) sample('step_grass', 0.25 * run, { rate: 1.8, spread: 0.2, pan });
    }
  }

  // паук близко: частое цоканье лапок, тем чаще и громче, чем ближе
  if (danger > 0) {
    scuttleT -= dt;
    if (scuttleT <= 0) {
      scuttleT = 0.22 - danger * 0.15 + Math.random() * 0.06;
      sample('tick', 0.1 + danger * 0.3, { rate: 1.9, spread: 0.15 });
    }
  }

  // редкие далёкие звуки зоны
  extraTimer -= dt;
  if (extraTimer <= 0) {
    extraTimer = 5 + Math.random() * 7;
    const e = zoneSound.extra;
    if (e === 'birds') sample('creak', 0.4, { rate: 0.7, bus: ambBus });            // скрип старого дерева
    else if (e === 'frogs') sample('splash', 0.25, { rate: 1.6, bus: ambBus, pan: Math.random() - 0.5 });  // что-то плеснуло в болоте
    else if (e === 'rain' && Math.random() < 0.3) sample('thud', 0.6, { rate: 0.45, bus: ambBus }); // далёкий гром
  }
}

const SFX = {
  hop: () => {},
  land_grass: () => sample('step_grass', 0.35),
  land_plank: () => sample('step_wood', 0.4),
  // бревно, плот, дверь, кувшинка: шаг по мокрому дереву и волна от толчка
  land_float: () => { sample('step_wood', 0.11, { rate: 0.8 }); sample('thud', 0.045, { rate: 1.2 }); slosh(0.15); slosh(0.075, { delay: 0.18, dur: 0.35, from: 600 }); },
  land_metal: () => { sample('step_grass', 0.2); sample('clank', 0.22, { rate: 1.25, spread: 0.1 }); },  // рельсы, конвейер
  // кувшинка: шелест мокрого листа и лёгкий плеск
  land_lily: () => { sample('step_grass', 0.2, { rate: 1.15, spread: 0.1 }); sample('cloth', 0.06, { rate: 1.3 }); slosh(0.15, { dur: 0.3, from: 700 }); },
  land_stone: () => { sample('step_grass', 0.26, { rate: 1.1 }); sample('thud', 0.08, { rate: 1.5 }); },  // мостовая
  land_mud: () => { sample('step_grass', 0.35, { rate: 0.75 }); slosh(0.2, { dur: 0.25, from: 700 }); },  // колеи в болоте
  bump: () => sample('bump', 0.45),
  creak: () => sample('creak', 0.25),
  plankFall: () => { sample('plank_fall', 0.45); sample('thud', 0.18, { delay: 0.55, rate: 0.8 }); },
  windup: () => sample('draw', 0.35),
  windup_spear: () => sample('draw', 0.35),
  windup_dart: () => sample('draw', 0.35),
  windup_stone: () => sample('draw', 0.35),
  // арбалет: тетива натягивается со скрипом, как у лука (замах длится 0,8 с)
  windup_bolt: () => {
    sample('creak', 0.4, { rate: 1.5, spread: 0.08 });
    sample('creak', 0.25, { rate: 1.9, spread: 0.08, delay: 0.3 });
  },
  throw: () => sample('whoosh', 0.5, { rate: 1.1 }),
  throw_spear: () => { sample('cloth', 0.4); sample('whoosh', 0.55, { rate: 0.8 }); },         // копьё
  throw_dart: () => sample('puff', 0.6),                                                       // духовая трубка
  // арбалет: выстрел — свист болта
  throw_bolt: () => sample('whoosh', 0.55, { rate: 1.5 }),
  throw_stone: () => { sample('whoosh', 0.4, { rate: 0.6 }); sample('whoosh', 0.45, { rate: 0.7, delay: 0.12 }); }, // праща
  hit_spear: () => { sample('slice', 0.5, { rate: 0.8 }); sample('punch', 0.5); },
  hit_dart: () => { sample('slice', 0.35, { rate: 1.5 }); sample('punch', 0.25, { rate: 1.3 }); },
  hit_bolt: () => { sample('wood_heavy', 0.4, { rate: 1.4 }); sample('punch', 0.5); },
  // капкан захлопнулся: лязг стальных челюстей
  trapSnap: () => { sample('trap_spring', 0.4, { rate: 1.1, spread: 0.08 }); sample('trap_snap', 0.75, { delay: 0.03, spread: 0.06 }); },
  // кладбище
  hearseCreak: () => sample('hearse_squeak', 0.28, { rate: 0.8, spread: 0.12 }),     // кузов поскрипывает
  hearseClack: () => sample('hearse_clack', 0.24, { rate: 0.75, spread: 0.15 }),     // колёса стучат о плиты
  gateCreak: () => sample('creak', 0.45, { rate: 1.1, spread: 0.08 }),
  gateSlam: () => { sample('metal', 0.5, { rate: 0.7 }); sample('clank', 0.4, { rate: 0.8 }); sample('thud', 0.3, { rate: 0.9 }); },
  gateOpen: () => sample('creak', 0.3, { rate: 0.9 }),
  ghostMoan: () => moan(0.16),
  ghostGrab: () => { moan(0.3, 1.6); sample('whoosh', 0.3, { rate: 0.5 }); },
  handWarn: () => { sample('crush', 0.18, { rate: 1.4, spread: 0.1 }); sample('thud', 0.15, { rate: 0.7 }); },  // земля шевелится
  handBurst: () => { sample('crush', 0.4, { rate: 0.9 }); sample('thud', 0.35, { rate: 0.6 }); },
  handGrab: () => { sample('grab', 0.6, { rate: 0.8 }); sample('crush', 0.3, { rate: 0.7 }); },
  windup_skull_proj: () => sample('draw', 0.35),
  throw_skull_proj: () => { sample('whoosh', 0.4, { rate: 0.6 }); sample('whoosh', 0.45, { rate: 0.7, delay: 0.12 }); },
  hit_skull_proj: () => { sample('punch', 0.7, { rate: 0.8 }); sample('wood_heavy', 0.35, { rate: 1.6 }); },
  hit_stone: () => { sample('punch', 0.7, { rate: 0.8 }); sample('crush', 0.4, { rate: 1.2 }); },
  slice: () => { sample('slice', 0.7); sample('metal', 0.4); },
  crush: () => { sample('crush', 0.6); sample('wood_heavy', 0.35); },
  // утонул: глубокий «бултых» и бульканье уходящего под воду героя
  splash: () => sample('drown', 1.2, { spread: 0.04 }),
  hit: () => { sample('punch', 0.7); sample('cloth', 0.3); },
  fall: () => { sample('fall', 0.5); sample('thud', 0.35, { delay: 0.95, rate: 0.8 }); },
  spider: () => { sample('grab', 0.7); sample('cloth', 0.5); for (let k = 0; k < 5; k++) sample('tick', 0.3, { delay: k * 0.05, rate: 2 }); },
  death: () => {},
  // лес: бревно стучит о землю на подскоках, кабан топочет и хрюкает
  logBump: () => { sample('wood_heavy', 0.85, { rate: 0.6, spread: 0.1 }); sample('thud', 0.6, { rate: 0.85 }); },
  mudBump: () => { sample('splash', 0.4, { rate: 0.7, spread: 0.12 }); sample('thud', 0.35, { rate: 0.75 }); },  // шлёп грязью о землю
  stoneBump: () => { sample('thud', 0.5, { rate: 0.7, spread: 0.1 }); sample('crush', 0.12, { rate: 0.6 }); },  // камень о брусчатку
  hoof: () => { sample('step_grass', 0.28, { rate: 0.5, spread: 0.15 }); sample('thud', 0.1, { rate: 1.5, spread: 0.1 }); },
  boarGrunt: () => sample('boar_grunt', 0.36, { rate: 0.8, spread: 0.1 }),
  // паровые клапаны: шипение нагрева и выброс пара
  // клапан: тихое подтравливание перед выбросом, затем громкий «пшшш»
  ventHiss: () => { steam(0.06, 0.12); steam(0.05, 0.1, 0.25); steam(0.07, 0.14, 0.45); },
  ventBlast: () => steam(0.4, 0.6),
  // паровой молот: шипение пара перед ударом и тяжёлый металлический удар
  pressHiss: () => { steam(0.3, 0.3); },
  pressSlam: () => { sample('metal', 0.45, { rate: 0.6 }); sample('crush', 0.35, { rate: 0.7 }); sample('thud', 0.4, { rate: 0.8 }); steam(0.2, 0.5, 0.05); },
  // щупальце: бульканье перед хваткой, всплеск и хлюпанье, когда утаскивает
  tentacleWarn: () => { sample('swamp_bubble', 0.7, { spread: 0.05 }); sample('swamp_bubble', 0.4, { rate: 0.8, delay: 0.6 }); },
  tentacleGrab: () => { sample('drown', 0.45, { rate: 1.15 }); sample('grab', 0.3, { rate: 0.7 }); },
  zone: () => sample('bell', 0.4, { rate: 0.6, spread: 0 }),
};

// Короткий звук; vol — множитель громкости (для удалённых источников)
export function play(name, vol = 1) {
  if (!ctx || muted || paused || vol < 0.05) return;
  const g = gain(Math.min(1, vol), fxBus);
  out = g;
  SFX[name]?.();
  out = null;
  setTimeout(() => g.disconnect(), 4000);
}
