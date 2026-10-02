import * as THREE from 'three';
import { TEX } from './materials.js';

// Логотип Rentrobot в мире: текстуры рисуются из SVG прямо в браузере.
//   stamp  — клеймо «RR» светлой трафаретной краской на ящиках, бочках и указателях;
//   poster — облезлый плакат с полным логотипом на стенах руин;
//   sign   — редкая круглая металлическая вывеска «RR» со светящимся кольцом.
// Нашивка на рюкзаке героя — геометрия в models/hero.glb (материал Logo).

async function svgCanvas(url, color, w, h, pad = 0) {
  const text = (await (await fetch(url)).text())
    .replace(/stroke:#000/g, `stroke:${color}`)
    .replace(/stroke="#000"/g, `stroke="${color}"`)
    .replace('<svg ', `<svg fill="${color}" `);
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  await img.decode();
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d').drawImage(img, pad, pad, w - pad * 2, h - pad * 2);
  URL.revokeObjectURL(img.src);
  return c;
}

// Только надпись RENTROBOT: круг с «RR» слева отрезается, края подрезаются по буквам
function textOnly(logo) {
  const x0 = Math.round(logo.width * 455 / 1636);  // буквы начинаются правее круга
  const src = logo.getContext('2d').getImageData(x0, 0, logo.width - x0, logo.height);
  let minX = src.width, maxX = 0, minY = src.height, maxY = 0;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      if (src.data[(y * src.width + x) * 4 + 3] > 8) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
  }
  const pad = 6;
  const c = document.createElement('canvas');
  c.width = maxX - minX + 1 + pad * 2;
  c.height = maxY - minY + 1 + pad * 2;
  c.getContext('2d').drawImage(logo, x0 + minX, minY, maxX - minX + 1, maxY - minY + 1, pad, pad, maxX - minX + 1, maxY - minY + 1);
  return c;
}

// Только буквы «RR» из эмблемы: кольцо стирается, края подрезаются по буквам —
// на маленьких поверхностях буквы выходят крупнее, чем внутри кольца
function lettersOnly(emblem) {
  const s = emblem.width;
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = s;
  const t = tmp.getContext('2d');
  t.drawImage(emblem, 0, 0);
  t.globalCompositeOperation = 'destination-in';
  t.beginPath();
  t.arc(s / 2, s / 2, s * 0.39, 0, Math.PI * 2);  // внутри кольца
  t.fill();
  const img = t.getImageData(0, 0, s, s).data;
  let minX = s, maxX = 0, minY = s, maxY = 0;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      if (img[(y * s + x) * 4 + 3] > 8) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
  }
  const pad = 4;
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const c = document.createElement('canvas');
  c.width = w + pad * 2;
  c.height = h + pad * 2;
  c.getContext('2d').drawImage(tmp, minX, minY, w, h, pad, pad, w, h);
  return c;
}

const toTexture = (canvas) => {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

// Бумага плаката: светлая, с редкими пятнами — фон не должен спорить с логотипом
function paper(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#b9ab8b';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 30; i++) {  // пятна сырости и грязи
    g.fillStyle = `rgba(${70 + Math.random() * 40},${55 + Math.random() * 30},${35 + Math.random() * 20},${Math.random() * 0.1})`;
    g.beginPath();
    g.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 50, 6 + Math.random() * 30, Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }
  return [c, g];
}

// рваные края: зубцы по периметру (тонкие — чтобы не съедать логотип)
function tear(g, w, h) {
  g.globalCompositeOperation = 'destination-out';
  for (let x = 0; x < w; x += 6) {
    g.fillRect(x, 0, 6, Math.random() * 8);
    g.fillRect(x, h - Math.random() * 8, 6, 8);
  }
  for (let y = 0; y < h; y += 6) {
    g.fillRect(0, y, Math.random() * 8, 6);
    g.fillRect(w - Math.random() * 8, y, 8, 6);
  }
  g.globalCompositeOperation = 'source-over';
}

// Широкий плакат: крупное «RR» сверху и надпись RENTROBOT во всю ширину
function posterCanvas(emblem, word) {
  const [c, g] = paper(512, 256);
  g.drawImage(emblem, 256 - 68, 10, 136, 136);
  const ww = 476;
  const wh = ww * word.height / word.width;
  g.drawImage(word, 18, 236 - wh, ww, wh);
  tear(g, 512, 256);
  return c;
}

// Квадратный плакат для узких колонн: одно крупное «RR»
function badgeCanvas(emblem) {
  const [c, g] = paper(256, 256);
  g.drawImage(emblem, 20, 20, 216, 216);
  tear(g, 256, 256);
  return c;
}

export async function loadLogo() {
  const [stampC, logoC, glowC, wordC, inkC] = await Promise.all([
    svgCanvas('assets/emblem.svg', '#efe2c4', 256, 256, 8),
    svgCanvas('assets/logo.svg', '#1a120b', 1636, 370),
    svgCanvas('assets/emblem.svg', '#ffd9a0', 256, 256, 8),
    svgCanvas('assets/logo.svg', '#efe2c4', 1636, 370),
    svgCanvas('assets/emblem.svg', '#1a120b', 256, 256, 8),
  ]);

  const flat = new THREE.PlaneGeometry(1, 1);
  const stampTex = toTexture(stampC);
  // светлая краска с лёгким собственным свечением — читается и в тени
  const stampMat = new THREE.MeshStandardMaterial({
    map: stampTex, emissiveMap: stampTex, emissive: new THREE.Color(0.75, 0.66, 0.5),
    transparent: true, alphaTest: 0.3, roughness: 0.9,
    polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false,
  });
  const bareC = lettersOnly(await svgCanvas('assets/emblem.svg', '#efe2c4', 512, 512, 16));
  const bareTex = toTexture(bareC);
  const bareMat = new THREE.MeshStandardMaterial({
    map: bareTex, emissiveMap: bareTex, emissive: new THREE.Color(0.75, 0.66, 0.5),
    transparent: true, alphaTest: 0.3, roughness: 0.9,
    polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false,
  });
  const wordText = textOnly(wordC);
  const wordTex = toTexture(wordText);
  const wordMat = new THREE.MeshStandardMaterial({
    map: wordTex, emissiveMap: wordTex, emissive: new THREE.Color(0.75, 0.66, 0.5),
    transparent: true, alphaTest: 0.3, roughness: 0.9,
    polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false,
  });
  // плакаты слегка светятся сами — бумага видна и в темноте, чёрная краска контрастна
  const paperMat = (canvas) => {
    const t = toTexture(canvas);
    return new THREE.MeshStandardMaterial({
      map: t, emissiveMap: t, emissive: new THREE.Color(0.16, 0.145, 0.12),
      transparent: true, alphaTest: 0.4, roughness: 0.9,
      polygonOffset: true, polygonOffsetFactor: -2,
    });
  };
  const posterMat = paperMat(posterCanvas(inkC, textOnly(logoC)));
  const badgeMat = paperMat(badgeCanvas(inkC));
  const glowMat = new THREE.MeshBasicMaterial({
    map: toTexture(glowC), transparent: true, color: new THREE.Color(1.6, 1.4, 1.1), depthWrite: false, fog: false,
  });
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.45, metalness: 0.7 });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x3e2a1c, roughness: 0.85 });

  return {
    // клеймо на поверхности: локальная позиция, поворот и размер задаёт вызывающий
    stamp(size = 0.3) {
      const m = new THREE.Mesh(flat, stampMat);
      m.scale.setScalar(size);
      m.renderOrder = 1;
      return m;
    },
    // только буквы «RR» шириной width — для маленьких поверхностей
    letters(width = 0.3) {
      const m = new THREE.Mesh(flat, bareMat);
      m.scale.set(width, width * bareC.height / bareC.width, 1);
      m.renderOrder = 1;
      return m;
    },
    // полный логотип «(RR) RENTROBOT» длиной width — надпись вдоль бревна
    wordmark(width) {
      const m = new THREE.Mesh(flat, wordMat);
      m.scale.set(width, width * wordText.height / wordText.width, 1);
      m.renderOrder = 1;
      return m;
    },
    poster() {
      const m = new THREE.Mesh(flat, posterMat);
      m.scale.set(1.4, 0.7, 1);
      m.receiveShadow = true;
      return m;
    },
    // квадратный плакат с «RR» — для колонн
    badge(size = 0.4) {
      const m = new THREE.Mesh(flat, badgeMat);
      m.scale.set(size, size, 1);
      m.receiveShadow = true;
      return m;
    },
    // вывеска: столб + круглая металлическая табличка, кольцо и буквы светятся
    sign() {
      const g = new THREE.Group();
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 0.1), postMat);
      post.position.y = 0.65;
      post.castShadow = true;
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 32).rotateX(Math.PI / 2), plateMat);
      plate.position.set(0, 1.25, 0.07);
      plate.castShadow = true;
      const face = new THREE.Mesh(flat, glowMat);
      face.scale.setScalar(0.6);
      face.position.set(0, 1.25, 0.1);
      face.renderOrder = 7;  // светится поверх тьмы у края поля
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TEX.glow, color: 0xffcf90, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.35,
      }));
      halo.scale.setScalar(1.3);
      halo.position.set(0, 1.25, 0.12);
      halo.renderOrder = 7;
      g.add(post, plate, face, halo);
      g.userData.glow = new THREE.Vector3(0, 1.25, 0.3);  // сюда ставится источник света
      return g;
    },
  };
}
