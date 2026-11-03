// Modelos low-poly originais das armas e objetos (feitos com primitivas).
import * as THREE from 'three';

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: opts.r ?? 0.6, metalness: opts.m ?? 0.2, emissive: opts.e ?? 0x000000, emissiveIntensity: opts.ei ?? 1 }));
  }
  return matCache.get(key);
}

const boxCache = new Map();
function boxGeo(w, h, d) {
  const k = `${w},${h},${d}`;
  if (!boxCache.has(k)) boxCache.set(k, new THREE.BoxGeometry(w, h, d));
  return boxCache.get(k);
}

export function part(group, w, h, d, color, x, y, z, opts = {}) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat(color, opts));
  m.position.set(x, y, z);
  if (opts.rx) m.rotation.x = opts.rx;
  if (opts.ry) m.rotation.y = opts.ry;
  if (opts.rz) m.rotation.z = opts.rz;
  m.castShadow = !!opts.shadow;
  group.add(m);
  return m;
}

function cyl(group, r, len, color, x, y, z, opts = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, opts.seg || 10), mat(color, opts));
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  group.add(m);
  return m;
}

const C = {
  steel: 0x2b2e33,
  dark: 0x1c1d20,
  gray: 0x4a4e55,
  silver: 0x9aa0a8,
  wood: 0x7a4a26,
  woodDark: 0x5a361b,
  olive: 0x4d5a36,
  sand: 0xb59a6a,
  green: 0x3b4a32,
};

// Arma longa genérica: receptor, guarda-mão, cano, carregador e coronha. Retorna a posição z da boca.
function longGun(g, o) {
  const body = o.body ?? 0.34, front = o.front ?? 0.2, barrel = o.barrel ?? 0.22;
  const zr = 0.1 - body / 2; // centro do receptor
  part(g, 0.05, o.h ?? 0.07, body, o.c1, 0, 0.04, zr, { m: 0.4 });
  const zf = 0.1 - body - front / 2;
  part(g, 0.054, 0.058, front, o.c2 ?? o.c1, 0, 0.035, zf);
  const zb = 0.1 - body - front - barrel / 2;
  cyl(g, o.br ?? 0.012, barrel, C.dark, 0, 0.045, zb);
  if (o.mag === 'curve') part(g, 0.034, 0.16, 0.06, C.dark, 0, -0.07, -0.12, { rx: 0.35 });
  else if (o.mag === 'box') part(g, 0.08, 0.1, 0.12, C.olive, 0.02, -0.05, -0.1);
  else if (o.mag === 'long') part(g, 0.03, 0.22, 0.045, C.steel, 0, -0.1, -0.12, { rx: 0.1 });
  else if (o.mag !== 'none') part(g, 0.03, 0.13, 0.05, C.dark, 0, -0.06, -0.12, { rx: 0.1 });
  part(g, 0.032, 0.09, 0.045, o.grip ?? C.dark, 0, -0.03, 0.03, { rx: -0.25 });
  if (o.stock) part(g, 0.045, 0.075, o.stock, o.cs ?? o.c1, 0, 0.005, 0.1 + o.stock / 2, { rx: 0.06 });
  if (o.scope) {
    cyl(g, 0.018, 0.22, C.dark, 0, 0.105, -0.06, { m: 0.5 });
    cyl(g, 0.023, 0.035, C.dark, 0, 0.105, -0.18);
    part(g, 0.012, 0.03, 0.03, C.dark, 0, 0.085, -0.03);
  }
  if (o.bipod) {
    part(g, 0.01, 0.12, 0.01, C.dark, 0.03, -0.02, zf - front * 0.3, { rz: 0.3 });
    part(g, 0.01, 0.12, 0.01, C.dark, -0.03, -0.02, zf - front * 0.3, { rz: -0.3 });
  }
  if (o.handle) part(g, 0.02, 0.04, 0.16, C.dark, 0, 0.1, -0.06);
  return 0.1 - body - front - barrel;
}

function pistolShape(g, o) {
  part(g, 0.034, 0.045, o.len, o.c1, 0, 0.055, 0.02 - o.len / 2, { m: 0.6, r: 0.35 });
  part(g, 0.03, 0.105, 0.048, o.grip ?? C.dark, 0, -0.01, 0.0, { rx: -0.27 });
  if (o.mag) part(g, 0.026, 0.07, 0.035, C.steel, 0, -0.09, 0.01, { rx: -0.27 });
  return 0.02 - o.len;
}

// Arma orientada para -Z, origem no punho. Retorna {group, muzzle (Object3D)}
export function buildGun(id) {
  const g = new THREE.Group();
  const muzzle = new THREE.Object3D();
  let mz = -0.3;
  switch (id) {
    case 'knife': {
      part(g, 0.03, 0.035, 0.11, C.dark, 0, 0, 0.02, { r: 0.8 });
      part(g, 0.05, 0.012, 0.015, C.gray, 0, 0, -0.04, { m: 0.6 });
      part(g, 0.008, 0.04, 0.17, C.silver, 0, 0.004, -0.13, { m: 0.9, r: 0.25 });
      mz = -0.22;
      break;
    }
    case 'p9': {
      part(g, 0.032, 0.04, 0.18, C.steel, 0, 0.05, -0.06, { m: 0.5 });
      part(g, 0.028, 0.1, 0.045, C.dark, 0, -0.01, 0.0, { rx: -0.25 });
      part(g, 0.01, 0.025, 0.04, C.dark, 0, 0.012, -0.03);
      mz = -0.16;
      break;
    }
    case 'lince': {
      part(g, 0.04, 0.05, 0.25, C.silver, 0, 0.06, -0.09, { m: 0.8, r: 0.3 });
      part(g, 0.034, 0.11, 0.05, C.woodDark, 0, -0.01, 0.0, { rx: -0.3 });
      part(g, 0.012, 0.012, 0.02, C.dark, 0, 0.09, -0.2);
      mz = -0.23;
      break;
    }
    case 'ferrao': {
      part(g, 0.05, 0.075, 0.3, C.dark, 0, 0.04, -0.1);
      part(g, 0.03, 0.15, 0.04, C.steel, 0, -0.06, -0.12, { rx: 0.15 });
      part(g, 0.03, 0.09, 0.04, C.dark, 0, -0.03, 0.02, { rx: -0.2 });
      cyl(g, 0.012, 0.12, C.steel, 0, 0.05, -0.31);
      part(g, 0.02, 0.02, 0.2, C.gray, 0, 0.04, 0.13);
      part(g, 0.02, 0.07, 0.02, C.gray, 0, 0.01, 0.23);
      mz = -0.37;
      break;
    }
    case 'trovao': {
      cyl(g, 0.018, 0.62, C.steel, 0, 0.05, -0.32, { m: 0.6 });
      cyl(g, 0.016, 0.5, C.dark, 0, 0.018, -0.28);
      part(g, 0.05, 0.05, 0.16, C.wood, 0, 0.022, -0.36);
      part(g, 0.05, 0.07, 0.2, C.dark, 0, 0.04, -0.0);
      part(g, 0.045, 0.09, 0.26, C.wood, 0, 0.0, 0.2, { rx: 0.12 });
      mz = -0.64;
      break;
    }
    case 'k47': {
      part(g, 0.05, 0.065, 0.36, C.steel, 0, 0.04, -0.08, { m: 0.5 });
      part(g, 0.055, 0.06, 0.2, C.wood, 0, 0.03, -0.34);
      cyl(g, 0.012, 0.3, C.dark, 0, 0.055, -0.5);
      part(g, 0.035, 0.16, 0.06, C.dark, 0, -0.07, -0.14, { rx: 0.35 });
      part(g, 0.035, 0.09, 0.045, C.woodDark, 0, -0.03, 0.03, { rx: -0.25 });
      part(g, 0.045, 0.075, 0.28, C.wood, 0, 0.0, 0.22, { rx: 0.08 });
      part(g, 0.008, 0.03, 0.01, C.dark, 0, 0.09, -0.6);
      mz = -0.66;
      break;
    }
    case 't4': {
      part(g, 0.05, 0.07, 0.34, C.dark, 0, 0.04, -0.07);
      part(g, 0.058, 0.058, 0.24, C.gray, 0, 0.035, -0.35);
      cyl(g, 0.011, 0.24, C.dark, 0, 0.04, -0.56);
      cyl(g, 0.016, 0.05, C.steel, 0, 0.04, -0.69);
      part(g, 0.03, 0.14, 0.055, C.dark, 0, -0.06, -0.12, { rx: 0.08 });
      part(g, 0.03, 0.09, 0.045, C.dark, 0, -0.03, 0.03, { rx: -0.25 });
      part(g, 0.02, 0.03, 0.2, C.gray, 0, 0.09, -0.12);
      part(g, 0.04, 0.07, 0.18, C.gray, 0, 0.02, 0.22);
      mz = -0.72;
      break;
    }
    case 'gaviao': {
      part(g, 0.06, 0.08, 0.55, C.green, 0, 0.03, -0.12);
      cyl(g, 0.014, 0.45, C.dark, 0, 0.05, -0.62);
      cyl(g, 0.03, 0.32, C.dark, 0, 0.13, -0.12, { m: 0.5 });
      cyl(g, 0.036, 0.05, C.dark, 0, 0.13, -0.29);
      cyl(g, 0.034, 0.05, C.dark, 0, 0.13, 0.04);
      part(g, 0.035, 0.12, 0.05, C.dark, 0, -0.05, -0.1, { rx: 0.05 });
      part(g, 0.05, 0.11, 0.3, C.green, 0, 0.0, 0.27);
      part(g, 0.01, 0.01, 0.05, C.silver, 0.04, 0.06, 0.02, { m: 0.9 });
      mz = -0.86;
      break;
    }
    case 'coral': mz = pistolShape(g, { len: 0.2, c1: 0x6b5a3e, grip: C.woodDark }); break;
    case 'marimbondo': mz = pistolShape(g, { len: 0.19, c1: C.dark, mag: true }); break;
    case 'siri':
      mz = longGun(g, { body: 0.24, front: 0.08, barrel: 0.1, c1: C.gray, mag: 'long', stock: 0.12 });
      break;
    case 'corisco':
      mz = longGun(g, { body: 0.34, front: 0.12, barrel: 0.1, c1: 0x3c4a3a, mag: 'none', stock: 0.16, h: 0.09 });
      part(g, 0.05, 0.03, 0.3, C.dark, 0, 0.1, -0.08); // carregador em cima
      break;
    case 'bigorna':
      mz = longGun(g, { body: 0.36, front: 0.18, barrel: 0.24, br: 0.018, c1: C.dark, c2: C.gray, mag: 'box', stock: 0.24 });
      break;
    case 'sucuri':
      mz = longGun(g, { body: 0.42, front: 0.22, barrel: 0.3, br: 0.016, c1: C.olive, c2: C.dark, mag: 'box', stock: 0.24, bipod: true, handle: true, h: 0.09 });
      break;
    case 'pardal':
      mz = longGun(g, { body: 0.34, front: 0.18, barrel: 0.22, c1: C.steel, c2: C.sand, mag: 'curve', stock: 0.24, cs: C.sand });
      break;
    case 'sabia':
      mz = longGun(g, { body: 0.4, front: 0.12, barrel: 0.2, c1: C.sand, c2: C.dark, mag: 'normal', stock: 0.08, handle: true });
      break;
    case 'coruja':
      mz = longGun(g, { body: 0.34, front: 0.2, barrel: 0.24, c1: 0x565f6b, c2: C.dark, mag: 'curve', stock: 0.26, scope: true });
      break;
    case 'andorinha':
      mz = longGun(g, { body: 0.4, front: 0.22, barrel: 0.34, c1: 0x2f3a46, mag: 'normal', stock: 0.26, scope: true, h: 0.06 });
      break;
    case 'urubu':
      mz = longGun(g, { body: 0.46, front: 0.24, barrel: 0.34, br: 0.015, c1: C.dark, c2: C.gray, mag: 'normal', stock: 0.28, scope: true, h: 0.08 });
      break;
    case 'molotov': {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.85 }));
      g.add(b);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.06, 8), b.material);
      neck.position.y = 0.09;
      g.add(neck);
      part(g, 0.02, 0.05, 0.02, 0xd8c8a0, 0, 0.14, 0, { r: 1 }); // pano
      mz = 0;
      break;
    }
    case 'he': {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mat(C.olive, { r: 0.7 }));
      g.add(s);
      part(g, 0.02, 0.03, 0.02, C.gray, 0, 0.05, 0);
      part(g, 0.01, 0.06, 0.012, C.silver, 0.02, 0.03, 0, { m: 0.8 });
      mz = 0;
      break;
    }
    case 'flash': {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.11, 10), mat(0x8c939c, { m: 0.5 }));
      g.add(c);
      part(g, 0.02, 0.03, 0.02, C.gray, 0, 0.065, 0);
      mz = 0;
      break;
    }
    case 'smoke': {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.12, 10), mat(0x55606a, { m: 0.3 }));
      g.add(c);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.02, 10), mat(0x6fbf73));
      g.add(band);
      part(g, 0.02, 0.03, 0.02, C.gray, 0, 0.07, 0);
      mz = 0;
      break;
    }
    case 'bomb': {
      part(g, 0.26, 0.1, 0.17, 0x3d3a33, 0, 0, 0);
      part(g, 0.12, 0.012, 0.08, 0x111111, -0.04, 0.056, 0);
      part(g, 0.05, 0.02, 0.05, 0x6b2b2b, 0.08, 0.06, 0);
      for (let i = 0; i < 3; i++) cyl(g, 0.018, 0.17, [0xb03030, 0x3050b0, 0x30a050][i], -0.08 + i * 0.04, -0.03, 0);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
      led.position.set(0.08, 0.075, 0.03);
      led.name = 'led';
      g.add(led);
      mz = 0;
      break;
    }
    default:
      part(g, 0.05, 0.07, 0.4, C.dark, 0, 0.03, -0.1);
  }
  muzzle.position.set(0, id === 'k47' ? 0.055 : 0.045, mz);
  g.add(muzzle);
  return { group: g, muzzle };
}

// Textura de clarão
let flashTex = null;
export function muzzleFlashTexture() {
  if (flashTex) return flashTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,230,1)');
  grd.addColorStop(0.25, 'rgba(255,210,120,0.9)');
  grd.addColorStop(0.6, 'rgba(255,140,40,0.35)');
  grd.addColorStop(1, 'rgba(255,100,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  // raios
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = 'rgba(255,230,160,0.6)';
  g.lineWidth = 6;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    g.beginPath();
    g.moveTo(64, 64);
    g.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60);
    g.stroke();
  }
  flashTex = new THREE.CanvasTexture(c);
  flashTex.colorSpace = THREE.SRGBColorSpace;
  return flashTex;
}

let softTex = null;
export function softTexture() {
  if (softTex) return softTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  softTex = new THREE.CanvasTexture(c);
  return softTex;
}
