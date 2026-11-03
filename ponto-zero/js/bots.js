// IA dos bots (roda só no servidor/host).
import { WEAPONS, PLAYER, ROUND } from './config.js';
import { dirFromAngles, anglesTo, angleDiff, spreadDir, eyeHeight } from './physics.js';

const FOV = (70 * Math.PI) / 180; // meio-ângulo de visão

export class BotBrain {
  constructor(server, p, diff) {
    this.s = server;
    this.p = p;
    this.diff = diff;
    this.reset();
  }

  reset() {
    this.path = null;
    this.pathIdx = 0;
    this.goal = null;
    this.goalKind = '';
    this.goalTime = 0;
    this.repathAt = 0;
    this.target = null;
    this.reactAt = 0;
    this.aimHead = false;
    this.err = [0, 0];
    this.errAt = 0;
    this.acquireAt = 0;
    this.lastKnown = null;
    this.alert = null;
    this.perceiveAt = 0;
    this.burst = 0;
    this.burstPauseUntil = 0;
    this.strafe = 0;
    this.strafeAt = 0;
    this.stuckCheck = null;
    this.loud = false;
    this.nextFire = 0;
    this.reloadUntil = 0;
    this.watch = null;
    this.holdUntil = 0;
    this.lookAround = 0;
    this.jumpAt = 0;
  }

  onSpawn() {
    this.reset();
    this.p.w = this.p.inv.primary?.w || this.p.inv.secondary?.w || 'knife';
  }

  onDeath() {
    this.path = null;
    this.target = null;
  }

  onRoundStart() {
    this.reset();
    this.plan = null;
  }

  onDamaged(attacker) {
    if (!this.target || this.target === attacker) {
      this.alert = { x: attacker.x, y: attacker.y, z: attacker.z, time: this.s.now, id: attacker.id };
    }
  }

  // ------------- munição -------------
  ammo(wid) {
    const p = this.p;
    if (!p.ammo[wid]) {
      const w = WEAPONS[wid];
      p.ammo[wid] = { mag: w.mag || 0, res: w.reserve || 0 };
    }
    return p.ammo[wid];
  }

  reload() {
    const w = WEAPONS[this.p.w];
    if (!w || w.kind === 'knife') return;
    const a = this.ammo(this.p.w);
    if (a.mag >= w.mag || a.res <= 0 || this.reloadUntil > this.s.now) return;
    this.reloadUntil = this.s.now + w.reload * 1000;
    this.reloadW = this.p.w;
  }

  finishReload() {
    if (!this.reloadUntil || this.s.now < this.reloadUntil) return;
    this.reloadUntil = 0;
    const w = WEAPONS[this.reloadW];
    if (!w || this.reloadW !== this.p.w) return;
    const a = this.ammo(this.reloadW);
    const need = w.mag - a.mag;
    const take = Math.min(need, a.res);
    a.mag += take;
    a.res -= take;
  }

  selectWeapon() {
    const p = this.p;
    let want = p.inv.primary?.w || p.inv.secondary?.w || 'knife';
    if (want !== 'knife') {
      const a = this.ammo(want);
      if (a.mag <= 0 && a.res <= 0) {
        const sec = p.inv.secondary?.w;
        want = sec && want !== sec && (this.ammo(sec).mag + this.ammo(sec).res) > 0 ? sec : 'knife';
      }
    }
    if (want !== p.w) {
      p.w = want;
      this.reloadUntil = 0;
      this.nextFire = this.s.now + 450;
    }
  }

  // ------------- percepção -------------
  canSee(e) {
    const s = this.s, p = this.p;
    const ey = p.y + eyeHeight(p.crouch);
    const k = 1 - 0.34 * e.crouch;
    for (const h of [1.25 * k, 1.6 * k, 0.6 * k]) {
      if (s.map.los(p.x, ey, p.z, e.x, e.y + h, e.z) && !s.smokeBlocks(p.x, ey, p.z, e.x, e.y + h, e.z)) return h;
    }
    return 0;
  }

  perceive() {
    const s = this.s, p = this.p;
    if (s.now < p.blindUntil) { this.target = null; return; }
    let best = null, bestD = Infinity;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    for (const e of s.players.values()) {
      if (!e.alive || e === p || !s.isEnemy(p, e) || e.team === 'spec') continue;
      const dx = e.x - p.x, dz = e.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 85) continue;
      const cos = (dx * fx + dz * fz) / (d || 1);
      const inFov = cos > Math.cos(FOV) || d < 4 || (this.alert && this.alert.id === e.id && s.now - this.alert.time < 1500);
      if (!inFov && this.target !== e) continue;
      const h = this.canSee(e);
      if (!h) continue;
      const score = d - (this.target === e ? 10 : 0);
      if (score < bestD) { bestD = score; best = e; }
    }
    if (best && best !== this.target) {
      const known = this.target === null && this.lastKnown && this.lastKnown.id === best.id && s.now - this.lastKnown.time < 1500;
      this.reactAt = s.now + this.diff.reaction * 1000 * (known ? 0.4 : 0.75 + Math.random() * 0.5);
      this.acquireAt = s.now;
      this.aimHead = Math.random() < this.diff.headChance;
      this.burst = 0;
    }
    this.target = best;
    if (best) this.lastKnown = { x: best.x, y: best.y, z: best.z, time: s.now, id: best.id };
  }

  // ------------- objetivos -------------
  computeGoal() {
    const s = this.s, p = this.p;
    const mode = s.settings.mode;
    const elim = mode === 'elim' && s.phase !== 'warmup';
    if (elim) {
      const b = s.bomb;
      if (!this.plan) {
        if (p.team === 'atk') this.plan = { site: s.roundSite || (s.roundSite = Math.random() < 0.5 ? 'A' : 'B') };
        else {
          const defs = [...s.players.values()].filter((q) => q.bot && q.team === 'def');
          const idx = defs.indexOf(p);
          this.plan = { site: idx % 2 === 0 ? 'A' : 'B' };
        }
        this.plan.spot = this.randomSiteSpot(this.plan.site);
      }
      if (p.team === 'atk') {
        if (b.state === 'dropped') {
          const nearest = this.nearestTeammateTo(b.x, b.z);
          if (nearest === p) return { x: b.x, z: b.z, kind: 'bomb' };
        }
        if (b.state === 'planted') {
          if (!this.plan.guard) {
            const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 5;
            const gx = b.x + Math.cos(a) * r, gz = b.z + Math.sin(a) * r;
            this.plan.guard = s.map.clearAt(gx, gz) ? [gx, gz] : [b.x, b.z];
          }
          return { x: this.plan.guard[0], z: this.plan.guard[1], kind: 'hold' };
        }
        return { x: this.plan.spot[0], z: this.plan.spot[1], kind: p.hasBomb ? 'plant' : 'hold' };
      }
      // defensores
      if (b.state === 'planted') return { x: b.x, z: b.z, kind: 'defuse' };
      return { x: this.plan.spot[0], z: this.plan.spot[1], kind: 'hold' };
    }
    // modos de renascimento: caça
    if (s.now - this.goalTime > 9000 + Math.random() * 6000 || !this.goal) {
      let enemy = null, ed = Infinity;
      for (const e of s.players.values()) {
        if (!e.alive || !s.isEnemy(p, e)) continue;
        const d = Math.hypot(e.x - p.x, e.z - p.z);
        if (d < ed) { ed = d; enemy = e; }
      }
      if (enemy && Math.random() < 0.55) return { x: enemy.x, z: enemy.z, kind: 'hunt' };
      const [x, z] = s.map.randomNavPoint();
      return { x, z, kind: 'roam' };
    }
    return this.goal;
  }

  randomSiteSpot(site) {
    const cells = this.s.map.siteCells[site];
    const c = cells[(Math.random() * cells.length) | 0];
    return [c[0], c[1]];
  }

  nearestTeammateTo(x, z) {
    let best = null, bd = Infinity;
    for (const q of this.s.players.values()) {
      if (!q.bot || !q.alive || q.team !== this.p.team) continue;
      const d = Math.hypot(q.x - x, q.z - z);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }

  setGoal(g) {
    const changed = !this.goal || Math.hypot(g.x - this.goal.x, g.z - this.goal.z) > 1.5 || g.kind !== this.goal.kind;
    if (changed) {
      this.goal = g;
      this.goalTime = this.s.now;
      this.path = null;
      this.watch = null;
    }
  }

  ensurePath() {
    const s = this.s, p = this.p;
    if (!this.goal) return;
    if (this.path && s.now < this.repathAt) return;
    this.path = s.map.findPath(p.x, p.z, this.goal.x, this.goal.z) || [];
    this.pathIdx = 0;
    this.repathAt = s.now + 4000 + Math.random() * 2000;
  }

  computeWatch() {
    // direção de onde o inimigo deve vir: primeiro trecho do caminho até a base inimiga
    const s = this.s, p = this.p;
    let tx, tz;
    if (s.teamMode() && p.team === 'def') [tx, tz] = s.map.spawns.atk[0];
    else if (s.teamMode() && p.team === 'atk') [tx, tz] = s.map.spawns.def[0];
    else { tx = 0; tz = 0; }
    const path = s.map.findPath(p.x, p.z, tx, tz);
    if (path && path.length) {
      for (const pt of path) {
        if (Math.hypot(pt[0] - p.x, pt[1] - p.z) > 4) return Math.atan2(-(pt[0] - p.x), -(pt[1] - p.z));
      }
      const pt = path[path.length - 1];
      return Math.atan2(-(pt[0] - p.x), -(pt[1] - p.z));
    }
    return p.yaw;
  }

  // ------------- loop -------------
  update(dt) {
    const s = this.s, p = this.p;
    const now = s.now;
    const body = p.body;
    this.finishReload();
    this.selectWeapon();
    const w = WEAPONS[p.w];

    if (now >= this.perceiveAt) {
      this.perceiveAt = now + 110;
      this.perceive();
    }

    const frozen = s.phase === 'freeze' || s.phase === 'matchEnd';
    let wx = 0, wz = 0, speedMul = 1, crouch = false, jump = false;
    let lookYaw = p.yaw, lookPitch = 0;
    let busy = false; // plantando/desarmando

    const elimLive = s.settings.mode === 'elim' && s.phase === 'live';
    // plantar / desarmar
    if (p.plantStart || p.defuseStart) {
      if (this.target || (p.plantStart && !s.canPlant(p)) || (p.defuseStart && !s.canDefuse(p))) {
        p.plantStart = 0;
        p.defuseStart = 0;
      } else busy = true;
    }

    if (this.target && !frozen) {
      const e = this.target;
      const k = 1 - 0.34 * e.crouch;
      const ty = e.y + (this.aimHead ? 1.6 * k : 1.2 * k);
      const ey = p.y + eyeHeight(p.crouch);
      // erro de mira: diminui com o tempo de mira
      if (now >= this.errAt) {
        this.errAt = now + 350 + Math.random() * 300;
        const settle = Math.max(0.6, 2.2 - (now - this.acquireAt) / 700);
        const e0 = this.diff.aimError * settle;
        this.err = [(Math.random() * 2 - 1) * e0, (Math.random() * 2 - 1) * e0 * 0.6];
      }
      // mira um pouco à frente do movimento
      const [ay, ap] = anglesTo(e.x - p.x, ty - ey, e.z - p.z);
      lookYaw = ay + this.err[0];
      lookPitch = ap + this.err[1];
      const dist = Math.hypot(e.x - p.x, e.z - p.z);

      // movimento em combate
      if (w.kind === 'knife' || w.kind === 'shotgun' || (w.kind === 'smg' && dist > 14)) {
        const d = dirFromAngles(ay, 0);
        wx = d[0]; wz = d[2];
        if (w.kind === 'knife' && dist < 1.6) { wx *= 0.2; wz *= 0.2; }
      } else if (this.diff.turn > 6 && w.kind !== 'sniper') {
        if (now >= this.strafeAt) {
          this.strafeAt = now + 350 + Math.random() * 600;
          this.strafe = Math.random() < 0.35 ? 0 : Math.random() < 0.5 ? -1 : 1;
        }
        const r = dirFromAngles(ay - Math.PI / 2, 0);
        wx = r[0] * this.strafe; wz = r[2] * this.strafe;
        speedMul = PLAYER.walkMul;
        if (dist > 18 && this.diff.turn > 10 && this.burst > 2) crouch = true;
      } else if (this.diff.turn <= 4.5 && this.goal) {
        // bots fáceis continuam andando um pouco
        this.followPath();
        wx = this.moveDir[0] * 0.5; wz = this.moveDir[1] * 0.5;
      }

      // girar
      this.turn(lookYaw, lookPitch, dt);
      const aimErr = Math.abs(angleDiff(p.yaw, lookYaw)) + Math.abs(lookPitch - p.pitch);
      const tolerance = 0.05 + Math.atan2(0.3, dist);
      if (now >= this.reactAt && aimErr < tolerance && now >= this.burstPauseUntil) {
        if (w.kind === 'knife') {
          if (dist < w.range) this.fire(w, dist);
        } else if (w.kind === 'shotgun' && dist > 22) {
          // longe demais: não atira
        } else this.fire(w, dist);
      }
      this.p.scoped = w.kind === 'sniper';
      this.holdUntil = 0;
    } else {
      this.p.scoped = false;
      this.burst = 0;
      if (!frozen) {
        // objetivo
        let g = this.computeGoal();
        // investigar alerta/último inimigo visto
        if (this.lastKnown && now - this.lastKnown.time < 3500 && g.kind !== 'defuse' && g.kind !== 'plant') {
          g = { x: this.lastKnown.x, z: this.lastKnown.z, kind: 'chase' };
        } else if (this.alert && now - this.alert.time < 3000) {
          lookYaw = Math.atan2(-(this.alert.x - p.x), -(this.alert.z - p.z));
        } else {
          const heard = this.hearNoise();
          if (heard && g.kind !== 'defuse' && g.kind !== 'plant' && (g.kind === 'roam' || g.kind === 'hunt' || Math.random() < 0.01)) {
            g = { x: heard.x, z: heard.z, kind: 'chase' };
          }
        }
        this.setGoal(g);
        const dGoal = Math.hypot(g.x - p.x, g.z - p.z);
        const arrive = g.kind === 'defuse' ? 1.1 : g.kind === 'plant' ? 1.2 : 1.6;
        const inSite = s.map.zoneAt(p.x, p.z);
        if (g.kind === 'plant' && elimLive && p.hasBomb && (inSite === 'A' || inSite === 'B') && dGoal < 6) {
          if (!p.plantStart) { p.plantStart = now; s.out.broadcast({ t: 'act', i: p.id, a: 'plant' }); }
          busy = true;
        } else if (g.kind === 'defuse' && elimLive && s.canDefuse(p)) {
          if (!p.defuseStart) { p.defuseStart = now; s.out.broadcast({ t: 'act', i: p.id, a: 'defuse', kit: p.kit ? 1 : 0 }); }
          busy = true;
        }
        if (busy) {
          crouch = true;
        } else if (dGoal > arrive) {
          this.followPath();
          wx = this.moveDir[0]; wz = this.moveDir[1];
          if (Math.hypot(wx, wz) > 0.1) lookYaw = Math.atan2(-wx, -wz);
          if (g.kind === 'chase' && dGoal < 10) speedMul = PLAYER.walkMul;
          if (!this.lastKnown || now - this.lastKnown.time > 3500) {
            // de vez em quando olha em volta
            this.lookAround += dt;
          }
        } else {
          // chegou: segura a posição olhando para a entrada
          if (this.watch === null) this.watch = this.computeWatch();
          lookYaw = this.watch + Math.sin(now / 900 + p.id.length) * 0.5;
          if (g.kind === 'roam' || g.kind === 'hunt' || g.kind === 'chase') this.goalTime = 0; // novo objetivo
          if (g.kind === 'chase') this.lastKnown = null;
        }
      }
      this.turn(lookYaw, lookPitch, dt);
      // recarrega com calma
      if (w.kind !== 'knife') {
        const a = this.ammo(p.w);
        if (a.mag < w.mag * 0.4) this.reload();
      }
    }

    if (frozen) { wx = 0; wz = 0; }
    if (busy) { wx = 0; wz = 0; }

    // preso?
    if (Math.hypot(wx, wz) > 0.1) {
      if (!this.stuckCheck) this.stuckCheck = { x: p.x, z: p.z, t: now };
      else if (now - this.stuckCheck.t > 1200) {
        if (Math.hypot(p.x - this.stuckCheck.x, p.z - this.stuckCheck.z) < 0.4) {
          this.repathAt = 0;
          this.path = null;
          if (now > this.jumpAt) { jump = true; this.jumpAt = now + 1500; }
          if (this.goal && (this.goal.kind === 'roam' || this.goal.kind === 'hunt' || this.goal.kind === 'chase')) this.goalTime = 0;
        }
        this.stuckCheck = { x: p.x, z: p.z, t: now };
      }
    } else this.stuckCheck = null;

    let speed = (w.speed || 5.5) * (crouch ? PLAYER.crouchMul : speedMul);
    body.update(s.map, dt, { wx, wz, speed, jump: jump && body.onGround, crouch });
    const hs = Math.hypot(body.vx, body.vz);
    this.loud = hs > 4.2 && body.onGround;
  }

  hearNoise() {
    const s = this.s, p = this.p;
    let best = null, bd = Infinity;
    for (const n of s.noises) {
      if (n.id === p.id) continue;
      const src = s.players.get(n.id);
      if (!src || !s.isEnemy(p, src)) continue;
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d < n.r && d < bd && s.now - n.time < 2000) { bd = d; best = n; }
    }
    return best;
  }

  followPath() {
    const p = this.p;
    this.moveDir = [0, 0];
    this.ensurePath();
    if (!this.path || !this.path.length) {
      if (this.goal) {
        const dx = this.goal.x - p.x, dz = this.goal.z - p.z;
        const l = Math.hypot(dx, dz);
        if (l > 0.3) this.moveDir = [dx / l, dz / l];
      }
      return;
    }
    let wp = this.path[this.pathIdx];
    while (wp && Math.hypot(wp[0] - p.x, wp[1] - p.z) < 0.7) {
      this.pathIdx++;
      wp = this.path[this.pathIdx];
    }
    if (!wp) { this.path = null; return; }
    const dx = wp[0] - p.x, dz = wp[1] - p.z;
    const l = Math.hypot(dx, dz) || 1;
    let mx = dx / l, mz = dz / l;
    // separação entre bots aliados
    for (const q of this.s.players.values()) {
      if (q === p || !q.alive || q.team !== p.team) continue;
      const ox = p.x - q.x, oz = p.z - q.z;
      const od = Math.hypot(ox, oz);
      if (od < 1.0 && od > 0.01) { mx += (ox / od) * 0.5; mz += (oz / od) * 0.5; }
    }
    const ml = Math.hypot(mx, mz) || 1;
    this.moveDir = [mx / ml, mz / ml];
  }

  turn(yaw, pitch, dt) {
    const p = this.p;
    const maxT = this.diff.turn * dt;
    const dy = angleDiff(p.yaw, yaw);
    // aproximação suave + limite de velocidade
    const stepY = Math.sign(dy) * Math.min(Math.abs(dy), Math.max(maxT * 0.25, Math.abs(dy) * Math.min(1, dt * 9)), maxT);
    p.yaw += stepY;
    if (p.yaw > Math.PI) p.yaw -= Math.PI * 2;
    if (p.yaw < -Math.PI) p.yaw += Math.PI * 2;
    const dp = pitch - p.pitch;
    p.pitch += Math.sign(dp) * Math.min(Math.abs(dp), maxT * 0.7, Math.max(Math.abs(dp) * Math.min(1, dt * 9), maxT * 0.2));
    p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch));
  }

  fire(w, dist) {
    const s = this.s, p = this.p;
    const now = s.now;
    if (now < this.nextFire || this.reloadUntil > now) return;
    if (w.kind !== 'knife') {
      const a = this.ammo(p.w);
      if (a.mag <= 0) { this.reload(); return; }
      a.mag--;
    }
    const body = p.body;
    const sp = Math.hypot(body.vx, body.vz);
    let inacc;
    if (w.kind === 'knife') inacc = 0;
    else {
      inacc = w.kind === 'sniper' ? w.scopedInacc : w.inacc;
      inacc += w.move * Math.min(1, sp / (w.speed || 5));
      if (!body.onGround) inacc += w.air;
      inacc += Math.min(this.burst, 8) * w.spray * 0.12 * (1.6 - this.diff.turn / 12);
      if (p.crouch > 0.5) inacc *= 0.75;
    }
    const ey = p.y + eyeHeight(p.crouch);
    const dir = spreadDir(dirFromAngles(p.yaw, p.pitch), w.pellets ? 0 : inacc);
    s.botShoot(p, w, dir, p.x, ey, p.z);
    this.nextFire = now + (w.kind === 'knife' ? w.rate : w.rate) * 1000 * (w.auto ? 1 : 1.15 + Math.random() * 0.4);
    this.burst++;
    if (w.auto && dist > 12 && this.burst >= this.diff.burst) {
      this.burst = 0;
      this.burstPauseUntil = now + 250 + Math.random() * 300;
    }
    if (w.kind === 'sniper') this.burstPauseUntil = now + w.rate * 1000;
  }
}

export { ROUND };
