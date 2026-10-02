import * as THREE from 'three';
import { TEX } from './materials.js';

// Низкий туман (кладбище): большие мягкие пятна тумана стелются над землёй
// и медленно дрейфуют вокруг камеры. Предметы выше пятна торчат из тумана.
// Включается там, где зона просит (zone.mist), плавно проявляется и тает.
const N = 34;

export class Mist {
  constructor(scene) {
    this.mat = new THREE.MeshBasicMaterial({ map: TEX.glow, color: 0x9fb0bc, transparent: true, depthWrite: false, opacity: 0, fog: false });
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.group = new THREE.Group();
    this.puffs = [];
    for (let i = 0; i < N; i++) {
      const m = new THREE.Mesh(geo, this.mat);
      const s = 2.4 + Math.random() * 2.8;
      m.scale.set(s * 1.7, 1, s);
      m.position.set((Math.random() - 0.5) * 16, 0.08 + Math.random() * 0.5, 4 - Math.random() * 24);  // слоями у самой земли
      m.renderOrder = 4;
      m.userData.v = 0.08 + Math.random() * 0.18;
      this.group.add(m);
      this.puffs.push(m);
    }
    this.group.visible = false;
    this.level = 0;
    this.target = 0;
    scene.add(this.group);
  }

  setOn(on) { this.target = on ? 1 : 0; }

  update(dt, cx, cz) {
    this.level += (this.target - this.level) * Math.min(1, dt * 0.8);
    this.group.visible = this.level > 0.01;
    if (!this.group.visible) return;
    this.mat.opacity = 0.2 * this.level;
    for (const m of this.puffs) {
      m.position.x += m.userData.v * dt;
      // облако держится вокруг камеры: ушедшее пятно появляется с другой стороны
      const dx = m.position.x - cx;
      if (dx > 8) m.position.x -= 16;
      else if (dx < -8) m.position.x += 16;
      const dz = m.position.z - cz;
      if (dz > 6) m.position.z -= 24;
      else if (dz < -18) m.position.z += 24;
    }
  }
}
