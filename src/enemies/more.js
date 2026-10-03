import * as THREE from 'three';
import { Enemy, warnMaterial } from './enemy.js';
import { buildGuardRobot, GuardAnimator, buildDrone } from '../characters/robots.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const fwd = (e) => V3(-Math.sin(e.facing), 0, -Math.cos(e.facing));
const rand = (a, b) => a + Math.random() * (b - a);

// 부채꼴 근접 판정: 앞쪽 range 이내, 정면 기준 cosArc 이상이면 피격
function fanHit(e, ctx, range, cosArc, dmg) {
  const p = ctx.player.pos, dx = p.x - e.pos.x, dz = p.z - e.pos.z, d = Math.hypot(dx, dz) || 1e-6;
  const f = fwd(e);
  if (d < range && (f.x * dx + f.z * dz) / d > cosArc) return ctx.player.hurt(dmg, f, e);
  return false;
}
function step(e, dx, dz, dist, speed, dt) { e.pos.x += (dx / dist) * speed * dt; e.pos.z += (dz / dist) * speed * dt; }
function rectWarn(w, l, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2), warnMaterial());
  m.position.set(0, 0.06, z); m.visible = false; return m;
}
function laser() {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 1),
    new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.frustumCulled = false; m.visible = false; return m;
}

// =================== 방패 로봇: 정면은 막힌다. 옆/뒤를 치거나 방패를 깨라. ===================
export class ShieldBot extends Enemy {
  constructor(x, z) {
    super({ maxHp: 110, radius: 0.85, maxPosture: 60 });
    this.pos.set(x, 0, z);
    this.guards = true;
    this.state = 'chase'; this.t = 0; this.cd = 1 + Math.random();
    this.J = buildGuardRobot(this, { shell: 0x4a5470, rim: 0x00e5ff, vent: 0x00e5ff, weapon: 'none', shield: true });
    this.anim = new GuardAnimator(this.J);
    this.body.scale.setScalar(1.08);
    this.warn = rectWarn(2.8, 3.2, -1.8); this.group.add(this.warn);
    this._last = V3(x, 0, z);
    this.shieldZ = 0;
  }
  cancelAttack() { this.state = 'chase'; this.t = 0; this.cd = 1; this.warn.visible = false; }
  ai(dt, ctx) {
    const p = ctx.player.pos, dx = p.x - this.pos.x, dz = p.z - this.pos.z, dist = Math.hypot(dx, dz) || 1e-6;
    if (this.state === 'chase') {
      this.attacking = false;
      this.faceToward(dx, dz, dt, 5);
      this.cd -= dt;
      if (dist > 2.6) step(this, dx, dz, dist, 3.6, dt);
      this.shieldZ += (0 - this.shieldZ) * (1 - Math.exp(-10 * dt));
      if (dist < 3.6 && this.cd <= 0 && ctx.attackers() < ctx.maxAtk) { this.state = 'windup'; this.t = 0; this.attacking = true; this.dodged = false; this.warn.visible = true; }
    } else if (this.state === 'windup') { // 방패를 뒤로 당긴다
      this.t += dt;
      if (this.t < 0.55) this.faceToward(dx, dz, dt, 10);
      this.alert = Math.min(1, this.t / 0.85);
      this.warn.material.opacity = 0.12 + 0.4 * this.alert;
      this.shieldZ += (0.55 - this.shieldZ) * (1 - Math.exp(-12 * dt));
      if (this.t >= 0.85) {
        this.state = 'strike'; this.t = 0; this.warn.visible = false;
        const f = fwd(this); this.vel.set(f.x * 13, 0, f.z * 13);
        fanHit(this, ctx, 3.3, Math.cos(THREE.MathUtils.degToRad(55)), 15);
      }
    } else if (this.state === 'strike') {
      this.t += dt;
      this.shieldZ += (-0.5 - this.shieldZ) * (1 - Math.exp(-40 * dt));
      if (this.t >= 0.2) { this.state = 'recover'; this.t = 0; this.alert = 0; this.attacking = false; }
    } else if (this.state === 'recover') {
      this.t += dt;
      if (this.t >= 0.7) { this.state = 'chase'; this.cd = 0.8 + Math.random() * 0.7; }
    }
  }
  update(dt, ctx) {
    super.update(dt, ctx);
    if (!this.alive) return;
    const sp = dt > 0 ? Math.hypot(this.pos.x - this._last.x, this.pos.z - this._last.z) / dt : 0;
    this._last.copy(this.pos);
    // 방패를 든 왼팔
    this.anim.update(dt, Math.min(sp, 6), 0.2, this.state, this.broken, { armL: -1.1, elbowL: -1.1 });
    if (this.J.shield) this.J.shield.position.z = -0.62 - this.shieldZ * 0.5;
    if (this.broken) this.J.shield.rotation.x = -0.6;
    else this.J.shield.rotation.x = 0;
  }
}

// =================== 저격수: 멀리서 레이저로 조준 → 고정 → 발사 ===================
export class Sniper extends Enemy {
  constructor(x, z) {
    super({ maxHp: 55, radius: 0.65, maxPosture: 35 });
    this.pos.set(x, 0, z);
    this.state = 'hover'; this.t = 0; this.cd = 1.5 + Math.random() * 2;
    this.strafe = Math.random() < 0.5 ? 1 : -1; this.strafeT = 2;
    this.J = buildGuardRobot(this, { shell: 0x2c3150, rim: 0xff3b30, vent: 0xff3b30, weapon: 'rifle' });
    this.anim = new GuardAnimator(this.J);
    this.body.scale.set(0.82, 0.92, 0.82);
    this.aim = laser();
    this.locked = V3(0, 0, 0);
    this._last = V3(x, 0, z);
  }
  cancelAttack() { this.state = 'hover'; this.cd = 1.2; this.aim.visible = false; }
  ai(dt, ctx) {
    if (!this.aim.parent) ctx.scene.add(this.aim);
    const p = ctx.player.pos, dx = p.x - this.pos.x, dz = p.z - this.pos.z, dist = Math.hypot(dx, dz) || 1e-6;
    const nx = dx / dist, nz = dz / dist;
    this.faceToward(dx, dz, dt, this.state === 'windup' && this.t > 1.0 ? 2 : 8);
    if (this.state === 'hover') {
      this.attacking = false;
      this.cd -= dt; this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = 1.5 + Math.random() * 2; }
      const radial = dist < 14 ? -1 : dist > 26 ? 1 : 0;
      this.pos.x += (nx * radial - nz * this.strafe * 0.5) * 4.6 * dt;
      this.pos.z += (nz * radial + nx * this.strafe * 0.5) * 4.6 * dt;
      if (this.cd <= 0 && dist < 38 && ctx.attackers() < ctx.maxAtk) { this.state = 'windup'; this.t = 0; this.attacking = true; this.dodged = false; this.aim.visible = true; }
    } else if (this.state === 'windup') {
      this.t += dt;
      this.alert = Math.min(1, this.t / 1.5);
      const f = fwd(this);
      const from = V3(this.pos.x + f.x * 0.9, 1.5, this.pos.z + f.z * 0.9);
      if (this.t < 1.0) this.locked.set(p.x, p.y + 1.1, p.z);
      const len = from.distanceTo(this.locked);
      this.aim.position.copy(from).lerp(this.locked, 0.5);
      this.aim.scale.set(this.t < 1.0 ? 1 : 2.4, this.t < 1.0 ? 1 : 2.4, len);
      this.aim.lookAt(this.locked);
      this.aim.material.opacity = this.t < 1.0 ? 0.22 + 0.2 * this.alert : 0.95;
      if (this.t >= 1.5) {
        const dir = this.locked.clone().sub(from).normalize();
        ctx.projectiles.spawn(from.clone().addScaledVector(dir, 0.5), dir.multiplyScalar(56), 16, this);
        this.state = 'recover'; this.t = 0; this.alert = 0; this.attacking = false; this.aim.visible = false;
        this.vel.addScaledVector(dir, -2);
      }
    } else if (this.state === 'recover') {
      this.t += dt;
      if (this.t >= 0.8) { this.state = 'hover'; this.cd = 2.2 + Math.random() * 1.4; }
    }
  }
  update(dt, ctx) {
    super.update(dt, ctx);
    if (!this.alive) { this.aim.visible = false; return; }
    if (this.broken) this.aim.visible = false;
    const sp = dt > 0 ? Math.hypot(this.pos.x - this._last.x, this.pos.z - this._last.z) / dt : 0;
    this._last.copy(this.pos);
    const aiming = this.state === 'windup';
    this.anim.update(dt, Math.min(sp, 6), aiming ? -1.3 : -0.9, this.state, this.broken, { armL: aiming ? -1.2 : -0.9, elbowL: -0.9 });
    if (aiming) this.body.rotation.x += -0.05;
  }
}

// =================== 돌진 메카: 예고선이 그어지면 그 방향으로 돌진. 벽에 박으면 크게 무너진다. ===================
export class Mech extends Enemy {
  constructor(x, z) {
    super({ maxHp: 150, radius: 1.0, maxPosture: 75 });
    this.pos.set(x, 0, z);
    this.state = 'chase'; this.t = 0; this.cd = 1.5 + Math.random() * 1.5;
    this.J = buildGuardRobot(this, { body: 'heavy', shell: 0x5a4a30, rim: 0xffb347, vent: 0xffb347, weapon: 'none' });
    this.anim = new GuardAnimator(this.J);
    this.body.scale.setScalar(1.28);
    // 머리 위 뿔 (돌진 형상)
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.7, 6).rotateX(-Math.PI / 2), this.std(0x2a2a30));
    horn.position.set(0, 1.85, -0.5); this.body.add(horn);
    this.warn = rectWarn(2.6, 18, -9.2); this.group.add(this.warn);
    this.dir = V3(0, 0, -1); this.moved = 0; this.hitDone = false;
    this._last = V3(x, 0, z);
  }
  cancelAttack() { this.state = 'chase'; this.t = 0; this.cd = 1.4; this.warn.visible = false; }
  ai(dt, ctx) {
    const p = ctx.player.pos, dx = p.x - this.pos.x, dz = p.z - this.pos.z, dist = Math.hypot(dx, dz) || 1e-6;
    if (this.state === 'chase') {
      this.attacking = false;
      this.faceToward(dx, dz, dt, 6);
      this.cd -= dt;
      if (dist > 9) step(this, dx, dz, dist, 3.8, dt);
      if (this.cd <= 0 && dist > 5 && dist < 24 && ctx.attackers() < ctx.maxAtk) { this.state = 'windup'; this.t = 0; this.attacking = true; this.dodged = false; this.warn.visible = true; }
    } else if (this.state === 'windup') {
      this.t += dt;
      if (this.t < 0.7) this.faceToward(dx, dz, dt, 14);
      this.alert = Math.min(1, this.t / 1.1);
      this.warn.material.opacity = 0.1 + 0.42 * this.alert;
      this.warn.scale.x = 1 + Math.sin(this.t * 30) * 0.03 * this.alert;
      if (this.t >= 1.1) {
        this.state = 'rush'; this.t = 0; this.moved = 0; this.hitDone = false; this.warn.visible = false;
        this.dir.copy(fwd(this));
      }
    } else if (this.state === 'rush') {
      const sp = 30, stepLen = sp * dt;
      const ahead = V3(this.pos.x + this.dir.x * (stepLen + this.radius), 0, this.pos.z + this.dir.z * (stepLen + this.radius));
      if (ctx.world?.blocked(ahead)) { // 벽에 충돌: 크게 무너진다
        ctx.rig.shake(0.14);
        ctx.fx.sparks(V3(this.pos.x + this.dir.x * 1.2, 1.4, this.pos.z + this.dir.z * 1.2), this.dir.clone().negate(), 26, 0xffb347);
        this.state = 'recover'; this.t = 0; this.alert = 0; this.attacking = false;
        this.vel.set(0, 0, 0);
        if (this.addPosture(70)) ctx.combat.onPop?.('BREAK', '#ffc400');
        else this.stagger = 1.6;
        return;
      }
      this.pos.x += this.dir.x * stepLen; this.pos.z += this.dir.z * stepLen; this.moved += stepLen;
      if (!this.hitDone) {
        const ddx = p.x - this.pos.x, ddz = p.z - this.pos.z;
        if (Math.hypot(ddx, ddz) < 1.8 && ctx.player.hurt(24, this.dir.clone(), this)) this.hitDone = true;
      }
      if (this.moved >= 18) { this.state = 'recover'; this.t = 0; this.alert = 0; this.attacking = false; }
    } else if (this.state === 'recover') {
      this.t += dt;
      if (this.t >= 1.0) { this.state = 'chase'; this.cd = 1.5 + Math.random() * 1.2; }
    }
  }
  update(dt, ctx) {
    super.update(dt, ctx);
    if (!this.alive) return;
    const sp = dt > 0 ? Math.hypot(this.pos.x - this._last.x, this.pos.z - this._last.z) / dt : 0;
    this._last.copy(this.pos);
    const rushing = this.state === 'rush', wind = this.state === 'windup';
    this.anim.update(dt, rushing ? 9 : Math.min(sp, 6), 0.2, wind ? 'windup' : rushing ? 'strike' : this.state, this.broken);
    if (rushing) this.body.rotation.x += 0.35; // 앞으로 수그린 돌진 자세
    if (wind) this.body.rotation.x += -0.12 * this.alert;
  }
}

// =================== 엘리트: 집행자 — 3연격 패턴(가로, 가로, 내려찍기) ===================
const COMBO = [
  { w: 0.55, a: 0.12, dmg: 14, range: 4.0, cos: Math.cos(THREE.MathUtils.degToRad(75)), lunge: 9, warnW: 4.4 },
  { w: 0.4, a: 0.12, dmg: 14, range: 4.0, cos: Math.cos(THREE.MathUtils.degToRad(75)), lunge: 9, warnW: 4.4 },
  { w: 0.95, a: 0.22, dmg: 30, range: 4.8, cos: Math.cos(THREE.MathUtils.degToRad(50)), lunge: 15, warnW: 3.2 },
];
export class Executioner extends Enemy {
  constructor(x, z) {
    super({ maxHp: 340, radius: 1.0, maxPosture: 160 });
    this.elite = true;
    this.pos.set(x, 0, z);
    this.state = 'chase'; this.t = 0; this.cd = 1.2; this.stepI = 0; this.phase = 'wind';
    this.J = buildGuardRobot(this, { shell: 0x3a1822, rim: 0xff2848, vent: 0xff2848, weapon: 'sword' });
    this.anim = new GuardAnimator(this.J);
    this.body.scale.setScalar(1.3);
    this.warn = rectWarn(4.4, 4.4, -2.4); this.group.add(this.warn);
    this.armRx = 0.25;
    this._last = V3(x, 0, z);
  }
  cancelAttack() { this.state = 'chase'; this.t = 0; this.stepI = 0; this.cd = 1.0; this.warn.visible = false; }
  ai(dt, ctx) {
    const p = ctx.player.pos, dx = p.x - this.pos.x, dz = p.z - this.pos.z, dist = Math.hypot(dx, dz) || 1e-6;
    if (this.state === 'chase') {
      this.attacking = false;
      this.faceToward(dx, dz, dt, 7);
      this.cd -= dt;
      this.armRx += (0.25 - this.armRx) * (1 - Math.exp(-10 * dt));
      if (dist > 3.4) step(this, dx, dz, dist, 5.4, dt);
      if (dist < 5.2 && this.cd <= 0 && ctx.attackers() < ctx.maxAtk) { this.state = 'combo'; this.stepI = 0; this.phase = 'wind'; this.t = 0; this.attacking = true; this.dodged = false; this.warn.visible = true; this.warn.scale.x = COMBO[0].warnW / 4.4; }
    } else if (this.state === 'combo') {
      const c = COMBO[this.stepI];
      this.t += dt;
      if (this.phase === 'wind') {
        if (this.t < c.w * 0.7) this.faceToward(dx, dz, dt, 14);
        this.alert = Math.min(1, this.t / c.w);
        this.warn.visible = true; this.warn.material.opacity = 0.12 + 0.42 * this.alert;
        this.armRx += (-2.5 - this.armRx) * (1 - Math.exp(-16 * dt));
        if (this.t >= c.w) {
          this.phase = 'act'; this.t = 0; this.warn.visible = false;
          const f = fwd(this); this.vel.set(f.x * c.lunge, 0, f.z * c.lunge);
          fanHit(this, ctx, c.range, c.cos, c.dmg);
        }
      } else if (this.phase === 'act') {
        this.armRx += (1.25 - this.armRx) * (1 - Math.exp(-40 * dt));
        if (this.t >= c.a) {
          if (this.stepI < COMBO.length - 1) { // 다음 타
            this.stepI++; this.phase = 'wind'; this.t = 0; this.dodged = false; this.warn.scale.x = COMBO[this.stepI].warnW / 4.4;
          } else { this.state = 'recover'; this.t = 0; this.alert = 0; this.attacking = false; }
        }
      }
    } else if (this.state === 'recover') {
      this.t += dt;
      if (this.t >= 1.1) { this.state = 'chase'; this.cd = 0.7 + Math.random() * 0.7; }
    }
  }
  update(dt, ctx) {
    super.update(dt, ctx);
    if (!this.alive) return;
    const sp = dt > 0 ? Math.hypot(this.pos.x - this._last.x, this.pos.z - this._last.z) / dt : 0;
    this._last.copy(this.pos);
    const st = this.state === 'combo' ? (this.phase === 'wind' ? 'windup' : 'strike') : this.state;
    this.anim.update(dt, Math.min(sp, 6), this.armRx, st, this.broken);
  }
}

// =================== 엘리트: 센티넬 — 3연발 부채꼴 사격 / 전방위 탄막 ===================
export class Sentinel extends Enemy {
  constructor(x, z) {
    super({ maxHp: 260, radius: 1.0, hitY: 2.0, maxPosture: 130 });
    this.elite = true; this.flying = true;
    this.pos.set(x, 2.0, z);
    this.state = 'hover'; this.t = 0; this.cd = 1.8; this.pattern = 0;
    this.strafe = 1; this.strafeT = 2.5; this.bob = Math.random() * 6;
    this.J = buildDrone(this);
    this.body.scale.setScalar(1.9);
    this.aim = laser();
    this.locked = V3(0, 0, 0);
    this._last = V3(x, 2.0, z); this.tilt = new THREE.Vector2();
  }
  cancelAttack() { this.state = 'hover'; this.cd = 1.2; this.aim.visible = false; }
  ai(dt, ctx) {
    if (!this.aim.parent) ctx.scene.add(this.aim);
    const p = ctx.player.pos, dx = p.x - this.pos.x, dz = p.z - this.pos.z, dist = Math.hypot(dx, dz) || 1e-6;
    const nx = dx / dist, nz = dz / dist;
    this.bob += dt * 1.6; this.pos.y = 2.0 + Math.sin(this.bob) * 0.15; // 낮게 떠서 탄막이 몸 높이로 날아온다
    this.faceToward(dx, dz, dt, 6);
    if (this.state === 'hover') {
      this.attacking = false;
      this.cd -= dt; this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = 2 + Math.random() * 2; }
      const radial = dist < 10 ? -1 : dist > 17 ? 1 : 0;
      this.pos.x += (nx * radial - nz * this.strafe * 0.7) * 4.2 * dt;
      this.pos.z += (nz * radial + nx * this.strafe * 0.7) * 4.2 * dt;
      if (this.cd <= 0 && ctx.attackers() < ctx.maxAtk) { this.state = 'windup'; this.t = 0; this.attacking = true; this.dodged = false; this.aim.visible = this.pattern % 2 === 0; }
    } else if (this.state === 'windup') {
      this.t += dt;
      const fan = this.pattern % 2 === 0, T = fan ? 1.1 : 1.3;
      this.alert = Math.min(1, this.t / T);
      if (fan) {
        if (this.t < 0.7) this.locked.set(p.x, p.y + 1.1, p.z);
        const len = this.pos.distanceTo(this.locked);
        this.aim.position.copy(this.pos).lerp(this.locked, 0.5);
        this.aim.scale.set(this.t < 0.7 ? 1.4 : 3.2, this.t < 0.7 ? 1.4 : 3.2, len);
        this.aim.lookAt(this.locked);
        this.aim.material.opacity = this.t < 0.7 ? 0.25 + 0.2 * this.alert : 0.95;
      }
      if (this.t >= T) {
        if (fan) { // 3연 부채꼴
          const base = this.locked.clone().sub(this.pos).normalize();
          for (const a of [-0.22, 0, 0.22]) {
            const d = base.clone().applyAxisAngle(V3(0, 1, 0), a);
            ctx.projectiles.spawn(this.pos.clone().addScaledVector(d, 1.4), d.multiplyScalar(17), 9, this);
          }
        } else { // 전방위 탄막: 몸 높이에서 수평으로 퍼진다
          ctx.projectiles.ring(this.pos.x, this.pos.z, 12, 11, 8, this);
        }
        this.pattern++;
        this.state = 'recover'; this.t = 0; this.alert = 0; this.attacking = false; this.aim.visible = false;
      }
    } else if (this.state === 'recover') {
      this.t += dt;
      if (this.t >= 0.7) { this.state = 'hover'; this.cd = 1.8 + Math.random() * 1.0; }
    }
  }
  update(dt, ctx) {
    super.update(dt, ctx);
    if (!this.alive) { this.aim.visible = false; return; }
    if (this.broken) { this.aim.visible = false; this.pos.y += (1.2 - this.pos.y) * (1 - Math.exp(-5 * dt)); }
    this.hitY = this.pos.y;
    for (let i = 0; i < this.J.rotors.length; i++) this.J.rotors[i].rotation.y += dt * (i % 2 ? 34 : -34);
    if (dt > 0) {
      const vx = (this.pos.x - this._last.x) / dt, vz = (this.pos.z - this._last.z) / dt;
      const c = Math.cos(this.facing), s = Math.sin(this.facing);
      const lx = c * vx - s * vz, lz = s * vx + c * vz;
      this.tilt.x += (THREE.MathUtils.clamp(lz * 0.05, -0.3, 0.3) - this.tilt.x) * (1 - Math.exp(-5 * dt));
      this.tilt.y += (THREE.MathUtils.clamp(-lx * 0.05, -0.3, 0.3) - this.tilt.y) * (1 - Math.exp(-5 * dt));
      this.body.rotation.x += this.tilt.x; this.body.rotation.z += this.tilt.y;
    }
    this._last.copy(this.pos);
  }
}
