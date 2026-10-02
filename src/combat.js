import * as THREE from 'three';
import { Projectiles } from './enemies/projectile.js';
import { DASH_CUT } from './player.js';
import { audio } from './audio.js';

// 판정, 히트스톱, 락온, 연출 트리거를 담당한다.
export class Combat {
  constructor(scene, fx, rig) {
    this.scene = scene;
    this.fx = fx;
    this.rig = rig;
    this.enemies = [];
    this.world = null; // 도시(충돌)
    this.projectiles = new Projectiles(scene, fx);
    this.ctx = { scene, fx, rig, combat: this, player: null, projectiles: this.projectiles, enemies: this.enemies, spawn: null,
      get world() { return this.combat.world; },
      maxAtk: 3, attackers: () => this.enemies.filter((e) => e.attacking && !e.boss).length };
    this.hitstop = 0;
    this.hits = 0;
    this.hitTimer = 0;
    this._v = new THREE.Vector3();

    this.onPop = null;
    this.onKill = null;
  }

  add(enemy) {
    this.enemies.push(enemy);
    this.scene.add(enemy.group);
  }

  // 가벼운 조준 보정: 행동하는 순간에만, dir 기준 deg° 안·range m 안에서 가장 가까운 적. 화면에 표시하지 않는다.
  assist(player, dir, range, deg) {
    const cos = Math.cos(THREE.MathUtils.degToRad(deg));
    let best = null, bd = range;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z, d = Math.hypot(dx, dz);
      if (d >= bd || d < 0.3) continue;
      if ((dx * dir.x + dz * dir.z) / d < cos) continue;
      bd = d; best = e;
    }
    return best;
  }

  // 플레이어가 적을 뚫고 지나가지 않도록 밀어낸다.
  resolve(player) {
    this.world?.resolve(player.pos, 0.5);
    if (player.dashing) return;
    for (const e of this.enemies) {
      if (!e.alive || e.flying) continue;
      const dx = player.pos.x - e.pos.x, dz = player.pos.z - e.pos.z;
      const d = Math.hypot(dx, dz), min = e.radius + 0.5;
      if (d < min && d > 1e-4) {
        player.pos.x = e.pos.x + (dx / d) * min;
        player.pos.z = e.pos.z + (dz / d) * min;
      }
    }
  }

  // 공격 활성 프레임마다 호출. 한 스윙당 적 1회만 맞는다.
  strike(player, atk) {
    const def = atk.def;
    const cosHalf = Math.cos(THREE.MathUtils.degToRad(def.arc / 2));
    for (const e of this.enemies) {
      if (!e.alive || atk.hit.has(e)) continue;
      const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d - e.radius > def.range) continue;
      const dot = d < 1e-4 ? 1 : (dx * player.atkDir.x + dz * player.atkDir.z) / d;
      if (dot < cosHalf) continue;
      atk.hit.add(e);
      this._hit(e, atk, player);
    }
  }

  // 대시 경로(이전 위치 → 현재 위치) 근처의 적을 한 번씩 벤다
  dashStrike(player, fromX, fromZ) {
    const tx = player.pos.x, tz = player.pos.z;
    const sx = tx - fromX, sz = tz - fromZ, len2 = sx * sx + sz * sz || 1e-6;
    for (const e of this.enemies) {
      if (!e.alive || player.dashHits.has(e)) continue;
      const t = THREE.MathUtils.clamp(((e.pos.x - fromX) * sx + (e.pos.z - fromZ) * sz) / len2, 0, 1);
      const cx = fromX + sx * t, cz = fromZ + sz * t;
      if (Math.hypot(e.pos.x - cx, e.pos.z - cz) > e.radius + 1.5) continue;
      player.dashHits.add(e);
      player.atkDir.copy(player.dashDir);
      this._hit(e, { def: DASH_CUT, hit: player.dashHits, dmgMul: player.mods.dashCutMul }, player);
      this.fx.slashLine(new THREE.Vector3(e.pos.x, e.hitY ?? 1.2, e.pos.z), player.dashDir);
    }
  }

  _dirTo(e, player) {
    const dir = new THREE.Vector3(e.pos.x - player.pos.x, 0, e.pos.z - player.pos.z);
    if (dir.lengthSq() < 1e-6) dir.copy(player.atkDir);
    return dir.normalize();
  }

  _hit(e, atk, player) {
    const def = atk.def;
    const dir = this._dirTo(e, player);
    if (e.invulnerable) { this.fx.sparks(new THREE.Vector3(e.pos.x, e.hitY ?? 1.5, e.pos.z), dir, 6, 0xffffff); return; }
    if (e.broken) return this._execute(e, dir);

    const counter = player.counterT > 0; // 완벽 회피 직후 반격
    const M = player.mods;
    let dmg = def.dmg * (atk.dmgMul || 1) * (counter ? M.counterMul : 1) * M.dmgMul * (player.rampage ? 1.5 : 1);
    let posture = (def.posture ?? 8) * (counter ? 1.6 : 1) * M.postureMul * (player.rampage ? 1.3 : 1);
    player.stamina = Math.min(player.maxStamina, player.stamina + M.hitGauge);
    if (M.hitHeal && !player.dead) player.hp = Math.min(player.maxHp, player.hp + M.hitHeal);
    player.addRage(def.heavy ? 7 : 3.2);
    // 방패: 정면은 막히고 자세만 크게 깎인다. 옆/뒤를 노려야 한다.
    if (e.isFrontal?.(player.pos)) {
      dmg *= 0.1; posture *= 1.8;
      this.onPop?.('GUARD', '#aab4c8');
      this._applyHit(e, dir, { dmg, knock: def.kb * 0.4, hs: 0.07, sparks: 12, posture, color: 0xc8d0e0, guard: true });
      return;
    }
    const killed = this._applyHit(e, dir, {
      dmg, knock: def.kb, launch: def.launch, hs: def.hs + (counter ? 0.04 : 0),
      heavy: def.heavy, sparks: def.sparks, posture,
      color: counter ? 0x7ff6ff : undefined
    });
    if (counter && !killed) this.onPop?.('COUNTER', '#7ff6ff');
  }

  // 공통 피해 처리: 피해, 연출, 자세 게이지, 처치
  _applyHit(e, dir, o) {
    const killed = e.takeHit(o.dmg, dir, o.knock, o.launch, !!o.heavy);
    if (o.guard) audio.guard(); else audio.hit(!!o.heavy, killed);
    const c = new THREE.Vector3(e.pos.x, e.hitY ?? 1.2, e.pos.z).addScaledVector(dir, -0.4);
    this.fx.sparks(c, dir, o.sparks || 16, o.color ?? (o.heavy ? 0xff6ae8 : 0x9ff8ff));

    this.hitstop = Math.max(this.hitstop, o.hs ?? 0.05);
    this.rig.shake(0.012 + (o.hs ?? 0.05) * 0.12);
    this.rig.addKick(dir, o.heavy ? 0.22 : 0.1);
    this.hits++;
    this.hitTimer = 2.2;

    if (killed) {
      this.onKill?.(e);
      this.fx.chunks(new THREE.Vector3(e.pos.x, e.hitY ? e.hitY - 0.1 : 1.1, e.pos.z), dir);
      this.fx.flash(0.15);
      this.hitstop = Math.max(this.hitstop, 0.13);
      this.rig.shake(0.05);
      this.rig.addKick(dir, 0.25);
    } else if (o.posture && e.addPosture?.(o.posture)) {
      this._broken(e);
    }
    return killed;
  }

  _broken(e) {
    audio.broke();
    this.fx.sparks(new THREE.Vector3(e.pos.x, (e.hitY ?? 1.2) + 0.3, e.pos.z), new THREE.Vector3(0, 1, 0), 24, 0xffc400);
    this.hitstop = Math.max(this.hitstop, 0.12);
    this.rig.shake(0.03);
    this.onPop?.('BREAK', '#ffc400');
  }

  // 자세가 무너진 적을 베면 한 번에 쓰러지는 처형
  _execute(e, dir) {
    const c = new THREE.Vector3(e.pos.x, e.hitY ?? 1.2, e.pos.z);
    const bossHit = e.executionDamage != null;
    const killed = e.takeHit(bossHit ? e.executionDamage : 9999, dir, bossHit ? 4 : 10);
    if (bossHit && !killed) { e.broken = false; e.posture = 0; e.brokenT = 0; e.stagger = 1.4; }
    else this.onKill?.(e);
    audio.execution();
    this.fx.slashLine(c, dir);
    if (!bossHit || killed) this.fx.chunks(c.clone(), dir, bossHit ? 40 : 26);
    this.fx.sparks(c, dir, 30, 0xffffff);
    this.fx.flash(0.3);
    this.hitstop = Math.max(this.hitstop, 0.22);
    this.rig.shake(0.05);
    this.rig.addKick(dir, 0.4);
    this.hits++;
    this.hitTimer = 2.2;
    this.onPop?.('EXECUTION', '#ffd54a');
  }

  // 지상 적끼리 겹치지 않게 밀어낸다
  separate() {
    const a = this.enemies;
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
      const p = a[i], q = a[j];
      if (!p.alive || !q.alive || p.flying || q.flying) continue;
      const dx = q.pos.x - p.pos.x, dz = q.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz), min = p.radius + q.radius;
      if (d < min && d > 1e-4) {
        const push = (min - d) * 0.5;
        p.pos.x -= (dx / d) * push; p.pos.z -= (dz / d) * push;
        q.pos.x += (dx / d) * push; q.pos.z += (dz / d) * push;
      }
    }
  }

  update(dt, player) {
    this.ctx.player = player;
    for (const e of this.enemies) e.update(dt, this.ctx);
    for (const e of this.enemies) { // 공격 예고가 시작되는 순간 경고음
      if (e.attacking && !e._wasAtk && e.alive) audio.warn();
      e._wasAtk = e.attacking;
    }
    this.separate();
    if (this.world) for (const e of this.enemies) if (e.alive) this.world.resolve(e.pos, e.radius);
    this.projectiles.update(dt, player, this);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) {
        this.scene.remove(e.group);
        if (e.aim) this.scene.remove(e.aim);
        this.enemies.splice(i, 1);
      }
    }
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.hits = 0;
    }
  }
}
