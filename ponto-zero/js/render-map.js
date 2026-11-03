// Geometria e texturas procedurais do mapa (nada de arquivos de imagem).
import * as THREE from '../vendor/three.module.min.js';
import { CELL, GW, GH, OX, OZ } from './map.js';

function canvasTex(size, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function speckle(g, size, n, colors, rmax, rand) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(rand() * colors.length) | 0];
    const r = rand() * rmax + 0.5;
    g.globalAlpha = 0.15 + rand() * 0.35;
    g.fillRect(rand() * size, rand() * size, r, r);
  }
  g.globalAlpha = 1;
}

export function makeTextures() {
  const T = {};
  T.plaster = canvasTex(256, (g, s) => {
    const rand = rng(11);
    g.fillStyle = '#e9e1d2';
    g.fillRect(0, 0, s, s);
    speckle(g, s, 5000, ['#d8ccb6', '#f5efe4', '#cbbda4'], 2.5, rand);
    // manchas
    for (let i = 0; i < 14; i++) {
      const x = rand() * s, y = rand() * s, r = 10 + rand() * 40;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(150,120,80,0.12)');
      grd.addColorStop(1, 'rgba(150,120,80,0)');
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // rachaduras
    g.strokeStyle = 'rgba(90,70,50,0.35)';
    g.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      let x = rand() * s, y = rand() * s;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (rand() - 0.5) * 22; y += rand() * 14;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
  T.sand = canvasTex(256, (g, s) => {
    const rand = rng(7);
    g.fillStyle = '#c7a978';
    g.fillRect(0, 0, s, s);
    speckle(g, s, 9000, ['#b8986a', '#d6bd8f', '#a8875a', '#e0c99e'], 2, rand);
    for (let i = 0; i < 120; i++) {
      g.fillStyle = ['#8f7450', '#a48a66', '#7d6648'][(rand() * 3) | 0];
      g.globalAlpha = 0.6;
      g.beginPath();
      g.arc(rand() * s, rand() * s, 0.8 + rand() * 2, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  });
  T.tiles = canvasTex(256, (g, s) => {
    const rand = rng(3);
    g.fillStyle = '#9a8f80';
    g.fillRect(0, 0, s, s);
    const n = 4, ts = s / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = 150 + rand() * 40;
        g.fillStyle = `rgb(${v + 20},${v + 8},${v - 12})`;
        g.fillRect(x * ts + 3, y * ts + 3, ts - 6, ts - 6);
      }
    }
    speckle(g, s, 3000, ['#7f7466', '#c4b8a6'], 2, rand);
  });
  T.concrete = canvasTex(256, (g, s) => {
    const rand = rng(5);
    g.fillStyle = '#a3a29c';
    g.fillRect(0, 0, s, s);
    speckle(g, s, 7000, ['#8e8d87', '#b8b7b0', '#7d7c77'], 2, rand);
    g.strokeStyle = 'rgba(60,60,60,0.35)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, s - 2, s - 2);
  });
  T.dirt = canvasTex(256, (g, s) => {
    const rand = rng(9);
    g.fillStyle = '#a98b62';
    g.fillRect(0, 0, s, s);
    speckle(g, s, 9000, ['#957852', '#b99c72', '#86694a'], 2.2, rand);
  });
  T.crate = canvasTex(256, (g, s) => {
    const rand = rng(21);
    g.fillStyle = '#9b6b3c';
    g.fillRect(0, 0, s, s);
    // tábuas
    const planks = 5;
    for (let i = 0; i < planks; i++) {
      const y = (i * s) / planks;
      const v = rand() * 25;
      g.fillStyle = `rgb(${150 + v},${103 + v * 0.7},${60 + v * 0.4})`;
      g.fillRect(0, y + 2, s, s / planks - 4);
      g.strokeStyle = 'rgba(70,40,15,0.25)';
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        const yy = y + 6 + rand() * (s / planks - 12);
        g.moveTo(0, yy);
        g.bezierCurveTo(s * 0.3, yy + rand() * 4 - 2, s * 0.6, yy + rand() * 4 - 2, s, yy);
        g.stroke();
      }
    }
    // moldura e travessa
    g.fillStyle = '#6e4622';
    const b = 22;
    g.fillRect(0, 0, s, b); g.fillRect(0, s - b, s, b); g.fillRect(0, 0, b, s); g.fillRect(s - b, 0, b, s);
    g.save();
    g.translate(s / 2, s / 2);
    g.rotate(Math.PI / 4);
    g.fillRect(-s * 0.72, -b / 2, s * 1.44, b);
    g.restore();
    g.fillStyle = '#3d2814';
    for (const [x, y] of [[11, 11], [s - 11, 11], [11, s - 11], [s - 11, s - 11]]) {
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
    }
  });
  T.trim = canvasTex(128, (g, s) => {
    const rand = rng(31);
    g.fillStyle = '#6f6458';
    g.fillRect(0, 0, s, s);
    speckle(g, s, 1500, ['#5a5046', '#83776a'], 2, rand);
  });
  return T;
}

// Box com UV em coordenadas de mundo (textura não estica)
function pushBox(arr, b, scale, faces = 'all', uvMode = 'world') {
  const { minx: x0, miny: y0, minz: z0, maxx: x1, maxy: y1, maxz: z1 } = b;
  const quads = [];
  // [normal, 4 cantos (sentido anti-horário visto de fora)]
  quads.push([[1, 0, 0], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], 'z']);
  quads.push([[-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], 'z']);
  quads.push([[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 'x']);
  quads.push([[0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], 'x']);
  if (faces === 'all' || faces === 'bottom') quads.push([[0, 1, 0], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], 'top']);
  if (faces === 'bottom') quads.push([[0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 'top']);
  for (const [n, c, ax] of quads) {
    const uv = c.map(([x, y, z]) => {
      if (uvMode === 'box') {
        // 0..1 por face (caixas), altura em "andares" de 1.1 m
        if (ax === 'top') return [(x - x0) / (x1 - x0), (z - z0) / (z1 - z0)];
        const u = ax === 'x' ? (x - x0) / (x1 - x0) : (z - z0) / (z1 - z0);
        return [n[0] + n[2] > 0 ? u : 1 - u, (y - y0) / 1.1];
      }
      if (ax === 'top') return [x / scale, z / scale];
      if (ax === 'x') return [x / scale, y / scale];
      return [z / scale, y / scale];
    });
    const idx = [0, 1, 2, 0, 2, 3];
    for (const i of idx) {
      arr.pos.push(...c[i]);
      arr.nor.push(...n);
      arr.uv.push(...uv[i]);
    }
  }
}

function geoFrom(arr) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(arr.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(arr.uv, 2));
  g.computeBoundingSphere();
  return g;
}

const WALL_COLORS = [0xe8d4b0, 0xd9935f, 0xf0e8da, 0xa9c4cf, 0xe0a796, 0xd8c27a];

export function buildMapMeshes(map, scene) {
  const T = makeTextures();
  const group = new THREE.Group();
  // ---- paredes: retângulos mesclados por componente ----
  const byColor = new Map();
  const used = [];
  for (let r = 0; r < GH; r++) used.push(new Array(GW).fill(false));
  for (let r = 0; r < GH; r++) {
    for (let c = 0; c < GW; c++) {
      if (map.grid[r][c] !== '#' || used[r][c]) continue;
      const comp = map.wallComp[r][c];
      let w = 1;
      while (c + w < GW && map.grid[r][c + w] === '#' && !used[r][c + w] && map.wallComp[r][c + w] === comp) w++;
      let h = 1;
      outer: while (r + h < GH) {
        for (let k = 0; k < w; k++) {
          if (map.grid[r + h][c + k] !== '#' || used[r + h][c + k] || map.wallComp[r + h][c + k] !== comp) break outer;
        }
        h++;
      }
      for (let rr = r; rr < r + h; rr++) for (let cc = c; cc < c + w; cc++) used[rr][cc] = true;
      const height = map.compHeight[comp];
      const colorIdx = height >= 9 ? 0 : comp % WALL_COLORS.length;
      if (!byColor.has(colorIdx)) byColor.set(colorIdx, { pos: [], nor: [], uv: [], trim: { pos: [], nor: [], uv: [] } });
      const arr = byColor.get(colorIdx);
      const b = { minx: OX + c * CELL, miny: 0, minz: OZ + r * CELL, maxx: OX + (c + w) * CELL, maxy: height, maxz: OZ + (r + h) * CELL };
      pushBox(arr, b, 3);
      // rodapé escuro
      pushBox(arr.trim, { ...b, minx: b.minx - 0.03, minz: b.minz - 0.03, maxx: b.maxx + 0.03, maxz: b.maxz + 0.03, maxy: 0.45 }, 1, 'sides');
      // beiral no topo
      pushBox(arr.trim, { minx: b.minx - 0.12, minz: b.minz - 0.12, maxx: b.maxx + 0.12, maxz: b.maxz + 0.12, miny: height - 0.25, maxy: height }, 1);
    }
  }
  // ---- caixas e concreto ----
  const crate = { pos: [], nor: [], uv: [] };
  const conc = { pos: [], nor: [], uv: [] };
  const roof = { pos: [], nor: [], uv: [] };
  const lamps = [];
  for (let r = 0; r < GH; r++) {
    for (let c = 0; c < GW; c++) {
      for (const b of map.boxes[r][c]) {
        if (b.lintel) {
          // batente com a cor da parede vizinha
          const comp = map.neighborWallComp(c, r);
          const height = map.compHeight[comp];
          const ci = height >= 9 ? 0 : comp % WALL_COLORS.length;
          if (!byColor.has(ci)) byColor.set(ci, { pos: [], nor: [], uv: [], trim: { pos: [], nor: [], uv: [] } });
          const arr = byColor.get(ci);
          pushBox(arr, b, 3, 'bottom');
          pushBox(arr.trim, { ...b, maxy: b.miny + 0.18, minx: b.minx - 0.02, maxx: b.maxx + 0.02, minz: b.minz - 0.02, maxz: b.maxz + 0.02 }, 1, 'bottom');
          continue;
        }
        if (b.roof) {
          pushBox(roof, { ...b, minx: b.minx - 0.05, maxx: b.maxx + 0.05, minz: b.minz - 0.05, maxz: b.maxz + 0.05 }, 2, 'bottom');
          if ((c + r) % 3 === 0) lamps.push([(b.minx + b.maxx) / 2, b.miny - 0.06, (b.minz + b.maxz) / 2]);
          continue;
        }
        if (b.kind === 'wall') continue;
        if (b.kind === 'crate') pushBox(crate, b, 1, 'all', 'box');
        else pushBox(conc, b, 2);
      }
    }
  }
  const trimMat = new THREE.MeshStandardMaterial({ map: T.trim, roughness: 0.95 });
  for (const [ci, arr] of byColor) {
    const mat = new THREE.MeshStandardMaterial({ map: T.plaster, color: WALL_COLORS[ci], roughness: 0.92 });
    const mesh = new THREE.Mesh(geoFrom(arr), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const tm = new THREE.Mesh(geoFrom(arr.trim), trimMat);
    tm.castShadow = true;
    tm.receiveShadow = true;
    group.add(tm);
  }

  if (roof.pos.length) {
    const rm = new THREE.Mesh(geoFrom(roof), new THREE.MeshStandardMaterial({ map: T.concrete, color: 0xc4beb2, emissive: 0x3b352d, roughness: 0.95 }));
    rm.castShadow = rm.receiveShadow = true;
    group.add(rm);
    const lampMat2 = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd27a, emissiveIntensity: 0.9 });
    for (const [x, y, z] of lamps) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.18), lampMat2);
      l.position.set(x, y, z);
      group.add(l);
    }
  }
  const crateMesh = new THREE.Mesh(geoFrom(crate), new THREE.MeshStandardMaterial({ map: T.crate, roughness: 0.85 }));
  crateMesh.castShadow = crateMesh.receiveShadow = true;
  group.add(crateMesh);
  if (conc.pos.length) {
    const cm = new THREE.Mesh(geoFrom(conc), new THREE.MeshStandardMaterial({ map: T.concrete, roughness: 0.95 }));
    cm.castShadow = cm.receiveShadow = true;
    group.add(cm);
  }

  // ---- chão ----
  const floors = { sand: { pos: [], nor: [], uv: [] }, tiles: { pos: [], nor: [], uv: [] }, concrete: { pos: [], nor: [], uv: [] }, dirt: { pos: [], nor: [], uv: [] } };
  for (let r = 0; r < GH; r++) {
    for (let c = 0; c < GW; c++) {
      if (map.grid[r][c] === '#') continue;
      const z = map.zones[r][c];
      const kind = z === 'A' ? 'tiles' : z === 'B' ? 'concrete' : z === 'T' || z === 'D' ? 'dirt' : 'sand';
      const x0 = OX + c * CELL, z0 = OZ + r * CELL;
      const arr = floors[kind];
      const quad = [[x0, 0, z0 + CELL], [x0 + CELL, 0, z0 + CELL], [x0 + CELL, 0, z0], [x0, 0, z0]];
      const sc = kind === 'tiles' ? 4 : kind === 'concrete' ? 4 : 5;
      for (const i of [0, 1, 2, 0, 2, 3]) {
        arr.pos.push(...quad[i]);
        arr.nor.push(0, 1, 0);
        arr.uv.push(quad[i][0] / sc, quad[i][2] / sc);
      }
    }
  }
  for (const [k, arr] of Object.entries(floors)) {
    if (!arr.pos.length) continue;
    const m = new THREE.Mesh(geoFrom(arr), new THREE.MeshStandardMaterial({ map: T[k], roughness: 1 }));
    m.receiveShadow = true;
    group.add(m);
  }

  // ---- letras dos pontos ----
  for (const site of ['A', 'B']) {
    const tex = canvasTex(256, (g, s) => {
      g.clearRect(0, 0, s, s);
      g.strokeStyle = 'rgba(200,40,30,0.85)';
      g.lineWidth = 14;
      g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 12, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(200,40,30,0.85)';
      g.font = 'bold 170px Impact, Arial Black, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(site, s / 2, s / 2 + 8);
    }, false);
    const [cx, cz] = map.siteCenter[site];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 4.5), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(cx, 0.02, cz);
    m.receiveShadow = true;
    group.add(m);
  }

  // ---- placas nas paredes (setas para os pontos) ----
  const signs = [
    { text: '← A', x: OX + 7 * CELL, z: OZ + 11 * CELL, face: '-x' },
    { text: 'B →', x: OX + 7 * CELL, z: OZ + 19 * CELL, face: '-x' },
    { text: 'A →', x: OX + 34 * CELL, z: OZ + 10.6 * CELL, face: '+x' },
    { text: '← B', x: OX + 34 * CELL, z: OZ + 19.4 * CELL, face: '+x' },
    { text: '← A', x: 0, z: OZ + 5 * CELL, face: '-z' },
    { text: 'B →', x: 0, z: OZ + 25 * CELL, face: '+z' },
  ];
  const FACE = { '+x': [Math.PI / 2, 1, 0], '-x': [-Math.PI / 2, -1, 0], '+z': [0, 0, 1], '-z': [Math.PI, 0, -1] };
  for (const s of signs) {
    const tex = canvasTex(256, (g, size) => {
      g.clearRect(0, 0, size, size);
      g.fillStyle = 'rgba(30,30,30,0.78)';
      g.font = 'bold 92px Impact, Arial Black, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(s.text, size / 2, size / 2);
    }, false);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 1 }));
    const [ry, nx, nz] = FACE[s.face];
    m.position.set(s.x + nx * 0.02, 2.4, s.z + nz * 0.02);
    m.rotation.y = ry;
    group.add(m);
  }

  // ---- decoração: postes, varais, toldos ----
  addProps(map, group);

  scene.add(group);
  return group;
}

function addProps(map, group) {
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x5b4a3a, roughness: 0.9 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd27a, emissiveIntensity: 0.6 });
  const awningMats = [0x2f7d6d, 0xb23a3a, 0x3a5fb2, 0xc79a2a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, side: THREE.DoubleSide }));
  // postes encostados nas paredes (escolhidos de forma determinística)
  const poles = [];
  for (let r = 1; r < GH - 1 && poles.length < 12; r++) {
    for (let c = 1; c < GW - 1 && poles.length < 12; c++) {
      if (map.grid[r][c] !== '.' || (c * 7 + r * 13) % 19 !== 0) continue;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (map.grid[r + dr][c + dc] !== '#') continue;
        const x = OX + (c + 0.5) * CELL + dc * (CELL / 2 - 0.12);
        const z = OZ + (r + 0.5) * CELL + dr * (CELL / 2 - 0.12);
        if (poles.some(([px, pz]) => Math.hypot(px - x, pz - z) < 8)) break;
        poles.push([x, z]);
        break;
      }
    }
  }
  for (const [x, z] of poles) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5.2, 8), poleMat);
    p.position.set(x, 2.6, z);
    p.castShadow = true;
    group.add(p);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.3), lampMat);
    l.position.set(x, 5.2, z);
    group.add(l);
  }
  // toldos sobre portas
  const awnings = [
    { x: OX + 22.5 * CELL, z: OZ + 3 * CELL, w: 0.9, d: 4.4, ry: 0 },
    { x: OX + 22.5 * CELL, z: OZ + 27 * CELL, w: 0.9, d: 4.4, ry: 0 },
    { x: OX + 33.5 * CELL, z: OZ + 7.5 * CELL, w: 0.9, d: 6.4, ry: 0 },
    { x: OX + 33.5 * CELL, z: OZ + 22.5 * CELL, w: 0.9, d: 6.4, ry: 0 },
  ];
  awnings.forEach((a, i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(a.w * 2.4, 0.08, a.d), awningMats[i % awningMats.length]);
    m.position.set(a.x, 3.4, a.z);
    m.rotation.z = 0.25;
    m.castShadow = true;
    group.add(m);
  });
  // barris decorativos em cima das paredes baixas (sem colisão)
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x40607a, roughness: 0.6, metalness: 0.3 });
  for (const [c, r] of [[26, 23], [29, 23]]) {
    const x = OX + (c + 0.5) * CELL, z = OZ + (r + 0.5) * CELL;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1, 12), barrelMat);
    b.position.set(x, map.compHeight[map.wallComp[r][c]] + 0.5, z);
    b.castShadow = true;
    group.add(b);
  }
  // fios entre postes
  const wireMat = new THREE.LineBasicMaterial({ color: 0x222222 });
  for (let i = 0; i < poles.length; i++) {
    const [x0, z0] = poles[i];
    let j = -1, bd = 22;
    for (let k = i + 1; k < poles.length; k++) {
      const d = Math.hypot(poles[k][0] - x0, poles[k][1] - z0);
      if (d < bd && d > 6) { bd = d; j = k; }
    }
    if (j < 0) continue;
    const [x1, z1] = poles[j];
    const pts = [];
    for (let k = 0; k <= 16; k++) {
      const t = k / 16;
      pts.push(new THREE.Vector3(x0 + (x1 - x0) * t, 5.1 - Math.sin(t * Math.PI) * 0.9, z0 + (z1 - z0) * t));
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
  }
}

export function buildSky(scene) {
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { sunDir: { value: new THREE.Vector3(0.45, 0.7, 0.3).normalize() } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 sunDir;
      void main(){
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 top = vec3(0.23,0.47,0.82);
        vec3 hor = vec3(0.93,0.84,0.70);
        vec3 col = mix(hor, top, pow(max(h,0.0), 0.55));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        col += vec3(1.0,0.85,0.55) * pow(s, 400.0) * 3.0 + vec3(1.0,0.8,0.5) * pow(s, 8.0) * 0.25;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -1;
  scene.add(sky);
  return sky;
}
