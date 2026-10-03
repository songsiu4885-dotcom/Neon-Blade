import * as THREE from 'three';
import { Input } from './input.js';
import { Player } from './player.js';
import { loadHero, buildHero, HeroAnimator } from './characters/hero.js';
import { loadRobots, setLodCenter } from './characters/robotModels.js';
import { CameraRig } from './camera.js';
import { FX } from './fx.js';
import { buildStreet, GATE_Z } from './levels/street.js';
import { Combat } from './combat.js';
import { Zones } from './waves.js';
import { EnemyBars } from './ui/bars.js';
import { audio } from './audio.js';
import { SKINS, KIT, computeMods, defaultMods } from './chips.js';
import { STORY, ZONE_NAMES, ZONE_BONUS, ZONE_BOSS, BOSS_NAMES, StoryUI } from './story.js';
import { DoctorShop, Backpack, SETTINGS_DEFAULT } from './shop.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 2000);
const env = buildStreet(scene);

// 금속 재질이 비출 네온 환경맵 (보라 하늘 + 시안/마젠타/주황 간판 빛)
{
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 16, 8), new THREE.MeshBasicMaterial({ color: 0x1a1236, side: THREE.BackSide })));
  const panel = (c, k, x, y, z, w, h) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); envScene.add(m);
  };
  panel(0x00e5ff, 3, -6, 1, -3, 3, 5);
  panel(0xff2bd6, 3, 6, 2, -2, 3, 5);
  panel(0xffb347, 2, 5, 0, 5, 3, 2);
  panel(0x9b7bff, 2.5, 0, 6, -6, 8, 3);   // 타워 쪽 밝은 하늘
  panel(0x6a8aff, 1.2, 0, 8, 0, 10, 10);  // 위쪽
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  scene.environmentIntensity = 0.7;
}

const input = new Input(canvas);
const player = new Player();
scene.add(player.group);
const rig = new CameraRig(camera);
const fx = new FX(renderer, scene, camera);
const combat = new Combat(scene, fx, rig);
player.pos.copy(env.start);
combat.world = env;
rig.target.set(player.pos.x, 1.4, player.pos.z);
rig.world = env;
// 캐릭터 주변을 비추는 보조광 (어두운 거리에서 실루엣이 묻히지 않게)
const fill = new THREE.PointLight(0xa8b4ff, 9, 9, 1.6);
scene.add(fill);

const $ = (id) => document.getElementById(id);
const objEl = $('obj'), objArrow = $('objArrow'), objText = $('objText');
const bossEl = $('boss'), bossName = $('bossName'), bossHp = $('bossHp'), bossGh = $('bossGh'), bossPs = $('bossPs');
const clearEl = $('clear'), stageEl = $('stage'), over = $('over'), titleEl = $('title');
const hpf = $('hpf'), vig = $('vig'), rageFx = $('rageFx'), rgEl = $('rg'), rgf = $('rgf');
const slowEl = $('slow'), popEl = $('pop'), toastEl = $('toast'), creditsEl = $('credits');
const comboEl = $('combo'), comboN = $('comboN');
const hud = $('hud');
const vib = (ms) => { try { navigator.vibrate?.(ms); } catch {} };
const story = new StoryUI($('comm'), $('cine'));

let started = false;
document.body.classList.add('title'); // 타이틀 화면에서는 전투 화면 표시를 숨긴다
let titleT = 0;
let stageTime = 0, maxCombo = 0, perfects = 0, execs = 0, deaths = 0;
let slowT = 0;          // 완벽 회피 슬로모션 (실시간 초)
let gateHintCd = 0;
// 배낭: 기계 부품(credits), 산 칩, 장착 칩, 수리 키트
const newInv = () => ({ credits: 0, owned: [], equipped: [], kits: 1, kills: 0 });
let inv = newInv();
let zoneCredits = 0, zoneKills = 0; // 구역 시작 시점 (재도전하면 되돌린다)

function pop(text, color) {
  popEl.textContent = text;
  popEl.style.color = color;
  popEl.getAnimations().forEach((a) => a.cancel());
  popEl.animate([{ opacity: 0, transform: 'translateX(-50%) scale(1.4)' }, { opacity: 1, transform: 'translateX(-50%) scale(1)', offset: 0.15 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: 750 });
}
function toast(html, ms = 3200) {
  toastEl.innerHTML = html;
  toastEl.getAnimations().forEach((a) => a.cancel());
  toastEl.animate([{ opacity: 0, transform: 'translate(-50%,-8px)' }, { opacity: 1, transform: 'translate(-50%,0)', offset: 0.1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: ms });
}

// 스태미나 HUD (칸 수는 칩에 따라 늘어난다)
const pips = [];
function buildPips() {
  hud.innerHTML = ''; pips.length = 0;
  for (let i = 0; i < player.maxStamina; i++) {
    const p = document.createElement('div'); p.className = 'pip';
    const bar = document.createElement('i'); p.appendChild(bar); hud.appendChild(p); pips.push(bar);
  }
}

// ---- 검 스킨(기본) ----
const tintLight = new THREE.Color(), tintHeavy = new THREE.Color(), GOLD = new THREE.Color(1.4, 1.1, 0.35), _tt = new THREE.Color();
function applySkin(i = 0) {
  const sk = SKINS[i];
  player.rig.bladeMat.color.setRGB(...sk.blade);
  player.aura.material.color.setHex(sk.aura);
  tintLight.setRGB(...sk.light); tintHeavy.setRGB(...sk.heavy);
  fx.trail.life = sk.trailLife;
  fx.dashTint.setRGB(sk.light[0] * 0.65, sk.light[1] * 0.95, sk.light[2] * 1.1);
}
applySkin(0);
loadHero().then((g) => { player.useHero(buildHero(g), HeroAnimator); }).catch((e) => console.warn('hero model', e));
loadRobots().catch((e) => console.warn('robot models', e)); // 적 로봇 모델 (못 읽으면 절차적 로봇)
env.atmo.onThunder = (dist) => audio.thunder(dist); // 번개 뒤 천둥 (빗소리를 끄면 함께 꺼진다)

// ---- 구역 정의: 거리 13구역 + 타워 5개 층 ----
const STREET_TRIG = [-20, -72, -132, -196, -266, -346, -412, -480, -576, -676, -766, -822, -886];
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const zoneDefs = ZONE_NAMES.map((name, i) => {
  const bossKey = ZONE_BOSS[i];
  if (i < STREET_TRIG.length) {
    return {
      name, bossKey, triggerZ: STREET_TRIG[i],
      gate: i < GATE_Z.length ? i : null,
      respawn: i === 0 ? env.start.clone() : V(0, 0, GATE_Z[i - 1] - 4),
      beacon: V(0, 0, STREET_TRIG[i] - 24),
    };
  }
  // 타워 층: 앞 구역의 발판(첫 층은 거리 끝 타워 입구)을 밟으면 이 층 시작점으로 올라온다
  const k = i - STREET_TRIG.length, room = env.rooms[k];
  return {
    name, bossKey, room: k, gate: null,
    triggerZ: room.start.z - 3,
    respawn: room.start.clone(), beacon: room.center.clone(),
    entry: { pad: k === 0 ? env.towerDoor.clone() : env.rooms[k - 1].lift.clone(), padIndex: k, dest: room.start.clone() },
    entered: false, xRange: [room.x0, room.x1],
  };
});
zoneDefs[12].bossAt = V(0, 0, -952);
zoneDefs[15].bossAt = V(env.rooms[2].center.x, 0, env.rooms[2].center.z - 6);
zoneDefs[17].bossAt = V(env.rooms[4].center.x, 0, env.rooms[4].center.z - 8);
zoneDefs[17].rush = true;
for (const z of zoneDefs) if (z.bossKey && STORY.pre[z.bossKey]) z.pre = () => story.play(STORY.pre[z.bossKey]);

const bannerEl = $('banner');
function banner(text, ms = 2200) {
  bannerEl.textContent = text;
  bannerEl.getAnimations().forEach((a) => a.cancel());
  bannerEl.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: ms });
}

const zones = new Zones(combat, env, zoneDefs, {
  onStart(i) {
    shop.setAvailable(false);
    zoneCredits = inv.credits; zoneKills = inv.kills;
    const bossName = zoneDefs[i].rush ? '보스 러시' : BOSS_NAMES[zoneDefs[i].bossKey];
    banner(bossName ? `${zoneDefs[i].bossKey === 'adam' ? 'FINAL BATTLE' : 'BOSS'} · ${bossName}` : `ZONE ${i + 1} · ${zoneDefs[i].name}`, 2600);
    if (STORY.zoneStart[i]?.length) story.say(STORY.zoneStart[i]);
  },
  onWave(i, k, total, wave) {
    if (zoneDefs[i].rush) { // 보스 러시: 다음 보스 이름을 크게
      const key = Object.keys(wave)[0];
      banner(`${key === 'adam' ? 'FINAL BOSS' : `${k} / ${total - 1}`} · ${key === 'adam' ? BOSS_NAMES.adam : '복제 ' + BOSS_NAMES[key]}`, 2400);
      audio.warn();
      return;
    }
    if (k > 1) { pop('증원', '#ff8a7a'); audio.warn(); }
  },
  // 보스가 쓰러졌다: 남은 졸개는 멈춘다. 보스 러시라면 다음 보스 전에 조금 회복
  onBossDown(i, k, total) {
    if (!zoneDefs[i].rush || k >= total) return;
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.15);
    pop('회복 +15%', '#7fffb0');
    if (STORY.rush?.[k]) story.say(STORY.rush[k]);
  },
  async onClear(i) {
    audio.gateOpen();
    const g = env.gates[zoneDefs[i].gate];
    if (g) fx.flash(0.12);
    if (i < zoneDefs.length - 1) {
      inv.credits += ZONE_BONUS;
      toast(`구역 정리 · 기계 부품 +${ZONE_BONUS}<small>방벽 해제 · 박사 호출 가능</small>`, 2600);
    }
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * (zoneDefs[i].bossKey ? 0.3 : 0.1)); // 구역 클리어 회복은 조금만 (보스를 잡으면 조금 더)
    const next = zoneDefs[i + 1];
    if (next?.entry) env.showPad(next.entry.padIndex, true); // 다음 층으로 가는 발판을 켠다
    const c = STORY.zoneClear[i];
    if (c === 'reveal') { await story.play(STORY.reveal); story.say([{ w: 'doc', t: '방벽은 열렸네. 부품이 있으면 나를 부르게.' }]); }
    else if (c?.length) story.say(c);
    if (i < zoneDefs.length - 1) shop.setAvailable(true);
  },
  async onAllClear() {
    await new Promise((r) => setTimeout(r, 1400));
    await story.play(STORY.ending);
    showClear();
  },
});
zones.hooks.onClear = zones.hooks.onClear.bind(zones);

// ---- 등급 ----
function rankOf() {
  const t = stageTime;
  const timePts = Math.max(0, Math.min(1, 1 - (t - 900) / 900)) * 40;           // 15분 이내 만점, 30분이면 0
  const comboPts = Math.min(1, maxCombo / 80) * 30;
  const hpPts = (player.hp / player.maxHp) * 20;
  const skillPts = Math.min(1, (perfects + execs) / 40) * 10;
  const total = Math.max(0, Math.round(timePts + comboPts + hpPts + skillPts - deaths * 4));
  const rank = total >= 85 ? 'S' : total >= 70 ? 'A' : total >= 50 ? 'B' : 'C';
  return { total, rank };
}
function showClear() {
  const r = rankOf(), t = Math.floor(stageTime);
  let best = '';
  try {
    const prev = localStorage.getItem('nb_best') || '';
    if (!prev || 'CBAS'.indexOf(r.rank) > 'CBAS'.indexOf(prev)) localStorage.setItem('nb_best', r.rank);
    best = localStorage.getItem('nb_best') || '';
  } catch {}
  const big = $('rankBig'); big.textContent = r.rank; big.className = r.rank;
  $('clearRows').innerHTML =
    `<span>클리어 시간</span><b>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</b>` +
    `<span>최대 콤보</span><b>${maxCombo}</b>` +
    `<span>남은 체력</span><b>${Math.round(player.hp)} / ${player.maxHp}</b>` +
    `<span>완벽 회피 · 처형</span><b>${perfects} · ${execs}</b>` +
    `<span>사망 횟수</span><b>${deaths}</b>` +
    `<span>점수</span><b>${r.total}점${best ? ' · 최고 ' + best : ''}</b>`;
  audio.clear();
  clearEl.style.display = 'flex';
}

// ---- 전투 이벤트 ----
combat.onPop = (text, color) => {
  if (text === 'EXECUTION') execs++;
  if (text.startsWith('PHASE')) {
    const n = +text.split(' ')[1], b = combat.enemies.find((e) => e.boss && e.alive && e.phase === n);
    story.say(STORY.phase[b?.key]?.[n] || []);
  }
  pop(text, color);
};
combat.onKill = (e) => {
  vib(18);
  if (e?.bounty) { inv.credits += e.bounty; creditsEl.animate([{ transform: 'scale(1.25)', color: '#fff' }, { transform: 'scale(1)' }], { duration: 300 }); }
  inv.kills++;
  const M = player.mods;
  if (player.hp < player.maxHp && M.killHeal) player.hp = Math.min(player.maxHp, player.hp + M.killHeal);
  if (!M.killGauge || player.stamina >= player.maxStamina) return; // 기본은 처치해도 대시 게이지가 차지 않는다 (특수 칩 〈처치 환급 장치〉로만)
  player.stamina = Math.min(player.maxStamina, player.stamina + M.killGauge);
  audio.gauge();
  hud.animate([{ filter: 'brightness(2.2)' }, { filter: 'brightness(1)' }], { duration: 350 });
};
player.onSwing = (def) => audio.slash(!!def.heavy);
player.onRampage = (on) => {
  audio.rampage(on);
  rageFx.classList.toggle('on', on);
  if (on) { pop('RAMPAGE', '#ffd54a'); fx.flash(0.2); vib(60); }
};
player.onPerfectDodge = (hit) => {
  const src = hit.owner ?? hit; // 바닥 위험 지역은 그걸 만든 보스에게 반격이 돌아간다
  perfects++;
  audio.dodge();
  slowT = player.mods.dodgeSlow;
  pop('PERFECT', '#7ff6ff');
  slowEl.animate([{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 700 });
  rig.shake(0.02);
  player.addRage(player.mods.dodgeRage);
  if (src.boss && src.alive && !src.invulnerable) { // 보스에게는 자세 피해 (한 패턴에서 여러 번 피해도 조금씩만)
    if (src.addPosture(hit.owner ? 22 : 45)) combat._broken(src);
    src.hp = Math.max(1, src.hp - (hit.owner ? 15 : 30));
    combat.fx.sparks(new THREE.Vector3(src.pos.x, 2.4, src.pos.z), new THREE.Vector3(0, 1, 0), 24, 0x7ff6ff);
  }
};
player.onHurt = (dmg, dir) => {
  vib(45);
  fx.impact(0.7);
  audio.hurt();
  rig.shake(0.07);
  rig.addKick(dir, 0.25);
  combat.hitstop = Math.max(combat.hitstop, 0.07);
  fx.sparks(new THREE.Vector3(player.pos.x, 1.2, player.pos.z), dir, 14, 0xff5a4a);
  vig.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 450, easing: 'ease-out' });
};
player.onDeath = () => {
  audio.death();
  deaths++;
  $('overInfo').textContent = `ZONE ${zones.i + 1} · ${zoneDefs[zones.i].name}`;
  setTimeout(() => { over.style.display = 'flex'; }, 700);
};
player.onDashStart = (dir) => {
  audio.dash();
  rig.addKick(dir, -0.2);
  fx.dashBurst(player.pos, dir);
};
player.onDashEnd = (dir) => fx.dashEnd(player.pos, dir);

// ---- 진행 제어: 체크포인트 재도전 / 처음부터 ----
function resetCombatState() {
  over.style.display = 'none'; clearEl.style.display = 'none';
  bars.clear();
  rageFx.classList.remove('on');
  story.clearComm();
  slowT = 0;
}
// ---- 타워: 발판을 밟으면 화면이 어두워졌다가 다음 층 시작점에서 밝아진다 ----
const fadeEl = $('fade');
let transit = false;
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
async function enterFloor(z) {
  transit = true;
  fadeEl.classList.add('on');
  await wait(380);
  env.showPad(z.entry.padIndex, false);
  player.pos.copy(z.entry.dest); player.vel.set(0, 0, 0);
  player.facing = 0; player.yawBase = 0; player.model.rotation.y = 0;
  rig.yaw = 0; rig.target.set(player.pos.x, 1.4, player.pos.z);
  z.entered = true;
  if (z.room === 0) await story.play(STORY.towerEnter, { black: true });
  fadeEl.classList.remove('on');
  banner(z.name, 2200);
  await wait(300);
  transit = false;
}

function retryZone() { // 사망 후: 이번 구역을 처음부터, 산 칩은 유지하고 이번 구역에서 얻은 부품은 되돌린다
  resetCombatState();
  inv.credits = zoneCredits; inv.kills = zoneKills;
  zones.restartZone();
  if (zones.zone?.entry) zones.zone.entered = true; // 타워 층에서 쓰러지면 그 층 시작점에서 다시
  player.reset(zones.respawn);
  rig.target.set(player.pos.x, 1.4, player.pos.z);
  player.hp = player.maxHp;
  pop('CHECKPOINT', '#7ff6ff');
}
async function newGame(withIntro = true) {
  resetCombatState();
  inv = newInv(); zoneCredits = 0; zoneKills = 0;
  shop.ctx.inv = pack.ctx.inv = inv;
  shop.reset(); pack.close();
  stageTime = 0; maxCombo = 0; perfects = 0; execs = 0; deaths = 0; combat.hits = 0;
  player.mods = defaultMods(); player.maxHp = 100; player.maxStamina = 3;
  document.body.classList.remove('od');
  zones.reset();
  for (const z of zoneDefs) if (z.entry) { z.entered = false; env.showPad(z.entry.padIndex, false); }
  player.reset(env.start);
  rig.target.set(player.pos.x, 1.4, player.pos.z);
  buildPips();
  started = true;
  document.body.classList.remove('title');
  if (withIntro) await story.play(STORY.intro, { black: true });
  zones.enabled = true;
  banner('네온 블레이드', 2000);
}
const bind = (id, fn) => { const el = $(id); el.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); fn(); }, { passive: false }); };
bind('retryBtn', () => newGame(false)); bind('retryBtn2', retryZone); bind('newBtn', () => newGame(false));

// ---- 장착 변경 / 수리 키트 ----
function applyEquip() {
  const m = computeMods(inv.equipped);
  player.upgrade(m);
  if (!m.overdrive && (player.rampage || player.rage)) { player.rampage = false; player.rage = 0; rageFx.classList.remove('on'); }
  document.body.classList.toggle('od', m.overdrive);
  buildPips();
}
function useKit() {
  if (!inv.kits || player.dead || player.hp >= player.maxHp) { audio.bump(); return; }
  inv.kits--;
  player.hp = Math.min(player.maxHp, player.hp + player.maxHp * KIT.heal);
  audio.chip();
  pop('수리', '#9fd8c8');
}
const fmt = (v) => (v >= 1 ? '+' : '') + Math.round((v - 1) * 100) + '%';
function stats() {
  const M = player.mods;
  return [
    ['체력', `${Math.ceil(player.hp)} / ${player.maxHp}`],
    ['주는 피해', fmt(M.dmgMul)],
    ['받는 피해', fmt(M.dmgTaken)],
    ['대시 칸', player.maxStamina],
    ['대시 충전', fmt(1 / M.rechargeMul)],
    ['이동 속도', fmt(M.speedMul)],
    ['공격 범위', fmt(M.rangeMul)],
    ['공격 속도', fmt(M.atkSpeed)],
    ['자세 피해', fmt(M.postureMul)],
    ['처치 수', inv.kills],
    ['진행', `ZONE ${Math.min(zones.i + 1, zones.total)} / ${zones.total}`],
  ];
}

// ---- 설정 ----
let settings = { ...SETTINGS_DEFAULT };
try { Object.assign(settings, JSON.parse(localStorage.getItem('nb_settings') || '{}')); } catch {}
if (!settings.v2) { settings.v2 = true; if (settings.quality === 'high') settings.quality = 'auto'; } // 예전 기본값(높음)은 자동으로

// ---- 자동 성능 조절: 플레이 중 프레임이 계속 낮으면 그래픽을 한 단계씩 낮춘다 ----
const perf = { frames: 0, time: 0, warm: 0 };
function perfTick(dt) {
  if (settings.quality !== 'auto' || autoLevel >= 2) return;
  const now = performance.now(), real = perf.last ? Math.min(0.5, (now - perf.last) / 1000) : 0; // 실제 경과 시간 (dt는 1/30초로 잘려 있다)
  perf.last = now;
  perf.warm += real;
  if (perf.warm < 3) return; // 시작 직후(모델 로딩 등)는 무시
  perf.frames++; perf.time += real;
  if (perf.time < 3) return;
  const fps = perf.frames / perf.time;
  perf.frames = 0; perf.time = 0;
  if (fps < 42) {
    autoLevel++;
    applyGraphics(autoLevel);
    toast(`화면을 부드럽게 하려고 그래픽을 낮췄어요<small>설정 → 그래픽 품질에서 바꿀 수 있어요</small>`, 2600);
  }
}
const help = $('help');
// 그래픽 단계: 0 높음 / 1 중간(해상도↓, 구름·탐조등 끔) / 2 낮음(빛 번짐·색 보정도 끔)
let autoLevel = 0;
const gfxLevel = (s) => (s.quality === 'high' ? 0 : s.quality === 'mid' ? 1 : s.quality === 'low' ? 2 : autoLevel);
function applyGraphics(level) {
  const coarse = matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(level >= 1 ? Math.min(devicePixelRatio, 1) : Math.min(devicePixelRatio, coarse ? 1.25 : 1.5));
  renderer.setSize(innerWidth, innerHeight);
  fx.resize(innerWidth, innerHeight);
  fx.setBloom(level < 2);
  env.setQuality?.(level >= 1); // 구름·탐조등
}
function applySettings(s) {
  audio.setVolumes(s.master, s.music);
  audio.setRain(s.rainSound !== false);
  env.setRain?.(s.rainFx !== false);
  rig.sens = s.sens;
  rig.shakeMul = s.shake ? 1 : 0;
  applyGraphics(gfxLevel(s));
  help.classList.toggle('off', !s.help);
  try { localStorage.setItem('nb_settings', JSON.stringify(s)); } catch {}
}

const blocked = () => !started || story.blocking || shop.open || pack.isOpen || player.dead || zones.cleared;
const pauseUI = (on) => { if (on) document.exitPointerLock?.(); };
const shop = new DoctorShop({ inv, audio, blocked, pause: pauseUI, onChange: applyEquip });
const pack = new Backpack({
  inv, audio, settings, blocked: () => !started || story.blocking || shop.open || zones.cleared, pause: pauseUI,
  onChange: applyEquip, useKit, stats, applySettings,
  restart: () => newGame(false),
});
applySettings(settings);

addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') audio.toggleMute();
  if (!started) return;
  if (e.code === 'KeyQ' && !blocked()) useKit();
  if (e.code === 'KeyR' && player.dead) retryZone();
  else if (e.code === 'KeyR' && zones.cleared) newGame(false);
  if (e.code === 'KeyN' && player.dead) newGame(false);
});

// ---- 타이틀 ----
try { const b = localStorage.getItem('nb_best'); if (b) $('bestRank').textContent = `최고 등급 ${b}`; } catch {}
// ---- 전체화면 고정: 시작할 때 전체화면으로 들어가고, 플레이 중 풀리면 게임을 멈추고 다시 들어가게 한다 ----
const root = document.documentElement;
const fsSupported = !!(root.requestFullscreen || root.webkitRequestFullscreen);
const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
const fsGate = $('fsGate');
async function enterFullscreen() {
  if (!fsSupported || isFull()) return;
  try {
    await (root.requestFullscreen ? root.requestFullscreen({ navigationUI: 'hide' }) : root.webkitRequestFullscreen());
    await screen.orientation?.lock?.('landscape').catch(() => {});
  } catch {}
}
const onFsChange = () => {
  // 전체화면 요청이 거절되는 환경(일부 브라우저/앱)에서는 안내를 띄우지 않는다
  fsGate.classList.toggle('on', started && fsSupported && fsWanted && !isFull());
};
let fsWanted = false;
document.addEventListener('fullscreenchange', onFsChange);
document.addEventListener('webkitfullscreenchange', onFsChange);
const backToFull = async (e) => {
  e.preventDefault(); e.stopPropagation();
  await enterFullscreen();
  if (!isFull()) { fsWanted = false; fsGate.classList.remove('on'); } // 들어가지지 않으면 강제하지 않는다
  if (!input.isTouch) canvas.requestPointerLock?.();
};
fsGate.addEventListener('click', backToFull);
fsGate.addEventListener('touchend', backToFull, { passive: false });

$('goBtn').addEventListener('click', async () => {
  audio.unlock(); audio.select();
  titleEl.style.display = 'none';
  await enterFullscreen();
  fsWanted = isFull();
  if (!input.isTouch) canvas.requestPointerLock?.();
  newGame(true);
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  fx.resize(innerWidth, innerHeight);
});

// 조작 안내는 처음 몇 초 뒤 옅어진다 (설정에서 끌 수 있다)
setTimeout(() => help.classList.add('dim'), 30000);

const bars = new EnemyBars($('bars'));
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 30);
  // 타이틀/막(cinematic) 중에는 시뮬레이션을 멈추고 풍경만 살아 움직인다
  const paused = transit || story.blocking || shop.open || pack.isOpen || fsGate.classList.contains('on');
  document.body.classList.toggle('paused', paused);
  if (!started || paused) {
    input.poll();
    if (!started) { // 타이틀: 카메라가 천천히 골목을 둘러보며 하늘의 광고판과 구름을 비춘다
      titleT += dt;
      rig.yaw = Math.sin(titleT * 0.07) * 0.55; rig.pitch = 0.14 + Math.sin(titleT * 0.11) * 0.06; rig.distance = 6.5;
    }
    if (!player.dead) { player._applyPose(); player.anim.update(dt, { speed: 0, swordYaw: player.pose[1] }); } // 멈춘 동안에도 숨쉬는 대기 동작
    env.update(dt, player.pos, camera, innerHeight);
    audio.setMode(!started ? 'explore' : story.blocking ? 'quiet' : 'explore');
    if (started) creditsEl.textContent = `⚙ ${inv.credits}`;
    rig.update(dt, player);
    fx.render();
    requestAnimationFrame(frame);
    return;
  }
  // 히트스톱: 시뮬레이션을 거의 멈춘다 (카메라 흔들림은 실시간으로 계속)
  let simDt = dt;
  if (combat.hitstop > 0) { combat.hitstop -= dt; simDt = dt * 0.02; }
  // 완벽 회피 슬로모션: 적/탄환/파티클만 느려지고 플레이어는 정상 속도
  let eDt = simDt;
  if (slowT > 0) { slowT -= dt; eDt = simDt * 0.2; }

  const inp = input.poll();
  rig.applyLook(dt, inp, input.isTouch);
  player.update(simDt, inp, rig, combat);
  combat.update(eDt, player);
  zones.update(simDt, player);
  const zc = zones.zone;
  if (zones.enabled && zones.state === 'travel' && zc?.entry && !zc.entered && !player.dead) {
    const pd = zc.entry.pad;
    if (Math.hypot(player.pos.x - pd.x, player.pos.z - pd.z) < 1.8) enterFloor(zc);
  }
  story.update(dt);
  creditsEl.textContent = `⚙ ${inv.credits}`;
  // 박사 호출은 전투가 없을 때만 (구역 정리 후 다음 전투 전까지)
  if (shop.available && (zones.state === 'fight' || player.dead)) shop.setAvailable(false);
  if (!player.dead && !zones.cleared) stageTime += dt;
  perfTick(dt);
  setLodCenter(camera.position);
  maxCombo = Math.max(maxCombo, combat.hits);

  // 붉은 방벽에 막혔을 때 안내
  gateHintCd -= dt;
  const gate = env.curGate();
  const rear = env.rear, nearRear = rear && !rear.open && player.pos.z > rear.z - 1.2;
  if (!player.dead && gateHintCd <= 0 && zones.state !== 'travel' && ((gate && player.pos.z < gate.z + 2.2) || nearRear)) {
    gateHintCd = 3.5; pop('방벽 봉쇄 · 적을 모두 처치하라', '#ff6b5a'); audio.bump();
  }

  const pr = zones.progress;
  const wl = `STAGE 1 · ZONE ${Math.min(zones.i + 1, zones.total)}/${zones.total}<small>${zoneDefs[Math.min(zones.i, zones.total - 1)].name}${zones.state === 'fight' ? ` · 웨이브 ${pr.wave}/${pr.waves} · 남은 적 ${zones.remaining}` : ''}</small>`;
  if (stageEl.dataset.v !== wl) { stageEl.dataset.v = wl; stageEl.innerHTML = wl; }
  bars.update(combat.enemies, camera, player);
  hpf.style.width = (player.hp / player.maxHp) * 100 + '%';
  const tint = player.atk?.def.heavy ? tintHeavy : tintLight;
  const trailTint = player.rampage ? _tt.copy(tint).lerp(GOLD, 0.45).multiplyScalar(1.2) : tint;
  fx.trail.update(simDt, player.swinging || player.trailing ? player.sampleSword(4) : null, trailTint);
  rgf.style.width = player.rage + '%';
  rgEl.classList.toggle('on', player.rampage);
  const bossAlive = combat.enemies.some((e) => e.boss && e.alive);
  audio.setMode(player.dead || zones.cleared ? 'quiet' : bossAlive ? 'boss' : zones.state === 'fight' ? 'combat' : 'explore');
  rig.update(dt, player);
  fx.update(eDt, player);
  env.update(dt, player.pos, camera, innerHeight);
  fill.position.set(player.pos.x + (camera.position.x - player.pos.x) * 0.4, 2.6, player.pos.z + (camera.position.z - player.pos.z) * 0.4);

  if (combat.hits > 1) { comboN.textContent = combat.hits; comboEl.style.opacity = 1; }
  else comboEl.style.opacity = 0;
  for (let i = 0; i < pips.length; i++) pips[i].style.width = Math.max(0, Math.min(1, player.stamina - i)) * 100 + '%';

  const obj = zones.objective;
  if (obj) {
    const dx = obj.x - player.pos.x, dz = obj.z - player.pos.z;
    const f = rig.forward(), r = rig.right();
    objArrow.style.transform = `rotate(${Math.atan2(dx * r.x + dz * r.z, dx * f.x + dz * f.z)}rad)`;
    objText.textContent = Math.round(Math.hypot(dx, dz)) + 'm';
    objEl.style.opacity = 1;
  } else objEl.style.opacity = 0;

  const boss = combat.enemies.find((e) => e.boss && e.alive);
  if (boss) {
    bossEl.style.opacity = 1;
    bossName.textContent = boss.name;
    const r = Math.max(0, boss.hp / boss.maxHp) * 100;
    bossHp.style.width = r + '%'; bossGh.style.width = r + '%';
    bossPs.style.width = (boss.broken ? 100 : (boss.posture / boss.maxPosture) * 100) + '%';
    bossEl.classList.toggle('broken', !!boss.broken);
  } else bossEl.style.opacity = 0;
  fx.render();
  requestAnimationFrame(frame);
}
frame();
window.__game = { renderer, player, rig, combat, fx, waves: zones, zones, audio, story, env, newGame, retryZone, start: () => $('goBtn').click() };

// 필름 그레인 (사진 같은 질감)
{
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  $('grain').style.backgroundImage = `url(${c.toDataURL()})`;
}
