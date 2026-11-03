// Cliente do jogo: renderização, entrada, arma local, interpolação dos outros jogadores, HUD e som.
import * as THREE from 'three';
import { GameMap } from './map.js';
import { buildMapMeshes, buildSky } from './render-map.js';
import {
  MoveBody, rayEntity, nadeStep, nadeShouldDetonate, NADE_DT, dirFromAngles, spreadDir, eyeHeight, anglesTo,
} from './physics.js';
import { WEAPONS, NADES, PLAYER, ROUND, TEAMS, MODES, INTERP_DELAY, SEND_RATE } from './config.js';
import { Avatar } from './avatar.js';
import { ViewModel } from './viewmodel.js';
import { Effects } from './effects.js';
import * as SFX from './audio.js';
import { WLIST } from './server.js';

const DEG = Math.PI / 180;
const SLOT_KEYS = { Digit1: 'primary', Digit2: 'secondary', Digit3: 'knife', Digit4: 'nade', Digit5: 'bomb' };

export class GameClient {
  constructor({ canvas, hud, send, settings, callbacks }) {
    this.canvas = canvas;
    this.hud = hud;
    this.sendFn = send;
    this.cb = callbacks || {};
    this.opts = settings; // configurações locais (sensibilidade, fov, volume, mira)
    this.inbox = [];
    this.interpDelay = INTERP_DELAY;
    this.map = new GameMap();
    this.running = false;

    // ---- render ----
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.autoClear = false;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xe3d2b4, 70, 240);
    this.camera = new THREE.PerspectiveCamera(this.opts.fov || 74, 1, 0.05, 900);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    const hemi = new THREE.HemisphereLight(0xcfe2ff, 0x9a7a52, 1.15);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
    sun.position.set(36, 60, 26);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -48; sc.right = 48; sc.top = 40; sc.bottom = -40; sc.near = 10; sc.far = 160;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    this.scene.add(sun.target);
    buildSky(this.scene);
    buildMapMeshes(this.map, this.scene);
    this.fx = new Effects(this.scene);
    this.vm = new ViewModel();

    // ---- estado ----
    this.body = new MoveBody();
    this.yaw = 0;
    this.pitch = 0;
    this.me = {
      id: null, name: '', team: 'spec', alive: false, hp: 0, armor: 0, helmet: false, kit: false, money: 0,
      inv: { primary: null, secondary: null, nades: [] }, hasBomb: false, spawnSeq: 0,
    };
    this.slot = 'knife';
    this.lastSlot = 'secondary';
    this.nadeSel = null;
    this.ammo = new Map();
    this.ents = new Map();
    this.roster = new Map();
    this.state = { phase: 'warmup', mode: settings.mode || 'elim', round: 0, score: { atk: 0, def: 0 }, kills: { atk: 0, def: 0 }, bomb: { s: 'none' }, settings: {} };
    this.phaseEndsAt = 0;
    this.buyEndsAt = 0;
    this.bombEndsAt = 0;
    this.nextBeep = 0;
    this.nades = new Map();
    this.nadeAcc = 0;

    // arma
    this.nextFire = 0;
    this.drawUntil = 0;
    this.reloadUntil = 0;
    this.reloadStage = 0;
    this.reloadW = null;
    this.recoilP = 0;
    this.recoilY = 0;
    this.spray = 0;
    this.lastShot = 0;
    this.scope = 0;
    this.shake = 0;
    this.punchP = 0;

    // ações
    this.action = null;
    this.deathAt = 0;
    this.killerId = null;
    this.deathPos = null;
    this.specIdx = 0;
    this.specId = null;
    this.blindUntil = 0;
    this.blindStart = 0;
    this.spotted = new Map();
    this.spotAt = 0;
    this.stepDist = 0;
    this.wasGround = true;
    this.lastPing = 0;
    this.pingAt = 0;
    this.sendAcc = 0;

    // entrada
    this.keys = {};
    this.mouse = { left: false, right: false, leftEdge: false, rightEdge: false };
    this.lookDX = 0;
    this.lookDY = 0;
    this.locked = false;
    this.ui = { buy: false, chat: false, score: false, pause: false, team: false };
    this._bind();
    this._resize();
  }

  // ---------------- API ----------------
  receive(msg) { this.inbox.push(msg); }
  send(msg) { this.sendFn(msg); }

  // aba escondida (host): processa mensagens sem renderizar
  pumpHidden() {
    while (this.inbox.length) {
      const m = this.inbox.shift();
      if (m.t === 'snap') {
        this.onSnap(m, performance.now());
        continue;
      }
      try { this.handle(m); } catch (e) { /* ignora */ }
    }
  }

  start() {
    this.running = true;
    this.last = performance.now();
    const loop = (t) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.frame(t);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this._unbind();
    if (document.pointerLockElement) document.exitPointerLock();
    this.renderer.dispose();
  }

  applyOptions(opts) {
    this.opts = { ...this.opts, ...opts };
    SFX.setVolume(this.opts.volume);
    this.hud.setCrosshairStyle(this.opts);
  }

  lock() {
    if (this.ui.buy || this.ui.chat || this.ui.team) return;
    try {
      const r = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (r && r.catch) r.catch(() => { try { this.canvas.requestPointerLock(); } catch (e) { /* ignora */ } });
    } catch (e) {
      try { this.canvas.requestPointerLock(); } catch (e2) { /* ignora */ }
    }
  }

  // ---------------- entrada ----------------
  _bind() {
    this._h = {
      keydown: (e) => this._key(e, true),
      keyup: (e) => this._key(e, false),
      mousemove: (e) => {
        if (!this.locked) return;
        const zoomMul = this.scope ? (this.camera.fov / (this.opts.fov || 74)) : 1;
        const s = 0.0022 * (this.opts.sens || 1) * zoomMul;
        let mx = e.movementX || 0, my = e.movementY || 0;
        if (Math.abs(mx) > 400 || Math.abs(my) > 400) return; // salto espúrio do navegador
        this.yaw -= mx * s;
        this.pitch -= my * s * (this.opts.invert ? -1 : 1);
        this.pitch = Math.max(-89 * DEG, Math.min(89 * DEG, this.pitch));
        this.lookDX += mx; this.lookDY += my;
      },
      mousedown: (e) => {
        if (!this.locked) return;
        if (e.button === 0) { this.mouse.left = true; this.mouse.leftEdge = true; }
        if (e.button === 2) { this.mouse.right = true; this.mouse.rightEdge = true; }
      },
      mouseup: (e) => {
        if (e.button === 0) this.mouse.left = false;
        if (e.button === 2) this.mouse.right = false;
      },
      wheel: (e) => {
        if (!this.locked) return;
        this.cycleWeapon(e.deltaY > 0 ? 1 : -1);
      },
      contextmenu: (e) => e.preventDefault(),
      plc: () => {
        const was = this.locked;
        this.locked = document.pointerLockElement === this.canvas;
        if (was && !this.locked) {
          this.keys = {};
          this.mouse.left = this.mouse.right = false;
          if (!this.ui.buy && !this.ui.chat && !this.ui.team) this.cb.onPause?.();
        }
      },
      click: () => {
        if (!this.locked && !this.ui.pause && !this.ui.buy && !this.ui.team) this.lock();
      },
      resize: () => this._resize(),
      blur: () => { this.keys = {}; this.mouse.left = this.mouse.right = false; },
    };
    window.addEventListener('keydown', this._h.keydown);
    window.addEventListener('keyup', this._h.keyup);
    document.addEventListener('mousemove', this._h.mousemove);
    document.addEventListener('mousedown', this._h.mousedown);
    document.addEventListener('mouseup', this._h.mouseup);
    document.addEventListener('wheel', this._h.wheel, { passive: true });
    document.addEventListener('contextmenu', this._h.contextmenu);
    document.addEventListener('pointerlockchange', this._h.plc);
    this.canvas.addEventListener('click', this._h.click);
    window.addEventListener('resize', this._h.resize);
    window.addEventListener('blur', this._h.blur);
  }

  _unbind() {
    window.removeEventListener('keydown', this._h.keydown);
    window.removeEventListener('keyup', this._h.keyup);
    document.removeEventListener('mousemove', this._h.mousemove);
    document.removeEventListener('mousedown', this._h.mousedown);
    document.removeEventListener('mouseup', this._h.mouseup);
    document.removeEventListener('wheel', this._h.wheel);
    document.removeEventListener('contextmenu', this._h.contextmenu);
    document.removeEventListener('pointerlockchange', this._h.plc);
    this.canvas.removeEventListener('click', this._h.click);
    window.removeEventListener('resize', this._h.resize);
    window.removeEventListener('blur', this._h.blur);
  }

  _key(e, down) {
    if (this.ui.chat) {
      if (down && e.code === 'Escape') this.closeChat();
      return; // o input do chat cuida do resto
    }
    if (this.ui.pause) return;
    const code = e.code;
    if (code === 'Tab') {
      e.preventDefault();
      this.ui.score = down;
      this.hud.showScoreboard(down);
      return;
    }
    if (!down) {
      this.keys[code] = false;
      return;
    }
    if (e.repeat && this.keys[code]) return;
    if (code === 'KeyB') {
      e.preventDefault();
      this.toggleBuy();
      return;
    }
    if (this.ui.buy) {
      // atalhos numéricos no menu de compra
      if (code.startsWith('Digit')) this.hud.buyHotkey(Number(code.slice(5)));
      if (code === 'Escape') this.toggleBuy(false);
      return;
    }
    if (this.ui.team) return;
    if (code === 'KeyY' || code === 'KeyU') {
      e.preventDefault();
      this.openChat(code === 'KeyU');
      return;
    }
    if (!this.locked) return;
    this.keys[code] = true;
    if (['Space', 'ControlLeft', 'ControlRight'].includes(code)) e.preventDefault();
    if (SLOT_KEYS[code]) this.equip(SLOT_KEYS[code]);
    if (code === 'KeyQ') this.equip(this.lastSlot);
    if (code === 'KeyR') this.startReload();
    if (code === 'KeyG') this.dropCurrent();
  }

  toggleBuy(force) {
    const open = force ?? !this.ui.buy;
    if (open) {
      if (!this.me.alive) return;
      this.ui.buy = true;
      this.hud.showBuy(true, this.buyContext());
      if (document.pointerLockElement) document.exitPointerLock();
    } else {
      this.ui.buy = false;
      this.hud.showBuy(false);
      this.lock();
    }
  }

  buyContext() {
    const team = this.me.team;
    return {
      money: this.me.money,
      econ: this.state.mode === 'elim' && this.state.phase !== 'warmup',
      team: MODES[this.state.mode]?.teams ? team : null,
      owned: {
        primary: this.me.inv.primary?.w, secondary: this.me.inv.secondary?.w, nades: this.me.inv.nades,
        armor: this.me.armor, helmet: this.me.helmet, kit: this.me.kit,
      },
      canBuy: this.canBuyHere(),
      elim: this.state.mode === 'elim',
    };
  }

  canBuyHere() {
    if (!this.me.alive) return false;
    const st = this.state;
    if (st.phase === 'warmup') return true;
    if (st.mode === 'elim') {
      const z = this.map.zoneAt(this.body.x, this.body.z);
      if (z !== (this.me.team === 'atk' ? 'T' : 'D')) return false;
      return performance.now() < this.buyEndsAt;
    }
    return performance.now() - this.spawnAt < ROUND.tdmBuyWindow * 1000;
  }

  buy(item) {
    this.send({ t: 'buy', i: item });
  }

  openChat(team) {
    this.ui.chat = true;
    this.keys = {};
    this.hud.openChat(team, (text) => {
      if (text) this.send({ t: 'chat', text, team: team ? 1 : 0 });
      this.closeChat();
    });
  }

  closeChat() {
    this.ui.chat = false;
    this.hud.closeChat();
  }

  // ---------------- armas ----------------
  weaponIn(slot) {
    const inv = this.me.inv;
    if (slot === 'primary') return inv.primary?.w || null;
    if (slot === 'secondary') return inv.secondary?.w || null;
    if (slot === 'knife') return 'knife';
    if (slot === 'nade') {
      if (!inv.nades.length) return null;
      if (!this.nadeSel || !inv.nades.includes(this.nadeSel)) this.nadeSel = inv.nades[0];
      return this.nadeSel;
    }
    if (slot === 'bomb') return this.me.hasBomb ? 'bomb' : null;
    return null;
  }

  currentWeapon() {
    return this.weaponIn(this.slot) || 'knife';
  }

  kindOf(id) {
    if (WEAPONS[id]) return WEAPONS[id].kind;
    if (NADES[id]) return 'nade';
    if (id === 'bomb') return 'bomb';
    return 'knife';
  }

  equip(slot, force = false) {
    if (slot === 'nade' && this.slot === 'nade' && this.me.inv.nades.length > 1) {
      // ciclar granadas
      const list = this.me.inv.nades;
      this.nadeSel = list[(list.indexOf(this.nadeSel) + 1) % list.length];
      force = true;
    }
    const w = this.weaponIn(slot);
    if (!w) return;
    if (slot === this.slot && !force) return;
    if (slot !== this.slot) this.lastSlot = this.slot;
    this.slot = slot;
    this.cancelReload();
    this.scope = 0;
    const W = WEAPONS[w];
    this.drawUntil = performance.now() + (W ? W.draw : 0.4) * 1000;
    this.vm.setWeapon(w, this.kindOf(w));
    this.spray = 0;
    SFX.playDraw();
  }

  bestSlot() {
    if (this.me.inv.primary) return 'primary';
    if (this.me.inv.secondary) return 'secondary';
    return 'knife';
  }

  cycleWeapon(dir) {
    const order = ['primary', 'secondary', 'knife', 'nade', 'bomb'].filter((s) => this.weaponIn(s));
    if (!order.length) return;
    let i = order.indexOf(this.slot);
    i = (i + dir + order.length) % order.length;
    this.equip(order[i]);
  }

  ammoFor(slot) {
    const it = this.me.inv[slot];
    if (!it) return null;
    if (!this.ammo.has(it.u)) {
      const W = WEAPONS[it.w];
      this.ammo.set(it.u, { mag: W.mag, res: W.reserve });
    }
    return this.ammo.get(it.u);
  }

  startReload() {
    const slot = this.slot;
    if (slot !== 'primary' && slot !== 'secondary') return;
    const W = WEAPONS[this.currentWeapon()];
    const a = this.ammoFor(slot);
    if (!W || !a || a.mag >= W.mag || a.res <= 0) return;
    if (this.reloadUntil) return;
    const now = performance.now();
    this.reloadUntil = now + W.reload * 1000;
    this.reloadStart = now;
    this.reloadStage = 0;
    this.reloadW = slot;
    this.scope = 0;
    this.vm.reload(W.reload);
    SFX.playReload(0);
  }

  cancelReload() {
    if (!this.reloadUntil) return;
    this.reloadUntil = 0;
    this.vm.cancelReload();
  }

  updateReload(now) {
    if (!this.reloadUntil) return;
    const W = WEAPONS[this.currentWeapon()];
    const k = (now - this.reloadStart) / (this.reloadUntil - this.reloadStart);
    if (this.reloadStage === 0 && k > 0.4) { this.reloadStage = 1; SFX.playReload(1); }
    if (this.reloadStage === 1 && k > 0.85) { this.reloadStage = 2; SFX.playReload(2); }
    if (now >= this.reloadUntil) {
      this.reloadUntil = 0;
      const a = this.ammoFor(this.reloadW);
      if (a && W) {
        const take = Math.min(W.mag - a.mag, a.res);
        a.mag += take;
        a.res -= take;
      }
    }
  }

  inaccuracy(W) {
    const sp = Math.hypot(this.body.vx, this.body.vz);
    let a = this.scope && W.scopedInacc != null ? W.scopedInacc : W.inacc;
    const mv = Math.max(0, (sp / W.speed - 0.3) / 0.7);
    a += W.move * Math.min(1.2, mv) * (W.kind === 'sniper' && this.scope ? 1.5 : 1);
    if (!this.body.onGround) a += W.air;
    a += W.spray * Math.min(this.spray, 10) / 10;
    if (this.body.crouch > 0.5) a *= 0.75;
    return a;
  }

  eyePos() {
    return [this.body.x, this.body.y + eyeHeight(this.body.crouch), this.body.z];
  }

  muzzleWorld() {
    const v = new THREE.Vector3(0.14, -0.12, -0.7);
    return this.camera.localToWorld(v);
  }

  traceLocal(o, d, range) {
    const mh = this.map.raycast(o[0], o[1], o[2], d[0], d[1], d[2], range);
    let best = mh ? mh.t : range;
    let ent = null, zone = null;
    for (const e of this.ents.values()) {
      if (!e.alive || !e.s || e.team === 'spec' || !this.isEnemy(e)) continue;
      const h = rayEntity(o[0], o[1], o[2], d[0], d[1], d[2], e.s, best);
      if (h && h.t < best) { best = h.t; ent = e; zone = h.zone; }
    }
    return { t: best, ent, zone, mh: ent ? null : mh, p: [o[0] + d[0] * best, o[1] + d[1] * best, o[2] + d[2] * best] };
  }

  isEnemy(e) {
    if (!MODES[this.state.mode]?.teams) return e.id !== this.me.id;
    return e.team !== this.me.team;
  }

  frozen() {
    const p = this.state.phase;
    return (this.state.mode === 'elim' && p === 'freeze') || p === 'matchEnd';
  }

  updateWeapon(now, dt) {
    this.updateReload(now);
    const W = WEAPONS[this.currentWeapon()];
    // recuperação de recuo
    const recoverDelay = W ? W.rate * 1000 * 1.4 + 30 : 100;
    if (now - this.lastShot > recoverDelay) {
      const k = Math.exp(-dt * 9);
      this.recoilP *= k;
      this.recoilY *= k;
      this.spray = Math.max(0, this.spray - dt * 18);
    }
    this.punchP *= Math.exp(-dt * 12);
    const left = this.mouse.left, leftEdge = this.mouse.leftEdge;
    const right = this.mouse.right, rightEdge = this.mouse.rightEdge;
    this.mouse.leftEdge = this.mouse.rightEdge = false;
    if (!this.me.alive || !this.locked || this.frozen() || this.action) return;
    const id = this.currentWeapon();
    const kind = this.kindOf(id);
    if (kind === 'nade') {
      if ((leftEdge || rightEdge) && now >= this.drawUntil) this.throwNade(id, leftEdge);
      return;
    }
    if (kind === 'bomb') return;
    if (!W) return;
    // botão direito
    if (rightEdge) {
      if (W.scope) {
        this.scope = (this.scope + 1) % (W.scope.length + 1);
        SFX.playClick();
      } else if (W.kind === 'knife' && now >= this.nextFire && now >= this.drawUntil) {
        this.knife(true);
        return;
      }
    }
    if (!left) return;
    if (now < this.drawUntil || now < this.nextFire) return;
    if (W.kind === 'knife') {
      this.knife(false);
      return;
    }
    if (this.reloadUntil) return;
    if (!W.auto && !leftEdge) return;
    const a = this.ammoFor(this.slot);
    if (!a) return;
    if (a.mag <= 0) {
      if (leftEdge) SFX.playClick();
      if (a.res > 0) this.startReload();
      this.nextFire = now + 200;
      return;
    }
    this.shoot(W, a, now);
  }

  shoot(W, a, now) {
    a.mag--;
    this.nextFire = now + W.rate * 1000;
    this.lastShot = now;
    const eye = this.eyePos();
    const inacc = this.inaccuracy(W);
    const baseDir = dirFromAngles(this.yaw + this.recoilY * DEG, this.pitch + this.recoilP * DEG);
    const pellets = W.pellets || 1;
    const muzzle = this.muzzleWorld();
    const ends = [], hits = [];
    let hitAny = false, headAny = false;
    for (let i = 0; i < pellets; i++) {
      const d = spreadDir(baseDir, pellets > 1 ? W.inacc + inacc * 0.5 : inacc);
      const r = this.traceLocal(eye, d, 220);
      const kind = r.ent ? 'f' : r.mh ? r.mh.kind[0] : 'a';
      ends.push([+r.p[0].toFixed(2), +r.p[1].toFixed(2), +r.p[2].toFixed(2), kind]);
      if (r.ent) {
        hits.push([r.ent.id, r.zone, +r.t.toFixed(2)]);
        hitAny = true;
        if (r.zone === 'head') headAny = true;
        this.fx.impact(r.p, null, 'f');
      } else if (r.mh) {
        this.fx.impact(r.p, [r.mh.nx, r.mh.ny, r.mh.nz], r.mh.kind);
      }
      if (i < 4) this.fx.tracer([muzzle.x, muzzle.y, muzzle.z], r.p, [1, 0.8, 0.45]);
    }
    if (hitAny) {
      this.hud.hitmarker(headAny);
      SFX.playHit(headAny);
    }
    this.send({ t: 'fire', w: W.id, o: [+muzzle.x.toFixed(2), +muzzle.y.toFixed(2), +muzzle.z.toFixed(2)], e: ends, h: hits });
    SFX.playShot(W.snd, null);
    this.vm.fire(W.kind === 'sniper' || W.kind === 'shotgun' ? 1.4 : W.kind === 'pistol' ? 0.7 : W.kind === 'lmg' ? 0.65 : 0.55);
    // recuo
    this.spray++;
    const n = this.spray;
    const vMul = n <= 3 ? 1 : n < 10 ? 0.75 : 0.35;
    this.recoilP = Math.min(14, this.recoilP + W.recoilV * vMul);
    const pattern = n > 4 ? Math.sin(n * 0.55) * 1.3 : (Math.random() - 0.5) * 0.6;
    this.recoilY += W.recoilH * pattern + (Math.random() - 0.5) * W.recoilH * 0.4;
    this.recoilY = Math.max(-8, Math.min(8, this.recoilY));
    this.shake = Math.min(1, this.shake + (W.kind === 'sniper' ? 0.5 : 0.15));
    if (a.mag === 0 && a.res > 0) setTimeout(() => { if (this.reloadUntil === 0 && this.me.alive) this.startReload(); }, W.rate * 1000 + 120);
  }

  knife(heavy) {
    const W = WEAPONS.knife;
    const now = performance.now();
    this.nextFire = now + (heavy ? W.heavyRate : W.rate) * 1000;
    const eye = this.eyePos();
    this.vm.swing();
    let best = null;
    for (const off of [0, -0.12, 0.12]) {
      const d = dirFromAngles(this.yaw + off, this.pitch);
      const r = this.traceLocal(eye, d, W.range);
      if (r.ent && (!best || r.t < best.t)) best = r;
      if (!best && r.mh && off === 0 && r.t < W.range) best = r;
    }
    const hits = [];
    if (best && best.ent) {
      hits.push([best.ent.id, 'body', +best.t.toFixed(2)]);
      this.fx.impact(best.p, null, 'f');
      this.hud.hitmarker(false);
      SFX.playHit(false);
    } else if (best && best.mh) {
      this.fx.impact(best.p, [best.mh.nx, best.mh.ny, best.mh.nz], best.mh.kind);
    }
    SFX.playKnife(null, !!(best && best.ent));
    this.send({ t: 'fire', w: 'knife', o: eye.map((v) => +v.toFixed(2)), e: [], h: hits, hv: heavy ? 1 : 0 });
  }

  throwNade(type, strong) {
    const eye = this.eyePos();
    const d = dirFromAngles(this.yaw, this.pitch + 0.08);
    const speed = strong ? 17 : 8.5;
    let p = [eye[0] + d[0] * 0.35, eye[1] + d[1] * 0.35 - 0.05, eye[2] + d[2] * 0.35];
    if (this.map.collideAABB(p[0] - 0.1, p[1] - 0.1, p[2] - 0.1, p[0] + 0.1, p[1] + 0.1, p[2] + 0.1)) p = [eye[0], eye[1] - 0.1, eye[2]];
    const v = [d[0] * speed + this.body.vx * 0.6, d[1] * speed + Math.max(0, this.body.vy) * 0.5, d[2] * speed + this.body.vz * 0.6];
    this.send({ t: 'nade', type, p: p.map((x) => +x.toFixed(3)), v: v.map((x) => +x.toFixed(3)) });
    this.vm.throwAnim();
    SFX.playThrow(null);
    const idx = this.me.inv.nades.indexOf(type);
    if (idx >= 0) this.me.inv.nades.splice(idx, 1);
    this.nextFire = performance.now() + 600;
    setTimeout(() => {
      if (this.slot === 'nade' && !this.weaponIn('nade')) this.equip(this.lastSlot !== 'nade' && this.weaponIn(this.lastSlot) ? this.lastSlot : this.bestSlot(), true);
      else if (this.slot === 'nade') this.equip('nade', true);
    }, 450);
  }

  dropCurrent() {
    if (!this.me.alive) return;
    if (this.slot === 'primary' || this.slot === 'secondary' || this.slot === 'bomb') {
      this.send({ t: 'drop', s: this.slot });
    }
  }

  // ---------------- ações (plantar/desarmar) ----------------
  updateAction(now) {
    const holding = this.locked && (this.keys.KeyE || (this.slot === 'bomb' && this.mouse.left));
    const st = this.state;
    if (this.action) {
      const a = this.action;
      const valid = holding && this.me.alive && st.phase === 'live';
      if (!valid) {
        this.send({ t: a.type === 'plant' ? 'plantCancel' : 'defuseCancel' });
        this.action = null;
        this.hud.progress(null);
        return;
      }
      const k = (now - a.start) / a.dur;
      this.hud.progress(k, a.type === 'plant' ? 'Plantando a bomba…' : 'Desarmando…');
      if (k >= 1) {
        this.send({ t: a.type });
        this.action = null;
        this.hud.progress(null);
        if (a.type === 'plant') this.equip(this.bestSlot(), true);
      }
      return;
    }
    if (!holding || !this.me.alive || st.phase !== 'live' || st.mode !== 'elim') return;
    const zone = this.map.zoneAt(this.body.x, this.body.z);
    if (this.me.hasBomb && (zone === 'A' || zone === 'B') && this.body.onGround) {
      this.action = { type: 'plant', start: now, dur: ROUND.plantTime * 1000 };
      this.send({ t: 'plantStart' });
      if (this.slot !== 'bomb') this.equip('bomb');
      SFX.playPlant();
    } else if (this.me.team === 'def' && st.bomb.s === 'planted' && st.bomb.p) {
      const b = st.bomb.p;
      if (Math.hypot(b[0] - this.body.x, b[2] - this.body.z) < 1.9 && Math.abs(b[1] - this.body.y) < 1.5) {
        this.action = { type: 'defuse', start: now, dur: (this.me.kit ? ROUND.defuseKit : ROUND.defuseTime) * 1000 };
        this.send({ t: 'defuseStart' });
        SFX.playReload(1);
      }
    }
  }

  // ---------------- mensagens ----------------
  handle(m) {
    const now = performance.now();
    switch (m.t) {
      case 'welcome': {
        this.me.id = m.id;
        this.me.name = m.name;
        this.isHost = m.host;
        this.state.settings = m.settings;
        this.state.mode = m.settings.mode;
        for (const d of m.drops || []) this.fx.addDrop(d.i, d.w, d.p);
        for (const s of m.smokes || []) this.fx.smoke(s.p, s.rem);
        this.cb.onWelcome?.(m);
        break;
      }
      case 'snap': return this.onSnap(m, now);
      case 'roster': return this.onRoster(m);
      case 'state': return this.onState(m, now);
      case 'inv': return this.onInv(m);
      case 'spawn': return this.onSpawn(m, now);
      case 'teamset': {
        this.me.team = m.team;
        this.vm.setTeam(m.team);
        if (m.team === 'spec') { this.me.alive = false; this.cancelReload(); }
        this.cb.onTeam?.(m.team);
        break;
      }
      case 'hurt': {
        const prev = this.me.hp;
        this.me.hp = m.hp; this.me.armor = m.ar; this.me.helmet = !!m.hm;
        if (m.dmg > 0 && m.hp < prev) {
          SFX.playHurt();
          this.punchP += Math.min(3, m.dmg / 15);
          this.hud.damage(m.f ? this.dirAngleTo(m.f) : null, m.dmg);
        }
        break;
      }
      case 'dealt': {
        if (m.kill) SFX.playJingle('kill');
        break;
      }
      case 'kill': return this.onKill(m, now);
      case 'shot': return this.onShot(m);
      case 'nade': {
        const n = { type: m.type, x: m.p[0], y: m.p[1], z: m.p[2], vx: m.v[0], vy: m.v[1], vz: m.v[2], t: 0 };
        this.nades.set(m.i, n);
        this.fx.addNade(m.i, m.type, n);
        if (m.o !== this.me.id) SFX.playThrow({ x: n.x, y: n.y, z: n.z });
        break;
      }
      case 'boom': return this.onBoom(m);
      case 'drop+': this.fx.addDrop(m.i, m.w, m.p); break;
      case 'fireOut': this.fx.removeFire(m.i); break;
      case 'drop-': this.fx.removeDrop(m.i); break;
      case 'clear':
        this.fx.clearDrops(); this.fx.clearNades(); this.fx.clearSmokes(); this.fx.clearDecals(); this.fx.clearFires();
        this.nades.clear();
        break;
      case 'bomb': return this.onBomb(m);
      case 'act': {
        const e = this.ents.get(m.i);
        if (e && e.s) {
          if (m.a === 'defuse') SFX.playReload(1, { x: e.s.x, y: e.s.y + 0.5, z: e.s.z });
          else SFX.playBeep({ x: e.s.x, y: e.s.y + 0.5, z: e.s.z });
          if (m.a === 'defuse' && this.me.team === 'atk') this.hud.centerMsg('Estão desarmando a bomba!', 1.5, 'warn');
        }
        break;
      }
      case 'roundStart': {
        this.hud.centerMsg(`Rodada ${m.round}`, 2.5);
        SFX.playJingle('start');
        this.fx.clearDecals();
        for (const e of this.ents.values()) e.buf.length = 0;
        break;
      }
      case 'live':
        if (this.me.team !== 'spec') this.hud.centerMsg('Valendo!', 1.2, 'go');
        break;
      case 'roundEnd': {
        const winName = TEAMS[m.winner].name;
        const reasons = { elim: 'eliminaram o time inimigo', bomb: 'a bomba explodiu', defuse: 'a bomba foi desarmada', time: 'o tempo acabou' };
        this.hud.centerMsg(`${winName} vencem!`, 4, m.winner, reasons[m.reason] || '');
        SFX.playJingle(m.winner === this.me.team ? 'win' : 'lose');
        break;
      }
      case 'matchEnd': {
        let text;
        if (m.winner === 'draw') text = 'Empate!';
        else if (TEAMS[m.winner]) text = `${TEAMS[m.winner].name} venceram a partida!`;
        else text = `${this.roster.get(m.winner)?.n || 'Alguém'} venceu a partida!`;
        this.hud.centerMsg(text, 8, TEAMS[m.winner] ? m.winner : 'go', 'Nova partida em instantes…');
        SFX.playJingle('match');
        this.hud.showScoreboard(true);
        setTimeout(() => { if (!this.ui.score) this.hud.showScoreboard(false); }, 7000);
        break;
      }
      case 'matchStart':
        this.hud.centerMsg(`${MODES[m.mode].name}`, 2.5, 'go', 'Partida iniciada!');
        this.ammo.clear();
        break;
      case 'settings':
        this.state.settings = m.settings;
        this.state.mode = m.settings.mode;
        this.cb.onSettings?.(m.settings);
        break;
      case 'chat': this.hud.chat(m, TEAMS[m.team]?.color); SFX.playChat(); break;
      case 'joined': this.hud.feedInfo(`${m.n} entrou`); break;
      case 'left': this.hud.feedInfo(`${m.n} saiu`); break;
      case 'buyok': SFX.playBuy(); break;
      case 'buyfail': this.hud.toast(m.r); break;
      case 'msg': this.hud.centerMsg(m.text, m.dur || 3); break;
      case 'pong': this.lastPing = Math.round(performance.now() - m.c); break;
      case 'kicked': this.cb.onKicked?.(); break;
      default:
    }
  }

  dirAngleTo(p) {
    // ângulo na tela (0 = frente)
    const dx = p[0] - this.body.x, dz = p[2] - this.body.z;
    const a = Math.atan2(-dx, -dz);
    let d = a - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return -d;
  }

  onSnap(m, now) {
    for (const e of m.e) {
      const [id, x, y, z, yaw, pitch, cr, flags, wi] = e;
      if (id === this.me.id) {
        this.serverAlive = !!(flags & 1);
        continue;
      }
      let ent = this.ents.get(id);
      if (!ent) {
        const r = this.roster.get(id);
        ent = this.makeEnt(id, r ? r.t : 'ffa', r ? r.n : '...');
      }
      const last = ent.buf[ent.buf.length - 1];
      const sample = { t: now, x, y, z, yaw, pitch, cr, f: flags, w: WLIST[wi] || 'knife' };
      if (last && Math.hypot(last.x - x, last.z - z) > 6) ent.buf.length = 0; // teleporte
      ent.buf.push(sample);
      if (ent.buf.length > 30) ent.buf.shift();
      ent.seen = now;
    }
  }

  makeEnt(id, team, name) {
    const avatar = new Avatar(id, team, name);
    this.scene.add(avatar.group);
    const ent = { id, team, name, avatar, buf: [], s: null, alive: false, stepT: 0, speed: 0, seen: performance.now(), deadAt: 0 };
    this.ents.set(id, ent);
    return ent;
  }

  onRoster(m) {
    const ids = new Set();
    for (const p of m.p) {
      ids.add(p.i);
      this.roster.set(p.i, p);
      if (p.i === this.me.id) {
        this.me.money = p.m;
        this.me.team = p.t;
        if (!this.me.alive) this.me.hp = p.hp;
        else if (p.al) { this.me.hp = p.hp; this.me.armor = p.ar; }
        this.vm.setTeam(p.t);
        continue;
      }
      const ent = this.ents.get(p.i);
      if (ent) {
        ent.team = p.t;
        ent.avatar.setTeam(p.t);
        if (ent.name !== p.n) { ent.name = p.n; ent.avatar.setName(p.n); }
        ent.bomb = !!p.bo;
      }
    }
    for (const id of [...this.roster.keys()]) if (!ids.has(id)) this.roster.delete(id);
    for (const [id, e] of this.ents) {
      if (!ids.has(id)) {
        e.avatar.dispose();
        this.ents.delete(id);
      }
    }
    this.hud.updateScoreboard(this.scoreboardData());
  }

  scoreboardData() {
    return {
      mode: this.state.mode,
      me: this.me.id,
      myTeam: this.me.team,
      players: [...this.roster.values()],
      score: this.state.score,
      kills: this.state.kills,
      round: this.state.round,
      code: this.cb.code?.() || '',
    };
  }

  onState(m, now) {
    const prevPhase = this.state.phase;
    this.state = { ...this.state, ...m };
    this.phaseEndsAt = m.rem ? now + m.rem : 0;
    this.buyEndsAt = now + (m.buyRem || 0);
    if (m.bomb.s === 'planted') this.bombEndsAt = now + m.bomb.rem;
    if (prevPhase !== m.phase) {
      this.cb.onPhase?.(m.phase);
      if (m.phase === 'warmup') this.hud.centerMsg('Aquecimento', 3, 'go', this.isHost ? 'Pressione Esc para iniciar a partida' : 'Aguardando o host iniciar a partida');
    }
    this.hud.updateScoreboard(this.scoreboardData());
  }

  onInv(m) {
    const me = this.me;
    const prevSlotWeapon = this.currentWeapon();
    me.inv = { primary: m.primary, secondary: m.secondary, nades: m.nades };
    me.armor = m.ar; me.helmet = !!m.hm; me.kit = !!m.kit; me.money = m.m;
    me.hasBomb = !!m.bomb;
    if (m.team) me.team = m.team;
    // munição para armas novas
    for (const s of ['primary', 'secondary']) this.ammoFor(s);
    if (!this.weaponIn(this.slot)) this.equip(this.bestSlot(), true);
    else {
      const w = this.currentWeapon();
      if (w !== prevSlotWeapon) this.equip(this.slot, true);
    }
    // depois de comprar uma primária, troca para ela
    if (this.pendingAutoEquip && me.inv.primary && this.pendingAutoEquip !== me.inv.primary.u) {
      this.pendingAutoEquip = null;
    }
    if (me.inv.primary && this.lastPrimaryU !== me.inv.primary.u) {
      this.lastPrimaryU = me.inv.primary.u;
      if (me.alive) this.equip('primary');
    }
    if (this.ui.buy) this.hud.showBuy(true, this.buyContext());
  }

  onSpawn(m, now) {
    this.body.setPos(m.p[0], m.p[1], m.p[2]);
    this.body.crouching = false;
    this.body.crouch = 0;
    this.yaw = m.yaw;
    this.pitch = 0;
    this.me.alive = true;
    this.me.hp = m.hp;
    this.me.spawnSeq = m.sq;
    this.spawnAt = now;
    this.recoilP = this.recoilY = 0;
    this.spray = 0;
    this.scope = 0;
    this.cancelReload();
    this.action = null;
    this.hud.progress(null);
    this.specId = null;
    this.blindUntil = 0;
    this.hud.flash(0);
    // munição cheia a cada renascimento/rodada
    this.ammo.clear();
    this.slot = '';
    this.equip(this.bestSlot(), true);
    this.vm.visible = true;
  }

  onKill(m, now) {
    const name = (id) => (id === this.me.id ? this.me.name : this.roster.get(id)?.n || '?');
    const team = (id) => (id === this.me.id ? this.me.team : this.roster.get(id)?.t || 'ffa');
    this.hud.killfeed({
      k: m.k ? name(m.k) : null, kt: m.k ? team(m.k) : null,
      v: name(m.v), vt: team(m.v), w: m.w, hs: m.hs, a: m.a ? name(m.a) : null,
      mine: m.k === this.me.id || m.v === this.me.id,
    });
    if (m.v === this.me.id) {
      this.me.alive = false;
      this.me.hp = 0;
      this.deathAt = now;
      this.killerId = m.k && m.k !== this.me.id ? m.k : null;
      this.deathPos = [this.body.x, this.body.y + eyeHeight(this.body.crouch), this.body.z];
      this.cancelReload();
      this.scope = 0;
      if (this.action) { this.action = null; this.hud.progress(null); }
      if (this.ui.buy) this.toggleBuy(false);
      const killer = this.killerId ? name(this.killerId) : null;
      this.hud.centerMsg(killer ? `Abatido por ${killer}` : 'Você morreu', 2.5, 'warn');
      this.me.inv = this.state.mode === 'elim' && this.state.phase !== 'warmup' ? { primary: null, secondary: null, nades: [] } : this.me.inv;
      this.me.hasBomb = false;
    }
    const ent = this.ents.get(m.v);
    if (ent) { ent.deadAt = now; }
    if (m.k === this.me.id && m.v !== this.me.id) {
      this.hud.killIcon(!!m.hs);
    }
  }

  onShot(m) {
    const e = this.ents.get(m.i);
    const W = WEAPONS[m.w];
    if (!W) return;
    if (W.kind === 'knife') {
      if (e && e.s) SFX.playKnife({ x: e.s.x, y: e.s.y + 1.2, z: e.s.z }, false);
      return;
    }
    let o = m.o;
    if (e && e.avatar && e.s) {
      const mp = e.avatar.muzzleWorld(new THREE.Vector3());
      o = [mp.x, mp.y, mp.z];
      this.fx.muzzle(o, W.kind === 'pistol' ? 0.35 : 0.55);
    }
    SFX.playShot(W.snd, { x: o[0], y: o[1], z: o[2] });
    let i = 0;
    for (const end of m.e || []) {
      if (i++ < 3) this.fx.tracer(o, end, [1, 0.75, 0.4]);
      const kind = end[3];
      if (kind === 'f') this.fx.impact(end, null, 'f');
      else if (kind !== 'a') {
        // normal aproximada: refaz o raycast
        const dx = end[0] - o[0], dy = end[1] - o[1], dz = end[2] - o[2];
        const L = Math.hypot(dx, dy, dz) || 1;
        const h = this.map.raycast(o[0], o[1], o[2], dx / L, dy / L, dz / L, L + 0.3);
        if (h) this.fx.impact([o[0] + (dx / L) * h.t, o[1] + (dy / L) * h.t, o[2] + (dz / L) * h.t], [h.nx, h.ny, h.nz], h.kind);
      }
      if (kind !== 'f' && i <= 1 && Math.random() < 0.5) SFX.playImpact({ x: end[0], y: end[1], z: end[2] }, kind === 'c' ? 'crate' : 'wall');
    }
    // tiro passando perto (zunido)
    if (this.me.alive && m.e && m.e[0]) {
      const end = m.e[0];
      const eye = this.eyePos();
      const dx = end[0] - o[0], dy = end[1] - o[1], dz = end[2] - o[2];
      const L2 = dx * dx + dy * dy + dz * dz || 1;
      let t = ((eye[0] - o[0]) * dx + (eye[1] - o[1]) * dy + (eye[2] - o[2]) * dz) / L2;
      t = Math.max(0, Math.min(1, t));
      const px = o[0] + dx * t - eye[0], py = o[1] + dy * t - eye[1], pz = o[2] + dz * t - eye[2];
      if (px * px + py * py + pz * pz < 1.5 && t > 0.05 && t < 0.98) {
        SFX.playImpact({ x: eye[0] + px, y: eye[1] + py, z: eye[2] + pz }, 'wall');
        this.shake = Math.min(1, this.shake + 0.15);
      }
    }
  }

  onBoom(m) {
    const n = this.nades.get(m.i);
    this.nades.delete(m.i);
    this.fx.removeNade(m.i);
    const p = m.p;
    const pos = { x: p[0], y: p[1], z: p[2] };
    if (m.type === 'he') {
      this.fx.explosion(p);
      SFX.playExplosion(pos);
      const d = Math.hypot(p[0] - this.body.x, p[1] - this.body.y, p[2] - this.body.z);
      if (d < 15) this.shake = Math.min(1.5, this.shake + (15 - d) / 10);
      for (let i = 0; i < 3; i++) this.fx.decal([p[0] + (Math.random() - 0.5), 0.01, p[2] + (Math.random() - 0.5)], [0, 1, 0]);
    } else if (m.type === 'flash') {
      this.fx.flashBurst(p);
      SFX.playFlashBang(pos);
      // quanto eu fico cego
      const watching = this.me.alive || this.me.team === 'spec';
      if (watching && this.me.alive) {
        const eye = this.eyePos();
        const dx = p[0] - eye[0], dy = p[1] - eye[1], dz = p[2] - eye[2];
        const d = Math.hypot(dx, dy, dz);
        if (d < 32 && this.map.los(eye[0], eye[1], eye[2], p[0], p[1] + 0.05, p[2])) {
          const f = dirFromAngles(this.yaw, this.pitch);
          const dot = (f[0] * dx + f[1] * dy + f[2] * dz) / d;
          let dur = dot > 0.5 ? 3.4 : dot > 0 ? 2.2 : dot > -0.5 ? 1.0 : 0.4;
          dur *= Math.max(0.25, 1 - d / 40);
          const now = performance.now();
          this.blindStart = now;
          this.blindUntil = now + dur * 1000;
          this.blindDur = dur * 1000;
          if (dur > 1) SFX.playRinging(dur);
        }
      }
    } else if (m.type === 'smoke') {
      this.fx.smoke(p);
      SFX.playSmoke(pos);
    } else if (m.type === 'molotov') {
      this.fx.fire(m.i, [p[0], Math.max(0, p[1] - 0.08), p[2]]);
      SFX.playFireStart(pos);
    }
    void n;
  }

  onBomb(m) {
    if (m.ev === 'planted') {
      const site = m.site;
      this.hud.centerMsg(`Bomba plantada no ponto ${site}!`, 3, 'warn');
      SFX.playPlant();
      this.bombEndsAt = performance.now() + ROUND.bombTimer * 1000;
    } else if (m.ev === 'defused') {
      this.hud.centerMsg('Bomba desarmada!', 3, 'def');
    } else if (m.ev === 'exploded') {
      this.fx.explosion(m.p, true);
      SFX.playBigExplosion({ x: m.p[0], y: m.p[1], z: m.p[2] });
      const d = Math.hypot(m.p[0] - this.body.x, m.p[2] - this.body.z);
      this.shake = Math.min(2, this.shake + Math.max(0.3, (40 - d) / 15));
    }
  }

  // ---------------- loop ----------------
  frame(t) {
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.0005, (t - this.last) / 1000));
    this.last = t;
    while (this.inbox.length) {
      const m = this.inbox.shift();
      try { this.handle(m); } catch (e) { console.error('client handle', m?.t, e); }
    }
    this.updateLocal(dt, now);
    this.updateEnts(dt, now);
    this.updateNades(dt);
    this.updateFires(dt);
    this.updateBomb(now);
    this.updateCamera(dt, now);
    this.fx.update(dt, this.camera.position);
    this.updateHud(now);
    this.render(dt);
    // envio
    this.sendAcc += dt;
    if (this.sendAcc >= 1 / SEND_RATE) {
      this.sendAcc = 0;
      if (this.me.alive) {
        const sp = Math.hypot(this.body.vx, this.body.vz);
        this.send({
          t: 'st', p: [+this.body.x.toFixed(3), +this.body.y.toFixed(3), +this.body.z.toFixed(3)],
          y: +this.yaw.toFixed(3), pi: +this.pitch.toFixed(3), c: +this.body.crouch.toFixed(2),
          w: this.currentWeapon(), mv: sp > 4.2 && this.body.onGround ? 1 : 0, sc: this.scope ? 1 : 0, sq: this.me.spawnSeq,
        });
      }
    }
    if (now - this.pingAt > 2000) {
      this.pingAt = now;
      this.send({ t: 'ping', c: now, pi: this.lastPing });
    }
  }

  updateLocal(dt, now) {
    const me = this.me;
    if (!me.alive) {
      this.vm.visible = false;
      return;
    }
    this.vm.visible = this.scope === 0;
    const k = this.keys;
    const canMove = this.locked && !this.frozen() && !this.action && !this.ui.chat;
    let fx = 0, fz = 0;
    if (canMove) {
      const f = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
      const s = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      // frente = (-sin, -cos); direita = (cos, -sin)
      fx = -sy * f + cy * s;
      fz = -cy * f - sy * s;
    }
    const W = WEAPONS[this.currentWeapon()];
    let speed = W ? W.speed : 6;
    if (this.slot === 'nade' || this.slot === 'bomb') speed = 6.0;
    if (this.scope) speed *= 0.6;
    const walking = canMove && (k.ShiftLeft || k.ShiftRight);
    const crouch = canMove && (k.KeyC || k.ControlLeft || k.ControlRight);
    if (walking) speed *= PLAYER.walkMul;
    if (this.body.crouch > 0.5) speed *= PLAYER.crouchMul;
    const jump = canMove && k.Space && this.body.onGround;
    const wasGround = this.body.onGround;
    const vy0 = this.body.vy;
    this.body.update(this.map, dt, { wx: fx, wz: fz, speed, jump, crouch: crouch || (this.action ? this.action.type === 'defuse' : false) });
    if (!wasGround && this.body.onGround && vy0 < -6) SFX.playLand(null);
    // passos próprios
    const sp = Math.hypot(this.body.vx, this.body.vz);
    if (this.body.onGround && sp > 4.2) {
      this.stepDist += sp * dt;
      if (this.stepDist > 2.1) { this.stepDist = 0; SFX.playFootstep(null, 0.5); }
    }
    this.updateWeapon(now, dt);
    this.updateAction(now);
  }

  sampleEnt(ent, rt) {
    const b = ent.buf;
    if (!b.length) return null;
    if (rt <= b[0].t) return b[0];
    for (let i = b.length - 1; i >= 0; i--) {
      if (b[i].t <= rt) {
        const a = b[i], c = b[i + 1];
        if (!c) return a;
        const k = (rt - a.t) / (c.t - a.t || 1);
        let dyaw = c.yaw - a.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        return {
          x: a.x + (c.x - a.x) * k, y: a.y + (c.y - a.y) * k, z: a.z + (c.z - a.z) * k,
          yaw: a.yaw + dyaw * k, pitch: a.pitch + (c.pitch - a.pitch) * k, cr: a.cr + (c.cr - a.cr) * k,
          f: c.f, w: c.w,
        };
      }
    }
    return b[b.length - 1];
  }

  updateEnts(dt, now) {
    const rt = now - this.interpDelay;
    const teamMode = MODES[this.state.mode]?.teams;
    for (const ent of this.ents.values()) {
      const s = this.sampleEnt(ent, rt);
      if (!s || now - ent.seen > 2500) {
        ent.avatar.group.visible = false;
        ent.alive = false;
        continue;
      }
      const alive = !!(s.f & 1);
      if (alive && !ent.alive) ent.avatar.deadT = -1;
      ent.alive = alive;
      const prev = ent.s;
      ent.s = { x: s.x, y: s.y, z: s.z, yaw: s.yaw, pitch: s.pitch, crouch: s.cr };
      let speed = 0;
      if (prev) speed = Math.hypot(s.x - prev.x, s.z - prev.z) / Math.max(dt, 1e-3);
      ent.speed += (Math.min(speed, 8) - ent.speed) * Math.min(1, dt * 10);
      const hideCorpse = !alive && this.state.mode !== 'elim' && now - ent.deadAt > 5000;
      ent.avatar.group.visible = ent.team !== 'spec' && !hideCorpse && ent.id !== this.specId_hidden;
      ent.avatar.setWeapon(alive ? s.w : null);
      ent.avatar.backBomb.visible = !!ent.bomb && alive && s.w !== 'bomb';
      ent.avatar.update(dt, { x: s.x, y: s.y, z: s.z, yaw: s.yaw, pitch: s.pitch, crouch: s.cr, alive, speed: alive ? ent.speed : 0, busy: !!(s.f & 4) });
      ent.avatar.tag.visible = alive && teamMode && ent.team === this.me.team && this.me.team !== 'spec';
      // passos
      if (alive && s.f & 16) {
        ent.stepT -= dt;
        if (ent.stepT <= 0) {
          ent.stepT = 0.36;
          SFX.playFootstep({ x: s.x, y: s.y, z: s.z }, 1);
        }
      } else ent.stepT = 0.1;
    }
    // inimigos avistados para o radar
    if (now > this.spotAt) {
      this.spotAt = now + 200;
      if (this.me.alive) {
        const eye = this.eyePos();
        for (const e of this.ents.values()) {
          if (!e.alive || !e.s || !this.isEnemy(e)) continue;
          if (this.map.los(eye[0], eye[1], eye[2], e.s.x, e.s.y + 1.3, e.s.z)) this.spotted.set(e.id, now + 600);
        }
      }
    }
  }

  updateNades(dt) {
    this.nadeAcc += dt;
    while (this.nadeAcc >= NADE_DT) {
      this.nadeAcc -= NADE_DT;
      for (const n of this.nades.values()) {
        if (n.done) continue;
        const bounced = nadeStep(this.map, n);
        if (bounced && Math.abs(n.vx) + Math.abs(n.vy) + Math.abs(n.vz) > 1.5) SFX.playBounce({ x: n.x, y: n.y, z: n.z });
        if (nadeShouldDetonate(n, NADES[n.type].fuse)) n.done = true; // espera o 'boom' do servidor
      }
    }
  }

  updateFires(dt) {
    for (const f of this.fx.fires.values()) {
      f.crackle -= dt;
      if (f.crackle <= 0) {
        f.crackle = 0.18 + Math.random() * 0.25;
        SFX.playCrackle({ x: f.p[0], y: f.p[1] + 0.5, z: f.p[2] });
      }
    }
  }

  updateBomb(now) {
    const b = this.state.bomb;
    if (b.s === 'planted' && b.p) {
      const rem = Math.max(0, this.bombEndsAt - now) / 1000;
      const interval = Math.max(0.12, Math.min(1, rem / 35));
      this.fx.setBomb('planted', b.p, 1 / interval);
      if (now >= this.nextBeep && rem > 0) {
        this.nextBeep = now + interval * 1000;
        SFX.playBeep({ x: b.p[0], y: b.p[1] + 0.2, z: b.p[2] }, rem < 8);
      }
    } else if (b.s === 'dropped' && b.p) this.fx.setBomb('dropped', b.p, 0);
    else this.fx.setBomb('none');
  }

  specTargets() {
    const list = [];
    for (const e of this.ents.values()) {
      if (!e.alive || !e.s || e.team === 'spec') continue;
      const teamMode = MODES[this.state.mode]?.teams;
      if (teamMode && this.me.team !== 'spec' && e.team !== this.me.team) continue;
      list.push(e);
    }
    if (!list.length) for (const e of this.ents.values()) if (e.alive && e.s && e.team !== 'spec') list.push(e);
    return list;
  }

  updateCamera(dt, now) {
    const cam = this.camera;
    const baseFov = this.opts.fov || 74;
    let fov = baseFov;
    const W = WEAPONS[this.currentWeapon()];
    if (this.scope && W && W.scope) fov = W.scope[this.scope - 1];
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 25);
      cam.updateProjectionMatrix();
    }
    this.shake = Math.max(0, this.shake - dt * 3);
    const sh = this.shake * this.shake * 0.02;
    this.specId_hidden = null;
    if (this.me.alive) {
      this.hud.spectating(null);
      const eye = this.eyePos();
      cam.position.set(eye[0] + (Math.random() - 0.5) * sh, eye[1] + (Math.random() - 0.5) * sh, eye[2]);
      cam.rotation.y = this.yaw + this.recoilY * DEG * 0.45;
      cam.rotation.x = this.pitch + (this.recoilP * 0.45 + this.punchP) * DEG;
      cam.rotation.z = 0;
    } else {
      const since = now - this.deathAt;
      const killer = this.killerId ? this.ents.get(this.killerId) : null;
      if (this.me.team !== 'spec' && this.deathPos && since < 2600) {
        // câmera de morte
        const p = this.deathPos;
        const rise = Math.min(1, since / 1500);
        cam.position.set(p[0], p[1] + rise * 1.2, p[2]);
        if (killer && killer.s) {
          const [y, pt] = anglesTo(killer.s.x - p[0], killer.s.y + 1.4 - (p[1] + rise * 1.2), killer.s.z - p[2]);
          cam.rotation.y += angleLerp(cam.rotation.y, y, Math.min(1, dt * 4));
          cam.rotation.x += (pt - cam.rotation.x) * Math.min(1, dt * 4);
        } else cam.rotation.x += (-0.6 - cam.rotation.x) * Math.min(1, dt * 2);
        cam.rotation.z = 0;
        this.hud.spectating(null);
      } else {
        const list = this.specTargets();
        if (this.mouse.leftEdge || this.mouse.rightEdge) {
          this.specIdx += this.mouse.rightEdge ? -1 : 1;
          this.mouse.leftEdge = this.mouse.rightEdge = false;
        }
        if (list.length) {
          this.specIdx = ((this.specIdx % list.length) + list.length) % list.length;
          const e = list[this.specIdx];
          this.specId = e.id;
          // câmera em terceira pessoa atrás do jogador
          const f = dirFromAngles(e.s.yaw, e.s.pitch * 0.6);
          const hx = e.s.x, hy = e.s.y + eyeHeight(e.s.crouch) + 0.25, hz = e.s.z;
          let dist = 2.6;
          const h = this.map.raycast(hx, hy, hz, -f[0], -f[1] + 0.15, -f[2], dist);
          if (h) dist = Math.max(0.3, h.t - 0.2);
          const tx = hx - f[0] * dist, ty = hy + (-f[1] + 0.15) * dist, tz = hz - f[2] * dist;
          cam.position.x += (tx - cam.position.x) * Math.min(1, dt * 12);
          cam.position.y += (ty - cam.position.y) * Math.min(1, dt * 12);
          cam.position.z += (tz - cam.position.z) * Math.min(1, dt * 12);
          cam.rotation.y = e.s.yaw;
          cam.rotation.x = e.s.pitch * 0.6 - 0.08;
          cam.rotation.z = 0;
          this.hud.spectating(e.name, TEAMS[e.team]?.color, this.me.team !== 'spec' && this.state.mode === 'elim');
        } else {
          // visão geral do mapa
          cam.position.set(0, 48, 34);
          cam.rotation.set(-0.95, 0, 0);
          this.hud.spectating('Visão geral', '#ddd', false);
        }
      }
    }
    const fwd = dirFromAngles(cam.rotation.y, cam.rotation.x);
    SFX.updateListener(cam.position.x, cam.position.y, cam.position.z, fwd[0], fwd[1], fwd[2]);
  }

  updateHud(now) {
    const me = this.me;
    const st = this.state;
    const id = this.currentWeapon();
    const W = WEAPONS[id];
    let ammo = null;
    if (W && W.mag && (this.slot === 'primary' || this.slot === 'secondary')) {
      const a = this.ammoFor(this.slot);
      if (a) ammo = { mag: a.mag, res: a.res, reloading: !!this.reloadUntil };
    }
    const timer = this.phaseEndsAt ? Math.max(0, this.phaseEndsAt - now) / 1000 : null;
    const bombRem = st.bomb.s === 'planted' ? Math.max(0, this.bombEndsAt - now) / 1000 : null;
    let leader = null;
    if (st.mode === 'ffa') {
      for (const p of this.roster.values()) if (p.t === 'ffa' && (!leader || p.k > leader.k)) leader = p;
    }
    const myK = this.roster.get(me.id)?.k || 0;
    this.hud.update({
      alive: me.alive, hp: me.hp, armor: me.armor, helmet: me.helmet, kit: me.kit, money: me.money,
      econ: st.mode === 'elim' && st.phase !== 'warmup',
      weapon: W ? W.name : NADES[id] ? NADES[id].name : id === 'bomb' ? 'Bomba' : '',
      ammo, nades: me.inv.nades, slot: this.slot, hasBomb: me.hasBomb,
      mode: st.mode, phase: st.phase, timer, bombRem, round: st.round, score: st.score, kills: st.kills,
      limit: st.settings?.killLimit, roundsToWin: st.settings?.roundsToWin, leader, myK,
      team: me.team, canBuy: this.canBuyHere(), buyRem: Math.max(0, this.buyEndsAt - now) / 1000,
      inaccuracy: W && W.kind !== 'knife' ? this.inaccuracy(W) : 0.01,
      scope: !!(this.scope && W && W.scope),
      spray: this.spray,
      hint: this.hintText(),
      ping: this.lastPing,
    });
    // cegueira
    if (now < this.blindUntil) {
      const k = (this.blindUntil - now) / this.blindDur;
      this.hud.flash(Math.min(1, k * 1.6));
    } else this.hud.flash(0);
    this.hud.drawRadar(this.radarData(now));
  }

  hintText() {
    const st = this.state;
    if (!this.me.alive || st.mode !== 'elim' || st.phase !== 'live' || this.action) return '';
    const zone = this.map.zoneAt(this.body.x, this.body.z);
    if (this.me.hasBomb && (zone === 'A' || zone === 'B')) return 'Segure E para plantar a bomba';
    if (this.me.team === 'def' && st.bomb.s === 'planted' && st.bomb.p) {
      const b = st.bomb.p;
      if (Math.hypot(b[0] - this.body.x, b[2] - this.body.z) < 1.9) return 'Segure E para desarmar';
    }
    return '';
  }

  radarData(now) {
    const teamMode = MODES[this.state.mode]?.teams;
    const dots = [];
    for (const e of this.ents.values()) {
      if (!e.s || e.team === 'spec') continue;
      const ally = teamMode && e.team === this.me.team;
      const spotted = (this.spotted.get(e.id) || 0) > now;
      if (!ally && !spotted) continue;
      if (!e.alive && !ally) continue;
      dots.push({ x: e.s.x, z: e.s.z, yaw: e.s.yaw, color: ally ? TEAMS[e.team].color : '#ff4040', dead: !e.alive, bomb: e.bomb });
    }
    let cx = this.body.x, cz = this.body.z, yaw = this.yaw;
    if (!this.me.alive && this.specId) {
      const e = this.ents.get(this.specId);
      if (e && e.s) { cx = e.s.x; cz = e.s.z; yaw = e.s.yaw; }
    }
    const b = this.state.bomb;
    let bomb = null;
    if (b.s === 'planted' || (b.s === 'dropped' && this.me.team === 'atk')) bomb = { x: b.p[0], z: b.p[2], planted: b.s === 'planted' };
    return { map: this.map, cx, cz, yaw, dots, me: this.me.alive, bomb };
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(dt) {
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    if (this.me.alive && this.vm.visible) {
      r.clearDepth();
      this.vm.update(dt, {
        moving: true, speed: Math.hypot(this.body.vx, this.body.vz), onGround: this.body.onGround,
        lookDX: this.lookDX, lookDY: this.lookDY, crouch: this.body.crouch, aspect: this.camera.aspect,
      });
      r.render(this.vm.scene, this.vm.camera);
    }
    this.lookDX = this.lookDY = 0;
  }
}

function angleLerp(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d * k;
}
