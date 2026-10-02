import * as THREE from 'three';
import { HALF, PACE } from './config.js';

// Щупальце на болоте: редкая, честно предупреждённая опасность.
//   warn    — 1,5 с вокруг кувшинки поднимаются пузыри, она подрагивает, слышно бульканье;
//   rise    — рядом из воды поднимается щупальце и выгибается над кувшинкой;
//   sink    — обвивает её и утаскивает под воду (стоял на ней — утащило и героя);
//   under   — пара секунд под водой, остальные кувшинки ряда плывут как обычно;
//   surface — кувшинка всплывает обратно, дыр на реке не остаётся.
// Не чаще раза на 10–16 рядов и только рядом с героем, чтобы не мешать игре.

const WARN = 1.7, RISE = 0.6, SINK = 0.55, UNDER = 1.4, SURFACE = 0.6;
const SEG = 10, SEG_LEN = 0.15;
const irand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
// Пока щупальце держит кувшинку снизу, её несёт втрое медленнее — она остаётся
// посреди поля и видно, что с ней что-то не так
const HOLD = 0.3;
const HELD_FOR = WARN + RISE + SINK;
// Если хватает кувшинку, на которой стоит герой, — тянет её против течения навстречу
// соседней, пока та не встанет вплотную: тогда есть куда перепрыгнуть вбок
const PULL = -0.6;

// щупальце осьминога: фиолетовая мокрая кожа с бликом, бледно-розовые присоски
const skin = new THREE.MeshStandardMaterial({ color: 0x7a3f9e, roughness: 0.25, metalness: 0.05, emissive: 0x1e0a2a });
const sucker = new THREE.MeshStandardMaterial({ color: 0xf0bfd2, roughness: 0.4, emissive: 0x3a1a26 });

// Цепочка сегментов: каждый сустав — дочерний к предыдущему, изгиб = поворот суставов
function build() {
  const root = new THREE.Group();
  const joints = [];
  let parent = root;
  for (let k = 0; k < SEG; k++) {
    const r0 = 0.025 + 0.13 * (1 - k / SEG);
    const r1 = 0.018 + 0.13 * (1 - (k + 1) / SEG);
    const j = new THREE.Group();
    if (k) j.position.y = SEG_LEN;
    parent.add(j);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, SEG_LEN * 1.1, 10).translate(0, SEG_LEN / 2, 0), skin);
    m.castShadow = true;
    j.add(m);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(r0 * 0.99, 10, 8), skin);  // шарик в суставе — без щелей на изгибе
    j.add(knot);
    if (k < SEG - 1) {  // присоски в два ряда — на внутренней стороне изгиба, как у осьминога
      for (const dz of [-0.45, 0.45]) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(r0 * 0.36, 8, 6), sucker);
        s.scale.set(0.45, 1, 1);
        s.position.set(-r0 * 0.88, SEG_LEN * 0.5, dz * r0);
        j.add(s);
      }
    }
    joints.push(j);
    parent = j;
  }
  return { root, joints };
}

export class Tentacles {
  constructor(fx) {
    this.fx = fx;
    this.onEvent = () => {};
    this.model = build();
    this.reset();
  }

  reset() {
    this._cleanup();
    this.cur = null;
    this.next = 8;       // ряд, раньше которого не появится
    this.checkT = 1;
  }

  _cleanup() {
    const c = this.cur;
    if (!c) return;
    this.model.root.parent?.remove(this.model.root);
    c.m.sink = 0;
    c.m.sunk = false;
    c.m.hold = 1;
    c.m.obj.visible = true;
  }

  // lag — насколько камера (и паук) поджимает героя, в рядах
  update(dt, world, player, lag = 0) {
    if (!this.cur) { this._maybeStart(dt, world, player, lag); return; }
    const c = this.cur;
    if (!world.row(c.row)) { this._cleanup(); this.cur = null; return; }  // ряд уже позади
    c.t += dt;
    const m = c.m;
    const pos = m.obj.getWorldPosition(new THREE.Vector3());
    if (c.nb && !m.sunk) {
      const dx = m.x - c.nb.x;
      if (Math.abs(dx) <= 1.0) {  // соседняя вплотную — плывут рядом
        m.hold = 1;
        m.x = c.nb.x + Math.sign(dx || 1) * 1.0;
        m.obj.position.x = m.x;
      }
    }

    // герой спрыгнул с кувшинки, в которую целилось щупальце, — оно сразу её утаскивает
    if (c.own && c.state === 'warn' && player.log !== m) {
      m.hold = 1;
      this._go(c, 'rise');
      c.t = RISE * 0.6;  // выныривает уже почти во весь рост
    }
    if (c.state === 'warn') {
      c.bub -= dt;
      if (c.bub <= 0) { c.bub = 0.18; this.fx?.bubbles(new THREE.Vector3(pos.x + (Math.random() - 0.5) * 0.5, -0.25, pos.z + (Math.random() - 0.5) * 0.4), 2); }
      m.rollV += (Math.random() - 0.5) * 3 * dt * (0.5 + c.t);  // кувшинка подрагивает всё сильнее
      if (c.t >= WARN) this._go(c, 'rise', m);
    } else if (c.state === 'rise') {
      const k = Math.min(1, c.t / RISE);
      this._pose(-1.2 + 0.95 * k, 0.03 + 0.04 * k, c.t, 0.25);
      if (c.t >= RISE) { this._go(c, 'sink'); this.onEvent('tentacleGrab', pos.x, pos.z); m.sunk = true; }
    } else if (c.state === 'sink') {
      const k = Math.min(1, c.t / SINK);
      this._pose(-0.25 - 1.1 * k * k, 0.07 + 0.26 * Math.min(1, k * 4), c.t, 0.08);  // загибается, обвивает и тянет вниз
      m.sink = 0.95 * k * k;
      if (player.alive && player.log === m && k > 0.15) player.kill('tentacle');
      if (c.t >= SINK) {
        this._go(c, 'under');
        m.obj.visible = false;
        m.hold = 1;
        this.model.root.parent?.remove(this.model.root);
        this.fx?.bubbles(new THREE.Vector3(pos.x, -0.25, pos.z), 5);
      }
    } else if (c.state === 'under') {
      if (c.t >= UNDER) { this._go(c, 'surface'); m.obj.visible = true; this.fx?.bubbles(new THREE.Vector3(pos.x, -0.25, pos.z), 4); }
    } else if (c.state === 'surface') {
      const k = Math.min(1, c.t / SURFACE);
      m.sink = 0.6 * (1 - k) ** 2;
      if (k > 0.5) m.sunk = false;  // на всплывшую кувшинку снова можно прыгать
      if (c.t >= SURFACE) { m.sink = 0; this.cur = null; }
    }
  }

  _go(c, state) {
    c.state = state;
    c.t = 0;
    if (state === 'rise') {
      // щупальце — сбоку от кувшинки, изгибается над ней (внутрь, к центру кувшинки)
      const r = this.model.root;
      r.position.set(c.side * 0.5, -1.2, 0.12);
      r.rotation.set(0, c.side > 0 ? 0 : Math.PI, 0);
      c.m.obj.add(r);
    }
  }

  // Поза: высота основания и изгиб каждого сустава; кончик чуть извивается
  _pose(baseY, bend, t, sway = 0.06) {
    const { root, joints } = this.model;
    root.position.y = baseY;
    joints.forEach((j, k) => {
      j.rotation.z = bend * (0.6 + k * 0.09) + Math.sin(t * 7 - k * 0.7) * sway * (k / SEG);
      j.rotation.x = Math.sin(t * 3 + k * 0.5) * 0.04;
    });
  }

  _maybeStart(dt, world, player, lag) {
    if (!player.alive || player.row < this.next || player.hop || lag > 1.2) return;
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 0.5;
    if (Math.random() > 0.5) return;
    if (player.log) { this._startOwn(world, player); return; }
    // Герой на твёрдой земле перед рекой: переждать всегда безопасно
    if (world.row(player.row)?.type !== 'grass') return;
    // Кандидаты — только кувшинки впереди, не та, на которой стоит герой: щупальце
    // не загоняет в ловушку, а делает опасным прыжок на «бурлящую» кувшинку.
    // И только если в ряду рядом есть ещё хотя бы одна — путь вперёд не пропадает
    // (к тому же кувшинки подплывают не реже чем раз в ~3 с).
    const cands = [];
    for (let i = player.row + 1; i <= player.row + 1; i++) {  // первый ряд реки
      const r = world.row(i);
      if (r?.type !== 'river' || !r.zone.tentacle) continue;
      const free = r.movers.filter((m) => !m.sunk && Math.abs(m.x) <= HALF + 1);
      if (free.length < 2) continue;
      for (const m of free) {
        if (m === player.log || Math.abs(m.x) > HALF - 0.3 || Math.abs(m.x - player.x) > 2.2) continue;
        // где кувшинка окажется к концу хватки (с учётом того, что её держат)
        const at = m.x + r.dir * r.speed * PACE * HOLD * HELD_FOR;
        if (Math.abs(at) > HALF - 0.6) continue;
        cands.push([i, m]);
      }
    }
    if (!cands.length) return;
    const [row, m] = cands[Math.floor(Math.random() * cands.length)];
    this._begin(row, m, HOLD, null, player);
  }

  // Герой стоит на кувшинке: хватаем её, только если соседняя в этом ряду (выше по
  // течению) успеет подплыть вплотную, пока идут пузыри — тогда можно спрыгнуть вбок
  _startOwn(world, player) {
    const m = player.log;
    const r = world.row(player.row);
    if (r?.type !== 'river' || !r.zone.tentacle || m.len !== 1 || m.sunk) return;
    if (Math.abs(m.x) > HALF - 0.5) return;
    const close = r.speed * PACE * (1 - PULL);  // скорость сближения
    let best = null;
    for (const n of r.movers) {
      if (n === m || n.sunk) continue;
      if ((m.x - n.x) * r.dir <= 0) continue;  // соседняя должна быть выше по течению
      const d = Math.abs(m.x - n.x);
      const meet = (d - 1.0) / close;           // когда встанет вплотную
      if (meet < 0 || meet > WARN - 0.3) continue;
      const at = m.x - r.dir * r.speed * PACE * -PULL * meet;  // куда к тому времени утянет нашу
      if (Math.abs(at) > HALF - 0.3) continue;
      if (!best || d < best.d) best = { n, d };
    }
    if (!best) return;
    this._begin(player.row, m, PULL, best.n, player);
  }

  _begin(row, m, hold, nb, player) {
    // own — щупальце целится в кувшинку, на которой стоит герой
    this.cur = { row, m, nb, own: player.log === m, side: Math.random() < 0.5 ? 1 : -1, state: 'warn', t: 0, bub: 0 };
    m.hold = hold;
    this.next = player.row + irand(10, 16);
    const p = m.obj.getWorldPosition(new THREE.Vector3());
    this.onEvent('tentacleWarn', p.x, p.z);
  }
}
