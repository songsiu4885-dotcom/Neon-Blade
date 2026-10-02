import * as THREE from 'three';
import { Enemy, warnMaterial } from './enemy.js';
import { buildGuardRobot, GuardAnimator } from '../characters/robots.js';
import { Thug } from './thug.js';
import { Drone } from './drone.js';
import { audio } from '../audio.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const fwd = (e) => V3(-Math.sin(e.facing), 0, -Math.cos(e.facing));
const rand = (a, b) => a + Math.random() * (b - a);
const circle = (r) => { const m = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), warnMaterial()); m.scale.set(r, 1, r); m.position.y = 0.07; m.visible = false; return m; };

// 관리자 〈아담〉: 3단계 보스.
//  1단계: 내려찍기(앞쪽 원), 회전 베기(자신 중심 원)
//  2단계(HP 66%): 돌진 추가, 졸개 호출
//  3단계(HP 33%): 전방위 탄막 추가, 공격 가속, 졸개 호출
// 모든 공격은 바닥에 붉은 범위를 먼저 그린다. 범위가 번쩍이는 순간을 노려 대시로 빠지면 완벽 회피.
export class Boss extends Enemy {
  constructor(x, z) {
    super({ maxHp: 1000, radius: 1.7, maxPosture: 300 });
    this.boss = true; this.elite = true;
    this.pos.set(x, 0, z);
    this.executionDamage = 240;      // 자세가 무너졌을 때 처형 한 방의 피해
    this.name = '관리자 아담';
    this.phase = 1;
    this.state = 'intro'; this.t = 0; this.cd = 1.5;
    this.J = buildGuardRobot(this, { shell: 0x2a2038, rim: 0xff2bd6, vent: 0x00e5ff, weapon: 'maul' });
    this.anim = new GuardAnimator(this.J);
    this.body.scale.setScalar(2.1);
    this.armRx = 0.25;
    this.slamWarn = circle(5); this.group.add(this.slamWarn); this.slamWarn.position.set(0, 0.07, -4.2);
    this.sweepWarn = circle(7); this.group.add(this.sweepWarn);
    this.rushWarn = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 22).rotateX(-Math.PI / 2), warnMaterial());
    this.rushWarn.position.set(0, 0.07, -11.5); this.rushWarn.visible = false; this.group.add(this.rushWarn);
    this.dir = V3(0, 0, -1); this.moved = 0; this.hitDone = false;
    this.move = null; this.inv = 0;
    this._last = V3(x, 0, z);
    this.hpRatio = 1;
  }

  // 단계 전환 중에는 무적 (포효 + 졸개 호출)
  cancelAttack() { /* 보스는 경직되지 않는다 */ }
  takeHit(dmg, dir, knock, launch, heavy) {
    if (this.invulnerable) return false;
    const dead = super.takeHit(dmg, dir, knock * 0.15, launch, heavy);
    this.stagger = 0; this.flash = 0.06; // 보스는 맞아도 멈추지 않는다
    this.vel.multiplyScalar(0.2);
    return dead;
  }

  _warnsOff() { this.slamWarn.visible = this.sweepWarn.visible = this.rushWarn.visible = false; }

  _pickMove(dist) {
    const opts = [];
    if (dist < 11) opts.push('slam', 'slam');
    if (dist < 8) opts.push('sweep', 'sweep');
    if (this.phase >= 2 && dist > 7) opts.push('rush', 'rush');
    if (this.phase >= 3) opts.push('barrage');
    if (!opts.length) opts.push('slam');
    return opts[Math.floor(Math.random() * opts.length)];
  }

  _begin(kind) {
    this.move = kind; this.state = 'windup'; this.t = 0; this.attacking = true; this.dodged = false;
    this._warnsOff();
    const w = kind === 'slam' ? this.slamWarn : kind === 'sweep' ? this.sweepWarn : kind === 'rush' ? this.rushWarn : null;
    if (w) w.visible = true;
  }

  ai(dt, ctx) {
    const sp = this.phase === 3 ? 1.35 : this.phase === 2 ? 1.15 : 1; // 단계별 가속
    const p = ctx.player.pos, dx = p.x - this.pos.x, dz = p.z - this.pos.z, dist = Math.hypot(dx, dz) || 1e-6;

    // 단계 전환
    const r = this.hp / this.maxHp;
    const want = r < 0.33 ? 3 : r < 0.66 ? 2 : 1;
    if (want > this.phase && this.state !== 'roar') {
      this.phase = want; this.state = 'roar'; this.t = 0; this.invulnerable = true; this.attacking = false; this._warnsOff();
      this.posture = 0; this.broken = false;
      ctx.combat.onPop?.(`PHASE ${this.phase}`, '#ff8cf0'); audio.roar();
      ctx.rig.shake(0.1); ctx.fx.flash(0.2);
      if (ctx.spawn) { // 졸개 호출
        const n = this.phase === 2 ? [Thug, Thug, Thug, Thug, Drone, Drone] : [Drone, Drone, Drone, Drone, Thug, Thug, Thug, Thug];
        n.forEach((C, i) => { const a = (i / n.length) * Math.PI * 2 + Math.random(); ctx.spawn(C, this.pos.x + Math.cos(a) * 13, this.pos.z + Math.sin(a) * 13); });
      }
    }

    if (this.state === 'intro') { // 등장: 천천히 고개를 든다
      this.t += dt; this.faceToward(dx, dz, dt, 4);
      this.armRx += (0.25 - this.armRx) * (1 - Math.exp(-6 * dt));
      if (this.t > 1.6) { this.state = 'chase'; }
    } else if (this.state === 'roar') {
      this.t += dt; this.faceToward(dx, dz, dt, 4);
      this.armRx += (-2.6 - this.armRx) * (1 - Math.exp(-8 * dt)); // 망치를 높이 든다
      this.alert = 0.5 + 0.5 * Math.sin(this.t * 20);
      if (this.t > 1.6) { this.invulnerable = false; this.alert = 0; this.state = 'chase'; this.cd = 0.6; }
    } else if (this.state === 'chase') {
      this.attacking = false;
      this.faceToward(dx, dz, dt, 6);
      this.cd -= dt * sp;
      this.armRx += (0.25 - this.armRx) * (1 - Math.exp(-10 * dt));
      if (dist > 5.5) { this.pos.x += (dx / dist) * 4.4 * sp * dt; this.pos.z += (dz / dist) * 4.4 * sp * dt; }
      if (this.cd <= 0) this._begin(this._pickMove(dist));
    } else if (this.state === 'windup') {
      this.t += dt * sp;
      const W = { slam: 1.15, sweep: 1.2, rush: 1.3, barrage: 1.1 }[this.move];
      if (this.move !== 'rush' || this.t < W * 0.65) this.faceToward(dx, dz, dt, this.move === 'rush' ? 14 : 5);
      this.alert = Math.min(1, this.t / W);
      const warn = this.move === 'slam' ? this.slamWarn : this.move === 'sweep' ? this.sweepWarn : this.move === 'rush' ? this.rushWarn : null;
      if (warn) warn.material.opacity = 0.1 + 0.45 * this.alert * this.alert + (this.alert > 0.85 ? 0.2 : 0);
      this.armRx += ((this.move === 'sweep' ? -1.6 : -2.7) - this.armRx) * (1 - Math.exp(-12 * dt));
      if (this.t >= W) this._strike(ctx);
    } else if (this.state === 'strike') {
      this.t += dt;
      if (this.move === 'rush') {
        const stepLen = 34 * dt;
        const ahead = V3(this.pos.x + this.dir.x * (stepLen + this.radius), 0, this.pos.z + this.dir.z * (stepLen + this.radius));
        if (ctx.world?.blocked(ahead)) { // 벽에 박으면 크게 무너진다
          ctx.rig.shake(0.2); ctx.fx.sparks(V3(this.pos.x + this.dir.x * 2, 2, this.pos.z + this.dir.z * 2), this.dir.clone().negate(), 40, 0xffb347);
          if (this.addPosture(150)) ctx.combat.onPop?.('BREAK', '#ffc400');
          this._end(); return;
        }
        this.pos.x += this.dir.x * stepLen; this.pos.z += this.dir.z * stepLen; this.moved += stepLen;
        if (!this.hitDone && Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 2.6 && ctx.player.hurt(28, this.dir.clone(), this)) this.hitDone = true;
        if (this.moved >= 22) this._end();
      } else if (this.t >= 0.3) this._end();
    } else if (this.state === 'recover') {
      this.t += dt;
      if (this.t >= (this.move === 'rush' ? 1.5 : 1.0) / sp) { this.state = 'chase'; this.cd = rand(0.4, 1.0); }
    }
  }

  _strike(ctx) {
    const p = ctx.player.pos, f = fwd(this);
    this._warnsOff();
    this.state = 'strike'; this.t = 0;
    if (this.move === 'slam') {
      const cx = this.pos.x + f.x * 4.2, cz = this.pos.z + f.z * 4.2;
      ctx.rig.shake(0.12); ctx.fx.sparks(V3(cx, 0.3, cz), f, 30, 0xff6ae8);
      if (Math.hypot(p.x - cx, p.z - cz) < 5.1) ctx.player.hurt(24, f, this);
      this.armRx = 1.35;
    } else if (this.move === 'sweep') {
      ctx.rig.shake(0.1); ctx.fx.sparks(V3(this.pos.x, 0.5, this.pos.z), f, 30, 0xff6ae8);
      const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      if (d < 7.2) ctx.player.hurt(22, V3(p.x - this.pos.x, 0, p.z - this.pos.z).normalize(), this);
      this.armRx = 1.0;
    } else if (this.move === 'rush') {
      this.dir.copy(f); this.moved = 0; this.hitDone = false;
    } else if (this.move === 'barrage') { // 전방위 탄막 + 조준탄
      const N = 14, off = Math.random() * 6;
      for (let i = 0; i < N; i++) {
        const a = off + (i / N) * Math.PI * 2, sp = 12;
        ctx.projectiles.spawn(V3(this.pos.x + Math.cos(a) * 2.2, 3.6, this.pos.z + Math.sin(a) * 2.2),
          V3(Math.cos(a) * sp, -(3.6 - 1.1) / (8 / sp), Math.sin(a) * sp), 9, this);
      }
      ctx.rig.shake(0.08);
    }
  }
  _end() { this.state = 'recover'; this.t = 0; this.alert = 0; this.attacking = false; this._warnsOff(); }

  update(dt, ctx) {
    super.update(dt, ctx);
    if (!this.alive) return;
    if (this.broken && this.state !== 'chase') { this.state = 'chase'; this.cd = 1.0; this.attacking = false; this._warnsOff(); }
    // 범위 표시는 항상 보스 위치/방향을 따라간다 (group 자식이라 자동)
    const spd = dt > 0 ? Math.hypot(this.pos.x - this._last.x, this.pos.z - this._last.z) / dt : 0;
    this._last.copy(this.pos);
    const st = this.state === 'windup' ? 'windup' : this.state === 'strike' ? 'strike' : this.state;
    this.J.shoulderR.rotation.x = this.armRx;
    this.anim.update(dt, Math.min(spd, 7), this.armRx, st, this.broken);
    if (this.state === 'strike' && this.move === 'rush') this.body.rotation.x += 0.4;
    if (this.invulnerable) this.body.rotation.x -= 0.08;
  }
}
