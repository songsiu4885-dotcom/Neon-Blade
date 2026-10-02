import * as THREE from 'three';

const WARN = new THREE.Color(0xff3b30);
const AMBER = new THREE.Color(0xffc400);
const _c = new THREE.Color();

// 근접/원거리 적의 공통 기반: 피격(밀려남, 기울기, 번쩍임, 경직), 사망, 등장 연출.
// 하위 클래스는 ai(dt, ctx)를 구현하고, 공격 중이면 attacking을 true로 둔다.
export class Enemy {
  constructor({ maxHp, radius, knockMul = 1, hitY = 1.2, maxPosture = 50, parryPosture = 30 }) {
    this.group = new THREE.Group();
    this.pos = this.group.position;
    this.body = new THREE.Group(); // 기울어지는 부분
    this.group.add(this.body);
    this.radius = radius;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.knockMul = knockMul;
    this.hitY = hitY;
    this.alive = true;
    this.dead = false;      // true면 Combat이 목록에서 제거
    this.respawns = false;
    this.vel = new THREE.Vector3();
    this.lean = 0;
    this.leanDir = new THREE.Vector3(0, 0, 1);
    this.flash = 0;
    this.stagger = 0;
    this.alert = 0;         // 0..1 예고 강도
    this.facing = 0;
    this.spawnT = 0;
    this.attacking = false;
    this.maxPosture = maxPosture;
    this.parryPosture = parryPosture;
    this.posture = 0;
    this.postureT = 0;
    this.broken = false;    // 자세가 무너진 상태: 처형 가능
    this.brokenT = 0;
    this.kneel = 0;
    this.dodged = false;
    this.guards = false;           // 정면 방어(방패)
    this.executionDamage = null;   // null이면 처형 즉사, 숫자면 그만큼의 피해(보스)
    this.invulnerable = false;
    this.boss = false;
    this.elite = false;
    this.stdMats = [];      // MeshStandardMaterial (번쩍일 때 emissive)
    this.rimMats = [];      // MeshBasicMaterial (포인트 색)
  }

  std(color) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.7, emissive: 0x000000 });
    this.stdMats.push(m);
    return m;
  }
  rim(color) {
    const m = new THREE.MeshBasicMaterial({ color });
    m.userData.base = new THREE.Color(color);
    this.rimMats.push(m);
    return m;
  }

  cancelAttack() {}

  // 자세 게이지 증가. 가득 차면 무너지고 true를 돌려준다.
  addPosture(v) {
    if (this.maxPosture <= 0 || this.broken || !this.alive) return false;
    this.posture = Math.min(this.maxPosture, this.posture + v);
    this.postureT = 1.6;
    if (this.posture >= this.maxPosture) {
      this.broken = true;
      this.brokenT = 4;
      this.attacking = false;
      this.alert = 0;
      this.stagger = 0;
      this.cancelAttack();
      return true;
    }
    return false;
  }

  // 정면 방어 여부: 방패가 플레이어 쪽을 향하고 있을 때
  isFrontal(p) {
    if (!this.guards || this.broken || !this.alive) return false;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
    return (-Math.sin(this.facing) * dx - Math.cos(this.facing) * dz) / d > 0.35;
  }

  // 슈퍼아머: 정예는 항상, 일반 적은 공격 예고가 절반 넘게 진행되면 약공격으로 끊기지 않는다.
  // 무거운 공격(차지/4타/돌진 베기)은 언제나 끊는다.
  takeHit(dmg, dir, knock, launch, heavy = false) {
    if (this.invulnerable) return false;
    this.hp -= dmg;
    const armored = !heavy && !this.broken && (this.elite || (this.attacking && this.alert > 0.35));
    const kb = armored ? knock * 0.15 : knock;
    this.vel.set(dir.x * kb * this.knockMul, 0, dir.z * kb * this.knockMul);
    this.lean = armored ? 0.15 : 0.5 + Math.min(0.5, knock * 0.02);
    this.leanDir.copy(dir);
    this.flash = 0.09;
    if (!armored) {
      this.stagger = 0.24;
      this.attacking = false;
      this.alert = 0;
      this.cancelAttack();
    }
    if (this.hp <= 0) {
      this.alive = false;
      this.dead = true;
      this.group.visible = false;
      return true;
    }
    return false;
  }

  faceToward(dx, dz, dt, rate = 10) {
    const want = Math.atan2(-dx, -dz);
    const diff = ((want - this.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.facing += diff * (1 - Math.exp(-rate * dt));
  }

  update(dt, ctx) {
    if (!this.alive) return;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.vel.multiplyScalar(Math.exp(-6 * dt));

    this.lean *= Math.exp(-7 * dt);
    this.kneel += ((this.broken ? 1 : 0) - this.kneel) * (1 - Math.exp(-10 * dt));
    this.body.rotation.set(this.lean * this.leanDir.z + this.kneel * 0.5, 0, -this.lean * this.leanDir.x);
    this.group.rotation.y = this.facing;

    this.flash = Math.max(0, this.flash - dt);
    const f = this.flash > 0;
    for (const m of this.stdMats) m.emissive.setHex(f ? 0xffffff : 0x000000);
    const pulse = this.alert > 0 ? 0.5 + 0.5 * Math.sin(performance.now() * 0.03) : 0;
    for (const m of this.rimMats) {
      if (f) m.color.setHex(0xffffff);
      else if (this.broken) m.color.copy(m.userData.base).lerp(AMBER, 0.6 + 0.4 * Math.sin(performance.now() * 0.02));
      else m.color.copy(m.userData.base).lerp(WARN, Math.min(1, this.alert * (0.6 + 0.4 * pulse)));
    }

    if (this.spawnT < 1) {
      this.spawnT = Math.min(1, this.spawnT + dt * 2.5);
      this.group.scale.setScalar(0.2 + 0.8 * this.spawnT);
    }

    if (this.broken) {
      this.brokenT -= dt;
      if (this.brokenT <= 0) { this.broken = false; this.posture = 0; }
      return;
    }
    if (this.postureT > 0) this.postureT -= dt;
    else if (this.posture > 0) this.posture = Math.max(0, this.posture - 14 * dt);

    if (this.stagger > 0) { this.stagger -= dt; return; }
    if (this.spawnT < 1 || ctx.player.dead) { this.attacking = false; return; }
    this.ai(dt, ctx);
  }

  ai() {}
}

// 바닥에 깔리는 경고 도형 (붉은 가산 블렌딩)
export function warnMaterial() {
  return new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
}
