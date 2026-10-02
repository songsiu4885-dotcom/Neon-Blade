import * as THREE from 'three';

// 사람 체형 절차적 캐릭터. 스키닝 모델(hero.js)을 불러오는 동안 쓰는 대체 모델.
// 관절 계층: 골반 → 척추 → 가슴 → 목/머리, 어깨 → 팔꿈치 → 손, 고관절 → 무릎 → 발목.
// sword: true면 오른팔은 칼 손잡이를 따라가는 2관절 IK로 만든다.

const Y = new THREE.Vector3(0, 1, 0);
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
const group = (x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); return g; };
const capsule = (r, len, seg = 12) => new THREE.CapsuleGeometry(r, len, 5, seg);
const std = (color, rough = 0.8, metal = 0.05, side = THREE.FrontSide) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, side });

export const PALETTES = {
  hero: { skin: 0xc49478, hair: 0x101014, coat: 0x1b1d23, lining: 0x5a1018, shirt: 0x15171c, pants: 0x1c1e24, shoes: 0x101113, belt: 0x2a1d16, accent: 0x6fd8e8 },
};

export function buildHuman(o = {}) {
  const P = PALETTES[o.palette || 'hero'];
  const M = {
    skin: std(P.skin, 0.6), hair: std(P.hair, 0.75), coat: std(P.coat, 0.85, 0.05, THREE.DoubleSide), lining: std(P.lining, 0.8, 0.05, THREE.DoubleSide),
    shirt: std(P.shirt, 0.9), pants: std(P.pants, 0.85), shoes: std(P.shoes, 0.55, 0.1), belt: std(P.belt, 0.6, 0.2),
    eye: new THREE.MeshBasicMaterial({ color: 0x0a0a0c }), accent: new THREE.MeshBasicMaterial({ color: new THREE.Color(P.accent).multiplyScalar(1.4) }),
    metal: std(0x8a8e96, 0.35, 0.85),
    chrome: std(0xb4bac4, 0.22, 0.95), gun: std(0x2c3038, 0.35, 0.85), cable: std(0x0c0d10, 0.5, 0.3),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.7, 1.9) }),
    eyeGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.35, 0.3) }),
    scarf: std(0x7a141c, 0.85, 0.05, THREE.DoubleSide),
  };
  const cy = !!o.cyber;
  const root = new THREE.Group();
  const J = {};

  // ---- 골반 / 다리 ----
  J.pelvis = group(0, 0.95, 0);
  root.add(J.pelvis);
  const hips = mesh(capsule(0.12, 0.17), M.pants); hips.rotation.z = Math.PI / 2; hips.scale.set(1, 1, 0.82);
  J.pelvis.add(hips);
  J.pelvis.add(mesh(new THREE.CylinderGeometry(0.155, 0.15, 0.06, 16), M.belt, 0, 0.07, 0));
  J.pelvis.add(mesh(new THREE.BoxGeometry(0.05, 0.04, 0.015), M.metal, 0, 0.07, -0.135));

  for (const s of [-1, 1]) {
    const hip = group(s * 0.095, -0.03, 0);
    J.pelvis.add(hip);
    const thigh = mesh(capsule(0.072, 0.3), M.pants, 0, -0.21, 0); thigh.scale.set(1, 1, 1.05);
    hip.add(thigh);
    const knee = group(0, -0.43, 0);
    hip.add(knee);
    knee.add(mesh(capsule(0.056, 0.3), M.pants, 0, -0.2, 0.005));
    if (cy && s < 0) { // 왼쪽 다리: 무릎 관절과 정강이 장갑
      knee.add(mesh(new THREE.SphereGeometry(0.06, 12, 8), M.chrome, 0, 0, -0.03));
      knee.add(mesh(new THREE.TorusGeometry(0.058, 0.008, 6, 20).rotateY(Math.PI / 2), M.glow, 0, 0, 0));
      const plate = mesh(new THREE.BoxGeometry(0.1, 0.3, 0.05), M.gun, 0, -0.2, -0.05); plate.rotation.x = 0.04; knee.add(plate);
      knee.add(mesh(new THREE.BoxGeometry(0.012, 0.22, 0.012), M.glow, -0.035, -0.2, -0.078));
      knee.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), M.chrome, -0.06, -0.2, 0.03));
      hip.add(mesh(new THREE.BoxGeometry(0.06, 0.22, 0.06), M.gun, -0.06, -0.2, -0.02));
    }
    const ankle = group(0, -0.43, 0);
    knee.add(ankle);
    const shoe = mesh(capsule(0.05, 0.16, 8), M.shoes, 0, -0.04, -0.05); shoe.rotation.x = Math.PI / 2; shoe.scale.set(1.15, 1, 0.75);
    ankle.add(shoe);
    ankle.add(mesh(new THREE.BoxGeometry(0.11, 0.025, 0.27), M.shoes, 0, -0.072, -0.05));
    J[s < 0 ? 'hipL' : 'hipR'] = hip; J[s < 0 ? 'kneeL' : 'kneeR'] = knee; J[s < 0 ? 'ankleL' : 'ankleR'] = ankle;
  }

  // ---- 긴 코트 자락 ----
  const coatLen = o.coatLen ?? 0.62;
  const panel = (w, h, x, z, yaw) => {
    const g = group(x, 0.05, z); g.rotation.y = yaw;
    const geo = new THREE.PlaneGeometry(w, h, 1, 3).translate(0, -h / 2, 0);
    g.add(mesh(geo, M.coat), mesh(geo, M.lining, 0, 0, -0.004));
    J.pelvis.add(g);
    return g;
  };
  J.coat = [panel(0.34, coatLen, 0, 0.13, 0), panel(0.2, coatLen * 0.93, -0.16, 0.06, -0.95), panel(0.2, coatLen * 0.93, 0.16, 0.06, 0.95)];

  // ---- 상체 ----
  J.spine = group(0, 0.09, 0);
  J.pelvis.add(J.spine);
  const belly = mesh(capsule(0.115, 0.1), M.shirt, 0, 0.07, 0); belly.scale.set(1.12, 1, 0.82);
  J.spine.add(belly);
  J.chest = group(0, 0.19, 0);
  J.spine.add(J.chest);
  const ribs = mesh(capsule(0.14, 0.14), M.shirt, 0, 0.1, 0); ribs.scale.set(1.25, 1, 0.78);
  J.chest.add(ribs);
  // 코트 몸판 (앞이 트여 셔츠가 보인다)
  for (const s of [-1, 1]) {
    const side = mesh(capsule(0.1, 0.18), M.coat, s * 0.095, 0.1, 0.005); side.scale.set(0.95, 1, 1.12);
    J.chest.add(side);
  }
  const back = mesh(new THREE.BoxGeometry(0.3, 0.34, 0.04), M.coat, 0, 0.11, 0.105);
  J.chest.add(back);
  for (const s of [-1, 1]) { // 칼라
    const lap = mesh(new THREE.BoxGeometry(0.06, 0.16, 0.02), M.lining, s * 0.07, 0.2, -0.115); lap.rotation.z = s * 0.35; lap.rotation.x = -0.2;
    J.chest.add(lap);
  }
  J.chest.add(mesh(new THREE.CylinderGeometry(0.085, 0.11, 0.08, 14, 1, true), M.coat, 0, 0.29, 0.015));
  if (cy) {
    // 가슴 반응로 + 갈비뼈 따라 이어진 발광선
    J.chest.add(mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.02, 20).rotateX(Math.PI / 2), M.chrome, -0.02, 0.15, -0.112));
    J.core = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.024, 16).rotateX(Math.PI / 2), M.glow, -0.02, 0.15, -0.115);
    J.chest.add(J.core);
    for (let i = 0; i < 3; i++) {
      const l = mesh(new THREE.BoxGeometry(0.07, 0.006, 0.006), M.glow, -0.075, 0.1 - i * 0.035, -0.1 + i * 0.004); l.rotation.z = 0.35; J.chest.add(l);
    }
    // 등의 척추 임플란트
    for (let i = 0; i < 5; i++) {
      J.chest.add(mesh(new THREE.BoxGeometry(0.06, 0.035, 0.03), M.chrome, 0, 0.27 - i * 0.055, 0.13));
      J.chest.add(mesh(new THREE.BoxGeometry(0.03, 0.012, 0.01), M.glow, 0, 0.25 - i * 0.055, 0.146));
    }
    // 목덜미 케이블
    for (const s of [-1, 1]) { const c = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6), M.cable, s * 0.025, 0.31, 0.06); c.rotation.x = -0.5; J.chest.add(c); }
  }

  // ---- 목 / 머리 ----
  J.neck = group(0, 0.29, 0);
  J.chest.add(J.neck);
  J.neck.add(mesh(new THREE.CylinderGeometry(0.045, 0.052, 0.11, 12), M.skin, 0, 0.03, 0));
  J.head = group(0, 0.11, 0);
  J.neck.add(J.head);
  const skull = mesh(new THREE.SphereGeometry(0.1, 20, 16), M.skin, 0, 0.04, 0.005); skull.scale.set(0.86, 1.08, 1.0);
  J.head.add(skull);
  const jaw = mesh(new THREE.SphereGeometry(0.075, 16, 12), M.skin, 0, -0.005, -0.025); jaw.scale.set(0.95, 0.8, 0.95);
  J.head.add(jaw);
  const nose = mesh(new THREE.ConeGeometry(0.014, 0.04, 6), M.skin, 0, 0.03, -0.103); nose.rotation.x = -Math.PI / 2 + 0.3;
  J.head.add(nose);
  for (const s of [-1, 1]) {
    J.head.add(mesh(new THREE.SphereGeometry(0.011, 8, 6), M.eye, s * 0.034, 0.055, -0.088));
    J.head.add(mesh(new THREE.BoxGeometry(0.036, 0.008, 0.012), M.hair, s * 0.035, 0.075, -0.09));        // 눈썹
    const ear = mesh(new THREE.SphereGeometry(0.02, 8, 6), M.skin, s * 0.087, 0.04, 0.005); ear.scale.set(0.5, 1, 0.8);
    J.head.add(ear);
  }
  if (cy) {
    // 왼쪽 얼굴 절반을 덮은 금속판 + 붉은 인공 눈
    const plate = mesh(new THREE.SphereGeometry(0.104, 20, 14, Math.PI * 0.02, Math.PI * 0.62, Math.PI * 0.18, Math.PI * 0.5), M.chrome, 0, 0.035, 0.004);
    plate.scale.set(0.9, 1.1, 1.03); plate.rotation.y = Math.PI * 1.02;
    J.head.add(plate);
    J.head.add(mesh(new THREE.SphereGeometry(0.017, 10, 8), M.gun, -0.036, 0.055, -0.088));
    J.eyeL = mesh(new THREE.SphereGeometry(0.011, 10, 8), M.eyeGlow, -0.036, 0.056, -0.097);
    J.head.add(J.eyeL);
    J.head.add(mesh(new THREE.BoxGeometry(0.004, 0.06, 0.004), M.glow, -0.012, 0.035, -0.1));     // 판의 경계선
    J.head.add(mesh(new THREE.BoxGeometry(0.03, 0.03, 0.04), M.gun, -0.088, 0.04, 0.0));           // 귀 자리 소켓
    J.head.add(mesh(new THREE.TorusGeometry(0.012, 0.004, 6, 14).rotateY(Math.PI / 2), M.glow, -0.105, 0.04, 0.0));
  }
  if (cy) {
    // 왼쪽을 밀어 올린 언더컷: 머리칼은 오른쪽 위로 넘기고, 민 쪽에는 금속 단자
    const cap = mesh(new THREE.SphereGeometry(0.108, 18, 12, Math.PI * 0.55, Math.PI * 1.25, 0, Math.PI * 0.5), M.hair, 0.006, 0.06, 0.012); cap.scale.set(0.95, 1.0, 1.05);
    J.head.add(cap);
    for (let i = 0; i < 7; i++) {
      const lock = mesh(new THREE.ConeGeometry(0.03, 0.17, 5), M.hair, 0.04 - i * 0.012, 0.13 - Math.abs(i - 3) * 0.004, -0.04 + i * 0.022);
      lock.rotation.x = 1.9 + i * 0.07; lock.rotation.z = 0.5; J.head.add(lock);
    }
    for (let i = 0; i < 3; i++) J.head.add(mesh(new THREE.BoxGeometry(0.004, 0.004, 0.05), M.glow, -0.095, 0.07 + i * 0.02, 0.03));
  } else {
    const cap = mesh(new THREE.SphereGeometry(0.108, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), M.hair, 0, 0.055, 0.012); cap.scale.set(0.92, 1.0, 1.05);
    J.head.add(cap);
    for (let i = 0; i < 6; i++) { // 앞머리 / 뒷머리 결
      const a = (i / 5 - 0.5) * 1.6;
      const lock = mesh(new THREE.ConeGeometry(0.03, 0.11, 5), M.hair, Math.sin(a) * 0.075, 0.1, -Math.cos(a) * 0.06);
      lock.rotation.x = -2.3; lock.rotation.z = -a * 0.5;
      J.head.add(lock);
    }
    for (let i = 0; i < 5; i++) {
      const lock = mesh(new THREE.ConeGeometry(0.035, 0.13, 5), M.hair, (i - 2) * 0.035, 0.06, 0.085);
      lock.rotation.x = 2.6; J.head.add(lock);
    }
  }

  // ---- 팔 ----
  const mechArm = (s) => { // 기계 팔: 크롬 어깨 갑주, 발광 관절, 기계 손
    const sh = group(s * 0.2, 0.2, 0);
    J.chest.add(sh);
    const pad = mesh(new THREE.SphereGeometry(0.085, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), M.chrome, s * 0.01, 0.02, 0); pad.scale.set(1.15, 0.9, 1.05);
    sh.add(pad);
    sh.add(mesh(new THREE.TorusGeometry(0.06, 0.009, 6, 20).rotateX(Math.PI / 2), M.glow, 0, -0.03, 0));
    sh.add(mesh(new THREE.CylinderGeometry(0.042, 0.036, 0.22, 10), M.gun, 0, -0.15, 0));
    sh.add(mesh(new THREE.BoxGeometry(0.03, 0.18, 0.07), M.chrome, s * 0.035, -0.15, 0));
    sh.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 6), M.cable, -s * 0.03, -0.15, 0.03));
    const el = group(0, -0.29, 0);
    sh.add(el);
    el.add(mesh(new THREE.SphereGeometry(0.045, 12, 8), M.chrome));
    el.add(mesh(new THREE.TorusGeometry(0.046, 0.007, 6, 18).rotateZ(Math.PI / 2), M.glow));
    const fore = mesh(new THREE.CylinderGeometry(0.05, 0.038, 0.2, 10), M.chrome, 0, -0.12, 0); el.add(fore);
    el.add(mesh(new THREE.BoxGeometry(0.008, 0.16, 0.008), M.glow, s * 0.045, -0.12, -0.02));
    el.add(mesh(new THREE.BoxGeometry(0.06, 0.04, 0.06), M.gun, 0, -0.23, 0));
    const hand = group(0, -0.27, 0); el.add(hand);
    hand.add(mesh(new THREE.BoxGeometry(0.07, 0.07, 0.04), M.gun, 0, 0, -0.005));
    for (let f = 0; f < 4; f++) { const fg = mesh(new THREE.BoxGeometry(0.014, 0.06, 0.016), M.chrome, -0.024 + f * 0.016, -0.06, -0.012); fg.rotation.x = -0.35; hand.add(fg); }
    hand.add(mesh(new THREE.BoxGeometry(0.016, 0.045, 0.016), M.chrome, -s * 0.042, -0.02, -0.02));
    return { sh, el };
  };
  const arm = (s) => {
    const sh = group(s * 0.2, 0.2, 0);
    J.chest.add(sh);
    sh.add(mesh(new THREE.SphereGeometry(0.068, 12, 10), M.coat, 0, -0.01, 0));
    sh.add(mesh(capsule(0.056, 0.19), M.coat, 0, -0.14, 0));
    const el = group(0, -0.29, 0);
    sh.add(el);
    el.add(mesh(capsule(0.048, 0.17), M.coat, 0, -0.12, 0));
    el.add(mesh(new THREE.CylinderGeometry(0.052, 0.05, 0.03, 12), M.lining, 0, -0.215, 0)); // 소매 끝
    const hand = mesh(capsule(0.036, 0.05, 8), M.skin, 0, -0.27, -0.005); hand.scale.set(1, 1, 0.65);
    el.add(hand);
    return { sh, el };
  };
  const L = cy ? mechArm(-1) : arm(-1); J.shoulderL = L.sh; J.elbowL = L.el;
  if (cy) {
    // 붉은 목도리: 뒤로 길게 흩날리는 두 가닥
    const wrap = mesh(new THREE.TorusGeometry(0.075, 0.03, 8, 18).rotateX(Math.PI / 2), M.scarf, 0, 0.3, 0.005); wrap.scale.set(1.15, 1, 1.1);
    J.chest.add(wrap);
    J.scarf = [];
    for (const [x, len] of [[0.04, 0.75], [-0.03, 0.55]]) {
      const g = group(x, 0.29, 0.09);
      const geo = new THREE.PlaneGeometry(0.1, len, 1, 6).translate(0, -len / 2, 0);
      g.add(mesh(geo, M.scarf));
      J.chest.add(g); J.scarf.push(g);
    }
    // 찢겨 나간 왼소매 자국
    const torn = mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.05, 12, 1, true), M.coat, -0.2, 0.17, 0); J.chest.add(torn);
  }

  let pivot = null, sword = null, aura = null, bladeMat = null;
  if (o.sword) {
    J.rUpper = new THREE.Group(); J.rUpper.add(mesh(capsule(0.056, 0.19), M.coat));
    J.rLower = new THREE.Group(); J.rLower.add(mesh(capsule(0.048, 0.17), M.coat)); J.rLower.add(mesh(new THREE.CylinderGeometry(0.052, 0.05, 0.03, 12), M.lining, 0, -0.1, 0));
    J.rHand = mesh(capsule(0.036, 0.05, 8), M.skin); J.rHand.scale.set(1, 1, 0.65);
    J.chest.add(mesh(new THREE.SphereGeometry(0.068, 12, 10), M.coat, 0.2, 0.19, 0));
    root.add(J.rUpper, J.rLower, J.rHand);

    // 칼: 오른쪽 어깨를 축으로 도는 피벗, 손잡이는 어깨에서 0.52m
    pivot = group(0.2, 0.2, 0);
    pivot.rotation.order = 'YXZ';
    J.chest.add(pivot);
    sword = group(0, 0.52, 0);
    pivot.add(sword);
    bladeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 2.0, 2.0) });
    sword.add(mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.26, 8), M.hair, 0, -0.02, 0));
    sword.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 16), M.metal, 0, 0.12, 0));
    sword.add(mesh(new THREE.BoxGeometry(0.028, 1.02, 0.007), bladeMat, 0, 0.645, 0));
    sword.add(mesh(new THREE.ConeGeometry(0.014, 0.06, 4).scale(1, 1, 0.3), bladeMat, 0, 1.185, 0));
    aura = mesh(new THREE.BoxGeometry(0.06, 1.08, 0.03),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0.66, 0);
    sword.add(aura);
  } else {
    const R = arm(1); J.shoulderR = R.sh; J.elbowR = R.el;
  }

  return { root, J, pivot, sword, aura, bladeMat, swordTip: new THREE.Vector3(0, 1.2, 0), swordBase: new THREE.Vector3(0, 0.18, 0) };
}

function placeBetween(obj, a, b) {
  obj.position.copy(a).add(b).multiplyScalar(0.5);
  obj.quaternion.setFromUnitVectors(Y, b.clone().sub(a).normalize());
}

// ---- 절차적 애니메이터 ----
// 보행 위상은 이동 거리에 비례해 진행한다(발이 미끄러지지 않는다).
// 걸음/달리기/전투 자세를 따로 계산한 뒤 가중치로 섞는다.
export class HumanAnimator {
  constructor(rig) {
    this.rig = rig;
    this.phase = 0;
    this.t = Math.random() * 10;
    this.cur = {};
    this.w = { atk: 0, dash: 0, charge: 0, hurt: 0 };
    this.run = 0;
    this.moving = 0;
    this._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this._pole = new THREE.Vector3();
  }

  _go(key, target, k, dt) {
    const c = this.cur[key] ?? target;
    this.cur[key] = c + (target - c) * (1 - Math.exp(-k * dt));
    return this.cur[key];
  }

  update(dt, s) {
    const J = this.rig.J;
    this.t += dt;
    const speed = s.speed || 0;
    this.run += (Math.min(1, Math.max(0, (speed - 3) / 7)) - this.run) * (1 - Math.exp(-6 * dt));
    this.moving += (Math.min(1, speed / 1.2) - this.moving) * (1 - Math.exp(-8 * dt));
    const run = this.run, mv = this.moving;
    const stride = 1.5 + 1.3 * run;               // 한 주기(두 걸음) 길이
    if (!s.dashing) this.phase += (speed * dt / stride) * Math.PI * 2;
    const ph = this.phase, sp = Math.sin(ph), cp = Math.cos(ph);

    // ---- 보행 ----
    const A = (0.42 + 0.38 * run) * mv;
    const swingR = Math.max(0, Math.cos(ph + 0.35)), swingL = Math.max(0, Math.cos(ph + 0.35 + Math.PI));
    const g = {
      hipR: sp * A + 0.08 * run * mv, hipL: -sp * A + 0.08 * run * mv,
      kneeR: -(0.06 + (0.45 + 1.0 * run) * Math.pow(swingR, 1.6) * mv),
      kneeL: -(0.06 + (0.45 + 1.0 * run) * Math.pow(swingL, 1.6) * mv),
      pelvisY: -Math.abs(sp) * (0.03 + 0.03 * run) * mv - 0.03 * run,
      pelvisYaw: sp * (0.1 + 0.06 * run) * mv,
      pelvisRoll: cp * 0.035 * mv * (1 - run * 0.5),
      spineX: 0.06 * run * mv,
      chestYaw: -sp * (0.14 + 0.08 * run) * mv,
      armL: sp * (0.35 + 0.5 * run) * mv - 0.05,
      elbowL: 0.18 + (0.25 + 0.9 * run) * mv + Math.max(0, sp) * 0.25 * mv,
      armR: -sp * (0.35 + 0.5 * run) * mv - 0.05,
      elbowR: 0.18 + (0.25 + 0.9 * run) * mv + Math.max(0, -sp) * 0.25 * mv,
      headX: 0, stanceZ: 0.05 * (1 - mv),
    };
    // 숨쉬기와 무게 이동 (정지 시)
    const idle = 1 - mv;
    const breathe = Math.sin(this.t * 1.9) * 0.008 * idle;
    g.pelvisRoll += Math.sin(this.t * 0.6) * 0.02 * idle;
    g.hipL += 0.04 * idle; g.hipR -= 0.06 * idle; g.kneeR -= 0.1 * idle;
    // 정지 시 무기 든 자세: 조금 낮추고 무게를 앞에
    if (this.rig.sword) { g.pelvisY -= 0.03 * idle; g.kneeL -= 0.08 * idle; g.chestYaw += 0.12 * idle; g.armL += 0.05 * idle; g.elbowL += 0.3 * idle; }

    // ---- 전투 자세 ----
    const yaw = THREE.MathUtils.clamp((s.swordYaw + 0.35) * 0.4, -0.75, 0.75);
    const atk = { hipL: 0.5, kneeL: -0.55, hipR: -0.4, kneeR: -0.35, pelvisY: -0.1, pelvisYaw: -yaw * 0.4, pelvisRoll: 0, spineX: 0.14, chestYaw: yaw, armL: -0.35, elbowL: 1.1, armR: 0, elbowR: 0.3, headX: -0.05, stanceZ: 0.06 };
    const dash = { hipL: -0.8, kneeL: -0.45, hipR: 0.85, kneeR: -1.1, pelvisY: -0.2, pelvisYaw: 0, pelvisRoll: 0, spineX: 0.35, chestYaw: -0.25, armL: -0.9, elbowL: 0.3, armR: 0, elbowR: 0.3, headX: -0.25, stanceZ: 0.04 };
    const chg = { hipL: 0.35, kneeL: -0.55, hipR: -0.3, kneeR: -0.4, pelvisY: -0.13, pelvisYaw: -0.15, pelvisRoll: 0, spineX: 0.1, chestYaw: 0.4, armL: 0.25, elbowL: 1.3, armR: 0, elbowR: 0.3, headX: -0.1, stanceZ: 0.07 };

    const W = this.w;
    W.atk += ((s.attacking ? 1 : 0) - W.atk) * (1 - Math.exp(-(s.attacking ? 28 : 10) * dt));
    W.dash += ((s.dashing ? 1 : 0) - W.dash) * (1 - Math.exp(-(s.dashing ? 30 : 9) * dt));
    W.charge += ((s.charging ? 1 : 0) - W.charge) * (1 - Math.exp(-12 * dt));
    W.hurt += ((s.stagger ? 1 : 0) - W.hurt) * (1 - Math.exp(-20 * dt));
    const mix = (k) => {
      let v = g[k];
      v += (chg[k] - v) * W.charge;
      v += (atk[k] - v) * W.atk;
      v += (dash[k] - v) * W.dash;
      return v;
    };
    const P = {};
    for (const k in g) P[k] = mix(k);
    P.spineX -= 0.35 * W.hurt; P.headX += 0.3 * W.hurt;

    J.hipL.rotation.x = P.hipL; J.hipR.rotation.x = P.hipR;
    J.hipL.rotation.z = -P.stanceZ; J.hipR.rotation.z = P.stanceZ;
    J.kneeL.rotation.x = P.kneeL; J.kneeR.rotation.x = P.kneeR;
    // 발은 땅과 평행하게, 차고 나갈 때만 발끝을 민다
    J.ankleL.rotation.x = -(P.hipL + P.kneeL) * 0.85 + Math.max(0, -P.hipL) * 0.3 * mv;
    J.ankleR.rotation.x = -(P.hipR + P.kneeR) * 0.85 + Math.max(0, -P.hipR) * 0.3 * mv;
    J.pelvis.position.y = 0.95 + P.pelvisY;
    J.pelvis.rotation.set(0, P.pelvisYaw, P.pelvisRoll);
    J.spine.rotation.x = P.spineX;
    J.spine.rotation.z = -P.pelvisRoll * 0.7;
    J.chest.rotation.y = P.chestYaw - P.pelvisYaw;
    J.chest.position.y = 0.19 + breathe;
    J.neck.rotation.y = -P.chestYaw * 0.7;      // 시선은 정면 유지
    J.head.rotation.x = P.headX - P.spineX * 0.6 + Math.abs(sp) * 0.02 * mv;
    J.shoulderL.rotation.x = P.armL;
    J.shoulderL.rotation.z = -0.1 - 0.06 * run;
    J.elbowL.rotation.x = P.elbowL;
    if (J.shoulderR) {
      J.shoulderR.rotation.x = s.armR ?? P.armR;
      J.shoulderR.rotation.z = 0.1 + 0.06 * run;
      J.elbowR.rotation.x = s.elbowR ?? P.elbowR;
    }
    // 코트: 속도에 따라 뒤로 날리고 옆자락은 허벅지를 따라 출렁인다
    const cx = this._go('coat', -(0.05 + 0.4 * run * mv) - 1.0 * W.dash, 7, dt) - Math.sin(this.t * 11 + ph) * 0.03 * run;
    J.coat[0].rotation.x = cx;
    J.coat[1].rotation.x = cx * 0.8 + Math.max(0, P.hipL) * 0.7;
    J.coat[2].rotation.x = cx * 0.8 + Math.max(0, P.hipR) * 0.7;
    if (J.scarf) { // 속도와 대시에 따라 뒤로 날린다
      const lift = 0.25 + 1.0 * run * mv + 0.6 * W.dash;
      J.scarf.forEach((g, i) => {
        g.rotation.x = -this._go('scarf' + i, lift, 5, dt) + Math.sin(this.t * (9 + i * 2) + i) * (0.05 + 0.12 * run);
        g.rotation.z = Math.sin(this.t * 4 + i * 1.7) * 0.08 - P.chestYaw * 0.3;
      });
    }
    if (J.core) J.core.scale.setScalar(1 + Math.sin(this.t * 3) * 0.06);

    if (this.rig.sword) this._solveRightArm();
  }

  // 오른팔: 어깨 → 칼 손잡이로 2관절 IK (팔꿈치는 아래/바깥/뒤쪽으로)
  _solveRightArm() {
    const R = this.rig, J = R.J;
    R.root.updateMatrixWorld(true);
    const [S, G, E, tmp] = this._v;
    R.pivot.getWorldPosition(S); R.root.worldToLocal(S);
    R.sword.getWorldPosition(G); R.root.worldToLocal(G);
    const L1 = 0.29, L2 = 0.28;
    const d = tmp.copy(G).sub(S);
    const dist = THREE.MathUtils.clamp(d.length(), 0.05, L1 + L2 - 0.001);
    const dir = d.normalize();
    const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const pole = this._pole.set(0.6, -0.7, 0.35).normalize();
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    E.copy(S).addScaledVector(dir, a).addScaledVector(pole, h);
    const Gc = S.clone().addScaledVector(dir, dist);
    placeBetween(J.rUpper, S, E);
    placeBetween(J.rLower, E, Gc);
    J.rHand.position.copy(Gc);
    J.rHand.quaternion.copy(J.rLower.quaternion);
  }
}
