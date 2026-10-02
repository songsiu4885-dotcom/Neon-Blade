// 칩: 전투 후 박사를 호출해 기계 부품으로 사서 배낭에 넣고, 정해진 슬롯 수만큼만 장착한다.
// basic: 기본 개조(능력치) / special: 특수 개조(싸우는 방식을 바꾸는 능력)

export const SLOTS = { basic: 3, special: 2 };
export const KIT = { name: '수리 키트', desc: '체력 45% 회복 (Q 또는 배낭에서 사용)', price: 70, heal: 0.45, max: 5 };

export const defaultMods = () => ({
  extraDash: 0, rechargeMul: 1, killGauge: 1, dodgeSlow: 0.5, counterTime: 0, counterMul: 2, dodgeRage: 0,
  rampBonus: 0, rampGain: 1, hpBonus: 0, killHeal: 0, dmgTaken: 1, dmgMul: 1, postureMul: 1, dashCutMul: 1,
  hitGauge: 0, speedMul: 1, overdrive: false, hitHeal: 0,
});

export const CHIPS = [
  // ---- 기본 개조 ----
  { id: 'hp+', kind: 'basic', price: 120, name: '강철 심장', desc: '최대 체력 +30', apply: (m) => { m.hpBonus += 30; } },
  { id: 'hp2', kind: 'basic', price: 420, name: '이중 펌프 심장', desc: '최대 체력 +55', apply: (m) => { m.hpBonus += 55; } },
  { id: 'dmg+', kind: 'basic', price: 220, name: '예리한 날', desc: '주는 피해 +15%', apply: (m) => { m.dmgMul *= 1.15; } },
  { id: 'dmg2', kind: 'basic', price: 480, name: '고주파 날', desc: '주는 피해 +28%', apply: (m) => { m.dmgMul *= 1.28; } },
  { id: 'armor', kind: 'basic', price: 280, name: '장갑 코팅', desc: '받는 피해 -20%', apply: (m) => { m.dmgTaken *= 0.8; } },
  { id: 'dash+', kind: 'basic', price: 240, name: '보조 대시 코어', desc: '대시 게이지 +1칸', apply: (m) => { m.extraDash += 1; } },
  { id: 'recharge', kind: 'basic', price: 140, name: '쾌속 충전기', desc: '대시 충전 40% 빨라짐', apply: (m) => { m.rechargeMul *= 0.6; } },
  { id: 'posture+', kind: 'basic', price: 220, name: '자세 파쇄기', desc: '자세 게이지 피해 +40%', apply: (m) => { m.postureMul *= 1.4; } },
  { id: 'legs', kind: 'basic', price: 110, name: '강화 다리', desc: '이동 속도 +12%', apply: (m) => { m.speedMul *= 1.12; } },
  { id: 'repair', kind: 'basic', price: 300, name: '자가 수리 회로', desc: '적 처치 시 체력 +5', apply: (m) => { m.killHeal += 5; } },
  // ---- 특수 개조 ----
  { id: 'overdrive', kind: 'special', price: 520, name: '오버드라이브', desc: '공격하면 폭주 게이지가 찬다. 가득 차면 10초간 피해 +50%, 공격·이동 가속', apply: (m) => { m.overdrive = true; } },
  { id: 'dodge+', kind: 'special', price: 420, name: '시간 왜곡 칩', desc: '완벽 회피 슬로모션 0.9초, 반격 2.6배', apply: (m) => { m.dodgeSlow = 0.9; m.counterTime += 0.6; m.counterMul = 2.6; } },
  { id: 'vamp', kind: 'special', price: 480, name: '흡혈 칼날', desc: '적중할 때마다 체력 +1.2', apply: (m) => { m.hitHeal += 1.2; } },
  { id: 'killcharge', kind: 'special', price: 360, name: '처치 환급 장치', desc: '적 처치 시 대시 게이지 +2칸', apply: (m) => { m.killGauge = 2; } },
  { id: 'hitcharge', kind: 'special', price: 340, name: '전하 흡수기', desc: '적중할 때마다 대시 게이지 조금 충전', apply: (m) => { m.hitGauge += 0.12; } },
  { id: 'dashcut', kind: 'special', price: 360, name: '관통 대시', desc: '대시 베기 피해 +70%', apply: (m) => { m.dashCutMul = 1.7; } },
  { id: 'rampamp', kind: 'special', price: 300, name: '폭주 증폭기', desc: '폭주 게이지 +60%, 지속 +5초, 완벽 회피 시 +25 (오버드라이브 필요)', apply: (m) => { m.rampGain = 1.6; m.rampBonus += 5; m.dodgeRage += 25; } },
];

export const chipById = (id) => CHIPS.find((c) => c.id === id);

export function computeMods(ids) {
  const m = defaultMods();
  for (const id of ids) chipById(id)?.apply(m);
  return m;
}

// 검 스킨 (기본 하나만 쓴다)
export const SKINS = [
  { name: '시안 블레이드', blade: [1.6, 2.0, 2.0], aura: 0x00e5ff, light: [0.7, 1, 1], heavy: [1, 0.55, 1], trailLife: 0.18, swatch: '#5af2ff' },
];
