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
    else m.material = n === 'Main' ? shell : n === 'Black' ? glow : dark;
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
  const b = (n) => bones[n];
  const J = {
    isModel: true, kind, model, root, mixer, actions, bones, R,
    hips: b(R.hips), spine: b(R.spine), chest: b(R.chest),
    armR: R.R.map(b), armL: R.L.map(b),
    // GuardRobot과 이름을 맞춘 자리표시 (다른 코드가 rotation을 써도 문제없게)
    shoulderR: new THREE.Object3D(), shoulderL: new THREE.Object3D(), elbowR: new THREE.Object3D(), elbowL: new THREE.Object3D(),
    torso: new THREE.Object3D(), head: new THREE.Object3D(), pelvis: new THREE.Object3D(),
    weapons: [],
  };
  return J;
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
