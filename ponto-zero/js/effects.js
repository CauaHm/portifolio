// Efeitos visuais: traçantes, partículas, marcas de tiro, explosões, fumaça, granadas, bomba, armas no chão.
import * as THREE from 'three';
import { buildGun, muzzleFlashTexture, softTexture } from './models.js';

const MAX_TRACERS = 64;
const MAX_PARTICLES = 900;
const MAX_DECALS = 220;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    // ---- traçantes ----
    this.tracers = [];
    const tg = new THREE.BufferGeometry();
    this.tracerPos = new Float32Array(MAX_TRACERS * 6);
    this.tracerCol = new Float32Array(MAX_TRACERS * 6);
    tg.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3));
    tg.setAttribute('color', new THREE.BufferAttribute(this.tracerCol, 3));
    this.tracerLines = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracerLines.frustumCulled = false;
    scene.add(this.tracerLines);
    // ---- partículas ----
    this.parts = [];
    const pg = new THREE.BufferGeometry();
    this.partPos = new Float32Array(MAX_PARTICLES * 3);
    this.partCol = new Float32Array(MAX_PARTICLES * 3);
    pg.setAttribute('position', new THREE.BufferAttribute(this.partPos, 3));
    pg.setAttribute('color', new THREE.BufferAttribute(this.partCol, 3));
    this.points = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true, depthWrite: false, map: softTexture(), alphaTest: 0.05 }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    // ---- marcas de tiro ----
    const dg = new THREE.PlaneGeometry(0.09, 0.09);
    const dc = document.createElement('canvas');
    dc.width = dc.height = 64;
    const g = dc.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grd.addColorStop(0, 'rgba(10,8,6,1)');
    grd.addColorStop(0.35, 'rgba(30,24,18,0.9)');
    grd.addColorStop(1, 'rgba(60,50,40,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const dtex = new THREE.CanvasTexture(dc);
    this.decals = new THREE.InstancedMesh(dg, new THREE.MeshBasicMaterial({ map: dtex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), MAX_DECALS);
    this.decals.count = 0;
    this.decals.frustumCulled = false;
    this.decalIdx = 0;
    scene.add(this.decals);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._n = new THREE.Vector3();
    // ---- clarões de outros jogadores ----
    this.flashes = [];
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: muzzleFlashTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.visible = false;
      s.scale.set(0.5, 0.5, 1);
      scene.add(s);
      this.flashes.push({ s, until: 0 });
    }
    this.flashLight = new THREE.PointLight(0xffb060, 0, 9, 1.5);
    scene.add(this.flashLight);
    this.flashLightUntil = 0;
    // ---- explosões ----
    this.booms = [];
    // ---- fumaças ----
    this.smokes = [];
    this.smokeMat = new THREE.SpriteMaterial({ map: softTexture(), color: 0xc9c9c4, transparent: true, depthWrite: false, opacity: 0.0 });
    // ---- granadas em voo ----
    this.nades = new Map();
    // ---- bomba ----
    this.bomb = buildGun('bomb').group;
    this.bomb.scale.setScalar(1.6);
    this.bomb.visible = false;
    this.bombLed = this.bomb.getObjectByName('led');
    this.bombLight = new THREE.PointLight(0xff2020, 0, 3);
    this.bomb.add(this.bombLight);
    scene.add(this.bomb);
    // ---- armas no chão ----
    this.drops = new Map();
    // ---- fogo da incendiária ----
    this.fires = new Map();
    this.scorchMat = new THREE.MeshBasicMaterial({ map: softTexture(), color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  }

  fire(id, p, dur = 7000, r = 3.2) {
    if (this.fires.has(id)) return;
    const light = new THREE.PointLight(0xff7a20, 8, 10, 1.6);
    light.position.set(p[0], p[1] + 0.8, p[2]);
    this.scene.add(light);
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(r * 1.05, 24), this.scorchMat);
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.set(p[0], p[1] + 0.02, p[2]);
    this.scene.add(scorch);
    this.fires.set(id, { p, r, until: performance.now() + dur, light, scorch, acc: 0, crackle: 0 });
  }

  removeFire(id) {
    const f = this.fires.get(id);
    if (!f) return;
    this.scene.remove(f.light);
    this.scene.remove(f.scorch);
    f.scorch.geometry.dispose();
    this.fires.delete(id);
    this.burst([f.p[0], f.p[1] + 0.3, f.p[2]], 30, { color: [0.35, 0.33, 0.3], speed: 2, up: 1.5, life: 1.2, gravity: -1 });
  }

  clearFires() {
    for (const id of [...this.fires.keys()]) this.removeFire(id);
  }

  // ---------- traçantes ----------
  tracer(o, e, color = [1, 0.85, 0.5]) {
    const dx = e[0] - o[0], dy = e[1] - o[1], dz = e[2] - o[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1) return;
    if (this.tracers.length >= MAX_TRACERS) this.tracers.shift();
    this.tracers.push({ o, d: [dx / len, dy / len, dz / len], len, t: 0, color });
  }

  // ---------- partículas ----------
  burst(p, n, opts = {}) {
    const { color = [0.6, 0.5, 0.4], speed = 3, up = 1.5, life = 0.5, gravity = 9, normal = null, spread = 1 } = opts;
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= MAX_PARTICLES) this.parts.shift();
      let vx = (Math.random() - 0.5) * 2 * spread, vy = Math.random() * up, vz = (Math.random() - 0.5) * 2 * spread;
      if (normal) { vx += normal[0] * 1.4; vy += normal[1] * 1.4; vz += normal[2] * 1.4; }
      const s = speed * (0.4 + Math.random() * 0.8);
      const jitter = 0.85 + Math.random() * 0.3;
      this.parts.push({
        x: p[0], y: p[1], z: p[2], vx: vx * s, vy: vy * s, vz: vz * s, life: life * (0.6 + Math.random() * 0.8), age: 0,
        c: [color[0] * jitter, color[1] * jitter, color[2] * jitter], g: gravity,
      });
    }
  }

  impact(p, n, kind) {
    if (kind === 'f' || kind === 'flesh') {
      this.burst(p, 10, { color: [0.6, 0.05, 0.04], speed: 1.8, up: 0.8, life: 0.45, gravity: 8 });
      return;
    }
    const color = kind === 'c' || kind === 'crate' ? [0.55, 0.38, 0.2] : kind === 'f' ? [0.6, 0.05, 0.04] : [0.75, 0.66, 0.52];
    this.burst(p, 7, { color, speed: 2.2, up: 1, life: 0.5, normal: n, spread: 0.6 });
    this.burst(p, 2, { color: [1, 0.85, 0.4], speed: 4, up: 1, life: 0.12, normal: n, gravity: 2 });
    if (n) this.decal(p, n);
  }

  decal(p, n) {
    const v = this._v.set(p[0] + n[0] * 0.01, p[1] + n[1] * 0.01, p[2] + n[2] * 0.01);
    this._n.set(n[0], n[1], n[2]);
    this._q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this._n);
    const s = 0.8 + Math.random() * 0.5;
    this._m.compose(v, this._q, new THREE.Vector3(s, s, s));
    this.decals.setMatrixAt(this.decalIdx, this._m);
    this.decalIdx = (this.decalIdx + 1) % MAX_DECALS;
    this.decals.count = Math.max(this.decals.count, this.decalIdx === 0 ? MAX_DECALS : this.decalIdx);
    this.decals.instanceMatrix.needsUpdate = true;
  }

  clearDecals() {
    this.decals.count = 0;
    this.decalIdx = 0;
  }

  muzzle(p, size = 0.5) {
    const f = this.flashes.find((x) => x.until < performance.now()) || this.flashes[0];
    f.s.position.set(p[0], p[1], p[2]);
    f.s.scale.set(size, size, 1);
    f.s.material.rotation = Math.random() * Math.PI;
    f.s.visible = true;
    f.until = performance.now() + 50;
    this.flashLight.position.set(p[0], p[1], p[2]);
    this.flashLight.intensity = 6;
    this.flashLightUntil = performance.now() + 50;
  }

  explosion(p, big = false) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: muzzleFlashTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.set(p[0], p[1] + 0.5, p[2]);
    this.scene.add(s);
    const light = new THREE.PointLight(0xffa040, big ? 60 : 25, big ? 40 : 16, 1.2);
    light.position.set(p[0], p[1] + 1, p[2]);
    this.scene.add(light);
    this.booms.push({ s, light, t: 0, big });
    this.burst([p[0], p[1] + 0.3, p[2]], big ? 160 : 60, { color: [1, 0.6, 0.2], speed: big ? 12 : 7, up: 1.2, life: 0.6, gravity: 6, spread: 1 });
    this.burst([p[0], p[1] + 0.3, p[2]], big ? 120 : 40, { color: [0.25, 0.22, 0.2], speed: big ? 6 : 3.5, up: 1.5, life: 1.6, gravity: -0.5, spread: 1 });
  }

  flashBurst(p) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.set(p[0], p[1], p[2]);
    this.scene.add(s);
    const light = new THREE.PointLight(0xffffff, 40, 25, 1.2);
    light.position.set(p[0], p[1] + 0.3, p[2]);
    this.scene.add(light);
    this.booms.push({ s, light, t: 0, flash: true });
  }

  smoke(p, remaining = 18000) {
    const group = new THREE.Group();
    group.position.set(p[0], p[1], p[2]);
    const puffs = [];
    for (let i = 0; i < 34; i++) {
      const m = this.smokeMat.clone();
      const g = 0.72 + Math.random() * 0.12;
      m.color.setRGB(g, g, g * 0.98);
      const s = new THREE.Sprite(m);
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 3.4, h = Math.random() * 3.0;
      puffs.push({ s, tx: Math.cos(a) * r, ty: 0.4 + h, tz: Math.sin(a) * r, size: 2.6 + Math.random() * 1.8, rot: (Math.random() - 0.5) * 0.3 });
      s.position.set(0, 0.2, 0);
      group.add(s);
    }
    this.scene.add(group);
    const total = 18000;
    this.smokes.push({ group, puffs, age: total - remaining, total });
  }

  clearSmokes() {
    for (const s of this.smokes) this.scene.remove(s.group);
    this.smokes = [];
  }

  // ---------- granadas ----------
  addNade(id, type, n) {
    const { group } = buildGun(type);
    group.scale.setScalar(1.3);
    this.scene.add(group);
    this.nades.set(id, { mesh: group, n, type });
  }

  removeNade(id) {
    const e = this.nades.get(id);
    if (!e) return;
    this.scene.remove(e.mesh);
    this.nades.delete(id);
  }

  // ---------- armas no chão ----------
  addDrop(id, w, p) {
    if (this.drops.has(id)) return;
    const { group } = buildGun(w);
    const holder = new THREE.Group();
    holder.add(group);
    group.rotation.set(0, 0, Math.PI / 2);
    holder.position.set(p[0], p[1] + 0.05, p[2]);
    holder.rotation.y = Math.random() * Math.PI * 2;
    group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(holder);
    this.drops.set(id, holder);
  }

  removeDrop(id) {
    const d = this.drops.get(id);
    if (d) this.scene.remove(d);
    this.drops.delete(id);
  }

  clearDrops() {
    for (const id of [...this.drops.keys()]) this.removeDrop(id);
  }

  clearNades() {
    for (const id of [...this.nades.keys()]) this.removeNade(id);
  }

  setBomb(state, p, blinkRate) {
    if (!p || (state !== 'planted' && state !== 'dropped')) {
      this.bomb.visible = false;
      return;
    }
    this.bomb.visible = true;
    this.bomb.position.set(p[0], p[1] + 0.09, p[2]);
    this.bombBlink = state === 'planted' ? blinkRate : 0;
  }

  update(dt, camPos) {
    const now = performance.now();
    // traçantes
    const speed = 380, segLen = 5;
    let ti = 0;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.t += dt;
      // a cauda continua andando depois que a ponta chega no impacto; some quando passa do fim
      if (t.t * speed - segLen >= t.len || t.t > 1.5) { this.tracers.splice(i, 1); continue; }
    }
    for (const t of this.tracers) {
      const run = t.t * speed;
      const head = Math.min(t.len, run);
      const tail = Math.min(t.len, Math.max(0, run - segLen));
      const o = t.o, d = t.d;
      this.tracerPos.set([o[0] + d[0] * tail, o[1] + d[1] * tail, o[2] + d[2] * tail, o[0] + d[0] * head, o[1] + d[1] * head, o[2] + d[2] * head], ti * 6);
      this.tracerCol.set([0, 0, 0, t.color[0], t.color[1], t.color[2]], ti * 6);
      ti++;
    }
    this.tracerLines.geometry.setDrawRange(0, ti * 2);
    this.tracerLines.geometry.attributes.position.needsUpdate = true;
    this.tracerLines.geometry.attributes.color.needsUpdate = true;
    // partículas
    let pi = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.age += dt;
      if (p.age >= p.life) { this.parts.splice(i, 1); continue; }
      p.vy -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.01) { p.y = 0.01; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
    }
    for (const p of this.parts) {
      const f = 1 - p.age / p.life;
      this.partPos[pi * 3] = p.x; this.partPos[pi * 3 + 1] = p.y; this.partPos[pi * 3 + 2] = p.z;
      this.partCol[pi * 3] = p.c[0] * f; this.partCol[pi * 3 + 1] = p.c[1] * f; this.partCol[pi * 3 + 2] = p.c[2] * f;
      pi++;
    }
    this.points.geometry.setDrawRange(0, pi);
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    // clarões
    for (const f of this.flashes) if (f.s.visible && now > f.until) f.s.visible = false;
    if (now > this.flashLightUntil) this.flashLight.intensity = 0;
    // explosões
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const b = this.booms[i];
      b.t += dt;
      const dur = b.flash ? 0.35 : b.big ? 0.9 : 0.5;
      const k = b.t / dur;
      if (k >= 1) {
        this.scene.remove(b.s); this.scene.remove(b.light);
        b.s.material.dispose();
        this.booms.splice(i, 1);
        continue;
      }
      const size = (b.flash ? 3 : b.big ? 16 : 6) * (0.4 + k);
      b.s.scale.set(size, size, 1);
      b.s.material.opacity = 1 - k;
      b.light.intensity = (b.flash ? 40 : b.big ? 60 : 25) * (1 - k);
    }
    // fumaças
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.age += dt * 1000;
      if (s.age >= s.total) {
        this.scene.remove(s.group);
        for (const p of s.puffs) p.s.material.dispose();
        this.smokes.splice(i, 1);
        continue;
      }
      const grow = Math.min(1, s.age / 1400);
      const fade = s.age > s.total - 2500 ? (s.total - s.age) / 2500 : 1;
      const e = 1 - Math.pow(1 - grow, 3);
      for (const p of s.puffs) {
        p.s.position.set(p.tx * e, 0.3 + (p.ty - 0.3) * e, p.tz * e);
        const sz = p.size * (0.3 + 0.7 * e);
        p.s.scale.set(sz, sz, 1);
        p.s.material.opacity = 0.92 * fade * Math.min(1, s.age / 300);
        p.s.material.rotation += p.rot * dt;
      }
    }
    // fogo
    for (const [id, f] of this.fires) {
      if (now > f.until) { this.removeFire(id); continue; }
      f.acc += dt * 90;
      while (f.acc >= 1) {
        f.acc -= 1;
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * f.r;
        const x = f.p[0] + Math.cos(a) * rr, z = f.p[2] + Math.sin(a) * rr;
        const hot = Math.random();
        if (this.parts.length >= MAX_PARTICLES) this.parts.shift();
        this.parts.push({
          x, y: f.p[1] + 0.05, z, vx: (Math.random() - 0.5) * 0.4, vy: 1.2 + Math.random() * 1.8, vz: (Math.random() - 0.5) * 0.4,
          life: 0.35 + Math.random() * 0.5, age: 0, c: hot > 0.5 ? [1, 0.75, 0.25] : [1, 0.35, 0.08], g: -1.5,
        });
      }
      f.light.intensity = 6 + Math.random() * 5;
      if (Math.random() < dt * 3) {
        const a = Math.random() * Math.PI * 2;
        this.burst([f.p[0] + Math.cos(a) * f.r * 0.5, f.p[1] + 1.2, f.p[2] + Math.sin(a) * f.r * 0.5], 2, { color: [0.2, 0.19, 0.18], speed: 0.6, up: 1, life: 1.8, gravity: -0.8 });
      }
    }
    // granadas
    for (const e of this.nades.values()) {
      e.mesh.position.set(e.n.x, e.n.y, e.n.z);
      e.mesh.rotation.x += dt * Math.hypot(e.n.vx, e.n.vz) * 2;
    }
    // bomba
    if (this.bomb.visible && this.bombLed) {
      const on = this.bombBlink > 0 && Math.floor(now / (500 / this.bombBlink)) % 2 === 0;
      this.bombLed.visible = on || this.bombBlink === 0;
      this.bombLight.intensity = on ? 2 : 0;
    }
    void camPos;
  }
}
