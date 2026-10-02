import * as THREE from 'three';
import { TEX } from './materials.js';

// Частицы в воздухе вокруг камеры, свои для каждой зоны:
//   dust   — пылинки, висящие в луче света (руины);
//   spores — медленно всплывающие споры (болото);
//   embers — тлеющие искры, летящие вверх (лесопилка);
//   rain   — косой дождь штрихами (лес);
//   wisps  — редкие блуждающие огоньки (кладбище).
const MODES = {
  dust:   { count: 90, size: 2.6, opacity: 0.22, color: 0xe6e6de, additive: false },
  spores: { count: 100, size: 3.2, opacity: 0.25, color: 0xcfe0c0, additive: true },
  embers: { count: 70, size: 3.2, opacity: 0.4, color: 0xffb070, additive: true },
  rain:   { count: 260, size: 2.0, opacity: 0.22, color: 0xc8d4dc, additive: false },
  wisps:  { count: 45, size: 3.6, opacity: 0.35, color: 0x9fd8ff, additive: true },
};
const MAX = 320;
const BOX = { w: 16, h: 5, d: 24 };

export class Dust {
  constructor(scene, pixelRatio) {
    this.pixelRatio = pixelRatio;
    this.pos = new Float32Array(MAX * 3);
    this.seed = new Float32Array(MAX);
    for (let i = 0; i < MAX; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * BOX.w;
      this.pos[i * 3 + 1] = Math.random() * BOX.h;
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * BOX.d - 3;
      this.seed[i] = Math.random() * 100;
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    // круглые мягкие точки вместо квадратов
    this.mat = new THREE.PointsMaterial({ map: TEX.glow, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    // Дождь — косые штрихи (отрезок на каплю): точки выглядели как снег
    this.streak = new Float32Array(MAX * 6);
    this.rainGeo = new THREE.BufferGeometry();
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(this.streak, 3));
    this.rainMat = new THREE.LineBasicMaterial({ color: 0xc8d4dc, transparent: true, opacity: 0.22, depthWrite: false, fog: false });
    this.rain = new THREE.LineSegments(this.rainGeo, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);
    this.setMode('dust');
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    const m = MODES[mode];
    this.mat.size = m.size * this.pixelRatio;
    this.mat.opacity = m.opacity;
    this.mat.color.set(m.color);
    this.mat.blending = m.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.mat.needsUpdate = true;
    this.geo.setDrawRange(0, m.count);
    this.rain.visible = mode === 'rain';
    this.points.visible = mode !== 'rain';
    this.rainGeo.setDrawRange(0, m.count * 2);
    this.rainMat.opacity = m.opacity;
  }

  update(dt, time, cx, cz) {
    this.points.position.set(cx, 0, cz);
    const p = this.pos;
    const n = MODES[this.mode].count;
    for (let i = 0; i < n; i++) {
      const s = this.seed[i];
      const k = i * 3;
      switch (this.mode) {
        case 'dust':
          p[k] += Math.sin(time * 0.3 + s) * dt * 0.15 + dt * 0.08;
          p[k + 1] += Math.cos(time * 0.4 + s * 1.7) * dt * 0.1;
          break;
        case 'spores':
          p[k] += Math.sin(time * 0.5 + s) * dt * 0.1;
          p[k + 1] += dt * (0.15 + (s % 1) * 0.2);
          break;
        case 'embers':
          p[k] += Math.sin(time * 2 + s) * dt * 0.4;
          p[k + 1] += dt * (0.6 + (s % 1) * 0.8);
          break;
        case 'wisps':
          p[k] += Math.sin(time * 0.6 + s) * dt * 0.3;
          p[k + 1] += Math.cos(time * 0.8 + s * 1.3) * dt * 0.15;
          break;
        case 'rain':
          p[k] += dt * 2.5;
          p[k + 1] -= dt * (9 + (s % 1) * 3);
          break;
      }
      if (p[k] > BOX.w / 2) p[k] -= BOX.w;
      if (p[k] < -BOX.w / 2) p[k] += BOX.w;
      if (p[k + 1] > BOX.h) p[k + 1] -= BOX.h;
      if (p[k + 1] < 0) p[k + 1] += BOX.h;
    }
    this.mat.opacity = MODES[this.mode].opacity * (this.mode === 'embers' ? 0.75 + 0.25 * Math.sin(time * 9) : 1);
    if (this.mode === 'rain') {
      // штрих тянется по направлению падения: вниз и чуть вбок по ветру
      this.rain.position.copy(this.points.position);
      const r = this.streak;
      for (let i = 0; i < n; i++) {
        const k = i * 3, o = i * 6;
        const len = 0.22 + (this.seed[i] % 1) * 0.16;
        r[o] = p[k]; r[o + 1] = p[k + 1]; r[o + 2] = p[k + 2];
        r[o + 3] = p[k] - len * 0.25; r[o + 4] = p[k + 1] + len; r[o + 5] = p[k + 2];
      }
      this.rainGeo.attributes.position.needsUpdate = true;
      return;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
