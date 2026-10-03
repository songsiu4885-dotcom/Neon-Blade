import * as THREE from 'three';
import { Enemy, warnMaterial } from './enemy.js';
import { buildGuardRobot, GuardAnimator } from '../characters/robots.js';
import { robotsReady } from '../characters/robotModels.js';
import { audio } from '../audio.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const fwd = (e) => V3(-Math.sin(e.facing), 0, -Math.cos(e.facing));
const rand = (a, b) => a + Math.random() * (b - a);
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
function fanHit(e, ctx, range, cosArc, dmg) {
  const p = ctx.player.pos, dx = p.x - e.pos.x, dz = p.z - e.pos.z, d = Math.hypot(dx, dz) || 1e-6;
  const f = fwd(e);
  if (d < range && (f.x * dx + f.z * dz) / d > cosArc) return ctx.player.hurt(dmg, f, e);
  return false;
}
function laser() {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 1),
    new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.frustumCulled = false; m.visible = false; return m;
}
function walkAnim(e, dt, armRx, state, ov) {
  const sp = dt > 0 ? Math.hypot(e.pos.x - e._last.x, e.pos.z - e._last.z) / dt : 0;
  e._last.copy(e.pos);
  e.anim.update(dt, Math.min(sp, 8), armRx, state, e.broken, ov);
}

// =================== 암살 로봇: 반투명하게 숨어 다니다 등 뒤로 순간이동해 벤다 ===================
export class Assassin extends Enemy {
  constructor(x, z) {
    super({ maxHp: 70, radius: 0.6, maxPosture: 40 });
    this.pos.set(x, 0, z);
    this.state = 'stalk'; this.t = 0; this.cd = 1.4 + Math.random() * 1.2; this.orbit = Math.random() < 0.5 ? 1 : -1;
    this.J = buildGuardRobot(this, { shell: 0x1e1630, rim: 0xc05cff, vent: 0xc05cff, weapon: 'sword' });
    this.anim = new GuardAnimator(this.J);
    this.body.scale.set(0.8, 0.95, 0.8);
    this.armRx = 0.25;
    this.warn = mesh(new THREE.PlaneGeometry(2.8, 3.2).rotateX(-Math.PI / 2), warnMaterial(), 0, 0.06, -1.6); this.warn.visible = false; this.group.add(this.warn);
    this.mark = mesh(new THREE.RingGeometry(0.5, 0.75, 24).rotateX(-Math.PI / 2), warnMaterial()); this.mark.visible = false; // 순간이동 도착 표시
    this.aim = this.mark; // 죽으면 Combat이 장면에서 함께 치운다
    this.dest = V3(0, 0, 0);
    this._last = V3(x, 0, z);
    for (const m of [...this.stdMats, ...this.rimMats]) { m.transparent = true; }
    this.cloak = 1;
  }
  cancelAttack() { this.state = 'stalk'; this.t = 0; this.cd = 1.6; this.warn.visible = false; this.mark.visible = false; }
  ai(dt, ctx) {
    if (!this.mark.parent) ctx.scene.add(this.mark);
    const P = ctx.player, p = P.pos, dx = p.x - this.pos.x, dz = p.z - this.pos.z, dist = Math.hypot(dx, dz) || 1e-6;
    if (this.state === 'stalk') {
      this.attacking = false;
      this.faceToward(dx, dz, dt, 6);
      this.cd -= dt;
      // 7m 거리를 두고 옆으로 돈다
      const radial = dist > 8 ? 1 : dist < 6 ? -1 : 0;
      const nx = dx / dist, nz = dz / dist;
      this.pos.x += (nx * radial - nz * this.orbit * 0.8) * 5.2 * dt;
      this.pos.z += (nz * radial + nx * this.orbit * 0.8) * 5.2 * dt;
      if (this.cd <= 0 && dist < 11 && ctx.attackers() < ctx.maxAtk) {
        const back = V3(Math.sin(P.facing), 0, Math.cos(P.facing)); // 플레이어 등 뒤
        this.dest.set(p.x + back.x * 2.2, 0, p.z + back.z * 2.2);
        ctx.world?.resolve(this.dest, this.radius);
        this.mark.position.set(this.dest.x, 0.07, this.dest.z); this.mark.visible = true;
        this.state = 'blink'; this.t = 0; this.attacking = true; this.dodged = false;
      }
    } else if (this.state === 'blink') {
      this.t += dt;
      this.alert = Math.min(1, this.t / 0.3);
      this.mark.material.opacity = 0.2 + 0.5 * this.alert;
      if (this.t >= 0.3) {
        ctx.fx.sparks(V3(this.pos.x, 1.2, this.pos.z), V3(0, 1, 0), 10, 0xc05cff);
        this.pos.copy(this.dest);
        ctx.fx.sparks(V3(this.pos.x, 1.2, this.pos.z), V3(0, 1, 0), 10, 0xc05cff);
        this.mark.visible = false;
        this.facing = Math.atan2(-(p.x - this.pos.x), -(p.z - this.pos.z));
        this.state = 'windup'; this.t = 0; this.warn.visible = true;
      }
    } else if (this.state === 'windup') {
      this.t += dt;
      if (this.t < 0.25) this.faceToward(dx, dz, dt, 14);
      this.alert = Math.min(1, this.t / 0.42);
      this.warn.material.opacity = 0.15 + 0.45 * this.alert;
      this.armRx += (-2.6 - this.armRx) * (1 - Math.exp(-16 * dt));
      if (this.t >= 0.42) {
        this.state = 'strike'; this.t = 0; this.warn.visible = false;
        const f = fwd(this); this.vel.set(f.x * 10, 0, f.z * 10);
        fanHit(this, ctx, 3.0, Math.cos(THREE.MathUtils.degToRad(60)), 16);
      }
    } else if (this.state === 'strike') {
      this.t += dt;
      this.armRx += (1.25 - this.armRx) * (1 - Math.exp(-40 * dt));
      if (this.t >= 0.15) { this.state = 'recover'; this.t = 0; this.alert = 0; this.attacking = false; }
    } else if (this.state === 'recover') {
      this.t += dt;
      if (this.t >= 0.8) { this.state = 'stalk'; this.cd = rand(2.0, 3.2); this.orbit = -this.orbit; }
    }
  }
  update(dt, ctx) {
    super.update(dt, ctx);
    if (!this.alive) { this.mark.visible = false; return; }
    // 숨어 다닐 때는 거의 투명, 공격할 때와 맞았을 때는 드러난다
    const want = this.state === 'stalk' && !this.broken && this.flash <= 0 ? 0.22 : 1;
    this.cloak += (want - this.cloak) * (1 - Math.exp(-8 * dt));
    for (const m of this.stdMats) m.opacity = this.cloak;
    for (const m of this.rimMats) m.opacity = Math.min(1, this.cloak + 0.3);
    if (this.state === 'stalk') this.armRx += (0.25 - this.armRx) * (1 - Math.exp(-10 * dt));
    walkAnim(this, dt, this.armRx, this.state === 'windup' ? 'windup' : this.state === 'strike' ? 'strike' : this.state);
  }
}

// =================== 자폭 롤러: 굴러와 붙으면 붉은 원이 커지고 0.8초 뒤 터진다 ===================
export class Bomber extends Enemy {
  constructor(x, z) {
    super({ maxHp: 30, radius: 0.55, maxPosture: 12, hitY: 0.6 });
    this.pos.set(x, 0, z);
    this.state = 'chase'; this.t = 0; this.speed = 7.2;
    if (robotsReady()) { // 작은 로봇이 달려와 붙는다
      this.J = buildGuardRobot(this, { body: 'heavy', size: 0.55, shell: 0x6a4420, dark: 0x1a1410, rim: 0xff4020, weapon: 'none' });
      this.anim = new GuardAnimator(this.J);
      this.ball = new THREE.Group(); this._last = V3(x, 0, z);
    } else {
      const shell = this.std(0x4a3420), dark = this.std(0x15120e), eye = this.rim(0xff4020);
      shell.roughness = 0.4; shell.metalness = 0.7;
      this.ball = new THREE.Group(); this.ball.position.y = 0.55; this.body.add(this.ball);
      this.ball.add(mesh(new THREE.SphereGeometry(0.5, 18, 12), shell));
      this.ball.add(mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 24), dark));
      for (let i = 0; i < 8; i++) { // 표면의 경고등
        const a = (i / 8) * Math.PI * 2;
        this.ball.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), eye, Math.cos(a) * 0.48, Math.sin(a) * 0.48 * 0.3, Math.sin(a) * 0.48));
      }
      this.body.add(mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.25, 10), dark, 0, 1.1, 0));
      this.body.add(mesh(new THREE.SphereGeometry(0.09, 8, 6), eye, 0, 1.25, 0)); // 머리 위 점멸등
    }
    this.ring = mesh(new THREE.CircleGeometry(1, 36).rotateX(-Math.PI / 2), warnMaterial(), 0, 0.06, 0); this.ring.visible = false; this.group.add(this.ring);
    this.R = 3.2;
    this.beep = 0;
  }
  cancelAttack() {} // 한 번 점화되면 멈추지 않는다
  ai(dt, ctx) {
    const p = ctx.player.pos, dx = p.x - this.pos.x, dz = p.z - this.pos.z, dist = Math.hypot(dx, dz) || 1e-6;
    if (this.state === 'chase') {
      this.faceToward(dx, dz, dt, 8);
      this.pos.x += (dx / dist) * this.speed * dt; this.pos.z += (dz / dist) * this.speed * dt;
      this.ball.rotation.x -= this.speed * dt / 0.5;
      if (dist < 2.3) { this.state = 'arm'; this.t = 0; this.attacking = true; this.dodged = false; this.ring.visible = true; }
    } else if (this.state === 'arm') {
      this.t += dt;
      this.alert = Math.min(1, this.t / 0.8);
      const s = this.R * (0.4 + 0.6 * this.alert);
      this.ring.scale.set(s, 1, s);
      this.ring.material.opacity = 0.12 + 0.4 * this.alert + (Math.sin(this.t * 40) > 0 ? 0.1 : 0);
      this.beep -= dt;
      if (this.beep <= 0) { audio.warn(); this.beep = 0.25 - 0.15 * this.alert; }
      if (this.t >= 0.8) this._explode(ctx, true);
    }
  }
  _explode(ctx, harmful) {
    const c = V3(this.pos.x, 0.6, this.pos.z), p = ctx.player.pos;
    ctx.fx.sparks(c, V3(0, 1, 0), 40, 0xff6a20);
    ctx.fx.chunks(c, V3(0, 1, 0), 14);
    ctx.fx.shockwave(this.pos, 0xff5a20, this.R / 6);
    ctx.rig.shake(0.12);
    audio.hit(true, true);
    if (harmful && Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < this.R) ctx.player.hurt(26, V3(p.x - this.pos.x, 0, p.z - this.pos.z).normalize(), this);
    this.hp = 0; this.alive = false; this.dead = true; this.group.visible = false; this.attacking = false;
  }
  update(dt, ctx) {
    super.update(dt, ctx);
    if (!this.alive) return;
    if (this.anim) { // 점화되면 제자리에서 떨며 몸을 웅크린다
      walkAnim(this, dt, this.state === 'arm' ? -2.4 : 0.25, this.state === 'arm' ? 'windup' : 'chase', null);
      this.body.position.y = this.state === 'arm' ? Math.abs(Math.sin(this.t * 50)) * 0.05 : 0;
    } else this.ball.position.y = 0.55 + (this.state === 'arm' ? Math.sin(this.t * 50) * 0.04 : 0);
  }
}

// =================== 중화기 사수: 거리를 두고 조준선을 그은 뒤 5연사 ===================
export class Gunner extends Enemy {
  constructor(x, z) {
    super({ maxHp: 120, radius: 0.8, maxPosture: 70 });
    this.pos.set(x, 0, z);
    this.state = 'hover'; this.t = 0; this.cd = 1.6 + Math.random() * 1.4;
    this.strafe = Math.random() < 0.5 ? 1 : -1; this.strafeT = 2;
    this.J = buildGuardRobot(this, { shell: 0x4a4430, rim: 0xffb020, vent: 0xffb020, weapon: 'rifle' });
    this.anim = new GuardAnimator(this.J);
    this.body.scale.setScalar(1.12);
    this.aim = laser();
    this.locked = V3(0, 0, 0);
    this.shots = 0;
    this._last = V3(x, 0, z);
  }
  cancelAttack() { this.state = 'hover'; this.cd = 1.4; this.aim.visible = false; }
  ai(dt, ctx) {
    if (!this.aim.parent) ctx.scene.add(this.aim);
    const p = ctx.player.pos, dx = p.x - this.pos.x, dz = p.z - this.pos.z, dist = Math.hypot(dx, dz) || 1e-6;
    const nx = dx / dist, nz = dz / dist;
    this.faceToward(dx, dz, dt, this.state === 'burst' ? 1.5 : 7);
    const muzzle = () => { const f = fwd(this); return V3(this.pos.x + f.x * 1.1, 1.55, this.pos.z + f.z * 1.1); };
    if (this.state === 'hover') {
      this.attacking = false;
      this.cd -= dt; this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = 1.5 + Math.random() * 2; }
      const radial = dist < 9 ? -1 : dist > 15 ? 1 : 0;
      this.pos.x += (nx * radial - nz * this.strafe * 0.5) * 3.6 * dt;
      this.pos.z += (nz * radial + nx * this.strafe * 0.5) * 3.6 * dt;
      if (this.cd <= 0 && dist < 26 && ctx.attackers() < ctx.maxAtk) { this.state = 'windup'; this.t = 0; this.attacking = true; this.dodged = false; this.aim.visible = true; }
    } else if (this.state === 'windup') {
      this.t += dt;
      this.alert = Math.min(1, this.t / 0.85);
      if (this.t < 0.55) this.locked.set(p.x, p.y + 1.1, p.z);
      const from = muzzle(), len = from.distanceTo(this.locked);
      this.aim.position.copy(from).lerp(this.locked, 0.5);
      this.aim.scale.set(this.t < 0.55 ? 1 : 2.4, this.t < 0.55 ? 1 : 2.4, len);
      this.aim.lookAt(this.locked);
      this.aim.material.opacity = this.t < 0.55 ? 0.25 + 0.2 * this.alert : 0.9;
      if (this.t >= 0.85) { this.state = 'burst'; this.t = 0; this.shots = 0; this.aim.visible = false; }
    } else if (this.state === 'burst') {
      this.t += dt;
      while (this.shots < 5 && this.t >= this.shots * 0.09) {
        const from = muzzle();
        const base = this.locked.clone().sub(from).normalize();
        const d = base.applyAxisAngle(V3(0, 1, 0), (this.shots - 2) * 0.055 + rand(-0.02, 0.02));
        ctx.projectiles.spawn(from, d.multiplyScalar(30), 8, this);
        this.vel.addScaledVector(d.clone().normalize(), -0.6);
        this.shots++;
      }
      if (this.shots >= 5) { this.state = 'recover'; this.t = 0; this.alert = 0; this.attacking = false; }
    } else if (this.state === 'recover') {
      this.t += dt;
      if (this.t >= 0.9) { this.state = 'hover'; this.cd = rand(2.0, 3.0); }
    }
  }
  update(dt, ctx) {
    super.update(dt, ctx);
    if (!this.alive) { this.aim.visible = false; return; }
    if (this.broken) this.aim.visible = false;
    const aiming = this.state === 'windup' || this.state === 'burst';
    walkAnim(this, dt, aiming ? -1.3 : -0.9, this.state, { armL: aiming ? -1.2 : -0.9, elbowL: -0.9 });
  }
}
