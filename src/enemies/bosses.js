import * as THREE from 'three';
import { Enemy, warnMaterial } from './enemy.js';
import { Boss } from './boss.js';
import { Executioner } from './more.js';
import { buildGuardRobot, GuardAnimator, buildDrone } from '../characters/robots.js';
import { audio } from '../audio.js';

// 중간보스와 최종 보스. 모두 boss = true라서 화면 위에 체력바가 뜨고, 자세가 무너지면 처형으로 큰 피해를 준다.
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const fwd = (e) => V3(-Math.sin(e.facing), 0, -Math.cos(e.facing));
const rand = (a, b) => a + Math.random() * (b - a);
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
const rectWarn = (w, l, z) => { const m = mesh(new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2), warnMaterial(), 0, 0.06, z); m.visible = false; return m; };
const circleWarn = (r) => { const m = mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), warnMaterial(), 0, 0.07, 0); m.scale.set(r, 1, r); m.visible = false; return m; };
function fanHit(e, ctx, range, cosArc, dmg) {
  const p = ctx.player.pos, dx = p.x - e.pos.x, dz = p.z - e.pos.z, d = Math.hypot(dx, dz) || 1e-6;
  const f = fwd(e);
  if (d < range && (f.x * dx + f.z * dz) / d > cosArc) return ctx.player.hurt(dmg, f, e);
  return false;
}
// 단계 전환: 체력 66% / 33%에서 포효(무적) + 졸개 호출
function phaseCheck(e, ctx, summons) {
  const r = e.hp / e.maxHp, want = r < 0.33 ? 3 : r < 0.66 ? 2 : 1;
  if (want <= e.phase) return false;
  e.phase = want; e.state = 'roar'; e.t = 0; e.invulnerable = true; e.attacking = false; e.posture = 0; e.broken = false;
  e.warnsOff?.();
  ctx.combat.onPop?.(`PHASE ${e.phase}`, '#ff8cf0'); audio.roar();
  ctx.rig.shake(0.1); ctx.fx.flash(0.2);
  const n = summons?.[e.phase] || [];
  n.forEach((type, i) => { const a = (i / n.length) * Math.PI * 2 + Math.random(); ctx.spawn?.(type, e.pos.x + Math.cos(a) * 12, e.pos.z + Math.sin(a) * 12); });
  return true;
}

// =================== 중간보스 1: 파쇄기 골리앗 — 거대한 망치, 내려찍기·회전·돌진, 자폭 롤러 호출 ===================
export class Juggernaut extends Boss {
  constructor(x, z) {
    super(x, z, {
      key: 'jugg', name: '파쇄기 골리앗', hp: 1150, posture: 320, exec: 240, radius: 1.6, scale: 1.95, speed: 0.95,
      look: { shell: 0x6a5a40, rim: 0xff7a20, vent: 0xffb347, weapon: 'maul' },
      moves: { rush: 1, barrage: 99 },
      summons: { 2: ['bomber', 'bomber', 'bomber', 'thug', 'thug'], 3: ['bomber', 'bomber', 'bomber', 'bomber', 'shield', 'shield'] },
    });
    this.midboss = true;
  }
}

// =================== 중간보스 2: 쌍둥이 집행자 — 강화된 집행자 둘 ===================
export class TwinExec extends Executioner {
  constructor(x, z) {
    super(x, z);
    TwinExec.n = (TwinExec.n || 0) + 1;
    const second = TwinExec.n % 2 === 0;
    this.boss = true; this.midboss = true; this.key = 'twin';
    this.name = second ? '쌍둥이 집행자 · 레무스' : '쌍둥이 집행자 · 로물루스';
    this.maxHp = this.hp = 700; this.maxPosture = 230; this.executionDamage = 200;
    this.body.scale.setScalar(1.45);
    if (second) for (const m of this.rimMats) { m.userData.base.setHex(0xff2bd6); m.color.setHex(0xff2bd6); }
  }
}

// =================== 중간보스 3: 감시자 아르고스 — 떠다니는 거대 드론, 레이저 선 공격·탄막·드론 호출 ===================
export class Warden extends Enemy {
  constructor(x, z) {
    super({ maxHp: 1000, radius: 1.6, hitY: 4.2, maxPosture: 280 });
    this.boss = true; this.midboss = true; this.elite = true; this.flying = true; this.key = 'warden';
    this.name = '감시자 아르고스'; this.executionDamage = 230;
    this.pos.set(x, 4.2, z);
    this.phase = 1; this.state = 'hover'; this.t = 0; this.cd = 1.6; this.strafe = 1; this.strafeT = 3; this.bob = 0;
    this.J = buildDrone(this);
    for (const m of this.rimMats) { m.userData.base.setHex(0xff3b30); m.color.setHex(0xff3b30); }
    this.body.scale.setScalar(3.4);
    this.lines = [0, 1, 2].map(() => { const m = rectWarn(2.4, 26, 0); m.geometry.translate(0, 0, -13); return m; });
    this.beam = mesh(new THREE.BoxGeometry(0.5, 0.5, 26).translate(0, 0, -13), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.4, 0.3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.beam.visible = false; this.beam.frustumCulled = false;
    this.angles = []; this.k = 0; this.tilt = new THREE.Vector2(); this._last = V3(x, 4.2, z);
    this.callT = 14;
  }
  warnsOff() { for (const l of this.lines) l.visible = false; this.beam.visible = false; }
  cancelAttack() {}
  ai(dt, ctx) {
    for (const l of this.lines) if (!l.parent) ctx.scene.add(l);
    if (!this.beam.parent) ctx.scene.add(this.beam);
    const p = ctx.player.pos, dx = p.x - this.pos.x, dz = p.z - this.pos.z, dist = Math.hypot(dx, dz) || 1e-6;
    this.bob += dt * 1.4; this.pos.y = 4.2 + Math.sin(this.bob) * 0.3;
    this.faceToward(dx, dz, dt, 3);
    if (phaseCheck(this, ctx, { 2: ['drone', 'drone', 'drone', 'sniper'], 3: ['drone', 'drone', 'drone', 'drone', 'sentinel'] })) return;
    if (this.state === 'roar') { this.t += dt; this.alert = 0.5 + 0.5 * Math.sin(this.t * 20); if (this.t > 1.5) { this.invulnerable = false; this.alert = 0; this.state = 'hover'; this.cd = 0.6; } return; }
    const sp = this.phase === 3 ? 1.3 : this.phase === 2 ? 1.15 : 1;
    this.callT -= dt;
    if (this.state === 'hover') {
      this.attacking = false; this.cd -= dt * sp; this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = 2.5 + Math.random() * 2; }
      const nx = dx / dist, nz = dz / dist, radial = dist < 9 ? -1 : dist > 15 ? 1 : 0;
      this.pos.x += (nx * radial - nz * this.strafe * 0.7) * 4 * dt;
      this.pos.z += (nz * radial + nx * this.strafe * 0.7) * 4 * dt;
      if (this.phase >= 2 && this.callT <= 0) { this.callT = 16; ['drone', 'drone'].forEach((t) => ctx.spawn?.(t, this.pos.x + rand(-6, 6), this.pos.z + rand(-6, 6))); }
      if (this.cd <= 0) {
        this.move = Math.random() < (this.phase >= 3 ? 0.45 : 0.3) ? 'barrage' : 'lines';
        this.state = 'windup'; this.t = 0; this.attacking = true; this.dodged = false;
        if (this.move === 'lines') { // 플레이어를 지나는 선 1~3개를 차례로 긋는다
          const base = Math.atan2(-dx, -dz), n = this.phase;
          this.angles = Array.from({ length: n }, (_, i) => base + (i - (n - 1) / 2) * 0.45);
          this.k = 0;
        }
      }
    } else if (this.state === 'windup') {
      this.t += dt * sp;
      if (this.move === 'lines') {
        const a = this.angles[this.k], l = this.lines[this.k];
        l.visible = true; l.position.set(this.pos.x, 0.06, this.pos.z); l.rotation.y = a;
        this.alert = Math.min(1, this.t / 0.85);
        l.material.opacity = 0.12 + 0.45 * this.alert;
        if (this.t >= 0.85) { // 발사: 그 선 위에 있으면 피해
          l.visible = false;
          this.beam.visible = true; this.beam.position.set(this.pos.x, 1.0, this.pos.z); this.beam.rotation.y = a; this.beam.material.opacity = 0.95;
          const d = V3(-Math.sin(a), 0, -Math.cos(a)), rx = p.x - this.pos.x, rz = p.z - this.pos.z;
          const along = rx * d.x + rz * d.z, perp = Math.abs(rx * d.z - rz * d.x);
          if (along > 0 && along < 26 && perp < 1.3) ctx.player.hurt(22, V3(-d.z, 0, d.x), this);
          ctx.rig.shake(0.05); audio.hit(true, false);
          this.k++; this.t = 0; this.dodged = false;
          if (this.k >= this.angles.length) { this.state = 'recover'; this.t = 0; this.alert = 0; this.attacking = false; }
        }
      } else {
        this.alert = Math.min(1, this.t / 0.9);
        if (this.t >= 0.9) {
          const N = 16, off = Math.random() * 6;
          for (let i = 0; i < N; i++) {
            const a = off + (i / N) * Math.PI * 2, s = 11;
            ctx.projectiles.spawn(V3(this.pos.x + Math.cos(a) * 2.4, this.pos.y, this.pos.z + Math.sin(a) * 2.4), V3(Math.cos(a) * s, -(this.pos.y - 1.1) / (8 / s), Math.sin(a) * s), 9, this);
          }
          this.state = 'recover'; this.t = 0; this.alert = 0; this.attacking = false;
        }
      }
    } else if (this.state === 'recover') {
      this.t += dt;
      if (this.t >= 1.0 / sp) { this.state = 'hover'; this.cd = rand(1.2, 2.0); }
    }
  }
  update(dt, ctx) {
    super.update(dt, ctx);
    if (this.beam.visible) { this.beam.material.opacity -= dt * 3; if (this.beam.material.opacity <= 0) this.beam.visible = false; }
    if (!this.alive) { this.warnsOff(); return; }
    if (this.broken) { this.warnsOff(); this.pos.y += (2.0 - this.pos.y) * (1 - Math.exp(-4 * dt)); }
    this.hitY = this.pos.y;
    for (let i = 0; i < this.J.rotors.length; i++) this.J.rotors[i].rotation.y += dt * (i % 2 ? 26 : -26);
    this._last.copy(this.pos);
  }
}

// =================== 중간보스 4: 복제체 ZERO-01 — 카이의 전투 기록으로 만든 검객. 빠른 3연격·돌진 베기·회피 ===================
const MCOMBO = [
  { w: 0.36, a: 0.1, dmg: 16, range: 3.4, cos: Math.cos(THREE.MathUtils.degToRad(70)), lunge: 11 },
  { w: 0.28, a: 0.1, dmg: 16, range: 3.4, cos: Math.cos(THREE.MathUtils.degToRad(70)), lunge: 11 },
  { w: 0.55, a: 0.18, dmg: 28, range: 4.0, cos: Math.cos(THREE.MathUtils.degToRad(55)), lunge: 15 },
];
export class Mirror extends Enemy {
  constructor(x, z) {
    super({ maxHp: 1050, radius: 0.8, maxPosture: 300 });
    this.boss = true; this.midboss = true; this.elite = true; this.key = 'mirror';
    this.name = '복제체 ZERO-01'; this.executionDamage = 230;
    this.pos.set(x, 0, z);
    this.phase = 1; this.state = 'intro'; this.t = 0; this.cd = 1.0; this.stepI = 0; this.sub = 'wind';
    this.J = buildGuardRobot(this, { shell: 0xd8dce6, rim: 0xff2840, vent: 0xff2840, weapon: 'sword' });
    this.anim = new GuardAnimator(this.J);
    this.body.scale.set(1.05, 1.15, 1.05);
    this.warn = rectWarn(4.0, 4.2, -2.2); this.group.add(this.warn);
    this.line = rectWarn(2.2, 14, -7); this.group.add(this.line);
    this.armRx = 0.25; this.recent = []; this.dir = V3(0, 0, -1); this.moved = 0; this.hitDone = false;
    this._last = V3(x, 0, z);
  }
  warnsOff() { this.warn.visible = false; this.line.visible = false; }
  cancelAttack() {}
  takeHit(dmg, dir, knock, launch, heavy) {
    if (this.invulnerable) return false;
    const dead = super.takeHit(dmg, dir, knock * 0.3, launch, heavy);
    this.stagger = 0; // 맞아도 경직되지 않는다
    // 1.2초 안에 3번 맞으면 옆으로 빠지며 곧바로 반격한다
    const now = performance.now() / 1000;
    this.recent = this.recent.filter((t) => now - t < 1.2); this.recent.push(now);
    if (!dead && !this.broken && this.recent.length >= 3 && this.state !== 'evade' && this.state !== 'roar') {
      this.recent = []; this.state = 'evade'; this.t = 0; this.invulnerable = true; this.attacking = false; this.warnsOff();
      const side = V3(-dir.z, 0, dir.x).multiplyScalar(Math.random() < 0.5 ? 1 : -1);
      this.vel.copy(side.multiplyScalar(16)).addScaledVector(dir, 6);
    }
    return dead;
  }
  ai(dt, ctx) {
    const p = ctx.player.pos, dx = p.x - this.pos.x, dz = p.z - this.pos.z, dist = Math.hypot(dx, dz) || 1e-6;
    if (phaseCheck(this, ctx, { 2: ['assassin', 'assassin'], 3: ['assassin', 'assassin', 'assassin'] })) return;
    const sp = this.phase === 3 ? 1.25 : this.phase === 2 ? 1.12 : 1;
    if (this.state === 'intro' || this.state === 'roar') {
      this.t += dt; this.faceToward(dx, dz, dt, 5);
      if (this.state === 'roar') this.alert = 0.5 + 0.5 * Math.sin(this.t * 20);
      if (this.t > 1.2) { this.state = 'chase'; this.invulnerable = false; this.alert = 0; this.cd = 0.5; }
    } else if (this.state === 'evade') {
      this.t += dt;
      if (this.t > 0.3) { this.invulnerable = false; this.state = 'combo'; this.stepI = 0; this.sub = 'wind'; this.t = 0.12; this.attacking = true; this.dodged = false; this.warn.visible = true; }
    } else if (this.state === 'chase') {
      this.attacking = false;
      this.faceToward(dx, dz, dt, 9);
      this.cd -= dt * sp;
      this.armRx += (0.25 - this.armRx) * (1 - Math.exp(-10 * dt));
      if (dist > 2.6) { this.pos.x += (dx / dist) * 6.4 * sp * dt; this.pos.z += (dz / dist) * 6.4 * sp * dt; }
      if (this.cd <= 0) {
        if (dist > 5.5 && dist < 13) { this.state = 'dashwind'; this.t = 0; this.attacking = true; this.dodged = false; this.line.visible = true; }
        else if (dist < 4.5) { this.state = 'combo'; this.stepI = 0; this.sub = 'wind'; this.t = 0; this.attacking = true; this.dodged = false; this.warn.visible = true; }
      }
    } else if (this.state === 'combo') {
      const c = MCOMBO[this.stepI];
      this.t += dt * sp;
      if (this.sub === 'wind') {
        if (this.t < c.w * 0.7) this.faceToward(dx, dz, dt, 16);
        this.alert = Math.min(1, this.t / c.w);
        this.warn.visible = true; this.warn.material.opacity = 0.12 + 0.45 * this.alert;
        this.armRx += (-2.6 - this.armRx) * (1 - Math.exp(-18 * dt));
        if (this.t >= c.w) { this.sub = 'act'; this.t = 0; this.warn.visible = false; const f = fwd(this); this.vel.set(f.x * c.lunge, 0, f.z * c.lunge); fanHit(this, ctx, c.range, c.cos, c.dmg); }
      } else {
        this.armRx += (1.25 - this.armRx) * (1 - Math.exp(-40 * dt));
        if (this.t >= c.a) {
          if (this.stepI < MCOMBO.length - 1) { this.stepI++; this.sub = 'wind'; this.t = 0; this.dodged = false; }
          else { this.state = 'recover'; this.t = 0; this.alert = 0; this.attacking = false; }
        }
      }
    } else if (this.state === 'dashwind') {
      this.t += dt * sp;
      if (this.t < 0.4) this.faceToward(dx, dz, dt, 14);
      this.alert = Math.min(1, this.t / 0.6);
      this.line.material.opacity = 0.12 + 0.45 * this.alert;
      this.armRx += (-1.6 - this.armRx) * (1 - Math.exp(-12 * dt));
      if (this.t >= 0.6) { this.state = 'dash'; this.t = 0; this.line.visible = false; this.dir.copy(fwd(this)); this.moved = 0; this.hitDone = false; }
    } else if (this.state === 'dash') {
      const step = 32 * dt;
      this.pos.x += this.dir.x * step; this.pos.z += this.dir.z * step; this.moved += step;
      this.armRx += (1.25 - this.armRx) * (1 - Math.exp(-30 * dt));
      if (!this.hitDone && Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 2.0 && ctx.player.hurt(24, this.dir.clone(), this)) this.hitDone = true;
      if (this.moved >= 14 || ctx.world?.blocked(V3(this.pos.x + this.dir.x, 0, this.pos.z + this.dir.z))) { this.state = 'recover'; this.t = 0; this.alert = 0; this.attacking = false; }
    } else if (this.state === 'recover') {
      this.t += dt;
      if (this.t >= 0.7 / sp) { this.state = 'chase'; this.cd = rand(0.3, 0.8); }
    }
  }
  update(dt, ctx) {
    super.update(dt, ctx);
    if (!this.alive) return;
    if (this.broken && this.state !== 'chase') { this.state = 'chase'; this.cd = 1; this.attacking = false; this.warnsOff(); }
    const s = dt > 0 ? Math.hypot(this.pos.x - this._last.x, this.pos.z - this._last.z) / dt : 0;
    this._last.copy(this.pos);
    const st = this.state === 'combo' ? (this.sub === 'wind' ? 'windup' : 'strike') : this.state === 'dash' ? 'strike' : this.state === 'dashwind' ? 'windup' : this.state;
    this.anim.update(dt, Math.min(s, 9), this.armRx, st, this.broken);
  }
}

// =================== 최종 보스: 아담 ===================
// 1단계: 순간이동 베기, 시계 폭격(바닥 원이 차례로 터진다), 내려찍기
// 2단계(66%): 회전 레이저 추가, 집행자·드론 호출
// 3단계(33%): 탄막 추가, 모든 공격 가속, 센티넬·암살 로봇 호출
export class Adam extends Enemy {
  constructor(x, z) {
    super({ maxHp: 2800, radius: 1.6, maxPosture: 440, hitY: 2.6 });
    this.boss = true; this.elite = true; this.key = 'adam';
    this.name = '관리자 아담'; this.executionDamage = 280;
    this.pos.set(x, 0, z);
    this.phase = 1; this.state = 'intro'; this.t = 0; this.cd = 1.6; this.move = null;
    this.J = buildGuardRobot(this, { shell: 0xe6e2ee, rim: 0xff2bd6, vent: 0xffc94a, weapon: 'sword' });
    this.anim = new GuardAnimator(this.J);
    this.body.scale.set(2.0, 2.3, 2.0);
    // 등 뒤의 시계 고리와 바늘
    const gold = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.5, 0.6) });
    this.halo = new THREE.Group(); this.halo.position.set(0, 4.3, 0.9); this.group.add(this.halo);
    this.halo.add(mesh(new THREE.TorusGeometry(1.5, 0.05, 6, 48), gold));
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; this.halo.add(mesh(new THREE.BoxGeometry(0.06, i % 3 ? 0.18 : 0.34, 0.06), gold, Math.sin(a) * 1.35, Math.cos(a) * 1.35, 0)).rotation.z = -a; }
    this.hand1 = mesh(new THREE.BoxGeometry(0.08, 1.2, 0.05).translate(0, 0.6, 0), gold); this.halo.add(this.hand1);
    this.hand2 = mesh(new THREE.BoxGeometry(0.1, 0.8, 0.05).translate(0, 0.4, 0), gold); this.halo.add(this.hand2);
    this.slamWarn = circleWarn(5); this.slamWarn.position.set(0, 0.07, -4.4); this.group.add(this.slamWarn);
    this.fan = rectWarn(5.4, 5.2, -2.6); this.group.add(this.fan);
    this.mark = circleWarn(1.2);
    this.bombs = Array.from({ length: 7 }, () => ({ m: circleWarn(2.6), at: 0, done: true }));
    this.beamWarn = mesh(new THREE.BoxGeometry(1.8, 0.05, 26).translate(0, 0, -13), warnMaterial()); this.beamWarn.visible = false;
    this.beam = mesh(new THREE.BoxGeometry(1.6, 0.6, 26).translate(0, 0, -13), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.5, 1.8), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.beam.visible = false; this.beam.frustumCulled = this.beamWarn.frustumCulled = false;
    this.dest = V3(); this._last = V3(x, 0, z); this.armRx = 0.25; this.hitDone = false;
    this.aim = this.mark;
  }
  warnsOff() { this.slamWarn.visible = this.fan.visible = this.mark.visible = this.beamWarn.visible = this.beam.visible = false; }
  cancelAttack() {}
  takeHit(dmg, dir, knock, launch, heavy) {
    if (this.invulnerable) return false;
    const dead = super.takeHit(dmg, dir, knock * 0.1, launch, heavy);
    this.stagger = 0;
    return dead;
  }
  _pick(dist) {
    const o = ['blink', 'blink', 'clock'];
    if (dist < 7) o.push('slam', 'slam');
    if (this.phase >= 2) o.push('beam', 'beam');
    if (this.phase >= 3) o.push('barrage', 'clock');
    return o[Math.floor(Math.random() * o.length)];
  }
  ai(dt, ctx) {
    const scene = ctx.scene;
    for (const o of [this.mark, this.beamWarn, this.beam, ...this.bombs.map((b) => b.m)]) if (!o.parent) scene.add(o);
    const p = ctx.player.pos, dx = p.x - this.pos.x, dz = p.z - this.pos.z, dist = Math.hypot(dx, dz) || 1e-6;
    if (this.state !== 'roar' && phaseCheck(this, ctx, { 2: ['exec', 'exec', 'drone', 'drone', 'drone'], 3: ['sentinel', 'sentinel', 'assassin', 'assassin', 'assassin'] })) return;
    const sp = this.phase === 3 ? 1.35 : this.phase === 2 ? 1.15 : 1;
    this._updateBombs(dt, ctx);
    if (this.state === 'intro' || this.state === 'roar') {
      this.t += dt; this.faceToward(dx, dz, dt, 4);
      this.armRx += ((this.state === 'roar' ? -2.6 : 0.25) - this.armRx) * (1 - Math.exp(-8 * dt));
      if (this.state === 'roar') this.alert = 0.5 + 0.5 * Math.sin(this.t * 20);
      if (this.t > (this.state === 'intro' ? 2.0 : 1.6)) { this.state = 'chase'; this.invulnerable = false; this.alert = 0; this.cd = 0.6; }
    } else if (this.state === 'chase') {
      this.attacking = false;
      this.faceToward(dx, dz, dt, 6);
      this.cd -= dt * sp;
      this.armRx += (0.25 - this.armRx) * (1 - Math.exp(-10 * dt));
      if (dist > 6) { this.pos.x += (dx / dist) * 4.2 * sp * dt; this.pos.z += (dz / dist) * 4.2 * sp * dt; }
      if (this.cd <= 0) this._begin(this._pick(dist), ctx);
    } else if (this.state === 'act') {
      this.t += dt * sp;
      this['_' + this.move](dt, ctx, p, dx, dz, dist);
    } else if (this.state === 'recover') {
      this.t += dt;
      if (this.t >= 0.9 / sp) { this.state = 'chase'; this.cd = rand(0.4, 1.0); }
    }
  }
  _begin(move, ctx) {
    this.move = move; this.state = 'act'; this.t = 0; this.attacking = true; this.dodged = false; this.stage = 0; this.hitDone = false;
    this.warnsOff();
    const p = ctx.player.pos;
    if (move === 'blink') { // 플레이어 근처(아담 쪽 2.8m)에 도착 표시
      const dx = this.pos.x - p.x, dz = this.pos.z - p.z, d = Math.hypot(dx, dz) || 1;
      this.dest.set(p.x + (dx / d) * 2.8, 0, p.z + (dz / d) * 2.8);
      ctx.world?.resolve(this.dest, this.radius);
      this.mark.position.set(this.dest.x, 0.07, this.dest.z); this.mark.visible = true;
    } else if (move === 'slam') this.slamWarn.visible = true;
    else if (move === 'clock') { // 플레이어 자리와 그 둘레에 시계 폭격
      const n = this.phase >= 3 ? 7 : 5;
      this.bombs.forEach((b, i) => {
        if (i >= n) return;
        const a = (i / (n - 1)) * Math.PI * 2 + Math.random();
        const r = i === 0 ? 0 : 3.6;
        b.m.position.set(p.x + Math.cos(a) * r, 0.07, p.z + Math.sin(a) * r);
        b.m.visible = true; b.m.material.opacity = 0.1; b.at = 0.9 + i * 0.14; b.age = 0; b.done = false;
      });
    } else if (move === 'beam') {
      this.beamA0 = Math.atan2(-(p.x - this.pos.x), -(p.z - this.pos.z)) - 1.4 * (Math.random() < 0.5 ? 1 : -1);
      this.beamDir = Math.sign(Math.atan2(-(p.x - this.pos.x), -(p.z - this.pos.z)) - this.beamA0) || 1;
      this.beamWarn.visible = true;
    }
  }
  _end() { this.state = 'recover'; this.t = 0; this.alert = 0; this.attacking = false; this.warnsOff(); }
  _blink(dt, ctx, p, dx, dz) {
    if (this.stage === 0) {
      this.alert = Math.min(1, this.t / 0.45);
      this.mark.material.opacity = 0.15 + 0.5 * this.alert;
      if (this.t >= 0.45) {
        ctx.fx.sparks(V3(this.pos.x, 2.5, this.pos.z), V3(0, 1, 0), 18, 0xff2bd6);
        this.pos.copy(this.dest); this.mark.visible = false;
        ctx.fx.sparks(V3(this.pos.x, 2.5, this.pos.z), V3(0, 1, 0), 18, 0xff2bd6);
        this.facing = Math.atan2(-(p.x - this.pos.x), -(p.z - this.pos.z));
        this.stage = 1; this.t = 0; this.fan.visible = true; this.dodged = false;
      }
    } else if (this.stage === 1) {
      this.alert = Math.min(1, this.t / 0.38);
      this.fan.material.opacity = 0.15 + 0.45 * this.alert;
      this.armRx += (-2.6 - this.armRx) * (1 - Math.exp(-16 * dt));
      if (this.t >= 0.38) {
        this.fan.visible = false; this.armRx = 1.3;
        const f = fwd(this); this.vel.set(f.x * 8, 0, f.z * 8);
        fanHit(this, ctx, 5.2, Math.cos(THREE.MathUtils.degToRad(58)), 26);
        ctx.fx.sparks(V3(this.pos.x + f.x * 3, 1.5, this.pos.z + f.z * 3), f, 24, 0xff6ae8);
        this._end();
      }
    }
  }
  _slam(dt, ctx, p) {
    this.alert = Math.min(1, this.t / 1.0);
    this.slamWarn.material.opacity = 0.1 + 0.5 * this.alert * this.alert;
    if (this.t < 0.7) this.faceToward(p.x - this.pos.x, p.z - this.pos.z, dt, 5);
    this.armRx += (-2.7 - this.armRx) * (1 - Math.exp(-12 * dt));
    if (this.t >= 1.0) {
      const f = fwd(this), cx = this.pos.x + f.x * 4.4, cz = this.pos.z + f.z * 4.4;
      ctx.rig.shake(0.12); ctx.fx.sparks(V3(cx, 0.3, cz), f, 30, 0xff6ae8); ctx.fx.shockwave(V3(cx, 0, cz), 0xff6ae8, 1);
      if (Math.hypot(p.x - cx, p.z - cz) < 5.2) ctx.player.hurt(28, f, this);
      this.armRx = 1.35; this._end();
    }
  }
  _clock(dt) {
    this.alert = Math.min(1, this.t / 0.9);
    this.armRx += (-1.8 - this.armRx) * (1 - Math.exp(-8 * dt));
    if (this.bombs.every((b) => b.done)) this._end();
  }
  _updateBombs(dt, ctx) {
    const p = ctx.player.pos;
    for (const b of this.bombs) {
      if (b.done) continue;
      b.age += dt;
      b.m.material.opacity = 0.1 + 0.5 * Math.min(1, b.age / b.at) + (b.at - b.age < 0.25 && Math.sin(b.age * 50) > 0 ? 0.15 : 0);
      if (b.age >= b.at) {
        b.done = true; b.m.visible = false;
        const c = b.m.position;
        ctx.fx.sparks(V3(c.x, 0.4, c.z), V3(0, 1, 0), 20, 0xffc94a); ctx.fx.shockwave(c, 0xffc94a, 0.5);
        ctx.rig.shake(0.04);
        if (Math.hypot(p.x - c.x, p.z - c.z) < 2.6) ctx.player.hurt(22, V3(p.x - c.x, 0, p.z - c.z).normalize(), b);
      }
    }
  }
  _beam(dt, ctx, p) {
    const T0 = 1.0, T1 = 1.8; // 예고 → 회전
    if (this.t < T0) {
      this.alert = Math.min(1, this.t / T0);
      this.beamWarn.position.set(this.pos.x, 0.06, this.pos.z); this.beamWarn.rotation.y = this.beamA0;
      this.beamWarn.material.opacity = 0.12 + 0.45 * this.alert;
      this.facing = this.beamA0;
      return;
    }
    this.beamWarn.visible = false; this.beam.visible = true;
    const u = Math.min(1, (this.t - T0) / T1), a = this.beamA0 + this.beamDir * 2.8 * u;
    this.facing = a;
    this.beam.position.set(this.pos.x, 1.0, this.pos.z); this.beam.rotation.y = a;
    const d = V3(-Math.sin(a), 0, -Math.cos(a)), rx = p.x - this.pos.x, rz = p.z - this.pos.z;
    const along = rx * d.x + rz * d.z, perp = Math.abs(rx * d.z - rz * d.x);
    if (along > 0 && along < 26 && perp < 1.0) ctx.player.hurt(20, V3(-d.z, 0, d.x), this);
    if (u >= 1) this._end();
  }
  _barrage(dt, ctx) {
    this.alert = Math.min(1, this.t / 0.8);
    if (this.stage < 2 && this.t >= 0.8 + this.stage * 0.6) {
      const N = 18, off = Math.random() * 6;
      for (let i = 0; i < N; i++) {
        const a = off + (i / N) * Math.PI * 2, s = 12;
        ctx.projectiles.spawn(V3(this.pos.x + Math.cos(a) * 2.2, 3.4, this.pos.z + Math.sin(a) * 2.2), V3(Math.cos(a) * s, -(3.4 - 1.1) / (8 / s), Math.sin(a) * s), 10, this);
      }
      this.stage++;
    }
    if (this.stage >= 2) this._end();
  }
  update(dt, ctx) {
    super.update(dt, ctx);
    if (this.beam.visible && this.state !== 'act') this.beam.visible = false;
    if (!this.alive) { this.warnsOff(); for (const b of this.bombs) { b.m.visible = false; b.done = true; } return; }
    if (this.broken && this.state !== 'chase') { this.state = 'chase'; this.cd = 1; this.attacking = false; this.warnsOff(); }
    this.halo.rotation.z += dt * 0.2;
    this.hand1.rotation.z -= dt * (this.phase * 1.2);
    this.hand2.rotation.z -= dt * 0.15 * this.phase;
    this.body.position.y = 0.25 + Math.sin(performance.now() / 600) * 0.12;
    const s = dt > 0 ? Math.hypot(this.pos.x - this._last.x, this.pos.z - this._last.z) / dt : 0;
    this._last.copy(this.pos);
    const st = this.state === 'act' ? (this.alert < 1 ? 'windup' : 'strike') : this.state;
    this.J.shoulderR.rotation.x = this.armRx;
    this.anim.update(dt, Math.min(s, 6), this.armRx, st, this.broken);
  }
}
