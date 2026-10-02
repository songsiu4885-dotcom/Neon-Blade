import { Thug } from './enemies/thug.js';
import { Drone } from './enemies/drone.js';
import { ShieldBot, Sniper, Mech, Executioner, Sentinel } from './enemies/more.js';
import { Assassin, Bomber, Gunner } from './enemies/extra.js';
import { Juggernaut, TwinExec, Warden, Helix, Pylon, Gatekeeper, Adam } from './enemies/bosses.js';
import { ZONE_WAVES, BOUNTY } from './story.js';

const REG = {
  thug: Thug, drone: Drone, shield: ShieldBot, sniper: Sniper, mech: Mech, exec: Executioner, sentinel: Sentinel,
  assassin: Assassin, bomber: Bomber, gunner: Gunner,
  jugg: Juggernaut, twin: TwinExec, warden: Warden, helix: Helix, pylon: Pylon, gate: Gatekeeper, adam: Adam,
};
const BOSSES = new Set(['jugg', 'twin', 'warden', 'helix', 'gate', 'adam']); // 구역에 bossAt이 있으면 그 자리에 나타난다
const MIN_DIST = { sniper: 20, sentinel: 14, gunner: 14, warden: 14, default: 11 };
const MAX_ALIVE = 16; // 동시에 존재하는 적의 수 상한 (성능과 가독성)

// 구역 진행: 구역 시작선을 넘으면 하위 웨이브가 차례로 투입되고, 모두 처치하면 붉은 방벽이 열린다.
export class Zones {
  // zones: [{ name, triggerZ, respawn: Vector3, gate: index|null, pre?: () => Promise, boss?: true }]
  constructor(combat, world, zones, hooks) {
    this.combat = combat;
    this.world = world;
    this.zones = zones;
    this.hooks = hooks;           // { onStart(i), onWave(i, k, total), onClear(i), onAllClear() }
    this.total = zones.length;
    this.members = [];
    this.reset();
    combat.ctx.spawn = (type, x, z) => this._add(new REG[type](x, z), 'minion'); // 보스가 졸개를 부를 때 (보상은 적게)
  }

  reset() {
    for (const e of this.members) e.dead = true;
    this.members = [];
    this.combat.projectiles.clear(); this.combat.hazards.clear();
    this.i = 0;             // 현재 구역
    this.state = 'travel';  // travel | cine | fight | done
    this.k = 0;             // 투입된 하위 웨이브 수
    this.timer = 0;
    this.cleared = false;
    this.enabled = false;
    this.bossWave = false;
    this.world.setGates(0);
    this.world.clearRear();
    this.combat.ctx.maxAtk = 5;
  }

  // 현재 구역을 처음부터 다시 (사망 후 체크포인트)
  restartZone() {
    for (const e of this.members) e.dead = true;
    this.members = [];
    this.combat.projectiles.clear(); this.combat.hazards.clear();
    this.state = 'travel'; this.k = 0; this.timer = 0; this.bossWave = false;
    this.world.setGates(this.i);
    this.world.clearRear();
  }

  get zone() { return this.zones[this.i]; }
  get remaining() { return this.members.length; }
  get done() { return this.i; }
  get respawn() { return this.zones[Math.min(this.i, this.total - 1)].respawn; }
  // 이동 중에는 다음 구역 시작선 방향을 안내한다
  get objective() {
    if (!this.enabled || this.state !== 'travel' || this.cleared) return null;
    const z = this.zone;
    return z.entry && !z.entered ? z.entry.pad : z.beacon; // 다음 층으로 가는 발판이 있으면 발판으로 안내
  }
  get progress() {
    const z = this.zone, w = ZONE_WAVES[this.i];
    return { wave: Math.min(this.k, w.length), waves: w.length };
  }

  // 깊은 구역일수록 적이 단단하다 (보스는 자체 체력 그대로)
  _add(e, type) {
    e.bounty = BOUNTY[type] ?? 0;
    if (!e.boss) { e.maxHp = Math.round(e.maxHp * (1 + 0.035 * this.i)); e.hp = e.maxHp; }
    else if (this.zone.rush && type !== 'adam') { // 최종전 보스 러시: 아담이 되살린 복제체 (체력 절반)
      e.rush = true; e.maxHp = e.hp = Math.round(e.maxHp * 0.5); e.maxPosture *= 0.75; e.bounty = 40;
      e.name = `복제 ${e.name}`;
    }
    this.members.push(e); this.combat.add(e); return e;
  }

  _spawnWave(player) {
    const wave = ZONE_WAVES[this.i][this.k++];
    const gate = this.world.curGate();
    const zMin = gate ? gate.z + 3 : this.zone.triggerZ - 120;
    const zMax = this.zone.triggerZ + 2.5; // 뒤쪽 방벽(시작선 +5m) 안쪽에만 나타난다
    for (const [type, count] of Object.entries(wave)) {
      const Cls = REG[type];
      for (let n = 0; n < count; n++) {
        if (BOSSES.has(type) && this.zone.bossAt) { this._add(new Cls(this.zone.bossAt.x + (count > 1 ? (n ? 3 : -3) : 0), this.zone.bossAt.z), type); this.bossWave = true; continue; }
        if (BOSSES.has(type)) this.bossWave = true;
        const md = MIN_DIST[type] || MIN_DIST.default;
        const p = this.world.spawnInZone(zMin, zMax, player.pos, md, md + 28, this.zone.xRange);
        this._add(new Cls(p.x, p.z), type);
      }
    }
    this.hooks.onWave?.(this.i, this.k, ZONE_WAVES[this.i].length, wave);
  }

  async _begin(player) {
    this.state = 'cine';                         // 중복 시작 방지
    this.world.raiseRear(this.zone.triggerZ + (this.zone.room != null ? 4.5 : 5), this.zone.room != null); // 적과 마주친 순간 뒤쪽도 막힌다
    await this.zone.pre?.();                     // 막 (보스 등장 등)
    this.combat.ctx.maxAtk = Math.min(8, 5 + Math.floor(this.i / 5));
    player.dmgScale = 1.35 + 0.03 * this.i; // 깊은 구역일수록 아프다
    this.hooks.onStart?.(this.i);
    this._spawnWave(player);
    this.state = 'fight';
    this.timer = 0.4;
  }

  // 보스가 쓰러지면 남은 졸개도 멈추고(폭발), 더 이상 나오지 않는다
  _bossDown() {
    this.bossWave = false;
    for (const e of this.members) {
      if (!e.alive || e.boss) continue;
      this.combat.fx.chunks(e.pos.clone().setY(e.hitY ?? 1.2), { x: 0, y: 1, z: 0 }, 8);
      e.alive = false; e.dead = true; e.group.visible = false;
    }
    this.members = [];
    this.combat.hazards.clear(); this.combat.projectiles.clear();
    this.timer = 2.2; // 다음 보스(러시)나 구역 정리까지 잠깐 숨 돌릴 틈
    this.hooks.onBossDown?.(this.i, this.k, ZONE_WAVES[this.i].length);
  }

  update(dt, player) {
    if (!this.enabled || player.dead || this.cleared) return;
    this.members = this.members.filter((e) => !e.dead);
    const z = this.zone;
    if (this.state === 'travel') {
      if ((!z.entry || z.entered) && player.pos.z <= z.triggerZ) this._begin(player); // 타워 층은 발판으로 들어간 뒤에만
    } else if (this.state === 'fight') {
      this.timer -= dt;
      const waves = ZONE_WAVES[this.i];
      if (this.bossWave && !this.members.some((e) => e.boss && e.alive)) this._bossDown();
      const alive = this.members.length;
      if (this.bossWave) return; // 보스전: 졸개는 보스가 단계마다 부른다. 다음 웨이브는 보스가 쓰러진 뒤에만
      if (this.k < waves.length) {
        if (this.timer > 0) return;
        const prev = Object.values(waves[this.k - 1]).reduce((a, b) => a + b, 0);
        const next = Object.values(waves[this.k]).reduce((a, b) => a + b, 0);
        // 앞 웨이브가 거의 정리되면 증원이 들어온다 (상한을 넘지 않도록)
        if ((alive <= Math.max(1, Math.floor(prev * 0.25)) && alive + next <= MAX_ALIVE) || alive === 0) this._spawnWave(player);
      } else if (alive === 0 && this.timer <= 0) {
        this.state = 'done';
        if (z.gate != null) this.world.openGate(z.gate);
        this.world.lowerRear();
        const last = this.i >= this.total - 1;
        this.hooks.onClear?.(this.i);
        if (last) { this.cleared = true; this.hooks.onAllClear?.(); }
        else { this.i++; this.k = 0; this.state = 'travel'; }
      }
    }
  }
}
