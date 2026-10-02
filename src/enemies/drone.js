import * as THREE from 'three';
import { Enemy } from './enemy.js';
import { buildDrone } from '../characters/robots.js';

const WINDUP = 0.85;
const LOCK_AT = 0.55;   // 이 시점 이후 조준선이 고정된다
const RECOVER = 0.5;

// 드론: 거리를 두고 떠다니다가, 조준선(예고) 후 탄환을 발사한다.
export class Drone extends Enemy {
  constructor(x, z) {
    super({ maxHp: 50, radius: 0.6, knockMul: 0.6, hitY: 2.4, maxPosture: 30, parryPosture: 30 });
    this.flying = true;
    this.pos.set(x, 2.4, z);
    this.state = 'hover';
    this.t = 0;
    this.cd = 1.2 + Math.random() * 1.5;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 2 + Math.random() * 2;
    this.bob = Math.random() * 6;
    this.locked = new THREE.Vector3();

    this.J = buildDrone(this);
    this._last = new THREE.Vector3(x, 2.4, z);
    this.tilt = new THREE.Vector2();

    this.aim = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.035, 1),
      new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.aim.frustumCulled = false;
    this.aim.visible = false;
  }

  cancelAttack() {
    this.state = 'hover';
    this.cd = 1.0;
    this.aim.visible = false;
  }

  ai(dt, ctx) {
    if (!this.aim.parent) ctx.scene.add(this.aim);
    const p = ctx.player.pos;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 1e-6;
    const nx = dx / dist, nz = dz / dist;
    this.bob += dt * 2;
    this.pos.y = 2.4 + Math.sin(this.bob) * 0.15;
    this.faceToward(dx, dz, dt, 8);

    if (this.state === 'hover') {
      this.attacking = false;
      this.cd -= dt;
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = 2 + Math.random() * 2.5; }
      // 8~13m 유지하며 옆으로 선회
      let radial = 0;
      if (dist < 8) radial = -1; else if (dist > 13) radial = 1;
      const sp = 3.6;
      this.pos.x += (nx * radial + -nz * this.strafe * 0.6) * sp * dt;
      this.pos.z += (nz * radial + nx * this.strafe * 0.6) * sp * dt;
      if (this.cd <= 0 && dist < 20 && ctx.attackers() < ctx.maxAtk) {
        this.state = 'windup'; this.t = 0; this.attacking = true;
        this.aim.visible = true;
      }
    } else if (this.state === 'windup') {
      this.t += dt;
      this.alert = Math.min(1, this.t / WINDUP);
      const from = this.pos;
      if (this.t < LOCK_AT) this.locked.set(p.x, p.y + 1.1, p.z); // 이후 고정
      const to = this.locked;
      const len = from.distanceTo(to);
      this.aim.position.copy(from).lerp(to, 0.5);
      this.aim.scale.set(1, 1, len);
      this.aim.lookAt(to);
      // 고정 후에는 선이 굵고 밝아져 "곧 발사"를 알린다
      this.aim.material.opacity = this.t < LOCK_AT ? 0.25 + 0.2 * this.alert : 0.9;
      this.aim.scale.x = this.aim.scale.y = this.t < LOCK_AT ? 1 : 2.2;
      if (this.t >= WINDUP) {
        const dir = to.clone().sub(from).normalize();
        ctx.projectiles.spawn(from.clone().addScaledVector(dir, 0.6), dir.multiplyScalar(20), 8, this);
        this.state = 'recover'; this.t = 0; this.alert = 0; this.attacking = false;
        this.aim.visible = false;
        this.vel.addScaledVector(dir, -3); // 반동
      }
    } else if (this.state === 'recover') {
      this.t += dt;
      if (this.t >= RECOVER) { this.state = 'hover'; this.cd = 1.3 + Math.random() * 1.2; }
    }
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    if (!this.alive) this.aim.visible = false;
    if (this.broken) { // 무너지면 아래로 내려와 처형할 수 있다
      this.pos.y += (1.3 - this.pos.y) * (1 - Math.exp(-6 * dt));
      this.aim.visible = false;
    }
    this.hitY = this.pos.y;
    // 로터 회전 + 이동 방향으로 기울기 (로컬 좌표 기준)
    for (let i = 0; i < this.J.rotors.length; i++) this.J.rotors[i].rotation.y += dt * (i % 2 ? 38 : -38);
    if (dt > 0) {
      const vx = (this.pos.x - this._last.x) / dt, vz = (this.pos.z - this._last.z) / dt;
      const c = Math.cos(this.facing), s = Math.sin(this.facing);
      const lx = c * vx - s * vz, lz = s * vx + c * vz; // 로컬 x(오른쪽), z(뒤)
      this.tilt.x += (THREE.MathUtils.clamp(lz * 0.06, -0.35, 0.35) - this.tilt.x) * (1 - Math.exp(-5 * dt));
      this.tilt.y += (THREE.MathUtils.clamp(-lx * 0.06, -0.35, 0.35) - this.tilt.y) * (1 - Math.exp(-5 * dt));
      this.body.rotation.x += this.tilt.x + (this.state === 'windup' ? -0.15 * this.alert : 0);
      this.body.rotation.z += this.tilt.y;
    }
    this._last.copy(this.pos);
  }
}
