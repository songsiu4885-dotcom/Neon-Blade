import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Enemy, warnMaterial } from './enemy.js';
import { buildGuardRobot, GuardAnimator, buildDrone } from '../characters/robots.js';
import { heroGltf, buildHero, HeroAnimator } from '../characters/hero.js';
import { POSES, spline, easeInOut } from '../player.js';
import { audio } from '../audio.js';

// 중간보스와 최종 보스. 공통 뼈대(ScriptBoss) 위에서 기술 하나하나를 '대본'(제너레이터)으로 쓴다.
//  - yield 숫자: 그 시간만큼 기다린다 (단계가 오를수록 빨라진다)
//  - yield 0: 다음 프레임
// 바닥 위험 지역(ctx.hazards)은 붉은 예고 → 터짐. 터지는 순간 대시하면 완벽 회피.
// 체력 66%/33%에서 포효(무적)하며 단계가 오르고, 단계마다 졸개를 부른다.
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const fwd = (e) => V3(-Math.sin(e.facing), 0, -Math.cos(e.facing));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
const rectWarn = (w, l, z) => { const m = mesh(new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2), warnMaterial(), 0, 0.06, z); m.visible = false; return m; };
const yawTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
const COS = (deg) => Math.cos(THREE.MathUtils.degToRad(deg));

function fanHit(e, ctx, range, cosArc, dmg) {
  const p = ctx.player.pos, dx = p.x - e.pos.x, dz = p.z - e.pos.z, d = Math.hypot(dx, dz) || 1e-6;
  const f = fwd(e);
  if (d < range && (f.x * dx + f.z * dz) / d > cosArc) return ctx.player.hurt(dmg, f, e);
  return false;
}

// =================== 공통 뼈대 ===================
class ScriptBoss extends Enemy {
  // o: { key, name, hp, posture, exec, radius, hitY, phases, summons: {1:[...],2:[...],3:[...]}, cd: [min,max], speeds }
  constructor(x, z, o) {
    super({ maxHp: o.hp, radius: o.radius ?? 1.4, maxPosture: o.posture, hitY: o.hitY ?? 1.6 });
    this.o = o;
    this.boss = true; this.elite = true; this.key = o.key; this.name = o.name;
    this.midboss = o.key !== 'adam';
    this.executionDamage = o.exec;
    this.pos.set(x, 0, z);
    this.phase = 1; this.state = 'intro'; this.t = 0; this.cd = 0.8;
    this.co = null; this.wait = 0; this.sp = 1; this.rage = 1;
    this.armRx = 0.25; this.armT = 0.25; this.pose = 'chase';
    this._last = V3(x, 0, z); this.last = [];
    this.extras = []; // 씬에 따로 붙이는 물체 (죽으면 치운다)
  }
  cancelAttack() {}
  takeHit(dmg, dir, knock, launch, heavy) {
    if (this.invulnerable) return false;
    const dead = super.takeHit(dmg * (this.dmgTakenMul ?? 1), dir, knock * (this.o.knock ?? 0.12), launch, heavy);
    this.stagger = 0; // 보스는 맞아도 멈추지 않는다
    return dead;
  }
  // 죽거나 구역이 다시 시작될 때 Combat이 부른다
  cleanup() { this.warnsOff(); for (const o of this.extras) { o.visible = false; o.parent?.remove(o); } }
  warnsOff() { for (const w of this.warns || []) w.visible = false; }
  localWarn(m) { (this.warns ||= []).push(m); this.group.add(m); return m; }
  extra(o) { this.extras.push(o); this.ctx?.scene.add(o); this._pendingExtras = !this.ctx; return o; }

  summon(ctx, list = [], r = 11) {
    if (this.rush) list = list.slice(0, 2); // 보스 러시의 복제체는 졸개를 조금만 부른다
    list.forEach((type, i) => {
      const a = (i / list.length) * Math.PI * 2 + Math.random();
      ctx.spawn?.(type, this.pos.x + Math.cos(a) * r, this.pos.z + Math.sin(a) * r);
    });
  }

  face(rate = 8) {
    const p = this.ctx.player.pos;
    this.faceToward(p.x - this.pos.x, p.z - this.pos.z, this.dt, rate);
  }
  approach(speed, keep) {
    const p = this.ctx.player.pos, dx = p.x - this.pos.x, dz = p.z - this.pos.z, d = Math.hypot(dx, dz) || 1e-6;
    if (d > keep) { this.pos.x += (dx / d) * speed * this.sp * this.dt; this.pos.z += (dz / d) * speed * this.sp * this.dt; }
  }
  // 예고: T초 동안 alert를 올린다. 시작할 때 경고음이 나도록 attacking을 다시 켠다
  *tele(T, fn) {
    this.attacking = false; this.alert = 0;
    yield 0;
    this.attacking = true; this.dodged = false;
    for (let t = 0; t < T; t += this.dt * this.sp) { this.alert = Math.min(1, t / T); fn?.(t / T); yield 0; }
    this.alert = 1;
  }
  *hold(T, fn) { for (let t = 0; t < T; t += this.dt * this.sp) { fn?.(t / T); yield 0; } }

  // 기술 고르기: moves()가 [이름, 가중치] 목록을 돌려준다. 방금 쓴 기술은 덜 고른다
  _choose(dist) {
    const opts = this.moves(dist).filter(([, w]) => w > 0).map(([n, w]) => [n, this.last.includes(n) ? w * 0.35 : w]);
    let s = opts.reduce((a, [, w]) => a + w, 0) * Math.random();
    for (const [n, w] of opts) { s -= w; if (s <= 0) return n; }
    return opts[0][0];
  }
  start(name) {
    this.co = this['m_' + name](); this.move = name; this.state = 'act'; this.wait = 0;
    this.last.unshift(name); this.last.length = Math.min(this.last.length, 2);
  }
  finish() {
    this.state = 'idle'; this.co = null; this.attacking = false; this.alert = 0; this.pose = 'chase'; this.armT = 0.25;
    this.warnsOff();
    const [a, b] = this.o.cd ?? [0.5, 1.1];
    this.cd = rand(a, b);
  }

  ai(dt, ctx) {
    this.ctx = ctx; this.dt = dt;
    if (this._pendingExtras) { for (const o of this.extras) if (!o.parent) ctx.scene.add(o); this._pendingExtras = false; }
    const p = ctx.player.pos, dist = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    // 단계 전환
    if (this.state !== 'intro' && this.state !== 'roar') {
      const th = this.o.phases ?? [0.66, 0.33], r = this.hp / this.maxHp;
      const want = 1 + th.filter((v) => r < v).length;
      if (want > this.phase) {
        this.finish(); // 하던 기술을 끊는다
        this.phase = want; this.state = 'roar'; this.t = 0; this.invulnerable = true; this.co = null;
        this.attacking = false; this.alert = 0; this.warnsOff(); this.posture = 0; this.broken = false;
        ctx.combat.onPop?.(`PHASE ${this.phase}`, '#ff8cf0'); audio.roar();
        ctx.rig.shake(0.1); ctx.fx.flash(0.2);
        this.summon(ctx, this.o.summons?.[this.phase]);
        this.onPhase?.(ctx);
      }
    }
    this.sp = (this.o.speeds ?? [1, 1.15, 1.3])[this.phase - 1] * this.rage;
    if (this.state === 'intro') {
      this.t += dt; this.face(4); this.pose = 'chase';
      if (this.t > (this.o.introT ?? 1.3)) { this.state = 'idle'; this.cd = 0.6; this.summon(ctx, this.o.summons?.[1]); }
    } else if (this.state === 'roar') {
      this.t += dt; this.face(4); this.armT = -2.6; this.pose = 'windup';
      this.alert = 0.5 + 0.5 * Math.sin(this.t * 20);
      if (this.t > 1.4) { this.invulnerable = false; this.alert = 0; this.state = 'idle'; this.cd = 0.5; this.armT = 0.25; this.pose = 'chase'; }
    } else if (this.state === 'idle') {
      this.attacking = false; this.pose = 'chase';
      this.idle(dt, dist);
      this.cd -= dt * this.sp;
      if (this.cd <= 0) this.start(this.force || this._choose(dist));
      this.force = null;
    } else if (this.state === 'act') {
      if (this.wait > 0) this.wait -= dt * this.sp;
      if (this.wait <= 0) {
        const r = this.co.next();
        if (r.done) this.finish();
        else this.wait = r.value || 0;
      }
    }
  }
  idle(dt, dist) { this.face(6); this.approach(this.o.walk ?? 4.4, this.o.keep ?? 5); }

  update(dt, ctx) {
    super.update(dt, ctx);
    if (!this.alive) return;
    if (this.broken && this.state === 'act') { this.finish(); this.cd = 1.2; } // 무너지면 하던 기술이 끊긴다
    const spd = dt > 0 ? Math.hypot(this.pos.x - this._last.x, this.pos.z - this._last.z) / dt : 0;
    this._last.copy(this.pos);
    this.render(dt, spd);
  }
  render() {}
}

// =================== 망치를 든 거대 로봇 (골리앗, 헤카톤) 공통 기술 ===================
class MaulBoss extends ScriptBoss {
  constructor(x, z, o) {
    super(x, z, o);
    this.J = buildGuardRobot(this, o.look);
    this.anim = new GuardAnimator(this.J);
    this.body.scale.setScalar(o.scale);
    this.lift = 0;
  }
  render(dt, spd) {
    const k = this.pose === 'strike' ? 40 : 12;
    this.armRx += (this.armT - this.armRx) * (1 - Math.exp(-k * dt));
    this.anim.update(dt, Math.min(spd, 7), this.armRx, this.broken ? 'chase' : this.pose, this.broken);
    this.body.position.y = this.lift;
    if (this.invulnerable) this.body.rotation.x -= 0.08;
  }
  get D() { return this.o.dmg; }

  // 앞쪽 내려찍기. 3단계에서는 앞으로 이어지는 여진 두 번
  *m_slam() {
    this.armT = -2.7; this.pose = 'windup';
    yield* this.tele(0.3, () => this.face(8));
    const f = fwd(this), H = this.ctx.hazards;
    H.circle(this.pos.x + f.x * 4.4, this.pos.z + f.z * 4.4, 4.8, 0.75 / this.sp, this.D.slam, { owner: this, shake: 0.12 });
    if (this.phase >= 3) for (const [d, t] of [[9.5, 1.05], [14.5, 1.3]]) H.circle(this.pos.x + f.x * d, this.pos.z + f.z * d, 3.4, t / this.sp, this.D.slam * 0.8, { owner: this, shake: 0.08 });
    yield* this.hold(0.75);
    this.armT = 1.35; this.pose = 'strike';
    yield 0.6;
  }
  // 망치를 세 번 연달아 (매번 다시 겨눈다, 점점 빨라진다)
  *m_slam3() {
    for (const [T, r] of [[0.75, 4.2], [0.55, 4.2], [0.5, 5.6]]) {
      this.armT = -2.7; this.pose = 'windup';
      yield* this.tele(0.15, () => this.face(14));
      const f = fwd(this);
      this.ctx.hazards.circle(this.pos.x + f.x * 4.2, this.pos.z + f.z * 4.2, r, T / this.sp, this.D.slam, { owner: this, shake: 0.1 });
      yield* this.hold(T);
      this.armT = 1.35; this.pose = 'strike';
      this.vel.set(f.x * 6, 0, f.z * 6);
      yield 0.12;
    }
    yield 0.7;
  }
  // 몸 둘레 회전 베기. 2단계부터 바로 이어서 바깥 도넛 (안으로 파고들어야 산다)
  *m_sweep() {
    this.armT = -1.6; this.pose = 'windup';
    const H = this.ctx.hazards;
    yield* this.tele(0.1);
    H.circle(this.pos.x, this.pos.z, 7, 1.0 / this.sp, this.D.sweep, { owner: this, shake: 0.1 });
    yield* this.hold(1.0, () => this.face(3));
    this.armT = 1.0; this.pose = 'strike';
    if (this.phase >= 2) {
      yield 0.15;
      this.armT = -1.6; this.pose = 'windup';
      H.donut(this.pos.x, this.pos.z, 4.0, 13, 0.75 / this.sp, this.D.sweep, { owner: this });
      yield* this.tele(0.75);
      this.armT = 1.0; this.pose = 'strike';
    }
    yield 0.7;
  }
  // 돌진: 붉은 길이 그어진 뒤 그대로 달려온다. 벽에 박으면 크게 무너진다. 2단계부터 두 번
  *m_rush() {
    const n = this.phase >= 2 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      this.armT = -1.6; this.pose = 'windup';
      yield* this.tele(0.45, () => this.face(12));
      const a = this.facing;
      this.ctx.hazards.line(this.pos.x, this.pos.z, a, 24, 3.4, 0.45 / this.sp, 0, { owner: this, beam: false });
      yield* this.hold(0.45);
      const dir = fwd(this); let moved = 0, hit = false;
      this.pose = 'strike'; this.armT = 1.0;
      while (moved < 24) {
        const step = 34 * this.dt;
        const ahead = V3(this.pos.x + dir.x * (step + this.radius), 0, this.pos.z + dir.z * (step + this.radius));
        if (this.ctx.world?.blocked(ahead) || (this.ctx.world?.curGate() && ahead.z < this.ctx.world.curGate().z)) { // 벽에 박았다
          this.ctx.rig.shake(0.2);
          this.ctx.fx.sparks(V3(this.pos.x + dir.x * 2, 2, this.pos.z + dir.z * 2), dir.clone().negate(), 40, 0xffb347);
          if (this.addPosture(this.maxPosture * 0.45)) this.ctx.combat._broken(this);
          yield 1.6;
          return;
        }
        this.pos.x += dir.x * step; this.pos.z += dir.z * step; moved += step;
        const p = this.ctx.player.pos;
        if (!hit && Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < this.radius + 1.0 && this.ctx.player.hurt(this.D.rush, dir.clone(), this)) hit = true;
        yield 0;
      }
      yield 0.25;
    }
    yield 0.8;
  }
  // 지진: 망치를 바닥에 박아 퍼지는 충격파 여러 겹. 고리가 닿는 순간 대시로 넘는다
  *m_quake() {
    this.armT = -2.8; this.pose = 'windup';
    yield* this.tele(1.0, () => this.face(3));
    this.armT = 1.4; this.pose = 'strike';
    const p = this.ctx.player.pos, n = 1 + this.phase;
    if (Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 3.4) this.ctx.player.hurt(this.D.slam, V3(p.x - this.pos.x, 0, p.z - this.pos.z).normalize(), this);
    for (let i = 0; i < n; i++) this.ctx.hazards.wave(this.pos.x, this.pos.z, 9.5, 22, this.D.wave, (i * 0.6) / this.sp, { owner: this });
    this.ctx.rig.shake(0.15); this.ctx.fx.shockwave(this.pos, 0xffb347, 1.2);
    yield 1.2;
  }
  // 도약: 플레이어 자리에 착지 범위를 그리고 뛰어든다. 3단계에서는 두 번
  *m_leap() {
    const n = this.phase >= 3 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      this.armT = -2.4; this.pose = 'windup';
      yield* this.tele(0.4, () => this.face(10));
      const p = this.ctx.player.pos, tgt = V3(p.x, 0, p.z);
      this.ctx.world?.resolve(tgt, this.radius);
      const T = 0.95 / this.sp, from = this.pos.clone();
      this.ctx.hazards.circle(tgt.x, tgt.z, 4.4, T, this.D.slam, { owner: this, shake: 0.16 });
      this.facing = yawTo(from, tgt);
      for (let t = 0; t < T; t += this.dt) {
        const u = t / T;
        this.pos.x = from.x + (tgt.x - from.x) * u; this.pos.z = from.z + (tgt.z - from.z) * u;
        this.lift = Math.sin(Math.PI * u) * 7;
        yield 0;
      }
      this.pos.x = tgt.x; this.pos.z = tgt.z; this.lift = 0;
      this.armT = 1.35; this.pose = 'strike';
      yield 0.4;
    }
    yield 0.6;
  }
  // 기둥 낙하: 안쪽 고리 → 바깥 고리 → 다시 안쪽(어긋난 각도). 안전한 자리가 계속 바뀐다
  *m_pillars() {
    this.armT = -2.8; this.pose = 'windup';
    yield* this.tele(0.5);
    const H = this.ctx.hazards, cx = this.pos.x, cz = this.pos.z;
    const ring = (n, r, off, t) => { for (let i = 0; i < n; i++) { const a = off + (i / n) * Math.PI * 2; H.circle(cx + Math.cos(a) * r, cz + Math.sin(a) * r, 2.8, t / this.sp, this.D.pillar, { owner: this, color: 0xffb347 }); } };
    ring(6, 5.5, 0, 0.9); ring(9, 11, 0.3, 1.5); ring(6, 5.5, Math.PI / 6, 2.1);
    if (this.phase >= 3) ring(10, 15, 0, 2.6);
    yield* this.hold(this.phase >= 3 ? 2.6 : 2.1);
    this.armT = 1.2; this.pose = 'strike';
    yield 0.6;
  }
  // 몸 높이로 퍼지는 원형 탄막. 3단계는 두 겹
  *m_barrage() {
    this.armT = -2.0; this.pose = 'windup';
    yield* this.tele(0.7);
    const n = this.phase >= 3 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      this.ctx.projectiles.ring(this.pos.x, this.pos.z, 16, 11, this.D.shot, this, i * 0.2, 2.2);
      this.ctx.rig.shake(0.05);
      yield 0.45;
    }
    yield 0.5;
  }
}

// =================== 중간보스 1: 파쇄기 골리앗 ===================
export class Juggernaut extends MaulBoss {
  constructor(x, z) {
    super(x, z, {
      key: 'jugg', name: '파쇄기 골리앗', hp: 1400, posture: 340, exec: 240, radius: 1.6, scale: 1.95, walk: 4.2,
      look: { kit: 'jugg', accent: 0xff5a10, body: 'heavy', shell: 0x6a5a40, rim: 0xff7a20, vent: 0xffb347, weapon: 'maul' },
      dmg: { slam: 24, sweep: 22, rush: 28, wave: 18, pillar: 18, shot: 9 },
      summons: { 1: ['bomber', 'bomber'], 2: ['bomber', 'bomber', 'bomber', 'thug', 'thug'], 3: ['bomber', 'bomber', 'shield', 'shield', 'thug'] },
    });
  }
  moves(d) {
    const P = this.phase;
    return [['slam', d < 11 ? 3 : 0.5], ['sweep', d < 8 ? 2.5 : 0], ['rush', d > 6 ? 3 : 0.5], ['leap', d > 7 ? 2 : 0.5], ['quake', P >= 2 ? 2 : 0]];
  }
}

// =================== 중간보스 4: 타워 수문장 헤카톤 ===================
export class Gatekeeper extends MaulBoss {
  constructor(x, z) {
    super(x, z, {
      key: 'gate', name: '타워 수문장 헤카톤', hp: 1800, posture: 380, exec: 260, radius: 1.7, scale: 2.1, walk: 4.4,
      look: { kit: 'gate', accent: 0x00e5ff, body: 'heavy', shell: 0x2a2038, dark: 0x3a3450, rim: 0xff2bd6, vent: 0x00e5ff, weapon: 'maul' },
      dmg: { slam: 26, sweep: 24, rush: 30, wave: 20, pillar: 20, shot: 10 },
      summons: { 1: ['thug', 'thug', 'thug'], 2: ['shield', 'shield', 'thug', 'thug', 'drone', 'drone'], 3: ['exec', 'drone', 'drone', 'gunner', 'gunner'] },
    });
  }
  moves(d) {
    const P = this.phase;
    return [['slam3', d < 11 ? 3 : 0.5], ['sweep', d < 8 ? 2 : 0], ['rush', P >= 2 && d > 6 ? 2 : 0], ['quake', 1.5], ['pillars', P >= 2 ? 2 : 0], ['barrage', P >= 3 ? 1.5 : 0], ['leap', P >= 3 && d > 6 ? 1.5 : 0]];
  }
}

// =================== 중간보스 2: 쌍둥이 집행자 — 번갈아 들어오고, 함께 X자로 돌진한다. 하나가 쓰러지면 남은 쪽이 폭주 ===================
const TCOMBO = [
  { w: 0.5, dmg: 14, range: 4.0, cos: COS(75), lunge: 9 },
  { w: 0.36, dmg: 14, range: 4.0, cos: COS(75), lunge: 9 },
  { w: 0.8, dmg: 28, range: 4.8, cos: COS(50), lunge: 15 },
];
export class TwinExec extends ScriptBoss {
  constructor(x, z) {
    const second = !!(TwinExec.last && TwinExec.last.alive && !TwinExec.last.dead && !TwinExec.last.mate);
    super(x, z, {
      key: 'twin', name: second ? '쌍둥이 집행자 · 레무스' : '쌍둥이 집행자 · 로물루스', hp: 780, posture: 240, exec: 200, radius: 1.0,
      phases: [], cd: [0.4, 0.9], walk: 5.6, keep: 3.2, knock: 0.3,
    });
    if (second) { this.mate = TwinExec.last; TwinExec.last.mate = this; }
    TwinExec.last = this;
    this.J = buildGuardRobot(this, { kit: 'twin', shell: second ? 0x2a1030 : 0x3a1822, metal: 0xc8a050, rim: second ? 0xff2bd6 : 0xff2848, vent: second ? 0xff2bd6 : 0xff2848, weapon: 'sword' });
    this.anim = new GuardAnimator(this.J);
    this.body.scale.setScalar(1.45);
    this.warn = this.localWarn(rectWarn(4.4, 4.4, -2.4));
    this.strafe = second ? 1 : -1;
  }
  render(dt, spd) {
    const k = this.pose === 'strike' ? 40 : 14;
    this.armRx += (this.armT - this.armRx) * (1 - Math.exp(-k * dt));
    this.anim.update(dt, Math.min(spd, 7), this.armRx, this.pose, this.broken);
    this.body.position.y = this.lift || 0;
  }
  update(dt, ctx) {
    // 짝이 쓰러지면 폭주: 빨라지고 체력 일부 회복, 암살 로봇을 부른다
    if (this.alive && this.mate && !this.mate.alive && !this.enraged) {
      this.enraged = true; this.rage = 1.35; this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.25); this.posture = 0;
      ctx.combat.onPop?.('ENRAGE', '#ff3b30'); audio.roar(); ctx.fx.flash(0.2);
      for (const m of this.rimMats) m.userData.base.setHex(0xff1010);
      this.summon(ctx, ['assassin', 'assassin']);
    }
    super.update(dt, ctx);
  }
  // 짝이 기술을 쓰는 중이면 옆으로 돌며 기회를 본다 (폭주하면 쉬지 않는다)
  idle(dt, dist) {
    const busy = this.mate?.alive && this.mate.state === 'act' && !this.enraged;
    this.face(7);
    if (busy) {
      const p = this.ctx.player.pos, dx = p.x - this.pos.x, dz = p.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
      const radial = d < 6 ? -1 : d > 9 ? 1 : 0;
      this.pos.x += ((dx / d) * radial - (dz / d) * this.strafe) * 4.5 * dt;
      this.pos.z += ((dz / d) * radial + (dx / d) * this.strafe) * 4.5 * dt;
      this.cd = Math.max(this.cd, 0.3);
    } else this.approach(this.o.walk, this.o.keep);
  }
  moves(d) {
    return [['combo', d < 6 ? 3 : 0.3], ['cross', d > 5 ? 2.5 : 0.8], ['spin', d < 5 ? 1.5 : 0], ['leap', d > 6 ? 1.5 : 0.3]];
  }
  *m_combo() {
    for (const c of TCOMBO) {
      this.warn.visible = true; this.armT = -2.5; this.pose = 'windup';
      yield* this.tele(c.w, (u) => { if (u < 0.7) this.face(14); this.warn.material.opacity = 0.12 + 0.42 * u; });
      this.warn.visible = false; this.armT = 1.25; this.pose = 'strike';
      const f = fwd(this); this.vel.set(f.x * c.lunge, 0, f.z * c.lunge);
      fanHit(this, this.ctx, c.range, c.cos, c.dmg);
      yield 0.12;
    }
    yield 0.8;
  }
  // X자 돌진: 붉은 길 → 그대로 꿰뚫는다. 짝이 쉬고 있으면 같이 돌진한다
  *m_cross() {
    if (this.mate?.alive && this.mate.state === 'idle') { this.mate.force = 'cross'; this.mate.cd = 0; }
    this.armT = -1.6; this.pose = 'windup';
    yield* this.tele(0.3, () => this.face(14));
    const a = this.facing;
    this.ctx.hazards.line(this.pos.x, this.pos.z, a, 18, 2.4, 0.5 / this.sp, 0, { owner: this, beam: false });
    yield* this.hold(0.5);
    const dir = fwd(this); let moved = 0, hit = false;
    this.armT = 1.25; this.pose = 'strike';
    while (moved < 18) {
      const step = 36 * this.dt;
      if (this.ctx.world?.blocked(V3(this.pos.x + dir.x * 1.5, 0, this.pos.z + dir.z * 1.5))) break;
      this.pos.x += dir.x * step; this.pos.z += dir.z * step; moved += step;
      const p = this.ctx.player.pos;
      if (!hit && Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 1.8 && this.ctx.player.hurt(22, dir.clone(), this)) hit = true;
      yield 0;
    }
    yield 0.7;
  }
  *m_spin() {
    this.armT = -1.6; this.pose = 'windup';
    yield* this.tele(0.1);
    this.ctx.hazards.circle(this.pos.x, this.pos.z, 4.6, 0.75 / this.sp, 20, { owner: this });
    yield* this.hold(0.75);
    this.armT = 1.25; this.pose = 'strike';
    for (let t = 0; t < 0.3; t += this.dt) { this.facing += this.dt * 22; yield 0; }
    yield 0.6;
  }
  *m_leap() {
    this.armT = -2.5; this.pose = 'windup';
    yield* this.tele(0.3, () => this.face(10));
    const p = this.ctx.player.pos, tgt = V3(p.x, 0, p.z), from = this.pos.clone(), T = 0.8 / this.sp;
    this.ctx.world?.resolve(tgt, 1);
    this.ctx.hazards.circle(tgt.x, tgt.z, 3.2, T, 22, { owner: this });
    this.facing = yawTo(from, tgt);
    for (let t = 0; t < T; t += this.dt) { const u = t / T; this.pos.x = from.x + (tgt.x - from.x) * u; this.pos.z = from.z + (tgt.z - from.z) * u; this.lift = Math.sin(Math.PI * u) * 4; yield 0; }
    this.lift = 0; this.armT = 1.25; this.pose = 'strike';
    yield 0.7;
  }
}

// =================== 중간보스 3: 감시자 아르고스 — 떠다니는 거대 드론 ===================
export class Warden extends ScriptBoss {
  constructor(x, z) {
    super(x, z, {
      key: 'warden', name: '감시자 아르고스', hp: 1250, posture: 300, exec: 230, radius: 1.6, hitY: 3.0, cd: [0.6, 1.2],
      summons: { 1: ['drone', 'drone'], 2: ['drone', 'drone', 'drone', 'sniper'], 3: ['drone', 'drone', 'drone', 'sentinel'] },
    });
    this.flying = true; this.baseY = 3.0; this.pos.y = this.baseY;
    this.J = buildDrone(this);
    for (const m of this.rimMats) { m.userData.base.setHex(0xff3b30); m.color.setHex(0xff3b30); }
    this.body.scale.setScalar(3.2);
    this.strafe = 1; this.strafeT = 3; this.bob = 0; this.hover = this.baseY;
    this.beam = this.extra(mesh(new THREE.BoxGeometry(1.4, 0.6, 26).translate(0, 0, -13), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.4, 0.4), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })));
    this.beam.visible = false; this.beam.frustumCulled = false;
    this.beam2 = this.extra(this.beam.clone()); this.beam2.visible = false;
  }
  idle(dt, dist) {
    const p = this.ctx.player.pos, dx = p.x - this.pos.x, dz = p.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
    this.face(3);
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = 2.5 + Math.random() * 2; }
    const radial = d < 8 ? -1 : d > 14 ? 1 : 0;
    this.pos.x += ((dx / d) * radial - (dz / d) * this.strafe * 0.7) * 4 * dt;
    this.pos.z += ((dz / d) * radial + (dx / d) * this.strafe * 0.7) * 4 * dt;
  }
  render(dt) {
    this.bob += dt * 1.4;
    const want = this.broken ? 1.4 : this.hover;
    this.baseY += (want - this.baseY) * (1 - Math.exp(-4 * dt));
    this.pos.y = this.baseY + Math.sin(this.bob) * 0.25;
    this.hitY = this.pos.y;
    for (let i = 0; i < this.J.rotors.length; i++) this.J.rotors[i].rotation.y += dt * (i % 2 ? 26 : -26);
    if (this.state !== 'act') this.beam.visible = this.beam2.visible = false;
  }
  moves() {
    const P = this.phase;
    return [['lines', 3], ['bombard', 2], ['ring', 1.5], ['dive', 1.5], ['cage', P >= 2 ? 2 : 0], ['sweep', P >= 3 ? 2 : 0]];
  }
  // 플레이어를 지나는 레이저 선 1~3개를 차례로 긋는다
  *m_lines() {
    yield* this.tele(0.2);
    const n = this.phase, p = this.ctx.player.pos, base = yawTo(this.pos, p);
    for (let i = 0; i < n; i++) this.ctx.hazards.line(this.pos.x, this.pos.z, base + (i - (n - 1) / 2) * 0.42, 28, 2.4, (0.8 + i * 0.3) / this.sp, 22, { owner: this });
    yield* this.hold(0.8 + (n - 1) * 0.3);
    yield 0.6;
  }
  // 우리: 플레이어 둘레에 가로 두 줄, 세로 두 줄이 동시에 터지고, 이어 한가운데가 터진다
  *m_cage() {
    yield* this.tele(0.3);
    const p = this.ctx.player.pos, H = this.ctx.hazards, T = 1.0 / this.sp;
    for (const o of [-3.2, 3.2]) {
      H.line(p.x - 16, p.z + o, -Math.PI / 2, 32, 2.0, T, 20, { owner: this });
      H.line(p.x + o, p.z + 16, 0, 32, 2.0, T, 20, { owner: this });
    }
    H.circle(p.x, p.z, 2.6, T + 0.45 / this.sp, 22, { owner: this });
    yield* this.hold(1.5);
    yield 0.5;
  }
  // 폭격: 플레이어 발밑을 계속 따라오는 폭발. 멈추면 맞는다
  *m_bombard() {
    yield* this.tele(0.3);
    const n = 4 + this.phase * 2;
    for (let i = 0; i < n; i++) {
      const p = this.ctx.player.pos;
      this.ctx.hazards.circle(p.x, p.z, 2.4, 0.85 / this.sp, 18, { owner: this, color: 0xffb347 });
      yield 0.28;
    }
    yield 0.9;
  }
  *m_ring() {
    yield* this.tele(0.7);
    const n = this.phase >= 3 ? 2 : 1;
    for (let i = 0; i < n; i++) { this.ctx.projectiles.ring(this.pos.x, this.pos.z, 18, 11, 9, this, i * 0.17, 2.4, 1.15); yield 0.45; }
    yield 0.5;
  }
  // 급강하: 낮게 내려와 바닥을 때린다(원 + 충격파). 그 뒤 한동안 낮게 떠 있어 벨 수 있다
  *m_dive() {
    yield* this.tele(0.3);
    this.hover = 1.3;
    const H = this.ctx.hazards;
    H.circle(this.pos.x, this.pos.z, 5, 0.9 / this.sp, 24, { owner: this, shake: 0.15 });
    H.wave(this.pos.x, this.pos.z, 9, 16, 16, 0.9 / this.sp, { owner: this });
    yield* this.hold(0.9);
    this.attacking = false;
    yield* this.hold(2.4);
    this.hover = 3.0;
    yield 0.6;
  }
  // 회전 레이저: 두 줄기가 마주 보며 반 바퀴 돈다
  *m_sweep() {
    const a0 = yawTo(this.pos, this.ctx.player.pos) - 1.3, dirS = Math.random() < 0.5 ? 1 : -1;
    const H = this.ctx.hazards;
    H.line(this.pos.x, this.pos.z, a0, 26, 1.6, 1.0 / this.sp, 0, { owner: this, beam: false });
    H.line(this.pos.x, this.pos.z, a0 + Math.PI, 26, 1.6, 1.0 / this.sp, 0, { owner: this, beam: false });
    yield* this.tele(1.0);
    const T = 2.0, dmgSrc = { owner: this, dodged: false };
    for (let t = 0; t < T; t += this.dt * this.sp) {
      const a = a0 + dirS * 2.6 * (t / T);
      for (const [b, off] of [[this.beam, 0], [this.beam2, Math.PI]]) {
        b.visible = true; b.position.set(this.pos.x, 1.0, this.pos.z); b.rotation.y = a + off;
        const d = V3(-Math.sin(a + off), 0, -Math.cos(a + off)), p = this.ctx.player.pos, rx = p.x - this.pos.x, rz = p.z - this.pos.z;
        const along = rx * d.x + rz * d.z, perp = Math.abs(rx * d.z - rz * d.x);
        if (along > 0 && along < 26 && perp < 0.9) this.ctx.player.hurt(20, V3(-d.z, 0, d.x), dmgSrc);
      }
      yield 0;
    }
    this.beam.visible = this.beam2.visible = false;
    yield 0.7;
  }
}

// =================== 중간보스 5: 실험 감독관 헬릭스 — 기계 팔 넷 달린 떠 있는 코어 ===================
// 전기 바닥(체크무늬), 팔 내려찍기, 송전탑 호출(살아 있는 동안 탑과 코어 사이에 전류가 흐른다), 십자 회전 레이저
export class Helix extends ScriptBoss {
  constructor(x, z) {
    super(x, z, {
      key: 'helix', name: '실험 감독관 헬릭스', hp: 1500, posture: 320, exec: 240, radius: 1.5, hitY: 1.9, cd: [0.5, 1.0], walk: 3.4, keep: 7,
      summons: { 1: ['pylon', 'pylon'], 2: ['assassin', 'assassin', 'pylon'], 3: ['bomber', 'bomber', 'bomber', 'pylon', 'pylon'] },
    });
    this.flying = true;
    const shell = this.std(0xdedde6), dark = this.std(0x1c1a24), core = this.rim(0xff2bd6), vein = this.rim(0xff7ae0);
    shell.metalness = 0.6; shell.roughness = 0.3;
    this.body.position.y = 1.9;
    this.body.add(mesh(new THREE.SphereGeometry(0.9, 24, 16), dark));
    this.body.add(mesh(new THREE.SphereGeometry(0.55, 20, 14), core));
    for (const s of [-1, 1]) this.body.add(mesh(new THREE.SphereGeometry(0.95, 24, 12, 0, Math.PI * 2, s < 0 ? 0 : Math.PI * 0.62, Math.PI * 0.38), shell));
    this.ring = new THREE.Group(); this.body.add(this.ring);
    this.ring.add(mesh(new THREE.TorusGeometry(1.35, 0.07, 8, 40).rotateX(Math.PI / 2), shell));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; this.ring.add(mesh(new THREE.BoxGeometry(0.12, 0.12, 0.3), vein, Math.cos(a) * 1.35, 0, Math.sin(a) * 1.35)); }
    this.arms = [];
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2, g = new THREE.Group();
      g.rotation.y = -a; this.body.add(g);
      const up = new THREE.Group(); up.position.x = 0.8; g.add(up);
      up.add(mesh(new THREE.BoxGeometry(1.5, 0.22, 0.26).translate(0.75, 0, 0), shell));
      const lo = new THREE.Group(); lo.position.x = 1.5; up.add(lo);
      lo.add(mesh(new THREE.BoxGeometry(0.2, 1.9, 0.2).translate(0, -0.95, 0), dark));
      lo.add(mesh(new THREE.ConeGeometry(0.16, 0.5, 6).rotateX(Math.PI).translate(0, -2.1, 0), vein));
      this.arms.push({ up, lo, a });
    }
    this.zaps = []; // 송전탑 전류 (선)
    this.cross = [0, 1, 2, 3].map(() => { const b = this.extra(mesh(new THREE.BoxGeometry(1.2, 0.5, 24).translate(0, 0, -12), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.4, 1.8), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }))); b.visible = false; b.frustumCulled = false; return b; });
    this.zapT = 3; this.spinRing = 1; this.armLift = 0;
  }
  render(dt) {
    this.ring.rotation.y += dt * this.spinRing;
    this.body.position.y = (this.broken ? 1.0 : 1.9) + Math.sin(performance.now() / 500) * 0.12;
    const t = performance.now() / 1000;
    this.arms.forEach((A, i) => {
      A.up.rotation.z = 0.35 + this.armLift + Math.sin(t * 2 + i) * 0.06;
      A.lo.rotation.z = -0.5 - this.armLift * 0.5;
    });
    if (this.state !== 'act') for (const b of this.cross) b.visible = false;
  }
  update(dt, ctx) {
    super.update(dt, ctx);
    if (!this.alive || this.state === 'intro' || this.state === 'roar' || this.broken) return;
    // 살아 있는 송전탑마다 주기적으로 코어와 탑 사이에 전류 (탑을 먼저 부수는 게 좋다)
    this.zapT -= dt;
    if (this.zapT <= 0) {
      this.zapT = 3.2 / this.sp;
      for (const e of ctx.enemies) if (e.key === 'pylon' && e.alive) {
        const len = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
        ctx.hazards.line(this.pos.x, this.pos.z, yawTo(this.pos, e.pos), len, 1.6, 1.0, 16, { owner: this, color: 0xff7ae0 });
      }
    }
  }
  idle(dt, dist) { this.face(3); this.approach(3.4, 7); if (dist < 4) { const p = this.ctx.player.pos; this.approach(-3.4, 0); } }
  moves(d) {
    const P = this.phase;
    return [['checker', 2.5], ['arms', d < 10 ? 3 : 1], ['ring', 1.2], ['cross', P >= 2 ? 2.5 : 0], ['grab', d > 7 ? 1.5 : 0.3]];
  }
  // 전기 바닥: 체크무늬로 칸이 터지고, 곧바로 나머지 칸이 터진다 (안전한 칸이 뒤바뀐다)
  *m_checker() {
    this.spinRing = 6;
    yield* this.tele(0.4);
    const H = this.ctx.hazards, p = this.ctx.player.pos, S = 4.6, N = 3;
    const cx = Math.round(p.x / S) * S, cz = Math.round(p.z / S) * S;
    const rounds = this.phase >= 3 ? 3 : 2;
    for (let r = 0; r < rounds; r++) {
      for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) {
        if ((i + j + r) % 2 !== 0) continue;
        H.circle(cx + i * S, cz + j * S, S * 0.6, (1.0 + r * 0.8) / this.sp, 16, { owner: this, color: 0xff7ae0, shake: 0.01 });
      }
    }
    yield* this.hold(1.0 + (rounds - 1) * 0.8);
    this.spinRing = 1;
    yield 0.6;
  }
  // 팔 내려찍기: 네 팔이 차례로 플레이어 자리를 찍는다
  *m_arms() {
    this.armLift = 0.6;
    yield* this.tele(0.3, () => this.face(6));
    const n = 3 + this.phase;
    for (let i = 0; i < n; i++) {
      const p = this.ctx.player.pos;
      this.ctx.hazards.circle(p.x + rand(-0.6, 0.6), p.z + rand(-0.6, 0.6), 2.6, 0.7 / this.sp, 20, { owner: this, shake: 0.08 });
      yield 0.32;
    }
    yield* this.hold(0.5);
    this.armLift = 0;
    yield 0.7;
  }
  *m_ring() {
    yield* this.tele(0.6);
    this.ctx.projectiles.ring(this.pos.x, this.pos.z, 14 + this.phase * 2, 10, 9, this, Math.random() * 6, 1.8, 1.15);
    yield 0.9;
  }
  // 십자 레이저: 네 줄기가 회전한다. 3단계에서는 도중에 방향을 바꾼다
  *m_cross() {
    const a0 = Math.random() * Math.PI, H = this.ctx.hazards;
    for (let k = 0; k < 4; k++) H.line(this.pos.x, this.pos.z, a0 + (k * Math.PI) / 2, 24, 1.4, 1.0 / this.sp, 0, { owner: this, beam: false });
    this.spinRing = 8;
    yield* this.tele(1.0);
    const T = 2.6, src = { owner: this, dodged: false }, rev = this.phase >= 3;
    let a = a0, w = 1.1 * (Math.random() < 0.5 ? 1 : -1);
    for (let t = 0; t < T; t += this.dt * this.sp) {
      if (rev && Math.abs(t - T / 2) < this.dt * this.sp) w = -w * 1.3;
      a += w * this.dt * this.sp;
      this.cross.forEach((b, k) => {
        const ang = a + (k * Math.PI) / 2;
        b.visible = true; b.position.set(this.pos.x, 1.0, this.pos.z); b.rotation.y = ang;
        const d = V3(-Math.sin(ang), 0, -Math.cos(ang)), p = this.ctx.player.pos, rx = p.x - this.pos.x, rz = p.z - this.pos.z;
        const along = rx * d.x + rz * d.z, perp = Math.abs(rx * d.z - rz * d.x);
        if (along > 0 && along < 24 && perp < 0.8) this.ctx.player.hurt(18, V3(-d.z, 0, d.x), src);
      });
      yield 0;
    }
    for (const b of this.cross) b.visible = false;
    this.spinRing = 1;
    yield 0.7;
  }
  // 붙잡기 돌진: 낮게 미끄러지며 들이받는다
  *m_grab() {
    this.armLift = -0.3;
    yield* this.tele(0.35, () => this.face(10));
    this.ctx.hazards.line(this.pos.x, this.pos.z, this.facing, 16, 3.0, 0.45 / this.sp, 0, { owner: this, beam: false });
    yield* this.hold(0.45);
    const dir = fwd(this); let moved = 0, hit = false;
    while (moved < 16) {
      const step = 28 * this.dt;
      if (this.ctx.world?.blocked(V3(this.pos.x + dir.x * 2, 0, this.pos.z + dir.z * 2))) break;
      this.pos.x += dir.x * step; this.pos.z += dir.z * step; moved += step;
      const p = this.ctx.player.pos;
      if (!hit && Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 2.2 && this.ctx.player.hurt(24, dir.clone(), this)) hit = true;
      yield 0;
    }
    this.armLift = 0;
    yield 0.8;
  }
}

// 헬릭스의 송전탑: 움직이지 않는다. 부수면 전류가 끊긴다
export class Pylon extends Enemy {
  constructor(x, z) {
    super({ maxHp: 90, radius: 0.7, hitY: 1.4, maxPosture: 0 });
    this.key = 'pylon'; this.pos.set(x, 0, z);
    const dark = this.std(0x22202a), glow = this.rim(0xff7ae0);
    this.body.add(mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.4, 8), dark, 0, 0.2, 0));
    this.body.add(mesh(new THREE.CylinderGeometry(0.12, 0.18, 2.6, 6), dark, 0, 1.5, 0));
    for (const y of [1.0, 1.7, 2.4]) this.body.add(mesh(new THREE.TorusGeometry(0.32, 0.05, 6, 16).rotateX(Math.PI / 2), glow, 0, y, 0));
    this.body.add(mesh(new THREE.SphereGeometry(0.22, 10, 8), glow, 0, 2.9, 0));
  }
  ai() { this.vel.set(0, 0, 0); }
}

// =================== 최종 보스: 아담 ===================
// 카이의 전투 기록으로 만들어진 '검은 카이'. 주인공과 같은 몸, 쌍검, 가끔 칼을 등에 꽂고 권총을 쏜다. 주인공처럼 대시한다.
const mirrorPose = (k) => [k[0], -k[1], -k[2], k[3], k[4], -k[5]];
const REST = POSES.REST_POSE, REST_L = mirrorPose(REST);
const AIM = [-1.57, 0, 0, 1.0, -1.57, 0];
const C = POSES.COMBO;
export class Adam extends ScriptBoss {
  constructor(x, z) {
    super(x, z, {
      key: 'adam', name: '관리자 아담', hp: 3200, posture: 460, exec: 260, radius: 0.9, hitY: 1.3, cd: [0.35, 0.8], knock: 0.25, introT: 1.6,
      speeds: [1, 1.12, 1.28],
      summons: { 2: ['exec', 'exec', 'drone', 'drone'], 3: ['sentinel', 'assassin', 'assassin', 'gunner'] },
    });
    this.PR = [...REST]; this.PL = [...REST_L]; this.spin = 0; this.dashing = false; this.gunMode = false;
    const g = heroGltf();
    if (g) {
      this.rig = buildHero({ scene: cloneSkinned(g.scene), animations: g.animations }, { dark: true, dual: true, gun: true, sheath: true });
      this.rig.root.scale.setScalar(1.1);
      this.body.add(this.rig.root);
      this.heroAnim = new HeroAnimator(this.rig);
      for (const m of this.rig.armorMats) if (m.emissive) this.stdMats.push(m);
      this.rig.glow.userData.base = this.rig.glow.color.clone(); this.rimMats.push(this.rig.glow);
      this.reach = this.rig.maxReach;
      // 대시 잔상
      this.ghosts = [];
      const src = []; this.rig.model.traverse((o) => src.push(o)); this.srcNodes = src;
      for (let i = 0; i < 6; i++) {
        const gh = cloneSkinned(this.rig.model);
        const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 0.2, 0.9), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
        gh.traverse((o) => { if (o.isMesh) { o.material = mat; o.frustumCulled = false; } });
        const nodes = []; gh.traverse((o) => nodes.push(o));
        gh.userData = { mat, life: 0, nodes }; gh.visible = false; gh.scale.setScalar(1.1);
        this.ghosts.push(this.extra(gh));
      }
      this.ghostT = 0; this.ghostI = 0;
    } else { // 모델을 못 읽었을 때: 검은 로봇
      this.J = buildGuardRobot(this, { body: 'proc', shell: 0x15151c, rim: 0xff2bd6, vent: 0xff2bd6, weapon: 'sword' });
      this.anim = new GuardAnimator(this.J);
      this.body.scale.setScalar(1.3);
    }
    this.fan = this.localWarn(rectWarn(5.0, 4.2, -2.2));
    this.laser = this.extra(mesh(new THREE.BoxGeometry(0.05, 0.05, 1).translate(0, 0, -0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.2, 0.5), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })));
    this.laser.visible = false; this.laser.frustumCulled = false;
  }
  cleanup() { super.cleanup(); this.laser.visible = false; }
  // 기술이 끝나거나 끊기면(자세 붕괴, 단계 전환) 칼로 돌아온다
  finish() { super.finish(); this._gun(false); this.laser.visible = false; this.dashing = false; this.spin = 0; this.restPose = true; }

  // ---- 무기 바꾸기 ----
  _gun(on) {
    this.gunMode = on;
    if (!this.rig) return;
    this.rig.gunMode = on;
    this.rig.blade.visible = !on; this.rig.swordL.visible = !on;
    this.rig.gun.visible = on; this.rig.sheath.visible = on;
  }
  _muzzle() {
    if (!this.rig) return V3(this.pos.x, 1.4, this.pos.z);
    this.group.updateMatrixWorld(true);
    return this.rig.sword.localToWorld(this.rig.muzzle.clone());
  }

  render(dt, spd) {
    if (!this.rig) {
      this.armRx += (this.armT - this.armRx) * (1 - Math.exp(-14 * dt));
      this.anim.update(dt, Math.min(spd, 8), this.armRx, this.pose, this.broken);
      return;
    }
    // 쉬고 있을 때는 두 칼을 낮게 든 자세로 돌아간다
    if (this.state !== 'act' || this.restPose) {
      const k = 1 - Math.exp(-10 * dt), tR = this.gunMode ? AIM : REST;
      for (let i = 0; i < 6; i++) { this.PR[i] += (tR[i] - this.PR[i]) * k; this.PL[i] += (REST_L[i] - this.PL[i]) * k; }
      this.spin += (0 - this.spin) * k;
    }
    const R = this.rig, P = this.PR, L = this.PL;
    R.pivot.rotation.set(P[0], P[1], P[2]); R.sword.position.y = P[3] * this.reach; R.sword.rotation.set(P[4], 0, P[5]);
    R.pivotL.rotation.set(L[0], L[1], L[2]); R.swordL.position.y = L[3] * this.reach; R.swordL.rotation.set(L[4], 0, L[5]);
    R.root.rotation.y = this.spin;
    R.root.rotation.x += ((this.dashing ? -0.2 : 0) - R.root.rotation.x) * (1 - Math.exp(-10 * dt));
    this.heroAnim.update(dt, { speed: this.dashing ? 0 : spd, dashing: this.dashing, attacking: this.state === 'act', charging: false, stagger: this.broken, swordYaw: P[1] });
    // 잔상
    if (this.dashing) {
      this.ghostT -= dt;
      if (this.ghostT <= 0) {
        this.ghostT = 0.035;
        const gh = this.ghosts[this.ghostI++ % this.ghosts.length], dst = gh.userData.nodes;
        for (let i = 0; i < dst.length && i < this.srcNodes.length; i++) { dst[i].position.copy(this.srcNodes[i].position); dst[i].quaternion.copy(this.srcNodes[i].quaternion); dst[i].scale.copy(this.srcNodes[i].scale); }
        gh.position.copy(this.pos); gh.rotation.set(0, this.facing + this.spin, 0); gh.scale.setScalar(1.1);
        gh.userData.life = 1; gh.visible = true;
      }
    }
    for (const gh of this.ghosts) {
      if (!gh.visible) continue;
      gh.userData.life -= dt / 0.3;
      if (gh.userData.life <= 0) { gh.visible = false; continue; }
      gh.userData.mat.opacity = Math.pow(gh.userData.life, 1.6) * 0.3;
    }
  }

  idle(dt, dist) {
    this.face(8);
    this.approach(6.2, this.gunMode ? 9 : 3.8);
  }
  moves(d) {
    const P = this.phase;
    return [['combo', d < 7 ? 3 : 0.6], ['dash', d > 5 ? 2.5 : 1.2], ['gun', d > 6 ? 2 : 1], ['clock', 1.2], ['blink', P >= 2 ? 1.8 : 0], ['spin', P >= 2 && d < 6 ? 1.5 : 0]];
  }

  // 칼 한 번 휘두르기: 예고(감기) → 휘두름(임팩트에서 판정) → 마무리. hand: 'R' | 'L' | 'B'(양손)
  *_swing(def, hand, T, hitFn, lunge = 10) {
    this.restPose = false;
    const keysR = def.keys, keysL = def.keys.map(mirrorPose);
    const sR = [...this.PR], sL = [...this.PL];
    const useR = hand !== 'L', useL = hand !== 'R';
    this.fan.visible = !!hitFn;
    yield* this.tele(T, (u) => {
      if (u < 0.7) this.face(14);
      const e = 1 - Math.pow(1 - u, 3);
      for (let i = 0; i < 6; i++) {
        if (useR) this.PR[i] = sR[i] + (keysR[0][i] - sR[i]) * e;
        if (useL) this.PL[i] = sL[i] + (keysL[0][i] - sL[i]) * e;
      }
      this.fan.material.opacity = 0.12 + 0.45 * u;
    });
    this.fan.visible = false;
    const A = 0.13; let hit = false;
    const f = fwd(this); this.vel.set(f.x * lunge, 0, f.z * lunge);
    for (let t = 0; t < A; t += this.dt) {
      const e = easeInOut(Math.min(1, t / A));
      if (useR) spline(keysR, e, this.PR);
      if (useL) spline(keysL, e, this.PL);
      this.spin = (def.spin || 0) * e;
      if (!hit && e >= 0.45) { hit = true; hitFn?.(); audio.slash?.(!!def.heavy); }
      yield 0;
    }
    if (!hit) hitFn?.();
    this.spin = 0;
  }

  // 쌍검 연격: 오른손 → 왼손 → 양손 내려찍기 (2단계부터 마지막에 회전 베기)
  *m_combo() {
    const fan = (r, deg, dmg) => () => fanHit(this, this.ctx, r, COS(deg), dmg);
    yield* this._swing(C[0], 'R', 0.42, fan(3.8, 70, 15));
    yield 0.06;
    yield* this._swing(C[0], 'L', 0.32, fan(3.8, 70, 15));
    yield 0.06;
    yield* this._swing(C[2], 'B', 0.5, fan(4.4, 55, 24), 13);
    if (this.phase >= 2) {
      yield 0.08;
      this.ctx.hazards.circle(this.pos.x, this.pos.z, 4.4, 0.5 / this.sp, 22, { owner: this });
      yield* this._swing(C[3], 'B', 0.5, null, 6);
    }
    this.restPose = true;
    yield 0.7;
  }
  // 주인공과 같은 대시 베기. 단계만큼 연달아 (3단계는 지그재그)
  *m_dash() {
    const n = this.phase;
    for (let k = 0; k < n; k++) {
      this.restPose = false;
      const s = [...this.PR], sL = [...this.PL];
      const off = n >= 3 ? (k % 2 ? 0.45 : -0.45) : 0;
      const a = yawTo(this.pos, this.ctx.player.pos) + off;
      this.ctx.hazards.line(this.pos.x, this.pos.z, a, 15, 2.2, 0.42 / this.sp, 0, { owner: this, beam: false });
      yield* this.tele(0.42, (u) => {
        this.facing = a;
        for (let i = 0; i < 6; i++) { this.PR[i] = s[i] + (POSES.DASH_KEYS[0][i] - s[i]) * u; this.PL[i] = sL[i] + (mirrorPose(POSES.DASH_KEYS[0])[i] - sL[i]) * u; }
      });
      const dir = V3(-Math.sin(a), 0, -Math.cos(a)), D = 15, T = 0.32;
      let moved = 0, hit = false; this.dashing = true;
      audio.dash?.();
      for (let t = 0; moved < D; t += this.dt) {
        const step = Math.min(D - moved, (D / T) * this.dt);
        if (this.ctx.world?.blocked(V3(this.pos.x + dir.x * 1.2, 0, this.pos.z + dir.z * 1.2))) break;
        this.pos.x += dir.x * step; this.pos.z += dir.z * step; moved += step;
        const v = Math.min(1, Math.max(0, (moved / D - 0.4) / 0.5));
        spline(POSES.DASH_KEYS, easeInOut(v), this.PR); spline(POSES.DASH_KEYS.map(mirrorPose), easeInOut(v), this.PL);
        const p = this.ctx.player.pos;
        if (!hit && Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 1.7 && this.ctx.player.hurt(20, dir.clone(), this)) hit = true;
        yield 0;
      }
      this.dashing = false;
      yield 0.12;
    }
    this.restPose = true;
    yield 0.6;
  }
  // 칼을 등에 꽂고 권총: 조준선이 따라오다 멈추면 연사. 쏘는 사이 옆으로 걷는다
  *m_gun() {
    this.restPose = true;
    yield* this.hold(0.3);
    this._gun(true);
    const bursts = 1 + this.phase, side = Math.random() < 0.5 ? 1 : -1;
    for (let b = 0; b < bursts; b++) {
      let lock = null;
      this.laser.visible = true;
      yield* this.tele(0.7, (u) => {
        this.face(10);
        const p = this.ctx.player.pos;
        if (u < 0.78) lock = V3(p.x, 1.25, p.z);
        // 옆걸음
        const f = fwd(this); this.pos.x += -f.z * side * 3.2 * this.dt; this.pos.z += f.x * side * 3.2 * this.dt;
        const m = this._muzzle(), len = m.distanceTo(lock);
        this.laser.position.copy(m); this.laser.lookAt(lock); this.laser.rotateY(Math.PI); this.laser.scale.set(u < 0.78 ? 1 : 3, u < 0.78 ? 1 : 3, len);
        this.laser.material.opacity = u < 0.78 ? 0.35 : 0.95;
      });
      this.laser.visible = false;
      const m = this._muzzle(), base = V3(lock.x - m.x, 0, lock.z - m.z).normalize();
      const spread = this.phase >= 3 ? [-0.2, -0.1, 0, 0.1, 0.2] : [0, 0, 0];
      for (let i = 0; i < spread.length; i++) {
        const d = base.clone().applyAxisAngle(V3(0, 1, 0), spread[i]).multiplyScalar(34);
        this.ctx.projectiles.spawn(this._muzzle(), d, 9, this);
        yield this.phase >= 3 ? 0.02 : 0.09;
      }
      yield 0.25;
    }
    this._gun(false);
    yield 0.45;
  }
  // 시계 폭격: 플레이어 자리와 둘레가 차례로 터진다
  *m_clock() {
    this.restPose = false;
    const sR = [...this.PR], sL = [...this.PL], up = C[2].keys[0];
    yield* this.tele(0.4, (u) => { for (let i = 0; i < 6; i++) { this.PR[i] = sR[i] + (up[i] - sR[i]) * u; this.PL[i] = sL[i] + (mirrorPose(up)[i] - sL[i]) * u; } });
    const p = this.ctx.player.pos, n = this.phase >= 3 ? 8 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / Math.max(1, n - 1)) * Math.PI * 2 + Math.random(), r = i === 0 ? 0 : 3.8;
      this.ctx.hazards.circle(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, 2.6, (0.9 + i * 0.14) / this.sp, 20, { owner: this, color: 0xffc94a });
    }
    yield* this.hold(0.9 + n * 0.14);
    this.restPose = true;
    yield 0.4;
  }
  // 순간이동: 등 뒤 표시 → 나타나며 베기
  *m_blink() {
    const p = this.ctx.player.pos, pf = V3(-Math.sin(this.ctx.player.facing), 0, -Math.cos(this.ctx.player.facing));
    const dest = V3(p.x - pf.x * 2.6, 0, p.z - pf.z * 2.6);
    this.ctx.world?.resolve(dest, 1);
    this.ctx.hazards.circle(dest.x, dest.z, 1.2, 0.45 / this.sp, 0, { owner: this });
    yield* this.tele(0.45);
    this.ctx.fx.sparks(V3(this.pos.x, 1.4, this.pos.z), V3(0, 1, 0), 18, 0xff2bd6);
    this.pos.copy(dest);
    this.ctx.fx.sparks(V3(this.pos.x, 1.4, this.pos.z), V3(0, 1, 0), 18, 0xff2bd6);
    this.facing = yawTo(this.pos, this.ctx.player.pos);
    yield* this._swing(C[1], 'B', 0.34, () => fanHit(this, this.ctx, 4.0, COS(65), 22), 8);
    this.restPose = true;
    yield 0.6;
  }
  // 주인공의 4타처럼 몸을 한 바퀴 돌리는 회전 베기
  *m_spin() {
    this.ctx.hazards.circle(this.pos.x, this.pos.z, 4.6, 0.6 / this.sp, 24, { owner: this });
    yield* this._swing(C[3], 'B', 0.6, null, 4);
    this.restPose = true;
    yield 0.6;
  }
}
