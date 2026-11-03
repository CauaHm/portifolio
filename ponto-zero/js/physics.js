// Física compartilhada entre cliente e servidor: movimento estilo FPS tático, hitboxes, granadas.
import { PLAYER } from './config.js';

const tmpBoxes = [];

export class MoveBody {
  constructor() {
    this.x = 0; this.y = 0; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.onGround = true;
    this.h = PLAYER.height;
    this.r = PLAYER.radius;
    this.crouch = 0; // 0..1 (animação)
    this.crouching = false;
  }

  setPos(x, y, z) {
    this.x = x; this.y = y; this.z = z;
    this.vx = this.vy = this.vz = 0;
  }

  collides(map, x, y, z, h = this.h) {
    const r = this.r;
    return map.collideAABB(x - r, y, z - r, x + r, y + h, z + r);
  }

  // input: {wx, wz} direção desejada (normalizada ou 0), speed (velocidade máxima), jump, crouch
  update(map, dt, input) {
    // agachar
    const wantCrouch = !!input.crouch;
    if (wantCrouch) this.crouching = true;
    else if (this.crouching) {
      if (!this.collides(map, this.x, this.y, this.z, PLAYER.height)) this.crouching = false;
    }
    const target = this.crouching ? 1 : 0;
    this.crouch += Math.sign(target - this.crouch) * Math.min(Math.abs(target - this.crouch), dt * 7);
    this.h = PLAYER.height + (PLAYER.crouchHeight - PLAYER.height) * this.crouch;

    let wishSpeed = input.speed;
    const wx = input.wx || 0, wz = input.wz || 0;
    const wl = Math.hypot(wx, wz);
    let dx = 0, dz = 0;
    if (wl > 1e-4) { dx = wx / wl; dz = wz / wl; } else wishSpeed = 0;

    if (this.onGround) {
      // atrito
      const sp = Math.hypot(this.vx, this.vz);
      if (sp > 1e-4) {
        const control = Math.max(sp, PLAYER.stopSpeed);
        const drop = control * PLAYER.friction * dt;
        const ns = Math.max(sp - drop, 0) / sp;
        this.vx *= ns; this.vz *= ns;
      }
      accelerate(this, dx, dz, wishSpeed, PLAYER.accel, dt);
      if (input.jump) {
        this.vy = PLAYER.jump;
        this.onGround = false;
      }
    } else {
      accelerate(this, dx, dz, Math.min(wishSpeed, 0.9), PLAYER.airAccel * 10, dt);
    }
    this.vy -= PLAYER.gravity * dt;

    // movimento com substeps
    const maxStep = 0.2;
    const travel = Math.max(Math.abs(this.vx), Math.abs(this.vy), Math.abs(this.vz)) * dt;
    const n = Math.max(1, Math.ceil(travel / maxStep));
    const sdt = dt / n;
    let grounded = false;
    for (let i = 0; i < n; i++) {
      this._moveHoriz(map, this.vx * sdt, this.vz * sdt);
      const g = this._moveY(map, this.vy * sdt);
      if (g) grounded = true;
    }
    // checa chão logo abaixo (para não "flutuar" ao descer degraus)
    if (!grounded && this.vy <= 0 && this.onGround) {
      const drop = 0.25;
      if (this.collides(map, this.x, this.y - drop, this.z) || this.y - drop < 0) {
        // encosta no chão
        for (let k = 0; k < 6; k++) {
          const ny = this.y - drop / 6;
          if (ny < 0 || this.collides(map, this.x, ny, this.z)) break;
          this.y = ny;
        }
        grounded = true;
      }
    }
    if (grounded && this.vy < 0) this.vy = 0;
    this.onGround = grounded;
  }

  _moveY(map, dy) {
    const ny = this.y + dy;
    if (ny <= 0) {
      this.y = 0;
      return dy <= 0;
    }
    if (!this.collides(map, this.x, ny, this.z)) {
      this.y = ny;
      return false;
    }
    const r = this.r;
    const boxes = map.overlapping(this.x - r, ny, this.z - r, this.x + r, ny + this.h, this.z + r, tmpBoxes);
    if (dy < 0) {
      let top = -Infinity;
      for (const b of boxes) top = Math.max(top, b.maxy);
      const y = top + 1e-4;
      if (y <= this.y + 1e-3 && !this.collides(map, this.x, y, this.z)) this.y = y;
      return true;
    }
    let bottom = Infinity;
    for (const b of boxes) bottom = Math.min(bottom, b.miny);
    const y = bottom - this.h - 1e-4;
    if (y >= this.y - 1e-3 && y >= 0 && !this.collides(map, this.x, y, this.z)) this.y = y;
    this.vy = Math.min(this.vy, 0);
    return false;
  }

  _moveHoriz(map, dx, dz) {
    if (!dx && !dz) return;
    const ok = this._tryAxis(map, 'x', dx) & this._tryAxis(map, 'z', dz);
    return ok;
  }

  _tryAxis(map, axis, d) {
    if (!d) return 1;
    const nx = axis === 'x' ? this.x + d : this.x;
    const nz = axis === 'z' ? this.z + d : this.z;
    if (!this.collides(map, nx, this.y, nz)) {
      this.x = nx; this.z = nz;
      return 1;
    }
    // tenta subir degrau
    if (this.onGround || this.vy <= 0.5) {
      const up = PLAYER.step;
      if (!this.collides(map, this.x, this.y + up, this.z) && !this.collides(map, nx, this.y + up, nz)) {
        // desce até encostar
        let y = this.y + up;
        for (let k = 0; k < 12; k++) {
          const ty = y - up / 12;
          if (ty < this.y - 1e-3 || this.collides(map, nx, ty, nz)) break;
          y = ty;
        }
        this.x = nx; this.z = nz; this.y = y;
        return 1;
      }
    }
    // encosta na parede
    const r = this.r;
    const boxes = map.overlapping(nx - r, this.y, nz - r, nx + r, this.y + this.h, nz + r, tmpBoxes);
    if (axis === 'x') {
      let lim = nx;
      for (const b of boxes) {
        if (d > 0) lim = Math.min(lim, b.minx - r - 1e-4);
        else lim = Math.max(lim, b.maxx + r + 1e-4);
      }
      if (!this.collides(map, lim, this.y, this.z)) this.x = lim;
      this.vx = 0;
    } else {
      let lim = nz;
      for (const b of boxes) {
        if (d > 0) lim = Math.min(lim, b.minz - r - 1e-4);
        else lim = Math.max(lim, b.maxz + r + 1e-4);
      }
      if (!this.collides(map, this.x, this.y, lim)) this.z = lim;
      this.vz = 0;
    }
    return 0;
  }
}

function accelerate(b, dx, dz, wishSpeed, accel, dt) {
  const cur = b.vx * dx + b.vz * dz;
  const add = wishSpeed - cur;
  if (add <= 0) return;
  const acc = Math.min(accel * dt * Math.max(wishSpeed, 1), add);
  b.vx += acc * dx;
  b.vz += acc * dz;
}

// ---------------- hitboxes ----------------
// ent: {x, y, z, crouch (0..1)}
export function hitboxes(ent) {
  const k = 1 - 0.34 * (ent.crouch || 0);
  const x = ent.x, y = ent.y, z = ent.z;
  return {
    head: { cx: x, cy: y + 1.6 * k, cz: z, r: 0.17 },
    body: { minx: x - 0.27, miny: y + 0.9 * k, minz: z - 0.27, maxx: x + 0.27, maxy: y + 1.46 * k, maxz: z + 0.27 },
    legs: { minx: x - 0.22, miny: y, minz: z - 0.22, maxx: x + 0.22, maxy: y + 0.9 * k, maxz: z + 0.22 },
  };
}

export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = ox - cx, ly = oy - cy, lz = oz - cz;
  const b = lx * dx + ly * dy + lz * dz;
  const c = lx * lx + ly * ly + lz * lz - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : -1;
}

function rayAABB(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  const mn = [b.minx, b.miny, b.minz], mx = [b.maxx, b.maxy, b.maxz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return -1;
    } else {
      let t1 = (mn[i] - o[i]) / d[i], t2 = (mx[i] - o[i]) / d[i];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}

// Retorna {t, zone} do acerto mais próximo no personagem ou null
export function rayEntity(ox, oy, oz, dx, dy, dz, ent, maxT) {
  // descarte rápido por esfera envolvente
  const k = 1 - 0.34 * (ent.crouch || 0);
  const cy = ent.y + 0.9 * k;
  const lx = ox - ent.x, ly = oy - cy, lz = oz - ent.z;
  const b = lx * dx + ly * dy + lz * dz;
  const c = lx * lx + ly * ly + lz * lz - 1.1 * 1.1;
  if (b * b - c < 0) return null;
  const hb = hitboxes(ent);
  let best = maxT, zone = null;
  const th = raySphere(ox, oy, oz, dx, dy, dz, hb.head.cx, hb.head.cy, hb.head.cz, hb.head.r);
  if (th >= 0 && th < best) { best = th; zone = 'head'; }
  const tb = rayAABB(ox, oy, oz, dx, dy, dz, hb.body);
  if (tb >= 0 && tb < best) { best = tb; zone = 'body'; }
  const tl = rayAABB(ox, oy, oz, dx, dy, dz, hb.legs);
  if (tl >= 0 && tl < best) { best = tl; zone = 'legs'; }
  return zone ? { t: best, zone } : null;
}

// ---------------- dano ----------------
export function computeDamage(w, zone, dist, victim) {
  let dmg = w.dmg * Math.pow(w.rangeMod ?? 1, dist / 10);
  if (zone === 'head') dmg *= 4;
  else if (zone === 'legs') dmg *= 0.75;
  let armorLoss = 0;
  const armored = victim.armor > 0 && (zone === 'body' || (zone === 'head' && victim.helmet));
  if (armored && w.kind !== 'knife') {
    const pen = w.armorPen ?? 1;
    let hp = dmg * pen;
    armorLoss = (dmg - hp) * 0.5;
    if (armorLoss > victim.armor) {
      hp += (armorLoss - victim.armor) * 2;
      armorLoss = victim.armor;
    }
    dmg = hp;
  }
  return { hp: Math.max(1, Math.round(dmg)), armor: Math.round(armorLoss) };
}

// ---------------- granadas (simulação determinística) ----------------
export const NADE_DT = 1 / 120;
const NADE_R = 0.08;

export function nadeStep(map, n) {
  const dt = NADE_DT;
  n.vy -= 14 * dt;
  let bounced = false;
  // eixo x
  let nx = n.x + n.vx * dt;
  if (pointSolid(map, nx, n.y, n.z)) { n.vx = -n.vx * 0.45; n.vz *= 0.8; nx = n.x; bounced = true; }
  n.x = nx;
  let nz = n.z + n.vz * dt;
  if (pointSolid(map, n.x, n.y, nz)) { n.vz = -n.vz * 0.45; n.vx *= 0.8; nz = n.z; bounced = true; }
  n.z = nz;
  let ny = n.y + n.vy * dt;
  if (ny < NADE_R || pointSolid(map, n.x, ny, n.z)) {
    if (Math.abs(n.vy) > 1.2) bounced = true;
    n.vy = -n.vy * 0.38;
    n.vx *= 0.72; n.vz *= 0.72;
    if (Math.abs(n.vy) < 0.6) n.vy = 0;
    ny = Math.max(n.y, NADE_R);
  }
  n.y = ny;
  n.t += dt;
  return bounced;
}

function pointSolid(map, x, y, z) {
  return map.collideAABB(x - NADE_R, y - NADE_R, z - NADE_R, x + NADE_R, y + NADE_R, z + NADE_R);
}

export function nadeShouldDetonate(n, fuse) {
  if (n.type === 'smoke') {
    const sp = Math.abs(n.vx) + Math.abs(n.vy) + Math.abs(n.vz);
    return (n.t >= fuse && sp < 0.4) || n.t >= 4;
  }
  return n.t >= fuse;
}

// ---------------- util ----------------
export function dirFromAngles(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}

export function anglesTo(dx, dy, dz) {
  const yaw = Math.atan2(-dx, -dz);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  return [yaw, pitch];
}

export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// direção com dispersão em cone
export function spreadDir(d, amount, rand = Math.random) {
  if (amount <= 0) return d;
  // base ortonormal
  let ux = 0, uy = 1, uz = 0;
  if (Math.abs(d[1]) > 0.95) { ux = 1; uy = 0; }
  // r = u x d
  let rx = uy * d[2] - uz * d[1], ry = uz * d[0] - ux * d[2], rz = ux * d[1] - uy * d[0];
  const rl = Math.hypot(rx, ry, rz); rx /= rl; ry /= rl; rz /= rl;
  // u2 = d x r
  const vx = d[1] * rz - d[2] * ry, vy = d[2] * rx - d[0] * rz, vz = d[0] * ry - d[1] * rx;
  const a = rand() * Math.PI * 2;
  const m = Math.sqrt(rand()) * amount;
  const ca = Math.cos(a) * m, sa = Math.sin(a) * m;
  const ox = d[0] + rx * ca + vx * sa, oy = d[1] + ry * ca + vy * sa, oz = d[2] + rz * ca + vz * sa;
  const l = Math.hypot(ox, oy, oz);
  return [ox / l, oy / l, oz / l];
}

export function eyeHeight(crouch) {
  return PLAYER.eye + (PLAYER.crouchEye - PLAYER.eye) * crouch;
}
