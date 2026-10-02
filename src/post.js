import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Цепочка: сцена (HDR) → bloom (светятся глаза, фонари, цветы, лучи) →
// грейд: ACES, приглушённый цвет с оттенком зоны, дымка сверху, виньетка,
// тьма снизу при опасности, зерно и мерцание плёнки.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    res: { value: new THREE.Vector2(1, 1) },
    time: { value: 0 },
    danger: { value: 0 },
    exposure: { value: 1.2 },
    saturation: { value: 0.55 },
    tint: { value: new THREE.Vector3(1, 1, 1) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 res;
    uniform float time, danger, exposure, saturation;
    uniform vec3 tint;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    vec3 aces(vec3 x) {
      const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }

    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb * exposure;
      c = aces(c);
      c = pow(c, vec3(1.0 / 2.2));

      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, saturation) * tint;

      // Дымка сверху — свет пробивается сквозь кроны
      c += vec3(0.05, 0.05, 0.048) * smoothstep(0.45, 1.0, vUv.y);

      // Виньетка
      vec2 d = vUv - vec2(0.5, 0.52);
      d.x *= res.x / res.y;
      c *= mix(0.35, 1.0, smoothstep(1.05, 0.35, length(d)));

      // Тьма снизу, когда догоняет паук
      c *= 1.0 - danger * smoothstep(0.6, 0.0, vUv.y) * 0.85;

      // Зерно и мерцание
      float g = hash(floor(vUv * res) + fract(time * 13.0) * 97.0) - 0.5;
      c += g * 0.045;
      c *= 0.985 + 0.015 * sin(time * 23.0) * sin(time * 7.3);

      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};

export class Post {
  constructor(renderer, scene, camera) {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.28, 0.3, 0.95);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.u = this.grade.uniforms;
  }

  setSize(w, h, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    // bloom в половинном разрешении — заметно дешевле на телефонах
    this.bloom.setSize(Math.round(w * pixelRatio / 2), Math.round(h * pixelRatio / 2));
    this.u.res.value.set(w * pixelRatio, h * pixelRatio);
  }

  render(time, danger, tint) {
    this.u.time.value = time;
    this.u.danger.value = danger;
    this.u.tint.value.set(tint[0], tint[1], tint[2]);
    this.composer.render();
  }
}
