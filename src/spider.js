import * as THREE from 'three';
import { DARK_EDGE } from './config.js';
import { MAT, TEX } from './materials.js';

// Паук живёт во тьме за краем поля. Пока игрок отстаёт от камеры
// (danger > 0), паук крадётся вдоль края рядом с ним: сначала во тьме видны
// только глаза, потом он высовывается на кромку. grab(): выбегает из тьмы,
// хватает героя лапами и утаскивает его обратно во тьму.
const HIDE = DARK_EDGE + 3.0;   // |x|, где паука не видно вовсе
const LURK = DARK_EDGE + 1.3;   // |x| при первой опасности — глаза во тьме
const PEEK = DARK_EDGE + 0.1;   // |x| перед броском — на самой кромке
const RUSH_SPEED = 13;
const DRAG_SPEED = 5;
const REACH = 0.55;             // насколько тело паука впереди героя, когда держит

// Глаза паука рисуются после тьмы (прозрачный проход, renderOrder выше),
// поэтому светятся сквозь неё.
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true });

export class Spider {
  constructor(scene, models) {
    this.root = new THREE.Group();
    this.model = models.make('spider');
    this.model.scale.setScalar(1.15);
    this.root.add(this.model);

    this.legs = [];
    this.model.traverse((o) => {
      if (/^Leg\d/.test(o.name)) this.legs.push({ o, base: o.quaternion.clone(), i: this.legs.length });
      if (o.isMesh && o.material === MAT.eye) { o.material = eyeMat; o.renderOrder = 6; }
    });

    // Отблеск глаз во тьме
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.6,
    }));
    this.glow.scale.set(0.9, 0.5, 1);
    this.glow.position.set(0, 0.35, 0.4);
    this.glow.renderOrder = 7;
    this.root.add(this.glow);

    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: TEX.shadow, transparent: true, depthWrite: false }));
    this.shadow.scale.setScalar(1.8);
    this.shadow.position.y = 0.03;
    this.shadow.renderOrder = 3;
    this.root.add(this.shadow);

    scene.add(this.root);
    this._axis = new THREE.Vector3(0, 0, 1);
    this._q = new THREE.Quaternion();
    this.reset();
  }

  reset() {
    this.side = 1;
    this.x = HIDE;
    this.z = 0;
    this.y = 0;
    this.face = -Math.PI / 2;
    this.state = 'idle';
    this.engaged = false;
    this.t = 0;
    this.curl = 0;
    this.gait = 0;
    this.root.visible = false;
  }

  get holding() { return this.state === 'grab' || this.state === 'drag'; }

  grab() { this.state = 'rush'; this.t = 0; }

  // Герой висит перед мордой паука
  carry(pos) {
    pos.x = this.x + Math.sin(this.face) * REACH;
    pos.z = this.z + Math.cos(this.face) * REACH;
    pos.y = this.y + 0.15;
  }

  update(dt, time, target, danger) {
    this.t += dt;
    const px = this.x, pz = this.z;

    if (this.state === 'idle') {
      // Выходит только при заметной опасности, прячется — когда её нет совсем
      // (гистерезис, чтобы не мелькал у кромки от мелких колебаний)
      if (danger > 0.15) this.engaged = true;
      else if (danger <= 0) this.engaged = false;
      const hidden = Math.abs(this.x) >= HIDE - 0.1;
      if (hidden) {
        // Спрятанный паук мгновенно переходит в тень у ближнего к герою края,
        // а не бежит через всё поле
        this.side = target.x >= 0 ? 1 : -1;
        this.x = this.side * HIDE;
        this.z = target.z;
      }
      const want = this.engaged ? LURK + (PEEK - LURK) * danger : HIDE;
      this.x += (this.side * want - this.x) * Math.min(1, dt * (this.engaged ? 6 : 3));
      this.z += (target.z - this.z) * Math.min(1, dt * 3);
      this.y = 0;
      this.curl += (0 - this.curl) * Math.min(1, dt * 5);
      this._faceTo(-this.side, 0, dt * 6);                     // смотрит на поле
    } else if (this.state === 'rush') {
      // Цель — встать так, чтобы герой оказался перед мордой
      const dx = target.x + this.side * REACH - this.x;
      const dz = target.z - this.z;
      const dist = Math.hypot(dx, dz);
      const step = RUSH_SPEED * dt;
      if (dist <= step) { this.x += dx; this.z += dz; this.state = 'grab'; this.t = 0; }
      else { this.x += (dx / dist) * step; this.z += (dz / dist) * step; }
      this.y = target.y;
      this._faceTo(-this.side, 0, 1);
    } else if (this.state === 'grab') {
      this.curl = Math.min(1, this.curl + dt * 9);
      if (this.t > 0.3) { this.state = 'drag'; this.t = 0; }
    } else if (this.state === 'drag') {
      // Пятится обратно во тьму, не отпуская добычу
      this.x += this.side * DRAG_SPEED * Math.min(1, this.t * 2) * dt;
      if (Math.abs(this.x) > HIDE + 2) this.state = 'gone';
    }

    const moved = Math.hypot(this.x - px, this.z - pz);
    this.gait += moved * 9;
    this.root.visible = this.state !== 'gone' && Math.abs(this.x) < HIDE - 0.05;
    this.root.position.set(this.x, this.y, this.z);
    this.model.rotation.y = this.face;
    // Тело чуть подпрыгивает на бегу и дышит в засаде
    this.model.position.y = 0.42 + Math.abs(Math.sin(this.gait)) * 0.04 * Math.min(1, moved / dt / 3) + Math.sin(time * 2) * 0.015;

    // Лапы: походка "через одну", подёргивание в засаде, сжатие при захвате
    const walking = Math.min(1, moved / Math.max(dt, 1e-3) / 2);
    for (const l of this.legs) {
      const phase = (l.i % 2 === (l.i < 4 ? 0 : 1)) ? 0 : Math.PI;
      const step = Math.sin(this.gait + phase) * 0.35 * walking;
      const twitch = Math.sin(time * 7 + l.i * 1.9) * 0.08 * (1 - walking) * (1 - this.curl);
      const bend = -0.35 + step + twitch - this.curl * 0.7;
      l.o.quaternion.copy(l.base).multiply(this._q.setFromAxisAngle(this._axis, bend));
    }

    // Глаза горят ярче, когда паук ближе к броску
    this.glow.material.opacity = 0.35 + danger * 0.5 + (this.state === 'rush' ? 0.4 : 0);
  }

  _faceTo(dx, dz, k) {
    const want = Math.atan2(dx, dz);
    let d = want - this.face;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.face += d * Math.min(1, k);
  }
}
