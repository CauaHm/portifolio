// Servidor autoritativo (roda no navegador do host, ou localmente no treino offline).
import { GameMap } from './map.js';
import {
  MoveBody, rayEntity, computeDamage, nadeStep, nadeShouldDetonate, NADE_DT,
  dirFromAngles, spreadDir, eyeHeight,
} from './physics.js';
import { WEAPONS, NADES, GEAR, ECON, ROUND, MODES, BOT_NAMES, DIFFICULTY, SNAP_RATE } from './config.js';
import { BotBrain } from './bots.js';

export const WLIST = [...Object.keys(WEAPONS), ...Object.keys(NADES), 'bomb'];
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

export class Server {
  constructor(settings, out) {
    this.map = new GameMap();
    this.out = out; // {send(id,msg), broadcast(msg, exceptId)}
    this.settings = normalizeSettings(settings);
    this.players = new Map();
    this.inbox = [];
    this.now = performance.now();
    this.uid = 1;
    this.botSeq = 0;
    this.drops = new Map();
    this.nades = new Map();
    this.smokes = [];
    this.fires = [];
    this.fireTick = 0;
    this.noises = [];
    this.bomb = { state: 'none' };
    this.phase = 'warmup';
    this.phaseEnds = 0;
    this.round = 0;
    this.score = { atk: 0, def: 0 };
    this.kills = { atk: 0, def: 0 };
    this.lossStreak = { atk: 0, def: 0 };
    this.liveStart = 0;
    this.snapAcc = 0;
    this.rosterAcc = 0;
    this.stateAcc = 0;
    this.nadeAcc = 0;
    this.rosterDirty = true;
    this.stateDirty = true;
    this.usedNames = new Set();
    this.banned = new Set(); // nomes expulsos (minúsculos)
    this.vote = null;
    // offline: a partida começa quando o jogador escolhe o time
    this.autoStart = !!this.settings.offline;
    if (!this.autoStart) this.enterWarmup();
  }

  // ---------------- entrada ----------------
  receive(id, msg) {
    this.inbox.push([id, msg]);
  }

  join(id) {
    // conexão aberta; aguardando mensagem 'join'
    this.pending = this.pending || new Set();
    this.pending.add(id);
  }

  leave(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.hasBomb) this.dropBomb(p);
    this.players.delete(id);
    this.usedNames.delete(p.name);
    this.out.broadcast({ t: 'left', i: id, n: p.name });
    if (this.vote && (this.vote.target === id || this.vote.starter === id)) this.endVote(false, 'saiu');
    else if (this.vote) this.checkVote();
    this.balanceBots();
    this.rosterDirty = true;
  }

  handle(id, m) {
    if (m.t === 'join') return this.onJoin(id, m);
    const p = this.players.get(id);
    if (!p) return;
    switch (m.t) {
      case 'st': return this.onState(p, m);
      case 'fire': return this.onFire(p, m);
      case 'nade': return this.onNade(p, m);
      case 'buy': return this.onBuy(p, m.i);
      case 'team': return this.onTeam(p, m.team);
      case 'drop': return this.onDropWeapon(p, m.s);
      case 'plantStart': return this.onPlantStart(p);
      case 'plantCancel': p.plantStart = 0; return;
      case 'plant': return this.onPlant(p, m);
      case 'defuseStart': return this.onDefuseStart(p);
      case 'defuseCancel': p.defuseStart = 0; return;
      case 'defuse': return this.onDefuse(p);
      case 'chat': return this.onChat(p, m);
      case 'voteStart': return this.onVoteStart(p, m.target);
      case 'voteCast': return this.onVoteCast(p, !!m.yes);
      case 'ping': this.out.send(id, { t: 'pong', c: m.c }); p.ping = Math.round(m.pi || 0); return;
      case 'cmd': if (id === 'host') this.onCommand(m); return;
      default:
    }
  }

  humanCount() {
    let n = 0;
    for (const p of this.players.values()) if (!p.bot) n++;
    return n;
  }

  reject(id, t) {
    this.out.send(id, { t });
    const why = t === 'full' ? 'A sala está cheia.' : 'Você foi expulso desta sala e não pode voltar.';
    setTimeout(() => this.out.kick?.(id, why), 1500);
  }

  onJoin(id, m) {
    if (this.players.has(id)) return;
    let name = String(m.name || 'Jogador').replace(/[<>]/g, '').trim().slice(0, 16) || 'Jogador';
    if (id !== 'host') {
      if (this.banned.has(name.toLowerCase())) return this.reject(id, 'banned');
      if (this.humanCount() >= this.settings.maxPlayers) return this.reject(id, 'full');
    }
    let base = name, n = 2;
    while (this.usedNames.has(name)) name = base.slice(0, 13) + ' ' + n++;
    this.usedNames.add(name);
    const p = this.newPlayer(id, name, false);
    this.players.set(id, p);
    this.out.send(id, {
      t: 'welcome', id, name, settings: this.settings, host: id === 'host',
      drops: [...this.drops.values()].map((d) => ({ i: d.id, w: d.w, p: [r2(d.x), r2(d.y), r2(d.z)] })),
      smokes: this.smokes.map((s) => ({ p: [s.x, s.y, s.z], rem: s.until - this.now })),
    });
    if (!MODES[this.settings.mode].teams) this.onTeam(p, 'ffa');
    this.out.broadcast({ t: 'joined', i: id, n: name }, id);
    this.rosterDirty = true;
    this.stateDirty = true;
  }

  newPlayer(id, name, bot) {
    return {
      id, name, bot, team: 'spec', alive: false, hp: 0, armor: 0, helmet: false, kit: false,
      money: this.isEcon() ? ECON.start : ECON.max, k: 0, d: 0, a: 0, sc: 0,
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, crouch: 0, w: 'knife', moving: 0,
      inv: { primary: null, secondary: null, nades: [] },
      hasBomb: false, protUntil: 0, respawnAt: 0, spawnTime: 0, spawnSeq: 0,
      dmgBy: new Map(), loadout: null, plantStart: 0, defuseStart: 0, ping: 0,
      lastFire: 0, blindUntil: 0, body: null, brain: null,
    };
  }

  isEcon() {
    return this.settings.mode === 'elim' && this.phase !== 'warmup';
  }

  teamMode() {
    return MODES[this.settings.mode].teams;
  }

  isEnemy(a, b) {
    if (a === b) return false;
    if (!this.teamMode()) return true;
    return a.team !== b.team;
  }

  // ---------------- mensagens dos jogadores ----------------
  onState(p, m) {
    if (!p.alive || m.sq !== p.spawnSeq) return;
    if (!Array.isArray(m.p)) return;
    const [x, y, z] = m.p;
    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return;
    p.x = x; p.y = y; p.z = z;
    p.yaw = +m.y || 0;
    p.pitch = +m.pi || 0;
    p.crouch = +m.c || 0;
    p.moving = +m.mv || 0;
    if (WLIST.includes(m.w)) p.w = m.w;
    p.scoped = !!m.sc;
    this.pickupCheck(p);
  }

  canAttack() {
    return this.phase !== 'freeze' && this.phase !== 'matchEnd';
  }

  ownsWeapon(p, w) {
    return w === 'knife' || p.inv.primary?.w === w || p.inv.secondary?.w === w;
  }

  onFire(p, m) {
    if (!p.alive || !this.canAttack()) return;
    const w = WEAPONS[m.w];
    if (!w || !this.ownsWeapon(p, m.w)) return;
    const minGap = (m.hv ? w.heavyRate : w.rate) * 1000 * 0.7;
    if (this.now - p.lastFire < minGap) return;
    p.lastFire = this.now;
    p.protUntil = 0;
    const hits = Array.isArray(m.h) ? m.h.slice(0, 12) : [];
    for (const h of hits) {
      const v = this.players.get(h[0]);
      if (!v || !v.alive || v === p || !this.isEnemy(p, v)) continue;
      const zone = h[1] === 'head' || h[1] === 'legs' ? h[1] : 'body';
      const realDist = Math.hypot(v.x - p.x, v.z - p.z);
      if (realDist > (w.kind === 'knife' ? 4 : 250)) continue;
      const dist = Math.max(0, Math.min(Number(h[2]) || realDist, 250));
      this.damage(v, p, w, zone, dist, !!m.hv);
    }
    if (w.kind !== 'knife') this.noise(p, 30);
    this.out.broadcast({ t: 'shot', i: p.id, w: m.w, o: m.o, e: Array.isArray(m.e) ? m.e.slice(0, 12) : [], hv: m.hv ? 1 : 0 }, p.id);
  }

  noise(p, radius) {
    this.noises.push({ x: p.x, z: p.z, id: p.id, team: p.team, time: this.now, r: radius });
    if (this.noises.length > 40) this.noises.shift();
  }

  // Tiro dos bots (resolvido inteiramente no servidor)
  botShoot(p, w, dir, ox, oy, oz) {
    const pellets = w.pellets || 1;
    const ends = [];
    const hitsBy = new Map();
    for (let i = 0; i < pellets; i++) {
      const d = pellets > 1 ? spreadDir(dir, w.inacc) : dir;
      const res = this.traceShot(p, ox, oy, oz, d, w.kind === 'knife' ? w.range : 200);
      ends.push([r2(res.x), r2(res.y), r2(res.z), res.ent ? 'f' : res.kind[0]]);
      if (res.ent) {
        const key = res.ent.id;
        if (!hitsBy.has(key)) hitsBy.set(key, []);
        hitsBy.get(key).push([res.zone, res.t]);
      }
    }
    p.lastFire = this.now;
    p.protUntil = 0;
    for (const [id, list] of hitsBy) {
      const v = this.players.get(id);
      for (const [zone, t] of list) if (v.alive) this.damage(v, p, w, zone, t, false);
    }
    if (w.kind !== 'knife') this.noise(p, 30);
    this.out.broadcast({ t: 'shot', i: p.id, w: w.id, o: [r2(ox), r2(oy), r2(oz)], e: ends, hv: 0 });
  }

  traceShot(shooter, ox, oy, oz, d, range) {
    const mh = this.map.raycast(ox, oy, oz, d[0], d[1], d[2], range);
    let best = mh ? mh.t : range;
    let ent = null, zone = null;
    for (const v of this.players.values()) {
      if (!v.alive || v === shooter || v.team === 'spec') continue;
      if (!this.isEnemy(shooter, v)) continue;
      const h = rayEntity(ox, oy, oz, d[0], d[1], d[2], v, best);
      if (h && h.t < best) { best = h.t; ent = v; zone = h.zone; }
    }
    return {
      t: best, ent, zone, kind: ent ? 'flesh' : mh ? mh.kind : 'air',
      x: ox + d[0] * best, y: oy + d[1] * best, z: oz + d[2] * best,
    };
  }

  damage(v, attacker, w, zone, dist, heavy) {
    if (!v.alive) return;
    if (v.protUntil > this.now) return;
    let res;
    if (w.kind === 'knife') {
      let dmg = heavy ? w.heavy : w.dmg;
      // facada nas costas
      if (attacker) {
        const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
        const ax = v.x - attacker.x, az = v.z - attacker.z;
        const l = Math.hypot(ax, az) || 1;
        if ((fx * ax + fz * az) / l > 0.5) dmg = heavy ? 180 : 90;
      }
      res = { hp: dmg, armor: 0 };
    } else {
      res = computeDamage(w, zone, dist, v);
    }
    this.applyDamage(v, attacker, res.hp, res.armor, w.id, zone === 'head');
  }

  applyDamage(v, attacker, hp, armorLoss, weaponId, headshot) {
    if (!v.alive) return;
    v.hp -= hp;
    v.armor = Math.max(0, v.armor - armorLoss);
    if (v.armor <= 0) v.helmet = false;
    if (attacker && attacker !== v) v.dmgBy.set(attacker.id, (v.dmgBy.get(attacker.id) || 0) + Math.min(hp, v.hp + hp));
    if (!v.bot) {
      this.out.send(v.id, {
        t: 'hurt', hp: Math.max(0, v.hp), ar: v.armor, hm: v.helmet, dmg: hp,
        f: attacker ? [r2(attacker.x), r2(attacker.y), r2(attacker.z)] : null,
      });
    } else if (attacker && v.brain) {
      v.brain.onDamaged(attacker);
    }
    if (attacker && !attacker.bot && attacker !== v) {
      this.out.send(attacker.id, { t: 'dealt', v: v.id, dmg: hp, hs: headshot ? 1 : 0, kill: v.hp <= 0 ? 1 : 0 });
    }
    if (v.hp <= 0) this.kill(v, attacker, weaponId, headshot);
    this.rosterDirty = true;
  }

  kill(v, attacker, weaponId, headshot) {
    v.alive = false;
    v.hp = 0;
    v.d++;
    v.plantStart = 0;
    v.defuseStart = 0;
    let assistId = null;
    const econ = this.isEcon();
    if (attacker && attacker !== v) {
      if (this.isEnemy(attacker, v)) {
        attacker.k++;
        attacker.sc += 2;
        if (econ) {
          const w = WEAPONS[weaponId];
          attacker.money = Math.min(ECON.max, attacker.money + (w ? w.reward : 300));
        }
        if (this.settings.mode === 'tdm' && this.phase === 'live') this.kills[attacker.team]++;
      } else {
        attacker.k--;
        if (econ) attacker.money = Math.max(0, attacker.money - 300);
      }
    }
    for (const [aid, dmg] of v.dmgBy) {
      if (attacker && aid === attacker.id) continue;
      const a = this.players.get(aid);
      if (a && dmg >= 40 && this.isEnemy(a, v)) {
        a.a++;
        a.sc += 1;
        assistId = aid;
        break;
      }
    }
    v.dmgBy.clear();
    if (v.hasBomb) this.dropBomb(v);
    if (this.settings.mode === 'elim' && this.phase !== 'warmup') {
      const w = v.inv.primary || v.inv.secondary;
      if (w) this.spawnDrop(w.w, v.x, v.y, v.z);
    }
    this.out.broadcast({
      t: 'kill', k: attacker ? attacker.id : null, v: v.id, w: weaponId, hs: headshot ? 1 : 0, a: assistId,
      p: [r2(v.x), r2(v.y), r2(v.z)],
    });
    if (v.brain) v.brain.onDeath();
    // renascimento
    if (this.phase === 'warmup') v.respawnAt = this.now + 2000;
    else if (this.settings.mode !== 'elim') v.respawnAt = this.now + ROUND.respawn * 1000;
    else v.respawnAt = 0;
    v.inv = this.settings.mode === 'elim' && this.phase !== 'warmup' ? { primary: null, secondary: null, nades: [] } : v.inv;
    if (this.settings.mode === 'elim' && this.phase !== 'warmup') { v.armor = 0; v.helmet = false; v.kit = false; }
    this.rosterDirty = true;
    this.checkLimits(attacker);
  }

  checkLimits(attacker) {
    if (this.phase !== 'live') return;
    if (this.settings.mode === 'tdm') {
      for (const t of ['atk', 'def']) {
        if (this.kills[t] >= this.settings.killLimit) return this.endMatch(t);
      }
    } else if (this.settings.mode === 'ffa') {
      if (attacker && attacker.k >= this.settings.killLimit) return this.endMatch(attacker.id);
    }
    this.stateDirty = true;
  }

  onNade(p, m) {
    if (!p.alive || !this.canAttack()) return;
    const type = m.type;
    const idx = p.inv.nades.indexOf(type);
    if (idx < 0) return;
    if (!Array.isArray(m.p) || !Array.isArray(m.v)) return;
    p.inv.nades.splice(idx, 1);
    this.throwNade(p, type, m.p, m.v);
    this.sendInv(p);
  }

  throwNade(p, type, pos, vel) {
    const id = this.uid++;
    const n = { id, type, owner: p.id, x: pos[0], y: pos[1], z: pos[2], vx: vel[0], vy: vel[1], vz: vel[2], t: 0 };
    this.nades.set(id, n);
    this.out.broadcast({ t: 'nade', i: id, type, o: p.id, p: [n.x, n.y, n.z], v: [n.vx, n.vy, n.vz] });
  }

  onBuy(p, item) {
    const res = this.buy(p, item, false);
    if (res !== true) this.out.send(p.id, { t: 'buyfail', r: res });
    else this.out.send(p.id, { t: 'buyok', i: item });
  }

  canBuyNow(p) {
    if (!p.alive) return 'Você está morto.';
    if (this.phase === 'warmup') return true;
    if (this.settings.mode === 'elim') {
      const z = this.map.zoneAt(p.x, p.z);
      const home = p.team === 'atk' ? 'T' : 'D';
      if (z !== home) return 'Você precisa estar na sua base.';
      if (this.phase === 'freeze') return true;
      if (this.phase === 'live' && this.now - this.liveStart < ROUND.buyTime * 1000) return true;
      return 'O tempo de compra acabou.';
    }
    if (this.now - p.spawnTime < ROUND.tdmBuyWindow * 1000) return true;
    return 'Compra só nos primeiros segundos depois de renascer.';
  }

  buy(p, item, free) {
    const ok = free ? true : this.canBuyNow(p);
    if (ok !== true) return ok;
    const econ = this.isEcon() && !free;
    const w = WEAPONS[item], nd = NADES[item], g = GEAR[item];
    let price = (w || nd || g)?.price;
    if (price == null) return 'Item inválido.';
    if (!econ) price = 0;
    if (w) {
      if (w.team && this.teamMode() && w.team !== p.team) return 'Arma do outro time.';
      const slot = w.slot;
      if (p.inv[slot]?.w === item) return 'Você já tem essa arma.';
      if (price > p.money) return 'Dinheiro insuficiente.';
      if (p.inv[slot] && this.settings.mode === 'elim' && this.phase !== 'warmup') {
        this.spawnDrop(p.inv[slot].w, p.x, p.y, p.z);
      }
      p.inv[slot] = { w: item, u: this.uid++ };
      p.w = item;
      if (!this.isEcon() && !p.bot) {
        p.loadout = p.loadout || {};
        p.loadout[slot] = item;
      }
    } else if (nd) {
      if (p.inv.nades.includes(item)) return 'Você já tem essa granada.';
      if (p.inv.nades.length >= 4) return 'Limite de granadas.';
      if (price > p.money) return 'Dinheiro insuficiente.';
      p.inv.nades.push(item);
      if (!this.isEcon() && !p.bot) {
        p.loadout = p.loadout || {};
        p.loadout.nades = [...p.inv.nades];
      }
    } else if (g) {
      if (item === 'vest') {
        if (p.armor >= 100) return 'Colete já está cheio.';
      } else if (item === 'vesthelm') {
        if (p.armor >= 100 && p.helmet) return 'Você já tem colete e capacete.';
        if (p.armor >= 100 && econ) price = 350;
      } else if (item === 'kit') {
        if (p.team !== 'def' || this.settings.mode !== 'elim') return 'Só defensores no mata-mata.';
        if (p.kit) return 'Você já tem o kit.';
      }
      if (price > p.money) return 'Dinheiro insuficiente.';
      if (item === 'vest') p.armor = 100;
      if (item === 'vesthelm') { p.armor = 100; p.helmet = true; }
      if (item === 'kit') p.kit = true;
    }
    if (econ) p.money -= price;
    this.sendInv(p);
    this.rosterDirty = true;
    return true;
  }

  sendInv(p) {
    if (p.bot) return;
    this.out.send(p.id, {
      t: 'inv', primary: p.inv.primary, secondary: p.inv.secondary, nades: [...p.inv.nades],
      ar: p.armor, hm: p.helmet, kit: p.kit, m: p.money, bomb: p.hasBomb, team: p.team,
    });
  }

  onTeam(p, team) {
    const modeTeams = this.teamMode();
    if (!modeTeams) team = team === 'spec' ? 'spec' : 'ffa';
    else {
      if (team === 'auto') team = this.smallerTeam(p);
      if (!['atk', 'def', 'spec'].includes(team)) return;
    }
    if (p.team === team && p.alive) return;
    if (p.alive) {
      if (p.hasBomb) this.dropBomb(p);
      p.alive = false;
      p.hp = 0;
    }
    p.team = team;
    p.inv = { primary: null, secondary: null, nades: [] };
    p.armor = 0; p.helmet = false; p.kit = false;
    p.respawnAt = 0;
    if (this.autoStart && team !== 'spec') {
      this.autoStart = false;
      this.out.send(p.id, { t: 'teamset', team });
      this.restartMatch();
      return;
    }
    if (team !== 'spec') {
      const midRound = this.settings.mode === 'elim' && this.phase !== 'warmup' && this.phase !== 'freeze';
      if (!midRound) {
        if (this.settings.mode === 'elim' && this.phase === 'freeze') this.spawnPlayer(p, true);
        else p.respawnAt = this.now + 600;
      }
    }
    this.out.send(p.id, { t: 'teamset', team });
    this.sendInv(p);
    this.balanceBots();
    this.rosterDirty = true;
  }

  smallerTeam(except) {
    let a = 0, d = 0;
    for (const p of this.players.values()) {
      if (p === except) continue;
      if (p.team === 'atk' && !p.bot) a++;
      if (p.team === 'def' && !p.bot) d++;
    }
    return a <= d ? 'atk' : 'def';
  }

  onDropWeapon(p, slot) {
    if (!p.alive) return;
    if (slot === 'bomb') {
      if (p.hasBomb) this.dropBomb(p, true);
      return;
    }
    if (slot !== 'primary' && slot !== 'secondary') return;
    const it = p.inv[slot];
    if (!it) return;
    p.inv[slot] = null;
    const d = dirFromAngles(p.yaw, 0);
    this.spawnDrop(it.w, p.x + d[0] * 1.2, p.y, p.z + d[2] * 1.2, 1.2);
    this.sendInv(p);
  }

  spawnDrop(w, x, y, z, delay = 0.6) {
    const id = this.uid++;
    const d = { id, w, x, y: Math.max(0, y), z, readyAt: this.now + delay * 1000 };
    this.drops.set(id, d);
    if (this.drops.size > 24) {
      const first = this.drops.keys().next().value;
      this.removeDrop(first);
    }
    this.out.broadcast({ t: 'drop+', i: id, w, p: [r2(x), r2(d.y), r2(z)] });
  }

  removeDrop(id) {
    if (!this.drops.delete(id)) return;
    this.out.broadcast({ t: 'drop-', i: id });
  }

  pickupCheck(p) {
    if (!p.alive) return;
    // bomba
    if (this.bomb.state === 'dropped' && p.team === 'atk' && this.settings.mode === 'elim' && (this.bomb.readyAt || 0) <= this.now) {
      if (Math.hypot(this.bomb.x - p.x, this.bomb.z - p.z) < 1.3 && Math.abs(this.bomb.y - p.y) < 1.5) {
        p.hasBomb = true;
        this.bomb = { state: 'carried', carrier: p.id };
        this.sendInv(p);
        this.stateDirty = true;
        this.rosterDirty = true;
      }
    }
    for (const d of this.drops.values()) {
      if (this.now < d.readyAt) continue;
      if (Math.hypot(d.x - p.x, d.z - p.z) > 1.2 || Math.abs(d.y - p.y) > 1.6) continue;
      const w = WEAPONS[d.w];
      if (!w) continue;
      if (p.inv[w.slot]) continue;
      if (w.team && this.teamMode() && w.team !== p.team && p.bot) continue;
      p.inv[w.slot] = { w: d.w, u: this.uid++ };
      this.removeDrop(d.id);
      this.sendInv(p);
      if (p.bot) p.w = d.w;
      break;
    }
  }

  // ---------------- bomba ----------------
  dropBomb(p, thrown) {
    p.hasBomb = false;
    let x = p.x, z = p.z;
    if (thrown) {
      const d = dirFromAngles(p.yaw, 0);
      const tx = p.x + d[0] * 1.5, tz = p.z + d[2] * 1.5;
      if (this.map.clearAt(tx, tz)) { x = tx; z = tz; }
    }
    this.bomb = { state: 'dropped', x, y: Math.max(0, p.y), z, readyAt: this.now + (thrown ? 1500 : 0) };
    this.sendInv(p);
    this.stateDirty = true;
    this.rosterDirty = true;
  }

  canPlant(p) {
    return p.alive && p.hasBomb && this.phase === 'live' && this.settings.mode === 'elim' &&
      ['A', 'B'].includes(this.map.zoneAt(p.x, p.z));
  }

  onPlantStart(p) {
    if (!this.canPlant(p)) return;
    p.plantStart = this.now;
    this.out.broadcast({ t: 'act', i: p.id, a: 'plant' }, p.id);
  }

  onPlant(p) {
    if (!this.canPlant(p) || !p.plantStart) return;
    if (this.now - p.plantStart < (ROUND.plantTime - 0.4) * 1000) return;
    this.doPlant(p);
  }

  doPlant(p) {
    p.hasBomb = false;
    p.plantStart = 0;
    const site = this.map.zoneAt(p.x, p.z);
    this.bomb = { state: 'planted', x: p.x, y: p.y, z: p.z, site, explodeAt: this.now + ROUND.bombTimer * 1000, planter: p.id };
    p.money = Math.min(ECON.max, p.money + ECON.plantReward);
    p.sc += 2;
    this.out.broadcast({ t: 'bomb', ev: 'planted', p: [r2(p.x), r2(p.y), r2(p.z)], site, by: p.id });
    this.sendInv(p);
    this.stateDirty = true;
    this.rosterDirty = true;
  }

  canDefuse(p) {
    return p.alive && p.team === 'def' && this.bomb.state === 'planted' && this.phase === 'live' &&
      Math.hypot(this.bomb.x - p.x, this.bomb.z - p.z) < 2.0 && Math.abs(this.bomb.y - p.y) < 1.6;
  }

  defuseTime(p) {
    return (p.kit ? ROUND.defuseKit : ROUND.defuseTime) * 1000;
  }

  onDefuseStart(p) {
    if (!this.canDefuse(p)) return;
    p.defuseStart = this.now;
    this.out.broadcast({ t: 'act', i: p.id, a: 'defuse', kit: p.kit ? 1 : 0 }, p.id);
  }

  onDefuse(p) {
    if (!this.canDefuse(p) || !p.defuseStart) return;
    if (this.now - p.defuseStart < this.defuseTime(p) - 400) return;
    this.doDefuse(p);
  }

  doDefuse(p) {
    p.defuseStart = 0;
    this.bomb.state = 'defused';
    p.money = Math.min(ECON.max, p.money + ECON.defuseReward);
    p.sc += 2;
    this.out.broadcast({ t: 'bomb', ev: 'defused', by: p.id });
    this.endRound('def', 'defuse');
  }

  explodeBomb() {
    const b = this.bomb;
    b.state = 'exploded';
    this.out.broadcast({ t: 'bomb', ev: 'exploded', p: [r2(b.x), r2(b.y), r2(b.z)] });
    for (const v of this.players.values()) {
      if (!v.alive) continue;
      const d = Math.hypot(v.x - b.x, v.y - b.y, v.z - b.z);
      const R = 20;
      if (d < R) {
        const dmg = Math.round(450 * Math.pow(1 - d / R, 1.6));
        if (dmg > 0) this.applyDamage(v, null, dmg, Math.round(dmg * 0.2), 'bomb', false);
      }
    }
    this.endRound('atk', 'bomb');
  }

  // ---------------- chat e comandos ----------------
  onChat(p, m) {
    const text = String(m.text || '').replace(/[<>]/g, '').trim().slice(0, 120);
    if (!text) return;
    const msg = { t: 'chat', i: p.id, n: p.name, team: p.team, tm: m.team ? 1 : 0, text, dead: p.alive ? 0 : 1 };
    if (m.team && this.teamMode()) {
      for (const q of this.players.values()) if (!q.bot && q.team === p.team) this.out.send(q.id, msg);
    } else this.out.broadcast(msg);
  }

  onCommand(m) {
    if (m.c === 'start') {
      this.restartMatch();
    } else if (m.c === 'settings') {
      const prevMode = this.settings.mode;
      this.settings = normalizeSettings({ ...this.settings, ...m.s });
      if (prevMode !== this.settings.mode) this.reassignTeams();
      this.out.broadcast({ t: 'settings', settings: this.settings });
      if (this.phase === 'warmup' && !m.start) {
        this.balanceBots();
        this.stateDirty = true;
      } else this.restartMatch();
    } else if (m.c === 'warmup') {
      this.enterWarmup();
    } else if (m.c === 'kick') {
      const p = this.players.get(m.i);
      if (p && !p.bot && p.id !== 'host') this.kickPlayer(p, 'pelo host');
    }
  }

  // ---------------- expulsar / votação ----------------
  kickPlayer(p, why) {
    this.banned.add(p.name.toLowerCase());
    this.out.broadcast({ t: 'msg', text: `${p.name} foi expulso ${why}.`, dur: 3 });
    this.out.send(p.id, { t: 'kicked', why });
    setTimeout(() => this.out.kick?.(p.id, `Você foi expulso ${why}.`), 1500);
    this.leave(p.id);
  }

  voters() {
    // humanos que podem votar (todos menos o alvo)
    return [...this.players.values()].filter((q) => !q.bot && q.id !== this.vote?.target);
  }

  onVoteStart(p, targetId) {
    if (p.bot) return;
    const t = this.players.get(targetId);
    const fail = (r) => this.out.send(p.id, { t: 'buyfail', r });
    if (this.vote) return fail('Já tem uma votação em andamento.');
    if (!t || t.bot || t === p) return fail('Jogador inválido.');
    if (t.id === 'host') return fail('O host não pode ser expulso por votação.');
    if (p.lastVoteAt && this.now - p.lastVoteAt < 60000) return fail('Espere um pouco para abrir outra votação.');
    p.lastVoteAt = this.now;
    this.vote = { target: t.id, tn: t.name, starter: p.id, sn: p.name, yes: new Set([p.id]), no: new Set(), endsAt: this.now + 30000 };
    this.broadcastVote();
    this.checkVote();
  }

  onVoteCast(p, yes) {
    const v = this.vote;
    if (!v || p.bot || p.id === v.target) return;
    v.yes.delete(p.id); v.no.delete(p.id);
    (yes ? v.yes : v.no).add(p.id);
    this.broadcastVote();
    this.checkVote();
  }

  voteNeed() {
    return Math.floor(this.voters().length / 2) + 1;
  }

  broadcastVote() {
    const v = this.vote;
    if (!v) return;
    const ids = new Set(this.voters().map((q) => q.id));
    const yes = [...v.yes].filter((i) => ids.has(i));
    const no = [...v.no].filter((i) => ids.has(i));
    this.out.broadcast({ t: 'vote', target: v.target, tn: v.tn, sn: v.sn, yes, no, need: this.voteNeed(), total: ids.size, rem: Math.max(0, v.endsAt - this.now) });
  }

  checkVote() {
    const v = this.vote;
    if (!v) return;
    const ids = new Set(this.voters().map((q) => q.id));
    const yes = [...v.yes].filter((i) => ids.has(i)).length;
    const no = [...v.no].filter((i) => ids.has(i)).length;
    const need = this.voteNeed();
    if (yes >= need) this.endVote(true);
    else if (no > ids.size - need) this.endVote(false);
  }

  endVote(ok, why) {
    const v = this.vote;
    if (!v) return;
    this.vote = null;
    this.out.broadcast({ t: 'voteEnd', ok: ok ? 1 : 0, tn: v.tn, why: why || '' });
    if (ok) {
      const t = this.players.get(v.target);
      if (t) this.kickPlayer(t, 'por votação');
    }
  }

  reassignTeams() {
    const teams = this.teamMode();
    let toggle = 0;
    for (const p of [...this.players.values()]) {
      if (p.bot) { this.players.delete(p.id); continue; }
      if (p.team === 'spec') continue;
      p.team = teams ? (toggle++ % 2 ? 'def' : 'atk') : 'ffa';
      this.out.send(p.id, { t: 'teamset', team: p.team });
    }
    this.rosterDirty = true;
  }

  // ---------------- bots ----------------
  balanceBots() {
    const fill = this.settings.botFill;
    const bots = [...this.players.values()].filter((p) => p.bot);
    if (this.teamMode()) {
      for (const team of ['atk', 'def']) {
        const humans = [...this.players.values()].filter((p) => !p.bot && p.team === team).length;
        const want = Math.max(0, fill - humans);
        const mine = bots.filter((b) => b.team === team);
        for (let i = mine.length; i < want; i++) this.addBot(team);
        // remove excesso (mortos primeiro)
        mine.sort((a, b) => (a.alive ? 1 : 0) - (b.alive ? 1 : 0));
        for (let i = 0; i < mine.length - want; i++) this.removeBot(mine[i]);
      }
      for (const b of bots) if (b.team !== 'atk' && b.team !== 'def') this.removeBot(b);
    } else {
      const humans = [...this.players.values()].filter((p) => !p.bot && p.team !== 'spec').length;
      const want = Math.max(0, fill - humans);
      for (let i = bots.length; i < want; i++) this.addBot('ffa');
      bots.sort((a, b) => (a.alive ? 1 : 0) - (b.alive ? 1 : 0));
      for (let i = 0; i < bots.length - want; i++) this.removeBot(bots[i]);
      for (const b of bots) if (b.team !== 'ffa' && this.players.has(b.id)) this.removeBot(b);
    }
    this.rosterDirty = true;
  }

  addBot(team) {
    const id = 'b' + ++this.botSeq;
    let name;
    for (let i = 0; i < BOT_NAMES.length; i++) {
      const n = BOT_NAMES[(this.botSeq * 7 + i) % BOT_NAMES.length];
      if (!this.usedNames.has(n)) { name = n; break; }
    }
    name = name || 'Bot ' + this.botSeq;
    this.usedNames.add(name);
    const p = this.newPlayer(id, name, true);
    p.team = team;
    p.body = new MoveBody();
    p.brain = new BotBrain(this, p, DIFFICULTY[this.settings.botDiff] || DIFFICULTY.normal);
    p.ammo = {};
    this.players.set(id, p);
    const midRound = this.settings.mode === 'elim' && this.phase !== 'warmup' && this.phase !== 'freeze';
    if (!midRound) {
      if (this.phase === 'freeze') { this.spawnPlayer(p, true); this.botBuy(p); }
      else p.respawnAt = this.now + 500;
    }
    return p;
  }

  removeBot(p) {
    if (!this.players.has(p.id)) return;
    if (p.hasBomb) this.dropBomb(p);
    this.players.delete(p.id);
    this.usedNames.delete(p.name);
  }

  botBuy(p) {
    const team = p.team;
    const pick = (list) => list[(Math.random() * list.length) | 0];
    const allowed = (w) => !(this.teamMode() && WEAPONS[w].team && WEAPONS[w].team !== team);
    if (!this.isEcon()) {
      // modos sem economia: arma aleatória
      const opts = ['k47', 't4', 'pardal', 'sabia', 'coruja', 'ferrao', 'corisco', 'siri', 'trovao', 'bigorna', 'gaviao', 'andorinha', 'urubu', 'sucuri', 'k47', 't4'].filter(allowed);
      this.buy(p, pick(opts), true);
      this.buy(p, 'vesthelm', true);
      if (Math.random() < 0.4) this.buy(p, 'he', true);
      return;
    }
    const rifle = team === 'atk' ? 'k47' : 't4';
    const cheapRifle = team === 'atk' ? 'pardal' : 'sabia';
    const tryBuy = (item) => {
      let price = (WEAPONS[item] || NADES[item] || GEAR[item]).price;
      if (item === 'vesthelm' && p.armor >= 100) price = 350;
      if (p.money < price) return false;
      if (this.buy(p, item, true) !== true) return false;
      p.money -= price;
      return true;
    };
    if (!p.inv.primary) {
      const m = p.money;
      const r = Math.random();
      if (m >= 6000 && r < 0.12) tryBuy('gaviao');
      else if (m >= 6000 && r < 0.18) tryBuy('urubu');
      else if (m >= 6200 && r < 0.22) tryBuy('sucuri');
      else if (m >= WEAPONS[rifle].price + 1000) tryBuy(r < 0.82 ? rifle : 'coruja');
      else if (m >= 2800 && r < 0.6) tryBuy(cheapRifle);
      else if (m >= 2700 && r < 0.75) tryBuy('andorinha');
      else if (m >= 3300 && r < 0.85) tryBuy('corisco');
      else if (m >= 1900) tryBuy(pick(['ferrao', 'siri', 'trovao', 'ferrao']));
    }
    if (p.armor < 100 || !p.helmet) { if (!tryBuy('vesthelm') && p.armor < 100) tryBuy('vest'); }
    if (team === 'def' && !p.kit && Math.random() < 0.5) tryBuy('kit');
    if (!p.inv.primary && p.inv.secondary?.w === 'p9' && Math.random() < 0.6) tryBuy(pick(['lince', 'coral', 'marimbondo']));
    if (p.money >= 300 && Math.random() < 0.5) tryBuy('he');
  }

  // ---------------- ciclo de partida ----------------
  enterWarmup() {
    this.phase = 'warmup';
    this.phaseEnds = 0;
    this.bomb = { state: 'none' };
    this.clearWorld();
    for (const p of this.players.values()) {
      p.k = p.d = p.a = p.sc = 0;
      p.money = ECON.max;
      if (p.team !== 'spec') p.respawnAt = this.now + 300;
      p.alive = false;
    }
    this.balanceBots();
    this.stateDirty = true;
    this.rosterDirty = true;
    this.out.broadcast({ t: 'msg', text: 'Aquecimento: o host inicia a partida no menu (Esc).', dur: 5 });
  }

  clearWorld() {
    for (const id of [...this.drops.keys()]) this.removeDrop(id);
    this.nades.clear();
    this.smokes = [];
    this.fires = [];
    this.out.broadcast({ t: 'clear' });
  }

  restartMatch() {
    this.score = { atk: 0, def: 0 };
    this.kills = { atk: 0, def: 0 };
    this.lossStreak = { atk: 0, def: 0 };
    this.round = 0;
    this.balanceBots();
    for (const p of this.players.values()) {
      p.k = p.d = p.a = p.sc = 0;
      p.inv = { primary: null, secondary: null, nades: [] };
      p.armor = 0; p.helmet = false; p.kit = false; p.hasBomb = false;
      p.loadout = null;
      p.alive = false;
    }
    this.clearWorld();
    this.out.broadcast({ t: 'matchStart', mode: this.settings.mode });
    if (this.settings.mode === 'elim') {
      this.phase = 'live';
      for (const p of this.players.values()) p.money = ECON.start;
      this.startRound();
    } else {
      this.phase = 'live';
      this.phaseEnds = this.now + this.settings.timeLimit * 60000;
      for (const p of this.players.values()) {
        p.money = ECON.max;
        if (p.team !== 'spec') this.spawnPlayer(p, true);
      }
      this.stateDirty = true;
    }
    this.rosterDirty = true;
  }

  halfRounds() {
    return this.settings.roundsToWin - 1;
  }

  startRound() {
    // troca de lados no meio
    if (this.round === this.halfRounds() && this.round > 0) this.swapSides();
    this.round++;
    this.clearWorld();
    this.balanceBots();
    this.bomb = { state: 'none' };
    this.roundSite = null;
    this.phase = 'freeze';
    this.phaseEnds = this.now + ROUND.freeze * 1000;
    const atk = [];
    for (const p of this.players.values()) {
      if (p.team !== 'atk' && p.team !== 'def') continue;
      const survived = p.alive;
      p.hasBomb = false;
      if (!survived) {
        p.inv = { primary: null, secondary: null, nades: [] };
        p.armor = 0; p.helmet = false; p.kit = false;
      }
      this.spawnPlayer(p, survived);
      if (p.team === 'atk') atk.push(p);
    }
    if (atk.length) {
      const humans = atk.filter((p) => !p.bot);
      const pool = humans.length && Math.random() < 0.6 ? humans : atk;
      const c = pool[(Math.random() * pool.length) | 0];
      c.hasBomb = true;
      this.bomb = { state: 'carried', carrier: c.id };
      this.sendInv(c);
    }
    for (const p of this.players.values()) if (p.bot && p.alive) this.botBuy(p);
    for (const p of this.players.values()) if (p.brain) p.brain.onRoundStart();
    this.out.broadcast({ t: 'roundStart', round: this.round });
    this.stateDirty = true;
    this.rosterDirty = true;
  }

  swapSides() {
    for (const p of this.players.values()) {
      if (p.team === 'atk') p.team = 'def';
      else if (p.team === 'def') p.team = 'atk';
      else continue;
      p.money = ECON.start;
      p.inv = { primary: null, secondary: null, nades: [] };
      p.armor = 0; p.helmet = false; p.kit = false;
      p.alive = false;
      this.out.send(p.id, { t: 'teamset', team: p.team });
    }
    this.score = { atk: this.score.def, def: this.score.atk };
    this.lossStreak = { atk: 0, def: 0 };
    this.out.broadcast({ t: 'msg', text: 'Fim do primeiro tempo — troca de lados!', dur: 5 });
  }

  spawnPlayer(p, keepInv) {
    let pt, yaw;
    const mode = this.settings.mode;
    if (mode === 'elim' || (this.phase === 'warmup' && this.teamMode())) {
      const list = this.map.spawns[p.team === 'atk' ? 'atk' : 'def'];
      const used = [...this.players.values()].filter((q) => q.alive && q !== p);
      let tries = 0;
      do {
        pt = list[(Math.random() * list.length) | 0];
        tries++;
      } while (tries < 30 && used.some((q) => Math.hypot(q.x - pt[0], q.z - pt[1]) < 1.2));
      yaw = p.team === 'atk' ? -Math.PI / 2 : Math.PI / 2;
    } else {
      pt = this.safeSpawn(p);
      yaw = Math.atan2(pt[0], pt[1]); // olhando para o centro do mapa
    }
    const x = pt[0] + (Math.random() - 0.5) * 0.6, z = pt[1] + (Math.random() - 0.5) * 0.6;
    p.x = x; p.y = 0; p.z = z; p.yaw = yaw; p.pitch = 0; p.crouch = 0;
    p.alive = true;
    p.hp = 100;
    p.respawnAt = 0;
    p.spawnTime = this.now;
    p.spawnSeq++;
    p.dmgBy.clear();
    p.plantStart = 0;
    p.defuseStart = 0;
    p.blindUntil = 0;
    if (mode !== 'elim' || this.phase === 'warmup') p.protUntil = this.now + ROUND.spawnProtect * 1000;
    if (!keepInv || !p.inv) p.inv = { primary: null, secondary: null, nades: [] };
    if (!p.inv.secondary) p.inv.secondary = { w: 'p9', u: this.uid++ };
    if (!this.isEcon()) {
      // modos livres: colete grátis + último kit
      p.armor = 100; p.helmet = true;
      if (!p.bot) {
        // último kit escolhido (ou um fuzil padrão)
        const lo = p.loadout || {};
        let prim = lo.primary || (this.teamMode() && p.team === 'def' ? 't4' : 'k47');
        const pw = WEAPONS[prim];
        if (pw && pw.team && this.teamMode() && pw.team !== p.team) prim = p.team === 'def' ? 't4' : 'k47';
        if (!keepInv || !p.inv.primary) p.inv.primary = { w: prim, u: this.uid++ };
        if (lo.secondary) p.inv.secondary = { w: lo.secondary, u: this.uid++ };
        // granadas: as últimas escolhidas, ou luz + fumaça
        p.inv.nades = lo.nades ? [...lo.nades] : ['flash', 'smoke'];
      }
      if (p.bot) this.botBuy(p);
    }
    p.w = p.inv.primary?.w || p.inv.secondary?.w || 'knife';
    if (p.body) {
      p.body.setPos(x, 0, z);
      p.body.crouching = false;
      p.body.crouch = 0;
    }
    if (p.bot) {
      p.ammo = {};
      if (p.brain) p.brain.onSpawn();
    } else {
      this.sendInv(p);
      this.out.send(p.id, { t: 'spawn', p: [r3(x), 0, r3(z)], yaw: r3(yaw), sq: p.spawnSeq, hp: 100 });
    }
    this.rosterDirty = true;
  }

  safeSpawn(p) {
    const enemies = [...this.players.values()].filter((q) => q.alive && this.isEnemy(p, q));
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < 28; i++) {
      const pt = this.map.randomNavPoint();
      let minD = 60;
      let seen = false;
      for (const e of enemies) {
        const d = Math.hypot(e.x - pt[0], e.z - pt[1]);
        minD = Math.min(minD, d);
        if (d < 40 && this.map.los(e.x, e.y + 1.6, e.z, pt[0], 1.6, pt[1])) seen = true;
      }
      const score = Math.min(minD, 30) - (seen ? 40 : 0) + Math.random() * 4;
      if (score > bestScore) { bestScore = score; best = pt; }
    }
    return best;
  }

  endRound(winner, reason) {
    if (this.phase !== 'live' && this.phase !== 'freeze') return;
    this.phase = 'roundEnd';
    this.phaseEnds = this.now + ROUND.end * 1000;
    this.score[winner]++;
    const loser = winner === 'atk' ? 'def' : 'atk';
    const winMoney = reason === 'bomb' ? ECON.winBomb : reason === 'defuse' ? ECON.winDefuse : ECON.win;
    const lossMoney = Math.min(ECON.lossMax, ECON.loss + ECON.lossStep * this.lossStreak[loser]);
    const planted = this.bomb.state === 'planted' || this.bomb.state === 'defused' || this.bomb.state === 'exploded';
    for (const p of this.players.values()) {
      if (p.team === winner) p.money += winMoney;
      else if (p.team === loser) p.money += lossMoney + (loser === 'atk' && planted ? ECON.plantBonus : 0);
      p.money = Math.min(ECON.max, p.money);
      p.plantStart = 0;
      p.defuseStart = 0;
      if (!p.bot) this.sendInv(p);
    }
    this.lossStreak[loser] = Math.min(4, this.lossStreak[loser] + 1);
    this.lossStreak[winner] = Math.max(0, this.lossStreak[winner] - 1);
    this.out.broadcast({ t: 'roundEnd', winner, reason, score: { ...this.score } });
    this.stateDirty = true;
    this.rosterDirty = true;
  }

  endMatch(winner) {
    this.phase = 'matchEnd';
    this.phaseEnds = this.now + ROUND.matchEnd * 1000;
    this.out.broadcast({ t: 'matchEnd', winner });
    this.stateDirty = true;
  }

  // ---------------- tick ----------------
  update(dtMs) {
    this.now = performance.now();
    const dt = Math.min(0.25, dtMs / 1000);
    while (this.inbox.length) {
      const [id, m] = this.inbox.shift();
      try { this.handle(id, m); } catch (e) { console.error('server handle', m?.t, e); }
    }

    this.tickPhase();
    if (this.vote && this.now >= this.vote.endsAt) this.endVote(false, 'tempo');

    // renascimentos
    for (const p of this.players.values()) {
      if (!p.alive && p.respawnAt && this.now >= p.respawnAt && p.team !== 'spec') {
        if (this.phase === 'warmup' || (this.settings.mode !== 'elim' && this.phase === 'live')) this.spawnPlayer(p, false);
        else p.respawnAt = 0;
      }
    }

    // bots (em sub-passos, para não ficarem lentos se o host estiver com FPS baixo)
    const steps = Math.min(8, Math.max(1, Math.ceil(dt / (1 / 50))));
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      for (const p of this.players.values()) {
        if (!p.bot || !p.alive) continue;
        p.brain.update(sdt);
        p.x = p.body.x; p.y = p.body.y; p.z = p.body.z;
        p.crouch = p.body.crouch;
        this.pickupCheck(p);
      }
    }

    // plantio/desarme dos bots
    for (const p of this.players.values()) {
      if (!p.bot || !p.alive) continue;
      if (p.plantStart && this.now - p.plantStart >= ROUND.plantTime * 1000) {
        if (this.canPlant(p)) this.doPlant(p); else p.plantStart = 0;
      }
      if (p.defuseStart && this.now - p.defuseStart >= this.defuseTime(p)) {
        if (this.canDefuse(p)) this.doDefuse(p); else p.defuseStart = 0;
      }
    }

    // granadas
    this.nadeAcc += dt;
    while (this.nadeAcc >= NADE_DT) {
      this.nadeAcc -= NADE_DT;
      for (const n of this.nades.values()) {
        nadeStep(this.map, n);
        if (nadeShouldDetonate(n, NADES[n.type].fuse)) this.detonate(n);
      }
    }
    this.smokes = this.smokes.filter((s) => s.until > this.now);
    this.fires = this.fires.filter((f) => f.until > this.now);
    this.fireTick += dt;
    if (this.fireTick >= 0.25 && this.fires.length) {
      this.fireTick = 0;
      for (const f of this.fires) {
        const owner = this.players.get(f.owner);
        for (const v of this.players.values()) {
          if (!v.alive) continue;
          if (owner && v !== owner && !this.isEnemy(owner, v)) continue;
          if (Math.hypot(v.x - f.x, v.z - f.z) > f.r || Math.abs(v.y - f.y) > 1.3) continue;
          this.applyDamage(v, owner, 9, 0, 'molotov', false);
          if (v.brain) v.brain.onDamaged(owner || v);
        }
      }
    } else if (!this.fires.length) this.fireTick = 0;
    this.noises = this.noises.filter((n) => this.now - n.time < 3000);

    // rede
    this.snapAcc += dt;
    if (this.snapAcc >= 1 / SNAP_RATE) {
      this.snapAcc %= 1 / SNAP_RATE;
      this.sendSnapshot();
    }
    this.rosterAcc += dt;
    if (this.rosterDirty && this.rosterAcc > 0.25) {
      this.rosterAcc = 0;
      this.rosterDirty = false;
      this.sendRoster();
    }
    this.stateAcc += dt;
    if (this.stateDirty || this.stateAcc > 1) {
      this.stateAcc = 0;
      this.stateDirty = false;
      this.sendState();
    }
  }

  tickPhase() {
    const mode = this.settings.mode;
    if (this.phase === 'warmup') return;
    if (this.phase === 'matchEnd') {
      if (this.now >= this.phaseEnds) this.restartMatch();
      return;
    }
    if (mode !== 'elim') {
      if (this.phase === 'live' && this.now >= this.phaseEnds) {
        if (mode === 'tdm') {
          const w = this.kills.atk === this.kills.def ? 'draw' : this.kills.atk > this.kills.def ? 'atk' : 'def';
          this.endMatch(w);
        } else {
          let best = null;
          for (const p of this.players.values()) if (p.team === 'ffa' && (!best || p.k > best.k)) best = p;
          this.endMatch(best ? best.id : 'draw');
        }
      }
      return;
    }
    // mata-mata
    if (this.phase === 'freeze') {
      if (this.now >= this.phaseEnds) {
        this.phase = 'live';
        this.liveStart = this.now;
        this.phaseEnds = this.now + ROUND.live * 1000;
        this.stateDirty = true;
        this.out.broadcast({ t: 'live' });
      }
      return;
    }
    if (this.phase === 'roundEnd') {
      if (this.now >= this.phaseEnds) {
        const max = this.halfRounds() * 2;
        if (this.score.atk >= this.settings.roundsToWin || this.score.def >= this.settings.roundsToWin) {
          // vencedor pelo time em que o jogador está agora
          this.endMatch(this.score.atk > this.score.def ? 'atk' : 'def');
        } else if (this.round >= max) {
          this.endMatch(this.score.atk === this.score.def ? 'draw' : this.score.atk > this.score.def ? 'atk' : 'def');
        } else this.startRound();
      }
      return;
    }
    if (this.phase !== 'live') return;
    let atkTotal = 0, defTotal = 0, atkAlive = 0, defAlive = 0;
    for (const p of this.players.values()) {
      if (p.team === 'atk') { atkTotal++; if (p.alive) atkAlive++; }
      if (p.team === 'def') { defTotal++; if (p.alive) defAlive++; }
    }
    const b = this.bomb;
    if (b.state === 'planted') {
      if (this.now >= b.explodeAt) return this.explodeBomb();
      if (defTotal > 0 && defAlive === 0) return this.endRound('atk', 'elim');
    } else {
      if (atkTotal > 0 && atkAlive === 0) return this.endRound('def', 'elim');
      if (defTotal > 0 && defAlive === 0) return this.endRound('atk', 'elim');
      if (this.now >= this.phaseEnds) return this.endRound('def', 'time');
    }
  }

  detonate(n) {
    this.nades.delete(n.id);
    const owner = this.players.get(n.owner);
    this.out.broadcast({ t: 'boom', i: n.id, type: n.type, p: [r2(n.x), r2(n.y), r2(n.z)] });
    if (n.type === 'he') {
      const R = 7;
      for (const v of this.players.values()) {
        if (!v.alive) continue;
        if (owner && v !== owner && !this.isEnemy(owner, v)) continue;
        const cy = v.y + 1.0;
        const d = Math.hypot(v.x - n.x, cy - n.y, v.z - n.z);
        if (d > R) continue;
        if (!this.map.los(n.x, n.y + 0.1, n.z, v.x, cy, v.z) && !this.map.los(n.x, n.y + 0.1, n.z, v.x, v.y + 1.6, v.z)) continue;
        let dmg = 98 * Math.pow(1 - d / R, 1.2);
        let armorLoss = 0;
        if (v.armor > 0) { armorLoss = dmg * 0.25; dmg *= 0.5; }
        if (dmg >= 1) this.applyDamage(v, owner, Math.round(dmg), Math.round(armorLoss), 'he', false);
      }
    } else if (n.type === 'flash') {
      for (const v of this.players.values()) {
        if (!v.alive || !v.bot) continue;
        const ey = v.y + eyeHeight(v.crouch);
        const dx = n.x - v.x, dy = n.y - ey, dz = n.z - v.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > 30 || !this.map.los(v.x, ey, v.z, n.x, n.y + 0.05, n.z)) continue;
        const f = dirFromAngles(v.yaw, v.pitch);
        const dot = (f[0] * dx + f[1] * dy + f[2] * dz) / d;
        const dur = (dot > 0.3 ? 3.2 : dot > -0.2 ? 1.6 : 0.5) * (1 - d / 40);
        v.blindUntil = Math.max(v.blindUntil, this.now + dur * 1000);
      }
    } else if (n.type === 'smoke') {
      this.smokes.push({ x: n.x, y: n.y + 1.2, z: n.z, r: 4.3, start: this.now, until: this.now + 18000 });
      // fumaça apaga o fogo
      for (const f of this.fires) {
        if (Math.hypot(f.x - n.x, f.z - n.z) < f.r + 3.5) { f.until = this.now; this.out.broadcast({ t: 'fireOut', i: f.id }); }
      }
    } else if (n.type === 'molotov') {
      const inSmoke = this.smokes.some((s) => Math.hypot(s.x - n.x, s.z - n.z) < s.r + 1);
      if (!inSmoke) {
        const y = Math.max(0, n.y - 0.08);
        this.fires.push({ id: n.id, x: n.x, y, z: n.z, r: 3.2, until: this.now + 7000, owner: n.owner });
      } else this.out.broadcast({ t: 'fireOut', i: n.id });
    }
  }

  smokeBlocks(ax, ay, az, bx, by, bz) {
    for (const s of this.smokes) {
      if (this.now - s.start < 700) continue;
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const L2 = dx * dx + dy * dy + dz * dz || 1;
      let t = ((s.x - ax) * dx + (s.y - ay) * dy + (s.z - az) * dz) / L2;
      t = Math.max(0, Math.min(1, t));
      const px = ax + dx * t - s.x, py = ay + dy * t - s.y, pz = az + dz * t - s.z;
      if (px * px + py * py + pz * pz < s.r * s.r) return true;
    }
    return false;
  }

  sendSnapshot() {
    const e = [];
    for (const p of this.players.values()) {
      if (p.team === 'spec') continue;
      let flags = p.alive ? 1 : 0;
      if (p.plantStart || p.defuseStart) flags |= 4;
      if (p.scoped) flags |= 8;
      if (p.bot ? p.brain.loud : p.moving) flags |= 16;
      e.push([p.id, r2(p.x), r2(p.y), r2(p.z), r3(p.yaw), r3(p.pitch), r2(p.crouch), flags, WLIST.indexOf(p.w)]);
    }
    this.out.broadcast({ t: 'snap', e });
  }

  sendRoster() {
    const list = [];
    for (const p of this.players.values()) {
      list.push({
        i: p.id, n: p.name, t: p.team, hp: p.hp, ar: p.armor, hm: p.helmet ? 1 : 0, kit: p.kit ? 1 : 0,
        m: p.money, k: p.k, d: p.d, a: p.a, sc: p.sc, al: p.alive ? 1 : 0, b: p.bot ? 1 : 0,
        bo: p.hasBomb ? 1 : 0, pi: p.bot ? 0 : p.ping,
      });
    }
    this.out.broadcast({ t: 'roster', p: list });
  }

  sendState() {
    const b = this.bomb;
    const bomb = { s: b.state };
    if (b.state === 'planted') {
      bomb.p = [r2(b.x), r2(b.y), r2(b.z)];
      bomb.site = b.site;
      bomb.rem = Math.max(0, b.explodeAt - this.now);
    } else if (b.state === 'dropped') {
      bomb.p = [r2(b.x), r2(b.y), r2(b.z)];
    } else if (b.state === 'carried') bomb.c = b.carrier;
    this.out.broadcast({
      t: 'state', mode: this.settings.mode, phase: this.phase,
      rem: this.phaseEnds ? Math.max(0, this.phaseEnds - this.now) : 0,
      buyRem: this.phase === 'freeze' ? Math.max(0, this.phaseEnds - this.now) + ROUND.buyTime * 1000
        : this.phase === 'live' ? Math.max(0, ROUND.buyTime * 1000 - (this.now - this.liveStart)) : 0,
      round: this.round, score: this.score, kills: this.kills, bomb, settings: this.settings,
      maxRounds: this.halfRounds() * 2,
    });
  }
}

export function normalizeSettings(s) {
  const mode = MODES[s.mode] ? s.mode : 'elim';
  const botFillMax = mode === 'ffa' ? 12 : 6;
  return {
    mode,
    botFill: Math.max(0, Math.min(botFillMax, Number(s.botFill ?? 4))),
    botDiff: DIFFICULTY[s.botDiff] ? s.botDiff : 'normal',
    roundsToWin: [3, 5, 8, 13].includes(Number(s.roundsToWin)) ? Number(s.roundsToWin) : 8,
    killLimit: Math.max(5, Math.min(200, Number(s.killLimit) || (mode === 'ffa' ? 25 : 50))),
    timeLimit: Math.max(2, Math.min(30, Number(s.timeLimit) || 10)),
    maxPlayers: Math.max(2, Math.min(16, Number(s.maxPlayers) || 10)),
    offline: !!s.offline,
  };
}
