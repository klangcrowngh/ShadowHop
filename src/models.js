import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MAT, RIM, surfaceMaterial, isKnownSurface } from './materials.js';

// Модели из Blender лежат в models/<имя>.glb (см. blender/make_models.py).
// Материалы подменяются на игровые PBR-материалы по имени материала из Blender
// (Wood, Stone, Cloak…); "Eye" светится. Материал с текстурой, которого нет
// в списке поверхностей (например, у присланной вручную модели), сохраняется.
// Если файла нет, строится запасная модель-коробка.
// Все модели смотрят в +Z, основание на y = 0.
export const MODEL_NAMES = [
  'hero', 'spider', 'deer',
  'tree', 'tree_tall', 'frame_tree', 'swamp_tree', 'stump', 'bush', 'grass', 'reeds', 'rock', 'mushroom', 'skull', 'signpost',
  'saw', 'thornball', 'gear', 'cart', 'log2', 'log3', 'lily', 'raft2', 'raft3', 'door2', 'door3',
  'plank', 'plank_swamp', 'grate', 'slab', 'post',
  'hunter_forest', 'hunter_swamp', 'hunter_mill', 'hunter_ruins', 'spear', 'dart', 'bolt', 'stone',
  'crate', 'crate_pile', 'plank_pile', 'barrel', 'gearpost', 'pipe', 'chimney', 'scrap',
  'pillar', 'lamppost', 'rubble', 'ruin_wall',
  'press_frame', 'press_head', 'press_wall_a', 'press_wall_b', 'press_wall_c', 'rolllog', 'boar',
  'bush_leafy', 'bush_berry', 'fern', 'fallen_log', 'sapling', 'vent',
  'swamp_bush', 'root_tangle', 'glow_stump', 'cattail', 'mudball',
  'log_stack', 'sawhorse', 'chop_block', 'wheelbarrow', 'sawdust', 'log_crane',
  'column_fallen', 'statue', 'graves', 'ivy_wall', 'arch', 'drum',
  'tombstone', 'celtic_cross', 'iron_fence', 'fresh_grave', 'crypt', 'candles', 'ghost', 'zombie_hand', 'hand_mound', 'boat2', 'boat3',
  'tombstone_b', 'monument', 'wood_cross', 'iron_gate', 'dead_tree', 'dead_tree_b', 'dead_tree_c', 'skull_proj', 'bones', 'flowers', 'hearse', 'gate_leaf', 'gate_post', 'grave_slab', 'leaf_pile', 'small_cross', 'bear_trap',
];

// Всё, что игрок должен замечать (опасности и то, на что можно наступить), —
// с ярким контуром; герой — с умеренным; декор — с лёгким.
const HAZARD = new Set(['spider', 'saw', 'thornball', 'gear', 'cart', 'log2', 'log3', 'lily', 'raft2', 'raft3',
  'door2', 'door3', 'plank', 'plank_swamp', 'grate', 'slab', 'spear', 'dart', 'bolt', 'stone',
  'hunter_forest', 'hunter_swamp', 'hunter_mill', 'hunter_ruins', 'press_head', 'rolllog', 'boar', 'mudball', 'drum', 'ghost', 'zombie_hand', 'boat2', 'boat3', 'skull_proj', 'hearse', 'gate_leaf', 'bear_trap']);
const rimFor = (name) => (name === 'hero' ? RIM.hero : HAZARD.has(name) ? RIM.hazard : RIM.decor);

// Детали, которые не отбрасывают тень (мелочь по земле и плоское на воде)
const NO_SHADOW = new Set(['grass', 'lily', 'fern', 'sawdust', 'ghost', 'hand_mound', 'bones', 'flowers', 'grave_slab', 'leaf_pile']);

// Файлы скачиваются сразу (сеть не занимает поток), а разбираются только после
// ready — чтобы не дёргать анимацию заставки.
export async function loadModels(ready = Promise.resolve()) {
  const loader = new GLTFLoader();
  const protos = {};
  const files = await Promise.all(MODEL_NAMES.map((name) =>
    fetch(`models/${name}.glb`).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)
  ));
  await ready;
  await Promise.all(MODEL_NAMES.map((name, k) =>
    (files[k] ? loader.parseAsync(files[k], 'models/') : Promise.reject())
      .then((gltf) => { protos[name] = gltf.scene; protos[name].userData.anims = gltf.animations; })
      .catch(() => { protos[name] = fallback(); })
      .then(() => paint(protos[name], rimFor(name), !NO_SHADOW.has(name)))
  ));
  return {
    make: (name) => protos[name].clone(),
    // Части модели, сгруппированные по материалу (без светящихся), в координатах модели —
    // для слияния мелочи в несколько draw call'ов с сохранением цветов
    parts(name) {
      const root = protos[name];
      root.updateMatrixWorld(true);
      const out = new Map();
      root.traverse((o) => {
        if (!o.isMesh || o.material === MAT.eye) return;
        // копия: applyMatrix4 меняет атрибуты на месте, а они общие с прототипом
        const g = o.geometry.clone();
        for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
        if (!out.has(o.material)) out.set(o.material, []);
        out.get(o.material).push(g.applyMatrix4(o.matrixWorld).toNonIndexed());
      });
      return out;
    },
  };
}

function paint(root, rim, shadows) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const name = o.material?.name ?? '';
    if (/eye/i.test(name) || /eye/i.test(o.name)) {
      o.material = MAT.eye;
      return;
    }
    if (name === 'Logo') {
      o.material = MAT.logo;
      return;
    }
    if (name === 'GlowCap') {
      o.material = MAT.glowcap;
      return;
    }
    if (name === 'Ghost' || name === 'Flame') {
      o.material = name === 'Flame' ? MAT.flame : o.material.map ? MAT.ghostTex(o.material.map) : MAT.ghost;
      o.castShadow = false;
      return;
    }
    if (isKnownSurface(name) || !o.material?.map) o.material = surfaceMaterial(name, rim);
    o.castShadow = shadows;
    o.receiveShadow = true;
  });
}

function fallback() {
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6));
  b.position.y = 0.3;
  const g = new THREE.Group();
  g.add(b);
  return g;
}
