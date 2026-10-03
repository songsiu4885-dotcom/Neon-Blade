import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadBuffer, twoBone, rotateWorld } from './hero.js';

// 적 로봇의 실제 3D 모델 (스키닝 + 걷기/달리기 동작).
//  android: 사람형 안드로이드 (Mixamo X Bot) — 경비병, 암살자, 사수, 집행자, 방패병, 쌍둥이
//  heavy:   중장 로봇 (Robot Expressive, CC0) — 돌진 메카, 자폭병(작게), 골리앗·헤카톤(크게)
// 모델을 아직 못 읽었으면 robots.js의 절차적 로봇을 쓴다.
const BASE = import.meta.env.BASE_URL;
const FILES = { android: `${BASE}models/Android.glb`, heavy: `${BASE}models/Heavy.glb` };
const models = {};
let loading = null;

export function loadRobots() {
  if (!loading) {
    const loader = new GLTFLoader();
    loader.register((parser) => { parser.textureLoader = new THREE.TextureLoader(parser.options.manager); return { name: 'img_textures' }; });
    loading = Promise.all(Object.entries(FILES).map(([k, url]) => loadBuffer(url).then((buf) => loader.parseAsync(buf, '')).then((g) => { models[k] = g; })));
  }
  return loading;
}
export const robotsReady = () => !!(models.android && models.heavy);

// 모델 종류별 뼈 이름과 동작 이름
const RIG = {
  android: {
    hips: 'mixamorigHips', spine: 'mixamorigSpine1', chest: 'mixamorigSpine2',
    R: ['mixamorigRightArm', 'mixamorigRightForeArm', 'mixamorigRightHand'], L: ['mixamorigLeftArm', 'mixamorigLeftForeArm', 'mixamorigLeftHand'],
    clips: { idle: 'idle', walk: 'walk', run: 'run' }, height: 1.95, walkRef: 1.6, runRef: 6,
  },
  heavy: {
    hips: 'Hips', spine: 'Abdomen', chest: 'Torso',
    R: ['UpperArmR', 'LowerArmR', 'Palm2R'], L: ['UpperArmL', 'LowerArmL', 'Palm2L'],
    clips: { idle: 'Idle', walk: 'Walking', run: 'Running' }, height: 2.1, walkRef: 2.2, runRef: 6,
  },
};

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion();

// e.body 아래에 모델을 세우고, GuardRobot과 같은 이름의 J를 돌려준다 (공격 팔 각도 armRx는 IK로 옮긴다)
export function buildModelRobot(e, o, kind) {
  const src = models[kind], R = RIG[kind];
  const model = cloneSkinned(src.scene);
  const root = new THREE.Group();
  root.add(model);
  model.rotation.y = Math.PI; // 원본은 +z를 본다. 게임의 정면은 -z
  e.body.add(root);

  // 재질: 장갑은 Enemy.std (맞으면 번쩍), 발광 부분은 Enemy.rim (공격 예고 때 붉게)
  const shell = e.std(o.shell ?? 0x3a3f4c), dark = e.std(o.dark ?? 0x22242c), glow = e.rim(o.rim ?? 0xff2bd6);
  shell.metalness = 0.8; shell.roughness = 0.35; dark.metalness = 0.6; dark.roughness = 0.5;
  if (o.ghost) for (const m of [shell, dark]) { m.transparent = true; m.opacity = 0.85; }
  const bones = {};
  model.traverse((m) => {
    if (m.isBone) bones[m.name] = m; // 로더가 이름의 ':' '.'를 지운다 (mixamorig:Hips → mixamorigHips, UpperArm.R → UpperArmR)
    if (!m.isMesh) return;
    m.frustumCulled = false;
    const n = m.material.name;
    if (kind === 'android') m.material = /Joints/i.test(n) || /Joints/i.test(m.name) ? glow : shell;
    else m.material = n === 'Main' ? shell : n === 'Black' ? (KITS[o.kit]?.coverEyes ? dark : glow) : dark; // 큰 눈을 덮는 키트면 눈을 어둡게
  });
  // 키 맞추기
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const s = (R.height * (o.size ?? 1)) / Math.max(0.01, box.max.y - box.min.y);
  model.scale.multiplyScalar(s);
  model.position.y = -box.min.y * s;

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const [k, n] of Object.entries(R.clips)) {
    const clip = src.animations.find((a) => a.name === n);
    if (!clip) continue;
    actions[k] = mixer.clipAction(clip); actions[k].play(); actions[k].setEffectiveWeight(k === 'idle' ? 1 : 0);
    actions[k].time = Math.random() * clip.duration; // 여럿이 똑같이 움직이지 않게
  }
  // 같은 이름의 메시가 있으면 로더가 뼈 이름 뒤에 _1을 붙인다 (Torso → Torso_1)
  const b = (n) => bones[n] || Object.values(bones).find((x) => x.name.startsWith(n + '_'));
  for (const n of [...Object.values(RIG[kind]).flat(), ...Object.values(SLOT[kind])]) if (typeof n === 'string' && !bones[n]) { const x = b(n); if (x) bones[n] = x; }
  const J = {
    isModel: true, kind, model, root, mixer, actions, bones, R,
    hips: b(R.hips), spine: b(R.spine), chest: b(R.chest),
    armR: R.R.map(b), armL: R.L.map(b),
    // GuardRobot과 이름을 맞춘 자리표시 (다른 코드가 rotation을 써도 문제없게)
    shoulderR: new THREE.Object3D(), shoulderL: new THREE.Object3D(), elbowR: new THREE.Object3D(), elbowL: new THREE.Object3D(),
    torso: new THREE.Object3D(), head: new THREE.Object3D(), pelvis: new THREE.Object3D(),
    weapons: [], boneScale: [], spinners: [], riders: [], parts: [],
  };
  mixer.update(0); // 부품은 '대기 동작' 자세에서 재고 붙인다 (원본의 기본 자세는 많이 다르다)
  if (o.kit) applyKit(J, e, kind, KITS[o.kit] || {}, { shell, dark, glow, accent: e.rim(o.accent ?? o.rim ?? 0xff2bd6), metal: e.std(o.metal ?? 0x8a8f9c) });
  return J;
}

// ================= 부품 조합 (키트) =================
// 뼈 이름 (모델별). 부품은 '쉬는 자세에서 몸 기준 좌표'로 붙고, 그 뒤로는 뼈를 따라 움직인다.
const SLOT = {
  android: { head: 'mixamorigHead', neck: 'mixamorigNeck', chest: 'mixamorigSpine2', hips: 'mixamorigHips',
    shL: 'mixamorigLeftArm', shR: 'mixamorigRightArm', foreL: 'mixamorigLeftForeArm', foreR: 'mixamorigRightForeArm',
    legL: 'mixamorigLeftUpLeg', legR: 'mixamorigRightUpLeg', shinL: 'mixamorigLeftLeg', shinR: 'mixamorigRightLeg' },
  heavy: { head: 'Head', neck: 'Neck', chest: 'Torso', hips: 'Hips', shL: 'UpperArmL', shR: 'UpperArmR', foreL: 'LowerArmL', foreR: 'LowerArmR',
    legL: 'UpperLegL', legR: 'UpperLegR', shinL: 'LowerLegL', shinR: 'LowerLegR' },
};
const M = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
const G = (...kids) => { const g = new THREE.Group(); for (const k of kids) g.add(k); return g; };

// 부품 모양 (몸 기준: x 오른쪽, y 위, -z 정면). 크기는 미터.
const PART = {
  helmet: (m) => G(M(new THREE.SphereGeometry(0.15, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), m.shell, 0, 0.02, 0.01),
    M(new THREE.BoxGeometry(0.22, 0.04, 0.05), m.glow, 0, 0.0, -0.13)),
  monoeye: (m) => G(M(new THREE.BoxGeometry(0.2, 0.2, 0.22), m.dark, 0, 0, 0), M(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 16).rotateX(Math.PI / 2), m.glow, 0, 0.01, -0.12),
    M(new THREE.TorusGeometry(0.075, 0.012, 6, 18), m.metal, 0, 0.01, -0.12)),
  crest: (m) => G(M(new THREE.BoxGeometry(0.025, 0.2, 0.32), m.glow, 0, 0.17, 0.03), M(new THREE.BoxGeometry(0.04, 0.08, 0.36), m.dark, 0, 0.09, 0.03)),
  horns: (m) => G(...[-1, 1].map((sd) => { const c = M(new THREE.ConeGeometry(0.04, 0.3, 8), m.metal, sd * 0.11, 0.14, 0.02); c.rotation.z = -sd * 0.5; c.rotation.x = 0.3; return c; })),
  antenna: (m) => G(M(new THREE.CylinderGeometry(0.008, 0.012, 0.42, 5), m.dark, 0.08, 0.26, 0.04), M(new THREE.SphereGeometry(0.025, 8, 6), m.glow, 0.08, 0.48, 0.04)),
  scope: (m) => G(M(new THREE.CylinderGeometry(0.04, 0.05, 0.26, 10).rotateX(Math.PI / 2), m.dark, 0.09, 0.03, -0.1), M(new THREE.CircleGeometry(0.035, 12), m.glow, 0.09, 0.03, -0.235)),
  pauldron: (m, sd) => G(M(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), m.shell, sd * 0.03, 0.03, 0), M(new THREE.BoxGeometry(0.03, 0.02, 0.2), m.glow, sd * 0.1, 0.07, 0)),
  spikes: (m, sd) => G(...[0, 1, 2].map((i) => { const c = M(new THREE.ConeGeometry(0.035, 0.2, 6), m.metal, sd * (0.03 + i * 0.03), 0.12 + i * 0.02, -0.06 + i * 0.06); c.rotation.z = -sd * (0.4 + i * 0.15); return c; })),
  chestplate: (m) => G(M(new THREE.BoxGeometry(0.34, 0.26, 0.06), m.shell, 0, 0.02, -0.14), M(new THREE.BoxGeometry(0.2, 0.025, 0.07), m.glow, 0, 0.07, -0.15), M(new THREE.BoxGeometry(0.2, 0.025, 0.07), m.glow, 0, -0.02, -0.15)),
  backpack: (m) => G(M(new THREE.BoxGeometry(0.3, 0.36, 0.16), m.dark, 0, 0.0, 0.18), M(new THREE.BoxGeometry(0.04, 0.28, 0.02), m.glow, -0.08, 0, 0.27), M(new THREE.BoxGeometry(0.04, 0.28, 0.02), m.glow, 0.08, 0, 0.27)),
  ammo: (m) => G(M(new THREE.BoxGeometry(0.34, 0.26, 0.2), m.dark, 0, -0.02, 0.2), ...[-1, 1].map((sd) => M(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 10), m.metal, sd * 0.2, 0.0, 0.2))),
  cape: (m) => { const c = M(new THREE.PlaneGeometry(0.42, 0.9, 1, 4).translate(0, -0.45, 0), new THREE.MeshStandardMaterial({ color: 0x14080c, roughness: 0.9, side: THREE.DoubleSide }), 0, 0.12, 0.16); c.rotation.x = 0.18; return G(c); },
  kneepad: (m) => G(M(new THREE.BoxGeometry(0.12, 0.14, 0.06), m.shell, 0, -0.02, -0.08)),
  bracer: (m) => G(M(new THREE.CylinderGeometry(0.06, 0.055, 0.18, 10), m.shell, 0, 0.12, 0), M(new THREE.TorusGeometry(0.06, 0.008, 6, 14).rotateX(Math.PI / 2), m.glow, 0, 0.18, 0)),
  // ---- 중장 로봇용 (머리가 크다) ----
  faceplate: (m) => G(M(new THREE.BoxGeometry(0.62, 0.3, 0.08), m.dark, 0, 0.0, -0.33), M(new THREE.BoxGeometry(0.46, 0.05, 0.09), m.glow, 0, 0.03, -0.34)),
  eyecluster: (m) => G(M(new THREE.BoxGeometry(0.64, 0.34, 0.08), m.dark, 0, 0, -0.33),
    ...[[-0.18, 0.07, 0.06], [0, 0.09, 0.08], [0.18, 0.07, 0.06], [-0.1, -0.06, 0.045], [0.1, -0.06, 0.045]].map(([x, y, r]) => M(new THREE.SphereGeometry(r, 10, 8), m.glow, x, y, -0.38))),
  furnace: (m) => G(M(new THREE.BoxGeometry(0.6, 0.55, 0.36), m.dark, 0, 0.05, 0.36), M(new THREE.BoxGeometry(0.44, 0.3, 0.02), m.accent, 0, 0.02, 0.55),
    ...[-1, 1].map((sd) => M(new THREE.CylinderGeometry(0.07, 0.09, 0.6, 10), m.metal, sd * 0.2, 0.5, 0.4))),
  bigpauldron: (m, sd) => G(M(new THREE.BoxGeometry(0.36, 0.14, 0.4), m.shell, sd * 0.06, 0.12, 0), M(new THREE.BoxGeometry(0.3, 0.03, 0.03), m.glow, sd * 0.06, 0.2, -0.2),
    ...[0, 1].map((i) => { const c = M(new THREE.ConeGeometry(0.05, 0.24, 6), m.metal, sd * (0.02 + i * 0.12), 0.27, -0.06 + i * 0.12); c.rotation.z = -sd * 0.3; return c; })),
  halo: (m) => { const g = G(M(new THREE.TorusGeometry(0.45, 0.025, 6, 40), m.glow, 0, 0, 0)); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.add(M(new THREE.ConeGeometry(0.04, 0.16, 5), m.metal, Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0)).rotation.z = a - Math.PI / 2; } g.position.set(0, 0.45, 0.25); return G(g); },
  backarms: (m) => { // 등에서 뻗은 보조 팔 넷 (헤카톤: '백 개의 팔')
    const g = G();
    for (let i = 0; i < 4; i++) {
      const sd = i % 2 ? 1 : -1, up = i < 2 ? 1 : -1;
      const a = G(M(new THREE.BoxGeometry(0.1, 0.1, 0.55), m.dark, 0, 0, 0.27), M(new THREE.BoxGeometry(0.08, 0.5, 0.08), m.shell, 0, 0.25 * up, 0.55),
        M(new THREE.ConeGeometry(0.07, 0.22, 6), m.accent, 0, 0.55 * up, 0.55));
      a.children[2].rotation.x = up > 0 ? 0 : Math.PI;
      a.position.set(sd * 0.2, 0.08 * up, 0.25); a.rotation.y = sd * 0.9; a.rotation.z = up * sd * 0.25;
      a.userData.spin = { axis: 'z', base: a.rotation.z, amp: 0.25, f: 1.2 + i * 0.3 };
      g.add(a);
    }
    return g;
  },
  stripes: (m) => G(...[-0.12, 0, 0.12].map((x) => { const b = M(new THREE.BoxGeometry(0.06, 0.3, 0.04), m.accent, x, 0, -0.3); b.rotation.z = 0.5; return b; })),
  bomb: (m) => G(M(new THREE.SphereGeometry(0.22, 14, 10), m.dark, 0, 0.1, 0.32), M(new THREE.TorusGeometry(0.22, 0.03, 6, 20), m.accent, 0, 0.1, 0.32), M(new THREE.SphereGeometry(0.05, 8, 6), m.glow, 0, 0.36, 0.32)),
};

// 적 종류별 조합. bones: 부위 크기, hideHead: 원래 머리를 숨기고 parts의 head로 바꿔 끼움
// parts: [부품, 붙일 뼈, [x,y,z] 뼈 기준 오프셋, 크기]
const KITS = {
  thug: { bones: { chest: 1.08 }, parts: [['helmet', 'head', [0, 0.1, 0]], ['pauldron', 'shL', [0, 0.02, 0], 1, -1], ['pauldron', 'shR', [0, 0.02, 0], 1, 1], ['kneepad', 'shinL', [0, 0.02, 0]], ['kneepad', 'shinR', [0, 0.02, 0]]] },
  shield: { bones: { chest: 1.2, armL: 1.1, armR: 1.1 }, parts: [['monoeye', 'head', [0, 0.1, 0], 1.15], ['bigpauldron', 'shL', [0, 0, 0], 0.7, -1], ['bigpauldron', 'shR', [0, 0, 0], 0.7, 1], ['chestplate', 'chest', [0, 0.05, 0], 1.1]], hideHead: true },
  exec: { bones: { chest: 1.18, armR: 1.15, armL: 1.1 }, parts: [['helmet', 'head', [0, 0.1, 0]], ['horns', 'head', [0, 0.1, 0], 1.2], ['spikes', 'shL', [0, 0, 0], 1, -1], ['spikes', 'shR', [0, 0, 0], 1, 1], ['cape', 'chest', [0, 0.05, 0]], ['bracer', 'foreR', [0, 0, 0]]] },
  assassin: { bones: { chest: 0.88, legs: 1.06, head: 0.9 }, parts: [['crest', 'head', [0, 0.08, 0]], ['bracer', 'foreL', [0, 0, 0]], ['bracer', 'foreR', [0, 0, 0]]] },
  gunner: { bones: { chest: 1.12 }, parts: [['monoeye', 'head', [0, 0.1, 0]], ['ammo', 'chest', [0, 0, 0]], ['pauldron', 'shL', [0, 0.02, 0], 1.2, -1], ['chestplate', 'chest', [0, 0.04, 0]]], hideHead: true },
  sniper: { bones: { legs: 1.08, chest: 0.95 }, parts: [['helmet', 'head', [0, 0.1, 0]], ['scope', 'head', [0, 0.1, 0]], ['antenna', 'head', [0, 0.1, 0]], ['backpack', 'chest', [0, 0, 0], 0.8]] },
  twin: { bones: { chest: 1.15, armR: 1.12, legs: 1.05 }, parts: [['monoeye', 'head', [0, 0.11, 0], 1.2], ['crest', 'head', [0, 0.12, 0], 0.9], ['horns', 'head', [0, 0.1, 0], 1.4], ['bigpauldron', 'shL', [0, 0, 0], 0.75, -1], ['bigpauldron', 'shR', [0, 0, 0], 0.75, 1], ['cape', 'chest', [0, 0.06, 0], 1.3], ['bracer', 'foreR', [0, 0, 0], 1.2], ['bracer', 'foreL', [0, 0, 0], 1.2]], hideHead: true },
  mech: { parts: [ ['bigpauldron', 'shL', [0, 0.05, 0], 1, -1], ['bigpauldron', 'shR', [0, 0.05, 0], 1, 1], ['backpack', 'chest', [0, 0.1, 0.1], 1.4]] },
  bomber: { bones: { head: 0.85 }, parts: [ ['bomb', 'chest', [0, 0.1, 0.05], 1.4], ['stripes', 'chest', [0, 0.05, 0]]] },
  jugg: { bones: { armL: 1.5, armR: 1.6, head: 0.72, chest: 1.25 }, parts: [['furnace', 'chest', [0, 0.35, 0.15], 1.8], ['bigpauldron', 'shL', [0, 0.08, 0], 1.5, -1], ['bigpauldron', 'shR', [0, 0.08, 0], 1.5, 1], ['stripes', 'chest', [0, 0.1, -0.1], 1.4], ['bracer', 'foreL', [0, 0, 0], 2], ['bracer', 'foreR', [0, 0, 0], 2]], rider: true },
  gate: { bones: { chest: 1.35, legs: 1.15, head: 0.78 }, parts: [['halo', 'crown', [0, -0.3, 0.1]], ['backarms', 'chest', [0, 0.45, 0.25], 2.2], ['bigpauldron', 'shL', [0, 0.08, 0], 1.4, -1], ['bigpauldron', 'shR', [0, 0.08, 0], 1.4, 1], ['horns', 'crown', [0, -0.15, -0.1], 2.4], ['chestplate', 'chest', [0, 0.1, -0.12], 1.8]] },
};

function applyKit(J, e, kind, kit, mats) {
  const B = (k) => J.bones[SLOT[kind][k]];
  const bs = kit.bones || {};
  const push = (key, v) => { const b = B(key); if (b && v !== 1) J.boneScale.push([b, v]); };
  if (bs.chest) push('chest', bs.chest);
  if (bs.head || kit.hideHead) push('head', kit.hideHead ? 0.55 : bs.head);
  if (bs.armL) push('shL', bs.armL);
  if (bs.armR) push('shR', bs.armR);
  if (bs.legs) { push('legL', bs.legs); push('legR', bs.legs); }
  applyKitPose(J, 0); // 부위 크기를 먼저 적용한 뒤에 잰다
  e.body.updateWorldMatrix(true, true); // 몸·모델·뼈의 월드 행렬을 모두 최신으로 (안 하면 스폰 위치만큼 어긋난다)
  const bodyQ = e.body.getWorldQuaternion(new THREE.Quaternion());
  // 중장 로봇: 머리 메시의 실제 크기와 앞면 위치를 재서 얼굴 부품('face')을 정확히 얹는다
  let face = null;
  if (kind === 'heavy') {
    const hm = B('head')?.children.find((c) => !c.isBone && (c.isMesh || c.children.some((k) => k.isMesh))); // 머리 뼈에 붙은 머리 메시 묶음
    if (hm) {
      const box = new THREE.Box3().setFromObject(hm);
      const lo = e.body.worldToLocal(box.min.clone()), hi = e.body.worldToLocal(box.max.clone());
      const hb = e.body.worldToLocal(B('head').getWorldPosition(new THREE.Vector3()));
      face = { off: [(lo.x + hi.x) / 2 - hb.x, (lo.y + hi.y) / 2 - hb.y, Math.min(lo.z, hi.z) - hb.z], w: Math.abs(hi.x - lo.x), back: Math.max(lo.z, hi.z) - hb.z, top: Math.max(lo.y, hi.y) - hb.y };
    }
  }
  const attach = (boneKey, obj, off, scale) => {
    if (boneKey === 'face' || boneKey === 'crown') { // 얼굴 앞면 / 머리 꼭대기 기준
      if (!face) return;
      const k = (face.w / 0.7) * 0.62;
      off = boneKey === 'face' ? [face.off[0] + off[0], face.off[1] + off[1], face.off[2] + 0.31 * k + off[2]] : [face.off[0] + off[0], face.top + off[1], (face.off[2] + face.back) / 2 + off[2]];
      scale = (scale ?? 1) * k; boneKey = 'head';
    }
    const bone = B(boneKey);
    if (!bone) return;
    // 뼈 크기(애니메이션이 바꿀 수 있다)는 따르지 않고, 위치와 회전만 따라간다
    const wq = bone.getWorldQuaternion(new THREE.Quaternion());
    const rel = wq.invert().multiply(bodyQ);
    obj.scale.setScalar(scale ?? 1);
    e.body.add(obj);
    J.parts.push({ obj, bone, rel, off: new THREE.Vector3(...off) });
    obj.traverse((c) => { if (c.userData.spin) J.spinners.push(c); });
  };
  for (const [name, at, off, sc, sd] of kit.parts || []) attach(at, PART[name](mats, sd ?? 1), off, sc);
  // 골리앗: 어깨 위에 작은 안드로이드 조종수가 타고 있다 (두 모델을 섞는다)
  if (kit.rider && models.android) {
    const fake = { body: new THREE.Group(), std: (c) => e.std(c), rim: (c) => e.rim(c) };
    const RJ = buildModelRobot(fake, { shell: 0x2a2c34, rim: mats.glow.color.getHex(), kit: 'thug' }, 'android');
    attach('crown', fake.body, [0, -0.08, 0.05], 0.3); // 머리 꼭대기에 올라탄 조종수
    RJ.body = fake.body;
    J.riders.push(RJ);
  }
}

const _p = new THREE.Vector3(), _wq = new THREE.Quaternion(), _bq = new THREE.Quaternion();
// 매 프레임: 동작 재생 뒤 부위 크기와 장식 움직임을 적용
export function applyKitPose(J, dt, body) {
  for (const [b, v] of J.boneScale) b.scale.copy(b.userData.s0 ||= b.scale.clone()).multiplyScalar(v); // 쉬는 자세 크기 × 배율
  if (J.parts.length && body) {
    body.updateMatrixWorld(true);
    body.getWorldQuaternion(_bq).invert();
    for (const P of J.parts) {
      P.bone.getWorldPosition(_p); P.bone.getWorldQuaternion(_wq).multiply(P.rel); // 부품의 월드 회전
      _p.add(P.off.clone().applyQuaternion(_wq));
      body.worldToLocal(P.obj.position.copy(_p));
      P.obj.quaternion.copy(_bq).multiply(_wq);
    }
  }
  if (J.spinners.length) {
    const t = performance.now() / 1000;
    for (const c of J.spinners) { const s = c.userData.spin; c.rotation[s.axis] = s.base + Math.sin(t * s.f) * s.amp; }
  }
  for (const R of J.riders) { R.mixer.update(dt); applyKitPose(R, dt, R.body); }
}

// 손에 쥐는 무기: 매 프레임 손 위치에, 팔뚝 방향으로 이어지게 놓는다. axis는 무기 모양이 뻗은 방향(무기 기준)
export function holdInHand(J, e, obj, axis, side = 'R') {
  e.body.add(obj);
  J.weapons.push({ obj, axis: axis.clone().normalize(), side });
}

// GuardAnimator와 같은 입력(armRx, state)으로 스키닝 모델을 움직인다
export class ModelAnimator {
  constructor(J, e) { this.J = J; this.e = e; this.w = { idle: 1, walk: 0, run: 0 }; this.atk = 0; this.k = 0; this.arm = 0.25; }
  update(dt, speed, armRx, state, broken, ov = {}) {
    const J = this.J, R = J.R, W = this.w;
    const k = 1 - Math.exp(-8 * dt);
    const t = speed < 0.4 ? [1, 0, 0] : speed < 4 ? [0, 1, 0] : [0, 0, 1];
    W.idle += (t[0] - W.idle) * k; W.walk += (t[1] - W.walk) * k; W.run += (t[2] - W.run) * k;
    for (const n of ['idle', 'walk', 'run']) J.actions[n]?.setEffectiveWeight(W[n]);
    if (J.actions.walk) J.actions.walk.timeScale = THREE.MathUtils.clamp(speed / R.walkRef, 0.6, 1.8);
    if (J.actions.run) J.actions.run.timeScale = THREE.MathUtils.clamp(speed / R.runRef, 0.8, 1.6);
    J.mixer.update(dt);
    applyKitPose(J, dt, this.e.body);
    this.e.body.updateMatrixWorld(true);

    const body = this.e.body;
    const bq = body.getWorldQuaternion(_q);
    const right = _a.set(1, 0, 0).applyQuaternion(bq);
    // 상체 기울이기: 예고 때 뒤로 젖히고, 휘두를 때 앞으로 숙인다. 무너지면 웅크린다
    const wantLean = broken ? 0.7 : state === 'strike' ? 0.35 : state === 'windup' ? -0.12 : 0;
    this.k += (wantLean - this.k) * (1 - Math.exp(-(state === 'strike' ? 30 : 10) * dt));
    if (J.spine) rotateWorld(J.spine, right, -this.k * 0.6);
    if (J.chest) rotateWorld(J.chest, right, -this.k * 0.4);

    // 오른팔: armRx(어깨 앞뒤 각도)를 손 목표 지점으로 바꿔 IK. 쉬는 자세(0.25)에서 멀수록 강하게
    const aim = J.weapons.some((w) => w.rifle) ? 1.45 : armRx;
    this.arm += (aim - this.arm) * (1 - Math.exp(-(state === 'strike' ? 40 : 14) * dt));
    const wR = Math.min(1, Math.abs(this.arm - 0.25) * 1.6 + (J.weapons.some((w) => w.rifle) ? 1 : 0));
    const [up, lo, hand] = J.armR;
    if (up && lo && hand && wR > 0.02) {
      const S = up.getWorldPosition(new THREE.Vector3());
      const len = S.distanceTo(lo.getWorldPosition(_b)) + _b.distanceTo(hand.getWorldPosition(_c));
      const th = this.arm;
      const dir = new THREE.Vector3(0.12, -Math.cos(th), -Math.sin(th)).normalize().applyQuaternion(bq);
      const goal = S.clone().addScaledVector(dir, len * 0.92).lerp(hand.getWorldPosition(new THREE.Vector3()), 1 - wR);
      const pole = new THREE.Vector3(0.6, -0.4, 0.5).applyQuaternion(bq);
      twoBone(up, lo, hand, goal, pole);
    }
    // 왼팔: 방패를 들거나 총을 받친다
    const [ul, ll, hl] = J.armL;
    const shield = J.shieldRef, rifle = J.weapons.find((w) => w.rifle);
    if (ul && ll && hl && (shield || rifle)) {
      const goal = shield ? shield.getWorldPosition(new THREE.Vector3()).addScaledVector(_c.set(0, 0, 1).applyQuaternion(bq), 0.15)
        : rifle.obj.localToWorld(new THREE.Vector3(0, 0, -0.45));
      twoBone(ul, ll, hl, goal, new THREE.Vector3(-0.6, -0.5, 0.4).applyQuaternion(bq));
    }
    // 무기: 손에 붙이고 팔뚝 방향으로
    for (const wp of J.weapons) {
      const arm = wp.side === 'L' ? J.armL : J.armR;
      if (!arm[1] || !arm[2]) continue;
      const hp = arm[2].getWorldPosition(new THREE.Vector3()), ep = arm[1].getWorldPosition(new THREE.Vector3());
      const fdir = hp.clone().sub(ep).normalize();
      body.worldToLocal(hp);
      const local = fdir.applyQuaternion(_q.copy(bq).invert());
      wp.obj.position.copy(hp);
      wp.obj.quaternion.setFromUnitVectors(wp.axis, local);
    }
  }
}
