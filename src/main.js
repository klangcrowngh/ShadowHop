import * as THREE from 'three';
import { CAM, DARK_EDGE, PACE, difficulty } from './config.js';
import { sharedTime, sheenLights, sheenSky, makeDarkness } from './materials.js';
import { ZONES, ZONE_LEN, zoneIndex } from './zones.js';
import { loadModels } from './models.js';
import { loadLogo } from './logo.js';
import { World } from './world.js';
import { Player } from './player.js';
import { FX } from './fx.js';
import { Spider } from './spider.js';
import { Tentacles } from './tentacle.js';
import { Post } from './post.js';
import { Dust } from './dust.js';
import { Mist } from './mist.js';
import { bindInput } from './input.js';
import * as audio from './audio.js';

// Звук: записи из assets/sfx и тихий фон; включается первым касанием
const SOUND = true;
import * as tg from './telegram.js';

tg.init();

// Заставка Rentrobot: держится, пока идёт анимация (~2.4 с) и грузятся модели; касание — пропустить
const splash = document.getElementById('splash');
const splashMin = new Promise((r) => setTimeout(r, 2400));
const splashDrawn = new Promise((r) => setTimeout(r, 1900));  // анимация логотипа дорисовалась
let splashSkip;
const splashTap = new Promise((r) => { splashSkip = r; });
splash.addEventListener('pointerdown', (e) => { e.stopPropagation(); splashSkip(); });

const $ = (id) => document.getElementById(id);
const ui = {
  hud: $('hud'), score: $('score'), best: $('best'), screen: $('screen'), msg: $('msg'), hint: $('hint'),
  zone: $('zone'), mute: $('mute'),
  pauseBtn: $('pause-btn'), pause: $('pause'), count: $('count'),
};

// --- Рендер ---------------------------------------------------------------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
renderer.setPixelRatio(pixelRatio);
renderer.shadowMap.enabled = true;
renderer.localClippingEnabled = true;  // для анимации «распилило»
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color();
scene.fog = new THREE.Fog(0x000000, 14, 34);

// Свет как на референсе: очень тусклое небо, холодный контровой свет из
// глубины сцены (тени тянутся к камере, края предметов подсвечены) и тёплые
// локальные источники — лучи, фонари, цветы (см. LIGHTS ниже)
const hemi = new THREE.HemisphereLight(0x7d8694, 0x0e0d0c, 0.32);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xcfd7e2, 1.7);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -8; key.shadow.camera.right = 8;
key.shadow.camera.top = 10; key.shadow.camera.bottom = -8;
key.shadow.camera.near = 1; key.shadow.camera.far = 40;
key.shadow.bias = -0.0006;
key.shadow.normalBias = 0.03;
key.shadow.radius = 4;
scene.add(key, key.target);
const KEY_OFFSET = new THREE.Vector3(-2, 9, -11);

// Окружение для бликов на мокрой земле и металле: тёмный низ, серое небо
{
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; gl_FragColor = vec4(mix(vec3(0.01), vec3(0.3,0.31,0.33), smoothstep(-0.1, 0.8, h)), 1.0); }',
  })));
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene).texture;
  scene.environmentIntensity = 0.35;
}

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
const post = new Post(renderer, scene, camera);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  const aspect = w / h;
  let hw, hh;
  if (aspect < 1) { hw = CAM.halfWidth; hh = hw / aspect; }
  else { hh = CAM.halfWidth * 1.3; hw = hh * aspect; }
  camera.left = -hw; camera.right = hw; camera.top = hh; camera.bottom = -hh;
  camera.updateProjectionMatrix();
  post.setSize(w, h, pixelRatio);
}
window.addEventListener('resize', resize);
resize();

// Локальные источники: три настоящих точечных света ставятся на самые
// заметные якоря в кадре (лучи, фонари, цветы кувшинок); четыре — дают
// блики-дорожки на мокрой земле и воде (sheenLights)
const LIGHTS = [0, 1, 2].map(() => {
  const l = new THREE.PointLight(0xffe2b8, 0, 6.5, 2);
  scene.add(l);
  return l;
});
const _v = new THREE.Vector3();
function updateLights(tx, tz) {
  sheenSky.value.set(tz, 0.16);
  const cand = world.lightsIn(Math.floor(camRow) - 4, Math.ceil(camRow) + 11).map((s) => {
    s.anchor.updateWorldMatrix(true, false);
    const p = s.anchor.getWorldPosition(new THREE.Vector3());
    const d2 = (p.x - tx) ** 2 + ((p.z - tz) * 0.7) ** 2;
    // лёгкое мерцание живого огня
    const flicker = 0.9 + 0.1 * Math.sin(time * 13 + p.x * 7) * Math.sin(time * 7.7 + p.z * 3);
    return { p, power: s.power * flicker, score: s.power / (1 + d2 * 0.05) };
  }).sort((a, b) => b.score - a.score);
  LIGHTS.forEach((l, k) => {
    const c = cand[k];
    l.intensity = c ? c.power * 7 : 0;
    if (c) l.position.copy(c.p);
  });
  sheenLights.value.forEach((v, k) => {
    const c = cand[k];
    if (c) v.set(c.p.x, c.p.y, c.p.z, c.power * 0.55);
    else v.set(0, -100, 0, 0);
  });
}

// Тьма за границами игрового поля
const edges = new THREE.Mesh(new THREE.PlaneGeometry(60, 80).rotateX(-Math.PI / 2), makeDarkness(DARK_EDGE));
edges.position.y = 0.05;
edges.renderOrder = 5;
edges.frustumCulled = false;
scene.add(edges);

// --- Игра -----------------------------------------------------------------
// Разбор моделей, генерация мира и компиляция шейдеров надолго занимают поток —
// всё это начинается, когда анимация заставки дорисовалась (или её пропустили),
// иначе она дёргается. Файлы тем временем скачиваются.
const drawn = Promise.race([splashDrawn, splashTap]);
const [models, logo] = await Promise.all([loadModels(drawn), drawn.then(() => loadLogo()).catch(() => null)]);
const world = new World(scene, models, logo);
if (SOUND) audio.preload();
const player = new Player(scene, models);
const fx = new FX(scene, models, pixelRatio);
const dust = new Dust(scene, pixelRatio);
const mist = new Mist(scene);
const spider = new Spider(scene, models);
player.fx = fx;
const tentacles = new Tentacles(fx);

// Звук событий мира — тише, чем дальше от героя
world.onSpark = (x, y, z, dir) => fx.spark(x, y, z, dir);
tentacles.onEvent = (type, x, z) => world.onEvent(type, x, z);
world.onSteam = (x, y, z, k) => fx.dust(new THREE.Vector3(x, y, z), Math.round(4 + 6 * k), 0.35 + 0.25 * k, 0.28 + 0.2 * k);
world.onVentSteam = (x, z, k) => fx.steam(x, z, k);
world.onEvent = (type, x, z) => {
  const p = player.obj.position;
  const dist = Math.hypot(x - p.x, (z - p.z) * 1.3);
  audio.play(type, Math.max(0, 1 - dist / 8));
};

const DEATH_TEXT = {
  drown: 'тьма под водой',
  drift: 'течение унесло во тьму',
  spider: 'паук не ждёт',
  tentacle: 'щупальце утащило на дно',
  press: 'молот не промахивается',
  steam: 'обварило паром',
  fall: 'пропасть без дна',
  gate: 'прижало кованой створкой',
};

let state = 'menu';   // menu | play | dead
let score = 0;
let best = 0;
let camRow = 0;
let handT = 3;  // до следующей руки мертвеца (кладбище)
const DARK_PACE = 0.92;  // тьма надвигается на 8% медленнее общего темпа
let camX = 0;
let moved = false;
let deathT = 0;
let shake = 0;
let zoneShown = -1;
let bannerT = 0;

tg.loadBest().then((b) => { best = b; showBest(); });

function showBest() { ui.best.textContent = best > 0 ? `рекорд ${best}` : ''; }

function showScreen(msg, hint = '') {
  ui.msg.textContent = msg;
  ui.hint.textContent = hint;
  ui.screen.classList.add('show');
}

function start() {
  world.reset();
  tentacles.reset();
  fx.clear();
  spider.reset();
  player.reset();
  camRow = 0;
  camX = 0;
  score = 0;
  moved = false;
  zoneShown = -1;
  ui.score.textContent = '0';
  ui.screen.classList.remove('show');
  ui.hud.classList.remove('hidden');
  state = 'play';
}

player.on = (ev, kind) => {
  if (ev === 'hop') { tg.haptic('hop'); audio.play('hop'); return; }
  if (ev === 'bump') { tg.haptic('bump'); audio.play('bump'); return; }
  if (ev === 'trap') { tg.haptic('bump'); shake = Math.max(shake, 0.15); return; }  // лязг — от мира (trapSnap)
  if (ev === 'land') {
    // дорога звучит по-разному: рельсы и конвейер — металл, тропы — трава и грязь, мостовая — камень
    if (kind === 'road') {
      const track = world.row(player.row)?.road?.track;
      kind = track === 'trail' ? 'grass' : track === 'bog' ? 'mud' : track === 'cobble' ? 'stone' : 'metal';
    }
    audio.play(`land_${kind}`);
    return;
  }
  if (ev !== 'death') return;
  tg.haptic('death');
  // сами эффекты смерти — в Player._startDeath; здесь тряска и звук
  if (kind === 'road' && player.death?.what === 'ghost') { shake = 0.15; audio.play('ghostGrab'); }
  else if (kind === 'road') { shake = 0.35; audio.play(player.death?.style === 'split' ? 'slice' : 'crush'); }
  else if (kind === 'hand') { shake = 0.25; audio.play('handGrab'); }
  else if (kind === 'gate') { shake = 0.3; audio.play('gateSlam'); }
  else if (kind === 'drown' || kind === 'drift') { shake = 0.1; audio.play('splash'); }
  else if (kind === 'tentacle') { shake = 0.2; audio.play('splash'); }
  else if (kind === 'press') { shake = 0.45; audio.play('crush'); }
  else if (kind === 'steam') { shake = 0.2; audio.play('ventBlast'); }
  else if (kind === 'hunt') { shake = 0.25; audio.play(`hit_${player.lastProjectile ?? 'spear'}`); }
  else if (kind === 'fall') { shake = 0.15; audio.play('fall'); }
  else { shake = 0.3; audio.play('spider'); }
  audio.play('death', 0.8);
  state = 'dead';
  deathT = 0;
  if (score > best) { best = score; tg.saveBest(best); showBest(); }
};

function deathText(kind) {
  let t = DEATH_TEXT[kind] ?? world.zoneOf(player.row).death[kind];
  if (t && typeof t === 'object') t = t[player.death?.what];  // у дорог — по тому, что задавило
  return t ?? 'тьма';
}

// Кнопка звука: не должна считаться прыжком
ui.mute.addEventListener('pointerdown', (e) => e.stopPropagation());
ui.mute.addEventListener('pointerup', (e) => e.stopPropagation());
ui.mute.addEventListener('click', (e) => {
  e.stopPropagation();
  audio.unlock();
  audio.setMuted(!audio.isMuted());
  ui.mute.classList.toggle('off', audio.isMuted());
});
ui.mute.classList.toggle('off', audio.isMuted());
ui.mute.hidden = !SOUND;

// --- Пауза ------------------------------------------------------------------
// Свернули приложение — игра встаёт на паузу сама и, когда вернулись, продолжается
// после отсчёта 3-2-1. Кнопкой — пауза до касания, потом тот же отсчёт.
let paused = false;
let autoPaused = false;
let countdown = 0;  // > 0 — идёт отсчёт до продолжения

function pause(auto = false) {
  if (state !== 'play') return;
  if (paused && countdown <= 0) { autoPaused = autoPaused && auto; return; }
  paused = true;
  autoPaused = auto;
  countdown = 0;
  audio.setPaused(true);
  ui.pause.classList.remove('counting');
  ui.pause.classList.add('show');
}

function resume() {
  if (!paused || countdown > 0) return;
  countdown = 3;
  ui.count.textContent = '3';
  ui.pause.classList.add('counting', 'show');
}

function tickPause(dt) {
  if (countdown <= 0) return;
  countdown -= dt;
  if (countdown > 0) {
    ui.count.textContent = String(Math.ceil(countdown));
  } else {
    paused = false;
    autoPaused = false;
    audio.setPaused(false);
    ui.pause.classList.remove('show', 'counting');
  }
}

for (const ev of ['pointerdown', 'pointerup']) ui.pauseBtn.addEventListener(ev, (e) => e.stopPropagation());
ui.pauseBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!paused) pause();
  else resume();
});
// Скрыли приложение (свернули, заблокировали экран, ушли на другую вкладку) —
// звук выключается всегда, игра на паузе, если шёл забег
function hide() { audio.setHidden(true); pause(true); }
function show() {
  if (document.hidden) return;
  audio.setHidden(false);
  if (autoPaused) resume();
}
document.addEventListener('visibilitychange', () => (document.hidden ? hide() : show()));
window.addEventListener('pagehide', hide);
window.addEventListener('pageshow', show);
window.addEventListener('blur', hide);
window.addEventListener('focus', show);
tg.onActive((active) => (active ? show() : hide()));
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' && e.code !== 'KeyP') return;
  if (!paused) pause();
  else resume();
});

bindInput(document.body, (dir) => {
  if (paused) { resume(); return; }  // касание на паузе — продолжить (после отсчёта)
  if (SOUND) audio.unlock();
  if (state === 'dead') {
    if (deathT < 0.8) return;
    start();
  } else if (state === 'menu') {
    start();
  }
  moved = true;
  player.move(dir, world);
});

showScreen('коснись, чтобы начать', 'тап — вперёд · свайп — в стороны и назад');

// Доступ для отладки из консоли браузера
// advance(сек) прокручивает игру вперёд даже в скрытой вкладке (где браузер останавливает анимацию)
window.__game = {
  world, player, spider, renderer, scene, camera, get tentacles() { return tentacles; },
  get state() { return state; },
  get camRow() { return camRow; },
  advance(sec) { for (let t = 0; t < sec; t += 1 / 60) step(1 / 60); render(); },
};

// --- Смена зон: плавный переход тумана, неба и оттенка ------------------------
const colA = new THREE.Color();
const colB = new THREE.Color();
const zoneLook = { fog: new THREE.Color(), near: 14, far: 34, tint: [1, 1, 1], light: 1 };

function blendZones(row) {
  const into = Math.max(0, row) % ZONE_LEN;                  // сколько рядов прошло в зоне
  const ai = zoneIndex(row);
  const a = ZONES[ai];
  const b = ZONES[(ai + 1) % ZONES.length];
  const k = THREE.MathUtils.smoothstep(into, ZONE_LEN - 8, ZONE_LEN);  // переход за 8 рядов до границы
  colA.set(a.pal.fog);
  colB.set(b.pal.fog);
  zoneLook.fog.copy(colA).lerp(colB, k);
  zoneLook.near = THREE.MathUtils.lerp(a.fog[0], b.fog[0], k);
  zoneLook.far = THREE.MathUtils.lerp(a.fog[1], b.fog[1], k);
  for (let c = 0; c < 3; c++) zoneLook.tint[c] = THREE.MathUtils.lerp(a.tint[c], b.tint[c], k);
  zoneLook.light = THREE.MathUtils.lerp(a.light ?? 1, b.light ?? 1, k);  // общая яркость (кладбище темнее)
}

function updateZone(dt) {
  const zi = zoneIndex(player.row);
  if (zi !== zoneShown && state === 'play') {
    const zone = ZONES[zi];
    if (zoneShown !== -1) audio.play('zone');
    zoneShown = zi;
    ui.zone.textContent = zone.name;
    ui.zone.classList.add('show');
    bannerT = 2.6;
    audio.setZone(zone.sound);
    dust.setMode(zone.particles);
    mist.setOn(!!zone.mist);
  }
  if (bannerT > 0 && (bannerT -= dt) <= 0) ui.zone.classList.remove('show');
}

// --- Цикл -----------------------------------------------------------------
let last = performance.now();
let time = 0;
audio.setZone(ZONES[0].sound);

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  ui.pauseBtn.hidden = state !== 'play' || (paused && countdown > 0);
  if (paused) {
    tickPause(dt);  // мир стоит; во время отсчёта кадр тот же
  } else {
    step(dt);
  }
  render();
  requestAnimationFrame(frame);
}

function step(dt) {
  time += dt;
  sharedTime.value = time;

  world.update(dt * PACE, Math.floor(camRow) - 4, Math.ceil(camRow) + 12);
  player.update(dt, world, time);
  tentacles.update(dt * PACE, world, player, camRow - player.row);
  // кладбище: каждые 7–11 с перед героем из-под земли лезет рука мертвеца
  world.heroRow = player.row;  // свежая рука ждёт, пока герой подойдёт
  if (state === 'play' && player.alive && world.zoneOf(player.row).hands) {
    handT -= dt * PACE;
    if (handT <= 0) handT = world.spawnHandAhead(player.row, player.obj.position.x) ? 7 + Math.random() * 4 : 0.5;
  }
  fx.update(dt);

  let danger = 0;
  if (state === 'play') {
    if (player.row > score) { score = player.row; ui.score.textContent = String(score); }

    // Камера (а с ней и тьма сзади) ползёт вперёд сама и догоняет убежавшего игрока
    const pr = -player.obj.position.z;
    if (moved) camRow += (0.4 + difficulty(score) * 0.35) * DARK_PACE * dt * PACE;
    if (pr > camRow) camRow += (pr - camRow) * Math.min(1, dt * 4);

    const lag = camRow - player.row;
    danger = Math.max(0, Math.min(1, (lag - 2.3) / 0.7));
    if (lag > 3.0 && player.alive && !player.hopping) {
      spider.grab();
      player.kill('spider');
    }
  } else if (state === 'dead') {
    deathT += dt;
    if (deathT > 0.8 && !ui.screen.classList.contains('show')) {
      showScreen(`${deathText(player.death?.kind)} · ${score}`, 'коснись, чтобы попробовать снова');
    }
  }
  updateZone(dt);

  // Паук крадётся во тьме рядом с отстающим героем; схватив — утаскивает во тьму
  spider.update(dt, time, player.obj.position, state === 'play' ? danger : 0);
  if (spider.holding) spider.carry(player.obj.position);

  // поле шире экрана — камера следует за героем, края поля уходят за экран
  const camGoal = Math.max(-CAM.followMax, Math.min(CAM.followMax, player.obj.position.x * CAM.follow));
  camX += (camGoal - camX) * Math.min(1, dt * 4);
  world.ensure(Math.ceil(camRow) + 26);
  world.prune(Math.floor(camRow) - 8);
  dust.update(dt, time, camX, -camRow);
  mist.update(dt, camX, -camRow);
  edges.position.z = -camRow;

  // Туман, небо и оттенок по зоне
  blendZones(camRow + 4);
  scene.background.copy(zoneLook.fog);
  scene.fog.color.copy(zoneLook.fog);
  scene.fog.near = zoneLook.near;
  scene.fog.far = zoneLook.far;
  hemi.intensity = 0.32 * zoneLook.light;
  key.intensity = 1.7 * zoneLook.light;

  // Камера сверху-сзади
  shake = Math.max(0, shake - dt * 1.2);
  const sx = (Math.random() - 0.5) * shake;
  const sz = (Math.random() - 0.5) * shake;
  const [ox, oy, oz] = CAM.offset;
  const tx = camX + sx;
  const tz = -camRow - CAM.lookAhead + sz;
  camera.position.set(tx + ox, oy, tz + oz);
  camera.lookAt(tx, 0, tz);
  camera.updateMatrixWorld();
  updateWarnings(dt);

  // Ключевой свет и его тени следуют за камерой
  key.target.position.set(tx, 0, tz - 1);
  key.position.copy(key.target.position).add(KEY_OFFSET);
  updateLights(tx, tz);

  // Звук: близость опасностей и воды, тревога паука
  const prox = world.proximity(player.row, player.obj.position.x);
  // бег паука: выбегает к герою или утаскивает его — громкость по расстоянию до камеры
  const running = spider.state === 'rush' || spider.state === 'drag';
  const run = running ? Math.max(0, 1 - Math.abs(spider.x - camX) / 8) : 0;
  audio.update(dt, { ...prox, danger: state === 'play' ? danger : 0, run, runX: spider.x - camX });

  lastDanger = danger;
}

let lastDanger = 0;
// --- Стрелки у краёв экрана --------------------------------------------------
// Ловушка ещё не видна (за краем экрана или во тьме за краем поля), но через ~2.5 с
// выедет в ряд героя или в три ряда перед ним — у того края, откуда она едет, на высоте
// ряда разгорается стрелка. Охотник целится — тоже. Стрелки плавно появляются и гаснут.
const WARN_TIME = 2.5;
const WARN_ROWS = [0, 1, 2, 3];  // ряды относительно героя
const warns = new Map();  // ряд*2+сторона -> { el, k, y, side }
const warnV = new THREE.Vector3();
function updateWarnings(dt) {
  const want = new Map();
  if (state === 'play' && !paused && player.alive) {
    const pr = player.row;
    for (const t of world.threats(pr + WARN_ROWS[0], pr + WARN_ROWS[WARN_ROWS.length - 1])) {
      const side = t.aim !== undefined ? Math.sign(t.x) : -Math.sign(t.dir);  // откуда надвигается
      warnV.set(t.x + 1, 0.3, -t.i).project(camera);
      const n1 = warnV.x;
      warnV.set(t.x, 0.3, -t.i).project(camera);
      const n0 = warnV.x, y = warnV.y;
      // где ловушку станет видно: край экрана или кромка тьмы — что ближе к центру
      const screenX = t.x + (side - n0) / (n1 - n0);
      const edge = side > 0 ? Math.min(screenX, DARK_EDGE) : Math.max(screenX, -DARK_EDGE);
      const behind = side * (t.x - edge);  // > 0 — ещё не видна
      if (behind <= 0) continue;
      let k;
      if (t.aim !== undefined) {
        k = 0.35 + 0.65 * t.aim;
      } else {
        const time = behind / (t.speed * PACE);
        if (time > WARN_TIME) continue;
        k = 0.45 + 0.55 * (1 - time / WARN_TIME);  // издалека уже заметна, ближе — ярче
      }
      const key = t.i * 2 + (side > 0 ? 1 : 0);
      if (!(want.get(key)?.k >= k)) want.set(key, { k, y, side });
    }
  }
  for (const [key, w] of want) {
    let cur = warns.get(key);
    if (!cur) {
      const el = document.createElement('div');
      el.className = `edge-warn${w.side > 0 ? ' right' : ''}`;
      document.body.appendChild(el);
      cur = { el, k: 0 };
      warns.set(key, cur);
    }
    cur.y = w.y;
    cur.target = w.k;
  }
  for (const [key, cur] of warns) {
    if (!want.has(key)) cur.target = 0;
    cur.k += (cur.target - cur.k) * Math.min(1, dt * 12);
    if (cur.target === 0 && cur.k < 0.03) { cur.el.remove(); warns.delete(key); continue; }
    cur.el.style.top = `${((1 - cur.y) / 2) * 100}%`;
    cur.el.style.opacity = Math.min(1, cur.k * 1.2).toFixed(2);
  }
}

function render() {
  post.render(time, lastDanger, zoneLook.tint);
}
// Все шейдеры компилируются и первый кадр рисуется, пока заставка ещё закрывает экран
try {
  step(0);
  renderer.compile(scene, camera);
  render();
} catch (e) {
  console.error(e);
}
await Promise.race([splashMin, splashTap]);
splash.classList.add('done');
last = performance.now();
requestAnimationFrame(frame);
