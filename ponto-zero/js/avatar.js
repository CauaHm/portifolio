// Personagens em terceira pessoa (bonecos low-poly originais).
import * as THREE from 'three';
import { buildGun, part } from './models.js';
import { TEAMS } from './config.js';

const LOOK = {
  atk: { shirt: 0xb0723d, vest: 0x4b3a28, pants: 0x5c4b38, head: 0x2a2826, skin: 0xc58c5c, accent: 0xf08a3c, hat: 'mask' },
  def: { shirt: 0x34557f, vest: 0x1e2c3f, pants: 0x3a414c, head: 0x283444, skin: 0xd9a37a, accent: 0x4f9bff, hat: 'helmet' },
};

function ffaLook(seed) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = (h % 360) / 360;
  const c = new THREE.Color().setHSL(hue, 0.55, 0.45);
  const d = new THREE.Color().setHSL(hue, 0.45, 0.25);
  return { shirt: c.getHex(), vest: d.getHex(), pants: 0x3d3d40, head: 0x2b2b2b, skin: 0xcf9a6e, accent: c.getHex(), hat: h % 2 ? 'mask' : 'helmet' };
}

function nameSprite(name, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 30px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(0,0,0,0.75)';
  g.strokeText(name, 128, 32);
  g.fillStyle = color;
  g.fillText(name, 128, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(1.3, 0.33, 1);
  s.renderOrder = 10;
  return s;
}

export class Avatar {
  constructor(id, team, name) {
    this.id = id;
    this.group = new THREE.Group();
    this.pose = new THREE.Group();
    this.group.add(this.pose);
    this.team = null;
    this.name = name;
    this.weapon = null;
    this.walk = 0;
    this.deadT = -1;
    this.build(team);
  }

  build(team) {
    // limpa
    while (this.pose.children.length) this.pose.remove(this.pose.children[0]);
    this.team = team;
    const L = LOOK[team] || ffaLook(this.id + this.name);
    this.look = L;
    const sh = { shadow: true, r: 0.85, m: 0.05 };
    // pernas
    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    this.legL.position.set(-0.11, 0.88, 0);
    this.legR.position.set(0.11, 0.88, 0);
    for (const leg of [this.legL, this.legR]) {
      part(leg, 0.17, 0.5, 0.2, L.pants, 0, -0.25, 0, sh);
      const shin = new THREE.Group();
      shin.position.y = -0.48;
      part(shin, 0.16, 0.36, 0.18, L.pants, 0, -0.18, 0, sh);
      part(shin, 0.18, 0.1, 0.27, 0x24201b, 0, -0.36, -0.04, sh);
      leg.add(shin);
      leg.userData.shin = shin;
      this.pose.add(leg);
    }
    // tronco
    this.upper = new THREE.Group();
    this.upper.position.y = 0.88;
    this.pose.add(this.upper);
    part(this.upper, 0.46, 0.6, 0.26, L.shirt, 0, 0.3, 0, sh);
    part(this.upper, 0.5, 0.42, 0.31, L.vest, 0, 0.34, 0, sh);
    part(this.upper, 0.2, 0.08, 0.04, L.accent, 0.08, 0.42, -0.16, { r: 0.5 }); // faixa do time
    part(this.upper, 0.48, 0.08, 0.28, 0x2b241c, 0, 0.04, 0, sh); // cinto
    // cabeça
    this.head = new THREE.Group();
    this.head.position.y = 0.6;
    this.upper.add(this.head);
    part(this.head, 0.1, 0.06, 0.1, L.skin, 0, 0.02, 0, sh); // pescoço
    part(this.head, 0.25, 0.26, 0.26, L.hat === 'mask' ? L.head : L.skin, 0, 0.16, 0, sh);
    if (L.hat === 'helmet') {
      part(this.head, 0.29, 0.13, 0.3, L.head, 0, 0.27, 0.01, sh);
      part(this.head, 0.22, 0.06, 0.02, 0x111820, 0, 0.18, -0.135, { r: 0.2, m: 0.6 });
    } else {
      part(this.head, 0.2, 0.05, 0.02, L.skin, 0, 0.19, -0.135, { r: 0.9 }); // fresta dos olhos
      part(this.head, 0.16, 0.025, 0.03, 0x111111, 0, 0.19, -0.14, { r: 0.3 });
    }
    // braços + arma (giram com o pitch)
    this.arms = new THREE.Group();
    this.arms.position.set(0, 0.5, 0);
    this.upper.add(this.arms);
    const armR = new THREE.Group();
    armR.position.set(0.25, 0, 0);
    part(armR, 0.12, 0.12, 0.42, L.shirt, 0, -0.06, -0.17, { ...sh, rx: 0.15 });
    part(armR, 0.11, 0.11, 0.1, 0x222222, -0.04, -0.1, -0.38, sh);
    this.arms.add(armR);
    const armL = new THREE.Group();
    armL.position.set(-0.25, 0, 0);
    part(armL, 0.12, 0.12, 0.5, L.shirt, 0.08, -0.05, -0.24, { ...sh, ry: -0.35, rx: 0.1 });
    part(armL, 0.11, 0.11, 0.1, 0x222222, 0.18, -0.08, -0.47, sh);
    this.arms.add(armL);
    this.gunHolder = new THREE.Group();
    this.gunHolder.position.set(0.12, -0.12, -0.38);
    this.arms.add(this.gunHolder);
    // nome
    this.tag = nameSprite(this.name, (TEAMS[team] || TEAMS.ffa).color);
    this.tag.position.y = 2.05;
    this.tag.visible = false;
    this.group.add(this.tag);
    // bomba nas costas
    this.backBomb = new THREE.Group();
    const bb = buildGun('bomb').group;
    bb.rotation.x = Math.PI / 2;
    this.backBomb.add(bb);
    this.backBomb.position.set(0, 0.35, 0.2);
    this.backBomb.visible = false;
    this.upper.add(this.backBomb);
    const w = this.weapon;
    this.weapon = null;
    if (w) this.setWeapon(w);
  }

  setTeam(team) {
    if (team !== this.team) this.build(team);
  }

  setName(name) {
    if (name === this.name) return;
    this.name = name;
    this.group.remove(this.tag);
    this.tag = nameSprite(name, (TEAMS[this.team] || TEAMS.ffa).color);
    this.tag.position.y = 2.05;
    this.group.add(this.tag);
  }

  setWeapon(id) {
    if (this.weapon === id) return;
    this.weapon = id;
    while (this.gunHolder.children.length) this.gunHolder.remove(this.gunHolder.children[0]);
    if (!id) return;
    const { group, muzzle } = buildGun(id);
    group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.gunHolder.add(group);
    this.muzzle = muzzle;
  }

  muzzleWorld(out) {
    if (this.muzzle) return this.muzzle.getWorldPosition(out);
    return this.group.getWorldPosition(out).setY(this.group.position.y + 1.4);
  }

  // s: {x,y,z,yaw,pitch,crouch,alive,speed,busy}
  update(dt, s) {
    this.group.position.set(s.x, s.y, s.z);
    this.group.rotation.y = s.yaw;
    const crouch = s.crouch || 0;
    // pernas/agachamento
    const hip = 0.88 - 0.32 * crouch;
    this.upper.position.y = hip;
    this.legL.position.y = this.legR.position.y = hip;
    const bend = crouch * 1.1;
    for (const [leg, sgn] of [[this.legL, 1], [this.legR, -1]]) {
      leg.scale.y = 1;
      leg.rotation.x = -bend + Math.sin(this.walk) * 0.55 * sgn * Math.min(1, s.speed / 4);
      leg.userData.shin.rotation.x = bend * 1.6 + Math.max(0, -Math.sin(this.walk) * sgn) * 0.4 * Math.min(1, s.speed / 4);
    }
    this.walk += dt * s.speed * 2.1;
    this.upper.rotation.x = crouch * 0.18;
    this.arms.rotation.x = s.pitch * 0.9 - crouch * 0.18;
    this.head.rotation.x = s.pitch * 0.5;
    this.arms.position.z = 0;
    if (s.busy) this.arms.rotation.x = -0.9;

    // morte
    if (!s.alive) {
      if (this.deadT < 0) this.deadT = 0;
      this.deadT += dt;
      const t = Math.min(1, this.deadT / 0.45);
      const e = t * t;
      this.pose.rotation.x = e * (Math.PI / 2) * 0.98;
      this.pose.position.y = e * 0.12;
      this.pose.position.z = e * 0.3;
      this.tag.visible = false;
    } else {
      this.deadT = -1;
      this.pose.rotation.x = 0;
      this.pose.position.set(0, 0, 0);
    }
  }

  dispose() {
    this.group.removeFromParent();
  }
}
