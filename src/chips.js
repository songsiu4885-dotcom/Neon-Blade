// 스탯 강화: 박사에게 기계 부품을 내고 능력치를 한 단계씩 올린다. 같은 스탯을 여러 번 올릴 수 있고, 올릴수록 값이 오른다.

// 수리 키트: 부품 50개, 쓰면 최대 체력의 30% 회복 (Q 또는 배낭)
export const KIT = { name: '수리 키트', price: 50, heal: 0.3, max: 5 };

export const defaultMods = () => ({
  extraDash: 0, rechargeMul: 1, killGauge: 0, dodgeSlow: 0.5, counterTime: 0, counterMul: 2, dodgeRage: 0,
  rampBonus: 0, rampGain: 1, hpBonus: 0, killHeal: 0, dmgTaken: 1, dmgMul: 1, postureMul: 1, dashCutMul: 1,
  hitGauge: 0, speedMul: 1, overdrive: false, hitHeal: 0, rangeMul: 1, atkSpeed: 1,
});

// price: 첫 단계 값, grow: 단계마다 곱해지는 값, max: 최대 단계 (없으면 무제한)
export const STATS = [
  { id: 'hp', name: '체력', unit: '최대 체력 +20', price: 50, grow: 1.16, apply: (m, n) => { m.hpBonus += 20 * n; } },
  { id: 'atk', name: '공격력', unit: '주는 피해 +10%', price: 70, grow: 1.18, apply: (m, n) => { m.dmgMul *= 1 + 0.1 * n; } },
  { id: 'def', name: '방어력', unit: '받는 피해 -6%', price: 70, grow: 1.2, max: 10, apply: (m, n) => { m.dmgTaken *= Math.pow(0.94, n); } },
  { id: 'aspd', name: '공격 속도', unit: '공격 속도 +7%', price: 80, grow: 1.22, max: 10, apply: (m, n) => { m.atkSpeed *= 1 + 0.07 * n; } },
  { id: 'range', name: '공격 범위', unit: '닿는 거리 +8%, 휘두르는 폭 +4°', price: 70, grow: 1.22, max: 10, apply: (m, n) => { m.rangeMul *= 1 + 0.08 * n; m.arcAdd = (m.arcAdd || 0) + 4 * n; } },
  { id: 'move', name: '이동 속도', unit: '이동 속도 +5%', price: 50, grow: 1.22, max: 8, apply: (m, n) => { m.speedMul *= 1 + 0.05 * n; } },
  { id: 'dash', name: '대시 칸', unit: '대시 게이지 +1칸', price: 220, grow: 1.9, max: 3, apply: (m, n) => { m.extraDash += n; } },
  { id: 'recharge', name: '대시 충전', unit: '대시 충전 +12% 빠르게', price: 60, grow: 1.22, max: 8, apply: (m, n) => { m.rechargeMul *= Math.pow(0.89, n); } },
  { id: 'posture', name: '자세 파괴', unit: '자세 게이지 피해 +15%', price: 60, grow: 1.2, max: 10, apply: (m, n) => { m.postureMul *= 1 + 0.15 * n; } },
  { id: 'vamp', name: '흡혈', unit: '적중할 때마다 체력 +0.4', price: 110, grow: 1.25, max: 8, apply: (m, n) => { m.hitHeal += 0.4 * n; } },
  { id: 'repair', name: '처치 회복', unit: '적 처치 시 체력 +3', price: 80, grow: 1.22, max: 8, apply: (m, n) => { m.killHeal += 3 * n; } },
  { id: 'dodge', name: '완벽 회피', unit: '슬로모션 +0.1초, 반격 피해 +20%', price: 90, grow: 1.3, max: 5, apply: (m, n) => { m.dodgeSlow += 0.1 * n; m.counterTime += 0.15 * n; m.counterMul += 0.2 * n; } },
  { id: 'overdrive', name: '오버드라이브', unit: '공격하면 폭주 게이지가 찬다. 가득 차면 10초간 피해 +50%, 공격·이동 가속 (단계마다 지속 +2초)', price: 300, grow: 1.5, max: 4, apply: (m, n) => { if (n) { m.overdrive = true; m.rampBonus += 2 * (n - 1); m.dodgeRage += 10 * n; } } },
];

export const statById = (id) => STATS.find((s) => s.id === id);
export const statLevel = (stats, id) => stats?.[id] || 0;
export const statPrice = (s, lv) => Math.round((s.price * Math.pow(s.grow, lv)) / 5) * 5;
export const statMaxed = (s, lv) => s.max != null && lv >= s.max;

export function computeMods(stats = {}) {
  const m = defaultMods();
  for (const s of STATS) { const n = statLevel(stats, s.id); if (n) s.apply(m, n); }
  return m;
}

// 검 스킨 (기본 하나만 쓴다)
export const SKINS = [
  { name: '시안 블레이드', blade: [1.6, 2.0, 2.0], aura: 0x00e5ff, light: [0.7, 1, 1], heavy: [1, 0.55, 1], trailLife: 0.18, swatch: '#5af2ff' },
];
