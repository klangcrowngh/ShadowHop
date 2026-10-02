import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HALF, SPAN, LOOP, DARK_EDGE, difficulty } from './config.js';
import { MAT, TEX, zoneMat, makeWater, poolMat, shaftMat } from './materials.js';
import { ZONE_LEN, zoneAt } from './zones.js';

// Ряды:
//   grass  — безопасная земля с препятствиями;
//   road   — по дорожке катится опасность (пила / шипастый шар / шестерня / вагонетка);
//   river  — вода, переходить по плавучим предметам (брёвна / кувшинки / плоты / двери);
//   bridge — пропасть с настилом из досок: доска проседает и падает через миг
//            после того, как на неё встали, часть досок уже выпала;
//   hunt   — открытая тропа, с края из тьмы охотник замахивается и бросает снаряд вдоль ряда.
// Как выглядят ловушки и декор, решает зона ряда (zones.js).

const SLAB_H = 2.6;   // толщина земли — видна стенка у пропастей и воды
const slabGeo = new THREE.BoxGeometry(SPAN * 2, SLAB_H, 1).translate(0, -SLAB_H / 2, 0);
const flatGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const waterGeo = new THREE.PlaneGeometry(SPAN * 2, 1).rotateX(-Math.PI / 2);
const pitGeo = new THREE.PlaneGeometry(SPAN * 2, 1).rotateX(-Math.PI / 2);
const shaftGeo = new THREE.CylinderGeometry(0.9, 1.6, 9, 20, 1, true).translate(0, 4.5, 0);
const shadowMat = new THREE.MeshBasicMaterial({ map: TEX.shadow, transparent: true, depthWrite: false });

const rand = (a, b) => a + Math.random() * (b - a);
const irand = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function pickWeighted(list) {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of list) if ((r -= w) <= 0) return v;
  return list[0][0];
}

const DETAIL_VARIANTS = 4;
const DECOR_REACH = 3;  // декор за краем поля — не дальше 3 клеток: дальше всё равно сплошная тьма
// предметы, на которые можно поставить логотип (см. _brand)
const BRAND_SPOTS = new Set(['boat2', 'boat3', 'log2', 'log3', 'crate', 'barrel', 'crate_pile', 'stump', 'raft2', 'raft3',
  'door2', 'door3', 'lily', 'plank', 'plank_swamp', 'grate', 'slab', 'signpost', 'pillar']);
const HUNTER_X = DARK_EDGE + 0.3;    // охотник стоит на кромке тьмы
const WINDUP = 0.8;                   // замах перед броском, с
const PROJ_HIT = 0.42;
const PROJ_SCALE = 1.5;
// Паровые клапаны (ряд 'steam', лесопилка): решётки через клетку, часть пропущена; клапаны
// срабатывают волной по ряду: покой → раскаляется и шипит → бьёт столб пара (смерть)
const MOVER_PACE = 0.95;  // скорость всего, что едет, плывёт и летит вдоль рядов
// Руки мертвецов (кладбище): появляются перед героем (spawnHandAhead), дальше у каждой свой ритм:
// покой → земля шевелится, тлеет зелёным и сыплются комья → рука вырывается и шарит → уходит.
// Время — до конца цикла: warn за 1,8 с, рывок за 1,2 с, прячется за 0,3 с (снаружи 0,9 с)
const HANDS = { warn: 1.8, burst: 1.2, out: 0.3, down: -1.05 };
// предметы, которые ставятся «лицом» к камере (надгробия, кресты, ограды, склепы)
const FACING = new Set(['tombstone', 'tombstone_b', 'monument', 'celtic_cross', 'iron_fence', 'iron_gate', 'crypt']);
// Кованые ворота (ряд 'gates', кладбище): поперёк поля ограда, в ней 2–3 ворот, у каждых свой
// ритм (с конца цикла): распахнуты → дрожат и скрипят 0,5 с → захлопываются за 0,25 с →
// закрыты 0,9 с → распахиваются за 0,3 с. В закрытые врезаются; стоявшего в проёме отбрасывает
const GATE = { open: 1.35, warn: 0.5, shut: 0.25, closed: 0.9, opening: 0.3 };
const STEAM = { period: 4.2, warn: 2.85, blast: 3.55, step: 0.5 };
// Паровой молот (ряд 'press', лесопилка): цикл в секундах мира
const PRESS = {
  period: 2.0,
  hiss: 0.75,    // с этого момента шипит пар и мигает лампа — сейчас ударит
  slam: 1.05,    // начало падения
  hit: 1.15,     // удар о землю
  lift: 1.45,    // начинает подниматься
  high: 1.35,    // высота бойка в верхней точке
  low: 0.21,     // в нижней (боёк на земле)
  deadly: 0.62,  // ниже этой высоты под бойком смерть
};               // снаряды крупнее модели — чтобы их было видно
const trailGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const trailMat = new THREE.MeshBasicMaterial({
  map: TEX.trail, color: 0xffe6c0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
});
// Охотник стоит во тьме за краем поля: его материалы рисуются поверх слоя тьмы
// (прозрачный проход, renderOrder 6), за спиной — бледное туманное свечение,
// так что виден чёрный силуэт на светлом, как в Limbo
const overDark = new Map();
function overDarkMat(mat) {
  let m = overDark.get(mat);
  if (!m) {
    m = mat.clone();
    m.transparent = true;
    m.depthWrite = true;
    overDark.set(mat, m);
  }
  return m;
}
const backMat = new THREE.SpriteMaterial({
  map: TEX.glow, color: 0x9aa3ad, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.22,
});
const aimMat = new THREE.MeshBasicMaterial({
  color: 0xff9a70, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0,
});

// Слияние частей [геометрия, матрица] в одну геометрию (позиции, нормали, индексы)
// прямо по массивам — в разы быстрее, чем clone + applyMatrix4 + mergeGeometries
const _nm = new THREE.Matrix3();
function mergeTransformed(parts) {
  let nv = 0, ni = 0;
  for (const [g] of parts) {
    const n = g.attributes.position.count;
    nv += n;
    ni += g.index ? g.index.count : n;
  }
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const [g, m] of parts) {
    const P = g.attributes.position, N = g.attributes.normal;
    const e = m.elements;
    const ne = _nm.getNormalMatrix(m).elements;
    const n = P.count;
    for (let k = 0; k < n; k++) {
      const x = P.getX(k), y = P.getY(k), z = P.getZ(k);
      const o = (vo + k) * 3;
      pos[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
      pos[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      pos[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const a = N.getX(k), b = N.getY(k), c = N.getZ(k);
      const nx = ne[0] * a + ne[3] * b + ne[6] * c;
      const ny = ne[1] * a + ne[4] * b + ne[7] * c;
      const nz = ne[2] * a + ne[5] * b + ne[8] * c;
      const l = 1 / (Math.hypot(nx, ny, nz) || 1);
      nor[o] = nx * l; nor[o + 1] = ny * l; nor[o + 2] = nz * l;
    }
    if (g.index) {
      const src = g.index.array;
      for (let k = 0; k < src.length; k++) idx[io + k] = src[k] + vo;
      io += src.length;
    } else {
      for (let k = 0; k < n; k++) idx[io + k] = vo + k;
      io += n;
    }
    vo += n;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}

export class World {
  constructor(scene, models, logo = null) {
    this.models = models;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.rows = new Map();
    this.t = 0;
    this.onSpark = () => {};
    this.onEvent = () => {};  // (тип, x, z) — для звука
    this.onSteam = () => {};  // (x, y, z, сила) — клубы пара
    this.onVentSteam = () => {};  // (x, z, 0..1 выброса) — струя пара из клапана
    this.logo = logo;         // src/logo.js: клейма, плакаты и вывески Rentrobot
    this.details = new Map(); // zone.id -> варианты мелочи на земле
    this.tracks = new Map();  // стиль дорожки -> части
    this.reset();
  }

  reset() {
    for (const r of this.rows.values()) this._remove(r);
    this.rows.clear();
    this.queue = [];
    this.freeCol = 0;
    this.prevType = null;
    this.prevDir = 1;
    this.lastHazard = null;
    this.lastGroup = 0;
    this.nextLogo = 5;  // ряд, начиная с которого ставится следующий логотип
    this.gen = -10;
    this.ensure(24);
  }

  row(i) { return this.rows.get(i); }
  zoneOf(i) { return this.rows.get(i)?.zone ?? zoneAt(i); }

  ensure(upTo) {
    while (this.gen <= upTo) {
      const type = this._nextType(this.gen);
      this._add(this.gen, type);
      this.prevType = type;
      this.gen++;
    }
  }

  prune(below) {
    for (const [i, r] of this.rows) {
      if (i < below) { this._remove(r); this.rows.delete(i); }
    }
  }

  _remove(r) {
    this.root.remove(r.group);
    r.water?.dispose();
    for (const geo of r.baked) geo.dispose();
  }

  // ---------------------------------------------------------------------------
  // Обновление: движение, доски, охотники. lo..hi — видимые ряды.
  // ---------------------------------------------------------------------------
  update(dt, lo, hi) {
    this.t += dt;
    for (const r of this.rows.values()) {
      const visible = r.i >= lo && r.i <= hi;
      if (r.movers.length) this._updateMovers(r, dt, visible);
      if (r.belt) r.belt.position.x = ((this.t * r.speed * r.dir) % 0.45 + 0.45) % 0.45;
      if (r.planks) this._updatePlanks(r, dt);
      if (r.hunter) this._updateHunter(r, dt, visible);
      if (r.press) this._updatePress(r, dt, visible);
      if (r.vents) this._updateVents(r, dt, visible);
      if (r.hands) this._updateHands(r, dt, visible);
      if (r.gates) this._updateGates(r, dt, visible);
      if (r.traps) {  // захлопнувшиеся капканы: челюсти смыкаются за ~0,07 с
        for (const t of r.traps) {
          if (!t.shut || t.k >= 1) continue;
          t.k = Math.min(1, t.k + dt * 14);
          t.jawA.rotation.x = 1.45 * t.k;
          t.jawB.rotation.x = -1.45 * t.k;
        }
      }
    }
  }

  // Клапаны: у каждого свой сдвиг по фазе — волна пара бежит по ряду
  _updateVents(r, dt, visible) {
    r.ventT += dt;
    for (const v of r.vents) {
      const prev = v.tt ?? 0;
      const tt = (r.ventT + v.phase) % STEAM.period;
      v.tt = tt;
      const wrapped = tt < prev;
      const warm = tt >= STEAM.warn ? Math.min(1, (tt - STEAM.warn) / (STEAM.blast - STEAM.warn)) : 0;
      v.hot = tt >= STEAM.blast;
      v.glow.material.opacity = v.hot ? 0.9 : warm * 0.8;
      if (!visible || !v.inField) continue;
      if (v.hot) {  // струя пара — клубы, поднимающиеся из клапана
        v.puffT = (v.puffT ?? 0) - dt;
        if (v.puffT <= 0) {
          v.puffT = 0.07;
          this.onVentSteam(v.x, -r.i, (tt - STEAM.blast) / (STEAM.period - STEAM.blast));
        }
      }
      if (prev < STEAM.warn && tt >= STEAM.warn && !wrapped) this.onEvent('ventHiss', v.x, -r.i);
      if (prev < STEAM.blast && tt >= STEAM.blast && !wrapped) { this.onEvent('ventBlast', v.x, -r.i); this.onSteam(v.x, 0.3, -r.i, 1); }
      if (v.hot && Math.random() < dt * 14) this.onSteam(v.x, 0.9 + Math.random() * 0.6, -r.i, 0.4);
      else if (warm > 0.3 && Math.random() < dt * 3) this.onSteam(v.x, 0.12, -r.i, 0.05);  // струйки перед выбросом
    }
  }

  _updateHands(r, dt, visible) {
    for (const h of r.hands) {
      h.t += dt;
      if (h.pop !== undefined && h.pop < 1) {  // земля вспучивается
        h.pop = Math.min(1, h.pop + dt * 3);
        h.mound.scale.set(h.pop, 0.3 + h.pop * 0.7, h.pop);
      }
      if (h.wait !== undefined) {  // свежая рука: шевелит землю, пока герой не подойдёт (или 2,5 с)
        h.wait += dt;
        if (this.heroRow >= r.i - 2 || h.wait > 2.5) {  // герой за два ряда — к его подходу рука уже снаружи
          h.t = h.period - HANDS.burst - 0.35;  // рывок через 0,35 с
          delete h.wait;
        } else {
          h.t = h.period - HANDS.warn + 0.45;  // держим в фазе предупреждения — свечение почти в полную силу
        }
      }
      const P = h.period, warnAt = P - HANDS.warn, burstAt = P - HANDS.burst, outAt = P - HANDS.out;
      const prev = h.tt ?? 0;
      const tt = h.t % P;
      h.tt = tt;
      const wrapped = tt < prev;
      const D = HANDS.down;
      let y;
      if (h.grab) {  // схватила — держит и утягивает вместе с героем
        h.grabT += dt;
        y = h.grabT < 0.35 ? 0 : -Math.min(1.2, (h.grabT - 0.35) * 0.9 * (1 + h.grabT));
      } else if (tt < burstAt) y = D;
      else if (tt < burstAt + 0.15) y = D * (1 - (tt - burstAt) / 0.15);
      else if (tt < outAt) y = Math.sin(tt * 9 + h.x) * 0.02;
      else y = D * Math.min(1, (tt - outAt) / (P - outAt));
      h.hand.position.y = y;
      h.hand.visible = y > D + 0.02;
      h.hot = !h.grab && y > -0.45;
      if (!h.grab) h.hand.rotation.z = Math.sin(this.t * 6 + h.x) * 0.15;  // шарит
      const warm = tt >= warnAt && tt < outAt ? Math.min(1, (tt - warnAt) / (burstAt - warnAt)) : 0;
      h.glow.material.opacity = warm * 0.7 * (0.8 + 0.2 * Math.sin(this.t * 20 + h.x));
      if (!visible || !h.inField) continue;
      if (tt >= warnAt && tt < burstAt && Math.random() < dt * 7) {  // комья и пыль над шевелящейся землёй
        this.onSteam(h.x + rand(-0.2, 0.2), 0.04, -r.i + rand(-0.2, 0.2), 0.08);
      }
      if (prev < warnAt && tt >= warnAt && !wrapped) this.onEvent('handWarn', h.x, -r.i);
      if (prev < burstAt && tt >= burstAt && !wrapped) { this.onEvent('handBurst', h.x, -r.i); this.onSteam(h.x, 0.1, -r.i, 0.8); }
    }
  }

  // Молот: висит → шипит и дрожит → бьёт → держит → поднимается
  _updatePress(r, dt, visible) {
    const p = r.press;
    const prev = p.t % PRESS.period;
    p.t += dt;
    const t = p.t % PRESS.period;
    const cross = (at) => (prev < at && t >= at) || (prev > t && (at > prev || at <= t));
    let y;
    if (t < PRESS.slam) {
      y = PRESS.high;
      if (t >= PRESS.hiss) y += Math.sin(p.t * 70) * 0.012;  // дрожит перед ударом
    } else if (t < PRESS.hit) {
      const k = (t - PRESS.slam) / (PRESS.hit - PRESS.slam);
      y = PRESS.high + (PRESS.low - PRESS.high) * k * k;
    } else if (t < PRESS.lift) {
      y = PRESS.low;
    } else {
      const k = (t - PRESS.lift) / (PRESS.period - PRESS.lift);
      y = PRESS.low + (PRESS.high - PRESS.low) * (1 - (1 - k) ** 2);
    }
    p.y = y;
    p.head.position.y = y - PRESS.low;
    const top = y - PRESS.low + 0.51, beam = 1.83;
    p.rod.position.y = (top + beam) / 2;
    p.rod.scale.y = Math.max(0.05, beam - top);
    const warn = t >= PRESS.hiss && t < PRESS.lift;
    p.lamp.material.color.setRGB(warn ? 2.4 : 0.35, warn ? 0.5 : 0.08, warn ? 0.2 : 0.05);
    p.shadow.material.opacity = 0.25 + 0.6 * (1 - (y - PRESS.low) / (PRESS.high - PRESS.low));
    if (!visible) return;
    const x = p.col, z = -r.i;
    if (cross(PRESS.hiss)) { this.onEvent('pressHiss', x, z); this.onSteam(x, 1.6, z, 0.6); }
    if (cross(PRESS.hit)) { this.onEvent('pressSlam', x, z); this.onSteam(x, 0.15, z, 1); }
  }

  _updateMovers(r, dt, visible) {
    const spec = r.road;
    for (const m of r.movers) {
      m.x += r.dir * r.speed * dt * (m.hold ?? 1);  // hold < 1 — кувшинку держит щупальце
      if (m.x > LOOP / 2) m.x -= LOOP;
      else if (m.x < -LOOP / 2) m.x += LOOP;
      m.obj.position.x = m.x;
      if (r.type === 'road') {
        if (spec.roll) m.blade.rotation.z -= (r.dir * r.speed / spec.roll) * dt;
        else if (spec.spin) m.blade.rotation.z -= r.dir * spec.spin * dt;
        const near = visible && Math.abs(m.x) < DARK_EDGE + 2;
        if (spec.bounce) {  // подскакивает на кочках; касание земли — глухой стук
          const b = Math.sin(this.t * 7 + m.phase);
          m.blade.position.y = spec.y + Math.abs(b) * spec.bounce;
          if (near && m.bPrev !== undefined && (b > 0) !== (m.bPrev > 0)) this.onEvent(spec.bump ?? 'logBump', m.x, -r.i);
          m.bPrev = b;
        }
        if (spec.run) {  // галоп: передние и задние ноги в противофазе, тело подпрыгивает
          m.legs ??= ['Leg0', 'Leg1', 'Leg2', 'Leg3'].map((n) => m.blade.getObjectByName(n)).filter(Boolean);
          const ph = this.t * (6 + r.speed * 2.2) + m.phase;
          m.legs.forEach((leg, k) => { leg.rotation.x = Math.sin(ph + [0, 0.5, Math.PI, Math.PI + 0.5][k]) * 0.75; });
          // копыта касаются земли дважды за шаг (передняя и задняя пара) — топот
          const f = Math.sin(ph);
          if (near && m.fPrev !== undefined && (f > 0) !== (m.fPrev > 0)) this.onEvent('hoof', m.x, -r.i);
          m.fPrev = f;
          m.gruntT = (m.gruntT ?? rand(0.5, 2.5)) - dt;
          if (near && m.gruntT <= 0) { m.gruntT = rand(1.6, 3.4); this.onEvent('boarGrunt', m.x, -r.i); }
          m.blade.position.y = spec.y + Math.abs(Math.sin(ph)) * 0.05;
          m.blade.rotation.x = Math.sin(ph) * 0.05;
        }
        if (spec.wheels) {  // колёса катафалка крутятся, кузов поскрипывает
          m.wheels ??= [0, 1, 2, 3].map((k) => m.blade.getObjectByName(`Wheel${k}`)).filter(Boolean);
          m.wheels.forEach((wh, k) => { wh.rotation.x += (r.speed / (k < 2 ? 0.21 : 0.28)) * dt; });
          m.blade.position.y = spec.y + Math.abs(Math.sin(this.t * 9 + m.phase)) * 0.015;
          m.clackD = (m.clackD ?? rand(0, 0.4)) + r.speed * dt;  // колёса стучат о стыки плит — чаще на скорости
          if (m.clackD > 0.42) { m.clackD = rand(-0.08, 0); if (near) this.onEvent('hearseClack', m.x, -r.i); }
          m.creakT = (m.creakT ?? rand(0.5, 2)) - dt;
          if (near && m.creakT <= 0) { m.creakT = rand(1.2, 2.6); this.onEvent('hearseCreak', m.x, -r.i); }
        }
        if (spec.hover) {  // парит: покачивается, клонится по ходу, изредка стонет
          m.blade.position.y = spec.y + Math.sin(this.t * 2.6 + m.phase) * 0.07;
          m.blade.rotation.x = -0.4 + Math.sin(this.t * 1.7 + m.phase) * 0.06;  // откинут назад — лицо к камере сверху
          m.moanT = (m.moanT ?? rand(0.5, 3)) - dt;
          if (near && m.moanT <= 0) { m.moanT = rand(2.5, 5); this.onEvent('ghostMoan', m.x, -r.i); }
        }
        if (spec.dust && visible && Math.abs(m.x) < DARK_EDGE + 1 && Math.random() < dt * 5) {
          this.onSteam(m.x - r.dir * 0.35, 0.08, -r.i + rand(-0.15, 0.15), 0.1);  // пыль из-под копыт / от бревна
        }
        if (spec.sparks && visible && Math.abs(m.x) < DARK_EDGE + 1 && Math.random() < dt * 30) {
          this.onSpark(m.x - r.dir * 0.3, 0.06, -r.i + rand(-0.05, 0.05), -r.dir);
        }
      } else {
        // Пружина: осадка (dip) и крен (roll) тянутся к цели и раскачиваются.
        // Под грузом предмет сидит глубже и наклонён к герою; прыжок на него — толчок.
        const small = m.len === 1;  // кувшинки легче — раскачиваются сильнее
        const dipTarget = (m.load ?? 0) * (small ? 0.09 : 0.06);
        const rollTarget = (m.load ?? 0) * -(m.loadOffset ?? 0) * (small ? 0.12 : 0.07);
        m.dipV += (-(m.dip - dipTarget) * 90 - m.dipV * 7) * dt;
        m.dip += m.dipV * dt;
        m.rollV += (-(m.roll - rollTarget) * 60 - m.rollV * 5) * dt;
        m.roll += m.rollV * dt;
        const bob = Math.sin(this.t * 1.8 + m.phase) * 0.035 + Math.sin(this.t * 2.9 + m.phase * 2) * 0.015;
        m.blade.position.y = r.zone.float.y + bob - m.dip - (m.sink ?? 0);  // sink — тянет щупальце
        m.blade.rotation.x = Math.sin(this.t * 1.2 + m.phase) * 0.07 + m.dip * 0.8;
        m.blade.rotation.z = Math.sin(this.t * 0.8 + m.phase * 1.7) * 0.06 + m.roll;
        if (small) m.blade.rotation.y += dt * 0.15 * (m.phase > 3 ? 1 : -1);  // кувшинка медленно кружится
      }
    }
  }

  _updatePlanks(r, dt) {
    const fallTime = 0.75 - difficulty(r.i) * 0.3;
    for (const p of r.planks.values()) {
      if (p.state === 'creak') {
        p.t += dt;
        const k = p.t / fallTime;
        p.obj.position.set(p.x + Math.sin(this.t * 60) * 0.02 * k, -0.03 * k, Math.cos(this.t * 47) * 0.015 * k);
        p.obj.rotation.z = Math.sin(this.t * 35) * 0.04 * k;
        if (p.t >= fallTime) {
          p.state = 'fall';
          p.v = 0;
          this.onEvent('plankFall', p.x, -r.i);
        }
      } else if (p.state === 'fall') {
        p.v += 12 * dt;
        p.obj.position.y -= p.v * dt;
        p.obj.rotation.x += dt * 2.5;
        p.obj.rotation.z += dt * 1.3;
        if (p.obj.position.y < -4) { p.obj.visible = false; p.state = 'gone'; }
      }
    }
  }

  _updateHunter(r, dt, visible) {
    const h = r.hunter;
    h.t += dt;
    if (h.state === 'wait') {
      h.arm && (h.arm.rotation.x += (0 - h.arm.rotation.x) * Math.min(1, dt * 6));
      h.aim.material.opacity = Math.max(0, h.aim.material.opacity - dt * 2);
      if (visible && h.t > h.next) {
        h.state = 'windup';
        h.t = 0;
        this.onEvent(`windup_${r.zone.projectile.model}`, h.x, -r.i);
      }
    } else if (h.state === 'windup') {
      const k = Math.min(1, h.t / WINDUP);
      if (h.arm) h.arm.rotation.x = -1.7 * k;   // рука с оружием заносится назад-вверх
      h.glow.material.opacity = 0.3 + k * 1.4;  // глаза разгораются — предупреждение
      h.back.material.opacity = 0.22 + k * 0.3;
      h.aim.material.opacity = k * (0.28 + 0.12 * Math.sin(h.t * 30));  // линия прицела вдоль ряда
      if (h.t >= WINDUP) {
        h.state = 'throw';
        h.t = 0;
        this._throw(r);
      }
    } else if (h.state === 'throw') {
      if (h.arm) h.arm.rotation.x = Math.min(0.9, -1.7 + h.t * 20);
      h.glow.material.opacity = Math.max(0.3, h.glow.material.opacity - dt * 2);
      h.back.material.opacity = Math.max(0.22, h.back.material.opacity - dt * 1.2);
      if (h.t > 0.35) {
        h.state = 'wait';
        h.t = 0;
        h.next = rand(1.6, 3.2) - difficulty(r.i) * 0.7;
      }
    }
    for (const p of r.projectiles) {
      p.x += p.dir * p.speed * dt;
      p.obj.position.x = p.x;
      if (p.spin) p.model.rotation.z += p.spin * dt;
    }
    r.projectiles = r.projectiles.filter((p) => {
      if (Math.abs(p.x) < SPAN) return true;
      r.group.remove(p.obj);
      return false;
    });
  }

  _throw(r) {
    const h = r.hunter;
    const spec = r.zone.projectile;
    const dir = -h.side;
    const obj = new THREE.Group();
    const model = this.models.make(spec.model);
    model.scale.setScalar(PROJ_SCALE);
    model.rotation.y = dir > 0 ? 0 : Math.PI;
    // светящийся хвост позади и искра на острие — снаряд видно издалека
    const trail = new THREE.Mesh(trailGeo, trailMat);
    trail.scale.set(1.8, 1, 0.16);
    trail.position.set(-dir * 0.9, 0, 0);
    trail.rotation.y = dir > 0 ? 0 : Math.PI;
    const tip = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX.glow, color: 0xffe0b0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.9,
    }));
    tip.scale.setScalar(0.45);
    tip.position.x = dir * 0.2 * PROJ_SCALE;
    const shadow = new THREE.Mesh(flatGeo, shadowMat);
    shadow.scale.set(0.9, 1, 0.25);
    shadow.position.y = -0.69;
    obj.add(model, trail, tip, shadow);
    obj.position.set(h.x + dir * 0.35, 0.72, 0);
    r.group.add(obj);
    r.projectiles.push({ obj, model, x: obj.position.x, dir, speed: (8.5 + difficulty(r.i) * 4) * MOVER_PACE, spin: spec.spin, name: spec.model });
    this.onEvent(`throw_${spec.model}`, h.x, -r.i);
  }

  // ---------------------------------------------------------------------------
  // Запросы от игрока
  // ---------------------------------------------------------------------------
  // Молот опущен — в клетку не пустить: герой врезается, как в препятствие
  pressBlocks(i, x) {
    const r = this.rows.get(i);
    if (r?.gates) return r.gates.some((gt) => gt.x === Math.round(x) && gt.angle < GATE.open * 0.75);  // ворота закрыты
    return r?.type === 'press' && Math.round(x) === r.press.col && r.press.y < PRESS.deadly;
  }

  // Что убивает на клетке прямо сейчас: 'road' | 'hunt' | null
  // Подробности удара кладутся в lastHit: { what: модель, dir: направление движения }
  hazardAt(i, x) {
    const r = this.rows.get(i);
    if (!r) return null;
    if (r.type === 'road') {
      const m = r.movers.find((mv) => Math.abs(mv.x - x) < r.road.hit);
      if (m) { this.lastHit = { what: r.road.model, dir: r.dir }; return 'road'; }
    }
    if (r.type === 'steam') {
      const v = r.vents.find((vv) => vv.inField && Math.abs(vv.x - x) < 0.4 && vv.hot);
      if (v) { this.lastHit = { what: 'steam', dir: 1 }; return 'steam'; }
    }
    if (r.hands) {
      const h = r.hands.find((hh) => hh.inField && hh.hot && Math.abs(hh.x - x) < 0.3);
      if (h) {
        h.grab = true;
        h.grabT = 0;
        this.lastHit = { what: 'hand', dir: 1 };
        return 'hand';
      }
    }
    if (r.type === 'press' && Math.abs(x - r.press.col) < 0.45 && r.press.y < PRESS.deadly) {
      this.lastHit = { what: 'press', dir: 1 };
      return 'press';
    }
    if (r.type === 'hunt') {
      const p = r.projectiles.find((pr) => Math.abs(pr.x - x) < PROJ_HIT);
      if (p) {
        this.lastHit = { what: p.name, dir: p.dir };
        r.group.remove(p.obj);  // снаряд остаётся в герое (см. Player)
        r.projectiles = r.projectiles.filter((pr) => pr !== p);
        return 'hunt';
      }
    }
    return null;
  }

  floatTop(i) { return this.rows.get(i)?.zone.float.top ?? 0.1; }

  logAt(i, x) {
    const r = this.rows.get(i);
    if (!r || r.type !== 'river') return null;
    let best = null;
    for (const m of r.movers) {
      const d = Math.abs(x - m.x);
      if (m.sunk) continue;  // утащена под воду щупальцем
      if (d <= m.len / 2 + 0.25 && (!best || d < Math.abs(x - best.x))) best = m;
    }
    return best;
  }

  // Встать на доску моста: true — держит (и начинает проседать), false — провал
  stepOnPlank(i, col) {
    const p = this.rows.get(i)?.planks?.get(col);
    if (!p || p.state === 'fall' || p.state === 'gone') return false;
    if (p.state === 'ok') {
      p.state = 'creak';
      p.t = 0;
      this.onEvent('creak', col, -i);
    }
    return true;
  }

  plankHolds(i, col) {
    const p = this.rows.get(i)?.planks?.get(col);
    return !!p && (p.state === 'ok' || p.state === 'creak');
  }

  // Для звука: расстояние до ближайшей катящейся опасности и до воды
  proximity(row, x) {
    let hazard = Infinity, hazardDx = 0, hazardType = null, water = Infinity, proj = Infinity, projType = null;
    for (let i = row - 2; i <= row + 3; i++) {
      const r = this.rows.get(i);
      if (!r) continue;
      const dz = Math.abs(i - row) * 1.3;
      if (r.type === 'road') {
        for (const m of r.movers) {
          const d = Math.hypot(m.x - x, dz);
          if (d < hazard) { hazard = d; hazardDx = m.x - x; hazardType = r.road.sound; }
        }
      }
      if (r.type === 'river') water = Math.min(water, dz);
      if (r.type === 'hunt') {
        for (const p of r.projectiles) {
          const d = Math.hypot(p.x - x, dz);
          if (d < proj) { proj = d; projType = p.name; }
        }
      }
    }
    return { hazard, hazardDx, hazardType, water, proj, projType };
  }

  // ---------------------------------------------------------------------------
  // Генерация
  // ---------------------------------------------------------------------------
  _nextType(i) {
    if (i < 5) return 'grass';
    if (i % ZONE_LEN === 0) this.queue = ['grass', 'grass']; // опушка на входе в новую зону
    if (!this.queue.length) {
      const zone = zoneAt(i);
      const d = difficulty(i);
      // Не больше 3 опасных рядов подряд (2 в начале), после длинной группы — 2 безопасных,
      // и тот же тип ловушки обычно не повторяется сразу за одним рядом травы — иначе рябит
      const safe = (this.lastGroup ?? 0) >= 2 ? (Math.random() < 0.4 ? 3 : 2) : Math.random() < 0.6 ? 2 : 1;
      for (let k = 0; k < safe; k++) this.queue.push('grass');
      const weights = Object.entries(zone.hazards).filter(([t]) => i > 12 || (t !== 'bridge' && t !== 'hunt'));
      let hazard = pickWeighted(weights);
      if (hazard === this.lastHazard && Math.random() < 0.75) {
        const others = weights.filter(([t]) => t !== hazard);
        if (others.length) hazard = pickWeighted(others);
      }
      const n = hazard === 'press' || hazard === 'gates' ? 1 : hazard === 'steam' ? 1 : irand(1, hazard === 'river' ? 2 + (d > 0.25 ? 1 : 0) : hazard === 'road' ? 2 + (d > 0.7 ? 1 : 0) : 2);
      for (let k = 0; k < n; k++) this.queue.push(hazard);
      if (hazard === 'press' || hazard === 'gates') this.queue.push('grass');  // за молотом и воротами — безопасная трава
      this.lastHazard = hazard;
      this.lastGroup = n;
    }
    return this.queue.shift();
  }

  _add(i, type) {
    const zone = zoneAt(i);
    const mats = zoneMat(zone);
    const g = new THREE.Group();
    g.position.z = -i;
    const row = { i, type, zone, group: g, blocked: new Set(), movers: [], dir: 1, speed: 0, projectiles: [], lights: [], brandable: [], statics: [], baked: [] };
    const d = difficulty(i);

    if (type === 'grass' || type === 'hunt') {
      g.add(this._ground(i & 1 ? mats.grassA : mats.grassB));
      this._addDetail(g, zone);
      if (type === 'grass') {
        this._placeObstacles(row, zone, d);
      } else {
        const path = new THREE.Mesh(flatGeo, mats.path);  // открытая тропа — видно, что тут простреливают
        path.scale.set(SPAN * 2, 1, 0.62);
        path.position.y = 0.004;
        path.receiveShadow = true;
        g.add(path);
        this._addHunter(row, zone);
      }
      this._addSideDecor(g, zone, row);
      // лучи света сверху отключены (плохо смотрелись); _addShaft оставлен на будущее
    } else if (type === 'steam') {
      g.add(this._ground(mats.road));
      this._addVents(row, zone, mats);
      this._addSideDecor(g, zone, row);
    } else if (type === 'gates') {
      g.add(this._ground(i & 1 ? mats.grassA : mats.grassB));
      this._addDetail(g, zone);
      this._addGates(row);
      this._addSideDecor(g, zone, row);
    } else if (type === 'press') {
      g.add(this._ground(mats.road));
      this._addPress(row, zone, mats);
      this._addSideDecor(g, zone, row);
    } else if (type === 'road') {
      this._pickDir(row, type);
      const road = row.road = pick(zone.roads);
      g.add(this._ground(mats.road));
      for (const [geo, key] of this._track(road.track)) {
        const m = new THREE.Mesh(geo, mats[key]);
        m.receiveShadow = true;
        g.add(m);
        if (key === 'roadEdge' && road.track === 'conveyor') row.belt = m;
      }
      row.speed = (rand(1.8, 2.8) + d * 2.5) * MOVER_PACE * (road.speed ?? 1);
      const count = irand(1, 2 + (d > 0.4 ? 1 : 0));
      this._spawnMovers(row, count, () => [road.model, 1], (name) => {
        const blade = this.models.make(name);
        blade.position.y = road.y;
        if (road.run || road.face) blade.rotation.y = row.dir > 0 ? Math.PI / 2 : -Math.PI / 2;  // мордой вперёд
        if (road.hover) blade.rotation.y = row.dir * (Math.PI / 2 - 0.75);  // призрак — вполоборота к камере, лицо видно
        const sh = new THREE.Mesh(flatGeo, shadowMat);
        sh.scale.set(1.1, 1, 0.55);
        sh.position.y = 0.03;
        if (road.hover) {  // призрак светится: мягкий холодный ореол вокруг
          const halo = new THREE.Sprite(new THREE.SpriteMaterial({
            map: TEX.glow, color: 0x7fb6d6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.35,
          }));
          halo.scale.setScalar(1.6);
          halo.position.y = road.y + 0.45;
          return [blade, sh, halo];
        }
        return [blade, sh];
      });
    } else if (type === 'river') {
      this._pickDir(row, type);
      row.speed = (rand(0.9, 1.5) + d) * MOVER_PACE;
      row.water = makeWater(row.dir * row.speed, zone);
      const w = new THREE.Mesh(waterGeo, row.water);
      w.position.y = -0.28;
      g.add(w);
      this._addWaterDecor(row, zone);
      // Плавучих столько, чтобы следующий подплывал не дольше чем через ~2–3 с:
      // промежуток между ними ≤ скорость × MAX_WAIT (чуть больше на высокой сложности)
      const avgLen = zone.float.models.reduce((a, [, l]) => a + l, 0) / zone.float.models.length;
      // между двумя реками — чаще: соседний ряд течёт навстречу, и снесённому к краю
      // плавучее с той стороны должно подойти, пока он не уехал во тьму
      const between = this.prevType === 'river' || this.queue[0] === 'river';
      // короткие кувшинки и так идут часто — их между реками прибавляем меньше
      const maxWait = between ? (avgLen < 1.5 ? 1.6 + d * 0.4 : 1.0 + d * 0.3) : 2.0 + d * 0.8;
      const count = clamp(Math.ceil(LOOP / (avgLen + row.speed * maxWait)), 3, 12);
      this._spawnMovers(row, count, () => pick(zone.float.models), (name) => {
        const f = this.models.make(name);
        f.position.y = zone.float.y;
        if (Math.random() < 0.5) f.rotation.y = Math.PI;
        if (name === 'lily') this._addLight(row, f, -0.08, 0.45, -0.06, 0.28);  // светящийся цветок
        if (name === 'boat3') this._addLight(row, f, 0.95, 0.62, 0, 0.4);     // фонарь на шесте у кормы
        row.brandable.push({ m: f, name });
        return [f];
      });
    } else if (type === 'bridge') {
      const pit = new THREE.Mesh(pitGeo, mats.pit);
      pit.position.y = -SLAB_H;
      g.add(pit);
      this._addBridge(row, zone, d);
    }

    // что в этом ряду непроходимо — для проверки тупиков следующего ряда (трава — в _placeObstacles)
    if (type === 'bridge') this.lastBlocked = new Set([-3, -2, -1, 0, 1, 2, 3].filter((x) => !row.planks.has(x)));
    else if (type === 'press' || type === 'gates') this.lastBlocked = row.blocked;

    this._scheduleLogo(row);
    this._bake(row);
    this.rows.set(i, row);
    this.root.add(g);
  }

  // Ровный ритм логотипов: ровно один каждые 5–7 рядов, на подходящем предмете
  // в поле. Нет подходящего — переносится на следующий ряд (на траве в крайнем
  // случае кладётся сорванный плакат на землю).
  _scheduleLogo(row) {
    if (!this.logo || row.i < this.nextLogo) return;
    const cands = row.brandable.filter((c) => BRAND_SPOTS.has(c.name));
    if (row.type === 'river' && cands.length) {
      // плавучие уходят за край — метим два через один, чтобы хотя бы один был в кадре
      this._brand(cands[0].m, cands[0].name);
      const other = cands[Math.floor(cands.length / 2)];
      if (other !== cands[0]) this._brand(other.m, other.name);
    } else if (cands.length) {
      const c = pick(cands);
      if (row.type === 'grass' && c.x !== undefined && Math.random() < 0.2) {
        // светящаяся вывеска «RR» вместо этого препятствия
        row.group.remove(c.m);
        const sign = this.logo.sign();
        sign.position.set(c.x, 0, rand(-0.05, 0.05));
        sign.rotation.y = rand(-0.25, 0.25);
        row.group.add(sign);
        this._addLight(row, sign, sign.userData.glow.x, sign.userData.glow.y, sign.userData.glow.z, 0.55);
      } else if (this._brand(c.m, c.name) === 'poster') {
        c.m.rotation.y = rand(-0.35, 0.35);  // плакатом к камере
      }
    } else if (row.type === 'grass' || row.type === 'hunt') {
      // Сорванный плакат на земле — редко (в остальных случаях логотип просто пропускаем)
      // и только на свободном месте: его клетка и соседние без препятствий, мелочь под ним
      // не растёт, руки мертвецов в этом ряду не лезут
      const free = [];
      const busy = (c) => row.blocked.has(c) || row.traps?.some((t) => t.x === c);
      for (let x = -HALF + 1; x <= HALF - 1; x++) if (![x - 1, x, x + 1].some(busy)) free.push(x);
      if (Math.random() < 0.3 && free.length) {
        const px = pick(free) + rand(-0.15, 0.15);
        const p = this.logo.poster();
        p.rotation.set(-Math.PI / 2, 0, rand(-0.25, 0.25));  // сорван ветром и лежит на земле, почти ровно — читается
        p.position.set(px, 0.012, rand(-0.08, 0.08));
        row.group.add(p);
        row.poster = px;
        for (const d of row.group.children.filter((o) => o.userData.detail)) row.group.remove(d);
        this._addDetail(row.group, row.zone, px);
        for (const d of row.group.children) if (d.userData.detail) row.baked.push(d.geometry);  // свой вариант — удалить вместе с рядом
      }
    } else {
      return;  // дорога без места под логотип — попробуем в следующем ряду
    }
    this.nextLogo = row.i + irand(5, 7);
  }

  // Статичные предметы ряда (препятствия, декор, столбики) сливаются в несколько
  // мешей по материалам: сотни вызовов отрисовки превращаются в десяток.
  // Клейма, спрайты и якоря света переносятся в ряд как есть.
  _bake(row) {
    const g = row.group;
    g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
    const buckets = new Map();
    const keep = [];
    const visit = (c) => {
      const mat = c.material;
      const mergeable = c.isMesh && !Array.isArray(mat) && !mat.map && !mat.transparent;
      if (mergeable) {
        const key = mat.id + (c.castShadow ? 's' : '');
        if (!buckets.has(key)) buckets.set(key, { mat, cast: c.castShadow, parts: [] });
        buckets.get(key).parts.push([c.geometry, new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld)]);
      } else if (c.isMesh || c.isSprite || c.children.length === 0) {
        keep.push(c);  // клеймо, спрайт или якорь света
        return;
      }
      for (const ch of c.children) visit(ch);
    };
    for (const o of row.statics) {
      if (o.parent !== g) continue;  // препятствие заменили вывеской
      visit(o);
    }
    for (const c of keep) g.attach(c);
    for (const o of row.statics) if (o.parent === g) g.remove(o);
    for (const { mat, cast, parts } of buckets.values()) {
      const geo = mergeTransformed(parts);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      g.add(mesh);
      row.baked.push(geo);
    }
    row.statics = null;
  }

  _ground(mat) {
    const m = new THREE.Mesh(slabGeo, mat);
    m.receiveShadow = true;
    return m;
  }

  // Ряд рядом с рекой (сзади или следующий в очереди): кого сносит течением к краю,
  // должен успеть спрыгнуть сюда в одной-двух клетках от кромки тьмы
  _nearRiver() {
    return this.prevType === 'river' || (this.queue[0] ?? 'grass') === 'river';
  }

  _pickDir(row, type) {
    const flip = this.prevType === type;
    row.dir = flip ? -this.prevDir : (Math.random() < 0.5 ? 1 : -1);
    this.prevDir = row.dir;
  }

  // "Свободная колонка" смещается не больше чем на 1 между рядами с препятствиями,
  // чтобы через них (и через дырявые мосты) всегда был проход.
  _pathCols() {
    const prev = ['grass', 'bridge', 'press', 'gates'].includes(this.prevType) ? this.freeCol : null;
    this.freeCol = clamp((prev ?? this.freeCol) + irand(-1, 1), -HALF + 1, HALF - 1);
    return [prev, this.freeCol];
  }

  _placeObstacles(row, zone, d) {
    const i = row.i;
    if (i <= -3) {
      for (let x = -HALF; x <= HALF; x++) row.blocked.add(x);
    } else if (i >= 3 && i % ZONE_LEN > 1) {
      const [prev, free] = this._pathCols();
      // ряд позади, откуда можно прийти: трава, мост (без выпавших досок), молот, ворота —
      // каждый его участок должен иметь выход вперёд, в этот ряд
      const back = ['grass', 'bridge', 'press', 'gates'].includes(this.prevType) ? this.lastBlocked : null;
      const riverSide = this._nearRiver();
      // перед воротами и молотом, сразу за воротами — чистая трава: к единственному проходу
      // можно подойти из любой клетки, из ворот — выйти
      const byGate = this.prevType === 'gates' || this.queue[0] === 'gates' || this.queue[0] === 'press';
      const n = byGate ? 0 : Math.min(4, irand(zone.minObstacles ?? 0, 1 + Math.round(d * 2) + (zone.moreObstacles ?? 0)));
      for (let k = 0; k < n * 2 && row.blocked.size < n; k++) {  // попыток вдвое больше: часть мест отбраковывается
        const x = irand(-HALF, HALF);
        if (x === prev || x === free || row.blocked.has(x)) continue;
        if (riverSide && Math.abs(x) >= HALF - 1) continue;  // у реки края свободны — есть куда спрыгнуть
        // без скоплений: рядом (соседи в ряду и три клетки позади) уже не больше одного препятствия
        const crowd = [x - 1, x + 1].filter((c) => row.blocked.has(c)).length
          + (back ? [x - 1, x, x + 1].filter((c) => back.has(c)).length : 0);
        if (crowd >= 2) continue;
        // не больше двух препятствий подряд — без сплошных стен
        let run = 1;
        for (let s = x - 1; row.blocked.has(s); s--) run++;
        for (let s = x + 1; row.blocked.has(s); s++) run++;
        if (run > 2) continue;
        row.blocked.add(x);
        if (back && this._deadEnd(back, row.blocked)) row.blocked.delete(x);
      }
      // лес: изредка у тропы раскрытый капкан (клетку не загораживает — наступил, застрял)
      if (zone.traps && i >= 8 && i - (this.lastTrapRow ?? -9) >= 3 && Math.random() < 0.3) {
        const near = [-1, 0, 0, 1].filter((x) => !row.blocked.has(x));  // ближе к центру поля
        if (near.length) { this._addTrap(row, pick(near)); this.lastTrapRow = i; }
      }
    }
    this.lastBlocked = row.blocked;
    for (const x of row.blocked) {
      const name = pickWeighted(zone.obstacles);
      const m = this.models.make(name);
      m.position.set(x + rand(-0.06, 0.06), 0, rand(-0.06, 0.06));
      m.rotation.y = FACING.has(name) ? rand(-0.3, 0.3) : rand(0, Math.PI * 2);
      m.scale.setScalar(name === 'tree' || name === 'swamp_tree' ? rand(0.8, 0.95) : rand(0.95, 1.1));
      if (i > -3 && name !== 'lamppost') row.brandable.push({ m, name, x });
      row.group.add(m);
      row.statics.push(m);
      if (name === 'lamppost') {
        this._addLight(row, m, 0.4, 1.53, 0, 1.0);  // стекло фонаря (координаты модели)
        this._addPool(row.group, x, 0, 2.2, 0.35);
      }
      if (name === 'candles') this._addCandleLight(row, m, x, 0);
    }
  }

  // Тупик: в заднем ряду есть отрезок свободных клеток (между препятствиями или краем),
  // из которого вперёд не шагнуть — перед каждой его клеткой препятствие
  _deadEnd(back, front) {
    let open = false, inSeg = false;
    for (let x = -HALF; x <= HALF + 1; x++) {
      const free = x <= HALF && !back.has(x);
      if (free) {
        inSeg = true;
        if (!front.has(x)) open = true;
      } else if (inSeg) {
        if (!open) return true;
        inSeg = false;
        open = false;
      }
    }
    return false;
  }

  // Что надвигается с краёв поля (для стрелок у краёв экрана): ловушки на дорогах,
  // летящие снаряды и охотники, которые уже целятся
  threats(from, to) {
    const out = [];
    for (let i = from; i <= to; i++) {
      const r = this.rows.get(i);
      if (!r) continue;
      if (r.type === 'road') for (const m of r.movers) out.push({ i, x: m.x, dir: r.dir, speed: r.speed });
      if (r.type === 'hunt') {
        for (const p of r.projectiles) out.push({ i, x: p.x, dir: p.dir, speed: p.speed });
        const h = r.hunter;
        if (h?.state === 'windup') out.push({ i, x: h.x, aim: Math.min(1, h.t / WINDUP) });
      }
    }
    return out;
  }

  _addSideDecor(g, zone, row) {
    for (const s of [-1, 1]) {
      for (let x = HALF + 1; x <= HALF + DECOR_REACH; x++) {
        const dist = x - HALF;
        if (Math.random() > (0.3 + 0.05 * dist) * (zone.decorDensity ?? 1)) continue;
        const name = dist <= 2 ? pick(zone.decorNear) : pick(zone.decorFar);
        const m = this.models.make(name);
        m.position.set(s * x + rand(-0.3, 0.3), 0, rand(-0.3, 0.3));
        m.rotation.y = name === 'deer' ? (s > 0 ? -1 : 1) * rand(1, 2) : FACING.has(name) ? rand(-0.35, 0.35) : rand(0, Math.PI * 2);
        if (name === 'candles') this._addCandleLight(row, m, m.position.x, m.position.z);
        m.scale.setScalar(name === 'frame_tree' ? rand(0.8, 1.1) : rand(0.85, 1.15));
        // во тьме дальше клетки от поля тени не видны — не тратим на них проход теней
        // (высокие деревья оставляем: их длинные тени дотягиваются до поля)
        if (dist >= 2 && name !== 'tree_tall' && name !== 'frame_tree' && name !== 'tree') m.traverse((o) => { o.castShadow = false; });
        g.add(m);
        row.statics.push(m);
      }
    }
  }

  // Логотип на предмете: надпись на бревне, клеймо «RR» на верхней грани,
  // клеймо на указателе или плакат на колонне. Возвращает 'poster' для плаката.
  _brand(m, name) {
    if (!this.logo) return null;
    // клейма на горизонтальных поверхностях: [высота, размер, x, z]
    const TOPS = {
      crate: [0.726, 0.54, 0, 0],
      barrel: [0.778, 0.44, 0, 0],
      crate_pile: [1.106, 0.44, -0.1, -0.02],
      stump: [0.405, 0.28, 0, 0, 'bare'],          // вырезано на срезе пня — одни буквы
      raft2: [0.03, 0.58, -0.5, 0],
      raft3: [0.03, 0.58, pick([-1, 0, 1]), 0],
      door2: [0.075, 0.44, -0.2, 0],
      door3: [0.075, 0.44, -0.7, 0],
      lily: [0.006, 0.34, 0.12, 0.1, 'bare'],      // в стороне от цветка — одни буквы
      plank: [0.006, 0.5, 0, 0],
      plank_swamp: [0.006, 0.46, 0, 0],
      grate: [0.01, 0.48, 0, 0],
      slab: [0.006, 0.5, 0, 0],
      boat2: [0.005, 0.4, -0.35, 0],
      boat3: [0.005, 0.44, 0.45, 0],
    };
    // на брёвнах — надпись RENTROBOT во всю длину, читается с камеры
    if (name === 'log2' || name === 'log3') {
      const len = name === 'log2' ? 2 : 3;
      const w = this.logo.wordmark(len * 0.82);
      w.rotation.x = -Math.PI / 2;
      // бревно могло быть развёрнуто на 180° — тогда поворачиваем надпись обратно
      w.rotation.z = Math.abs(m.rotation.y) > 1 ? Math.PI : 0;
      w.position.set(rand(-0.1, 0.1) * len, 0.285, 0);
      m.add(w);
      return null;
    }
    const top = TOPS[name];
    if (top) {
      const st = top[4] === 'bare' ? this.logo.letters(top[1]) : this.logo.stamp(top[1]);
      st.rotation.x = -Math.PI / 2;
      st.rotation.z = -m.rotation.y + rand(-0.25, 0.25);  // буквами к камере, как бы ни был повёрнут предмет
      st.position.set(top[2], top[0], top[3]);
      m.add(st);
    } else if (name === 'signpost') {
      const st = this.logo.letters(0.3);  // на узкой табличке — одни буквы, крупно
      st.position.set(0.05, 0.62, 0.076);
      m.add(st);
      return 'poster';  // табличкой к камере
    } else if (name === 'pillar') {  // плакат на колонне
      const p = this.logo.badge(0.42);
      p.position.set(0, rand(0.55, 0.75), 0.227);
      p.rotation.z = rand(-0.1, 0.1);
      m.add(p);
      return 'poster';
    }
    return null;
  }

  _addWaterDecor(row, zone) {
    const g = row.group;
    for (const s of [-1, 1]) {
      for (let x = HALF + 1; x <= HALF + DECOR_REACH; x++) {
        if (Math.random() > 0.3) continue;
        const m = this.models.make(pick(zone.riverDecor));
        m.position.set(s * x + rand(-0.3, 0.3), -0.2, rand(-0.3, 0.3));
        m.rotation.y = rand(0, 6.3);
        g.add(m);
        row.statics.push(m);
      }
    }
  }

  // Мелочь по земле: варианты полосы, собранные в несколько мешей по материалам
  // Мелочь на земле. Обычно — один из заранее слитых вариантов на зону; hole — x плаката
  // на земле: тогда вариант собирается заново без мелочи под плакатом
  _addDetail(g, zone, hole) {
    const build = () => {
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const byMat = new Map();
      for (const [name, count, s0, s1] of zone.detail) {
        const parts = this.models.parts(name);
        // количества в zones.js — на всю ширину мира, а мелочь кладётся только у поля
        const n = Math.round(count * (HALF + DECOR_REACH + 0.5) / SPAN);
        for (let k = 0; k < n; k++) {
          const x = rand(-HALF - DECOR_REACH - 0.5, HALF + DECOR_REACH + 0.5);
          if (hole !== undefined && Math.abs(x - hole) < 0.95) continue;
          const s = rand(s0, s1);
          m.compose(new THREE.Vector3(x, 0, rand(-0.45, 0.45)), q.setFromAxisAngle(up, rand(0, 6.3)), new THREE.Vector3(s, s, s));
          for (const [mat, geos] of parts) {
            if (!byMat.has(mat)) byMat.set(mat, []);
            for (const geo of geos) byMat.get(mat).push(geo.clone().applyMatrix4(m));
          }
        }
      }
      return [...byMat].map(([mat, geos]) => [mergeGeometries(geos), mat]);
    };
    let variant;
    if (hole !== undefined) {
      variant = build();
    } else {
      let variants = this.details.get(zone.id);
      if (!variants) {
        variants = [];
        for (let v = 0; v < DETAIL_VARIANTS; v++) variants.push(build());
        this.details.set(zone.id, variants);
      }
      variant = pick(variants);
    }
    const flip = hole === undefined && Math.random() < 0.5 ? -1 : 1;
    for (const [geo, mat] of variant) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.x = flip;
      mesh.receiveShadow = true;
      mesh.userData.detail = true;
      g.add(mesh);
    }
  }

  // Дорожка под опасностью: рельсы / направляющая / конвейер / лесная и болотная тропы / мостовая
  _track(style) {
    if (style === 'trail' || style === 'bog' || style === 'cobble' || style === 'flags') style = `${style}${irand(0, 2)}`;  // у троп три варианта — узор не повторяется
    if (this.tracks.has(style)) return this.tracks.get(style);
    const merge = (list) => mergeGeometries(list);
    const L = SPAN * 2;
    let out;
    if (style === 'rails') {
      const rails = [-0.09, 0.09].map((z) => new THREE.BoxGeometry(L, 0.045, 0.05).translate(0, 0.022, z));
      const sleepers = [];
      for (let x = -SPAN; x <= SPAN; x += 0.55) sleepers.push(new THREE.BoxGeometry(0.14, 0.03, 0.5).translate(x, 0.015, 0));
      const edges = [-0.47, 0.47].map((z) => new THREE.BoxGeometry(L, 0.02, 0.06).translate(0, 0.01, z));
      out = [[merge(sleepers), 'sleeper'], [merge(rails), 'rail'], [merge(edges), 'roadEdge']];
    } else if (style === 'guide') {
      // направляющая пилы: стальная полоса с прорезью, бортики вдоль прорези, крепёжные скобы
      const plate = [new THREE.BoxGeometry(L, 0.025, 0.4).translate(0, 0.0125, 0)];
      const slot = [new THREE.BoxGeometry(L, 0.004, 0.1).translate(0, 0.027, 0)];
      const lips = [-0.075, 0.075].map((z) => new THREE.BoxGeometry(L, 0.04, 0.05).translate(0, 0.045, z));
      const brackets = [];
      for (let x = -SPAN; x <= SPAN; x += 1.1) {
        brackets.push(new THREE.BoxGeometry(0.12, 0.035, 0.5).translate(x, 0.0175, 0));
        for (const z of [-0.2, 0.2]) brackets.push(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 6).translate(x, 0.045, z));  // болты
      }
      const edges = [-0.47, 0.47].map((z) => new THREE.BoxGeometry(L, 0.02, 0.06).translate(0, 0.01, z));
      out = [[merge(plate), 'guide'], [merge(brackets), 'guide'], [merge(slot), 'slot'], [merge(lips), 'guide'], [merge(edges), 'roadEdge']];
    } else if (style.startsWith('trail')) {
      // Лесная тропа: утоптанная земля с рваными краями, следы копыт, камешки, листья,
      // веточки и корни у краёв. Никаких сплошных полос вдоль ряда.
      const dirt = [], prints = [], stones = [], leaves = [], wood = [];
      for (let x = -SPAN; x < SPAN;) {  // пятна земли внахлёст под разными углами — неровная кромка
        const len = rand(0.5, 1.1);
        const w = rand(0.45, 0.72);
        dirt.push(new THREE.CylinderGeometry(0.5, 0.5, 0.008, 9).scale(len, 1, w).rotateY(rand(-0.25, 0.25))
          .translate(x + len / 2, 0.004 + rand(0, 0.003), rand(-0.08, 0.08)));
        x += len * rand(0.45, 0.7);
      }
      for (let k = 0; k < 40; k++) {  // клочки земли по краям тропы
        const s = rand(0.15, 0.35);
        dirt.push(new THREE.CylinderGeometry(0.5, 0.5, 0.006, 7).scale(s, 1, s * rand(0.5, 0.9)).rotateY(rand(0, 3))
          .translate(rand(-SPAN, SPAN), 0.003, (Math.random() < 0.5 ? -1 : 1) * rand(0.28, 0.4)));
      }
      for (let k = 0; k < 70; k++) {  // следы копыт — парные тёмные вмятины
        const x = rand(-SPAN, SPAN), z = rand(-0.22, 0.22), a = rand(-0.3, 0.3);
        for (const d of [-0.025, 0.025]) {
          prints.push(new THREE.CylinderGeometry(0.022, 0.026, 0.004, 6).scale(1, 1, 1.5).rotateY(a).translate(x, 0.011, z + d));
        }
      }
      for (let k = 0; k < 90; k++) {  // камешки
        const s = rand(0.025, 0.06);
        stones.push(new THREE.BoxGeometry(s, s * 0.6, s * rand(0.7, 1.2)).rotateY(rand(0, 3)).translate(rand(-SPAN, SPAN), s * 0.3, rand(-0.36, 0.36)));
      }
      for (let k = 0; k < 140; k++) {  // опавшие листья
        leaves.push(new THREE.BoxGeometry(rand(0.04, 0.07), 0.004, rand(0.025, 0.04)).rotateY(rand(0, 6.3)).translate(rand(-SPAN, SPAN), 0.012, rand(-0.42, 0.42)));
      }
      for (let k = 0; k < 26; k++) {  // веточки
        wood.push(new THREE.BoxGeometry(rand(0.12, 0.28), 0.012, 0.012).rotateY(rand(0, 6.3)).translate(rand(-SPAN, SPAN), 0.012, rand(-0.35, 0.35)));
      }
      for (let k = 0; k < 10; k++) {  // корни выползают из-под краёв тропы
        const x = rand(-SPAN, SPAN), side = Math.random() < 0.5 ? -1 : 1;
        const len = rand(0.25, 0.45);
        wood.push(new THREE.CylinderGeometry(0.02, 0.035, len, 6).rotateX(Math.PI / 2).rotateY(rand(-0.6, 0.6))
          .translate(x, 0.015, side * (0.46 - len * 0.35)));
      }
      out = [[merge(dirt), 'path'], [merge(prints), 'sleeper'], [merge(stones), 'roadEdge'], [merge(leaves), 'detail'], [merge(wood), 'sleeper']];
    } else if (style.startsWith('bog')) {
      // Болотная тропа: вязкий ил с рваной кромкой, тёмные блестящие лужи стоячей воды,
      // пятна тины, обломанные стебли камыша, веточки, камешки
      const mud = [], puddles = [], algae = [], stones = [], stems = [];
      for (let x = -SPAN; x < SPAN;) {
        const len = rand(0.5, 1.1);
        mud.push(new THREE.CylinderGeometry(0.5, 0.5, 0.008, 9).scale(len, 1, rand(0.5, 0.78)).rotateY(rand(-0.3, 0.3))
          .translate(x + len / 2, 0.004 + rand(0, 0.003), rand(-0.08, 0.08)));
        x += len * rand(0.45, 0.7);
      }
      for (let k = 0; k < 40; k++) {  // клочки ила по краям
        const s = rand(0.15, 0.35);
        mud.push(new THREE.CylinderGeometry(0.5, 0.5, 0.006, 7).scale(s, 1, s * rand(0.5, 0.9)).rotateY(rand(0, 3))
          .translate(rand(-SPAN, SPAN), 0.003, (Math.random() < 0.5 ? -1 : 1) * rand(0.28, 0.42)));
      }
      for (let k = 0; k < 26; k++) {  // лужи
        const s = rand(0.18, 0.42);
        puddles.push(new THREE.CylinderGeometry(0.5, 0.5, 0.004, 10).scale(s, 1, s * rand(0.4, 0.75)).rotateY(rand(0, 3))
          .translate(rand(-SPAN, SPAN), 0.011, rand(-0.25, 0.25)));
      }
      for (let k = 0; k < 60; k++) {  // пятна тины
        const s = rand(0.05, 0.14);
        algae.push(new THREE.CylinderGeometry(0.5, 0.5, 0.004, 6).scale(s, 1, s * rand(0.6, 1)).rotateY(rand(0, 3))
          .translate(rand(-SPAN, SPAN), 0.013, rand(-0.4, 0.4)));
      }
      for (let k = 0; k < 50; k++) {  // камешки
        const s = rand(0.025, 0.05);
        stones.push(new THREE.BoxGeometry(s, s * 0.6, s * rand(0.7, 1.2)).rotateY(rand(0, 3)).translate(rand(-SPAN, SPAN), s * 0.3, rand(-0.38, 0.38)));
      }
      for (let k = 0; k < 36; k++) {  // обломанные стебли камыша и веточки
        const x = rand(-SPAN, SPAN), z = rand(-0.42, 0.42);
        if (Math.random() < 0.5) {
          stems.push(new THREE.CylinderGeometry(0.008, 0.012, rand(0.08, 0.2), 4).rotateX(rand(-0.4, 0.4)).rotateZ(rand(-0.4, 0.4))
            .translate(x, 0.05, Math.sign(z) * Math.max(Math.abs(z), 0.3)));
        } else {
          stems.push(new THREE.BoxGeometry(rand(0.12, 0.26), 0.012, 0.012).rotateY(rand(0, 6.3)).translate(x, 0.012, z));
        }
      }
      out = [[merge(mud), 'path'], [merge(puddles), 'puddle'], [merge(algae), 'detail'], [merge(stones), 'roadEdge'], [merge(stems), 'sleeper']];
    } else if (style.startsWith('flags')) {
      // Дорожка из старых каменных плит: крупные неровные плиты в два ряда вразбежку,
      // светлые и тёмные вперемешку, часть треснула или просела, в щелях трава
      const light = [], dark = [], grass = [];
      [-0.21, 0.21].forEach((z, i) => {
        for (let x = -SPAN + (i ? 0.2 : 0); x < SPAN;) {
          const w = rand(0.34, 0.6);
          const d = rand(0.34, 0.4);
          const y = 0.015 - (Math.random() < 0.1 ? 0.012 : 0);  // просевшая плита
          const zz = z + rand(-0.025, 0.025), rot = rand(-0.07, 0.07);
          const list = Math.random() < 0.5 ? light : dark;
          if (Math.random() < 0.2) {  // треснувшая — две половины с щелью
            const k = rand(0.35, 0.65);
            list.push(new THREE.BoxGeometry(w * k - 0.05, 0.03, d).rotateY(rot + rand(-0.05, 0.05)).translate(x + w * k / 2, y, zz));
            list.push(new THREE.BoxGeometry(w * (1 - k) - 0.05, 0.03, d).rotateY(rot + rand(-0.05, 0.05)).translate(x + w * k + w * (1 - k) / 2, y - 0.004, zz));
          } else {
            list.push(new THREE.BoxGeometry(w - 0.05, 0.03, d).rotateY(rot).translate(x + w / 2, y, zz));
          }
          if (Math.random() < 0.35) {
            for (let k = 0; k < 3; k++) {
              grass.push(new THREE.ConeGeometry(0.012, rand(0.05, 0.1), 3).rotateZ(rand(-0.4, 0.4)).translate(x + rand(-0.03, 0.03), 0.03, z + rand(-0.15, 0.15)));
            }
          }
          x += w;
        }
      });
      out = [[merge(light), 'path'], [merge(dark), 'roadEdge'], [merge(grass), 'detail']];
    } else if (style.startsWith('cobble')) {
      // Старая мостовая: ряды плоских камней вразбежку, часть выпала или вздыблена,
      // в щелях трава, по краям — обломанный бордюр
      const light = [], dark = [], grass = [], curb = [];
      const rows = [-0.3, -0.1, 0.1, 0.3];
      rows.forEach((z, i) => {
        for (let x = -SPAN + (i % 2) * 0.11; x < SPAN;) {
          const w = rand(0.17, 0.26);
          if (Math.random() > 0.1) {
            const up = Math.random() < 0.06 ? rand(0.02, 0.04) : 0;  // вздыбленный камень
            const geo = new THREE.BoxGeometry(w - 0.025, 0.03 + up, 0.175).rotateY(rand(-0.06, 0.06))
              .translate(x + w / 2, 0.015 + up / 2, z + rand(-0.012, 0.012));
            (Math.random() < 0.55 ? light : dark).push(geo);
          } else if (Math.random() < 0.6) {  // на месте выпавшего — пучок травы
            for (let k = 0; k < 3; k++) {
              grass.push(new THREE.ConeGeometry(0.012, rand(0.05, 0.1), 3).rotateZ(rand(-0.4, 0.4))
                .translate(x + w / 2 + rand(-0.05, 0.05), 0.03, z + rand(-0.05, 0.05)));
            }
          }
          x += w;
        }
      });
      for (let k = 0; k < 60; k++) {  // трава в щелях
        grass.push(new THREE.ConeGeometry(0.01, rand(0.04, 0.08), 3).rotateZ(rand(-0.5, 0.5))
          .translate(rand(-SPAN, SPAN), 0.03, rows[irand(0, 3)] + (Math.random() < 0.5 ? -0.1 : 0.1)));
      }
      for (const side of [-1, 1]) {  // бордюр с пропусками
        for (let x = -SPAN; x < SPAN;) {
          const w = rand(0.3, 0.55);
          if (Math.random() > 0.2) {
            curb.push(new THREE.BoxGeometry(w - 0.03, 0.05, 0.09).rotateY(rand(-0.05, 0.05)).rotateZ(rand(-0.03, 0.03))
              .translate(x + w / 2, 0.025, side * 0.45));
          }
          x += w;
        }
      }
      out = [[merge(light), 'path'], [merge(dark), 'roadEdge'], [merge(curb), 'roadEdge'], [merge(grass), 'detail']];
    } else {
      const base = [new THREE.BoxGeometry(L, 0.03, 0.8).translate(0, 0.015, 0)];
      const slats = [];
      // планки конвейера тёмные и редкие — светлые частые полосы рябили
      for (let x = -SPAN; x <= SPAN; x += 0.45) slats.push(new THREE.BoxGeometry(0.06, 0.015, 0.72).translate(x, 0.035, 0));
      const sides = [-0.45, 0.45].map((z) => new THREE.BoxGeometry(L, 0.1, 0.07).translate(0, 0.05, z));
      out = [[merge(base), 'sleeper'], [merge(sides), 'rail'], [merge(slats), 'roadEdge']];
    }
    this.tracks.set(style, out);
    return out;
  }

  _spawnMovers(row, count, kindFn, build, jitter = row.type === 'river' ? 0.05 : 0.15) {
    const spacing = LOOP / count;
    const phase = rand(0, spacing);
    for (let k = 0; k < count; k++) {
      const [name, len] = kindFn();
      const obj = new THREE.Group();
      const [blade, ...rest] = build(name);
      obj.add(blade, ...rest);
      const x = -LOOP / 2 + phase + k * spacing + rand(-jitter, jitter) * spacing;
      obj.position.x = x;
      row.group.add(obj);
      row.movers.push({ x, len, obj, blade, phase: rand(0, 6), dip: 0, dipV: 0, roll: 0, rollV: 0 });
    }
  }

  _addBridge(row, zone, d) {
    const g = row.group;
    const [prev, free] = this._pathCols();
    const missing = new Set();
    const riverSide = this._nearRiver();
    const back = ['grass', 'bridge', 'press', 'gates'].includes(this.prevType) ? this.lastBlocked : null;
    const n = irand(1, 1 + Math.round(d * 2));
    for (let k = 0; k < n; k++) {
      const x = irand(-HALF, HALF);
      if (riverSide && Math.abs(x) >= HALF - 1) continue;  // у реки крайние доски целы
      if (x === prev || x === free) continue;
      missing.add(x);
      // из каждого участка ряда позади должно быть куда шагнуть на мост
      if (back && this._deadEnd(back, missing)) missing.delete(x);
    }
    row.planks = new Map();
    for (let x = -HALF - 3; x <= HALF + 3; x++) {
      const inField = Math.abs(x) <= HALF;
      if (inField ? missing.has(x) : Math.random() < 0.3) continue;
      const obj = this.models.make(zone.plank);
      obj.position.set(x, 0, 0);
      if (Math.random() < 0.5) obj.rotation.y = Math.PI;
      if (inField) row.brandable.push({ m: obj, name: zone.plank });
      else row.statics.push(obj);
      g.add(obj);
      if (inField) row.planks.set(x, { x, obj, state: 'ok', t: 0 });
    }
    // столбики с цепями по обе стороны настила — одинаковые во всех мостах,
    // поэтому слиты один раз и переиспользуются
    for (const [geo, mat, cast] of this._rails()) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
  }

  _rails() {
    if (this.railParts) return this.railParts;
    const tmp = { group: new THREE.Group(), statics: [], baked: [] };
    for (const z of [-0.46, 0.46]) {
      for (let x = -HALF - 3; x < HALF + 3; x += 1) {
        const post = this.models.make('post');
        post.position.set(x + 0.5, -0.12, z);
        post.scale.setScalar(0.8);
        tmp.group.add(post);
        tmp.statics.push(post);
      }
    }
    this._bake(tmp);
    this.railParts = tmp.group.children.filter((c) => c.isMesh).map((c) => [c.geometry, c.material, c.castShadow]);
    return this.railParts;
  }

  // Ряд паровых клапанов: решётка в каждой клетке поля (и пара за краем — для вида).
  // Волна идёт в случайную сторону, так что всегда можно поймать остывший клапан.
  // Кладбище: рука мертвеца лезет из-под земли в 3–4 рядах перед героем, чаще в соседней
  // колонке. Земля вспучивается, шевелится и тлеет зелёным; рука вырывается, когда герой в двух
  // рядах, — к его подходу она уже на виду. Дальше остаётся и срабатывает раз в 6–8 с. true — появилась
  spawnHandAhead(row, x) {
    for (const d of Math.random() < 0.5 ? [3, 4] : [4, 3]) {
      const r = this.rows.get(row + d);
      if (r?.type !== 'grass' || !r.zone.hands || r.hands?.length || r.poster !== undefined) continue;
      if (this.rows.get(row + d - 1)?.hands?.length || this.rows.get(row + d + 1)?.hands?.length) continue;
      const cols = [0, -1, 1, -1, 1].map((k) => clamp(Math.round(x) + k, -HALF, HALF)).filter((c) => !r.blocked.has(c));  // чаще сбоку
      if (!cols.length) continue;
      const h = this._addHand(r, pick(cols));
      h.wait = 0;  // земля шевелится и ждёт героя: рука вырвется, когда он подойдёт на соседний ряд
      h.pop = 0;   // бугор земли вырастает
      this.onSteam(h.x, 0.05, -r.i, 0.5);
      this.onEvent('handWarn', h.x, -r.i);
      return true;
    }
    return false;
  }

  _addHand(row, x) {
    const g = row.group;
    row.hands ??= [];
    const mound = this.models.make('hand_mound');
    mound.position.set(x, 0, 0);
    mound.rotation.y = rand(0, 6.3);
    g.add(mound);  // ряд уже собран — бугор отдельным объектом
    const glow = new THREE.Mesh(flatGeo, new THREE.MeshBasicMaterial({
      map: TEX.glow, color: 0x7dff9a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false,
    }));
    glow.scale.set(0.9, 1, 0.9);
    glow.position.set(x, 0.05, 0);
    glow.renderOrder = 2;
    g.add(glow);
    const hand = this.models.make('zombie_hand');
    hand.scale.setScalar(1.4);
    hand.position.set(x, HANDS.down, 0);
    hand.rotation.y = rand(-0.5, 0.5);
    hand.visible = false;
    g.add(hand);
    const period = rand(6, 8);  // после рывка клетка надолго безопасна
    const h = { x, hand, glow, mound, inField: true, period, t: rand(0, period) };
    row.hands.push(h);
    return h;
  }

  _addTrap(row, x) {
    const obj = this.models.make('bear_trap');
    obj.position.set(x + rand(-0.05, 0.05), 0, rand(-0.06, 0.06));
    obj.rotation.y = rand(-0.4, 0.4) + (Math.random() < 0.5 ? Math.PI : 0);
    row.group.add(obj);
    row.traps ??= [];
    row.traps.push({ x, obj, jawA: obj.getObjectByName('JawA'), jawB: obj.getObjectByName('JawB'), shut: false, k: 0 });
  }

  // Наступил на раскрытый капкан — он захлопывается (один раз). true — попался
  trapAt(i, x) {
    const t = this.rows.get(i)?.traps?.find((q) => !q.shut && q.x === Math.round(x));
    if (!t) return false;
    t.shut = true;
    this.onEvent('trapSnap', t.x, -i);
    this.onSteam(t.x, 0.05, -i, 0.3);
    return true;
  }

  // Ограда поперёк поля (уходит во тьму) и 2–3 кованых ворот: одни — на проходе
  _addGates(row) {
    const g = row.group;
    const col = this.prevType === 'grass' || this.prevType === 'bridge' ? this.freeCol : clamp(this.freeCol, -HALF + 1, HALF - 1);
    this.freeCol = col;
    const cols = new Set([col]);
    for (let k = irand(1, 2); k > 0; k--) cols.add(irand(-HALF, HALF));
    row.gates = [];
    for (let x = -HALF - 2; x <= HALF + 2; x++) {
      if (!cols.has(x)) {
        const f = this.models.make('iron_fence');
        f.position.set(x, 0, 0);
        g.add(f);
        row.statics.push(f);
        if (Math.abs(x) <= HALF) row.blocked.add(x);
        continue;
      }
      for (const s of [-1, 1]) {
        const post = this.models.make('gate_post');
        post.position.set(x + s * 0.5, 0, 0);
        g.add(post);
        row.statics.push(post);
      }
      const left = this.models.make('gate_leaf');
      left.position.set(x - 0.47, 0, 0);
      const right = this.models.make('gate_leaf');
      right.position.set(x + 0.47, 0, 0);
      right.scale.x = -1;  // зеркальная створка, петля справа
      g.add(left, right);
      const period = rand(3.2, 4.4);
      row.gates.push({ x, left, right, period, t: rand(0, period), angle: GATE.open });
    }
  }

  _updateGates(r, dt, visible) {
    for (const gt of r.gates) {
      gt.t += dt;
      const P = gt.period;
      const shutEnd = P - GATE.closed, warnEnd = shutEnd - GATE.shut, warnAt = warnEnd - GATE.warn;
      const prev = gt.tt ?? 0;
      const tt = gt.t % P;
      gt.tt = tt;
      const cross = (at) => prev < at && tt >= at;
      let a;
      if (tt < GATE.opening) a = GATE.open * (tt / GATE.opening);
      else if (tt < warnAt) a = GATE.open;
      else if (tt < warnEnd) a = GATE.open + Math.sin(tt * 60) * 0.05;  // дрожат перед тем, как захлопнуться
      else if (tt < shutEnd) a = GATE.open * (1 - (tt - warnEnd) / GATE.shut);
      else a = 0;
      const was = gt.angle;
      gt.angle = a;
      // захлопнулись именно в этом кадре — стоявшего в проёме отбросит (отметка живёт один кадр,
      // иначе старая срабатывала позже, когда герой входил в уже открытые ворота)
      gt.slam = was >= GATE.open * 0.5 && a < GATE.open * 0.5;
      gt.left.rotation.y = a;   // створки распахиваются от камеры, в глубину
      gt.right.rotation.y = -a;
      if (!visible || Math.abs(gt.x) > HALF) continue;
      if (cross(warnAt)) this.onEvent('gateCreak', gt.x, -r.i);
      if (cross(shutEnd)) this.onEvent('gateSlam', gt.x, -r.i);
      if (tt < prev) this.onEvent('gateOpen', gt.x, -r.i);
    }
  }

  // Ворота только что захлопнулись на клетке, где стоит герой (один раз на захлопывание)
  gateShove(i, x) {
    const r = this.rows.get(i);
    return !!r?.gates?.some((q) => q.x === Math.round(x) && q.slam);
  }

  _addVents(row, zone, mats) {
    const g = row.group;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const base = rand(0, STEAM.period);
    row.vents = [];
    row.ventT = 0;
    // клапаны через клетку (чётность случайная), часть пропущена — но в поле хотя бы два
    const par = irand(0, 1);
    const cols = [];
    for (let x = -HALF - 1; x <= HALF + 1; x++) if (((x + par) & 1) === 0 && Math.random() < 0.8) cols.push(x);
    for (let x = -HALF + par; cols.filter((c) => Math.abs(c) <= HALF).length < 2 && x <= HALF; x += 2) if (!cols.includes(x)) cols.push(x);
    for (const x of cols) {
      const m = this.models.make('vent');
      m.position.set(x, 0, 0);
      m.rotation.y = pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
      g.add(m);
      row.statics.push(m);
      const glow = new THREE.Mesh(flatGeo, new THREE.MeshBasicMaterial({
        map: TEX.glow, color: 0xff6a20, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false,
      }));
      glow.scale.set(0.8, 1, 0.8);
      glow.position.set(x, 0.075, 0);
      glow.renderOrder = 2;
      g.add(glow);
      row.vents.push({ x, glow, inField: Math.abs(x) <= HALF, phase: (base + dir * (x + HALF) * STEAM.step) % STEAM.period + STEAM.period });
    }
  }

  // Ряд перегорожен станками (ящики, котёл, верстак за общими перилами), единственный
  // проход — под паровым молотом. Колонка прохода та же, что свободна в предыдущем ряду
  // травы, так что к ней всегда можно подойти. Модели — blender/make_press.py.
  _addPress(row, zone, mats) {
    const g = row.group;
    const col = this.prevType === 'grass' || this.prevType === 'bridge' ? this.freeCol : clamp(this.freeCol, -HALF + 1, HALF - 1);
    this.freeCol = col;
    for (let x = -HALF - 2; x <= HALF + 2; x++) {  // перегородка уходит за край поля во тьму
      if (x === col) continue;
      if (Math.abs(x) <= HALF) row.blocked.add(x);
      const m = this.models.make(pick(['press_wall_a', 'press_wall_b', 'press_wall_c']));
      m.position.set(x, 0, 0);
      g.add(m);
      row.statics.push(m);
    }
    const frame = this.models.make('press_frame');
    frame.position.set(col, 0, 0);
    g.add(frame);
    row.statics.push(frame);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 1, 12), mats.rail);
    rod.position.x = col;
    rod.castShadow = true;
    g.add(rod);
    const head = this.models.make('press_head');
    head.position.set(col, PRESS.high - PRESS.low, 0);
    g.add(head);
    // лампа-предупреждение на траверсе: тусклая, перед ударом загорается красным
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0x5a1408, fog: false }));
    lamp.position.set(col + 0.45, 2.05, 0.25);
    g.add(lamp);
    const shadow = new THREE.Mesh(flatGeo, new THREE.MeshBasicMaterial({ map: TEX.shadow, transparent: true, depthWrite: false, opacity: 0.3 }));
    shadow.scale.set(1.0, 1, 0.8);
    shadow.position.set(col, 0.11, 0);
    g.add(shadow);
    this._addLight(row, lamp, 0, 0, 0.05, 0.35);
    row.press = { col, head, rod, lamp, shadow, t: rand(0, PRESS.period), y: PRESS.high };
  }

  _addHunter(row, zone) {
    const side = Math.random() < 0.5 ? 1 : -1;
    const obj = this.models.make(zone.hunter);
    const x = side * HUNTER_X;
    obj.position.set(x, 0, 0.05);
    obj.rotation.y = -side * Math.PI / 2;  // лицом к полю
    let arm = null;
    obj.traverse((o) => {
      if (o.name === 'Arm') arm = o;
      if (!o.isMesh) return;
      // глаза светятся сквозь тьму за краем поля, тело — силуэтом поверх неё
      if (o.material === MAT.eye) { o.material = MAT.eyeOverDark; o.renderOrder = 7; return; }
      o.material = overDarkMat(o.material);
      o.renderOrder = 6;
    });
    const back = new THREE.Sprite(backMat.clone());
    back.scale.set(1.9, 2.6, 1);
    back.position.set(0, 1.0, 0);
    back.renderOrder = 5.5;  // после тьмы, до силуэта
    row.group.add(back);
    back.position.x = x;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.3,
    }));
    glow.scale.set(0.45, 0.25, 1);
    glow.position.set(0, 0.87, 0.12);
    glow.renderOrder = 7;
    obj.add(glow);
    row.group.add(obj);
    const aim = new THREE.Mesh(flatGeo, aimMat.clone());
    aim.scale.set(SPAN * 2, 1, 0.1);
    aim.position.y = 0.03;
    aim.renderOrder = 6;
    row.group.add(aim);
    row.hunter = { obj, arm, glow, back, aim, side, x, state: 'wait', t: 0, next: rand(0.4, 2.2) };
  }

  // Луч света сверху, пятно на земле и источник света в нём
  _addShaft(row) {
    const g = row.group;
    const x = rand(-HALF - 1, HALF + 1);
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.position.set(x, 0, rand(-0.2, 0.2));
    shaft.rotation.set(0.35, 0, -0.25);
    shaft.renderOrder = 4;
    g.add(shaft);
    this._addPool(g, x + 0.3, 0, 3.2, 0.3);
    this._addLight(row, g, x + 0.3, 1.4, 0, 1.6);
  }

  // Невидимый якорь источника света; main.js ставит настоящий свет на ближайшие
  _addLight(row, parent, x, y, z, power) {
    const anchor = new THREE.Object3D();
    anchor.position.set(x, y, z);
    parent.add(anchor);
    row.lights.push({ anchor, power });
  }

  lightsIn(lo, hi) {
    const out = [];
    for (let i = lo; i <= hi; i++) {
      const r = this.rows.get(i);
      if (r) out.push(...r.lights);
    }
    return out;
  }

  // Свечи: живой огонь светит вокруг (точечный свет) и кладёт тёплое пятно на землю
  _addCandleLight(row, m, x, z) {
    this._addLight(row, m, 0, 0.85, 0, 0.45);  // огоньки на постаменте
    this._addPool(row.group, x, z, 1.7, 0.3, 0xff9a48);
  }

  _addPool(g, x, z, size, opacity, color) {
    const pool = new THREE.Mesh(flatGeo, poolMat.clone());
    pool.material.opacity = opacity;
    if (color) pool.material.color.set(color);  // свечи — тёплое пятно
    pool.scale.set(size, 1, size * 0.7);
    pool.position.set(x, 0.02, z);
    pool.renderOrder = 2;
    g.add(pool);
  }
}
