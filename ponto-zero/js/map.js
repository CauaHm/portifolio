// Mapa "Vila Seca": grade de células de 2 m. Lógica de colisão, raycast e navegação dos bots.
// Legenda: # parede | . chão | c caixa baixa | C caixa alta | s degrau | p plataforma
// Zonas (separadas da grade): A/B pontos de bomba, T base dos atacantes, D base dos defensores.

export const CELL = 2;
export const GW = 40;
export const GH = 30;
export const OX = -(GW * CELL) / 2; // x mínimo do mapa
export const OZ = -(GH * CELL) / 2; // z mínimo do mapa

const SOLID = { '#': true, c: true, C: true, s: true, p: true };
const WALKABLE_NAV = { '.': true };
const INSET = { c: 0.12, C: 0.12 };
const FIXED_H = { c: 1.1, C: 2.2, s: 0.55, p: 1.1 };

function buildLayout() {
  const g = [];
  const z = [];
  for (let r = 0; r < GH; r++) {
    g.push(new Array(GW).fill('#'));
    z.push(new Array(GW).fill(''));
  }
  const fill = (c0, r0, c1, r1, ch) => {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r][c] = ch;
  };
  const zone = (c0, r0, c1, r1, ch) => {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) z[r][c] = ch;
  };
  const put = (c, r, ch) => { g[r][c] = ch; };

  // ---- espaços abertos ----
  fill(1, 1, 5, 28, '.'); // corredor oeste (atacantes)
  fill(1, 1, 21, 4, '.'); // rua norte
  fill(1, 25, 21, 28, '.'); // rua sul
  fill(23, 1, 32, 9, '.'); // ponto A (praça)
  fill(23, 20, 32, 28, '.'); // ponto B (galpão)
  fill(34, 1, 38, 28, '.'); // corredor leste (defensores)
  fill(6, 10, 6, 19, '.'); // base T mais larga
  fill(7, 13, 33, 16, '.'); // meio
  fill(14, 5, 15, 12, '.'); // beco meio -> rua norte
  fill(28, 10, 29, 12, '.'); // atalho meio -> A
  fill(24, 17, 25, 19, '.'); // janela meio -> B
  fill(22, 2, 22, 3, '.'); // portão rua norte -> A
  fill(22, 26, 22, 27, '.'); // portão rua sul -> B
  fill(33, 6, 33, 8, '.'); // passagem A <-> leste
  fill(33, 21, 33, 23, '.'); // passagem B <-> leste

  // ---- zonas ----
  zone(1, 10, 6, 19, 'T');
  zone(34, 10, 38, 19, 'D');
  zone(23, 1, 32, 9, 'A');
  zone(23, 20, 32, 28, 'B');

  // ---- detalhes e coberturas ----
  // rua norte
  fill(9, 1, 10, 2, '#'); // casinha
  put(6, 4, 'c');
  put(13, 1, 'C');
  put(17, 4, 'c');
  put(18, 1, 's');
  put(19, 1, 'p');
  put(20, 1, 'p');
  // corredor oeste
  put(4, 6, 'c');
  put(2, 22, 'C');
  put(3, 22, 'c');
  // base T
  put(2, 11, 'c');
  put(5, 18, 'c');
  // ponto A
  put(27, 3, 'C');
  put(28, 3, 'c');
  put(24, 7, 'c');
  put(30, 6, 'C');
  put(31, 6, 'c');
  put(30, 7, 'c');
  put(25, 1, 'p');
  put(26, 1, 's');
  // meio
  fill(18, 13, 20, 14, '#'); // bloco central
  put(11, 15, 'c');
  put(12, 14, 'C');
  put(24, 16, 'C');
  put(30, 13, 'c');
  put(8, 13, 'c');
  // rua sul
  fill(11, 25, 13, 26, '#'); // casinha
  put(7, 28, 'C');
  put(17, 25, 'c');
  put(18, 25, 'c');
  put(20, 28, 's');
  // ponto B (galpão com pilares)
  put(26, 23, '#');
  put(29, 23, '#');
  put(24, 27, 'C');
  put(25, 27, 'c');
  put(31, 21, 'c');
  put(30, 26, 'C');
  put(28, 20, 'c');
  // corredor leste
  put(36, 4, 'c');
  put(37, 4, 'C');
  put(35, 25, 'c');
  put(37, 12, 'c');
  return { g, z };
}

// Caixa AABB
function box(minx, miny, minz, maxx, maxy, maxz, kind) {
  return { minx, miny, minz, maxx, maxy, maxz, kind };
}

export class GameMap {
  constructor() {
    const { g, z } = buildLayout();
    this.grid = g;
    this.zones = z;
    this.wallComp = [];
    this.compHeight = [];
    this._components();
    this.boxes = []; // por célula
    for (let r = 0; r < GH; r++) {
      const row = [];
      for (let c = 0; c < GW; c++) row.push(this._cellBox(c, r));
      this.boxes.push(row);
    }
    this.nav = [];
    for (let r = 0; r < GH; r++) {
      const row = [];
      for (let c = 0; c < GW; c++) row.push(!!WALKABLE_NAV[g[r][c]]);
      this.nav.push(row);
    }
    this.spawns = { atk: this._spawnPoints('T'), def: this._spawnPoints('D') };
    this.siteCells = { A: this._zoneCells('A', true), B: this._zoneCells('B', true) };
    this.siteCenter = {};
    for (const s of ['A', 'B']) {
      const cells = this.siteCells[s];
      let x = 0, zz = 0;
      for (const [cx, cz] of cells) { x += cx; zz += cz; }
      this.siteCenter[s] = [x / cells.length, zz / cells.length];
    }
    this.walkCells = [];
    for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) if (this.nav[r][c]) this.walkCells.push([c, r]);
  }

  _components() {
    const g = this.grid;
    const comp = [];
    for (let r = 0; r < GH; r++) comp.push(new Array(GW).fill(-1));
    let n = 0;
    for (let r = 0; r < GH; r++) {
      for (let c = 0; c < GW; c++) {
        if (g[r][c] !== '#' || comp[r][c] >= 0) continue;
        const stack = [[c, r]];
        comp[r][c] = n;
        let size = 0;
        let border = false;
        while (stack.length) {
          const [x, y] = stack.pop();
          size++;
          if (x === 0 || y === 0 || x === GW - 1 || y === GH - 1) border = true;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
            if (g[ny][nx] === '#' && comp[ny][nx] < 0) {
              comp[ny][nx] = n;
              stack.push([nx, ny]);
            }
          }
        }
        let h;
        if (border) h = 9;
        else if (size <= 2) h = 4.2;
        else h = [5.5, 6.5, 7.5, 6, 5][n % 5];
        this.compHeight.push(h);
        n++;
      }
    }
    this.wallComp = comp;
  }

  _cellBox(c, r) {
    const ch = this.grid[r][c];
    if (!SOLID[ch]) return null;
    const x0 = OX + c * CELL, z0 = OZ + r * CELL;
    if (ch === '#') {
      const h = this.compHeight[this.wallComp[r][c]];
      return box(x0, 0, z0, x0 + CELL, h, z0 + CELL, 'wall');
    }
    const ins = INSET[ch] || 0;
    const kind = ch === 'c' || ch === 'C' ? 'crate' : 'concrete';
    return box(x0 + ins, 0, z0 + ins, x0 + CELL - ins, FIXED_H[ch], z0 + CELL - ins, kind);
  }

  _spawnPoints(zoneCh) {
    const pts = [];
    for (let r = 0; r < GH; r++) {
      for (let c = 0; c < GW; c++) {
        if (this.zones[r][c] === zoneCh && this.nav[r][c]) pts.push(cellCenter(c, r));
      }
    }
    return pts;
  }

  _zoneCells(zoneCh, walkOnly) {
    const pts = [];
    for (let r = 0; r < GH; r++) {
      for (let c = 0; c < GW; c++) {
        if (this.zones[r][c] === zoneCh && (!walkOnly || this.nav[r][c])) pts.push(cellCenter(c, r));
      }
    }
    return pts;
  }

  zoneAt(x, z) {
    const c = Math.floor((x - OX) / CELL), r = Math.floor((z - OZ) / CELL);
    if (c < 0 || r < 0 || c >= GW || r >= GH) return '';
    return this.zones[r][c];
  }

  cellAt(x, z) {
    return [Math.floor((x - OX) / CELL), Math.floor((z - OZ) / CELL)];
  }

  isNav(c, r) {
    return c >= 0 && r >= 0 && c < GW && r < GH && this.nav[r][c];
  }

  // Retorna true se a caixa AABB colide com algo sólido
  collideAABB(minx, miny, minz, maxx, maxy, maxz) {
    if (miny < 0) return true;
    const c0 = Math.floor((minx - OX) / CELL), c1 = Math.floor((maxx - OX) / CELL);
    const r0 = Math.floor((minz - OZ) / CELL), r1 = Math.floor((maxz - OZ) / CELL);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (c < 0 || r < 0 || c >= GW || r >= GH) return true;
        const b = this.boxes[r][c];
        if (!b) continue;
        if (maxx > b.minx && minx < b.maxx && maxy > b.miny && miny < b.maxy && maxz > b.minz && minz < b.maxz) return true;
      }
    }
    return false;
  }

  // Lista de caixas que colidem com o AABB (para resolução de colisão)
  overlapping(minx, miny, minz, maxx, maxy, maxz, out) {
    out.length = 0;
    const c0 = Math.floor((minx - OX) / CELL), c1 = Math.floor((maxx - OX) / CELL);
    const r0 = Math.floor((minz - OZ) / CELL), r1 = Math.floor((maxz - OZ) / CELL);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (c < 0 || r < 0 || c >= GW || r >= GH) {
          const x0 = OX + c * CELL, z0 = OZ + r * CELL;
          out.push(box(x0, -1, z0, x0 + CELL, 50, z0 + CELL, 'wall'));
          continue;
        }
        const b = this.boxes[r][c];
        if (!b) continue;
        if (maxx > b.minx && minx < b.maxx && maxy > b.miny && miny < b.maxy && maxz > b.minz && minz < b.maxz) out.push(b);
      }
    }
    return out;
  }

  // Raycast contra o mapa (DDA na grade + chão). Retorna {t, nx, ny, nz, kind} ou null.
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let best = maxT;
    let hit = null;
    if (dy < -1e-6) {
      const tf = -oy / dy;
      if (tf >= 0 && tf < best) {
        best = tf;
        hit = { t: tf, nx: 0, ny: 1, nz: 0, kind: 'floor' };
      }
    }
    let c = Math.floor((ox - OX) / CELL), r = Math.floor((oz - OZ) / CELL);
    const stepC = dx > 0 ? 1 : -1, stepR = dz > 0 ? 1 : -1;
    const tDeltaX = Math.abs(dx) > 1e-9 ? CELL / Math.abs(dx) : Infinity;
    const tDeltaZ = Math.abs(dz) > 1e-9 ? CELL / Math.abs(dz) : Infinity;
    const nextX = OX + (c + (dx > 0 ? 1 : 0)) * CELL;
    const nextZ = OZ + (r + (dz > 0 ? 1 : 0)) * CELL;
    let tMaxX = Math.abs(dx) > 1e-9 ? (nextX - ox) / dx : Infinity;
    let tMaxZ = Math.abs(dz) > 1e-9 ? (nextZ - oz) / dz : Infinity;
    let tEnter = 0;
    for (let i = 0; i < 200; i++) {
      if (tEnter > best) break;
      if (c < 0 || r < 0 || c >= GW || r >= GH) break;
      const b = this.boxes[r][c];
      if (b) {
        const res = rayBox(ox, oy, oz, dx, dy, dz, b);
        if (res && res.t < best && res.t >= 0) {
          best = res.t;
          hit = res;
          hit.kind = b.kind;
        }
      }
      if (tMaxX < tMaxZ) {
        tEnter = tMaxX;
        tMaxX += tDeltaX;
        c += stepC;
      } else {
        tEnter = tMaxZ;
        tMaxZ += tDeltaZ;
        r += stepR;
      }
    }
    return hit;
  }

  // Linha de visão livre entre dois pontos
  los(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-4) return true;
    const h = this.raycast(ax, ay, az, dx / d, dy / d, dz / d, d - 0.05);
    return !h;
  }

  // Célula livre para um bot passar (com folga)
  clearAt(x, z) {
    return !this.collideAABB(x - 0.5, 0.05, z - 0.5, x + 0.5, 1.2, z + 0.5);
  }

  straightClear(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / 0.4);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (!this.clearAt(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  nearestNav(x, z) {
    let [c, r] = this.cellAt(x, z);
    if (this.isNav(c, r)) return [c, r];
    let best = null, bd = Infinity;
    for (let dr = -3; dr <= 3; dr++) {
      for (let dc = -3; dc <= 3; dc++) {
        const nc = c + dc, nr = r + dr;
        if (!this.isNav(nc, nr)) continue;
        const [cx, cz] = cellCenter(nc, nr);
        const d = (cx - x) ** 2 + (cz - z) ** 2;
        if (d < bd) { bd = d; best = [nc, nr]; }
      }
    }
    return best;
  }

  // A* na grade. Retorna lista de pontos [x,z] (sem o ponto inicial)
  findPath(sx, sz, tx, tz) {
    const s = this.nearestNav(sx, sz);
    const t = this.nearestNav(tx, tz);
    if (!s || !t) return null;
    const key = (c, r) => r * GW + c;
    const open = new MinHeap();
    const g = new Map();
    const came = new Map();
    const sk = key(s[0], s[1]);
    const tk = key(t[0], t[1]);
    g.set(sk, 0);
    open.push(sk, 0);
    const h = (c, r) => {
      const dx = Math.abs(c - t[0]), dz = Math.abs(r - t[1]);
      return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    let found = false;
    let iter = 0;
    while (open.size && iter++ < 4000) {
      const cur = open.pop();
      if (cur === tk) { found = true; break; }
      const c = cur % GW, r = (cur / GW) | 0;
      const gc = g.get(cur);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nc = c + dc, nr = r + dr;
          if (!this.isNav(nc, nr)) continue;
          if (dr && dc && (!this.isNav(c + dc, r) || !this.isNav(c, r + dr))) continue;
          const nk = key(nc, nr);
          const ng = gc + (dr && dc ? Math.SQRT2 : 1);
          if (ng < (g.has(nk) ? g.get(nk) : Infinity)) {
            g.set(nk, ng);
            came.set(nk, cur);
            open.push(nk, ng + h(nc, nr));
          }
        }
      }
    }
    if (!found) return null;
    const cells = [];
    let k = tk;
    while (k !== sk) {
      cells.push(k);
      k = came.get(k);
      if (k === undefined) break;
    }
    cells.reverse();
    const pts = cells.map((kk) => cellCenter(kk % GW, (kk / GW) | 0));
    if (pts.length) pts[pts.length - 1] = [tx, tz];
    // suaviza: pula pontos com linha reta livre
    const out = [];
    let ax = sx, az = sz;
    let i = 0;
    while (i < pts.length) {
      let j = Math.min(pts.length - 1, i + 6);
      while (j > i && !this.straightClear(ax, az, pts[j][0], pts[j][1])) j--;
      out.push(pts[j]);
      ax = pts[j][0];
      az = pts[j][1];
      i = j + 1;
    }
    return out;
  }

  randomNavPoint(rand = Math.random) {
    const [c, r] = this.walkCells[(rand() * this.walkCells.length) | 0];
    const [x, z] = cellCenter(c, r);
    return [x + (rand() - 0.5) * 0.8, z + (rand() - 0.5) * 0.8];
  }
}

export function cellCenter(c, r) {
  return [OX + (c + 0.5) * CELL, OZ + (r + 0.5) * CELL];
}

// Interseção raio x AABB (slab). Retorna {t, nx, ny, nz} ou null
export function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = -Infinity, tmax = Infinity;
  let nx = 0, ny = 0, nz = 0;
  // x
  if (Math.abs(dx) < 1e-9) {
    if (ox < b.minx || ox > b.maxx) return null;
  } else {
    let t1 = (b.minx - ox) / dx, t2 = (b.maxx - ox) / dx;
    let n = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; n = 1; }
    if (t1 > tmin) { tmin = t1; nx = n; ny = 0; nz = 0; }
    if (t2 < tmax) tmax = t2;
  }
  // y
  if (Math.abs(dy) < 1e-9) {
    if (oy < b.miny || oy > b.maxy) return null;
  } else {
    let t1 = (b.miny - oy) / dy, t2 = (b.maxy - oy) / dy;
    let n = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; n = 1; }
    if (t1 > tmin) { tmin = t1; nx = 0; ny = n; nz = 0; }
    if (t2 < tmax) tmax = t2;
  }
  // z
  if (Math.abs(dz) < 1e-9) {
    if (oz < b.minz || oz > b.maxz) return null;
  } else {
    let t1 = (b.minz - oz) / dz, t2 = (b.maxz - oz) / dz;
    let n = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; n = 1; }
    if (t1 > tmin) { tmin = t1; nx = 0; ny = 0; nz = n; }
    if (t2 < tmax) tmax = t2;
  }
  if (tmax < 0 || tmin > tmax) return null;
  if (tmin < 0) return null; // origem dentro da caixa
  return { t: tmin, nx, ny, nz };
}

class MinHeap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(key, pri) {
    const k = this.k, p = this.p;
    k.push(key); p.push(pri);
    let i = k.length - 1;
    while (i > 0) {
      const pa = (i - 1) >> 1;
      if (p[pa] <= p[i]) break;
      [k[pa], k[i]] = [k[i], k[pa]];
      [p[pa], p[i]] = [p[i], p[pa]];
      i = pa;
    }
  }
  pop() {
    const k = this.k, p = this.p;
    const top = k[0];
    const lk = k.pop(), lp = p.pop();
    if (k.length) {
      k[0] = lk; p[0] = lp;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && p[l] < p[m]) m = l;
        if (r < k.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [p[m], p[i]] = [p[i], p[m]];
        i = m;
      }
    }
    return top;
  }
}
