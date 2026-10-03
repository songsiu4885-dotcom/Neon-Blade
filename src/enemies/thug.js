import * as THREE from 'three';
import { Enemy, warnMaterial } from './enemy.js';
import { buildGuardRobot, GuardAnimator } from '../characters/robots.js';

const WINDUP = 0.52;   // 예고 시간
const STRIKE = 0.15;
const RECOVER = 0.55;

// 경비 로봇: 접근 → 몽둥이를 치켜들고(예고) → 내리치며 돌진 → 빈틈
export class Thug extends Enemy {
  constructor(x, z) {
    super({ maxHp: 90, radius: 0.75, maxPosture: 50, parryPosture: 30 });
    this.pos.set(x, 0, z);
    this.state = 'chase';
    this.t = 0;
    this.cd = 0.6 + Math.random() * 0.8;
    this.speed = 5.0;
    this.dmg = 13;

    this.J = buildGuardRobot(this, { kit: 'thug' });
    this.anim = new GuardAnimator(this.J);
    this.arm = this.J.shoulderR;
    this.armRx = 0.25;
    this._last = new THREE.Vector3(x, 0, z);

    // 경고: 앞쪽 부채꼴(사각) 영역
    this.warn = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.6).rotateX(-Math.PI / 2), warnMaterial());
    this.warn.position.set(0, 0.06, -1.7);
    this.warn.visible = false;
    this.group.add(this.warn);
  }

  cancelAttack() {
    this.state = 'chase';
    this.t = 0;
    this.cd = 0.8;
    this.warn.visible = false;
  }

  ai(dt, ctx) {
    const p = ctx.player.pos;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 1e-6;
    const fx = -Math.sin(this.facing), fz = -Math.cos(this.facing);

    switch (this.state) {
      case 'chase': {
        this.attacking = false;
        this.faceToward(dx, dz, dt, 9);
        this.cd -= dt;
        if (dist > 2.1) {
          this.pos.x += (dx / dist) * this.speed * dt;
          this.pos.z += (dz / dist) * this.speed * dt;
        }
        this.armRx += (0.25 - this.armRx) * (1 - Math.exp(-10 * dt));
        if (dist < 2.6 && this.cd <= 0 && ctx.attackers() < ctx.maxAtk) {
          this.state = 'windup'; this.t = 0; this.attacking = true; this.dodged = false;
          this.warn.visible = true;
        }
        break;
      }
      case 'windup': {
        this.t += dt;
        if (this.t < WINDUP * 0.7) this.faceToward(dx, dz, dt, 12); // 마지막엔 방향 고정
        this.alert = Math.min(1, this.t / WINDUP);
        this.warn.material.opacity = 0.12 + 0.4 * this.alert;
        this.armRx += (-2.5 - this.armRx) * (1 - Math.exp(-14 * dt));
        if (this.t >= WINDUP) {
          this.state = 'strike'; this.t = 0;
          this.warn.visible = false;
          this.vel.set(fx * 13, 0, fz * 13);
          // 내리치는 순간 판정
          const toX = dx / dist, toZ = dz / dist;
          if (dist < 3.0 && fx * toX + fz * toZ > 0.3) {
            ctx.player.hurt(this.dmg, new THREE.Vector3(fx, 0, fz), this);
          }
        }
        break;
      }
      case 'strike': {
        this.t += dt;
        this.armRx += (1.25 - this.armRx) * (1 - Math.exp(-40 * dt));
        if (this.t >= STRIKE) { this.state = 'recover'; this.t = 0; this.alert = 0; this.attacking = false; }
        break;
      }
      case 'recover': {
        this.t += dt;
        if (this.t >= RECOVER) { this.state = 'chase'; this.cd = 0.45 + Math.random() * 0.7; }
        break;
      }
    }
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    if (!this.alive) return;
    const speed = dt > 0 ? Math.hypot(this.pos.x - this._last.x, this.pos.z - this._last.z) / dt : 0;
    this._last.copy(this.pos);
    this.anim.update(dt, Math.min(speed, 8), this.armRx, this.state, this.broken);
  }
}
