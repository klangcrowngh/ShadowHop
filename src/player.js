import * as THREE from 'three';
import { HALF, HOP_TIME } from './config.js';
import { TEX } from './materials.js';

const DIRS = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] };
const FACE = { up: Math.PI, down: 0, left: -Math.PI / 2, right: Math.PI / 2 };
const lerp = (a, b, k) => a + (b - a) * k;

// Слоты на бревне длиной len: смещения -len/2+0.5 ... len/2-0.5 с шагом 1.
function snapToSlot(offset, len) {
  const half = len / 2 - 0.5;
  const k = Math.max(0, Math.min(len - 1, Math.round(offset + half)));
  return k - half;
}

export class Player {
  constructor(scene, models) {
    this.obj = new THREE.Group();
    this.body = models.make('hero');
    this.obj.add(this.body);

    // Круг света вокруг героя: выделяет его и клетки рядом
    const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.pool = new THREE.Mesh(flat, new THREE.MeshBasicMaterial({
      map: TEX.pool, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    this.pool.scale.setScalar(2.6);
    this.pool.material.opacity = 0.35;
    this.pool.renderOrder = 2;
    this.shadow = new THREE.Mesh(flat, new THREE.MeshBasicMaterial({ map: TEX.shadow, transparent: true, depthWrite: false }));
    this.shadow.scale.setScalar(0.6);
    this.shadow.renderOrder = 3;
    this.obj.add(this.pool, this.shadow);

    // Свечение глаз
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.8,
    }));
    this.glow.scale.set(0.3, 0.16, 1);
    this.glow.position.set(0, 0.66, 0.2);
    this.glow.renderOrder = 10;
    this.body.add(this.glow);
    scene.add(this.obj);
    this.models = models;
    this.fx = null;       // эффекты (ставит main.js)
    this.parts = [];      // временные объекты анимации смерти (половинки, снаряд)
    this.on = () => {};
    this.reset();
  }

  reset() {
    this.x = 0;
    this.row = 0;
    this.hop = null;
    this.log = null;
    this.offset = 0;
    this.queued = null;
    this.alive = true;
    this.death = null;
    this.face = Math.PI;
    this.squash = 0;
    this.stuck = 0;  // > 0 — сидит в капкане
    for (const p of this.parts) p.parent?.remove(p);
    this.parts = [];
    this.body.visible = true;
    this.obj.rotation.set(0, 0, 0);
    this.obj.scale.set(1, 1, 1);
    this.obj.visible = true;
    this.pool.visible = this.shadow.visible = this.glow.visible = true;
    this.glow.material.opacity = 0.4;
    this.obj.position.set(0, 0, 0);
    this.body.scale.set(1, 1, 1);
    this.body.rotation.set(0, this.face, 0);
  }

  get hopping() { return !!this.hop; }

  move(dir, world) {
    if (!this.alive) return;
    if (this.stuck > 0) { this.squash = 0.3; return; }  // в капкане — не прыгнуть, только дёргаться
    if (this.hop) { this.queued = dir; return; }
    const [dx, dr] = DIRS[dir];
    this.face = FACE[dir];

    const sideOnLog = this.log && dr === 0;
    const tx = sideOnLog ? this.x + dx : Math.round(this.x) + dx;
    const tr = this.row + dr;
    const target = world.row(tr);
    if (!target || Math.abs(tx) > HALF + 0.5 ||
        ((target.type === 'grass' || target.type === 'press' || target.type === 'gates') && target.blocked.has(Math.round(tx))) ||
        world.pressBlocks(tr, tx)) {  // в опущенный молот — врезаемся, как в препятствие
      this.squash = 0.5;
      this.on('bump');
      return;
    }

    if (this.log) {  // отталкиваемся — предмет подбрасывает
      this.log.load = 0;
      this.log.dipV -= 0.6;
    }
    this.hop = {
      fx: this.x, fr: this.row, fy: this.obj.position.y,
      tx, tr, t: 0,
      log: sideOnLog ? this.log : null,
      fromOff: this.offset, toOff: this.offset + dx,
    };
    this.log = null;
    this.on('hop');
  }

  // info — что ударило: { what: имя модели опасности, dir: направление её движения }
  kill(kind, info = {}) {
    if (!this.alive) return;
    this.alive = false;
    this.hop = null;
    if (this.log) this.log.load = 0;
    const style = kind === 'road'
      ? ({ saw: 'split', gear: 'split', thornball: 'crush', cart: 'knock', rolllog: 'crush', boar: 'knock', mudball: 'crush', drum: 'crush', ghost: 'steam', hearse: 'knock' })[info.what] ?? 'split'
      : kind === 'tentacle' ? 'drown' : kind === 'press' || kind === 'gate' ? 'crush' : kind === 'hand' ? 'bury' : kind;  // 'steam' — свой стиль
    this.death = { kind, style, what: info.what, t: 0, dir: info.dir ?? 1, v: new THREE.Vector3() };
    this._startDeath(this.death);
    this.on('death', kind);
  }

  _startDeath(d) {
    const p = this.obj.position;
    const fx = this.fx;
    switch (d.style) {
      case 'split': {  // распилило: две половины героя разваливаются в стороны
        this.body.visible = false;
        for (const s of [-1, 1]) {
          const half = this.body.clone(true);
          half.visible = true;
          const sprites = [];
          half.traverse((o) => { if (o.isSprite) sprites.push(o); });
          sprites.forEach((o) => o.parent.remove(o));
          const plane = new THREE.Plane();
          half.traverse((o) => {
            if (!o.isMesh) return;
            o.material = o.material.clone();
            o.material.clippingPlanes = [plane];
            o.material.clipShadows = true;
            o.material.side = THREE.DoubleSide;
          });
          // наклоняем обёртку, а не копию: у копии свой поворот (куда смотрит герой)
          const pivot = new THREE.Group();
          pivot.add(half);
          this.obj.add(pivot);
          this.parts.push(pivot);
          pivot.userData = { s, half, plane, local: new THREE.Plane(new THREE.Vector3(s, 0, 0), 0) };
        }
        fx?.shards(p, 14, 0.8);
        fx?.splatter(p, 1.1);
        break;
      }
      case 'crush':
        fx?.shards(p, 10, 0.5, false);
        fx?.splatter(p, 0.9);
        break;
      case 'knock':  // вагонетка отбрасывает по дуге
        d.v.set(d.dir * 5.5, 4.5, 0.6);
        fx?.shards(p, 8, 0.6);
        break;
      case 'steam':  // обварило паром: подбрасывает в столбе пара, съёживается и тает
        fx?.dust(p.clone().setY(0.4), 12, 0.5, 0.45);
        break;
      case 'hunt': {  // снаряд застревает, героя сбивает по направлению удара
        const proj = this.models.make(this.lastProjectile ?? 'spear');
        proj.scale.setScalar(1.3);
        proj.rotation.y = d.dir > 0 ? 0 : Math.PI;
        proj.position.set(-d.dir * 0.12, 0.55, 0);
        this.obj.add(proj);
        this.parts.push(proj);
        fx?.dust(p, 6, 0.4, 0.3);
        break;
      }
      case 'drown':
      case 'drift':
        fx?.splash(p, 1);
        fx?.bubbles(p, 7);
        break;
      case 'fall':
        fx?.dust(p, 6, 0.35, 0.3);
        break;
      case 'bury':
        fx?.dust(p, 8, 0.4, 0.35);
        break;
    }
  }

  // Высота опоры в ряду: вода — верх плавучего предмета зоны, иначе земля
  _baseY(world, row) {
    const r = world.row(row);
    if (r?.type !== 'river') return 0;
    // на плавучем предмете — вместе с его покачиванием
    if (this.log && row === this.row) return this.log.blade.position.y + (r.zone.float.top - r.zone.float.y);
    return world.floatTop(row);
  }

  update(dt, world, time) {
    if (!this.alive) { this._animateDeath(dt); return; }

    const base = this._baseY(world, this.row);
    let y = base;
    if (this.hop) {
      const h = this.hop;
      h.t += dt / HOP_TIME;
      const k = Math.min(1, h.t);
      this.x = h.log ? h.log.x + lerp(h.fromOff, h.toOff, k) : lerp(h.fx, h.tx, k);
      const ty = this._baseY(world, h.tr);
      y = lerp(h.fy, ty, k) + Math.sin(k * Math.PI) * 0.45;
      this.obj.position.z = -lerp(h.fr, h.tr, k);
      const hit = world.hazardAt(k < 0.5 ? h.fr : h.tr, this.x);
      // молот давит только стоящего на его клетке, в прыжке — нет
      if (hit && hit !== 'press') { this.lastProjectile = world.lastHit?.what; return this.kill(hit, world.lastHit); }
      if (k >= 1) { this._land(world); if (!this.alive) return; }
    } else {
      if (this.log) {
        this.x = this.log.x + this.offset;
        this.log.loadOffset = this.offset;
        if (Math.abs(this.x) > HALF + 0.9) return this.kill('drift');
      }
      this.obj.position.z = -this.row;
      const hit = world.hazardAt(this.row, this.x);
      if (hit) { this.lastProjectile = world.lastHit?.what; return this.kill(hit, world.lastHit); }
      // створки ворот захлопнулись, когда герой стоял в проёме, — отбрасывают на ряд назад
      if (world.gateShove(this.row, this.x)) {
        this.on('bump');
        this.move('down', world);
        if (!this.hop) return this.kill('gate');  // отступать некуда — прижало створками
      }
      // доска под ногами провалилась
      if (world.row(this.row)?.type === 'bridge' && !world.plankHolds(this.row, Math.round(this.x))) return this.kill('fall');
    }

    this.obj.position.x = this.x;
    this.obj.position.y = this.hop ? y : base;
    const ground = base + 0.02;
    const lift = this.obj.position.y - ground;
    this.shadow.position.y = this.pool.position.y = -lift;
    this.shadow.scale.setScalar(0.6 - lift * 0.4);
    // ореол глаз виден, только когда герой смотрит в сторону камеры (+Z); сзади его закрывает капюшон
    const toCam = Math.max(0, Math.cos(this.body.rotation.y));
    this.glow.material.opacity = (0.4 + Math.sin(time * 2.2) * 0.08) * toCam;

    // Поворот по кратчайшему пути
    let da = this.face - this.body.rotation.y;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    this.body.rotation.y += da * Math.min(1, dt * 25);

    // Сжатие-растяжение
    this.squash = Math.max(0, this.squash - dt * 7);
    if (this.stuck > 0) {
      this.stuck -= dt;
      this.body.rotation.z = this.stuck > 0 ? Math.sin(time * 38) * 0.14 : 0;  // вырывается из капкана
    }
    const stretch = this.hop ? Math.sin(Math.min(1, this.hop.t) * Math.PI) * 0.15 : 0;
    const breath = this.hop ? 0 : Math.sin(time * 3) * 0.015;
    const sy = 1 + stretch - this.squash * 0.28 + breath;
    const sxz = 1 - stretch * 0.4 + this.squash * 0.14;
    this.body.scale.set(sxz, sy, sxz);
  }

  _land(world) {
    const h = this.hop;
    this.hop = null;
    this.row = h.tr;
    this.squash = 1;
    const row = world.row(this.row);

    if (row.type === 'river') {
      if (h.log && Math.abs(h.toOff) <= h.log.len / 2 - 0.5 + 0.01) {
        this.log = h.log;
        this.offset = h.toOff;
      } else if (h.log) {
        // шагнул с края — может, вплотную рядом плывёт другой предмет
        const other = world.logAt(this.row, h.tx);
        if (!other || other === h.log) return this.kill('drown');
        this.log = other;
        this.offset = snapToSlot(h.tx - other.x, other.len);
      } else {
        const log = world.logAt(this.row, h.tx);
        if (!log) return this.kill('drown');
        this.log = log;
        this.offset = snapToSlot(h.tx - log.x, log.len);
      }
      this.x = this.log.x + this.offset;
      this.log.load = 1;
      this.log.loadOffset = this.offset;
      // толчок от приземления: резко проседает и кренится в сторону героя
      const light = this.log.len === 1 ? 1.5 : 1;
      this.log.dipV += 1.6 * light;
      this.log.rollV += -this.offset * 2.2 * light - (h.log ? 0 : (h.tx - h.fx) * 0.8);
      this.log.rollV += (Math.random() - 0.5) * 1.4 * light;  // даже по центру предмет чуть раскачивается
      this.on('land', this.log.len === 1 ? 'lily' : 'float');  // кувшинка — одна клетка
    } else {
      this.log = null;
      this.x = Math.round(h.tx);
      this.fx?.dust(new THREE.Vector3(this.x, 0, -this.row), 3, 0.2, 0.12);
      if (row.type === 'bridge' && !world.stepOnPlank(this.row, this.x)) return this.kill('fall');
      if (world.trapAt(this.row, this.x)) {  // капкан: застрял, дёргается
        this.stuck = 1.2;
        this.queued = null;
        this.on('trap');
      }
      this.on('land', row.type === 'bridge' ? 'plank' : row.type === 'road' ? 'road' : row.type === 'press' || row.type === 'steam' ? 'metal' : 'grass');
    }

    if (this.queued) {
      const q = this.queued;
      this.queued = null;
      this.move(q, world);
    }
  }

  _animateDeath(dt) {
    const d = this.death;
    d.t += dt;
    const t = d.t;
    this.glow.material.opacity = Math.max(0, this.glow.material.opacity - dt * 1.2);
    this.pool.visible = this.shadow.visible = t < 0.3;
    const p = this.obj.position;
    switch (d.style) {
      case 'split':
        for (const pivot of this.parts) {
          const { s, half, plane, local } = pivot.userData;
          const k = Math.min(1, t * 2.2);
          // плоскость разреза — в координатах самой копии (её лево/право)
          half.updateMatrixWorld(true);
          const side = new THREE.Vector3(s, 0, 0).applyQuaternion(half.quaternion).x >= 0 ? 1 : -1;
          pivot.position.x = side * 0.18 * k;
          pivot.rotation.z = -side * 1.2 * k * k;      // половины заваливаются наружу
          pivot.position.y = -0.05 * k;
          pivot.updateMatrixWorld(true);
          plane.copy(local).applyMatrix4(half.matrixWorld);
        }
        break;
      case 'crush': {  // сплющивает и прокатывает
        const k = Math.min(1, t * 8);
        this.body.scale.set(1 + k * 0.5, Math.max(0.12, 1 - k * 0.9), 1 + k * 0.5);
        this.obj.rotation.z = -d.dir * k * 0.3;
        break;
      }
      case 'steam': {
        const k = Math.min(1, t * 1.4);
        p.y += dt * (1.2 - k);
        this.obj.rotation.y += dt * 7 * (1 - k * 0.5);
        this.body.scale.set(1 - k * 0.45, 1 - k * 0.6, 1 - k * 0.45);
        if (t > 0.15 && !d.puffed) { d.puffed = true; this.fx?.dust(p.clone(), 10, 0.45, 0.4); }
        if (t > 0.85) this.obj.visible = false;
        break;
      }
      case 'knock':
        d.v.y -= 14 * dt;
        p.addScaledVector(d.v, dt);
        this.obj.rotation.z -= d.dir * dt * 9;
        this.obj.rotation.x += dt * 3;
        if (p.y < -2) this.obj.visible = false;
        break;
      case 'hunt': {  // отлетает на полклетки и падает на спину по направлению удара
        const k = Math.min(1, t * 5);
        p.x += d.dir * dt * 2.5 * (1 - k);
        this.obj.rotation.z = -d.dir * (Math.PI / 2) * (1 - (1 - k) ** 3);
        p.y = Math.max(0, p.y - dt * 2);
        break;
      }
      case 'drift':
        if (this.log) p.x = this.log.x + this.offset;
        // fallthrough
      case 'drown':  // медленно уходит под воду, покачиваясь
        p.y -= dt * (0.25 + t * 0.35);
        this.obj.rotation.z = Math.sin(t * 5) * 0.12;
        this.obj.rotation.x = Math.min(0.4, t * 0.4);
        if (t > 0.5 && t < 0.6 && !d.bubbled) { d.bubbled = true; this.fx?.bubbles(p.clone().setY(-0.25), 5); }
        if (p.y < -1.6) this.obj.visible = false;
        break;
      case 'fall':  // в пропасть: кувыркается и уменьшается в темноте
        p.y -= dt * (1.5 + t * 16);
        this.obj.rotation.x += dt * 4;
        this.obj.rotation.z += dt * 2;
        this.obj.scale.setScalar(Math.max(0.3, 1 - t * 0.5));
        if (p.y < -5) this.obj.visible = false;
        break;
      case 'bury': {  // рука держит, дёргается и утягивает под землю
        const k = Math.max(0, t - 0.35);
        p.y = -k * 0.9 * (1 + k);
        this.obj.rotation.z = Math.sin(t * 14) * 0.15 * Math.min(1, t * 3);
        if (t > 0.4 && !d.puffed) { d.puffed = true; this.fx?.dust(p.clone().setY(0.05), 8, 0.5, 0.35); }
        if (p.y < -1.3) this.obj.visible = false;
        break;
      }
      case 'spider':
        // высоту задаёт паук (main.js), герой беспомощно болтается
        this.obj.rotation.z = Math.sin(t * 9) * 0.25 * Math.min(1, t * 2);
        break;
    }
  }
}
