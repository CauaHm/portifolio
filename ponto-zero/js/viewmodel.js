// Arma em primeira pessoa (cena própria renderizada por cima do mundo).
import * as THREE from 'three';
import { buildGun, part, muzzleFlashTexture } from './models.js';

const SLEEVE = { atk: 0xb0723d, def: 0x34557f, ffa: 0x6b6f76, spec: 0x6b6f76 };

const POSE = {
  knife: { x: 0.2, y: -0.24, z: -0.42 },
  pistol: { x: 0.16, y: -0.17, z: -0.4 },
  smg: { x: 0.17, y: -0.19, z: -0.42 },
  shotgun: { x: 0.17, y: -0.2, z: -0.4 },
  rifle: { x: 0.17, y: -0.2, z: -0.42 },
  sniper: { x: 0.17, y: -0.2, z: -0.42 },
  lmg: { x: 0.18, y: -0.22, z: -0.44 },
  nade: { x: 0.21, y: -0.24, z: -0.46 },
  bomb: { x: 0.12, y: -0.26, z: -0.42 },
};

export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6b5a45, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 1.6);
    d.position.set(0.5, 1, 0.3);
    this.scene.add(d);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.holder = new THREE.Group();
    this.root.add(this.holder);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: muzzleFlashTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.scale.set(0.22, 0.22, 1);
    this.flash.visible = false;
    this.flashLight = new THREE.PointLight(0xffc070, 0, 2);
    this.scene.add(this.flashLight);
    this.current = null;
    this.kind = 'rifle';
    this.team = 'atk';
    this.t = 0;
    this.kick = 0;
    this.kickRot = 0;
    this.drawT = 1;
    this.reloadT = -1;
    this.reloadDur = 1;
    this.swingT = -1;
    this.throwT = -1;
    this.flashUntil = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.bob = 0;
    this.visible = true;
  }

  setTeam(team) {
    if (team === this.team) return;
    this.team = team;
    const id = this.current;
    this.current = null;
    if (id) this.setWeapon(id, this.kind, true);
  }

  setWeapon(id, kind, instant = false) {
    if (id === this.current) return;
    this.current = id;
    this.kind = kind;
    while (this.holder.children.length) this.holder.remove(this.holder.children[0]);
    if (!id) return;
    const { group, muzzle } = buildGun(id);
    this.gun = group;
    this.muzzle = muzzle;
    const isNade = kind === 'nade' || kind === 'bomb';
    // braços
    const sleeve = SLEEVE[this.team] || SLEEVE.ffa;
    const glove = 0x1e1e1e;
    const arms = new THREE.Group();
    // braço direito
    part(arms, 0.075, 0.075, 0.42, sleeve, 0.03, -0.05, 0.25, { rx: 0.18 });
    part(arms, 0.07, 0.07, 0.09, glove, 0.0, -0.03, 0.04);
    if (kind !== 'knife' && !isNade && kind !== 'pistol') {
      // braço esquerdo segurando a frente da arma
      part(arms, 0.075, 0.075, 0.46, sleeve, -0.13, -0.08, -0.05, { ry: -0.55, rx: 0.15 });
      part(arms, 0.07, 0.07, 0.09, glove, -0.02, -0.02, -0.24);
    } else if (kind === 'pistol') {
      part(arms, 0.075, 0.075, 0.42, sleeve, -0.1, -0.07, 0.22, { ry: -0.35, rx: 0.18 });
      part(arms, 0.068, 0.068, 0.08, glove, -0.025, -0.02, 0.05);
    } else if (kind === 'bomb') {
      part(arms, 0.075, 0.075, 0.42, sleeve, -0.18, -0.05, 0.25, { rx: 0.18 });
      part(arms, 0.07, 0.07, 0.09, glove, -0.14, -0.03, 0.04);
    }
    this.holder.add(arms);
    this.holder.add(group);
    if (kind === 'knife') { group.rotation.set(0.35, 0.25, 0); group.scale.setScalar(0.8); }
    if (isNade) group.position.set(0, 0.02, -0.02);
    if (kind === 'bomb') group.position.set(-0.07, 0.02, -0.05);
    muzzle.add(this.flash);
    this.flash.visible = false;
    this.drawT = instant ? 1 : 0;
    this.reloadT = -1;
    this.swingT = -1;
    this.throwT = -1;
  }

  fire(strength = 1) {
    this.kick = Math.min(1.5, this.kick + strength);
    this.kickRot = Math.min(1.5, this.kickRot + strength);
    if (this.kind !== 'knife') {
      this.flashUntil = performance.now() + 45;
      this.flash.material.rotation = Math.random() * Math.PI;
      const s = this.kind === 'pistol' ? 0.16 : this.kind === 'sniper' || this.kind === 'shotgun' ? 0.32 : 0.24;
      this.flash.scale.set(s, s, 1);
    }
  }

  swing() { this.swingT = 0; }
  throwAnim() { this.throwT = 0; }
  reload(dur) { this.reloadT = 0; this.reloadDur = dur; }
  cancelReload() { this.reloadT = -1; }

  update(dt, { moving, speed, onGround, lookDX, lookDY, crouch, aspect }) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.t += dt;
    const P = POSE[this.kind] || POSE.rifle;
    // balanço ao andar
    const bobAmt = onGround ? Math.min(1, speed / 6) : 0;
    this.bob += dt * (6 + speed * 1.2) * (bobAmt > 0.05 ? 1 : 0);
    const bx = Math.sin(this.bob) * 0.012 * bobAmt;
    const by = -Math.abs(Math.cos(this.bob)) * 0.012 * bobAmt;
    // sway com o mouse
    this.swayX += (-lookDX * 0.0006 - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (lookDY * 0.0006 - this.swayY) * Math.min(1, dt * 10);
    const idle = Math.sin(this.t * 1.6) * 0.003;
    // recuo
    this.kick = Math.max(0, this.kick - dt * 9);
    this.kickRot = Math.max(0, this.kickRot - dt * 7);
    let x = P.x + bx + this.swayX;
    let y = P.y + by + idle + this.swayY - crouch * 0.01;
    let z = P.z + this.kick * 0.05;
    let rx = this.kickRot * 0.09, ry = 0, rz = 0;
    // sacar
    if (this.drawT < 1) {
      this.drawT = Math.min(1, this.drawT + dt * 2.6);
      const e = 1 - Math.pow(1 - this.drawT, 3);
      y -= (1 - e) * 0.25;
      rx -= (1 - e) * 0.6;
    }
    // recarregar
    if (this.reloadT >= 0) {
      this.reloadT += dt / this.reloadDur;
      if (this.reloadT >= 1) this.reloadT = -1;
      else {
        const k = Math.sin(Math.min(1, this.reloadT) * Math.PI);
        y -= k * 0.08;
        rx -= k * 0.35;
        rz += k * 0.5;
      }
    }
    // faca
    if (this.swingT >= 0) {
      this.swingT += dt * 3.2;
      if (this.swingT >= 1) this.swingT = -1;
      else {
        const k = Math.sin(this.swingT * Math.PI);
        x -= k * 0.15;
        z -= k * 0.12;
        ry += k * 0.9;
        rz -= k * 0.4;
      }
    }
    // arremesso
    if (this.throwT >= 0) {
      this.throwT += dt * 2.5;
      if (this.throwT >= 1) this.throwT = -1;
      else {
        const k = Math.sin(this.throwT * Math.PI);
        y += k * 0.1;
        z -= k * 0.2;
        rx += k * 0.8;
      }
    }
    this.root.position.set(x, y, z);
    this.root.rotation.set(rx, ry, rz);
    const flashOn = performance.now() < this.flashUntil;
    this.flash.visible = flashOn;
    this.flashLight.intensity = flashOn ? 3 : 0;
    if (flashOn && this.muzzle) this.muzzle.getWorldPosition(this.flashLight.position);
    this.root.visible = this.visible;
  }
}
