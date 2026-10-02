import { Thug } from './enemies/thug.js';
import { Drone } from './enemies/drone.js';
import { ShieldBot, Sniper, Mech, Executioner, Sentinel } from './enemies/more.js';
import { Boss } from './enemies/boss.js';
import { ZONE_WAVES, BOUNTY } from './story.js';

const REG = { thug: Thug, drone: Drone, shield: ShieldBot, sniper: Sniper, mech: Mech, exec: Executioner, sentinel: Sentinel, boss: Boss };
const MIN_DIST = { sniper: 20, sentinel: 14, default: 11 };
const MAX_ALIVE = 15; // 동시에 존재하는 적의 수 상한 (성능과 가독성)

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
    combat.ctx.spawn = (Cls, x, z) => this._add(new Cls(x, z), 'minion'); // 보스가 졸개를 부를 때 (보상은 적게)
  }

  reset() {
    for (const e of this.members) e.dead = true;
    this.members = [];
    this.combat.projectiles.clear();
    this.i = 0;             // 현재 구역
    this.state = 'travel';  // travel | cine | fight | done
    this.k = 0;             // 투입된 하위 웨이브 수
    this.timer = 0;
    this.cleared = false;
    this.enabled = false;
    this.world.setGates(0);
    this.combat.ctx.maxAtk = 4;
  }

  // 현재 구역을 처음부터 다시 (사망 후 체크포인트)
  restartZone() {
    for (const e of this.members) e.dead = true;
    this.members = [];
    this.combat.projectiles.clear();
    this.state = 'travel'; this.k = 0; this.timer = 0;
    this.world.setGates(this.i);
  }

  get zone() { return this.zones[this.i]; }
  get remaining() { return this.members.length; }
  get done() { return this.i; }
  get respawn() { return this.zones[Math.min(this.i, this.total - 1)].respawn; }
  // 이동 중에는 다음 구역 시작선 방향을 안내한다
  get objective() { return this.enabled && this.state === 'travel' && !this.cleared ? this.zone.beacon : null; }
  get progress() {
    const z = this.zone, w = ZONE_WAVES[this.i];
    return { wave: Math.min(this.k, w.length), waves: w.length };
  }

  _add(e, type) { e.bounty = BOUNTY[type] ?? 0; this.members.push(e); this.combat.add(e); return e; }

  _spawnWave(player) {
    const wave = ZONE_WAVES[this.i][this.k++];
    const gate = this.world.curGate();
    const zMin = gate ? gate.z + 3 : this.zone.triggerZ - 120;
    const zMax = this.zone.triggerZ + 14;
    for (const [type, count] of Object.entries(wave)) {
      const Cls = REG[type];
      for (let n = 0; n < count; n++) {
        if (type === 'boss') { this._add(new Cls(this.zone.bossAt.x, this.zone.bossAt.z), type); continue; }
        const md = MIN_DIST[type] || MIN_DIST.default;
        const p = this.world.spawnInZone(zMin, zMax, player.pos, md, md + 28);
        this._add(new Cls(p.x, p.z), type);
      }
    }
    this.hooks.onWave?.(this.i, this.k, ZONE_WAVES[this.i].length, wave);
  }

  async _begin(player) {
    this.state = 'cine';                         // 중복 시작 방지
    await this.zone.pre?.();                     // 막 (보스 등장 등)
    this.combat.ctx.maxAtk = Math.min(6, 4 + Math.floor(this.i / 3));
    this.hooks.onStart?.(this.i);
    this._spawnWave(player);
    this.state = 'fight';
    this.timer = 0.4;
  }

  update(dt, player) {
    if (!this.enabled || player.dead || this.cleared) return;
    this.members = this.members.filter((e) => !e.dead);
    const z = this.zone;
    if (this.state === 'travel') {
      if (player.pos.z <= z.triggerZ) this._begin(player);
    } else if (this.state === 'fight') {
      this.timer -= dt;
      const waves = ZONE_WAVES[this.i];
      const alive = this.members.length;
      if (this.k < waves.length) {
        const prev = Object.values(waves[this.k - 1]).reduce((a, b) => a + b, 0);
        const next = Object.values(waves[this.k]).reduce((a, b) => a + b, 0);
        // 앞 웨이브가 거의 정리되면 증원이 들어온다 (상한을 넘지 않도록)
        if ((alive <= Math.max(1, Math.floor(prev * 0.25)) && alive + next <= MAX_ALIVE) || alive === 0) this._spawnWave(player);
      } else if (alive === 0 && this.timer <= 0) {
        this.state = 'done';
        if (z.gate != null) this.world.openGate(z.gate);
        const last = this.i >= this.total - 1;
        this.hooks.onClear?.(this.i);
        if (last) { this.cleared = true; this.hooks.onAllClear?.(); }
        else { this.i++; this.k = 0; this.state = 'travel'; }
      }
    }
  }
}
