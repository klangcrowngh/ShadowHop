import * as THREE from 'three';
import { MAT, TEX } from './materials.js';

// Эффекты: искры, осколки, брызги, круги на воде, пыль, пузыри, пятна.
// Всё сдержанное — дополняет картинку, но не бросается в глаза.

const shardGeo = new THREE.BoxGeometry(1, 1, 1);
const dropGeo = new THREE.SphereGeometry(1, 6, 4);
const ringGeo = new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2);
const flatGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const SPARKS = 260;

const dropMat = new THREE.MeshStandardMaterial({ color: 0x9aa6a8, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.8 });
const splatMat = new THREE.MeshBasicMaterial({ map: TEX.shadow, color: 0x2a0d08, transparent: true, depthWrite: false, opacity: 0.8 });

export class FX {
  constructor(scene, models, pixelRatio) {
    this.scene = scene;
    this.models = models;
    this.items = [];

    // Искры из-под пил: пул точек, мёртвые прячутся под землю
    this.sparkPos = new Float32Array(SPARKS * 3).fill(-100);
    this.sparkVel = new Float32Array(SPARKS * 3);
    this.sparkLife = new Float32Array(SPARKS);
    this.sparkNext = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparkGeo = geo;
    const sparks = new THREE.Points(geo, new THREE.PointsMaterial({
      map: TEX.glow, color: 0xffe2b0, size: 3.5 * pixelRatio, sizeAttenuation: false, opacity: 0.7,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    sparks.frustumCulled = false;
    scene.add(sparks);
  }

  clear() {
    for (const it of this.items) this.scene.remove(it.obj);
    this.items = [];
  }

  _add(obj, life, update, extra = {}) {
    this.scene.add(obj);
    this.items.push({ obj, life, max: life, t: 0, update, ...extra });
  }

  spark(x, y, z, dir) {
    const i = this.sparkNext;
    this.sparkNext = (i + 1) % SPARKS;
    this.sparkPos.set([x, y, z], i * 3);
    this.sparkVel.set([dir * (1.5 + Math.random() * 2.5), 1 + Math.random() * 2.2, (Math.random() - 0.5) * 1.5], i * 3);
    this.sparkLife[i] = 0.25 + Math.random() * 0.25;
  }

  // Разлёт тёмных осколков
  shards(pos, count = 18, power = 1, sparks = true) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(shardGeo, MAT.silhouette);
      m.scale.setScalar(0.04 + Math.random() * 0.08);
      m.position.copy(pos).add(new THREE.Vector3(0, 0.4, 0));
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a), 1.2 + Math.random() * 1.5, Math.sin(a)).multiplyScalar(power * (1.5 + Math.random() * 2));
      this._add(m, 2, shardUpdate, { v, spin: new THREE.Vector3().randomDirection().multiplyScalar(10), floor: pos.y + 0.03 });
    }
    if (sparks) for (let i = 0; i < 30; i++) this.spark(pos.x, pos.y + 0.4, pos.z, Math.random() < 0.5 ? -1 : 1);
  }

  // Брызги: капли вверх + круги по воде
  splash(pos, power = 1) {
    for (let i = 0; i < Math.round(10 * power); i++) {
      const m = new THREE.Mesh(dropGeo, dropMat);
      m.scale.setScalar(0.025 + Math.random() * 0.03);
      m.position.copy(pos);
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * 0.8, 2 + Math.random() * 1.5, Math.sin(a) * 0.8).multiplyScalar(power);
      this._add(m, 1.2, dropUpdate, { v, floor: pos.y - 0.1 });
    }
  }

  // Расходящиеся круги на воде
  ripples(pos, count = 2, size = 0.8, opacity = 0.35) {
    for (let k = 0; k < count; k++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x8e999b, transparent: true, depthWrite: false, opacity: 0 });
      const m = new THREE.Mesh(ringGeo, mat);
      m.position.set(pos.x, pos.y + 0.01, pos.z);
      m.scale.setScalar(0.01);
      this._add(m, 1.4 + k * 0.35, ringUpdate, { delay: k * 0.35, size, opacity });
    }
  }

  // Облачко пыли у ног (прыжок, удар, край пропасти)
  dust(pos, count = 5, spread = 0.25, opacity = 0.25) {
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: 0x8a8578, transparent: true, depthWrite: false, opacity: 0 }));
      const a = Math.random() * Math.PI * 2;
      s.position.set(pos.x + Math.cos(a) * spread * 0.5, pos.y + 0.05, pos.z + Math.sin(a) * spread * 0.5);
      s.scale.setScalar(0.15);
      const v = new THREE.Vector3(Math.cos(a) * spread, 0.25 + Math.random() * 0.3, Math.sin(a) * spread);
      this._add(s, 0.7 + Math.random() * 0.3, dustUpdate, { v, opacity });
    }
  }

  // Клуб пара из клапана: быстро поднимается, растёт и тает. k — 0..1 от начала выброса
  steam(x, z, k) {
    for (let i = 0; i < 2; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: 0xb9bec2, transparent: true, depthWrite: false, opacity: 0 }));
      s.position.set(x + (Math.random() - 0.5) * 0.12, 0.12, z + (Math.random() - 0.5) * 0.12);
      s.scale.setScalar(0.2);
      const v = new THREE.Vector3((Math.random() - 0.5) * 0.3, 2.2 + Math.random() * 0.8, (Math.random() - 0.5) * 0.3);
      this._add(s, 0.55 + Math.random() * 0.2, steamUpdate, { v, opacity: 0.5 * (1 - k * 0.5) });
    }
  }

  // Пузыри из-под воды
  bubbles(pos, count = 6) {
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: 0xcfe0e4, transparent: true, depthWrite: false, opacity: 0 }));
      s.position.set(pos.x + (Math.random() - 0.5) * 0.3, pos.y, pos.z + (Math.random() - 0.5) * 0.3);
      s.scale.setScalar(0.06 + Math.random() * 0.05);
      const delay = i * 0.18 + Math.random() * 0.1;
      this._add(s, delay + 0.5, bubbleUpdate, { delay, y0: pos.y });
    }
  }

  // Тёмное пятно на земле (остаётся до рестарта)
  splatter(pos, size = 1) {
    const m = new THREE.Mesh(flatGeo, splatMat);
    m.position.set(pos.x, pos.y + 0.015, pos.z);
    m.rotation.y = Math.random() * 6;
    m.scale.set(size * 0.9, 1, size * 0.6);
    m.renderOrder = 2;
    this._add(m, 999, () => {});
  }

  update(dt) {
    this.items = this.items.filter((it) => {
      it.life -= dt;
      it.t += dt;
      it.update(it, dt);
      if (it.life <= 0) { this.scene.remove(it.obj); return false; }
      return true;
    });

    const p = this.sparkPos, v = this.sparkVel;
    for (let i = 0; i < SPARKS; i++) {
      if (this.sparkLife[i] <= 0) continue;
      this.sparkLife[i] -= dt;
      if (this.sparkLife[i] <= 0) { p[i * 3 + 1] = -100; continue; }
      v[i * 3 + 1] -= 9 * dt;
      p[i * 3] += v[i * 3] * dt;
      p[i * 3 + 1] = Math.max(0.02, p[i * 3 + 1] + v[i * 3 + 1] * dt);
      p[i * 3 + 2] += v[i * 3 + 2] * dt;
    }
    this.sparkGeo.attributes.position.needsUpdate = true;
  }
}

function shardUpdate(it, dt) {
  it.v.y -= 12 * dt;
  it.obj.position.addScaledVector(it.v, dt);
  if (it.obj.position.y < it.floor) { it.obj.position.y = it.floor; it.v.set(0, 0, 0); it.spin.set(0, 0, 0); }
  it.obj.rotation.x += it.spin.x * dt;
  it.obj.rotation.y += it.spin.y * dt;
}

function dropUpdate(it, dt) {
  it.v.y -= 12 * dt;
  it.obj.position.addScaledVector(it.v, dt);
  if (it.obj.position.y < it.floor) it.obj.visible = false;
}

function ringUpdate(it) {
  const t = it.t - it.delay;
  if (t < 0) return;
  const k = Math.min(1, t / (it.max - it.delay));
  it.obj.scale.setScalar(0.05 + it.size * (1 - (1 - k) ** 2));
  it.obj.material.opacity = it.opacity * (1 - k);
}

function dustUpdate(it, dt) {
  it.obj.position.addScaledVector(it.v, dt);
  it.v.multiplyScalar(1 - dt * 2.5);
  const k = it.t / it.max;
  it.obj.scale.setScalar(0.15 + k * 0.45);
  it.obj.material.opacity = it.opacity * Math.sin(Math.min(1, k) * Math.PI);
}

function steamUpdate(it, dt) {
  it.obj.position.addScaledVector(it.v, dt);
  it.v.multiplyScalar(1 - dt * 2);
  const k = it.t / it.max;
  it.obj.scale.setScalar(0.2 + k * 0.6);
  it.obj.material.opacity = it.opacity * Math.min(1, k * 6) * (1 - k);
}

function bubbleUpdate(it) {
  const t = it.t - it.delay;
  if (t < 0) return;
  const k = Math.min(1, t / 0.4);
  it.obj.position.y = it.y0 + k * 0.15;
  it.obj.material.opacity = 0.5 * Math.sin(k * Math.PI);
}
