// Зоны сменяют друг друга каждые ZONE_LEN рядов по кругу. Зона задаёт всё,
// что игрок видит и слышит: палитру, туман и оттенок, препятствия и декор,
// облик ловушек (что катится по дороге, по чему переходить реку, настил
// моста, охотника и его снаряд), частицы в воздухе, звук и тексты смерти.
export const ZONE_LEN = 100;

export const ZONES = [
  {
    id: 'forest',
    name: 'Лес',
    pal: {
      fog: '#2d2f2c', grassA: '#33322e', grassB: '#302f2b', detail: '#26261f', path: '#3f3a33',
      road: '#1d1d1b', roadEdge: '#34322e', rail: '#8f8d86', sleeper: '#1c1814',
      water: '#15191b', waterHi: '#7f8a8e', pit: '#050505',
    },
    tint: [1.0, 0.98, 0.93],
    fog: [14, 34],
    obstacles: [['tree', 0.24], ['bush_leafy', 0.17], ['bush_berry', 0.08], ['sapling', 0.1], ['fallen_log', 0.1], ['sapling', 0.03],
      ['rock', 0.12], ['stump', 0.1], ['crate_pile', 0.03], ['signpost', 0.03]],
    moreObstacles: 1,   // лес гуще: в ряду травы на одно препятствие больше
    decorDensity: 1.3,  // и гуще подлесок за краем поля
    decorNear: ['tree', 'bush_leafy', 'bush_berry', 'fern', 'fern', 'sapling', 'bush', 'stump', 'rock', 'fallen_log', 'skull', 'grass'],
    decorFar: ['frame_tree', 'tree_tall', 'tree_tall', 'tree', 'sapling', 'bush_leafy', 'deer'],
    riverDecor: ['reeds', 'reeds', 'rock'],
    // голый кустик — проходимая мелочь на земле, не препятствие (выглядел слишком безобидно)
    detail: [['grass', 24, 0.6, 1.2], ['fern', 3, 0.45, 0.75], ['rock', 3, 0.15, 0.25], ['bush', 1, 0.45, 0.6]],
    // по лесной тропе катятся брёвна и проносятся кабаны
    roads: [
      { model: 'rolllog', track: 'trail', y: 0.3, roll: 0.3, hit: 0.5, bounce: 0.05, dust: true, sound: 'log' },
      { model: 'boar', track: 'trail', y: 0, hit: 0.55, run: true, dust: true, sound: 'boar' },
    ],
    float: { models: [['log2', 2], ['log3', 3]], count: [3, 4], y: -0.16, top: 0.1 },
    plank: 'plank',
    hunter: 'hunter_forest',
    projectile: { model: 'spear', spin: 0 },
    hazards: { road: 0.42, river: 0.33, bridge: 0.12, hunt: 0.13 },  // + капканы в рядах травы
    particles: 'rain',
    puddles: true,  // после дождя на земле лужи
    traps: true,    // в траве попадаются капканы: наступил — застрял на ~1,2 с
    sound: { drone: 55, wind: 600, hazard: 'saw', extra: 'rain' },
    death: { road: { rolllog: 'бревно не свернёт', boar: 'кабан не заметил' }, hunt: 'копьё нашло цель' },
  },
  {
    id: 'swamp',
    name: 'Болото',
    pal: {
      fog: '#2a322b', grassA: '#2e322b', grassB: '#2a2f27', detail: '#232a20', path: '#36362b',
      road: '#1d1f1a', roadEdge: '#303329', rail: '#5f6353', sleeper: '#1b1d16',
      water: '#131b16', waterHi: '#6f8a75', pit: '#040604',
    },
    tint: [0.94, 1.02, 0.93],
    fog: [10, 28],
    obstacles: [['swamp_bush', 0.17], ['cattail', 0.15], ['root_tangle', 0.12], ['glow_stump', 0.08], ['mushroom', 0.2],
      ['stump', 0.12], ['rock', 0.12], ['signpost', 0.04]],
    moreObstacles: 1,   // болото гуще: в ряду травы на одно препятствие больше
    decorDensity: 1.3,
    decorNear: ['cattail', 'cattail', 'swamp_bush', 'glow_stump', 'root_tangle', 'fern', 'mushroom', 'reeds', 'swamp_tree', 'skull'],
    decorFar: ['swamp_tree', 'swamp_bush', 'cattail', 'frame_tree', 'tree_tall'],
    riverDecor: ['reeds', 'reeds', 'cattail', 'mushroom'],
    detail: [['mushroom', 4, 0.25, 0.4], ['grass', 16, 0.6, 1.0], ['reeds', 2, 0.35, 0.5], ['fern', 2, 0.4, 0.65]],
    // шипастые шары и болотные комья ила
    roads: [
      { model: 'thornball', track: 'bog', y: 0.4, roll: 0.45, hit: 0.5, sparks: false, sound: 'thorn' },
      { model: 'mudball', track: 'bog', y: 0.38, roll: 0.4, hit: 0.5, bounce: 0.07, bump: 'mudBump', sound: 'mud' },
    ],
    float: { models: [['lily', 1]], count: [6, 8], y: -0.22, top: -0.2 },
    tentacle: true,  // изредка щупальце утаскивает кувшинку под воду (src/tentacle.js)
    plank: 'plank_swamp',
    hunter: 'hunter_swamp',
    projectile: { model: 'dart', spin: 0 },
    hazards: { road: 0.3, river: 0.38, bridge: 0.18, hunt: 0.14 },  // + щупальце в реках
    particles: 'spores',
    sound: { drone: 49, wind: 350, hazard: 'thorn', extra: 'frogs' },
    death: { road: { thornball: 'шипы не прощают', mudball: 'трясина раздавила' }, hunt: 'отравленный дротик' },
  },
  {
    id: 'mill',
    name: 'Лесопилка',
    pal: {
      fog: '#332f29', grassA: '#32302c', grassB: '#2f2c28', detail: '#24211c', path: '#3d372f',
      road: '#181616', roadEdge: '#3d3a34', rail: '#9b968a', sleeper: '#141210',
      water: '#171614', waterHi: '#8c8474', pit: '#060504',
    },
    tint: [1.05, 0.98, 0.88],
    fog: [13, 32],
    obstacles: [['crate', 0.14], ['barrel', 0.13], ['log_stack', 0.15], ['sawhorse', 0.12], ['chop_block', 0.12], ['wheelbarrow', 0.08],
      ['gearpost', 0.1], ['crate_pile', 0.08], ['plank_pile', 0.04], ['pipe', 0.04]],
    moreObstacles: 1,   // двор лесопилки завален: в ряду на одно препятствие больше
    decorDensity: 1.25,
    decorNear: ['crate', 'barrel', 'scrap', 'plank_pile', 'crate_pile', 'gearpost', 'log_stack', 'sawhorse', 'chop_block',
      'wheelbarrow', 'sawdust', 'sawdust', 'stump'],
    decorFar: ['chimney', 'log_crane', 'log_crane', 'crate_pile', 'chimney', 'log_stack', 'barrel', 'tree_tall'],
    riverDecor: ['barrel', 'crate', 'plank_pile', 'log_stack'],
    detail: [['scrap', 3, 0.5, 0.9], ['sawdust', 2, 0.3, 0.45], ['grass', 8, 0.5, 0.8]],
    // пилы по направляющим и шестерни на конвейере
    roads: [
      { model: 'saw', track: 'guide', y: 0.3, spin: 16, hit: 0.55, sparks: true, sound: 'saw' },
      { model: 'gear', track: 'conveyor', y: 0.53, roll: 0.52, hit: 0.6, sparks: true, sound: 'gear' },
    ],
    float: { models: [['raft2', 2], ['raft3', 3]], count: [3, 4], y: 0.06, top: 0.08 },
    plank: 'grate',
    hunter: 'hunter_mill',
    projectile: { model: 'bolt', spin: 0 },
    hazards: { road: 0.34, river: 0.2, bridge: 0.11, hunt: 0.11, press: 0.12, steam: 0.12 },
    particles: 'embers',
    sound: { drone: 41, wind: 250, hazard: 'gear', extra: 'clank' },
    death: { road: { saw: 'пила не прощает', gear: 'шестерни перемололи' }, hunt: 'болт арбалета' },
  },
  {
    id: 'ruins',
    name: 'Руины',
    pal: {
      fog: '#2b3034', grassA: '#303234', grassB: '#2c2f31', detail: '#222528', path: '#3d3f41',
      road: '#1d1f21', roadEdge: '#34383a', rail: '#98a0a7', sleeper: '#16171a',
      water: '#13181b', waterHi: '#7e8e98', pit: '#040506',
    },
    tint: [0.93, 0.97, 1.05],
    fog: [12, 31],
    obstacles: [['pillar', 0.18], ['rubble', 0.16], ['lamppost', 0.1], ['column_fallen', 0.14], ['statue', 0.12], ['graves', 0.12],
      ['ivy_wall', 0.12], ['bush_leafy', 0.06]],
    moreObstacles: 1,   // руины загромождены: в ряду на одно препятствие больше
    decorDensity: 1.25,
    decorNear: ['rubble', 'pillar', 'lamppost', 'rubble', 'skull', 'column_fallen', 'statue', 'graves', 'ivy_wall', 'bush_leafy', 'fern', 'fern'],
    decorFar: ['ruin_wall', 'ruin_wall', 'arch', 'arch', 'pillar', 'statue', 'frame_tree', 'tree_tall'],
    riverDecor: ['rubble', 'reeds', 'column_fallen'],
    detail: [['rubble', 3, 0.25, 0.4], ['grass', 12, 0.5, 0.9], ['fern', 2, 0.35, 0.6]],
    // вагонетки по рельсам и катящиеся барабаны обрушенных колонн по старой мостовой
    roads: [
      { model: 'cart', track: 'rails', y: 0, spin: 0, hit: 0.72, sparks: true, sound: 'cart' },
      { model: 'drum', track: 'cobble', y: 0.32, roll: 0.32, hit: 0.5, bounce: 0.03, bump: 'stoneBump', sound: 'drum' },
    ],
    float: { models: [['door2', 2], ['door3', 3]], count: [3, 4], y: -0.23, top: -0.18 },
    plank: 'slab',
    hunter: 'hunter_ruins',
    projectile: { model: 'stone', spin: 14 },
    hazards: { road: 0.38, river: 0.25, bridge: 0.17, hunt: 0.2 },
    particles: 'dust',
    sound: { drone: 46, wind: 1200, hazard: 'cart', extra: 'ruins' },
    death: { road: { cart: 'вагонетка не остановилась', drum: 'колонна докатилась' }, hunt: 'камень из пращи' },
  },
  {
    id: 'cemetery',
    name: 'Кладбище',
    pal: {
      fog: '#19212a', grassA: '#242a2a', grassB: '#212727', detail: '#1a1f1f', path: '#4c5558',
      road: '#19191a', roadEdge: '#3a3b3b', rail: '#8d949a', sleeper: '#151618',
      water: '#0e1214', waterHi: '#6f7d86', pit: '#030405',
    },
    tint: [0.84, 0.97, 1.16],  // холодный лунный свет
    fog: [8, 24],
    light: 0.45,  // заметно темнее остальных зон — светят свечи
    mist: true,   // низкий туман над землёй (src/mist.js)
    hands: true,  // в рядах травы из-под земли иногда лезут руки мертвецов
    obstacles: [['tombstone', 0.18], ['tombstone_b', 0.12], ['monument', 0.08], ['celtic_cross', 0.1], ['wood_cross', 0.08],
      ['iron_fence', 0.14], ['fresh_grave', 0.09], ['candles', 0.12], ['dead_tree', 0.02], ['dead_tree_c', 0.03], ['graves', 0.04]],
    moreObstacles: 1,
    minObstacles: 1,    // пустых рядов травы не бывает — всегда хоть одна могила
    decorDensity: 1.6,  // за краем поля — плотные ряды могил, крестов и оград
    decorNear: ['tombstone', 'tombstone', 'tombstone_b', 'tombstone_b', 'monument', 'celtic_cross', 'wood_cross', 'wood_cross',
      'iron_fence', 'iron_fence', 'candles', 'candles', 'fresh_grave', 'graves', 'dead_tree', 'dead_tree_c', 'bones', 'flowers', 'statue'],
    decorFar: ['crypt', 'crypt', 'iron_gate', 'dead_tree', 'dead_tree_b', 'dead_tree_c', 'dead_tree_b', 'frame_tree', 'monument',
      'celtic_cross', 'iron_fence', 'tombstone', 'statue'],
    riverDecor: ['reeds', 'reeds', 'rock', 'skull', 'wood_cross', 'dead_tree_c'],
    // земля густо усыпана мелочью: плоские могильные плиты (по ним ходят), кучки листьев,
    // трава, камешки, кости, увядшие букеты, грибы, черепа
    detail: [['grave_slab', 2, 0.9, 1.1], ['leaf_pile', 4, 0.8, 1.2],
      ['grass', 22, 0.5, 0.9], ['rock', 4, 0.15, 0.25], ['bones', 2, 0.6, 0.9], ['flowers', 2, 0.7, 1.0],
      ['mushroom', 2, 0.25, 0.35], ['skull', 1, 0.5, 0.7], ['fern', 2, 0.3, 0.45]],
    // по дорожке из старых плит плывут призраки и катится катафалк без лошадей
    roads: [
      { model: 'ghost', track: 'flags', y: 0.12, hover: true, hit: 0.5, sound: 'ghost' },
      { model: 'hearse', track: 'flags', y: 0, face: true, wheels: true, speed: 0.75, hit: 0.78, sound: 'hearse' },  // без гула — стук колёс и скрип
    ],
    float: { models: [['boat2', 2], ['boat3', 3]], count: [3, 4], y: -0.24, top: -0.22 },
    plank: 'plank',
    hunter: 'hunter_ruins',
    projectile: { model: 'skull_proj', spin: 12 },
    hazards: { road: 0.32, river: 0.26, bridge: 0.11, hunt: 0.15, gates: 0.08 },  // + руки мертвецов в рядах травы
    particles: 'wisps',
    sound: { drone: 43, wind: 450, hazard: 'ghost', extra: 'graveyard' },
    death: { road: { ghost: 'призрак прошёл сквозь тебя', hearse: 'катафалк забрал своё' }, hunt: 'череп из пращи', hand: 'мертвец утащил под землю' },
  },
];

// ?zone=N в адресе — начать с N-й зоны (для проверки)
const START = Number(new URLSearchParams(location.search).get('zone')) || 0;
export const zoneIndex = (row) => (Math.floor(Math.max(0, row) / ZONE_LEN) + START) % ZONES.length;
export const zoneAt = (row) => ZONES[zoneIndex(row)];
