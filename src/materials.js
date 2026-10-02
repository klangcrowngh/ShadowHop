import * as THREE from 'three';
import { PAL } from './config.js';

export const sharedTime = { value: 0 };

// ---------------------------------------------------------------------------
// Общие шейдерные вставки
// ---------------------------------------------------------------------------
const NOISE = /* glsl */`
  float sh_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float sh_noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(sh_hash(i), sh_hash(i + vec2(1, 0)), f.x), mix(sh_hash(i + vec2(0, 1)), sh_hash(i + vec2(1, 1)), f.x), f.y);
  }
  float sh_fbm(vec2 p) { return sh_noise(p) * 0.6 + sh_noise(p * 2.3) * 0.28 + sh_noise(p * 5.1) * 0.12; }
`;

// Отражения источников света на мокрой земле и воде: вытянутые к камере
// дорожки бликов (как на референсе). Позиции 4 ближайших источников
// (xyz + яркость) обновляет main.js каждый кадр.
export const sheenLights = { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, -100, 0, 0)) };
// Отражение неба на мокром: чем дальше от камеры, тем сильнее блестит (x — z точки взгляда)
export const sheenSky = { value: new THREE.Vector2(0, 0.1) };
const SHEEN = /* glsl */`
  uniform vec4 sheenLights[4];
  uniform vec2 sheenSky;
  vec3 sheenAt(vec3 wp, float wetness, float t) {
    float far = smoothstep(-3.0, 12.0, sheenSky.x - wp.z);
    float s = far * far * sheenSky.y * (0.75 + 0.25 * sin(wp.z * 3.0 + wp.x * 0.7));
    for (int i = 0; i < 4; i++) {
      vec4 L = sheenLights[i];
      vec2 d = wp.xz - L.xz;
      float toward = max(d.y, 0.0);     // к камере (+Z) дорожка длиннее
      float away = min(d.y, 0.0);
      float ripple = 0.7 + 0.3 * sin(wp.z * 9.0 + wp.x * 2.0 + t * 1.5);
      s += L.w * exp(-d.x * d.x * 5.0 - toward * toward * 0.07 - away * away * 2.0) * ripple;
    }
    return vec3(1.0, 0.95, 0.85) * s * wetness;
  }
`;

// Встраивает мировую позицию, фактуру (grain) и контурный свет в стандартный материал.
//   grain: 'wood' — волокна, 'stone' — пятна, 'none'
//   rim:   сила контурного света (опасности ярче, чтобы читались)
//   wet:   мокрая земля — блики от огней; puddles — ещё и лужи (тёмные зеркальные пятна)
function enhance(mat, { grain = 'none', rim = 0, wet = false, puddles = false, wind = false, key }) {
  mat.onBeforeCompile = (s) => {
    if (wind) {  // верх травинок качается сильнее основания
      s.uniforms.windTime = sharedTime;
      s.vertexShader = 'uniform float windTime;\n' + s.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vec4 wWorld = modelMatrix * vec4(transformed, 1.0);
         float wH = max(0.0, transformed.y);
         transformed.x += sin(windTime * 1.6 + wWorld.x * 1.3 + wWorld.z * 0.7) * 0.05 * wH;
         transformed.z += sin(windTime * 1.1 + wWorld.x * 0.8) * 0.025 * wH;`
      );
    }
    s.uniforms.rimColor = { value: new THREE.Color(PAL.rim) };
    s.uniforms.sheenLights = sheenLights;
    s.uniforms.sheenSky = sheenSky;
    s.uniforms.sheenTime = sharedTime;
    s.vertexShader = 'varying vec3 vWorldPos;\n' + s.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
       vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
    );
    let frag = 'uniform vec3 rimColor;\nuniform float sheenTime;\nvarying vec3 vWorldPos;\n' + NOISE + SHEEN + s.fragmentShader;
    if (grain !== 'none' || wet) {
      frag = frag.replace('#include <color_fragment>', `#include <color_fragment>
        ${grain === 'wood' ? `
          float g = sh_noise(vec2(vWorldPos.x * 1.5 + vWorldPos.z * 1.5, vWorldPos.y * 22.0 + (vWorldPos.x - vWorldPos.z) * 3.0));
          diffuseColor.rgb *= 0.78 + g * 0.42;` : ''}
        ${grain === 'stone' ? `
          float g = sh_fbm(vWorldPos.xz * 3.0 + vWorldPos.y * 2.0);
          diffuseColor.rgb *= 0.72 + g * 0.5;` : ''}
        ${wet ? `
          float pud = smoothstep(0.64, 0.67, sh_fbm(vWorldPos.xz * 0.7 + 7.0)) * ${puddles ? '0.8' : '0.0'};
          float grit = sh_fbm(vWorldPos.xz * 4.0);
          diffuseColor.rgb *= mix(0.85 + grit * 0.3, 0.5, pud);` : ''}`);
    }
    if (wet) {
      frag = frag.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.45, pud);`);
    }
    let extra = '';
    if (rim > 0) {
      extra += `
        float rimK = pow(1.0 - clamp(abs(normal.z), 0.0, 1.0), 2.5) * smoothstep(-0.3, 0.9, normal.y);
        outgoingLight += rimColor * rimK * ${rim.toFixed(2)};`;
    }
    if (wet) {  // мокрая земля: блики-дорожки от ближайших источников, сильнее в лужах
      extra += `
        outgoingLight += sheenAt(vWorldPos, mix(0.35, 1.0, pud / 0.8), sheenTime);`;
    }
    if (extra) frag = frag.replace('#include <opaque_fragment>', extra + '\n#include <opaque_fragment>');
    s.fragmentShader = frag;
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

const std = (color, rough, metal, opts) =>
  enhance(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }), opts);

// ---------------------------------------------------------------------------
// Материалы моделей — по имени материала из Blender
// ---------------------------------------------------------------------------
// Имена совпадают с PALETTE в blender/make_models.py (регистр и символы игнорируются).
// [цвет sRGB, шероховатость, металличность, фактура]
const SURFACES = {
  cloak:      ['#262a33', 0.9, 0.0, 'none'],
  pants:      ['#2b2a2c', 0.9, 0.0, 'none'],
  boots:      ['#221a14', 0.7, 0.0, 'none'],
  leather:    ['#6a4128', 0.65, 0.0, 'none'],
  leatherdark:['#3a2518', 0.7, 0.0, 'none'],
  skin:       ['#b88768', 0.8, 0.0, 'none'],
  skinshade:  ['#5e4232', 0.85, 0.0, 'none'],
  shadow:     ['#070708', 1.0, 0.0, 'none'],
  shirt:      ['#4a5a3a', 0.9, 0.0, 'none'],
  canvas:     ['#6e5a40', 0.9, 0.0, 'none'],
  beard:      ['#3b2618', 0.95, 0.0, 'none'],
  hat:        ['#4a3322', 0.85, 0.0, 'none'],
  fur:        ['#7d5638', 0.95, 0.0, 'none'],
  antler:     ['#cbb896', 0.7, 0.0, 'none'],
  bone:       ['#d9d0bd', 0.6, 0.0, 'none'],
  wood:       ['#5a3b27', 0.8, 0.0, 'wood'],
  wooddark:   ['#3e2a1c', 0.85, 0.0, 'wood'],
  bark:       ['#2e2620', 0.95, 0.0, 'wood'],
  moss:       ['#56702f', 0.9, 0.0, 'stone'],
  grass:      ['#4f6a2c', 0.9, 0.0, 'none'],
  reed:       ['#77733d', 0.85, 0.0, 'none'],
  capred:     ['#a33c2c', 0.6, 0.0, 'none'],
  stem:       ['#d8cbb0', 0.8, 0.0, 'none'],
  leaf:       ['#2b4527', 0.75, 0.0, 'none'],
  stone:      ['#6a6c6f', 0.9, 0.0, 'stone'],
  stonedark:  ['#46484b', 0.9, 0.0, 'stone'],
  brick:      ['#5d514a', 0.9, 0.0, 'stone'],
  steel:      ['#50555b', 0.35, 0.75, 'none'],
  steeldark:  ['#2f3236', 0.5, 0.6, 'none'],
  rust:       ['#6b3a24', 0.75, 0.3, 'stone'],
  coal:       ['#141414', 0.6, 0.0, 'none'],
  rope:       ['#8c7450', 0.95, 0.0, 'none'],
  chitin:     ['#0d0d0f', 0.35, 0.1, 'none'],
  body:       ['#0c0c0d', 0.85, 0.0, 'none'],
  hazard:     ['#c99a22', 0.55, 0.2, 'none'],   // жёлтая предупреждающая краска (паровой молот)
  brass:      ['#a07a3a', 0.35, 0.8, 'none'],
  glass:      ['#d9d4c0', 0.2, 0.0, 'none'],
  boarfur:    ['#3a2a20', 0.95, 0.0, 'none'],   // тёмный мех кабана
  leaflight:  ['#4f7040', 0.75, 0.0, 'none'],   // светлая листва кустов и деревцев
  berry:      ['#8e2230', 0.4, 0.0, 'none'],
  swampmoss:  ['#5d6a33', 0.9, 0.0, 'none'],   // бороды мха на болотных кустах
  mud:        ['#5c452b', 0.5, 0.0, 'stone'],   // мокрый ил болотного кома
  sawn:       ['#9a7650', 0.85, 0.0, 'wood'],   // свежий срез дерева
  sawdust:    ['#5f4f39', 0.95, 0.0, 'none'],   // опилки
  marble:     ['#7d7c77', 0.7, 0.0, 'stone'],   // выветренный мрамор статуй и колонн
  dirt:       ['#3b3026', 0.95, 0.0, 'stone'],  // свежая могильная земля
  zombieskin: ['#6f7d63', 0.8, 0.0, 'none'],    // истлевшая кожа руки мертвеца
};
export const isKnownSurface = (name) => !!SURFACES[(name || '').toLowerCase().replace(/[^a-z]/g, '')];
const cache = new Map();

export function surfaceMaterial(blenderName, rim) {
  const key = (blenderName || 'body').toLowerCase().replace(/[^a-z]/g, '');
  const surf = SURFACES[key] ? key : 'body';
  const id = `${surf}:${rim}`;
  if (!cache.has(id)) {
    const [color, rough, metal, grain] = SURFACES[surf];
    const wind = surf === 'grass' || surf === 'reed' || surf === 'moss' || surf === 'leaf' || surf === 'leaflight' || surf === 'swampmoss';  // качается на ветру
    cache.set(id, std(color, rough, metal, { grain, rim, wind, key: `surf-${id}` }));
  }
  return cache.get(id);
}

export const RIM = { decor: 0.12, hero: 0.45, hazard: 0.5 };

export const MAT = {
  silhouette: surfaceMaterial('body', RIM.decor),
  hazard: surfaceMaterial('body', RIM.hazard),
  // светится и подхватывается bloom-ом
  eye: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.1), fog: false }),
  // нашивка Rentrobot на рюкзаке героя — слабое тёплое свечение
  logo: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.05, 0.9, 0.68) }),
  // глаза, светящиеся сквозь тьму за краем поля (прозрачный проход после тьмы)
  eyeOverDark: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.1), fog: false, transparent: true }),
  // светящиеся болотные грибы — мягкий бирюзовый, чуть подхватывается bloom-ом
  glowcap: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45, 1.25, 1.1) }),
  // призрак: полупрозрачный, по краям силуэта светится ярче (кромка ловит bloom),
  // в середине сквозь него видно землю. Камера ортографическая — взгляд вдоль оси z вида
  ghost: new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { color: { value: new THREE.Color(0.72, 0.88, 1.0) } },
    vertexShader: 'varying vec3 vN; void main() { vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 color; varying vec3 vN; void main() { float f = pow(1.0 - abs(vN.z), 2.0); gl_FragColor = vec4(color * (0.55 + 1.2 * f), 0.26 + 0.62 * f); }',
  }),
  // призрак с текстурой (модель пользователя): то же свечение, но тёмное в текстуре —
  // глаза и рот — остаётся плотным и тёмным, не тает вместе с простынёй
  ghostTex: (map) => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,  // виден только передний слой простыни — внутренние складки не просвечивают кашей
    uniforms: { map: { value: map }, color: { value: new THREE.Color(0.72, 0.88, 1.0) } },
    vertexShader: 'varying vec3 vN; varying vec2 vUv; void main() { vUv = uv; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D map; uniform vec3 color; varying vec3 vN; varying vec2 vUv;
      void main() {
        vec3 t = texture2D(map, vUv).rgb;
        float dark = 1.0 - smoothstep(0.12, 0.35, dot(t, vec3(0.299, 0.587, 0.114)));
        float f = pow(1.0 - abs(vN.z), 2.0);
        vec3 c = mix(color * (0.35 + 0.3 * t.r + 1.1 * f), vec3(0.01, 0.015, 0.03), dark);
        gl_FragColor = vec4(c, mix(0.22 + 0.6 * f, 0.95, dark));
      }`,
  }),
  // огоньки свечей — тёплые, подхватываются bloom-ом
  flame: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.05, 0.4) }),
};

// ---------------------------------------------------------------------------
// Земля и дорожки — по зоне
// ---------------------------------------------------------------------------
const zoneMats = new Map();
export function zoneMat(zone) {
  let m = zoneMats.get(zone.id);
  if (m) return m;
  const p = zone.pal;
  const ground = (c, k) => std(c, 0.62, 0.0, { wet: true, puddles: !!zone.puddles, key: `ground-${zone.id}-${k}` });
  m = {
    grassA: ground(p.grassA, 'a'),
    grassB: ground(p.grassB, 'b'),
    path: std(p.path, 0.7, 0.0, { grain: 'stone', key: `path-${zone.id}` }),
    road: ground(p.road, 'road'),
    detail: std(p.detail, 0.9, 0.0, { key: `detail-${zone.id}` }),
    roadEdge: std(p.roadEdge, 0.75, 0.0, { grain: 'stone', key: `edge-${zone.id}` }),
    rail: new THREE.MeshStandardMaterial({ color: p.rail, roughness: 0.3, metalness: 0.8 }),
    sleeper: std(p.sleeper, 0.9, 0.0, { grain: 'wood', key: `sleeper-${zone.id}` }),
    pit: new THREE.MeshBasicMaterial({ color: p.pit }),
    // направляющая пилы: тёмная сталь и чёрная прорезь
    guide: new THREE.MeshStandardMaterial({ color: 0x2a2c2f, roughness: 0.45, metalness: 0.75 }),
    slot: new THREE.MeshBasicMaterial({ color: 0x050505 }),
    // стоячая вода в лужах болотной тропы: тёмная и блестящая
    puddle: new THREE.MeshStandardMaterial({ color: 0x0b0f0c, roughness: 0.1, metalness: 0.3 }),
  };
  zoneMats.set(zone.id, m);
  return m;
}

// ---------------------------------------------------------------------------
// Текстуры-градиенты для свечения и теней
// ---------------------------------------------------------------------------
function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function linearTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 16);
  const v = g.createLinearGradient(0, 0, 0, 16);  // мягкие края полосы
  v.addColorStop(0, 'rgba(0,0,0,1)');
  v.addColorStop(0.5, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = v;
  g.fillRect(0, 0, 128, 16);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const TEX = {
  trail: linearTexture(),
  glow: radialTexture([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]),
  pool: radialTexture([[0, 'rgba(255,252,240,0.6)'], [0.45, 'rgba(255,252,240,0.2)'], [1, 'rgba(255,252,240,0)']]),
  shadow: radialTexture([[0, 'rgba(0,0,0,0.75)'], [0.6, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]),
};

// Световое пятно на земле (под лучом, под фонарём, вокруг героя)
export const poolMat = new THREE.MeshBasicMaterial({
  map: TEX.pool, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
});

// ---------------------------------------------------------------------------
// Объёмный луч света сверху (открытый конус, мягкие края, дрожащая пыль)
// ---------------------------------------------------------------------------

export const shaftMat = new THREE.ShaderMaterial({
  uniforms: { time: sharedTime, strength: { value: 0.16 } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    varying float vFacing;
    varying vec3 vWorld;
    void main() {
      vUv = uv;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      vec3 n = normalize(mat3(modelMatrix) * normal);
      vec3 v = normalize(cameraPosition - wp.xyz);
      vFacing = abs(dot(n, v));
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */`
    uniform float time;
    uniform float strength;
    varying vec2 vUv;
    varying float vFacing;
    varying vec3 vWorld;
    ${NOISE}
    void main() {
      float edge = pow(vFacing, 2.0);
      float fall = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y) * 0.6);
      float motes = 0.75 + 0.25 * sh_noise(vec2(vWorld.x * 3.0 + time * 0.2, vWorld.y * 2.0 - time * 0.35));
      float a = edge * fall * motes * strength;
      gl_FragColor = vec4(vec3(1.0, 0.98, 0.92) * a, 1.0);
    }
  `,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
});

// ---------------------------------------------------------------------------
// Вода: тёмная, с текучими бликами и пеной у краёв ряда
// ---------------------------------------------------------------------------
const waterVert = /* glsl */`
  #include <fog_pars_vertex>
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const waterFrag = /* glsl */`
  uniform float time;
  uniform float flow;
  uniform vec3 base;
  uniform vec3 hi;
  varying vec3 vWorld;
  #include <fog_pars_fragment>
  ${NOISE}
  ${SHEEN}
  void main() {
    float x = vWorld.x - time * flow;
    float z = vWorld.z;
    float n = sh_noise(vec2(x * 0.9, z * 7.0)) * 0.65 + sh_noise(vec2(x * 3.1 + time * 0.3, z * 16.0)) * 0.35;
    float streak = smoothstep(0.6, 0.82, n);
    float e = abs(fract(z + 0.5) - 0.5) * 2.0;
    float foam = smoothstep(0.78, 1.0, e) * (0.55 + 0.45 * sh_noise(vec2(x * 4.0, z * 3.0 + time)));
    vec3 c = base + hi * (streak * 0.12 + foam * 0.22);
    c += sheenAt(vWorld, 1.2 + streak * 0.8, time);  // вода отражает источники ярче земли
    gl_FragColor = vec4(c, 1.0);
    #include <fog_fragment>
  }
`;

export function makeWater(flow, zone) {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      flow: { value: flow },
      base: { value: new THREE.Color(zone.pal.water) },
      hi: { value: new THREE.Color(zone.pal.waterHi) },
    }]),
    vertexShader: waterVert,
    fragmentShader: waterFrag,
    fog: true,
  });
  m.uniforms.time = sharedTime;
  m.uniforms.sheenLights = sheenLights;
  m.uniforms.sheenSky = sheenSky;
  return m;
}

// ---------------------------------------------------------------------------
// Тьма за границей поля (как в Don't Starve): клубы с рваной кромкой.
// Рисуется поверх сцены без теста глубины — прячет и деревья за краем.
// ---------------------------------------------------------------------------
export function makeDarkness(edge) {
  return new THREE.ShaderMaterial({
    uniforms: { time: sharedTime, edge: { value: edge } },
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float time;
      uniform float edge;
      varying vec3 vWorld;
      ${NOISE}
      void main() {
        float side = sign(vWorld.x);
        vec2 p = vec2(abs(vWorld.x) * 0.9, vWorld.z * 0.7);
        float n = sh_fbm(p + vec2(time * 0.15, time * 0.25 * side));
        float n2 = sh_fbm(p * 2.3 - vec2(time * 0.3, 0.0));
        float d = abs(vWorld.x) - edge + (n - 0.5) * 0.8 + (n2 - 0.5) * 0.3;
        float a = smoothstep(-0.25, 0.55, d);
        a = max(a, smoothstep(0.72, 0.9, n2) * smoothstep(-0.9, 0.2, d) * 0.6);
        gl_FragColor = vec4(vec3(0.0), a * 0.97);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
}
