import * as THREE from 'three';
import { buildHuman, HumanAnimator } from './characters/human.js';
import { defaultMods } from './chips.js';
import { audio } from './audio.js';

const RUN_SPEED = 11;
const ACCEL = 48;       // 붙는 듯하지만 순간이동처럼 보이지 않는 가속
const DECEL = 40;
const DASH_SPEED = 46;
const DASH_TIME = 0.24;
const DASH_END_SPEED = 0.2; // 대시 종료 시 남기는 속도 비율
const MAX_STAMINA = 3;
const STAMINA_RECHARGE = 1.6; // 한 칸 충전 시간(초)
const COMBO_GRACE = 0.4;     // 마지막 타 이후 콤보가 유지되는 시간
const CHARGE_START = 0.25;   // 누르고 있으면 차징 시작
const CHARGE_FULL = 0.7;
const DASH_SLASH_WINDOW = 0.3; // 대시 직후 이 시간 안에 공격하면 돌진 베기

// 칼 자세 = [rx, ry, rz, reach, wx, wz]
//  rx/ry/rz: 어깨에서 주먹으로 향하는 방향 (ry < 0 오른쪽, ry > 0 왼쪽, rx -1.57 정면 수평)
//  reach: 팔을 뻗은 정도 (1 = 다 뻗음), wx/wz: 손목 꺾임 (칼날이 팔 방향에서 얼마나 젖혀지는지)
// keys: [준비(감기), 임팩트, 마무리]. 준비 때 팔을 접고 칼날을 뒤로 젖혔다가, 임팩트에서 뻗으며 칼끝이 채찍처럼 따라온다.
const K = (rx, ry, rz, reach, wx, wz) => [rx, ry, rz, reach, wx, wz];
const COMBO = [
  // 1타: 오른쪽 → 왼쪽 수평 베기
  { wind: 0.07, act: 0.1, rec: 0.15, lunge: 9, lungeT: 0.14, dmg: 10, posture: 8, range: 3.0, arc: 130, kb: 9, hs: 0.05,
    keys: [K(-1.5, -1.65, 0.1, 0.6, 0.15, -1.15), K(-1.5, 0.0, 0, 1.0, 0.05, -0.1), K(-1.55, 1.45, -0.1, 0.72, 0, 0.75)] },
  // 2타: 왼쪽 아래 → 오른쪽 위 올려 베기
  { wind: 0.07, act: 0.1, rec: 0.15, lunge: 9, lungeT: 0.14, dmg: 10, posture: 8, range: 3.0, arc: 130, kb: 9, hs: 0.05,
    keys: [K(-2.05, 1.35, 0.25, 0.58, -0.2, 1.05), K(-1.6, 0.0, 0, 1.0, 0.1, 0.1), K(-1.05, -1.35, -0.2, 0.75, 0.35, -0.7)] },
  // 3타: 머리 위에서 내려찍기
  { wind: 0.09, act: 0.1, rec: 0.17, lunge: 10, lungeT: 0.15, dmg: 12, posture: 10, range: 3.2, arc: 110, kb: 11, hs: 0.06,
    keys: [K(0.45, -0.15, 0.1, 0.58, 1.0, 0), K(-1.35, -0.08, 0, 1.0, 0.15, 0), K(-2.35, -0.15, 0, 0.82, -0.25, 0)] },
  // 4타: 몸 전체를 한 바퀴 돌리며 수평 회전 베기
  { wind: 0.12, act: 0.16, rec: 0.28, lunge: 13, lungeT: 0.18, dmg: 20, posture: 16, range: 3.6, arc: 360, kb: 26, hs: 0.1, sparks: 28, heavy: true, spin: Math.PI * 2,
    keys: [K(-1.45, -1.75, 0.1, 0.6, 0.1, -1.25), K(-1.45, 0.0, 0, 1.0, 0, -0.1), K(-1.5, 1.45, -0.1, 0.78, 0, 0.8)] },
];
// 대시 자체가 베기: 지나가는 길의 적을 벤다
export const DASH_CUT = { dmg: 16, posture: 14, kb: 9, hs: 0.05, sparks: 18, heavy: false };
const DASH_SLASH = { wind: 0.04, act: 0.14, rec: 0.2, lunge: 30, lungeT: 0.15, dmg: 26, posture: 22, range: 3.8, arc: 200, kb: 20, hs: 0.1, sparks: 26, heavy: true,
  keys: [K(-1.45, -1.85, 0.25, 0.6, 0.1, -1.25), K(-1.5, 0.0, 0, 1.0, 0, -0.1), K(-1.6, 1.55, -0.1, 0.75, 0, 0.85)] };
const HEAVY = { wind: 0.12, act: 0.12, rec: 0.3, lunge: 13, lungeT: 0.16, dmg: 32, posture: 22, range: 4.0, arc: 170, kb: 28, hs: 0.11, sparks: 32, heavy: true,
  keys: [K(0.85, -0.1, 0.1, 0.6, 1.15, 0), K(-1.25, -0.05, 0, 1.0, 0.15, 0), K(-2.5, -0.1, 0, 0.85, -0.2, 0)] };
const REST_POSE = K(-2.75, -0.67, -0.07, 0.75, 0.57, 0.3); // 오른손을 허리 옆에, 칼끝은 앞 아래 바깥으로
const CHARGE_POSE = K(0.9, -0.2, 0.1, 0.6, 1.1, 0);      // 머리 위로 들어 뒤로 젖힘
// 돌진: 칼을 몸 뒤로 낮게 끌고 달리다가, 끝무렵에 앞으로 크게 벤다
const DASH_KEYS = [K(-1.95, -2.55, 0, 0.85, 0.35, 0), K(-1.5, -0.2, 0, 1.0, 0, -0.15), K(-1.55, 1.4, -0.1, 0.75, 0, 0.75)];
const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const cr = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
// keys를 매끈한 곡선으로 지나간다 (u: 0..1)
function spline(keys, u, out) {
  const n = keys.length - 1, f = Math.min(n - 1e-6, Math.max(0, u * n)), i = Math.floor(f), t = f - i;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(n, i + 2)];
  for (let j = 0; j < out.length; j++) out[j] = cr(k0[j], k1[j], k2[j], k3[j], t);
  return out;
}
const NEUTRAL = { move: { x: 0, y: 0 }, dash: false, attack: false, attackHeld: false, lookDX: 0, lookDY: 0 };
const easeOut = (u) => 1 - Math.pow(1 - u, 3);

export class Player {
  constructor() {
    this.group = new THREE.Group();
    this.pos = this.group.position;
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.dashing = false;
    this.dashTimer = 0;
    this.dashDir = new THREE.Vector3(0, 0, -1);
    this.stamina = MAX_STAMINA;
    this.maxStamina = MAX_STAMINA;
    this.speedRatio = 0;
    this.onDashStart = null;
    this.onDashEnd = null;
    this.dashHits = new Set();
    this.sinceDash = 99;
    this.atk = null;
    this.atkDir = new THREE.Vector3(0, 0, -1);
    this.comboIdx = 0;
    this.comboTimer = 0;
    this.buffer = 0;
    this.held = 0;
    this.charging = false;
    this.charge = 0;
    this.swinging = false;
    this.maxHp = 100;
    this.hp = 100;
    this.mods = defaultMods();
    // 폭주 게이지: 특수 칩 〈오버드라이브〉를 장착했을 때만 쌓인다
    this.rage = 0;
    this.rageIdle = 0;
    this.rampage = false;
    this.rampageT = 0;
    this.rampageDur = 10;
    this.onRampage = null;
    this.onSwing = null;
    this.invuln = 0;
    this.stagger = 0;
    this.dead = false;
    this.onHurt = null;
    this.onPerfectDodge = null;
    this.dodgeCd = 0;
    this.counterT = 0; // 완벽 회피 후 반격 강화 시간
    this.onDeath = null;

    this._buildModel();
  }

  _buildModel() {
    this._setRig(buildHuman({ palette: 'hero', sword: true, cyber: true, coatLen: 0.7 }), HumanAnimator);
    this.pose = [...REST_POSE];
    this.prevPose = [...REST_POSE];
    this.roll = 0;
    this.yawBase = 0;
    this.spin = 0; this.prevSpin = 0;
  }

  _setRig(c, Animator) {
    if (this.model) { c.root.rotation.copy(this.model.rotation); this.group.remove(this.model); }
    this.model = c.root;
    this.rig = c;
    this.pivot = c.pivot;
    this.sword = c.sword;
    this.aura = c.aura;
    this.swordTip = c.swordTip;
    this.swordBase = c.swordBase;
    this.reach = c.maxReach || 0.58;
    this.group.add(this.model);
    this.anim = new Animator(c);
  }

  // 스키닝 모델이 로드되면 교체한다 (그 전까지는 절차적 모델)
  useHero(rig, Animator) {
    const bladeColor = this.rig.bladeMat.color.clone(), auraColor = this.aura.material.color.clone();
    this._setRig(rig, Animator);
    rig.bladeMat.color.copy(bladeColor); rig.aura.material.color.copy(auraColor);
  }

  // 카메라 기준 입력을 월드 방향으로 변환
  _worldDir(move, cam) {
    const f = cam.forward(), r = cam.right();
    return new THREE.Vector3().addScaledVector(r, move.x).addScaledVector(f, move.y);
  }

  _facingDir() {
    return new THREE.Vector3(-Math.sin(this.facing), 0, -Math.cos(this.facing));
  }

  _distTo(e) {
    return Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
  }

  setMods(m) {
    this.mods = m;
    this.maxStamina = MAX_STAMINA + m.extraDash;
    this.maxHp = 100 + m.hpBonus;
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
  }

  // 칩을 얻었을 때: 늘어난 만큼 현재 값도 함께 늘어난다
  upgrade(m) {
    const dh = (100 + m.hpBonus) - this.maxHp, ds = (3 + m.extraDash) - this.maxStamina;
    this.mods = m;
    this.maxHp += dh; this.hp = Math.min(this.maxHp, this.hp + Math.max(0, dh));
    this.maxStamina += ds; this.stamina = Math.min(this.maxStamina, this.stamina + Math.max(0, ds));
  }

  addRage(v) {
    if (this.rampage || this.dead || !this.mods.overdrive) return;
    this.rage = Math.min(100, this.rage + v * this.mods.rampGain);
    this.rageIdle = 0;
    if (this.rage >= 100) {
      this.rampage = true;
      this.rampageDur = 10 + this.mods.rampBonus;
      this.rampageT = this.rampageDur;
      this.onRampage?.(true);
    }
  }

  _startAttack(kind, wish, combat) {
    const def = kind === 'dashSlash' ? DASH_SLASH : kind === 'heavy' ? HEAVY : COMBO[this.comboIdx];
    // 약한 조준 보정: 가려는 방향 35° 안, 4.5m 안의 가장 가까운 적에게만 살짝 맞춘다
    let dir = kind === 'dashSlash' ? this.dashDir.clone() : wish.lengthSq() > 0.01 ? wish.clone().normalize() : this._facingDir();
    const tg = combat?.assist(this, dir, 4.5, 35);
    this.atkTarget = tg;
    if (tg) dir = new THREE.Vector3(tg.pos.x - this.pos.x, 0, tg.pos.z - this.pos.z).normalize();
    this.atkDir.copy(dir);
    this.facing = Math.atan2(-dir.x, -dir.z);
    this.atk = { def, kind, t: 0, hit: new Set(), dmgMul: kind === 'heavy' ? 1 + this.charge * 1.2 : 1 };
    if (kind === 'L') this.comboIdx = (this.comboIdx + 1) % COMBO.length;
    this.buffer = 0;
    this.charging = false;
    this.held = 0;
    this.charge = 0;
    this.onSwing?.(def, kind);
    this.startPose = [...this.pose];
    this.spin = 0;
  }

  // 피격. 맞으면 true. 대시 중이면 피하고, 공격이 닿는 순간이면 완벽 회피가 된다.
  hurt(dmg, dir, src = null) {
    if (this.dead || this.invuln > 0) return false;
    if (this.dashing || this.sinceDash < 0.15) {
      if (src && !src.dodged) {
        src.dodged = true;
        if (this.dodgeCd <= 0) {
          this.dodgeCd = 0.7;
          this.counterT = 1.0 + this.mods.counterTime;
          this.stamina = Math.min(this.maxStamina, this.stamina + 1);
          this.onPerfectDodge?.(src);
        }
      }
      return false;
    }
    dmg *= this.mods.dmgTaken * (this.dmgScale ?? 1.35); // 깊은 구역일수록 아프다 (구역 진행이 정한다)
    this.hp = Math.max(0, this.hp - dmg);
    this.invuln = 0.5;
    this.stagger = 0.3;
    this.vel.set(dir.x * 11, 0, dir.z * 11);
    this.atk = null; this.charging = false; this.held = 0; this.charge = 0; this.buffer = 0;
    this.comboIdx = 0; this.comboTimer = 0;
    this.onHurt?.(dmg, dir);
    if (this.hp <= 0) { this.dead = true; this.onDeath?.(); }
    return true;
  }

  reset(spawn) {
    this.hp = this.maxHp; this.dead = false; this.invuln = 1; this.stagger = 0;
    this.pos.copy(spawn || this.pos.set(0, 0, 0)); this.vel.set(0, 0, 0);
    this.atk = null; this.dashing = false; this.stamina = this.maxStamina; this.counterT = 0; this.rage = 0; this.rampage = false; this.rampageT = 0;
    this.comboIdx = 0; this.model.rotation.x = 0;
  }

  update(dt, input, cam, combat) {
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.rampage) {
      this.rampageT -= dt;
      this.rage = Math.max(0, (this.rampageT / this.rampageDur) * 100);
      if (this.rampageT <= 0) { this.rampage = false; this.rage = 0; this.onRampage?.(false); }
    } else if (this.rage > 0) {
      this.rageIdle += dt;
      if (this.rageIdle > 3) this.rage = Math.max(0, this.rage - 7 * dt); // 한동안 공격이 없으면 식는다
    }
    this.stagger = Math.max(0, this.stagger - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.counterT = Math.max(0, this.counterT - dt);
    if (this.dead || this.stagger > 0) input = NEUTRAL;
    const move = input.move;
    const wish = this._worldDir(move, cam);
    const wishLen = Math.min(1, wish.length());
    this.sinceDash += dt;

    // 스태미나 충전 (칸 단위로 빠르게)
    if (this.stamina < this.maxStamina) {
      this.stamina = Math.min(this.maxStamina, this.stamina + dt / (STAMINA_RECHARGE * this.mods.rechargeMul) * (this.rampage ? 1.8 : 1));
    }

    if (input.attack) this.buffer = 0.25;
    else this.buffer = Math.max(0, this.buffer - dt);

    // ---- 대시 ----
    if (input.dash && !this.dashing && this.stamina >= 1) {
      this.stamina -= 1;
      this.atk = null; this.charging = false; this.held = 0; this.charge = 0;
      let dir;
      if (wishLen > 0.1) {
        const ang = Math.atan2(move.x, move.y);
        const snapped = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
        dir = this._worldDir({ x: Math.sin(snapped), y: Math.cos(snapped) }, cam);
      } else {
        dir = cam.forward();
      }
      dir.y = 0; dir.normalize();
      // 대시 보정: 대시 방향 35° 안, 11m 안의 적이면 그쪽으로 꺾어 확실히 베고 지나가게 한다
      const tg = combat?.assist(this, dir, 11, 35);
      if (tg) dir.set(tg.pos.x - this.pos.x, 0, tg.pos.z - this.pos.z).normalize();
      this.dashDir.copy(dir);
      this.dashing = true;
      this.dashTimer = DASH_TIME;
      this.dashHits.clear();
      this.facing = Math.atan2(-dir.x, -dir.z);
      this.onDashStart?.(this.dashDir);
    }


    if (this.dashing) {
      this.dashTimer -= dt;
      const u = 1 - this.dashTimer / DASH_TIME; // 0→1
      // 처음엔 폭발적으로, 끝으로 갈수록 미끄러지듯 감속
      this.vel.copy(this.dashDir).multiplyScalar(DASH_SPEED * (1.45 - 0.9 * u));
      if (this.dashTimer <= 0) {
        this.dashing = false;
        this.sinceDash = 0;
        this.vel.multiplyScalar(DASH_END_SPEED);
        this.onDashEnd?.(this.dashDir);
      }
    } else {
      // ---- 공격 상태 ----
      if (!this.atk) {
        if (this.comboTimer > 0) {
          this.comboTimer -= dt;
          if (this.comboTimer <= 0) this.comboIdx = 0;
        }
        // 차징: 공격 버튼을 계속 누르고 있으면
        if (input.attackHeld && this.held >= 0) {
          this.held += dt;
          if (this.held > CHARGE_START) {
            this.charging = true;
            this.charge = Math.min(1, (this.held - CHARGE_START) / (CHARGE_FULL - CHARGE_START));
          }
        } else {
          if (this.charging) this._startAttack('heavy', wish, combat);
          this.charging = false; this.held = 0;
        }
        if (!this.atk && this.buffer > 0) {
          const dashSlash = this.sinceDash < DASH_SLASH_WINDOW;
          this._startAttack(dashSlash ? 'dashSlash' : 'L', wish, combat);
        }
      }

      if (this.atk) this._updateAttack(dt, wish, combat);
      else this._updateMove(dt, wish, wishLen, this.charging ? 0.35 : 1);
    }

    const prevX = this.pos.x, prevZ = this.pos.z;
    this.pos.addScaledVector(this.vel, dt);
    if (this.dashing) combat?.dashStrike(this, prevX, prevZ); // 지나간 경로 위의 적을 벤다
    combat?.resolve(this); // 건물/도시 경계와 적 충돌

    this.speedRatio = Math.min(1, this.vel.length() / RUN_SPEED);
    this._updatePose(dt);

    // 모델 회전 / 기울임 / 대시 중 스트레치
    const cur = this.yawBase;
    let diff = ((this.facing - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const turn = this.dashing || this.atk ? 34 : 11;
    const dy = diff * (1 - Math.exp(-turn * dt));
    this.yawBase = cur + dy;
    this.model.rotation.y = this.yawBase + this.spin; // 회전 베기 중에는 몸 전체가 돈다
    // 달리며 방향을 틀면 안쪽으로 살짝 기운다
    const wantRoll = this.dashing || this.atk || dt <= 0 ? 0 : THREE.MathUtils.clamp(-(dy / dt) * 0.035 * this.speedRatio, -0.2, 0.2);
    this.roll += (wantRoll - this.roll) * (1 - Math.exp(-8 * dt));
    this.model.rotation.z = this.roll;
    const lean = this.dead ? 1.45 : this.dashing ? 0.2 : this.speedRatio * 0.1;
    this.model.rotation.x += (-lean - this.model.rotation.x) * (1 - Math.exp(-(this.dead ? 6 : 10) * dt));
    this.anim.update(dt, {
      speed: this.dead ? 0 : Math.hypot(this.vel.x, this.vel.z),
      dashing: this.dashing,
      attacking: !!this.atk,
      charging: this.charging,
      stagger: this.stagger > 0,
      swordYaw: this.pose[1],
      swordPitch: this.pose[0],
      // 양손으로 쥐는 기술: 3타 내려찍기, 강공격, 차징
      twoHand: this.charging || (this.atk && (this.atk.kind === 'heavy' || this.atk.def === COMBO[2])),
    });
  }

  _updateMove(dt, wish, wishLen, scale) {
    const target = wish.clone().multiplyScalar(RUN_SPEED * this.mods.speedMul * (this.rampage ? 1.2 : 1) * (wishLen > 0 ? scale : 0));
    const rate = wishLen > 0 ? ACCEL : DECEL;
    const dv = target.sub(this.vel);
    const maxStep = rate * dt;
    if (dv.length() > maxStep) dv.setLength(maxStep);
    this.vel.add(dv);
    if (wishLen > 0.1) this.facing = Math.atan2(-wish.x, -wish.z);
  }

  _updateAttack(dt, wish, combat) {
    const a = this.atk, def = a.def;
    a.t += dt * (this.rampage ? 1.25 : 1) * (this.mods.atkSpeed || 1); // 폭주·가속 칩이 있으면 공격이 빨라진다
    const activeStart = def.wind, activeEnd = def.wind + def.act, total = activeEnd + def.rec;

    // 돌진: 대상에 거의 붙으면 멈춘다
    if (a.t < def.lungeT) {
      const tg = this.atkTarget;
      const stuck = tg && tg.alive && this._distTo(tg) < 1.5;
      this.vel.copy(this.atkDir).multiplyScalar(stuck ? 0 : def.lunge * (1 - 0.5 * (a.t / def.lungeT)));
    } else {
      this._updateMove(dt, wish, Math.min(1, wish.length()), a.t < activeEnd ? 0.1 : 0.5);
      this.facing = Math.atan2(-this.atkDir.x, -this.atkDir.z);
    }

    if (a.t >= activeStart && a.t < activeEnd) combat?.strike(this, a);

    // 다음 타로 연결 (활성 구간이 끝난 직후부터)
    if (a.t >= activeEnd && this.buffer > 0 && a.kind !== 'heavy') {
      this._startAttack('L', wish, combat);
      return;
    }
    if (a.t >= total) {
      this.atk = null;
      this.spin = 0; this.prevSpin = 0;
      this.comboTimer = COMBO_GRACE;
      if (a.kind !== 'L') this.comboIdx = 0;
      this.held = 0;
      // 한 바퀴 돌아간 각도를 정리해 휴지 자세로 되돌릴 때 역회전하지 않게 한다
      this.pose[1] = ((this.pose[1] + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    }
  }

  _updatePose(dt) {
    this.prevPose = [...this.pose];
    this.prevSpin = this.spin;
    const a = this.atk, P = this.pose;
    this.swinging = false;
    if (this.dashing) {
      // 돌진: 처음엔 칼을 몸 뒤로 낮게 끌고, 끝무렵(45%→85%)에 앞으로 크게 벤다
      const u = 1 - this.dashTimer / DASH_TIME;
      if (u < 0.45) {
        const k = 1 - Math.exp(-40 * dt);
        for (let i = 0; i < 6; i++) P[i] += (DASH_KEYS[0][i] - P[i]) * k;
      } else {
        const v = Math.min(1, (u - 0.45) / 0.4);
        spline(DASH_KEYS, easeInOut(v), P);
        this.swinging = v < 1;
      }
    } else if (a) {
      const def = a.def, keys = def.keys;
      if (a.t < def.wind) { // 준비: 지금 자세에서 감기 자세로
        const u = easeOut(a.t / def.wind);
        for (let i = 0; i < 6; i++) P[i] = this.startPose[i] + (keys[0][i] - this.startPose[i]) * u;
      } else if (a.t < def.wind + def.act) { // 휘두르기: 가운데(임팩트)가 가장 빠르다
        const e = easeInOut((a.t - def.wind) / def.act);
        spline(keys, e, P);
        this.spin = (def.spin || 0) * e;
        this.swinging = true;
      } else {
        for (let i = 0; i < 6; i++) P[i] = keys[keys.length - 1][i];
        this.spin = def.spin || 0;
        this.swinging = a.t < def.wind + def.act + 0.04;
      }
    } else {
      const tgt = this.charging ? CHARGE_POSE : REST_POSE;
      const k = 1 - Math.exp(-(this.charging ? 14 : 10) * dt);
      for (let i = 0; i < 6; i++) P[i] += (tgt[i] - P[i]) * k;
    }
    this._applyPose();
    // 오라는 차징/공격 중 밝아진다
    this.aura.material.opacity = 0.08 + (this.charging ? 0.35 + this.charge * 0.25 : 0) + (this.swinging ? 0.15 : 0);
    this.aura.scale.setScalar(1 + (this.charging ? this.charge * 1.5 : 0));
  }

  _applyPose(P = this.pose) {
    this.pivot.rotation.set(P[0], P[1], P[2]);
    this.sword.position.y = P[3] * this.reach;
    this.sword.rotation.set(P[4], 0, P[5]);
  }

  // 궤적용: 직전 프레임 포즈 → 현재 포즈를 n단계로 쪼개 칼날 밑동/끝의 월드 좌표를 샘플링
  sampleSword(n = 4) {
    const out = [], tmp = new Array(6), yaw = this.model.rotation.y - this.spin;
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      for (let i = 0; i < 6; i++) tmp[i] = this.prevPose[i] + (this.pose[i] - this.prevPose[i]) * t;
      this.model.rotation.y = yaw + this.prevSpin + (this.spin - this.prevSpin) * t;
      this._applyPose(tmp);
      this.group.updateMatrixWorld(true);
      out.push({ tip: this.sword.localToWorld(this.swordTip.clone()), base: this.sword.localToWorld(this.swordBase.clone()) });
    }
    this.model.rotation.y = yaw + this.spin;
    this._applyPose();
    this.group.updateMatrixWorld(true);
    return out;
  }
}

// 아담(복제체)이 주인공과 같은 칼 동작을 쓰도록 내보낸다
export const POSES = { COMBO, REST_POSE, DASH_KEYS, HEAVY, DASH_SLASH };
export { spline, easeInOut };
