import { REG } from './waves.js';
import { BOUNTY } from './story.js';

// 무한 모드: 지하철 광장에 갇힌 채 끝없이 몰려오는 웨이브를 버틴다.
// 5웨이브마다 보스, 웨이브가 오를수록 적이 단단해지고 많아지고 아파진다.
// 점수: 일반 적 1점, 보스 60점 (쌍둥이는 둘이 합쳐 60점)
export const ARENA = { x0: -28, x1: 28, z0: -752, z1: -668, gate: 9, rearZ: -664, start: [0, -676], bossAt: [0, -730] };
const BOSS_CYCLE = ['jugg', 'twin', 'warden', 'gate', 'helix', 'adam'];
// [종류, 처음 나오는 웨이브, 뽑힐 가중치]
const POOL = [
  ['thug', 1, 5], ['drone', 1, 3], ['shield', 2, 2], ['gunner', 3, 2], ['assassin', 4, 2], ['bomber', 4, 1.5],
  ['sniper', 6, 1], ['mech', 7, 1], ['sentinel', 9, 0.6], ['exec', 11, 0.6],
];
const HEAVY = new Set(['mech', 'sentinel', 'exec']);
const MIN_DIST = { sniper: 20, sentinel: 14, gunner: 14, default: 11 };
const MAX_ALIVE = 14;
export const BOSS_EVERY = 5;
const REST = 7;       // 웨이브 사이 쉬는 시간 (초)
const REST_BOSS = 11; // 보스를 잡은 뒤

export class Endless {
  constructor(combat, world, hooks) {
    this.combat = combat; this.world = world;
    this.hooks = hooks; // { onWave(w, bossKey), onWaveClear(w, boss), onBossDown(w) }
    this.enabled = false; this.members = [];
    this.wave = 0; this.score = 0; this.state = 'off';
  }

  isBossWave(w = this.wave) { return w > 0 && w % BOSS_EVERY === 0; }
  get nextBoss() { const n = this.state === 'fight' ? this.wave : this.wave + 1; return Math.ceil(n / BOSS_EVERY) * BOSS_EVERY; } // 다음 보스가 나오는 웨이브
  get remaining() { return this.members.length + this.queue; }
  get bossNo() { return Math.floor(this.wave / BOSS_EVERY); } // 몇 번째 보스인가 (1부터)

  start(player) {
    this.stop();
    this.enabled = true; this.wave = 0; this.score = 0; this.kills = 0; this.bosses = 0;
    this.state = 'rest'; this.timer = 3.5; this.queue = 0;
    this._prevSpawn = this.combat.ctx.spawn;
    this.combat.ctx.spawn = (type, x, z) => this._add(new REG[type](x, z), type, true); // 보스가 부르는 졸개
    this.world.setGates(ARENA.gate); // 앞쪽(광장 끝) 방벽은 닫혀 있다
    this.world.raiseRear(ARENA.rearZ); // 뒤쪽도 막는다
    player.dmgScale = this._dmgScale(1);
  }

  stop() {
    for (const e of this.members) e.dead = true;
    this.members = [];
    if (this._prevSpawn) { this.combat.ctx.spawn = this._prevSpawn; this._prevSpawn = null; }
    if (this.enabled) { this.world.clearRear(); this.world.setGates(0); }
    this.enabled = false; this.state = 'off';
  }

  _dmgScale(w) { return Math.min(3.2, 1.2 + 0.04 * w); } // 플레이어가 받는 피해 배율

  // 웨이브에 맞춰 적을 단단하게. 보스는 나올 때마다 체력·자세·속도가 오른다
  _add(e, type, summoned = false) {
    const w = Math.max(1, this.wave);
    e.bounty = summoned ? BOUNTY.minion : BOUNTY[type] ?? 0;
    if (e.boss) {
      const n = this.bossNo;
      const hpMul = 0.8 + 0.14 * (n - 1);
      e.maxHp = e.hp = Math.round(e.maxHp * hpMul * (type === 'adam' ? 0.75 : 1));
      e.maxPosture *= 1 + 0.07 * (n - 1);
      e.spMul = Math.min(1.45, 1 + 0.035 * (n - 1));
      e.score = type === 'twin' ? 30 : 60;
      if (type === 'adam') e.bounty = 300;
      e.bounty = Math.round(e.bounty * (1 + 0.1 * (n - 1)));
    } else {
      e.maxHp = Math.round(e.maxHp * (1 + 0.075 * (w - 1))); e.hp = e.maxHp;
      e.score = 1;
      e.bounty = Math.round(e.bounty * 0.6); // 무한 모드는 적이 많아서 하나당 부품은 조금 적게
    }
    this.members.push(e); this.combat.add(e); return e;
  }

  _pick(w, heavyLeft) {
    const opts = POOL.filter(([t, from]) => w >= from && (!HEAVY.has(t) || heavyLeft > 0));
    let s = opts.reduce((a, [, , k]) => a + k, 0) * Math.random();
    for (const [t, , k] of opts) { s -= k; if (s <= 0) return t; }
    return opts[0][0];
  }

  _spawnOne(player) {
    const t = this._pick(this.wave, this.heavyLeft);
    if (HEAVY.has(t)) this.heavyLeft--;
    const md = MIN_DIST[t] || MIN_DIST.default;
    const p = this.world.spawnInZone(ARENA.z0, ARENA.z1, player.pos, md, md + 30, [ARENA.x0, ARENA.x1]);
    this._add(new REG[t](p.x, p.z), t);
    this.queue--;
  }

  _beginWave(player) {
    this.wave++;
    const w = this.wave;
    this.state = 'fight'; this.timer = 0.5;
    player.dmgScale = this._dmgScale(w);
    this.combat.ctx.maxAtk = Math.min(8, 3 + Math.floor(w / 3));
    if (this.isBossWave()) {
      const key = BOSS_CYCLE[(this.bossNo - 1) % BOSS_CYCLE.length];
      this.queue = 0; this.bossWave = true;
      const [bx, bz] = ARENA.bossAt;
      if (key === 'twin') { this._add(new REG.twin(bx - 3, bz), 'twin'); this._add(new REG.twin(bx + 3, bz), 'twin'); }
      else this._add(new REG[key](bx, bz), key);
      this.hooks.onWave?.(w, key);
    } else {
      this.bossWave = false;
      this.queue = Math.min(42, 4 + Math.round(w * 1.3));
      this.heavyLeft = w < 7 ? 0 : 1 + Math.floor(w / 8);
      const first = Math.min(this.queue, 4 + Math.floor(w / 2), MAX_ALIVE);
      for (let i = 0; i < first; i++) this._spawnOne(player);
      this.hooks.onWave?.(w, null);
    }
  }

  // 보스가 쓰러지면 남은 졸개도 멈춘다 (점수 없음)
  _bossDown() {
    this.bossWave = false; this.bosses++;
    for (const e of this.members) {
      if (!e.alive || e.boss) continue;
      this.combat.fx.chunks(e.pos.clone().setY(e.hitY ?? 1.2), { x: 0, y: 1, z: 0 }, 8);
      e.alive = false; e.dead = true; e.group.visible = false;
    }
    this.members = [];
    this.combat.hazards.clear(); this.combat.projectiles.clear();
    this.hooks.onBossDown?.(this.wave);
  }

  update(dt, player) {
    if (!this.enabled || player.dead) return;
    this.members = this.members.filter((e) => !e.dead);
    if (this.state === 'rest') {
      this.timer -= dt;
      if (this.timer <= 0) this._beginWave(player);
      return;
    }
    if (this.state !== 'fight') return;
    this.timer -= dt;
    if (this.bossWave) {
      if (!this.members.some((e) => e.boss && e.alive)) this._bossDown();
      else return;
    }
    const alive = this.members.length;
    if (this.queue > 0) {
      // 남은 적이 줄면 증원이 들어온다
      if (this.timer <= 0 && alive < Math.min(MAX_ALIVE, 4 + Math.floor(this.wave / 2))) { this._spawnOne(player); this.timer = 0.35; }
      return;
    }
    if (alive === 0) {
      const boss = this.isBossWave();
      this.state = 'rest'; this.timer = boss ? REST_BOSS : REST;
      this.hooks.onWaveClear?.(this.wave, boss);
    }
  }
}
